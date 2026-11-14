"""Shared plumbing for every engine: case folder layout, evidence writing,
the tamper-evident audit log, and the tool-result contract.

Contract: an engine never returns big payloads to the agent. It writes its raw
output under the case folder and returns {"evidence": [paths], "summary": str,
"flags": [...]}, so every number in a finding traces back to a stored file.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CASES_DIR = Path(os.environ.get("CI_CASES_DIR", ROOT / "cases"))
VERISEC_ROOT = Path(os.environ.get("VERISEC_ROOT", ROOT.parent))
VERISEC_SERVICES = Path(
    os.environ.get("VERISEC_SERVICES", VERISEC_ROOT / "verisec_web_ui_back" / "backend" / "services")
)
PRIVATE_DIR = Path(os.environ.get("CI_PRIVATE_DIR", ROOT.parent / "case-investigator-private"))

SUBDIRS = ("input", "pages", "intake", "extracted", "evidence", "checks", "findings", "graph", "report")


def case_dir(case_id: str) -> Path:
    d = CASES_DIR / case_id
    for s in SUBDIRS:
        (d / s).mkdir(parents=True, exist_ok=True)
    return d


def rel(case: Path, p: Path) -> str:
    return p.relative_to(case).as_posix()


def write_json(case: Path, relpath: str, obj: Any) -> str:
    p = case / relpath
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")
    return relpath


def read_json(case: Path, relpath: str, default: Any = None) -> Any:
    p = case / relpath
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


_AUDIT_LOCK = threading.Lock()


def audit(case: Path, actor: str, action: str, inputs: Any = None, result: Any = None) -> dict:
    """Append one event to audit.log. Each line carries the hash of the previous
    line, so any later edit or deletion breaks the chain and is detectable."""
    with _AUDIT_LOCK:
        return _audit(case, actor, action, inputs, result)


def _audit(case: Path, actor: str, action: str, inputs: Any, result: Any) -> dict:
    log = case / "audit.log"
    prev = "0" * 64
    if log.exists():
        lines = log.read_text(encoding="utf-8").strip().splitlines()
        if lines:
            prev = json.loads(lines[-1]).get("hash", prev)
    ev = {
        "t": time.time(),
        "actor": actor,
        "action": action,
        "inputs_hash": hashlib.sha256(json.dumps(inputs, sort_keys=True, default=str).encode()).hexdigest()
        if inputs is not None
        else None,
        "inputs": inputs if isinstance(inputs, (str, int, float)) or inputs is None else _short(inputs),
        "result": _short(result),
        "prev": prev,
    }
    ev["hash"] = hashlib.sha256((prev + json.dumps(ev, sort_keys=True, default=str)).encode()).hexdigest()
    with open(log, "a", encoding="utf-8") as f:
        f.write(json.dumps(ev, default=str) + "\n")
    return ev


def verify_audit(case: Path) -> bool:
    log = case / "audit.log"
    if not log.exists():
        return True
    prev = "0" * 64
    for line in log.read_text(encoding="utf-8").strip().splitlines():
        ev = json.loads(line)
        h = ev.pop("hash")
        if ev["prev"] != prev:
            return False
        if hashlib.sha256((prev + json.dumps(ev, sort_keys=True, default=str)).encode()).hexdigest() != h:
            return False
        prev = h
    return True


def _short(x: Any, n: int = 400) -> Any:
    if x is None:
        return None
    s = json.dumps(x, default=str)
    return x if len(s) <= n else s[:n] + "..."


def result(evidence: list[str], summary: str, flags: list[dict] | None = None, **extra: Any) -> dict:
    return {"evidence": evidence, "summary": summary, "flags": flags or [], **extra}


def flag(
    check: str,
    claim: str,
    severity: str,
    *,
    doc: str | None = None,
    field: str | None = None,
    evidence: list[str] | None = None,
    deterministic: bool = False,
    layer: str = "logic",
    values: dict | None = None,
    page: int | None = None,
    bbox: list[float] | None = None,
) -> dict:
    """One raw signal from an engine. The verifier turns signals into findings."""
    return {
        "check": check,
        "claim": claim,
        "severity": severity,
        "doc": doc,
        "field": field,
        "evidence": evidence or [],
        "deterministic": deterministic,
        "layer": layer,
        "values": values or {},
        "page": page,
        "bbox": bbox,
    }
