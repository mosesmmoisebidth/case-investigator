"""Case report: HTML (preview) and PDF (download), built from the case files.

Opens with the relationship graph and a "What checks out" list, so a clean case
is shown as clean with proof. Then the decision, the findings the investigator
kept (each with its evidence), the timeline and an appendix of every check run.
"""

from __future__ import annotations

import html
import json
import time
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

from .core import read_json, verify_audit

COL = {"verified": (31, 122, 78), "conflict": (164, 57, 43), "missing": (154, 107, 0), "unverifiable": (150, 144, 128)}


def _font(size: int, bold: bool = False):
    for name in (["arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def graph_png(case: Path) -> str | None:
    g = read_json(case, "graph/graph.json", None)
    if not g or not g.get("nodes"):
        return None

    def col(n):
        if n["kind"] in ("document", "missing"):
            return 0
        if n["kind"] == "person":
            return 1
        if n["kind"] == "account":
            return 3
        if n["kind"] == "money":
            return 4 if n.get("money_kind") == "pay" else 5
        return 2

    cols: dict[int, list] = {}
    for n in g["nodes"]:
        cols.setdefault(col(n), []).append(n)
    used = sorted(cols)
    W, nw, nh, gapy = 1700, 230, 46, 66
    tallest = max(len(v) for v in cols.values())
    H = 60 + tallest * gapy + 20
    im = Image.new("RGB", (W, H), (250, 248, 242))
    d = ImageDraw.Draw(im)
    pos = {}
    step = (W - nw - 40) / max(1, len(used) - 1)
    for ci, c in enumerate(used):
        items = cols[c]
        off = 50 + (tallest - len(items)) * gapy / 2
        for i, n in enumerate(items):
            pos[n["id"]] = (20 + ci * step, off + i * gapy)
    for e in g["edges"]:
        if e["source"] not in pos or e["target"] not in pos:
            continue
        (x1, y1), (x2, y2) = pos[e["source"]], pos[e["target"]]
        a = (x1 + nw, y1 + nh / 2) if x2 >= x1 else (x1, y1 + nh / 2)
        b = (x2, y2 + nh / 2) if x2 >= x1 else (x2 + nw, y2 + nh / 2)
        w = 4 if e["state"] == "conflict" else 2
        if e["state"] in ("missing", "unverifiable"):
            n_seg = 16
            for k in range(n_seg):
                if k % 2:
                    continue
                t0, t1 = k / n_seg, (k + 1) / n_seg
                d.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0), (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)], fill=COL[e["state"]], width=w)
        else:
            d.line([a, b], fill=COL[e["state"]], width=w)
    f, fb, fs = _font(15), _font(15, True), _font(12)
    for n in g["nodes"]:
        x, y = pos[n["id"]]
        missing = n["kind"] == "missing"
        app = n["kind"] == "person" and n.get("role") == "applicant"
        fill = (247, 235, 207) if missing else (228, 239, 230) if app else (255, 255, 255)
        outline = (154, 107, 0) if missing else (31, 122, 78) if app else (210, 203, 183)
        d.rounded_rectangle([x, y, x + nw, y + nh], radius=9, fill=fill, outline=outline, width=2)
        label = n["label"] if len(n["label"]) < 28 else n["label"][:26] + "..."
        d.text((x + 10, y + 6), label, fill=(33, 30, 23), font=fb if app else f)
        sub = n.get("doc") or n.get("sub") or n.get("role") or n["kind"]
        d.text((x + 10, y + 26), str(sub)[:32], fill=(122, 115, 97), font=fs)
    out = case / "report" / "graph.png"
    out.parent.mkdir(exist_ok=True)
    im.save(out)
    return "report/graph.png"


def _esc(x) -> str:
    return html.escape("" if x is None else str(x))


