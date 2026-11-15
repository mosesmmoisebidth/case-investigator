"""Case Investigator API (FastAPI).

REST for cases, documents, evidence, graph, findings, decisions and workflows,
plus a server-sent event stream of the live investigation. Runs next to the
web app on the bank's own machine; documents never leave it.
"""

from __future__ import annotations

import asyncio
import json
import re
import shutil
import sys
import threading
import time
import uuid
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import pymupdf  # noqa: E402
from fastapi import Body, FastAPI, File, HTTPException, Query, UploadFile  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse  # noqa: E402

from agent import llm  # noqa: E402
from engines import catalog, doctypes, findings, intake, pipeline, resolve, workflow  # noqa: E402
from engines.core import CASES_DIR, audit, case_dir, jsonable, read_json, sha256_file, verify_audit, write_json  # noqa: E402
from engines.registry import ENGINES  # noqa: E402

app = FastAPI(title="VeriSec Case Investigator", version="0.6.0")

from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

# The web app streams live events straight from this API (no proxy buffering).
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3100", "http://127.0.0.1:3100"], allow_methods=["*"], allow_headers=["*"])
RUNNING: dict[str, threading.Thread] = {}
_ID = re.compile(r"^[a-z0-9_-]{3,64}$")


def _case(case_id: str) -> Path:
    if not _ID.match(case_id) or not (CASES_DIR / case_id / "case.json").exists():
        raise HTTPException(404, "case not found")
    return case_dir(case_id)


def _emit_to(case: Path):
    lock = threading.Lock()

    def emit(ev: dict) -> None:
        ev = {"t": round(time.time(), 3), **ev}
        with lock, open(case / "events.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(ev, default=jsonable) + "\n")

    return emit


# ------------------------------------------------------------------ health
@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "model": llm.label() if llm.configured() else "no AI model: deterministic mode", "ai": llm.configured()}


@app.get("/api/engines")
def engines() -> list[dict]:
    return ENGINES


# ------------------------------------------------------------------ cases
def _summary(case: Path) -> dict:
    meta = read_json(case, "case.json", {})
    st = read_json(case, "status.json", {})
    sc = read_json(case, "findings/score.json", {})
    man = read_json(case, "intake/manifest.json", {"documents": []})["documents"]
    dec = read_json(case, "findings/decision.json", None)
    n_inputs = len([p for p in (case / "input").iterdir()]) if (case / "input").exists() else 0
    graph = read_json(case, "graph/graph.json", {}) or {}
    return {
        "links": graph.get("counts"),
        "id": meta.get("id"),
        "type": meta.get("type"),
        "type_label": workflow.load(meta.get("type", "general"))["label"],
        "context": meta.get("context"),
        "applicant": graph.get("applicant") or meta.get("applicant"),
        "created": meta.get("created"),
        "assignee": meta.get("assignee", "You"),
        "state": st.get("state", "created"),
        "phase": st.get("phase"),
        "mode": st.get("mode", "pipeline"),
        "documents": len(man) or n_inputs,
        "risk_level": sc.get("risk_level"),
        "risk_score": sc.get("risk_score"),
        "recommended_outcome": sc.get("recommended_outcome"),
        "final_outcome": (dec or {}).get("final_outcome"),
        "closed_at": (dec or {}).get("signed_at"),
        "locked": bool(dec),
        "findings": st.get("findings"),
    }


@app.get("/api/cases")
def list_cases() -> list[dict]:
    out = []
    if CASES_DIR.exists():
        for d in CASES_DIR.iterdir():
            if (d / "case.json").exists() and not d.name.startswith("test_"):
                out.append(_summary(d))
    out.sort(key=lambda c: c.get("created") or 0, reverse=True)
    return out


@app.post("/api/cases")
def create_case(body: dict = Body(...)) -> dict:
    ctype = body.get("type", "loan")
    if ctype not in [w["id"] for w in workflow.list_workflows()]:
        raise HTTPException(400, "unknown case type")
    cid = body.get("id") or f"case_{time.strftime('%m%d')}_{uuid.uuid4().hex[:6]}"
    if not _ID.match(cid) or (CASES_DIR / cid).exists():
        raise HTTPException(400, "bad or existing case id")
    pipeline.create_case(cid, ctype, body.get("context", ""))
    return _summary(case_dir(cid))


