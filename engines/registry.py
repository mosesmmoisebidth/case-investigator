"""Engine catalog (shown on the Engines screen) and per-document pipeline."""

from __future__ import annotations

from pathlib import Path

from . import char_forensics, intake, logic, payments, pdf_forensics, pixel_forensics, sanctions

ENGINES = [
    {"id": "intake", "code": "IN", "name": "Intake and classifier", "layer": "Intake", "source": "VeriSec document packs", "does": "Hashes originals, renders pages, splits multi-document files and identifies each document type."},
    {"id": "extract", "code": "EX", "name": "Field extractor", "layer": "Extraction", "source": "PDF text layer + PP-OCR", "does": "Reads every field with the page and box it came from, plus statement rows, MRZ and MICR lines."},
    {"id": "pdf_forensics", "code": "PF", "name": "PDF structure forensics", "layer": "Integrity", "source": "pikepdf + PyMuPDF", "does": "Revisions, producer software, edit dates, white boxes over text, overlay annotations, invisible text."},
    {"id": "pixel_forensics", "code": "PX", "name": "Pixel forensics", "layer": "Integrity", "source": "VeriSec TruFor + ELA + noise + copy-move", "does": "Heatmaps of edited regions on scans and photos, fused across independent layers."},
    {"id": "char_forensics", "code": "CH", "name": "Character forensics", "layer": "Integrity", "source": "Glyph and span analysis", "does": "Finds the one digit whose font, size, baseline, stroke or ink differs from its line."},
    {"id": "logic", "code": "LG", "name": "Content logic", "layer": "Integrity", "source": "Deterministic rules", "does": "Pay stub maths and FICA rates, running balances, MRZ check digits, Luhn, invoice maths, amounts in words, dates."},
    {"id": "payments", "code": "PM", "name": "Payment instruments", "layer": "Verification", "source": "VeriSec MICR routing check, bank directory, BIN table", "does": "Routing number to bank owner, Fed district, card BIN to issuer."},
    {"id": "sanctions", "code": "SC", "name": "Sanctions and PEP screening", "layer": "Verification", "source": "VeriSec yente (OpenSanctions)", "does": "Screens every person and company named in the case."},
    {"id": "graph", "code": "GR", "name": "Relationship graph", "layer": "Relationships", "source": "Entity resolution + workflow blueprint", "does": "Links people, addresses, employers, accounts and money across documents; checks every expected link."},
]


def analyse_document(case: Path, doc_id: str, use_trufor: bool = True, application_date: str | None = None) -> dict:
    """The per-document passes, in order. Returns every engine's result."""
    out = {"extract": intake.extract(case, doc_id)}
    out["pdf_forensics"] = pdf_forensics.run(case, doc_id)
    out["pixel_forensics"] = pixel_forensics.run(case, doc_id, use_trufor=use_trufor)
    out["char_forensics"] = char_forensics.run(case, doc_id)
    out["logic"] = logic.run(case, doc_id, application_date)
    out["payments"] = payments.run(case, doc_id)
    return out


def all_flags(results: dict) -> list[dict]:
    return [f for r in results.values() for f in r.get("flags", [])]


__all__ = ["ENGINES", "analyse_document", "all_flags", "intake", "sanctions"]
