"""Pixel forensics for scans and photos.

Layers, fused into one region score per page:
  * TruFor (VeriSec's model, CPU here) anomaly map
  * error level analysis (JPEG re-save difference)
  * noise residual inconsistency (local variance of a high-pass residual)
  * copy-move (the same patch, e.g. a digit, cloned elsewhere on the page)
A pure vector PDF page has no camera or scan noise, so pixel models do not
apply there; structure and character forensics cover it instead.
Thresholds are per document type (settings), never the default 0.5.
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import threading
from pathlib import Path

import cv2
import numpy as np
import scipy.ndimage as ndi
from PIL import Image

from .core import ROOT, VERISEC_ROOT, audit, flag, result, write_json
from .intake import doc_meta, doc_pages

TRUFOR_DIR = Path(os.environ.get("TRUFOR_DIR", VERISEC_ROOT / "TruFor"))
TRUFOR_PY = Path(os.environ.get("TRUFOR_PY", TRUFOR_DIR / ".venv-trufor" / "Scripts" / "python.exe"))
_TRUFOR_LOCK = threading.Lock()
THRESHOLDS = {"default": 0.35, "pay_stub": 0.3, "bank_statement": 0.3, "cheque": 0.35, "passport": 0.4, "utility_bill": 0.32}


def _jet(m: np.ndarray) -> np.ndarray:
    x = np.clip(m, 0, 1)
    r = np.clip(1.5 - np.abs(4 * x - 3), 0, 1)
    g = np.clip(1.5 - np.abs(4 * x - 2), 0, 1)
    b = np.clip(1.5 - np.abs(4 * x - 1), 0, 1)
    return (np.stack([r, g, b], -1) * 255).astype(np.uint8)


def _overlay(page_png: Path, amap: np.ndarray, out: Path, thr: float) -> None:
    base = Image.open(page_png).convert("RGB")
    m = cv2.resize(amap.astype(np.float32), base.size, interpolation=cv2.INTER_LINEAR)
    a = np.where(m >= thr * 0.6, np.clip((m - thr * 0.6) / max(1e-6, 1 - thr * 0.6), 0, 1), 0) * 0.65
    heat = _jet(m)
    arr = np.array(base).astype(np.float32)
    arr = arr * (1 - a[..., None]) + heat.astype(np.float32) * a[..., None]
    Image.fromarray(arr.clip(0, 255).astype(np.uint8)).save(out)


def ela_map(png: Path, quality: int = 90) -> np.ndarray:
    im = Image.open(png).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality)
    re = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
    d = np.abs(np.asarray(im, np.float32) - np.asarray(re, np.float32)).mean(-1)
    d = ndi.uniform_filter(d, 9)
    return d / (np.percentile(d, 99.5) + 1e-6)


def noise_map(png: Path) -> np.ndarray:
    g = cv2.cvtColor(cv2.imread(str(png)), cv2.COLOR_BGR2GRAY).astype(np.float32)
    hp = g - cv2.medianBlur(g.astype(np.uint8), 3).astype(np.float32)
    var = ndi.uniform_filter(hp * hp, 24)
    med = np.median(var) + 1e-6
    z = np.abs(np.log((var + 1e-3) / med))
    return z / (np.percentile(z, 99.5) + 1e-6)


def copy_move(png: Path, max_pairs: int = 40) -> list[dict]:
    g = cv2.cvtColor(cv2.imread(str(png)), cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(nfeatures=4000)
    kps, des = orb.detectAndCompute(g, None)
    if des is None or len(kps) < 10:
        return []
    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    matches = bf.knnMatch(des, des, k=3)
    pairs = []
    for ms in matches:
        for m in ms[1:]:
            p1, p2 = np.array(kps[m.queryIdx].pt), np.array(kps[m.trainIdx].pt)
            if m.distance < 12 and np.linalg.norm(p1 - p2) > 40:
                pairs.append({"a": [round(float(p1[0]), 1), round(float(p1[1]), 1)], "b": [round(float(p2[0]), 1), round(float(p2[1]), 1)], "d": int(m.distance)})
    # identical text glyphs legitimately repeat; only clusters of many shifted pairs matter
    if len(pairs) < 8:
        return []
    shifts = np.array([[p["b"][0] - p["a"][0], p["b"][1] - p["a"][1]] for p in pairs])
    rounded = np.round(shifts / 4).astype(int)
    vals, counts = np.unique(rounded, axis=0, return_counts=True)
    best = vals[counts.argmax()]
    cluster = [p for p, s in zip(pairs, rounded) if (s == best).all()]
    return cluster[:max_pairs] if len(cluster) >= 8 else []


def _regions(m: np.ndarray, thr: float, sx: float, sy: float) -> list[dict]:
    mask = m >= thr
    lab, _ = ndi.label(mask)
    out = []
    total = m.size
    for i, sl in enumerate(ndi.find_objects(lab) or [], start=1):
        if sl is None:
            continue
        comp = lab[sl] == i
        area = int(comp.sum())
        if area < max(20, total * 0.0004):
            continue
        ys, xs = sl
        out.append(
            {
                "bbox": [round(xs.start * sx, 1), round(ys.start * sy, 1), round(xs.stop * sx, 1), round(ys.stop * sy, 1)],
                "area_pct": round(area / total * 100, 3),
                "peak": round(float(m[sl][comp].max()), 4),
                "mean": round(float(m[sl][comp].mean()), 4),
            }
        )
    out.sort(key=lambda r: (r["peak"], r["area_pct"]), reverse=True)
    return out[:10]


def run_trufor(case: Path, doc_id: str, pngs: list[Path]) -> dict[str, dict]:
    out_dir = case / "evidence" / doc_id / "trufor"
    out_dir.mkdir(parents=True, exist_ok=True)
    todo = [p for p in pngs if not (out_dir / (p.stem + ".json")).exists()]
    if todo and TRUFOR_PY.exists():
        with _TRUFOR_LOCK:  # one TruFor at a time: three parallel CPU loads starve each other
            p = subprocess.run(
                [str(TRUFOR_PY), str(ROOT / "engines" / "trufor_runner.py"), str(out_dir), *map(str, todo)],
                cwd=str(TRUFOR_DIR / "test_docker" / "src"),
                capture_output=True,
                text=True,
                timeout=900,
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            )
        (out_dir / "runner.log").write_text(f"exit {p.returncode}\n{p.stdout[-2000:]}\n{p.stderr[-4000:]}", encoding="utf-8")
    res = {}
    for p in pngs:
        j = out_dir / (p.stem + ".json")
        if j.exists():
            meta = json.loads(j.read_text())
            meta["map"] = np.load(out_dir / (p.stem + ".npy")).astype(np.float32)
            res[p.stem] = meta
    return res


def run(case: Path, doc_id: str, use_trufor: bool = True) -> dict:
    meta = doc_meta(case, doc_id)
    thr = THRESHOLDS.get(meta["doc_type"], THRESHOLDS["default"])
    ev_dir = f"evidence/{doc_id}"
    raster_pages = [p for p in meta["pages"] if p.get("source") == "ocr" or meta["kind"] == "image"]
    if not raster_pages:
        r = write_json(case, f"{ev_dir}/pixel.json", {"applicable": False, "reason": "vector PDF pages: no scan or camera noise; structure and character forensics apply"})
        return result([r], f"{doc_id}: vector PDF, pixel models not applicable (structure and character checks cover it)")
    pngs = [case / p["png"] for p in raster_pages]
    tf = run_trufor(case, doc_id, pngs) if use_trufor else {}
    pages_out, flags, evid = [], [], []
    words_by_page = {pg["page"]: pg.get("words", []) for pg in doc_pages(case, doc_id)}
    for p, png in zip(raster_pages, pngs):
        W, H = Image.open(png).size
        ela, noise = ela_map(png), noise_map(png)
        layers = {"ela": ela, "noise": noise}
        t = tf.get(png.stem)
        if t is not None:
            layers["trufor"] = cv2.resize(t["map"], (W, H), interpolation=cv2.INTER_LINEAR)
        # fusion: TruFor leads; ELA and noise only confirm
        if "trufor" in layers:
            fused = 0.6 * layers["trufor"] + 0.2 * np.clip(ela, 0, 1) + 0.2 * np.clip(noise, 0, 1)
        else:
            fused = 0.5 * np.clip(ela, 0, 1) + 0.5 * np.clip(noise, 0, 1)
        heat_rel = f"{ev_dir}/heatmap_p{p['page']}.png"
        _overlay(png, fused, case / heat_rel, thr)
        for name, m in layers.items():
            lr = f"{ev_dir}/layer_{name}_p{p['page']}.png"
            Image.fromarray(_jet(cv2.resize(m.astype(np.float32), (W // 2, H // 2)))).save(case / lr)
            evid.append(lr)
        regs = _regions(fused, thr, 1.0, 1.0)
        agree = []
        for r in regs:
            x0, y0, x1, y1 = map(int, r["bbox"])
            support = [n for n, m in layers.items() if float(m[y0:y1, x0:x1].mean()) >= thr]
            r["layers_agreeing"] = support
            agree.append(r)
        cm = copy_move(png)
        pages_out.append({"page": p["page"], "trufor_score": t["score"] if t else None, "threshold": thr, "regions": agree, "copy_move_pairs": len(cm), "copy_move": cm[:20], "heatmap": heat_rel})
        evid.append(heat_rel)
        # Edits to financial documents change text, and cover a small share of the page
        # (well under 6%). Large blobs over photos or backgrounds are not counted, and a
        # region needs TruFor plus a second layer (or a very strong TruFor peak).
        words = words_by_page.get(p["page"], [])
        for r in agree:
            over_text = [w["t"] for w in words if not (w["b"][2] < r["bbox"][0] or w["b"][0] > r["bbox"][2] or w["b"][3] < r["bbox"][1] or w["b"][1] > r["bbox"][3])]
            r["text_under"] = over_text[:6]
            if r["area_pct"] > 6 or not over_text or r["peak"] < thr:
                continue
            lay = r["layers_agreeing"]
            if "trufor" in lay and len(lay) >= 2:
                sev = "high"
            elif "trufor" in lay and r["peak"] >= thr + 0.25:
                sev = "medium"
            else:
                continue
            flags.append(flag("pixel_tamper_region", f"Edited-looking region over '{' '.join(over_text[:3])}' on page {p['page']} of {doc_id}", sev, doc=doc_id, evidence=[heat_rel], layer="pixel", page=p["page"], bbox=r["bbox"], values={"peak": r["peak"], "layers": lay, "text": " ".join(over_text[:6])}))
        if len(cm) >= 25:
            flags.append(flag("copy_move", f"A patch is cloned elsewhere on page {p['page']} of {doc_id}", "low", doc=doc_id, evidence=[heat_rel], layer="pixel", page=p["page"], values={"pairs": len(cm)}))
    r = write_json(case, f"{ev_dir}/pixel.json", {"applicable": True, "pages": pages_out})
    audit(case, "engine:pixel_forensics", "run", doc_id, {"pages": len(pages_out), "flags": len(flags)})
    return result([r, *evid], f"{doc_id}: {len(pages_out)} raster page(s) checked, {len(flags)} pixel signal(s)", flags)
