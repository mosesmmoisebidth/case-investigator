"""Payment instruments: routing numbers, cards and the banks behind them.

Reuses VeriSec's financial engines:
  * routing validation (checksum + Federal Reserve prefix) from the MICR service
  * the bank directory (~75k profiles, 7k+ with US routing numbers) and its
    learned bank-name matcher (order-aware soft TF-IDF) from scanning_common
  * the BIN master table (458k BINs) used by the Card API
"""

from __future__ import annotations

import csv
import json
import os
import sqlite3
import sys
from functools import lru_cache
from pathlib import Path

from .core import VERISEC_ROOT, VERISEC_SERVICES, audit, flag, read_json, result, write_json

PRIVATE_PII = Path(os.environ.get("PRIVATE_PII_DIR", VERISEC_ROOT / "_private_pii"))
BANKS_DB = Path(os.environ.get("BANKS_DB", PRIVATE_PII / "bank_research" / "data" / "banks.sqlite"))
BIN_CSV = Path(os.environ.get("BIN_CSV", VERISEC_ROOT / "BIN_Sourcing" / "aggregate" / "bin_master_candidate.csv"))
os.environ.setdefault("BANKS_DB", str(BANKS_DB))
os.environ.setdefault("PRIVATE_PII_DIR", str(PRIVATE_PII))
sys.path.insert(0, str(VERISEC_SERVICES))
sys.path.insert(0, str(VERISEC_SERVICES / "micr"))

try:
    from micr_parse import aba_check
except Exception:  # pragma: no cover
    aba_check = None

# Federal Reserve district of each state's main office (first two routing digits map to a district).
STATE_DISTRICT = {
    **dict.fromkeys(["CT", "ME", "MA", "NH", "RI", "VT"], "Boston"),
    **dict.fromkeys(["NY", "NJ"], "New York"),
    **dict.fromkeys(["PA", "DE"], "Philadelphia"),
    **dict.fromkeys(["OH", "KY", "WV"], "Cleveland"),
    **dict.fromkeys(["VA", "MD", "DC", "NC", "SC"], "Richmond"),
    **dict.fromkeys(["GA", "FL", "AL", "TN", "LA", "MS"], "Atlanta"),
    **dict.fromkeys(["IL", "IN", "IA", "MI", "WI"], "Chicago"),
    **dict.fromkeys(["MO", "AR"], "St. Louis"),
    **dict.fromkeys(["MN", "MT", "ND", "SD"], "Minneapolis"),
    **dict.fromkeys(["KS", "NE", "OK", "CO", "WY", "NM"], "Kansas City"),
    **dict.fromkeys(["TX"], "Dallas"),
    **dict.fromkeys(["CA", "WA", "OR", "NV", "AZ", "UT", "ID", "AK", "HI"], "San Francisco"),
}


@lru_cache(maxsize=1)
def _bd():
    from scanning_common import bank_directory

    return bank_directory


@lru_cache(maxsize=1)
def routing_index() -> dict[str, list[dict]]:
    idx: dict[str, list[dict]] = {}
    if not BANKS_DB.exists():
        return idx
    con = sqlite3.connect(BANKS_DB)
    for name, rts, state, city, pid in con.execute(
        "select name, routing_numbers, state, city, profile_id from profiles where routing_numbers is not null and routing_numbers not in ('','[]')"
    ):
        try:
            for rt in json.loads(rts):
                idx.setdefault(str(rt), []).append({"name": name, "state": state, "city": city, "profile_id": pid})
        except (ValueError, TypeError):
            continue
    con.close()
    return idx


def routing_owner(rt: str) -> list[dict]:
    return routing_index().get(rt, [])


@lru_cache(maxsize=1)
def bin_table() -> dict[str, dict]:
    out: dict[str, dict] = {}
    if BIN_CSV.exists():
        with open(BIN_CSV, newline="", encoding="utf-8", errors="ignore") as f:
            for r in csv.DictReader(f):
                out.setdefault(r["bin"], {"brand": r.get("brand"), "type": r.get("type"), "level": r.get("level"), "bank": r.get("bank_name"), "country": r.get("country")})
    return out


def bin_lookup(pan: str) -> dict | None:
    t = bin_table()
    for n in (8, 7, 6):
        if len(pan) >= n and pan[:n] in t:
            return {"bin": pan[:n], **t[pan[:n]]}
    return None


