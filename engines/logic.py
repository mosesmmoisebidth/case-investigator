"""Content logic: deterministic checks that catch edits pixel models miss
(including AI-inpainted numbers): pay stub maths and FICA rates, statement
running balances and totals, MRZ check digits (ICAO 9303), routing-number
checksum (VeriSec's MICR check), Luhn, invoice maths, amount in words, and
date logic (future dates, weekend or bank-holiday pay dates, expired IDs).
A failed deterministic check is high confidence on its own.
"""

from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

import holidays

from .core import VERISEC_SERVICES, audit, flag, read_json, result, write_json

sys.path.insert(0, str(VERISEC_SERVICES / "micr"))
try:
    from micr_parse import aba_check  # VeriSec's routing validation (checksum + Fed prefix)
except Exception:  # pragma: no cover
    aba_check = None

TOL = 0.02
SS_RATE, MEDICARE_RATE = 0.062, 0.0145
US_HOLIDAYS = holidays.financial_holidays("NYSE") if hasattr(holidays, "financial_holidays") else holidays.US()


def _v(fields: dict, k: str):
    f = fields.get(k)
    return f["value"] if f else None


def _box(fields: dict, k: str):
    f = fields.get(k)
    return (f or {}).get("page"), (f or {}).get("bbox")


def luhn_ok(num: str) -> bool:
    d = [int(c) for c in num if c.isdigit()]
    if len(d) < 12:
        return False
    s = 0
    for i, x in enumerate(reversed(d)):
        if i % 2:
            x *= 2
            x -= 9 if x > 9 else 0
        s += x
    return s % 10 == 0


def words_to_amount(text: str) -> float | None:
    from word2number import w2n

    t = text.lower().replace("-", " ")
    cents = 0.0
    m = re.search(r"(\d{1,2})\s*/\s*100", t)
    if m:
        cents = int(m.group(1)) / 100
        t = t[: m.start()]
    t = re.sub(r"\b(dollars?|and|only|exactly)\b", " ", t)
    t = re.sub(r"[^a-z ]", " ", t).strip()
    if not t:
        return None
    try:
        return float(w2n.word_to_num(t)) + cents
    except ValueError:
        return None


