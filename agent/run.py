"""Run the deep agent on a case and stream what it does.

The lead investigator plans with write_todos, delegates one task per document
to document-analyst sub-agents (parallel), builds the relationship graph,
follows up on red and amber links, screens names and writes a narrative.
Afterwards code closes the loop: any planned pass the agent skipped is run,
the verifier drops findings without evidence, and the case is scored. With no
model configured, the deterministic pipeline runs instead.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Callable

from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend

from agent import llm, prompts
from agent.tools import make_tools
from engines import findings, graph, intake, pipeline, sanctions, workflow
from engines.core import audit, case_dir, read_json

Emit = Callable[[dict], None]


def _documents_line(case: Path) -> str:
    m = read_json(case, "intake/manifest.json", {"documents": []})["documents"]
    return ", ".join(f"{d['doc_id']} ({d['doc_label']}, {d['page_count']} page{'s' if d['page_count'] > 1 else ''})" for d in m)


def build_agent(case: Path, case_type: str, context: str, flags_sink: list, emit: Emit, use_trufor: bool = True):
    model = llm.chat()
    tools = make_tools(case, case_type, context, flags_sink, emit, use_trufor=use_trufor, vision=model)
    analyst = {
        "name": "document-analyst",
        "description": "Examines ONE document deeply: fields, PDF structure, pixel and character forensics, content logic, payment instruments, zoom-in loop, then writes the document dossier. Give it the doc_id and the document type.",
        "system_prompt": prompts.ANALYST,
        "tools": tools["analyst"],
    }
    sp = prompts.LEAD.format(case_type=case_type, context=context or "none", documents=_documents_line(case))
    return create_deep_agent(
        model=model,
        tools=tools["lead"],
        system_prompt=sp,
        subagents=[analyst],
        backend=FilesystemBackend(root_dir=str(case / "agent_fs"), virtual_mode=True),
        name="lead-investigator",
    )


def _emit_update(ns, upd, emit: Emit) -> None:
    who = "lead" if not ns else "document-analyst"
    if not isinstance(upd, dict):
        return
    for node, delta in upd.items():
        if not isinstance(delta, dict):
            continue
        if "todos" in delta and delta["todos"]:
            emit({"type": "plan", "todos": [{"content": t.get("content"), "status": t.get("status")} for t in delta["todos"]]})
        for m in delta.get("messages", []) or []:
            tcs = getattr(m, "tool_calls", None) or []
            for tc in tcs:
                if tc["name"] == "task":
                    emit({"type": "delegate", "subagent": tc["args"].get("subagent_type"), "task": str(tc["args"].get("description", ""))[:240]})
                elif tc["name"] not in ("write_todos",):
                    emit({"type": "agent_call", "who": who, "tool": tc["name"], "args": {k: v for k, v in tc["args"].items() if k != "content"}})
            if m.__class__.__name__ == "AIMessage" and not tcs:
                txt = m.content if isinstance(m.content, str) else " ".join(c.get("text", "") for c in m.content if isinstance(c, dict))
                if txt.strip():
                    emit({"type": "agent_message", "who": who, "text": txt[:1200]})


def investigate(case_id: str, emit: Emit, use_trufor: bool = True) -> dict:
    case = case_dir(case_id)
    meta = pipeline.case_meta(case)
    case_type, context = meta.get("type", "general"), meta.get("context", "")
    if not llm.configured():
        emit({"type": "phase", "phase": "fallback", "label": "No AI model configured: running the deterministic investigation"})
        return pipeline.investigate(case_id, emit, use_trufor=use_trufor)

    ctx = graph.parse_context(context)
    pipeline.set_status(case, state="running", phase="intake", started=time.time(), context=ctx, failed_steps=[], mode="agent", model=llm.label())
    emit({"type": "phase", "phase": "intake", "label": "Intake and classification"})
    r = intake.intake(case)
    flags: list[dict] = list(r.get("flags", []))
    emit({"type": "intake_done", "documents": [{k: d[k] for k in ("doc_id", "doc_label", "doc_type", "page_count", "file")} for d in r["documents"]], "summary": r["summary"]})

    pipeline.set_status(case, phase="agent")
    emit({"type": "phase", "phase": "agent", "label": "Lead investigator is planning"})
    agent = build_agent(case, case_type, context, flags, emit, use_trufor)
    narrative = ""
    try:
        final_state = None
        for ns, upd in agent.stream({"messages": [{"role": "user", "content": "Investigate this case now."}]}, stream_mode="updates", subgraphs=True, config={"recursion_limit": 300}):
            _emit_update(ns, upd, emit)
            final_state = upd
        if final_state:
            for delta in final_state.values():
                if isinstance(delta, dict):
                    for m in delta.get("messages", []) or []:
                        if m.__class__.__name__ == "AIMessage" and isinstance(m.content, str) and m.content.strip():
                            narrative = m.content
    except Exception as e:  # noqa: BLE001
        emit({"type": "agent_error", "error": str(e)[:400]})
        audit(case, "agent:lead", "error", case_id, str(e)[:500])

    # close the loop in code: every planned pass for every document, the graph and screening
    pipeline.set_status(case, phase="completeness")
    emit({"type": "phase", "phase": "completeness", "label": "Checking every planned pass ran"})
    wf = workflow.load(case_type)
    failed: list[str] = []
    for d in r["documents"]:
        did = d["doc_id"]
        needed = {
            "extract": (case / f"extracted/{did}.json").exists(),
            "pdf_forensics": (case / f"evidence/{did}/pdf_structure.json").exists(),
            "pixel_forensics": (case / f"evidence/{did}/pixel.json").exists(),
            "char_forensics": (case / f"evidence/{did}/chars.json").exists(),
            "logic": (case / f"checks/logic_{did}.json").exists(),
            "payments": (case / f"checks/payments_{did}.json").exists(),
        }
        if not all(needed.values()):
            emit({"type": "backfill", "doc": did, "engines": [k for k, v in needed.items() if not v]})
            fl, fa = pipeline.analyse_one(case, wf, did, ctx["application_date"], use_trufor, emit)
            flags += [f for f in fl if f not in flags]
            failed += fa
    if not (case / "graph/graph.json").exists():
        flags += graph.build(case, case_type, context)["flags"]
    if not (case / "checks/sanctions.json").exists():
        flags += sanctions.run(case)["flags"]
    # dedupe signals (an engine may have been re-run)
    seen, uniq = set(), []
    for f in flags:
        k = (f["check"], f.get("doc"), f["claim"])
        if k not in seen:
            seen.add(k)
            uniq.append(f)
    pipeline.write_draft(case, uniq)
    pipeline.set_status(case, phase="verify", failed_steps=failed)
    emit({"type": "phase", "phase": "verify", "label": "Verifier is checking every finding has proof"})
    F = findings.verify(case, uniq)
    sc = findings.score(case, case_type)
    findings.timeline(case)
    if narrative:
        (case / "report").mkdir(exist_ok=True)
        (case / "report" / "narrative.md").write_text(narrative, encoding="utf-8")
    pipeline.set_status(case, state="done", phase="done", finished=time.time(), findings=sum(1 for f in F if f["status"] != "lead"), risk=sc["risk_level"], outcome=sc["recommended_outcome"])
    emit({"type": "done", "findings": len(F), "risk_level": sc["risk_level"], "recommended_outcome": sc["recommended_outcome"]})
    return {"findings": F, "score": sc, "narrative": narrative}


def ask(case_id: str, question: str) -> dict:
    """Answer a follow-up question about the case from its files."""
    case = case_dir(case_id)
    ctx = {
        "findings": read_json(case, "findings/verified.json", {"findings": []})["findings"][:25],
        "score": read_json(case, "findings/score.json", {}),
        "blueprint": read_json(case, "checks/blueprint.json", {}),
        "graph_open_links": [e for e in read_json(case, "graph/graph.json", {"edges": []})["edges"] if e["state"] != "verified" and e.get("rule")][:30],
    }
    if not llm.configured():
        return {"answer": "No AI model is configured, so follow-up questions are off. Every finding and link is still in the case files.", "sources": []}
    from langchain_core.messages import HumanMessage, SystemMessage

    msg = [SystemMessage(prompts.ASK), HumanMessage(f"Case files (JSON):\n{json.dumps(ctx, default=str)[:30000]}\n\nQuestion: {question}")]
    ans = llm.chat().invoke(msg).content
    ans = ans if isinstance(ans, str) else json.dumps(ans)
    with open(case / "findings" / "questions.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps({"q": question, "a": ans}) + "\n")
    audit(case, "agent:ask", "answer", question, ans[:300])
    return {"answer": ans}

