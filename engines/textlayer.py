"""Text with positions for every page.

Digital PDFs: the PDF's own text layer via PyMuPDF, exact, with font, size,
colour and per-character boxes (used by character forensics).
Images and scanned pages: PP-OCR (RapidOCR runtime) word boxes.
Coordinates are in page pixels of the rasterised page PNG (same as the viewer).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pymupdf

RENDER_DPI = 150
SCALE = RENDER_DPI / 72.0


@lru_cache(maxsize=1)
def _ocr():
    from rapidocr import RapidOCR

    return RapidOCR()


def pdf_page_text(page: pymupdf.Page) -> dict:
    """Spans and words of one PDF page, scaled to the rendered PNG."""
    raw = page.get_text("rawdict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE)
    spans, words = [], []
    for block in raw.get("blocks", []):
        for line in block.get("lines", []):
            for sp in line.get("spans", []):
                chars = sp.get("chars", [])
                text = "".join(c["c"] for c in chars)
                if not text.strip():
                    continue
                s = {
                    "text": text,
                    "font": sp.get("font"),
                    "size": round(sp.get("size", 0), 2),
                    "color": sp.get("color"),
                    "bbox": [round(v * SCALE, 1) for v in sp["bbox"]],
                    "origin_y": round(sp["origin"][1] * SCALE, 2),
                    "chars": [
                        {"c": c["c"], "bbox": [round(v * SCALE, 1) for v in c["bbox"]], "ox": round(c["origin"][0] * SCALE, 2), "oy": round(c["origin"][1] * SCALE, 2)}
                        for c in chars
                    ],
                }
                spans.append(s)
    for w in page.get_text("words"):
        x0, y0, x1, y1, t = w[:5]
        words.append({"t": t, "b": [round(x0 * SCALE, 1), round(y0 * SCALE, 1), round(x1 * SCALE, 1), round(y1 * SCALE, 1)], "conf": 1.0})
    return {"source": "pdf_text", "spans": spans, "words": words}


def image_text(png_path: Path) -> dict:
    """PP-OCR words for an image page."""
    out = _ocr()(str(png_path))
    words = []
    boxes = getattr(out, "boxes", None)
    txts = getattr(out, "txts", None)
    scores = getattr(out, "scores", None)
    if boxes is not None and txts is not None:
        for box, t, sc in zip(boxes, txts, scores):
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            words.append({"t": str(t), "b": [round(float(min(xs)), 1), round(float(min(ys)), 1), round(float(max(xs)), 1), round(float(max(ys)), 1)], "conf": round(float(sc), 3)})
    return {"source": "ocr", "spans": [], "words": words}


def lines_of(words: list[dict], tol: float = 6.0) -> list[list[dict]]:
    """Group words into reading lines by vertical centre."""
    ws = sorted(words, key=lambda w: ((w["b"][1] + w["b"][3]) / 2, w["b"][0]))
    lines: list[list[dict]] = []
    for w in ws:
        cy = (w["b"][1] + w["b"][3]) / 2
        if lines:
            last = lines[-1]
            lcy = sum((x["b"][1] + x["b"][3]) / 2 for x in last) / len(last)
            if abs(cy - lcy) <= tol:
                last.append(w)
                continue
        lines.append([w])
    for ln in lines:
        ln.sort(key=lambda w: w["b"][0])
    return lines


def page_text(words: list[dict]) -> str:
    return "\n".join(" ".join(w["t"] for w in ln) for ln in lines_of(words))