@app.get("/api/cases/{case_id}")
def get_case(case_id: str) -> dict:
    case = _case(case_id)
    s = _summary(case)
    man = read_json(case, "intake/manifest.json", {"documents": []})["documents"]
    F = read_json(case, "findings/verified.json", {"findings": []})["findings"]
    docs = []
    for d in man:
        df = [f for f in F if f.get("doc") == d["doc_id"] and f["status"] != "rejected"]
        worst = max((f["severity"] for f in df), key=findings.SEV_ORDER.index, default=None)
        badge = "fail" if worst in ("critical", "high") else "caution" if worst in ("medium", "low") else "pass"
        dossier = read_json(case, f"evidence/{d['doc_id']}/dossier.json", None)
        docs.append(
            {
                **{k: d[k] for k in ("doc_id", "doc_label", "doc_type", "page_count", "file", "sha256", "kind")},
                **{k: d.get(k) for k in ("catalog_type", "family", "family_label", "classify_conf", "classify_why", "classify_alt", "needs_review", "split_reason")},
                "page_numbers": [p["page"] for p in d["pages"]],
                "thumb": d["pages"][0]["png"] if d["pages"] else None,
                "badge": badge,
                "findings": len(df),
                "verdict": (dossier or {}).get("verdict"),
            }
        )
    return {
        **s,
        "status": read_json(case, "status.json", {}),
        "score": read_json(case, "findings/score.json", {}),
        "documents_detail": docs,
        "inputs": [{"file": p.name, "size": p.stat().st_size, "sha256": sha256_file(p)} for p in sorted((case / "input").iterdir()) if p.is_file()],
        "graph_counts": (read_json(case, "graph/graph.json", {}) or {}).get("counts"),
        "narrative": (case / "report" / "narrative.md").read_text(encoding="utf-8") if (case / "report" / "narrative.md").exists() else None,
        "leads": [json.loads(x) for x in (case / "findings" / "leads.jsonl").read_text(encoding="utf-8").splitlines()] if (case / "findings" / "leads.jsonl").exists() else [],
        "decision": read_json(case, "findings/decision.json", None),
    }


@app.post("/api/cases/{case_id}/documents")
async def upload(case_id: str, files: list[UploadFile] = File(...)) -> dict:
    case = _case(case_id)
    if read_json(case, "findings/decision.json", None):
        raise HTTPException(409, "case is locked")
    out = []
    for f in files:
        name = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(f.filename or "upload").name)[:120]
        dst = case / "input" / name
        with open(dst, "wb") as fh:
            shutil.copyfileobj(f.file, fh)
        pages = 1
        if name.lower().endswith(".pdf"):
            try:
                with pymupdf.open(dst) as d:
                    pages = d.page_count
            except Exception:
                pages = 0
        out.append({"file": name, "sha256": sha256_file(dst), "pages": pages, "size": dst.stat().st_size})
    audit(case, "user:investigator", "upload", [o["file"] for o in out], [o["sha256"][:16] for o in out])
    return {"uploaded": out}


@app.delete("/api/cases/{case_id}/documents/{name}")
def remove_input(case_id: str, name: str) -> dict:
    case = _case(case_id)
    p = case / "input" / Path(name).name
    if p.exists() and read_json(case, "status.json", {}).get("state") in ("created", None):
        p.unlink()
        audit(case, "user:investigator", "remove_upload", name)
    return {"ok": True}


@app.post("/api/cases/{case_id}/investigate")
def investigate(case_id: str, body: dict = Body(default={})) -> dict:
    case = _case(case_id)
    if case_id in RUNNING and RUNNING[case_id].is_alive():
        raise HTTPException(409, "already running")
    if not any((case / "input").iterdir()):
        raise HTTPException(400, "upload documents first")
    for sub in ("intake", "extracted", "evidence", "checks", "findings", "graph", "report", "pages"):
        shutil.rmtree(case / sub, ignore_errors=True)
        (case / sub).mkdir(exist_ok=True)
    (case / "events.jsonl").write_text("", encoding="utf-8")
    emit = _emit_to(case)
    use_trufor = bool(body.get("trufor", True))
    mode = body.get("mode", "agent")

    def work():
        try:
            if mode == "agent":
                from agent import run as agent_run

                agent_run.investigate(case_id, emit, use_trufor=use_trufor)
            else:
                pipeline.investigate(case_id, emit, use_trufor=use_trufor)
        except Exception as e:  # noqa: BLE001
            emit({"type": "error", "error": str(e)[:400]})
            pipeline.set_status(case, state="error", error=str(e)[:400])

    pipeline.set_status(case, state="running", phase="intake", started=time.time())
    t = threading.Thread(target=work, daemon=True)
    RUNNING[case_id] = t
    t.start()
    return {"started": True, "mode": mode if llm.configured() or mode != "agent" else "pipeline"}


