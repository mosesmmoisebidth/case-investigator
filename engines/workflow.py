"""Case workflows: editable YAML files that say, per case type, which documents
are required, which investigation steps run (and in what order), which
relationship rules are checked with what severity and parameters, and how
findings are scored. The Workflows screen edits these files.
"""

from __future__ import annotations

import copy
import re

import yaml

from .core import ROOT

WF_DIR = ROOT / "workflows" / "cases"

# Rules the graph engine knows how to check (a workflow switches them on and tunes them).
RULE_CATALOG = {
    "same_person": {"flow": "identity", "label": "Same person on every document", "params": {}},
    "dob_consistent": {"flow": "identity", "label": "Same date of birth everywhere", "params": {}},
    "id_valid": {"flow": "identity", "label": "Photo ID not expired", "params": {}},
    "current_address": {"flow": "address", "label": "One current address", "params": {}},
    "pay_to_deposit": {"flow": "money", "label": "Every pay date has a matching deposit", "params": {"days": 3, "tolerance": 1.0}},
    "employer_pays_account": {"flow": "money", "label": "Employer pays into the applicant's account", "params": {}},
    "income_consistency": {"flow": "money", "label": "Stated income matches pay stubs and deposits", "params": {"tolerance_pct": 15}},
    "cheque_account": {"flow": "money", "label": "Cheque drawn on the applicant's own account", "params": {}},
    "invoice_paid": {"flow": "money", "label": "Every invoice amount matches a payment", "params": {"days": 30, "tolerance": 1.0}},
    "statement_chain": {"flow": "time", "label": "Statements form an unbroken chain", "params": {}},
    "recency": {"flow": "time", "label": "Documents dated within the window", "params": {}},
    "required_documents": {"flow": "time", "label": "Every required document present", "params": {}},
}
STEP_CATALOG = ["intake", "extract", "pdf_forensics", "pixel_forensics", "char_forensics", "logic", "payments", "graph", "sanctions", "verify"]
SEVERITIES = ["critical", "high", "medium", "low", "info"]


def list_workflows() -> list[dict]:
    out = []
    for p in sorted(WF_DIR.glob("*.yaml")):
        d = yaml.safe_load(p.read_text(encoding="utf-8"))
        out.append({"id": d["id"], "label": d["label"], "description": d.get("description", ""), "rules": len(d.get("rules", [])), "steps": len(d.get("steps", [])), "required_documents": len(d.get("required_documents", []))})
    return out


def load(wf_id: str) -> dict:
    p = WF_DIR / f"{wf_id}.yaml"
    if not p.exists():
        p = WF_DIR / "general.yaml"
    return yaml.safe_load(p.read_text(encoding="utf-8"))


def validate(wf: dict) -> list[str]:
    errs = []
    if not re.fullmatch(r"[a-z][a-z0-9_]{1,40}", wf.get("id", "")):
        errs.append("id must be lowercase letters, digits or _")
    if not wf.get("label"):
        errs.append("label is required")
    for r in wf.get("rules", []):
        if r.get("id") not in RULE_CATALOG:
            errs.append(f"unknown rule {r.get('id')}")
        if r.get("severity") not in SEVERITIES:
            errs.append(f"rule {r.get('id')}: severity must be one of {SEVERITIES}")
    for s in wf.get("steps", []):
        if s.get("engine") not in STEP_CATALOG:
            errs.append(f"unknown step engine {s.get('engine')}")
    for d in wf.get("required_documents", []):
        if not d.get("types") or int(d.get("count", 0)) < 1:
            errs.append(f"required document {d.get('label')}: needs types and count >= 1")
    return errs


def save(wf: dict) -> dict:
    wf = copy.deepcopy(wf)
    errs = validate(wf)
    if errs:
        raise ValueError("; ".join(errs))
    (WF_DIR / f"{wf['id']}.yaml").write_text(yaml.safe_dump(wf, sort_keys=False, allow_unicode=True, width=200), encoding="utf-8")
    return wf


def rule(wf: dict, rule_id: str) -> dict | None:
    for r in wf.get("rules", []):
        if r["id"] == rule_id and r.get("enabled", True):
            return {**RULE_CATALOG[rule_id], **r, "params": {**RULE_CATALOG[rule_id]["params"], **(r.get("params") or {})}}
    return None


def step_enabled(wf: dict, engine: str) -> bool:
    for s in wf.get("steps", []):
        if s.get("engine") == engine:
            return bool(s.get("enabled", True))
    return True
