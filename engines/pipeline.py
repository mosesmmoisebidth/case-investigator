"""Deterministic investigation pipeline.

Runs the workflow's steps in order over a case folder and emits progress
events. The deep agent drives the same engines as tools (and adds follow-ups);
this pipeline is also the safety net that produces a complete, evidenced case
with no AI at all.
"""

from __future__ import annotations

import json
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

from . import char_forensics, findings, graph, intake, logic, payments, pdf_forensics, pixel_forensics, sanctions, workflow
from .core import audit, case_dir, read_json, write_json

Emit = Callable[[dict], None]


def _noop(_: dict) -> None:
    pass


def case_meta(case: Path) -> dict:
    return read_json(case, "case.json", {})


def set_status(case: Path, **kw) -> dict:
    st = read_json(case, "status.json", {})
    st.update(kw)
    st["updated"] = time.time()
    write_json(case, "status.json", st)
    return st


def write_draft(case: Path, flags: list[dict]) -> None:
    with open(case / "findings" / "draft.jsonl", "w", encoding="utf-8") as f:
        for x in flags:
            f.write(json.dumps(x, default=str) + "\n")


def analyse_one(case: Path, wf: dict, doc_id: str, app_date: str, use_trufor: bool, emit: Emit) -> tuple[list[dict], list[str]]:
    flags, failed = [], []
    steps = [
        ("extract", lambda: intake.extract(case, doc_id)),
        ("pdf_forensics", lambda: pdf_forensics.run(case, doc_id)),
        ("pixel_forensics", lambda: pixel_forensics.run(case, doc_id, use_trufor=use_trufor)),
        ("char_forensics", lambda: char_forensics.run(case, doc_id)),
        ("logic", lambda: logic.run(case, doc_id, app_date)),
        ("payments", lambda: payments.run(case, doc_id)),
    ]
    for name, fn in steps:
        if not workflow.step_enabled(wf, name):
            continue
        emit({"type": "engine_start", "doc": doc_id, "engine": name})
        t = time.time()
        try:
            r = fn()
            flags += r.get("flags", [])
            emit({"type": "engine_done", "doc": doc_id, "engine": name, "summary": r["summary"], "flags": len(r.get("flags", [])), "ms": int((time.time() - t) * 1000), "evidence": r.get("evidence", [])[:4]})
            for f in r.get("flags", []):
                emit({"type": "draft_finding", "doc": doc_id, "engine": name, "severity": f["severity"], "claim": f["claim"]})
        except Exception as e:  # noqa: BLE001
            failed.append(f"{name}:{doc_id}")
            emit({"type": "engine_error", "doc": doc_id, "engine": name, "error": str(e)[:300]})
            audit(case, f"engine:{name}", "error", doc_id, traceback.format_exc()[-600:])
    return flags, failed


def investigate(case_id: str, emit: Emit = _noop, use_trufor: bool = True) -> dict:
    case = case_dir(case_id)
    meta = case_meta(case)
    case_type, context = meta.get("type", "general"), meta.get("context", "")
    wf = workflow.load(case_type)
    ctx = graph.parse_context(context)
    set_status(case, state="running", phase="intake", started=time.time(), context=ctx, failed_steps=[])
    emit({"type": "phase", "phase": "intake", "label": "Intake and classification"})
    r = intake.intake(case)
    docs = r["documents"]
    all_flags = list(r.get("flags", []))
    emit({"type": "intake_done", "documents": [{k: d[k] for k in ("doc_id", "doc_label", "doc_type", "page_count", "file")} for d in docs], "summary": r["summary"]})

    set_status(case, phase="documents")
    emit({"type": "phase", "phase": "documents", "label": f"Deep analysis of {len(docs)} documents"})
    failed: list[str] = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = {pool.submit(analyse_one, case, wf, d["doc_id"], ctx["application_date"], use_trufor, emit): d["doc_id"] for d in docs}
        for fut in futs:
            fl, fa = fut.result()
            all_flags += fl
            failed += fa
            emit({"type": "document_done", "doc": futs[fut]})

    if workflow.step_enabled(wf, "graph"):
        set_status(case, phase="graph")
        emit({"type": "phase", "phase": "graph", "label": "Building the relationship graph"})
        g = graph.build(case, case_type, context)
        all_flags += g["flags"]
        emit({"type": "graph_done", "summary": g["summary"], "counts": g["counts"]})
    if workflow.step_enabled(wf, "sanctions"):
        set_status(case, phase="screening")
        emit({"type": "phase", "phase": "screening", "label": "Sanctions and PEP screening"})
        s = sanctions.run(case)
        all_flags += s["flags"]
        emit({"type": "engine_done", "engine": "sanctions", "summary": s["summary"], "flags": len(s["flags"])})

    write_draft(case, all_flags)
    set_status(case, phase="verify", failed_steps=failed)
    emit({"type": "phase", "phase": "verify", "label": "Verifying findings"})
    F = findings.verify(case, all_flags)
    sc = findings.score(case, case_type)
    findings.timeline(case)
    set_status(case, state="done", phase="done", finished=time.time(), findings=len(F), risk=sc["risk_level"], outcome=sc["recommended_outcome"])
    emit({"type": "done", "findings": len(F), "risk_level": sc["risk_level"], "recommended_outcome": sc["recommended_outcome"]})
    audit(case, "pipeline", "investigate_done", case_id, {"findings": len(F), "risk": sc["risk_level"]})
    return {"documents": len(docs), "findings": F, "score": sc}


def create_case(case_id: str, case_type: str, context: str, files: list[Path] | None = None) -> Path:
    case = case_dir(case_id)
    write_json(case, "case.json", {"id": case_id, "type": case_type, "context": context, "created": time.time(), "applicant": graph.parse_context(context).get("applicant")})
    set_status(case, state="created", phase="created")
    if files:
        intake.add_files(case, files)
    audit(case, "user:investigator", "create_case", {"type": case_type, "context": context})
    return case
