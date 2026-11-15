"""VeriSec engines wrapped as LangChain tools, bound to one case.

Every tool saves its raw output to the case evidence folder and returns only
the evidence path(s), a short summary and the signals it raised, so the
agent's context stays small and every result is traceable.
"""

from __future__ import annotations

import base64
import io
import json
from pathlib import Path
from typing import Callable

from langchain_core.tools import StructuredTool
from PIL import Image

from engines import catalog, char_forensics, graph, intake, logic, payments, pdf_forensics, pixel_forensics, sanctions
from engines.core import audit, read_json, write_json

Emit = Callable[[dict], None]


def _brief(r: dict, max_flags: int = 8) -> str:
    out = {"summary": r.get("summary"), "evidence": r.get("evidence", [])[:6], "signals": [{"severity": f["severity"], "check": f["check"], "claim": f["claim"], "page": f.get("page"), "bbox": f.get("bbox")} for f in r.get("flags", [])[:max_flags]]}
    return json.dumps(out, default=str)


def make_tools(case: Path, case_type: str, context: str, flags_sink: list, emit: Emit, use_trufor: bool = True, vision=None) -> dict[str, list]:
    app_date = graph.parse_context(context)["application_date"]

    def run(name: str, doc: str | None, fn):
        emit({"type": "tool_start", "tool": name, "doc": doc})
        try:
            r = fn()
        except Exception as e:  # noqa: BLE001
            emit({"type": "tool_error", "tool": name, "doc": doc, "error": str(e)[:200]})
            audit(case, f"tool:{name}", "error", doc, str(e)[:300])
            return json.dumps({"error": str(e)[:300], "note": "record this check as not run; do not guess its result"})
        flags_sink.extend(r.get("flags", []))
        emit({"type": "tool_done", "tool": name, "doc": doc, "summary": r.get("summary"), "flags": len(r.get("flags", []))})
        for f in r.get("flags", []):
            emit({"type": "draft_finding", "doc": doc, "engine": name, "severity": f["severity"], "claim": f["claim"]})
        audit(case, f"tool:{name}", "run", doc, r.get("summary"))
        return _brief(r)

    # ----------------------------------------------------------- per-document passes
    def list_documents() -> str:
        """List every document the intake sorter found: its type and family, how sure the sorter was and why, its pages, the file it came from (one file can hold several documents) and the file hash. Documents marked needs_review were not recognised with confidence."""
        m = read_json(case, "intake/manifest.json", {"documents": []})["documents"]
        keys = ("doc_id", "doc_label", "catalog_type", "family_label", "classify_conf", "classify_why", "classify_alt", "needs_review", "split_reason", "page_count", "file", "sha256", "duplicate_of")
        return json.dumps([{k: d.get(k) for k in keys} | {"pages": [p["page"] for p in d.get("pages", [])]} for d in m], default=str)

    def reclassify_document(doc_id: str, catalog_type: str, reason: str) -> str:
        """Correct a document's type when the sorter got it wrong (after you have looked at the page). catalog_type is an id from the document catalog, e.g. bank_statement, credit_card_statement, lease_agreement, insurance_policy. The correction is audited and kept on re-runs. Run read_fields on the document again afterwards."""
        try:
            d = intake.reclassify(case, doc_id, catalog_type, reason, "agent:lead-investigator")
        except (KeyError, ValueError) as e:
            return json.dumps({"error": str(e), "known_types": sorted(catalog.load()["types"])})
        emit({"type": "agent_message", "who": "lead investigator", "text": f"re-sorted {doc_id} as {d['doc_label']}: {reason}"})
        return json.dumps({"doc_id": doc_id, "now": d["doc_label"], "family": d["family_label"]})

    def read_fields(doc_id: str) -> str:
        """Pass 5a: read every field of one document (value, page, box) plus statement rows, MRZ and MICR."""
        return run("read_fields", doc_id, lambda: intake.extract(case, doc_id)) + "\n" + json.dumps({k: {"value": v["value"], "page": v.get("page")} for k, v in read_json(case, f"extracted/{doc_id}.json")["fields"].items()}, default=str)[:3000]

    def pdf_structure(doc_id: str) -> str:
        """Pass 1/3: PDF structure forensics (revisions, producer, edit dates, white boxes over text, overlay annotations, invisible text)."""
        return run("pdf_structure", doc_id, lambda: pdf_forensics.run(case, doc_id))

    def pixel_tamper(doc_id: str) -> str:
        """Pass 3: pixel forensics on scans and photos (TruFor + error level + noise + copy-move). Writes heatmaps."""
        return run("pixel_tamper", doc_id, lambda: pixel_forensics.run(case, doc_id, use_trufor=use_trufor))

    def character_forensics(doc_id: str) -> str:
        """Pass 4: compare every character of amounts and names with its line (font, size, baseline, stroke, ink)."""
        return run("character_forensics", doc_id, lambda: char_forensics.run(case, doc_id))

    def content_logic(doc_id: str) -> str:
        """Pass 5b: deterministic checks (pay stub maths, FICA, running balances, MRZ, routing checksum, Luhn, amount in words, dates)."""
        return run("content_logic", doc_id, lambda: logic.run(case, doc_id, app_date))

    def payment_instruments(doc_id: str) -> str:
        """Routing number to bank owner and Fed district, card BIN to issuer (VeriSec bank directory and BIN table)."""
        return run("payment_instruments", doc_id, lambda: payments.run(case, doc_id))

    def zoom_in(doc_id: str, page: int, x0: float, y0: float, x1: float, y1: float) -> str:
        """Zoom-in loop: re-crop a suspicious region at 2x and re-run pixel and character forensics on the crop only.
        Use it before raising any pixel or character finding. Coordinates are page-image pixels."""
        def fn():
            meta = intake.doc_meta(case, doc_id)
            pg = next(p for p in meta["pages"] if p["page"] == page)
            im = Image.open(case / pg["png"]).convert("RGB")
            pad = 24
            box = (max(0, int(x0) - pad), max(0, int(y0) - pad), min(im.width, int(x1) + pad), min(im.height, int(y1) + pad))
            crop = im.crop(box).resize(((box[2] - box[0]) * 2, (box[3] - box[1]) * 2), Image.LANCZOS)
            rel = f"evidence/{doc_id}/zoom_p{page}_{int(x0)}_{int(y0)}.png"
            crop.save(case / rel)
            ela = pixel_forensics.ela_map(case / rel)
            noise = pixel_forensics.noise_map(case / rel)
            res = {"crop": rel, "box": box, "ela_mean": round(float(ela.mean()), 4), "ela_peak": round(float(ela.max()), 4), "noise_mean": round(float(noise.mean()), 4), "noise_peak": round(float(noise.max()), 4)}
            write_json(case, rel.replace(".png", ".json"), res)
            return {"summary": f"zoomed {doc_id} p{page}: ELA peak {res['ela_peak']}, noise peak {res['noise_peak']}", "evidence": [rel, rel.replace('.png', '.json')], "flags": []}
        return run("zoom_in", doc_id, fn)

    def vision_second_opinion(doc_id: str, page: int, x0: float, y0: float, x1: float, y1: float, question: str) -> str:
        """Pass 6: ask the vision model a fixed question about one flagged region (e.g. 'Does this number match the font of its row?').
        It supports a finding but never creates one alone."""
        def fn():
            if vision is None:
                return {"summary": "vision model not configured; not run", "evidence": [], "flags": []}
            meta = intake.doc_meta(case, doc_id)
            pg = next(p for p in meta["pages"] if p["page"] == page)
            im = Image.open(case / pg["png"]).convert("RGB")
            pad = 40
            crop = im.crop((max(0, int(x0) - pad), max(0, int(y0) - pad), min(im.width, int(x1) + pad), min(im.height, int(y1) + pad)))
            buf = io.BytesIO()
            crop.save(buf, "PNG")
            b64 = base64.b64encode(buf.getvalue()).decode()
            from langchain_core.messages import HumanMessage

            msg = HumanMessage(content=[{"type": "text", "text": question + " Answer in two sentences, describing only what you see."}, {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}}])
            ans = vision.invoke([msg]).content
            ans = ans if isinstance(ans, str) else json.dumps(ans)
            rel = f"evidence/{doc_id}/vlm_p{page}_{int(x0)}_{int(y0)}.json"
            write_json(case, rel, {"question": question, "answer": ans, "box": [x0, y0, x1, y1]})
            return {"summary": ans[:300], "evidence": [rel], "flags": []}
        return run("vision_second_opinion", doc_id, fn)

    def write_dossier(doc_id: str, verdict: str, reasons: str) -> str:
        """Finish one document: write its dossier with an integrity verdict (clean, suspicious or tampered) and the reasons."""
        ev = sorted(str(p.relative_to(case).as_posix()) for p in (case / "evidence" / doc_id).glob("*") if p.is_file()) if (case / "evidence" / doc_id).exists() else []
        d = {"doc_id": doc_id, "verdict": verdict, "reasons": reasons, "evidence": ev, "extracted": f"extracted/{doc_id}.json"}
        write_json(case, f"evidence/{doc_id}/dossier.json", d)
        emit({"type": "dossier", "doc": doc_id, "verdict": verdict, "reasons": reasons[:200]})
        return json.dumps({"saved": f"evidence/{doc_id}/dossier.json"})

    # ----------------------------------------------------------- case-level
    def build_relationship_graph() -> str:
        """Build the case relationship graph and check it against the workflow blueprint. Returns every red (conflict), amber (missing) and grey (unverifiable) link."""
        def fn():
            r = graph.build(case, case_type, context)
            g = read_json(case, "graph/graph.json")
            r["summary"] += " | open links: " + json.dumps([{"edge": e["id"], "state": e["state"], "rule": e["rule"], "explain": e["explain"]} for e in g["edges"] if e["state"] != "verified" and e["rule"]])[:2500]
            return r
        return run("build_relationship_graph", None, fn)

    def search_transactions(query: str = "", amount: float = 0.0, date_from: str = "", date_to: str = "") -> str:
        """Follow-up: search every statement row by payer text, amount (+/- 1.00) and/or date range (YYYY-MM-DD).
        Use it, for example, to look for a payroll provider paying on the employer's behalf before raising an employer finding."""
        rows = []
        for p in sorted((case / "extracted").glob("*.json")):
            ex = json.loads(p.read_text(encoding="utf-8"))
            for t in ex.get("transactions") or []:
                if query and query.lower() not in (t["description"] or "").lower():
                    continue
                if amount and (t["amount"] is None or abs(t["amount"] - amount) > 1.0):
                    continue
                if date_from and t["date"] < date_from:
                    continue
                if date_to and t["date"] > date_to:
                    continue
                rows.append({"doc": ex["doc_id"], **{k: t[k] for k in ("date", "description", "amount", "direction", "balance")}})
        audit(case, "tool:search_transactions", "run", {"q": query, "amount": amount, "from": date_from, "to": date_to}, len(rows))
        emit({"type": "tool_done", "tool": "search_transactions", "summary": f"{len(rows)} row(s) for '{query or amount or date_from}'"})
        return json.dumps(rows[:40])

    def screen_names() -> str:
        """Screen every person and company named in the case against sanctions and PEP lists (VeriSec yente / OpenSanctions)."""
        return run("screen_names", None, lambda: sanctions.run(case))

    def record_lead(note: str) -> str:
        """Record an investigator note or an open lead you could not close (shown in the report)."""
        with open(case / "findings" / "leads.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps({"note": note}) + "\n")
        emit({"type": "lead", "note": note[:240]})
        return "noted"

    T = lambda f: StructuredTool.from_function(f)  # noqa: E731
    analyst = [T(read_fields), T(pdf_structure), T(pixel_tamper), T(character_forensics), T(content_logic), T(payment_instruments), T(zoom_in), T(vision_second_opinion), T(write_dossier)]
    lead = [T(list_documents), T(reclassify_document), T(build_relationship_graph), T(search_transactions), T(screen_names), T(record_lead)]
    return {"analyst": analyst, "lead": lead}