def build_html(case: Path, for_pdf: bool = False) -> str:
    meta = read_json(case, "case.json", {})
    sc = read_json(case, "findings/score.json", {})
    dec = read_json(case, "findings/decision.json", None)
    F = [f for f in read_json(case, "findings/verified.json", {"findings": []})["findings"] if f["status"] != "rejected"]
    rejected = [f for f in read_json(case, "findings/verified.json", {"findings": []})["findings"] if f["status"] == "rejected"]
    bp = read_json(case, "checks/blueprint.json", {"rules": []})["rules"]
    g = read_json(case, "graph/graph.json", {}) or {}
    tl = read_json(case, "timeline.json", {"events": []})["events"]
    man = read_json(case, "intake/manifest.json", {"documents": []})["documents"]
    narrative = (case / "report" / "narrative.md").read_text(encoding="utf-8") if (case / "report" / "narrative.md").exists() else ""
    gp = graph_png(case)
    img = (lambda p: p) if for_pdf else (lambda p: f"/api/cases/{meta.get('id')}/file?path={p}")
    verified_edges = [e for e in g.get("edges", []) if e["state"] == "verified" and e.get("rule")]
    sev_color = {"critical": "#A4392B", "high": "#A4392B", "medium": "#9A6B00", "low": "#7A7361", "info": "#7A7361"}
    st_color = {"verified": "#1F7A4E", "conflict": "#A4392B", "missing": "#9A6B00", "unverifiable": "#7A7361"}
    parts = [
        "<html><head><meta charset='utf-8'><style>",
        "body{font-family:Helvetica,Arial,sans-serif;color:#211E17;font-size:10.5pt;line-height:1.45}",
        "h1{font-size:20pt;margin:0 0 4px} h2{font-size:13pt;margin:18px 0 6px;border-bottom:1px solid #E2DCCD;padding-bottom:4px}",
        ".mono{font-family:Courier,monospace;font-size:8.5pt;color:#7A7361} .muted{color:#7A7361}",
        "table{border-collapse:collapse;width:100%} td,th{border-bottom:1px solid #ECE7DA;padding:4px 6px;text-align:left;vertical-align:top;font-size:9.5pt}",
        ".box{border:1px solid #E2DCCD;border-radius:6px;padding:8px 10px;margin:6px 0;background:#FAF8F2}",
        ".tag{font-family:Courier,monospace;font-size:8pt;font-weight:bold}",
        "</style></head><body>",
        f"<div class='mono'>VERISEC CASE INVESTIGATOR · CASE REPORT · {_esc(meta.get('id'))}</div>",
        f"<h1>{_esc(g.get('applicant') or meta.get('applicant') or 'Applicant')}</h1>",
        f"<div class='muted'>{_esc(meta.get('context'))} · workflow: {_esc(meta.get('type'))} · generated {time.strftime('%Y-%m-%d %H:%M')}</div>",
        "<h2>Decision</h2><div class='box'>",
        f"<b>Recommended:</b> {_esc(sc.get('recommended_outcome'))} <span class='muted'>({_esc('; '.join(sc.get('rules_fired', [])))})</span><br>",
        f"<b>Case risk:</b> {_esc(sc.get('risk_level'))} (score {_esc(sc.get('risk_score'))})<br>",
    ]
    if dec:
        parts.append(f"<b>Final outcome:</b> {_esc(dec['final_outcome'])}{' (override of the recommendation)' if dec.get('override') else ''}<br><b>Signed by:</b> {_esc(dec['signed_by'])} on {time.strftime('%Y-%m-%d %H:%M', time.localtime(dec['signed_at']))}<br><b>Rationale:</b> {_esc(dec.get('rationale') or 'none given')}")
    else:
        parts.append("<b>Final outcome:</b> not yet signed (draft report)")
    parts.append("</div>")
    if narrative:
        parts.append(f"<h2>Investigator summary</h2><div>{_esc(narrative)}</div>")
    c = g.get("counts", {})
    parts.append(f"<h2>Relationship graph</h2><div class='muted'>{c.get('verified', 0)} links verified, {c.get('conflict', 0)} conflicting, {c.get('missing', 0)} missing, {c.get('unverifiable', 0)} unverifiable. Green verified, red conflict, amber dashed missing, grey dotted unverifiable.</div>")
    if gp:
        parts.append(f"<img src='{img(gp)}' width='520'>")
    parts.append("<h2>Workflow blueprint</h2><table><tr><th>Rule</th><th>Flow</th><th>Status</th><th>Detail</th></tr>")
    for r in bp:
        parts.append(f"<tr><td>{_esc(r['label'])}</td><td>{_esc(r['flow'])}</td><td style='color:{st_color.get(r['status'], '#211E17')}'><b>{_esc(r['status'])}</b></td><td>{_esc(r['detail'])}</td></tr>")
    parts.append("</table>")
    parts.append("<h2>What checks out</h2>")
    if verified_edges:
        parts.append("<ul>" + "".join(f"<li>{_esc(e['explain'])}</li>" for e in verified_edges[:30]) + "</ul>")
    else:
        parts.append("<div class='muted'>No verified rule links.</div>")
    parts.append(f"<h2>Findings ({len(F)})</h2>")
    for f in F:
        st = f["status"]
        parts.append(f"<div class='box'><span class='tag' style='color:{sev_color[f['severity']]}'>{_esc(f['severity'].upper())}</span> <span class='mono'>{_esc(f['id'])} · {_esc(f['category'])} · {_esc(f['confidence'])} confidence · {_esc(st)}</span><br><b>{_esc(f['claim'])}</b><br><span class='muted'>Agreeing checks: {_esc(', '.join(f['checks']))}</span>")
        if f.get("review") and f["review"].get("reason"):
            parts.append(f"<br><span class='muted'>Reviewer: {_esc(f['review']['reason'])}</span>")
        pics = [p for p in f.get("evidence", []) if p.endswith(".png")][:1]
        for p in pics:
            parts.append(f"<br><img src='{img(p)}' width='300'>")
        parts.append(f"<br><span class='mono'>evidence: {_esc(', '.join(f.get('evidence', [])[:4]))}</span></div>")
    if rejected:
        parts.append("<h2>Findings rejected by the investigator</h2><ul>" + "".join(f"<li>{_esc(f['claim'])}: {_esc((f.get('review') or {}).get('reason'))}</li>" for f in rejected) + "</ul>")
    parts.append("<h2>Timeline</h2><table><tr><th>Date</th><th>Event</th><th>Source</th></tr>")
    for e in tl:
        parts.append(f"<tr><td class='mono'>{_esc(e['date'])}</td><td>{_esc(e['label'])}</td><td class='mono'>{_esc(e.get('doc') or '')}</td></tr>")
    parts.append("</table>")
    parts.append("<h2>Appendix: documents and checks run</h2><table><tr><th>Document</th><th>SHA-256</th><th>Checks</th></tr>")
    for dd in man:
        lg = read_json(case, f"checks/logic_{dd['doc_id']}.json", {"checks": []})
        checks = ", ".join(f"{c['check']} ({c['status']})" for c in lg.get("checks", []))
        parts.append(f"<tr><td>{_esc(dd['doc_label'])}<br><span class='mono'>{_esc(dd['file'])}</span></td><td class='mono'>{_esc(dd['sha256'][:24])}...</td><td>{_esc(checks or 'structure, pixel and character forensics')}</td></tr>")
    parts.append("</table>")
    log = case / "audit.log"
    last = json.loads(log.read_text(encoding="utf-8").strip().splitlines()[-1])["hash"] if log.exists() and log.read_text(encoding="utf-8").strip() else ""
    parts.append(f"<h2>Audit</h2><div class='mono'>audit chain {'intact' if verify_audit(case) else 'BROKEN'} · head {last[:32]}</div>")
    parts.append("<p class='muted'>The AI flags, the investigator decides. Every finding links to stored evidence. Generated by VeriSec Case Investigator.</p></body></html>")
    return "".join(parts)


def build_pdf(case: Path) -> Path:
    src = build_html(case, for_pdf=True)
    out = case / "report" / "report.pdf"
    out.parent.mkdir(exist_ok=True)
    story = pymupdf.Story(html=src, archive=pymupdf.Archive(str(case)))
    writer = pymupdf.DocumentWriter(str(out))
    mediabox = pymupdf.paper_rect("letter")
    where = mediabox + (40, 40, -40, -40)
    more = True
    while more:
        dev = writer.begin_page(mediabox)
        more, _ = story.place(where)
        story.draw(dev)
        writer.end_page()
    writer.close()
    return out