@app.get("/api/cases/{case_id}/events")
async def events(case_id: str, since: int = 0):
    case = _case(case_id)
    path = case / "events.jsonl"

    async def gen():
        pos, idle = 0, 0
        line_no = 0
        while True:
            if path.exists():
                with open(path, encoding="utf-8") as f:
                    f.seek(pos)
                    chunk = f.read()
                    pos = f.tell()
                for line in chunk.splitlines():
                    if not line.strip():
                        continue
                    line_no += 1
                    if line_no <= since:
                        continue
                    yield f"id: {line_no}\ndata: {line}\n\n"
                    if '"type": "done"' in line or '"type": "error"' in line:
                        return
                idle = 0 if chunk else idle + 1
            st = read_json(case, "status.json", {}).get("state")
            if st in ("done", "error") and idle > 4:
                return
            if idle > 2400:  # 20 minutes of silence
                return
            yield ": keep-alive\n\n" if idle % 30 == 29 else ""
            await asyncio.sleep(0.5)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/cases/{case_id}/events/all")
def events_all(case_id: str) -> list[dict]:
    case = _case(case_id)
    p = case / "events.jsonl"
    return [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()] if p.exists() else []


# ------------------------------------------------------------------ documents and evidence
@app.get("/api/cases/{case_id}/documents/{doc_id}")
def document(case_id: str, doc_id: str) -> dict:
    case = _case(case_id)
    man = read_json(case, "intake/manifest.json", {"documents": []})["documents"]
    meta = next((d for d in man if d["doc_id"] == doc_id), None)
    if not meta:
        raise HTTPException(404, "document not found")
    text = read_json(case, f"intake/text/{doc_id}.json", {"pages": []})
    F = [f for f in read_json(case, "findings/verified.json", {"findings": []})["findings"] if f.get("doc") == doc_id]
    layers = {}
    for p in meta["pages"]:
        n = p["page"]
        layers[n] = {k: f"evidence/{doc_id}/{fn}" for k, fn in (("heatmap", f"heatmap_p{n}.png"), ("chars", f"chars_p{n}.png"), ("ela", f"layer_ela_p{n}.png"), ("noise", f"layer_noise_p{n}.png"), ("trufor", f"layer_trufor_p{n}.png")) if (case / "evidence" / doc_id / fn).exists()}
    return {
        "meta": meta,
        "extracted": read_json(case, f"extracted/{doc_id}.json", {}),
        "words": {p["page"]: p.get("words", []) for p in text["pages"]},
        "pdf_structure": read_json(case, f"evidence/{doc_id}/pdf_structure.json", None),
        "pixel": read_json(case, f"evidence/{doc_id}/pixel.json", None),
        "chars": read_json(case, f"evidence/{doc_id}/chars.json", None),
        "logic": read_json(case, f"checks/logic_{doc_id}.json", None),
        "payments": read_json(case, f"checks/payments_{doc_id}.json", None),
        "dossier": read_json(case, f"evidence/{doc_id}/dossier.json", None),
        "layers": layers,
        "findings": F,
    }


@app.get("/api/cases/{case_id}/file")
def case_file(case_id: str, path: str = Query(...)):
    case = _case(case_id)
    p = (case / path).resolve()
    if not str(p).startswith(str(case.resolve())) or not p.is_file():
        raise HTTPException(404, "file not found")
    return FileResponse(p)


# ------------------------------------------------------------------ graph, matrix, timeline
@app.get("/api/cases/{case_id}/graph")
def get_graph(case_id: str) -> dict:
    return read_json(_case(case_id), "graph/graph.json", {"nodes": [], "edges": [], "counts": {}})


@app.get("/api/cases/{case_id}/blueprint")
def get_blueprint(case_id: str) -> dict:
    return read_json(_case(case_id), "checks/blueprint.json", {"rules": []})


