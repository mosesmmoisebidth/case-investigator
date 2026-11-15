"""Verifier (critic), risk and recommended outcome, timeline.

Signals from every engine become findings. The verifier drops any signal whose
evidence file does not exist, merges signals that point at the same field or
region (so "pixel ensemble + PDF revision + pay stub maths" is ONE finding with
three agreeing layers), sets confidence by the rules below, and scores the case.

Confidence: high = a deterministic check failed, or 2+ independent layers agree;
medium = one model-based layer, nothing contradicting; low = weak signal (shown
as a lead, not a finding). The AI flags, the human decides.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from . import workflow
from .core import audit, read_json, write_json

CATEGORY = {
    "graph_same_person": "identity", "graph_dob_consistent": "identity", "graph_id_valid": "identity", "mrz_check_digits": "identity", "mrz_vs_printed": "identity", "id_not_expired": "identity",
    "graph_current_address": "relationship", "graph_cheque_account": "relationship", "graph_employer_pays_account": "relationship", "graph_pay_to_deposit": "relationship", "graph_statement_chain": "relationship", "graph_invoice_paid": "relationship",
    "graph_income_consistency": "financial", "graph_required_documents": "completeness", "graph_recency": "completeness",
    "aba_routing": "payment instrument", "routing_vs_bank": "payment instrument", "routing_district": "payment instrument", "bin_vs_bank": "payment instrument", "luhn": "payment instrument", "amount_words_vs_figures": "payment instrument",
    "sanctions_match": "screening",
}
DECISION_FIELDS = {"net_pay", "gross_pay", "closing_balance", "opening_balance", "total_deposits", "amount", "full_name", "account_number", "routing_number", "date_of_birth", "wages", "salary"}
SEV_ORDER = ["info", "low", "medium", "high", "critical"]


def _category(check: str) -> str:
    if check in CATEGORY:
        return CATEGORY[check]
    if check.startswith(("pdf_", "pixel_", "char_", "copy_move")) or check in ("paystub_math", "running_balance", "statement_totals_balance", "statement_total_deposits", "statement_total_withdrawals", "fica_social_security", "fica_medicare", "invoice_math", "paystub_deduction_total"):
        return "document integrity"
    if check.startswith("future_date") or check == "pay_date_business_day":
        return "document integrity"
    return "other"


def _overlap(a, b) -> bool:
    if not a or not b:
        return False
    return not (a[2] < b[0] - 8 or b[2] < a[0] - 8 or a[3] < b[1] - 8 or b[3] < a[1] - 8)


def _bump(sev: str, n: int = 1) -> str:
    return SEV_ORDER[min(len(SEV_ORDER) - 1, SEV_ORDER.index(sev) + n)]


def verify(case: Path, flags: list[dict]) -> list[dict]:
    kept = [f for f in flags if f.get("evidence") and all((case / p).exists() for p in f["evidence"])]
    dropped = len(flags) - len(kept)
    groups: list[list[dict]] = []
    for f in kept:
        placed = False
        mergeable = ("pdf", "pixel", "char", "logic", "relationship")
        if f["layer"] in mergeable and not (f["layer"] == "relationship" and not f.get("field")):
            for g in groups:
                g0 = g[0]
                same_field = bool(f.get("field")) and any(f.get("field") == x.get("field") and x.get("doc") == f.get("doc") for x in g)
                same_region = f["layer"] != "relationship" and any(x["layer"] != "relationship" and x.get("doc") == f.get("doc") and x.get("page") == f.get("page") and _overlap(f.get("bbox"), x.get("bbox")) for x in g)
                if g0["layer"] in mergeable and (same_field or same_region):
                    g.append(f)
                    placed = True
                    break
        if not placed:
            groups.append([f])
    # document-level PDF signals (re-saved, editor producer) support that document's
    # strongest integrity finding instead of standing alone
    doc_level = [g for g in groups if len(g) == 1 and g[0]["layer"] == "pdf" and not g[0].get("bbox")]
    for g in doc_level:
        f = g[0]
        hosts = [h for h in groups if h is not g and any(x.get("doc") == f.get("doc") and x["layer"] in ("logic", "pixel", "char") and SEV_ORDER.index(x["severity"]) >= SEV_ORDER.index("high") for x in h)]
        if hosts:
            # the strongest host: a deterministic content check first, then severity, then layers
            best = max(hosts, key=lambda h: (any(x["deterministic"] and x["layer"] in ("logic", "relationship") for x in h), max(SEV_ORDER.index(x["severity"]) for x in h), len({x["layer"] for x in h})))
            best.append(f)
            groups.remove(g)
    findings = []
    for i, g in enumerate(groups, start=1):
        lead = sorted(g, key=lambda x: (x["deterministic"], SEV_ORDER.index(x["severity"])), reverse=True)[0]
        layers = sorted({x["layer"] for x in g})
        deterministic = any(x["deterministic"] for x in g)
        sev = max((x["severity"] for x in g), key=SEV_ORDER.index)
        if len(layers) >= 2:
            conf = "high"
            fld = next((x.get("field") for x in g if x.get("field")), None)
            if len(layers) >= 3 and fld in DECISION_FIELDS:
                sev = "critical"
            elif len(layers) >= 2:
                sev = _bump(sev) if sev in ("medium", "high") else sev
        elif deterministic:
            conf = "high"
        elif lead["layer"] in ("pixel", "char"):
            conf = "low"  # one model-based layer alone is a lead, not a finding
        else:
            conf = "medium"
        claim = lead["claim"]
        if len(g) > 1 and lead.get("field"):
            fname = lead["field"].replace("_", " ")
            claim = f"{fname[:1].upper() + fname[1:]} on {lead['doc']} was edited"
        findings.append(
            {
                "id": f"F{i:03d}",
                "claim": claim,
                "detail": [x["claim"] for x in g],
                "category": _category(lead["check"]),
                "checks": sorted({x["check"] for x in g}),
                "layers": layers,
                "agreeing": len(layers),
                "doc": lead.get("doc"),
                "field": lead.get("field"),
                "page": lead.get("page"),
                "bbox": lead.get("bbox"),
                "evidence": sorted({p for x in g for p in x["evidence"]}),
                "values": lead.get("values"),
                "deterministic": deterministic,
                "confidence": conf,
                "severity": sev,
                "status": "verified" if conf != "low" else "lead",
                "review": None,
            }
        )
    findings.sort(key=lambda f: (SEV_ORDER.index(f["severity"]), f["confidence"] == "high"), reverse=True)
    for i, f in enumerate(findings, start=1):
        f["id"] = f"F{i:03d}"
    write_json(case, "findings/verified.json", {"findings": findings, "dropped_without_evidence": dropped})
    audit(case, "agent:verifier", "verify", len(flags), {"findings": len(findings), "dropped": dropped})
    return findings


def score(case: Path, case_type: str) -> dict:
    wf = workflow.load(case_type)
    weights = wf.get("scoring", {}).get("weights", {"critical": 40, "high": 20, "medium": 8, "low": 2, "info": 0})
    levels = wf.get("scoring", {}).get("levels", {"medium": 10, "high": 30, "critical": 60})
    F = read_json(case, "findings/verified.json", {"findings": []})["findings"]
    counted = []
    for f in F:
        st = f.get("status")
        if st == "accepted" or (st == "verified" and f["confidence"] in ("medium", "high")):
            counted.append(f)
    risk = sum(weights.get(f["severity"], 0) for f in counted)
    level = "Critical" if risk >= levels["critical"] else "High" if risk >= levels["high"] else "Medium" if risk >= levels["medium"] else "Low"
    bp = read_json(case, "checks/blueprint.json", {"rules": []})["rules"]
    st = read_json(case, "status.json", {})
    failed_checks = st.get("failed_steps", [])
    rules_fired = []
    accepted = [f for f in F if f.get("status") == "accepted"]
    if any(f["category"] == "screening" and (f.get("review") or {}).get("true_match") for f in accepted):
        outcome = "Escalate to compliance"
        rules_fired.append("a confirmed sanctions match is a hard stop")
    elif any(f["severity"] == "critical" and (f.get("field") in DECISION_FIELDS or f["category"] in ("identity", "financial", "relationship")) for f in counted) or level == "Critical":
        outcome = "Decline: suspected fraud"
        rules_fired.append("a critical finding on a decision-relevant field" if level != "Critical" else "risk level Critical")
    elif level == "High":
        outcome = "Refer to senior investigator"
        rules_fired.append("risk level High")
    elif level == "Medium":
        outcome = "Request more documents"
        rules_fired.append("risk level Medium")
    elif failed_checks:
        outcome = "Incomplete"
        rules_fired.append("a check failed to run: " + ", ".join(failed_checks))
    elif all(r["status"] == "verified" for r in bp if r["severity"] in ("critical", "high")) and not any(r["status"] == "unverifiable" for r in bp):
        outcome = "Clear"
        rules_fired.append("risk Low, every check ran, every required link verified")
    else:
        outcome = "Request more documents"
        rules_fired.append("some required links could not be verified")
    requests = []
    for r in bp:
        if r["status"] in ("missing", "unverifiable"):
            requests.append(f"{r['label']}: {r['detail']}")
    out = {
        "risk_score": risk,
        "risk_level": level,
        "recommended_outcome": outcome,
        "rules_fired": rules_fired,
        "counted_findings": [f["id"] for f in counted],
        "document_requests": requests,
        "by_severity": {s: sum(1 for f in F if f["severity"] == s and f["status"] != "rejected") for s in reversed(SEV_ORDER)},
    }
    write_json(case, "findings/score.json", out)
    return out


def timeline(case: Path) -> list[dict]:
    ev = []
    for p in sorted((case / "extracted").glob("*.json")):
        ex = json.loads(p.read_text(encoding="utf-8"))
        did = ex["doc_id"]
        for k, f in ex["fields"].items():
            if f.get("type") == "date" and f.get("value"):
                ev.append({"date": f["value"], "kind": "document", "label": f"{ex['doc_label']}: {k.replace('_', ' ')}", "doc": did, "field": k, "page": f.get("page"), "bbox": f.get("bbox")})
        for t in ex.get("transactions") or []:
            if t["direction"] == "in":
                ev.append({"date": t["date"], "kind": "deposit", "label": f"Deposit {t['amount']:,.2f}: {t['description'][:40]}", "doc": did, "page": t["page"], "bbox": t["bbox"]})
        ps = read_json(case, f"evidence/{did}/pdf_structure.json", {})
        if ps.get("applicable"):
            if ps.get("created"):
                ev.append({"date": ps["created"][:10], "kind": "file", "label": f"{did} PDF created ({ps.get('producer') or 'unknown producer'})", "doc": did})
            if ps.get("modified") and ps.get("modified") != ps.get("created"):
                ev.append({"date": ps["modified"][:10], "kind": "edit", "label": f"{did} PDF modified", "doc": did})
    st = read_json(case, "status.json", {})
    ev.append({"date": (st.get("context") or {}).get("application_date", date.today().isoformat()), "kind": "application", "label": "Application submitted"})
    ev.sort(key=lambda e: e["date"])
    write_json(case, "timeline.json", {"events": ev})
    return ev


def apply_review(case: Path, finding_id: str, decision: str, reason: str = "", reviewer: str = "investigator", true_match: bool | None = None) -> dict:
    data = read_json(case, "findings/verified.json", {"findings": []})
    for f in data["findings"]:
        if f["id"] == finding_id:
            f["status"] = "accepted" if decision == "accept" else "rejected"
            f["review"] = {"decision": decision, "reason": reason, "reviewer": reviewer, "true_match": true_match}
            write_json(case, "findings/verified.json", data)
            with open(case / "findings" / "reviews.jsonl", "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"finding_id": finding_id, "decision": decision, "reason": reason, "reviewer": reviewer}) + "\n")
            audit(case, f"user:{reviewer}", f"finding_{decision}", finding_id, reason)
            return f
    raise KeyError(finding_id)
