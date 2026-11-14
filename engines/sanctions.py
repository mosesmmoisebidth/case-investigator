"""Sanctions and PEP screening of every person and company in the case.

Primary: VeriSec's yente screening engine (POST /v1/aml/screen/match on the
VeriSec intelligence API, mutual TLS), the same matcher the KYC console uses.
Fallback when that API is unreachable: the OpenSanctions sanctions targets file
held locally, matched on normalised names (Jaro-Winkler + token order), with
birth date and country as confirmations. A case-specific watchlist file
(workflows/watchlists/*.csv) is screened too. Returns score + list entry.
"""

from __future__ import annotations

import csv
import os
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from rapidfuzz.distance import JaroWinkler

from .core import PRIVATE_DIR, ROOT, VERISEC_ROOT, audit, flag, read_json, result, write_json

INTEL_URL = os.environ.get("VERISEC_INTEL_URL", "https://api.verisec.mmose.me")
MTLS_DIR = Path(os.environ.get("VERISEC_MTLS_DIR", VERISEC_ROOT / "verisec_web_ui_back" / "backend" / "infra" / "pki"))
LOCAL_TARGETS = Path(os.environ.get("OPENSANCTIONS_CSV", PRIVATE_DIR / "data" / "opensanctions" / "targets.simple.csv"))
WATCHLIST_DIR = ROOT / "workflows" / "watchlists"
THRESHOLD = 0.70  # same threshold VeriSec's yente matcher uses


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", s.lower()).split())


def yente_match(name: str, schema: str = "Person", birth_date: str | None = None) -> dict | None:
    """Call VeriSec's yente over mTLS. None when unreachable (e.g. expired client cert)."""
    crt, key = MTLS_DIR / "console.crt", MTLS_DIR / "console.key"
    if not crt.exists():
        return None
    try:
        import requests

        r = requests.post(
            f"{INTEL_URL}/v1/aml/screen/match",
            json={"name": name, "schema": schema, **({"birth_date": birth_date} if birth_date else {}), "limit": 5},
            cert=(str(crt), str(key)),
            verify=True,
            timeout=20,
        )
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


_DF: dict[str, int] = {}
_N = [1]


def _w(tok: str) -> float:
    """Word weight learned from the list: rare words decide, common ones ('ltd') barely count."""
    import math

    return math.log((_N[0] + 1) / (_DF.get(tok, 0) + 1)) + 1.0


def name_score(q: str, n: str) -> float:
    """Weighted token alignment in both directions (Jaro-Winkler >= 0.88 per word)."""
    tq, tn = q.split(), n.split()
    if not tq or not tn:
        return 0.0

    def directed(a, b):
        num = den = 0.0
        for t in a:
            w = _w(t) * (0.3 if len(t) == 1 else 1.0)
            best = max(JaroWinkler.similarity(t, u) for u in b)
            # near-identical words count fully; close spellings only partly
            num += w * (best if best >= 0.95 else 0.6 * best if best >= 0.88 else 0.0)
            den += w
        return num / den if den else 0.0

    fwd, bwd = directed(tq, tn), directed(tn, tq)
    # a short alias ("Maria") must not lift a query that mostly does not match
    return round(min(0.6 * fwd + 0.4 * bwd, fwd + 0.15), 4)


@lru_cache(maxsize=1)
def _local_index() -> tuple[list[dict], dict[str, list[int]]]:
    rows: list[dict] = []
    block: dict[str, list[int]] = {}
    files = [p for p in [LOCAL_TARGETS, *sorted(WATCHLIST_DIR.glob("*.csv"))] if p.exists()]
    for p in files:
        with open(p, newline="", encoding="utf-8", errors="ignore") as f:
            for r in csv.DictReader(f):
                if r.get("schema") not in (None, "", "Person", "Organization", "Company", "LegalEntity"):
                    continue
                names = [r.get("name", "")] + [a for a in (r.get("aliases") or "").split(";") if a]
                rec = {
                    "id": r.get("id"),
                    "schema": r.get("schema"),
                    "name": r.get("name"),
                    "birth_date": r.get("birth_date"),
                    "countries": r.get("countries"),
                    "sanctions": (r.get("sanctions") or "")[:240],
                    "dataset": r.get("dataset") or p.stem,
                    "norms": list({_norm(n) for n in names if n}),
                }
                i = len(rows)
                rows.append(rec)
                toks = set()
                for n in rec["norms"]:
                    for tok in n.split():
                        toks.add(tok)
                        if len(tok) >= 3:
                            block.setdefault(tok, []).append(i)
                for tok in toks:
                    _DF[tok] = _DF.get(tok, 0) + 1
    _N[0] = max(1, len(rows))
    return rows, block