@app.get("/api/cases/{case_id}/consistency")
def consistency(case_id: str) -> dict:
    """Rows: name, date of birth, address, employer, bank, account, net pay / income. Columns: documents."""
    case = _case(case_id)
    man = read_json(case, "intake/manifest.json", {"documents": []})["documents"]
    rows_def = [("Name", ("person",), "name"), ("Date of birth", ("dob",), "exact"), ("Address", ("address",), "address"), ("Employer", ("employer",), "org"), ("Bank", ("bank",), "org"), ("Account", ("account",), "account"), ("Pay / income", ("net_pay", "annual_income"), "none")]
    cols = [{"doc_id": d["doc_id"], "label": d["doc_label"], "file": d["file"]} for d in man]
    rows = []
    for label, roles, cmp in rows_def:
        cells = {}
        for d in man:
            ex = read_json(case, f"extracted/{d['doc_id']}.json", {"fields": {}})
            hit = next(((k, f) for k, f in ex["fields"].items() if f.get("role") in roles), None)
            if hit:
                k, f = hit
                cells[d["doc_id"]] = {"value": f["value"], "field": k, "page": f.get("page"), "bbox": f.get("bbox")}
        vals = [str(c["value"]) for c in cells.values()]
        ref = Counter(vals).most_common(1)[0][0] if vals else None
        for c in cells.values():
            v = str(c["value"])
            if cmp == "name":
                ok = resolve.same_person(ref, v)[0]
            elif cmp == "address":
                ok = resolve.same_address(ref, v)[0]
            elif cmp == "org":
                ok = resolve.same_org(ref, v)[0]
            elif cmp == "account":
                ok = resolve.last4(ref) == resolve.last4(v)
            elif cmp == "exact":
                ok = v == ref
            else:
                ok = None
            c["state"] = "info" if ok is None else ("match" if ok else "mismatch")
        rows.append({"label": label, "reference": ref, "cells": cells})
    return {"columns": cols, "rows": rows}


@app.get("/api/cases/{case_id}/timeline")
def get_timeline(case_id: str) -> dict:
    return read_json(_case(case_id), "timeline.json", {"events": []})


# ------------------------------------------------------------------ findings, review, decision
@app.get("/api/cases/{case_id}/findings")
def get_findings(case_id: str) -> dict:
    case = _case(case_id)
    return {**read_json(case, "findings/verified.json", {"findings": []}), "score": read_json(case, "findings/score.json", {})}


@app.patch("/api/cases/{case_id}/findings/{fid}")
def review(case_id: str, fid: str, body: dict = Body(...)) -> dict:
    case = _case(case_id)
    if read_json(case, "findings/decision.json", None):
        raise HTTPException(409, "case is locked")
    if body.get("decision") not in ("accept", "reject"):
        raise HTTPException(400, "decision must be accept or reject")
    if body["decision"] == "reject" and not (body.get("reason") or "").strip():
        raise HTTPException(400, "a reason is required to reject a finding")
    try:
        f = findings.apply_review(case, fid, body["decision"], body.get("reason", ""), body.get("reviewer", "investigator"), body.get("true_match"))
    except KeyError:
        raise HTTPException(404, "finding not found") from None
    meta = read_json(case, "case.json", {})
    sc = findings.score(case, meta.get("type", "general"))
    return {"finding": f, "score": sc}


@app.post("/api/cases/{case_id}/ask")
def ask(case_id: str, body: dict = Body(...)) -> dict:
    _case(case_id)
    q = (body.get("question") or "").strip()
    if not q:
        raise HTTPException(400, "question required")
    from agent import run as agent_run

    return agent_run.ask(case_id, q[:600])


OUTCOMES = ["Escalate to compliance", "Decline: suspected fraud", "Refer to senior investigator", "Request more documents", "Clear", "Incomplete"]


@app.post("/api/cases/{case_id}/decision")
def decide(case_id: str, body: dict = Body(...)) -> dict:
    case = _case(case_id)
    if read_json(case, "findings/decision.json", None):
        raise HTTPException(409, "case already decided")
    sc = read_json(case, "findings/score.json", {})
    out = body.get("outcome")
    if out not in OUTCOMES:
        raise HTTPException(400, "unknown outcome")
    override = out != sc.get("recommended_outcome")
    if override and not (body.get("rationale") or "").strip():
        raise HTTPException(400, "a rationale is required when overriding the recommendation")
    dec = {"recommended_outcome": sc.get("recommended_outcome"), "rules_fired": sc.get("rules_fired"), "final_outcome": out, "rationale": body.get("rationale", ""), "override": override, "signed_by": body.get("signed_by", "Investigator"), "signed_at": time.time()}
    write_json(case, "findings/decision.json", dec)
    audit(case, f"user:{dec['signed_by']}", "decision", out, {"override": override})
    pipeline.set_status(case, state="closed")
    return dec


