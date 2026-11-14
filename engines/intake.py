"""Intake and extraction engines.

intake(case): hashes every original, renders every page to PNG, reads its text
(PDF text layer or PP-OCR), classifies each page with the document packs and
splits multi-document files where the type changes. Writes intake/manifest.json.

extract(case, doc): reads every pack field with its page and box, plus statement
transactions, MRZ and MICR lines. Writes extracted/<doc>.json.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

import pymupdf
from PIL import Image

from . import doctypes, textlayer
from .core import audit, read_json, rel, result, sha256_file, write_json

IMG_EXT = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")[:40] or "doc"


def intake(case: Path) -> dict:
    files = sorted(p for p in (case / "input").iterdir() if p.is_file())
    docs, seen_hash = [], {}
    for f in files:
        h = sha256_file(f)
        dup_of = seen_hash.get(h)
        seen_hash.setdefault(h, f.name)
        pages = []
        if f.suffix.lower() == ".pdf":
            pdf = pymupdf.open(f)
            for i, page in enumerate(pdf):
                png = case / "pages" / f"{_slug(f.stem)}_p{i + 1}.png"
                page.get_pixmap(dpi=textlayer.RENDER_DPI).save(png)
                tl = textlayer.pdf_page_text(page)
                if len(tl["words"]) < 5:  # scanned page inside a PDF
                    tl = textlayer.image_text(png)
                pages.append({"page": i + 1, "png": rel(case, png), "w": page.rect.width * textlayer.SCALE, "h": page.rect.height * textlayer.SCALE, **tl})
            pdf.close()
            kind = "pdf"
        elif f.suffix.lower() in IMG_EXT:
            png = case / "pages" / f"{_slug(f.stem)}_p1.png"
            im = Image.open(f).convert("RGB")
            im.save(png)
            tl = textlayer.image_text(png)
            pages.append({"page": 1, "png": rel(case, png), "w": im.width, "h": im.height, **tl})
            kind = "image"
        else:
            continue
        # classify page by page and split where the type changes
        groups: list[dict] = []
        for pg in pages:
            txt = textlayer.page_text(pg["words"])
            dtype, conf, _ = doctypes.classify(txt, f.name)
            if groups and (groups[-1]["doc_type"] == dtype or conf < 0.15):
                groups[-1]["pages"].append(pg)
            else:
                groups.append({"doc_type": dtype, "conf": conf, "pages": [pg]})
        for gi, g in enumerate(groups):
            doc_id = _slug(f.stem) + (f"_{gi + 1}" if len(groups) > 1 else "")
            label = doctypes.packs()[g["doc_type"]]["label"]
            docs.append(
                {
                    "doc_id": doc_id,
                    "file": f.name,
                    "sha256": h,
                    "kind": kind,
                    "doc_type": g["doc_type"],
                    "doc_label": label,
                    "classify_conf": g["conf"],
                    "page_count": len(g["pages"]),
                    "pages": [{k: v for k, v in p.items() if k in ("page", "png", "w", "h", "source")} for p in g["pages"]],
                    "duplicate_of": dup_of,
                }
            )
            write_json(case, f"intake/text/{doc_id}.json", {"pages": g["pages"]})
    manifest = {"documents": docs}
    path = write_json(case, "intake/manifest.json", manifest)
    audit(case, "engine:intake", "intake", [d["file"] for d in docs], {"documents": len(docs)})
    summ = ", ".join(f"{d['doc_id']} ({d['doc_label']}, {d['page_count']}p)" for d in docs)
    flags = [
        {"check": "duplicate_file", "claim": f"{d['file']} is an exact duplicate of {d['duplicate_of']}", "severity": "low", "doc": d["doc_id"], "layer": "intake", "deterministic": True, "evidence": [path], "values": {}}
        for d in docs
        if d["duplicate_of"]
    ]
    return result([path], f"{len(docs)} documents: {summ}", flags, documents=docs)


def doc_meta(case: Path, doc_id: str) -> dict:
    for d in read_json(case, "intake/manifest.json", {"documents": []})["documents"]:
        if d["doc_id"] == doc_id:
            return d
    raise KeyError(doc_id)


def doc_pages(case: Path, doc_id: str) -> list[dict]:
    return read_json(case, f"intake/text/{doc_id}.json", {"pages": []})["pages"]


def extract(case: Path, doc_id: str) -> dict:
    meta = doc_meta(case, doc_id)
    pack = doctypes.packs()[meta["doc_type"]]
    pages = doc_pages(case, doc_id)
    fields = doctypes.extract_fields(pack, pages)
    out = {"doc_id": doc_id, "doc_type": meta["doc_type"], "doc_label": meta["doc_label"], "fields": fields}
    if "transactions" in (pack.get("tables") or []):
        out["transactions"] = doctypes.extract_transactions(pages)
    if pack.get("mrz"):
        out["mrz"] = doctypes.find_mrz(pages)
    if pack.get("micr") or meta["doc_type"] == "cheque":
        out["micr"] = doctypes.find_micr(pages)
        if out["micr"]:
            fields.setdefault("routing_number", {"value": out["micr"]["routing"], "raw": out["micr"]["line"], "type": "routing", "role": "routing", "label": "MICR", "page": out["micr"]["page"], "bbox": out["micr"]["bbox"], "conf": 1.0})
            fields.setdefault("account_number", {"value": out["micr"]["account"], "raw": out["micr"]["line"], "type": "account", "role": "account", "label": "MICR", "page": out["micr"]["page"], "bbox": out["micr"]["bbox"], "conf": 1.0})
    if meta["doc_type"] == "cheque":
        # the legal amount is a whole written line ("One thousand ... and 00/100")
        for pg in pages:
            for line in textlayer.lines_of(pg["words"]):
                t = " ".join(w["t"] for w in line)
                if re.search(r"(?i)/100|\bdollars\b", t) and re.search(r"(?i)\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand)\b", t):
                    xs = [w["b"] for w in line]
                    fields["amount_words"] = {"value": t, "raw": t, "type": "text", "role": None, "label": "legal amount line", "page": pg["page"], "bbox": [min(b[0] for b in xs), min(b[1] for b in xs), max(b[2] for b in xs), max(b[3] for b in xs)], "conf": 1.0}
                    break
    missing = [f for f in (pack.get("fields") or {}) if f not in fields]
    out["missing_fields"] = missing
    path = write_json(case, f"extracted/{doc_id}.json", out)
    audit(case, "engine:extract", "extract", doc_id, {"fields": len(fields), "missing": len(missing)})
    tx = f", {len(out.get('transactions', []))} transactions" if "transactions" in out else ""
    return result([path], f"{doc_id}: {len(fields)} fields read{tx}; not found: {', '.join(missing) or 'none'}")


def add_files(case: Path, paths: list[Path]) -> list[str]:
    out = []
    for p in paths:
        dst = case / "input" / p.name
        shutil.copy2(p, dst)
        out.append(dst.name)
    return out
