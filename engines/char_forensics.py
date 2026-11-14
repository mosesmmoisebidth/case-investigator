"""Character-level forensics: one digit that differs from the rest of its line
is the typical sign of an edited amount.

Digital PDFs: compares every character of amounts and names with its line
neighbours on font, size, baseline and colour (from the PDF's own text layer).
Scans and photos: crops each glyph inside numeric OCR words and compares glyph
height, stroke width and ink darkness with the other glyphs on the line.
Output: per-character anomaly records and an overlay image.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

from .core import audit, flag, result, write_json
from .intake import doc_meta, doc_pages
from .textlayer import lines_of

NUMERIC = re.compile(r"[\d$,.]")


def _pdf_page(spans: list[dict]) -> list[dict]:
    out = []
    # group spans into lines by baseline
    lines: list[list[dict]] = []
    for sp in sorted(spans, key=lambda s: (round(s["origin_y"]), s["bbox"][0])):
        if lines and abs(lines[-1][0]["origin_y"] - sp["origin_y"]) < 2.0:
            lines[-1].append(sp)
        else:
            lines.append([sp])
    for ln in lines:
        for sp in ln:
            if not NUMERIC.search(sp["text"]):
                continue
            # compare only with the phrase it belongs to (label and value nearby),
            # not with unrelated headers that happen to share the baseline
            near = [o for o in ln if o is sp or min(abs(o["bbox"][0] - sp["bbox"][2]), abs(sp["bbox"][0] - o["bbox"][2])) < 220]
            others = [o for o in near if o is not sp]
            if not others:
                continue
            fonts, sizes, colors = Counter(), Counter(), Counter()
            for o in others:
                n = len(o["text"].strip())
                fonts[o["font"]] += n
                sizes[o["size"]] += n
                colors[o["color"]] += n
            main_font, main_size, main_color = fonts.most_common(1)[0][0], sizes.most_common(1)[0][0], colors.most_common(1)[0][0]
            base_y = Counter(round(c["oy"], 1) for o in near for c in o["chars"] if c["c"].strip()).most_common(1)[0][0]
            reasons = []
            if sp["font"] != main_font:
                reasons.append(f"font {sp['font']} differs from line font {main_font}")
            if abs(sp["size"] - main_size) > 0.25:
                reasons.append(f"size {sp['size']} vs {main_size}")
            if sp["color"] != main_color:
                reasons.append("colour differs from line")
            off = [c for c in sp["chars"] if c["c"].strip() and abs(c["oy"] - base_y) > 0.8]
            if off:
                reasons.append(f"{len(off)} character(s) off the baseline")
            if reasons:
                out.append({"text": sp["text"].strip(), "bbox": sp["bbox"], "reasons": reasons, "score": min(1.0, 0.45 * len(reasons) + 0.2)})
    return out


def _raster_page(png: Path, words: list[dict]) -> list[dict]:
    img = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return []
    out = []
    for ln in lines_of(words):
        glyphs = []
        for w in ln:
            # amounts and long numbers only: that is where edits matter, and
            # mixed-font layouts (IDs, logos) do not drown the signal
            if "<" in w["t"] or not (re.search(r"\d[\d,]*\.\d{2}", w["t"]) or len(re.sub(r"\D", "", w["t"])) >= 4):
                continue  # MRZ lines have their own check digits
            x0, y0, x1, y1 = map(int, w["b"])
            crop = img[max(0, y0 - 2) : y1 + 2, max(0, x0 - 2) : x1 + 2]
            if crop.size == 0:
                continue
            _, bw = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            n, lab, stats, _ = cv2.connectedComponentsWithStats(bw, 8)
            dist = cv2.distanceTransform(bw, cv2.DIST_L2, 3)
            for i in range(1, n):
                x, y, gw, gh, area = stats[i]
                if gh < 6 or area < 8:
                    continue
                m = lab == i
                glyphs.append(
                    {
                        "word": w["t"],
                        "bbox": [x0 - 2 + x, y0 - 2 + y, x0 - 2 + x + gw, y0 - 2 + y + gh],
                        "h": gh,
                        "stroke": float(dist[m].max()),
                        "ink": float(crop[m].mean()),
                        "bottom": y0 - 2 + y + gh,
                    }
                )
        if len(glyphs) < 6:
            continue
        H = np.array([g["h"] for g in glyphs], float)
        S = np.array([g["stroke"] for g in glyphs], float)
        K = np.array([g["ink"] for g in glyphs], float)
        Bt = np.array([g["bottom"] for g in glyphs], float)

        def z(a):
            med = np.median(a)
            mad = np.median(np.abs(a - med)) + 1e-6
            return np.abs(a - med) / (1.4826 * mad)

        zs = np.maximum.reduce([z(S) / 2, z(K) / 2, z(Bt) / 3])
        for g, zz, zh in zip(glyphs, zs, z(H)):
            if zz > 5 and zh < 3:
                out.append({"text": g["word"], "bbox": g["bbox"], "reasons": ["stroke, ink or baseline differs from the line's other digits"], "score": round(min(1.0, zz / 10), 3)})
    out.sort(key=lambda a: -a["score"])
    return out[:8]


def run(case: Path, doc_id: str) -> dict:
    meta = doc_meta(case, doc_id)
    pages = doc_pages(case, doc_id)
    recs, flags, evid = [], [], []
    for pg in pages:
        if pg.get("source") == "pdf_text":
            anomalies = _pdf_page(pg.get("spans", []))
        else:
            anomalies = _raster_page(case / pg["png"], pg.get("words", []))
        if anomalies:
            im = Image.open(case / pg["png"]).convert("RGB")
            dr = ImageDraw.Draw(im, "RGBA")
            for a in anomalies:
                b = a["bbox"]
                dr.rectangle([b[0] - 3, b[1] - 3, b[2] + 3, b[3] + 3], outline=(210, 50, 40, 255), width=3, fill=(210, 50, 40, 40))
            o = f"evidence/{doc_id}/chars_p{pg['page']}.png"
            im.save(case / o)
            evid.append(o)
            for a in anomalies:
                sev = "high" if a["score"] >= 0.8 else "medium"
                flags.append(flag("char_anomaly", f"'{a['text']}' on page {pg['page']} of {doc_id} does not match its line", sev, doc=doc_id, evidence=[o], layer="char", page=pg["page"], bbox=a["bbox"], values={"reasons": a["reasons"], "score": a["score"]}))
        recs.append({"page": pg["page"], "anomalies": anomalies})
    r = write_json(case, f"evidence/{doc_id}/chars.json", {"pages": recs, "mode": "pdf_text" if meta["kind"] == "pdf" else "raster"})
    audit(case, "engine:char_forensics", "run", doc_id, {"anomalies": len(flags)})
    return result([r, *evid], f"{doc_id}: {len(flags)} character anomaly(ies)", flags)