@app.get("/api/cases/{case_id}/audit")
def get_audit(case_id: str) -> dict:
    case = _case(case_id)
    p = case / "audit.log"
    evs = [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()] if p.exists() else []
    return {"intact": verify_audit(case), "events": evs}


@app.get("/api/cases/{case_id}/report.json")
def report_json(case_id: str):
    case = _case(case_id)
    return JSONResponse({
        "case": _summary(case),
        "decision": read_json(case, "findings/decision.json", None),
        "score": read_json(case, "findings/score.json", {}),
        "findings": [f for f in read_json(case, "findings/verified.json", {"findings": []})["findings"] if f["status"] != "rejected"],
        "blueprint": read_json(case, "checks/blueprint.json", {}),
        "timeline": read_json(case, "timeline.json", {}),
        "graph_counts": (read_json(case, "graph/graph.json", {}) or {}).get("counts"),
        "audit_intact": verify_audit(case),
    })


# ------------------------------------------------------------------ document catalog
@app.get("/api/catalog")
def document_catalog() -> dict:
    """Every document type the sorter recognises, grouped by family."""
    return catalog.public()


@app.patch("/api/cases/{case_id}/documents/{doc_id}/type")
def set_document_type(case_id: str, doc_id: str, body: dict = Body(...)) -> dict:
    """The investigator corrects a document's type. Kept on re-runs; re-run the investigation to re-check it."""
    case = _case(case_id)
    if _summary(case).get("locked"):
        raise HTTPException(409, "the case is closed")
    try:
        d = intake.reclassify(case, doc_id, str(body.get("catalog_type", "")), str(body.get("reason", "")).strip(), str(body.get("by") or "investigator"))
    except KeyError:
        raise HTTPException(404, "document not found") from None
    except ValueError as e:
        raise HTTPException(400, str(e)) from None
    return {"document": d, "note": "Re-run the investigation to check this document as its new type."}


# ------------------------------------------------------------------ workflows
@app.get("/api/workflows")
def workflows() -> list[dict]:
    return workflow.list_workflows()


@app.get("/api/workflows/catalog")
def wf_catalog() -> dict:
    return {
        "rules": [{"id": k, **v} for k, v in workflow.RULE_CATALOG.items()],
        "steps": [{"id": e["id"], "label": e["name"], "code": e["code"]} for e in ENGINES if e["id"] in workflow.STEP_CATALOG] + [{"id": "verify", "label": "Verify findings", "code": "VF"}],
        "doc_types": [{"id": k, "label": v["label"], "family": v.get("family")} for k, v in doctypes.packs().items()],
        "severities": workflow.SEVERITIES,
    }


@app.get("/api/workflows/{wf_id}")
def get_workflow(wf_id: str) -> dict:
    if wf_id not in [w["id"] for w in workflow.list_workflows()]:
        raise HTTPException(404, "workflow not found")
    return workflow.load(wf_id)


@app.put("/api/workflows/{wf_id}")
def put_workflow(wf_id: str, body: dict = Body(...)) -> dict:
    body["id"] = wf_id
    try:
        return workflow.save(body)
    except ValueError as e:
        raise HTTPException(400, str(e)) from None


@app.post("/api/workflows")
def new_workflow(body: dict = Body(...)) -> dict:
    base = workflow.load(body.get("from", "general"))
    wid = re.sub(r"[^a-z0-9_]+", "_", (body.get("id") or body.get("label", "custom")).lower()).strip("_")[:40] or "custom"
    if wid in [w["id"] for w in workflow.list_workflows()]:
        raise HTTPException(400, "a workflow with this id exists")
    base.update({"id": wid, "label": body.get("label") or wid.replace("_", " ").title(), "description": body.get("description", base.get("description", ""))})
    try:
        return workflow.save(base)
    except ValueError as e:
        raise HTTPException(400, str(e)) from None


# ------------------------------------------------------------------ report
from fastapi.responses import HTMLResponse  # noqa: E402

from engines import report as report_engine  # noqa: E402


@app.get("/api/cases/{case_id}/report.html", response_class=HTMLResponse)
def report_html(case_id: str):
    return HTMLResponse(report_engine.build_html(_case(case_id)))


@app.get("/api/cases/{case_id}/report.pdf")
def report_pdf(case_id: str):
    case = _case(case_id)
    p = report_engine.build_pdf(case)
    audit(case, "user:investigator", "report_pdf", case_id)
    return FileResponse(p, media_type="application/pdf", filename=f"{case_id}_report.pdf")
