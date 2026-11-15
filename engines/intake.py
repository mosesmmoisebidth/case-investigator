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

from . import catalog, doctypes, textlayer
from .core import audit, read_json, rel, result, sha256_file, write_json

IMG_EXT = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")[:40] or "doc"


def _typed(catalog_type: str) -> dict:
    """Manifest fields for a catalog type. doc_type stays the detailed pack id
    (what the engines key their checks on); catalog_type is the specific kind."""
    t = catalog.get(catalog_type)
    return {"doc_type": t["pack"], "catalog_type": t["id"], "doc_label": t["label"], "family": t["family"], "family_label": t["family_label"]}


def reclassify(case: Path, doc_id: str, catalog_type: str, reason: str, by: str) -> dict:
    """Set a document's type by hand. Kept in corrections/doc_types.json (not wiped by a re-run) so a re-run keeps it."""
    if catalog_type not in catalog.load()["types"]:
        raise ValueError(f"unknown document type {catalog_type}")
    man = read_json(case, "intake/manifest.json", {"documents": []})
    doc = next((d for d in man["documents"] if d["doc_id"] == doc_id), None)
    if doc is None:
        raise KeyError(doc_id)
    before = doc.get("catalog_type") or doc.get("doc_type")
    doc.update(_typed(catalog_type), classify_conf=1.0, classify_why=[f"set by {by}: {reason}".strip(": ")], needs_review=False)
    write_json(case, "intake/manifest.json", man)
    ov = read_json(case, "corrections/doc_types.json", {})
    ov[doc_id] = {"catalog_type": catalog_type, "reason": reason, "by": by}
    write_json(case, "corrections/doc_types.json", ov)
    audit(case, by, "reclassify", {"doc": doc_id, "from": before, "to": catalog_type, "reason": reason}, "ok")
    return doc


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
        # sort the pages against the document catalog and split mixed files
        groups = catalog.sort_pages(pages, f.name)
        for gi, g in enumerate(groups):
            doc_id = _slug(f.stem) + (f"_{gi + 1}" if len(groups) > 1 else "")
            sorting = [{"page": p["page"], **{k: p["_sort"][k] for k in ("type", "conf", "why", "page_of")}} for p in g["pages"]]
            for p in g["pages"]:
                p.pop("_sort", None)
            docs.append(
                {
                    "doc_id": doc_id,
                    "file": f.name,
                    "sha256": h,
                    "kind": kind,
                    **_typed(g["type"]),
                    "classify_conf": g["conf"],
                    "classify_why": g["why"],
                    "classify_alt": g["alt"],
                    "split_reason": g["split_reason"] if len(groups) > 1 else None,
                    "needs_review": g["type"] == "generic" or g["conf"] < catalog.SURE,
                    "page_count": len(g["pages"]),
                    "pages": [{k: v for k, v in p.items() if k in ("page", "png", "w", "h", "source")} for p in g["pages"]],
                    "page_sorting": sorting,
                    "duplicate_of": dup_of,
                }
            )
            write_json(case, f"intake/text/{doc_id}.json", {"pages": g["pages"]})
    # an investigator's (or the agent's) correction survives a re-run
    overrides = read_json(case, "corrections/doc_types.json", {})
    for d in docs:
        o = overrides.get(d["doc_id"])
        if o and o.get("catalog_type") in catalog.load()["types"]:
            d.update(_typed(o["catalog_type"]), classify_conf=1.0, classify_why=[f"set by {o.get('by', 'investigator')}: {o.get('reason', '')}".strip(": ")], needs_review=False)
    manifest = {"documents": docs}
    path = write_json(case, "intake/manifest.json", manifest)
    audit(case, "engine:intake", "intake", [d["file"] for d in docs], {"documents": len(docs), "families": sorted({d["family"] for d in docs})})
    by_fam: dict[str, list[str]] = {}
    for d in docs:
        by_fam.setdefault(d["family_label"], []).append(d["doc_label"])
    summ = f"{len(docs)} document{'s' if len(docs) != 1 else ''} from {len(files)} file{'s' if len(files) != 1 else ''}: " + "; ".join(f"{k}: {len(v)} ({', '.join(sorted(set(v)))})" for k, v in by_fam.items())
    unsure = [d["doc_id"] for d in docs if d["needs_review"]]
    if unsure:
        summ += f". Needs a look: {', '.join(unsure)}"
    flags = [
        {"check": "duplicate_file", "claim": f"{d['file']} is an exact duplicate of {d['duplicate_of']}", "severity": "low", "doc": d["doc_id"], "layer": "intake", "deterministic": True, "evidence": [path], "values": {}}
        for d in docs
        if d["duplicate_of"]
    ]
    return result([path], summ, flags, documents=docs)


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
    if meta["doc_type"] in ("passport", "drivers_license"):
        _identity_fields(fields, out.get("mrz") or [])
    missing = [f for f in (pack.get("fields") or {}) if f not in fields]
    out["missing_fields"] = missing
    path = write_json(case, f"extracted/{doc_id}.json", out)
    audit(case, "engine:extract", "extract", doc_id, {"fields": len(fields), "missing": len(missing)})
    tx = f", {len(out.get('transactions', []))} transactions" if "transactions" in out else ""
    return result([path], f"{doc_id}: {len(fields)} fields read{tx}; not found: {', '.join(missing) or 'none'}")