ORG_SCHEMAS = {"Organization", "Company", "LegalEntity"}


def local_match(name: str, birth_date: str | None = None, limit: int = 5, schema: str = "Person") -> list[dict]:
    rows, block = _local_index()
    q = _norm(name)
    cand = set()
    for tok in q.split():
        if len(tok) >= 3:
            cand.update(block.get(tok, [])[:5000])
    scored = []
    for i in cand:
        r = rows[i]
        if (schema == "Person") != (r.get("schema") == "Person") and not (schema != "Person" and r.get("schema") in ORG_SCHEMAS):
            continue
        best = max((name_score(q, n) for n in r["norms"]), default=0)
        conf = []
        if birth_date and r.get("birth_date"):
            if birth_date[:10] in r["birth_date"]:
                best = min(1.0, best + 0.1)
                conf.append("birth date same")
            elif birth_date[:4] not in r["birth_date"]:
                best -= 0.1
                conf.append("birth date differs")
        if best >= 0.5:
            scored.append({**{k: v for k, v in r.items() if k != "norms"}, "score": round(best, 3), "confirmations": conf})
    scored.sort(key=lambda x: -x["score"])
    return scored[:limit]


def collect_names(case: Path) -> list[dict]:
    out, seen = [], set()
    for p in sorted((case / "extracted").glob("*.json")):
        ex = read_json(case, f"extracted/{p.name}")
        for k, f in ex["fields"].items():
            if f.get("type") in ("name", "org") and isinstance(f.get("value"), str) and len(f["value"]) > 2:
                key = _norm(f["value"])
                if key in seen:
                    continue
                seen.add(key)
                dob = next((g["value"] for g in ex["fields"].values() if g.get("role") == "dob"), None) if f.get("type") == "name" else None
                out.append({"name": f["value"], "schema": "Person" if f["type"] == "name" else "Organization", "dob": dob, "doc": ex["doc_id"], "field": k, "page": f.get("page"), "bbox": f.get("bbox")})
    return out


def run(case: Path) -> dict:
    ev = "checks/sanctions.json"
    names = collect_names(case)
    screened, flags = [], []
    for n in names:
        remote = yente_match(n["name"], n["schema"], n["dob"])
        if remote is not None:
            results = remote.get("data", remote).get("results", []) if isinstance(remote, dict) else []
            matches = [{"id": r.get("id"), "name": r.get("caption"), "score": r.get("score"), "dataset": ",".join(r.get("datasets", [])), "source": "verisec_yente"} for r in results]
            source = "verisec_yente"
        else:
            matches = [{**m, "source": "opensanctions_local"} for m in local_match(n["name"], n["dob"], schema=n["schema"])]
            source = "opensanctions_local"
        best = matches[0] if matches else None
        screened.append({**n, "source": source, "best": best, "matches": matches[:5]})
        if best and (best.get("score") or 0) >= THRESHOLD:
            sev = "critical" if best["score"] >= 0.9 else "high"
            flags.append(flag("sanctions_match", f"{n['name']} ({n['doc']}) closely matches sanctions list entry '{best['name']}' (score {best['score']:.2f})", sev, doc=n["doc"], field=n["field"], evidence=[ev], layer="screening", values={"query": n["name"], "entry": best}, page=n["page"], bbox=n["bbox"]))
    write_json(case, ev, {"threshold": THRESHOLD, "screened": screened})
    audit(case, "engine:sanctions", "run", len(names), {"hits": len(flags)})
    return result([ev], f"{len(names)} name(s) screened, {len(flags)} possible match(es)", flags)
