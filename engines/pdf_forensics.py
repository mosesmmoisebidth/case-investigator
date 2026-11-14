"""PDF structure forensics (pikepdf + PyMuPDF).

Edits to a digital statement or pay stub leave traces in the file itself:
extra revisions (incremental saves), an editing tool as producer, a modified
date after the creation date, annotations or white boxes drawn over text,
invisible text, and an XMP edit history.
"""

from __future__ import annotations

import re
from pathlib import Path

import pikepdf
import pymupdf

from .core import audit, flag, result, write_json
from .intake import doc_meta, doc_pages
from .textlayer import SCALE

# Producers/creators that are online or desktop PDF editors (not bank or payroll systems).
EDITOR_HINTS = [
    "ilovepdf", "sejda", "smallpdf", "pdfescape", "pdffiller", "dochub", "pdf-xchange", "foxit phantom",
    "pdfelement", "nitro", "sodapdf", "soda pdf", "pdf24", "canva", "photoshop", "gimp", "inkscape",
    "acrobat pro", "adobe acrobat", "libreoffice", "word", "pdf editor", "pdfsam", "preview",
]


def _pdf_date(s: str | None) -> str | None:
    if not s:
        return None
    m = re.search(r"(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?", s)
    if not m:
        return None
    y, mo, d, hh, mm, ss = m.groups()
    return f"{y}-{mo}-{d}T{hh or '00'}:{mm or '00'}:{ss or '00'}"


def _overlap(a: list[float], b: list[float]) -> float:
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    inter = (x1 - x0) * (y1 - y0)
    area = max(1e-6, (b[2] - b[0]) * (b[3] - b[1]))
    return inter / area


def run(case: Path, doc_id: str) -> dict:
    meta = doc_meta(case, doc_id)
    ev_rel = f"evidence/{doc_id}/pdf_structure.json"
    if meta["kind"] != "pdf":
        write_json(case, ev_rel, {"applicable": False, "reason": "not a PDF (image upload)"})
        return result([ev_rel], f"{doc_id}: not a PDF, structure checks not applicable")
    src = case / "input" / meta["file"]
    raw = src.read_bytes()
    eof_count = raw.count(b"%%EOF")
    startxref = raw.count(b"startxref")
    info, xmp_history, producer, creator = {}, [], "", ""
    with pikepdf.open(src) as pdf:
        for k, v in (pdf.docinfo or {}).items():
            info[str(k).lstrip("/")] = str(v)
        producer, creator = info.get("Producer", ""), info.get("Creator", "")
        try:
            with pdf.open_metadata() as m:
                for k, v in m.items():
                    if "History" in k or "history" in k:
                        xmp_history.append(str(v)[:500])
                producer = producer or m.get("pdf:Producer", "")
        except Exception:
            pass
    created, modified = _pdf_date(info.get("CreationDate")), _pdf_date(info.get("ModDate"))
    doc = pymupdf.open(src)
    pages_out, flags = [], []
    text_pages = {p["page"]: p for p in doc_pages(case, doc_id)}
    for pno in [p["page"] for p in meta["pages"]]:
        page = doc[pno - 1]
        fonts = sorted({f[3] for f in page.get_fonts()})
        annots = []
        for a in page.annots() or []:
            annots.append({"type": a.type[1], "rect": [round(v * SCALE, 1) for v in a.rect], "content": (a.info or {}).get("content", "")[:120]})
        words = text_pages.get(pno, {}).get("words", [])
        covers = []
        for d in page.get_drawings():
            fill = d.get("fill")
            if not fill or d.get("fill_opacity", 1) < 0.9:
                continue
            if min(fill) < 0.97:  # only white boxes
                continue
            r = [round(v * SCALE, 1) for v in d["rect"]]
            if (r[2] - r[0]) * (r[3] - r[1]) > 0.5 * page.rect.width * page.rect.height * SCALE * SCALE:
                continue  # page background
            hidden = [w["t"] for w in words if _overlap(r, w["b"]) > 0.6]
            if hidden:
                covers.append({"rect": r, "covers_text": hidden[:8]})
        white_text = []
        for sp in text_pages.get(pno, {}).get("spans", []):
            if sp.get("color") in (0xFFFFFF, 16777215) and sp["text"].strip():
                white_text.append({"text": sp["text"][:60], "bbox": sp["bbox"]})
        pages_out.append({"page": pno, "fonts": fonts, "annotations": annots, "white_boxes_over_text": covers, "invisible_text": white_text})
        for c in covers:
            flags.append(flag("pdf_cover_box", f"A white box is drawn over text on page {pno} of {doc_id}", "high", doc=doc_id, evidence=[ev_rel], layer="pdf", deterministic=True, page=pno, bbox=c["rect"], values={"covers": c["covers_text"]}))
        for a in annots:
            if a["type"] in ("FreeText", "Square", "Stamp", "Redact", "Ink"):
                flags.append(flag("pdf_annotation_overlay", f"A {a['type']} annotation sits on page {pno} of {doc_id}", "medium", doc=doc_id, evidence=[ev_rel], layer="pdf", page=pno, bbox=a["rect"], values=a))
        for w in white_text:
            flags.append(flag("pdf_invisible_text", f"Invisible (white) text on page {pno} of {doc_id}", "medium", doc=doc_id, evidence=[ev_rel], layer="pdf", page=pno, bbox=w["bbox"], values=w))
    doc.close()
    revisions = max(eof_count, startxref)
    editor = next((h for h in EDITOR_HINTS if h in (producer + " " + creator).lower()), None)
    out = {
        "applicable": True,
        "producer": producer,
        "creator": creator,
        "created": created,
        "modified": modified,
        "revisions": revisions,
        "xmp_history": xmp_history,
        "editor_detected": editor,
        "info": info,
        "pages": pages_out,
    }
    write_json(case, ev_rel, out)
    if revisions > 1:
        flags.append(flag("pdf_incremental_save", f"{doc_id} was saved {revisions} times (incremental updates after creation)", "medium", doc=doc_id, evidence=[ev_rel], layer="pdf", deterministic=True, values={"revisions": revisions}))
    if editor:
        flags.append(flag("pdf_editor_producer", f"{doc_id} was last written by an editing tool ({producer or creator})", "medium", doc=doc_id, evidence=[ev_rel], layer="pdf", deterministic=True, values={"producer": producer, "creator": creator}))
    if created and modified and modified[:16] != created[:16]:
        flags.append(flag("pdf_modified_after_creation", f"{doc_id} was modified on {modified[:10]} after being created on {created[:10]}", "low", doc=doc_id, evidence=[ev_rel], layer="pdf", deterministic=True, values={"created": created, "modified": modified}))
    audit(case, "engine:pdf_forensics", "run", doc_id, {"revisions": revisions, "flags": len(flags)})
    return result([ev_rel], f"{doc_id}: producer '{producer or 'unknown'}', {revisions} save(s), {len(flags)} structure signal(s)", flags)