def same_bank(a: str, b: str) -> tuple[bool, float]:
    try:
        bd = _bd()
        return bd.same_bank_name(a, b, "US"), round(bd.name_similarity(a, b, "US"), 3)
    except Exception:  # pragma: no cover
        from rapidfuzz import fuzz

        s = fuzz.token_set_ratio(a.lower(), b.lower()) / 100
        return s >= 0.85, round(s, 3)


def check_routing(rt: str, printed_bank: str | None) -> dict:
    out: dict = {"routing": rt}
    if aba_check:
        out["aba"] = aba_check(rt)
    owners = routing_owner(rt)
    out["directory_owners"] = owners[:5]
    if printed_bank:
        out["printed_bank"] = printed_bank
        if owners:
            best = max((same_bank(printed_bank, o["name"]) + (o,) for o in owners), key=lambda x: x[1])
            out["owner_match"] = {"same": best[0], "similarity": best[1], "owner": best[2]["name"]}
        else:
            try:
                r = _bd().resolve(printed_bank, country="US")
                prof = (r or {}).get("resolved") or {}
                out["printed_bank_profile"] = prof
                state = None
                if prof.get("profile_id"):
                    con = sqlite3.connect(BANKS_DB)
                    row = con.execute("select state from profiles where profile_id=?", (prof["profile_id"],)).fetchone()
                    con.close()
                    state = row[0] if row else None
                district = STATE_DISTRICT.get(state or "")
                out["district_check"] = {"routing_district": (out.get("aba") or {}).get("federal_reserve_district"), "bank_home_state": state, "bank_home_district": district}
            except Exception as e:  # noqa: BLE001
                out["district_check"] = {"error": str(e)[:120]}
    return out


def run(case: Path, doc_id: str) -> dict:
    ex = read_json(case, f"extracted/{doc_id}.json")
    F, dt = ex["fields"], ex["doc_type"]
    ev = f"checks/payments_{doc_id}.json"
    rec, flags = {"doc_id": doc_id, "doc_type": dt}, []
    rt = (F.get("routing_number") or {}).get("value")
    bank = (F.get("bank_name") or {}).get("value")
    if rt:
        r = check_routing(rt, bank)
        rec["routing"] = r
        fpage, fbox = F["routing_number"].get("page"), F["routing_number"].get("bbox")
        om = r.get("owner_match")
        if om and not om["same"]:
            flags.append(flag("routing_vs_bank", f"Routing number {rt} on {doc_id} belongs to {om['owner']}, not {bank}", "high", doc=doc_id, field="routing_number", evidence=[ev], deterministic=True, layer="payments", values={"routing": rt, "printed_bank": bank, "directory_owner": om["owner"], "similarity": om["similarity"]}, page=fpage, bbox=fbox))
        dc = r.get("district_check") or {}
        if dc.get("routing_district") and dc.get("bank_home_district") and dc["routing_district"] != dc["bank_home_district"]:
            flags.append(flag("routing_district", f"Routing number {rt} is a {dc['routing_district']} Fed district number, but {bank} is based in the {dc['bank_home_district']} district", "medium", doc=doc_id, field="routing_number", evidence=[ev], layer="payments", values=dc, page=fpage, bbox=fbox))
    pan = (F.get("card_number") or {}).get("value")
    if pan:
        b = bin_lookup(pan)
        rec["bin"] = {**(b or {}), "pan_last4": pan[-4:]} if b else {"found": False}
        if b and bank and b.get("bank"):
            same, sim = same_bank(bank, b["bank"])
            rec["bin"]["printed_bank_match"] = {"same": same, "similarity": sim}
            if not same:
                flags.append(flag("bin_vs_bank", f"Card BIN {b['bin']} on {doc_id} is issued by {b['bank']}, not {bank}", "high", doc=doc_id, field="card_number", evidence=[ev], deterministic=True, layer="payments", values={"bin": b["bin"], "issuer": b["bank"], "printed": bank}))
    write_json(case, ev, rec)
    audit(case, "engine:payments", "run", doc_id, {"flags": len(flags)})
    return result([ev], f"{doc_id}: payment instruments checked, {len(flags)} signal(s)", flags)