def run(case: Path, doc_id: str, application_date: str | None = None) -> dict:
    ex = read_json(case, f"extracted/{doc_id}.json")
    dt, F = ex["doc_type"], ex["fields"]
    checks, flags = [], []
    ev = f"checks/logic_{doc_id}.json"
    today = application_date or date.today().isoformat()

    def record(name: str, ok: bool | None, detail: dict, claim: str | None = None, sev: str = "high", field: str | None = None):
        checks.append({"check": name, "status": "passed" if ok else ("failed" if ok is False else "not_run"), **detail})
        if ok is False and claim:
            page, bbox = _box(F, field) if field else (None, None)
            flags.append(flag(name, claim, sev, doc=doc_id, field=field, evidence=[ev], deterministic=True, layer="logic", values=detail, page=page, bbox=bbox))

    if dt == "pay_stub":
        g, n = _v(F, "gross_pay"), _v(F, "net_pay")
        ded_keys = ["federal_tax", "social_security", "medicare", "state_tax", "other_deductions"]
        deds = {k: _v(F, k) for k in ded_keys if _v(F, k) is not None}
        tot = _v(F, "total_deductions")
        if g is not None and n is not None and (deds or tot is not None):
            dsum = tot if tot is not None else sum(deds.values())
            expect = round(g - dsum, 2)
            record("paystub_math", abs(expect - n) <= TOL, {"gross": g, "deductions": round(dsum, 2), "net_stated": n, "net_expected": expect},
                   f"Net pay on {doc_id} does not equal gross minus deductions ({n:,.2f} stated, {expect:,.2f} expected)", "critical", "net_pay")
            if tot is not None and deds:
                record("paystub_deduction_total", abs(sum(deds.values()) - tot) <= TOL, {"listed_sum": round(sum(deds.values()), 2), "total_stated": tot},
                       f"Deductions on {doc_id} do not add up to the stated total", "high", "total_deductions")
        else:
            record("paystub_math", None, {"reason": "gross, net or deductions not read"})
        if g:
            ss, md = _v(F, "social_security"), _v(F, "medicare")
            if ss is not None:
                exp = round(g * SS_RATE, 2)
                record("fica_social_security", abs(ss - exp) <= max(0.05, exp * 0.01), {"gross": g, "stated": ss, "expected_6_2pct": exp},
                       f"Social Security on {doc_id} is not 6.2% of gross ({ss:,.2f} vs {exp:,.2f}), so gross or the tax was changed", "high", "social_security")
            if md is not None:
                exp = round(g * MEDICARE_RATE, 2)
                record("fica_medicare", abs(md - exp) <= max(0.05, exp * 0.01), {"gross": g, "stated": md, "expected_1_45pct": exp},
                       f"Medicare on {doc_id} is not 1.45% of gross ({md:,.2f} vs {exp:,.2f})", "high", "medicare")
        pd = _v(F, "pay_date")
        if pd:
            d = date.fromisoformat(pd)
            record("pay_date_business_day", d.weekday() < 5 and d not in US_HOLIDAYS, {"pay_date": pd, "weekday": d.strftime("%A"), "holiday": US_HOLIDAYS.get(d)},
                   f"Pay date {pd} on {doc_id} is a {'bank holiday' if d in US_HOLIDAYS else d.strftime('%A')}, when payroll does not run", "medium", "pay_date")

    if dt == "bank_statement":
        tx = ex.get("transactions") or []
        ob, cb = _v(F, "opening_balance"), _v(F, "closing_balance")
        if tx and ob is not None and cb is not None:
            ins = round(sum(t["amount"] or 0 for t in tx if t["direction"] == "in"), 2)
            outs = round(sum(t["amount"] or 0 for t in tx if t["direction"] == "out"), 2)
            expect = round(ob + ins - outs, 2)
            record("statement_totals_balance", abs(expect - cb) <= TOL, {"opening": ob, "deposits": ins, "withdrawals": outs, "closing_stated": cb, "closing_expected": expect},
                   f"{doc_id}: opening balance plus deposits minus withdrawals is {expect:,.2f}, but the closing balance says {cb:,.2f}", "critical", "closing_balance")
            td, tw = _v(F, "total_deposits"), _v(F, "total_withdrawals")
            if td is not None:
                record("statement_total_deposits", abs(td - ins) <= TOL, {"stated": td, "sum_of_rows": ins}, f"{doc_id}: total deposits ({td:,.2f}) do not match the deposit rows ({ins:,.2f})", "high", "total_deposits")
            if tw is not None:
                record("statement_total_withdrawals", abs(tw - outs) <= TOL, {"stated": tw, "sum_of_rows": outs}, f"{doc_id}: total withdrawals ({tw:,.2f}) do not match the rows ({outs:,.2f})", "high", "total_withdrawals")
            bal, bad = ob, []
            for t in tx:
                if t["amount"] is None:
                    continue
                bal = round(bal + (t["amount"] if t["direction"] == "in" else -t["amount"]), 2)
                if t["balance"] is not None and abs(bal - t["balance"]) > TOL:
                    bad.append({"date": t["date"], "description": t["description"], "expected": bal, "stated": t["balance"], "page": t["page"], "bbox": t["bbox"]})
                    bal = t["balance"]
            ok = not bad
            checks.append({"check": "running_balance", "status": "passed" if ok else "failed", "breaks": bad})
            for b in bad[:5]:
                flags.append(flag("running_balance", f"{doc_id}: running balance breaks on {b['date']} ({b['description'][:40]}): {b['stated']:,.2f} stated, {b['expected']:,.2f} expected", "critical", doc=doc_id, evidence=[ev], deterministic=True, layer="logic", values=b, page=b["page"], bbox=b["bbox"]))
        else:
            record("statement_totals_balance", None, {"reason": "balances or transactions not read"})

    if dt in ("passport",) and ex.get("mrz"):
        lines = ex["mrz"]
        try:
            from mrz.checker.td1 import TD1CodeChecker
            from mrz.checker.td3 import TD3CodeChecker

            code = "\n".join(lines[-3:]) if len(lines) >= 3 and len(lines[-1]) == 30 else "\n".join(lines[-2:])
            chk = TD1CodeChecker(code) if len(lines[-1]) == 30 else TD3CodeChecker(code)
            ok = bool(chk)
            fields = chk.fields()
            detail = {"mrz": code, "valid": ok, "surname": fields.surname, "name": fields.name, "birth_date": fields.birth_date, "document_number": fields.document_number, "expiry_date": fields.expiry_date}
            record("mrz_check_digits", ok, detail, f"MRZ check digits on {doc_id} fail: the machine-readable zone was altered", "critical", None)
            printed = (_v(F, "full_name") or "").upper()
            if printed and fields.surname and fields.surname.upper() not in printed:
                record("mrz_vs_printed", False, {"mrz_surname": fields.surname, "printed": printed}, f"The MRZ surname ({fields.surname}) differs from the printed name on {doc_id}", "high", "full_name")
        except Exception as e:  # noqa: BLE001
            record("mrz_check_digits", None, {"reason": f"MRZ not parsed: {str(e)[:80]}"})

    if dt in ("passport", "drivers_license", "card"):
        exp = _v(F, "expiry_date")
        if exp:
            record("id_not_expired", exp >= today, {"expiry": exp, "as_of": today}, f"{doc_id} expired on {exp}", "high", "expiry_date")

    if dt == "cheque":
        rt = _v(F, "routing_number")
        if rt and aba_check:
            r = aba_check(rt)
            record("aba_routing", r["valid"], {"routing": rt, **r}, f"Routing number {rt} on {doc_id} is not a valid US routing number (checksum or Federal Reserve prefix fails)", "critical", "routing_number")
        amt, words = _v(F, "amount"), _v(F, "amount_words")
        if amt is not None and words:
            wv = words_to_amount(words)
            if wv is not None:
                record("amount_words_vs_figures", abs(wv - amt) <= TOL, {"figures": amt, "words": words, "words_value": wv}, f"Cheque amount in words ({wv:,.2f}) differs from the figures ({amt:,.2f}) on {doc_id}", "critical", "amount")

    if dt == "card":
        cn = _v(F, "card_number")
        if cn:
            record("luhn", luhn_ok(cn), {"last4": cn[-4:]}, f"Card number on {doc_id} fails the Luhn check", "critical", "card_number")

    if dt in ("invoice", "receipt"):
        st, tx_, tot = _v(F, "subtotal"), _v(F, "tax"), _v(F, "total")
        if st is not None and tot is not None:
            exp = round(st + (tx_ or 0), 2)
            record("invoice_math", abs(exp - tot) <= TOL, {"subtotal": st, "tax": tx_, "total_stated": tot, "total_expected": exp}, f"{doc_id}: subtotal plus tax ({exp:,.2f}) does not equal the total ({tot:,.2f})", "critical", "total")

    if dt == "w2":
        for wk, tk, rate, nm in (("ss_wages", "ss_tax", SS_RATE, "Social Security"), ("medicare_wages", "medicare_tax", MEDICARE_RATE, "Medicare")):
            w_, t_ = _v(F, wk), _v(F, tk)
            if w_ and t_ is not None:
                exp = round(w_ * rate, 2)
                record(f"w2_{tk}", abs(t_ - exp) <= max(1.0, exp * 0.01), {"wages": w_, "stated": t_, "expected": exp}, f"{nm} tax on {doc_id} is not {rate * 100:g}% of {nm} wages", "high", tk)

    # date logic for every document: nothing dated after the application
    for k, f in F.items():
        if f.get("type") == "date" and f.get("value") and k not in ("expiry_date", "due_date") and f["value"] > today:
            record(f"future_date_{k}", False, {"field": k, "value": f["value"], "as_of": today}, f"{k.replace('_', ' ')} on {doc_id} ({f['value']}) is after the application date", "medium", k)

    write_json(case, ev, {"doc_id": doc_id, "doc_type": dt, "checks": checks})
    audit(case, "engine:logic", "run", doc_id, {"checks": len(checks), "failed": len(flags)})
    failed = sum(1 for c in checks if c["status"] == "failed")
    return result([ev], f"{doc_id}: {len(checks)} logic check(s), {failed} failed", flags, checks=checks)