def _identity_fields(fields: dict, mrz: list[str]) -> None:
    """Full name from surname + given names; missing identity fields from the MRZ."""
    sn, gn = fields.get("surname"), fields.get("given_names")
    if sn and gn:
        val = f"{gn['value']} {sn['value']}"
        val = " ".join(w.capitalize() for w in val.split()) if val.isupper() else val
        b1, b2 = gn.get("bbox"), sn.get("bbox")
        bbox = [min(b1[0], b2[0]), min(b1[1], b2[1]), max(b1[2], b2[2]), max(b1[3], b2[3])] if b1 and b2 else (b1 or b2)
        fields["full_name"] = {"value": val, "raw": f"{gn['raw']} / {sn['raw']}", "type": "name", "role": "person", "label": "given names + surname", "page": gn.get("page"), "bbox": bbox, "conf": 1.0}
    if len(mrz) >= 2 and len(mrz[-1]) == 44:
        try:
            from mrz.checker.td3 import TD3CodeChecker

            f = TD3CodeChecker("\n".join(mrz[-2:])).fields()

            def d6(s, future=False):
                yy = int(s[:2])
                cent = 2000 if (yy <= 40 or future) else 1900
                return f"{cent + yy:04d}-{s[2:4]}-{s[4:6]}"

            src = {"type": "date", "label": "MRZ", "page": None, "bbox": None, "conf": 1.0}
            if "date_of_birth" not in fields and f.birth_date:
                fields["date_of_birth"] = {**src, "value": d6(f.birth_date), "raw": f.birth_date, "role": "dob"}
            if "expiry_date" not in fields and f.expiry_date:
                fields["expiry_date"] = {**src, "value": d6(f.expiry_date, True), "raw": f.expiry_date, "role": "expiry"}
            if "document_number" not in fields and f.document_number:
                fields["document_number"] = {**src, "type": "id", "value": f.document_number.replace("<", ""), "raw": f.document_number, "role": "id_number"}
            if "full_name" not in fields and f.surname:
                v = " ".join(w.capitalize() for w in f"{f.name} {f.surname}".replace("<", " ").split())
                fields["full_name"] = {**src, "type": "name", "value": v, "raw": f"{f.name} {f.surname}", "role": "person"}
        except Exception:
            pass


def add_files(case: Path, paths: list[Path]) -> list[str]:
    out = []
    for p in paths:
        dst = case / "input" / p.name
        shutil.copy2(p, dst)
        out.append(dst.name)
    return out
