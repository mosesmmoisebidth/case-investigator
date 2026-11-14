"""The case relationship graph (the core of the product).

Built for every case, clean ones included. Nodes are what the documents talk
about (people, organisations, addresses, accounts, money events) plus the
documents themselves. Edges are facts a document states, each tied to the exact
field and page it came from. The workflow's rules then check every expected
link and mark it verified (green), conflict (red), missing (amber) or
unverifiable (grey). Missing documents appear as dashed placeholder nodes.
Entity merges are deterministic and every merge records its reason.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from pathlib import Path

from . import resolve, workflow
from .core import audit, flag, read_json, result, write_json

PAYROLL_PROVIDERS = re.compile(r"(?i)\b(adp|gusto|paychex|paylocity|intuit|quickbooks payroll|workday|rippling|trinet|justworks|paycom|ceridian|dayforce|deel|payroll)\b")
FREQ = [(7, 52, "weekly"), (14, 26, "biweekly"), (16, 24, "semi-monthly"), (31, 12, "monthly")]


def parse_context(text: str) -> dict:
    out: dict = {"raw": text or ""}
    t = text or ""
    def num(x: str) -> float:
        return float(re.sub(r"[^\d.]", "", x))

    inc = re.search(r"(?i)(?:salary|income|earns?|earning)\D{0,12}\$?\s?([\d,]+(?:\.\d+)?)", t)
    if inc:
        out["stated_income"] = num(inc.group(1))
    rent = re.search(r"(?i)rent\D{0,10}\$?\s?([\d,]+(?:\.\d+)?)", t)
    if rent:
        out["rent"] = num(rent.group(1))
    for m in re.finditer(r"\$\s?([\d,]+(?:\.\d+)?)", t):
        v = num(m.group(1))
        if v not in (out.get("stated_income"), out.get("rent")):
            out["amount"] = v
            break
    parts = [p.strip() for p in t.split(",")]
    for p in parts:
        if re.fullmatch(r"[A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]*){1,3}", p) and not re.search(r"(?i)application|claim|loan|rental", p):
            out["applicant"] = p
            break
    m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", t)
    out["application_date"] = m.group(1) if m else date.today().isoformat()
    return out


class Graph:
    def __init__(self) -> None:
        self.nodes: dict[str, dict] = {}
        self.edges: list[dict] = []

    def node(self, nid: str, kind: str, label: str, **kw) -> dict:
        n = self.nodes.get(nid)
        if n is None:
            n = {"id": nid, "kind": kind, "label": label, "docs": [], "merged_from": [], **kw}
            self.nodes[nid] = n
        return n

    def edge(self, source: str, target: str, relation: str, flow: str, state: str, rule: str | None, explain: str, a: dict | None = None, b: dict | None = None, score: float | None = None) -> dict:
        e = {
            "id": f"e{len(self.edges) + 1}",
            "source": source,
            "target": target,
            "relation": relation,
            "flow": flow,
            "state": state,
            "rule": rule,
            "explain": explain,
            "a": a,
            "b": b,
            "score": score,
        }
        self.edges.append(e)
        return e


def _ref(ex: dict, field: str) -> dict | None:
    f = ex["fields"].get(field)
    if not f:
        return None
    return {"doc": ex["doc_id"], "field": field, "value": f["value"], "page": f.get("page"), "bbox": f.get("bbox")}


def _by_role(ex: dict, role: str) -> list[str]:
    return [k for k, f in ex["fields"].items() if f.get("role") == role]


def _doc_date(ex: dict) -> str | None:
    F = ex["fields"]
    for k in ("period_end", "pay_date", "bill_date", "cheque_date", "invoice_date", "receipt_date", "letter_date", "issue_date", "date"):
        if k in F and F[k].get("value"):
            return F[k]["value"]
    return None


def build(case: Path, case_type: str, context_text: str = "") -> dict:
    wf = workflow.load(case_type)
    ctx = parse_context(context_text)
    app_date = ctx["application_date"]
    manifest = read_json(case, "intake/manifest.json", {"documents": []})["documents"]
    exs = {d["doc_id"]: read_json(case, f"extracted/{d['doc_id']}.json") for d in manifest if (case / f"extracted/{d['doc_id']}.json").exists()}
    G = Graph()
    blueprint: list[dict] = []

    def bp(rule_id: str, status: str, detail: str, edges: list[str] | None = None):
        r = workflow.rule(wf, rule_id)
        if r:
            blueprint.append({"rule": rule_id, "label": r["label"], "flow": r["flow"], "severity": r["severity"], "status": status, "detail": detail, "edges": edges or []})

    # ---------------------------------------------------------------- documents
    for d in manifest:
        ex = exs.get(d["doc_id"])
        G.node(f"doc:{d['doc_id']}", "document", d["doc_label"], doc=d["doc_id"], doc_type=d["doc_type"], date=_doc_date(ex) if ex else None, file=d["file"])

    # ---------------------------------------------------------------- people (identity flow)
    mentions = []
    for did, ex in exs.items():
        for k in _by_role(ex, "person"):
            mentions.append((did, k, ex["fields"][k]["value"]))
    applicant_name = ctx.get("applicant")
    if not applicant_name:
        id_docs = [m for m in mentions if exs[m[0]]["doc_type"] in ("passport", "drivers_license")]
        applicant_name = (id_docs or mentions or [(None, None, "Applicant")])[0][2]
    app = G.node("person:applicant", "person", applicant_name, role="applicant")
    others: list[dict] = []
    id_edges, conflicts = [], []
    for did, k, val in mentions:
        same, score, why = resolve.same_person(applicant_name, val)
        ref = _ref(exs[did], k)
        if same:
            if val != applicant_name and val not in app["merged_from"]:
                app["merged_from"].append({"value": val, "doc": did, "reason": why})
            app["docs"].append(did)
            e = G.edge(f"doc:{did}", app["id"], "names", "identity", "verified", "same_person", f"{val} = {applicant_name} ({why})", ref, {"value": applicant_name}, score)
        else:
            e = G.edge(f"doc:{did}", app["id"], "names", "identity", "conflict", "same_person", f"Name on {did} is '{val}', not the applicant ({why})", ref, {"value": applicant_name}, score)
            conflicts.append(e["id"])
            others.append({"doc": did, "value": val})
        id_edges.append(e["id"])
    bp("same_person", "conflict" if conflicts else ("verified" if id_edges else "unverifiable"), f"{len(id_edges) - len(conflicts)} of {len(id_edges)} documents name the applicant", id_edges)

    # date of birth
    dobs = [(did, k, ex["fields"][k]["value"]) for did, ex in exs.items() for k in _by_role(ex, "dob")]
    if len(dobs) >= 2:
        base = dobs[0]
        dob_edges = []
        for did, k, v in dobs[1:]:
            st = "verified" if v == base[2] else "conflict"
            dob_edges.append(G.edge(f"doc:{did}", app["id"], "date of birth", "identity", st, "dob_consistent", f"Date of birth {v} vs {base[2]} on {base[0]}", _ref(exs[did], k), _ref(exs[base[0]], base[1]))["id"])
        bp("dob_consistent", "conflict" if any(G.edges[int(i[1:]) - 1]["state"] == "conflict" for i in dob_edges) else "verified", f"{len(dobs)} dates of birth compared", dob_edges)
    elif dobs:
        app["dob"] = dobs[0][2]
        bp("dob_consistent", "verified", "only one document states a date of birth")

    # ID validity
    ids = [(did, ex) for did, ex in exs.items() if ex["doc_type"] in ("passport", "drivers_license")]
    if workflow.rule(wf, "id_valid"):
        if ids:
            did, ex = ids[0]
            exp = (ex["fields"].get("expiry_date") or {}).get("value")
            if exp:
                st = "verified" if exp >= app_date else "conflict"
                eid = G.edge(f"doc:{did}", app["id"], "valid ID", "identity", st, "id_valid", f"ID expires {exp}", _ref(ex, "expiry_date"))["id"]
                bp("id_valid", st, f"expires {exp}", [eid])
            else:
                bp("id_valid", "unverifiable", "expiry date not read")
        else:
            bp("id_valid", "missing", "no photo ID uploaded")

    for o in others:
        n = G.node(f"person:{resolve.ascii_lower(o['value']).replace(' ', '_')}", "person", o["value"], role="other")
        n["docs"].append(o["doc"])
        G.edge(f"doc:{o['doc']}", n["id"], "names", "identity", "unverifiable", None, f"{o['value']} appears on {o['doc']} but is not the applicant")

    # payees / drawers on cheques and invoices are expected third parties
    for did, ex in exs.items():
        for k in _by_role(ex, "payee"):
            v = ex["fields"][k]["value"]
            n = G.node(f"org:{resolve.norm_org(v).replace(' ', '_')}", "organisation", v, role="payee")
            n["docs"].append(did)
            G.edge(f"doc:{did}", n["id"], "pays", "money", "verified", None, f"{did} pays {v}", _ref(ex, k))

    # ---------------------------------------------------------------- addresses (address flow)
    addr_nodes: list[dict] = []

    def addr_node(val: str, did: str, field: str) -> dict:
        for n in addr_nodes:
            same, score, why = resolve.same_address(n["label"], val)
            if same:
                if val != n["label"]:
                    n["merged_from"].append({"value": val, "doc": did, "reason": why})
                n["docs"].append(did)
                return n
        n = G.node(f"addr:{len(addr_nodes) + 1}", "address", val)
        n["docs"].append(did)
        addr_nodes.append(n)
        return n

    addr_mentions = [(did, k, ex["fields"][k]["value"]) for did, ex in exs.items() for k in _by_role(ex, "address")]
    for did, k, v in addr_mentions:
        n = addr_node(v, did, k)
        G.edge(f"doc:{did}", n["id"], "lives at", "address", "verified", None, f"{did} gives the address {v}", _ref(exs[did], k))
    if workflow.rule(wf, "current_address"):
        bills = sorted([(exs[d]["fields"].get("bill_date", {}).get("value") or "", d) for d in exs if exs[d]["doc_type"] == "utility_bill"], reverse=True)
        stmts = sorted([(exs[d]["fields"].get("period_end", {}).get("value") or "", d) for d in exs if exs[d]["doc_type"] == "bank_statement"], reverse=True)
        if bills and stmts:
            b, s = bills[0][1], stmts[0][1]
            ba = next((k for k in _by_role(exs[b], "address")), None)
            sa = next((k for k in _by_role(exs[s], "address")), None)
            if ba and sa:
                same, score, why = resolve.same_address(exs[b]["fields"][ba]["value"], exs[s]["fields"][sa]["value"])
                st = "verified" if same else "conflict"
                e = G.edge(f"doc:{b}", f"doc:{s}", "same current address", "address", st, "current_address",
                           f"Utility bill: {exs[b]['fields'][ba]['value']} / latest statement: {exs[s]['fields'][sa]['value']} ({why})", _ref(exs[b], ba), _ref(exs[s], sa), score)
                bp("current_address", st, e["explain"], [e["id"]])
            else:
                bp("current_address", "unverifiable", "address not read on the bill or the statement")
        else:
            bp("current_address", "missing" if not bills else "unverifiable", "needs a utility bill and a bank statement")
        if len(addr_nodes) > 1:
            app["addresses"] = [n["label"] for n in addr_nodes]

    # ---------------------------------------------------------------- organisations
    org_nodes: list[dict] = []

    def org_node(val: str, role: str, did: str) -> dict:
        for n in org_nodes:
            if n.get("role") == role or {n.get("role"), role} <= {"bank", "provider", "employer", "vendor", "org"}:
                same, score, why = resolve.same_org(n["label"], val)
                if same:
                    if val != n["label"]:
                        n["merged_from"].append({"value": val, "doc": did, "reason": why})
                    n["docs"].append(did)
                    return n
        n = G.node(f"org:{len(org_nodes) + 1}", "organisation", val, role=role)
        n["docs"].append(did)
        org_nodes.append(n)
        return n

    employers: dict[str, dict] = {}
    banks_by_doc: dict[str, dict] = {}
    for did, ex in exs.items():
        for role, rel in (("employer", "employed by"), ("bank", "issued by"), ("provider", "issued by"), ("vendor", "issued by")):
            for k in _by_role(ex, role):
                n = org_node(ex["fields"][k]["value"], role, did)
                if role == "employer":
                    employers[did] = n
                    G.edge(app["id"], n["id"], "employed by", "money", "verified", None, f"{did} says the applicant works for {n['label']}", _ref(ex, k))
                else:
                    if role == "bank":
                        banks_by_doc[did] = n
                    G.edge(f"doc:{did}", n["id"], rel, "identity", "verified", None, f"{did} is issued by {ex['fields'][k]['value']}", _ref(ex, k))

    # ---------------------------------------------------------------- accounts
    acct_nodes: dict[str, dict] = {}
    stmt_accounts: dict[str, str] = {}
    for did, ex in exs.items():
        for k in _by_role(ex, "account"):
            l4 = resolve.last4(str(ex["fields"][k]["value"]))
            if not l4:
                continue
            n = acct_nodes.get(l4) or G.node(f"acct:{l4}", "account", f"Account ending {l4}")
            acct_nodes[l4] = n
            n["docs"].append(did)
            if ex["doc_type"] == "bank_statement":
                stmt_accounts[did] = l4
                G.edge(f"doc:{did}", n["id"], "statement of", "money", "verified", None, f"{did} is a statement for account ending {l4}", _ref(ex, k))
                G.edge(app["id"], n["id"], "holds", "money", "verified", None, f"The applicant holds account ending {l4}")
                if did in banks_by_doc:
                    G.edge(n["id"], banks_by_doc[did]["id"], "held at", "money", "verified", None, f"Account ending {l4} is held at {banks_by_doc[did]['label']}")
            elif ex["doc_type"] == "pay_stub":
                G.edge(f"doc:{did}", n["id"], "deposits to", "money", "verified", None, f"{did} pays into account ending {l4}", _ref(ex, k))

    # cheque drawn on a known account and bank
    if workflow.rule(wf, "cheque_account"):
        ch_edges = []
        stmt_routing = {did: (exs[did]["fields"].get("routing_number") or {}).get("value") for did in stmt_accounts}
        for did, ex in exs.items():
            if ex["doc_type"] != "cheque":
                continue
            l4 = resolve.last4(str((ex["fields"].get("account_number") or {}).get("value") or ""))
            rt = (ex["fields"].get("routing_number") or {}).get("value")
            if not l4:
                ch_edges.append(G.edge(f"doc:{did}", app["id"], "drawn on", "money", "unverifiable", "cheque_account", f"Account on {did} not read")["id"])
                continue
            target = acct_nodes.get(l4) or G.node(f"acct:{l4}", "account", f"Account ending {l4}")
            match_stmt = [s for s, a in stmt_accounts.items() if a == l4]
            if not match_stmt:
                e = G.edge(f"doc:{did}", target["id"], "drawn on", "money", "conflict" if stmt_accounts else "missing", "cheque_account", f"Cheque account ending {l4} appears on no statement")
            else:
                srt = stmt_routing.get(match_stmt[0])
                if rt and srt and rt != srt:
                    e = G.edge(f"doc:{did}", target["id"], "drawn on", "money", "conflict", "cheque_account",
                               f"Cheque routing {rt} differs from the statement's routing {srt} for the same account", _ref(ex, "routing_number"), _ref(exs[match_stmt[0]], "routing_number"))
                else:
                    e = G.edge(f"doc:{did}", target["id"], "drawn on", "money", "verified", "cheque_account", f"Cheque drawn on account ending {l4}, same as {match_stmt[0]}", _ref(ex, "account_number"))
            ch_edges.append(e["id"])
        if ch_edges:
            states = {G.edges[int(i[1:]) - 1]["state"] for i in ch_edges}
            bp("cheque_account", "conflict" if "conflict" in states else ("missing" if "missing" in states else "verified"), f"{len(ch_edges)} cheque(s) checked", ch_edges)

    # ---------------------------------------------------------------- money flow
    deposits = []
    for did, ex in exs.items():
        if ex["doc_type"] == "bank_statement":
            for i, t in enumerate(ex.get("transactions") or []):
                if t["direction"] == "in" and t.get("amount"):
                    deposits.append({**t, "doc": did, "i": i})
    stmt_periods = []
    for did, ex in exs.items():
        if ex["doc_type"] == "bank_statement":
            ps, pe = (ex["fields"].get("period_start") or {}).get("value"), (ex["fields"].get("period_end") or {}).get("value")
            stmt_periods.append((ps, pe, did))

    pays = []
    for did, ex in exs.items():
        if ex["doc_type"] == "pay_stub":
            pdv, net = (ex["fields"].get("pay_date") or {}).get("value"), (ex["fields"].get("net_pay") or {}).get("value")
            if pdv and net is not None:
                pays.append({"doc": did, "date": pdv, "net": net, "gross": (ex["fields"].get("gross_pay") or {}).get("value"), "ps": (ex["fields"].get("period_start") or {}).get("value"), "pe": (ex["fields"].get("period_end") or {}).get("value")})

    r_pay = workflow.rule(wf, "pay_to_deposit")
    if r_pay and pays:
        days, tol = r_pay["params"]["days"], r_pay["params"]["tolerance"]
        pe_ids = []
        for p in pays:
            pn = G.node(f"money:pay:{p['doc']}", "money", f"Net pay {p['net']:,.2f}", sub=p["date"], money_kind="pay", amount=p["net"], date=p["date"])
            pn["docs"].append(p["doc"])
            G.edge(f"doc:{p['doc']}", pn["id"], "states pay", "money", "verified", None, f"{p['doc']} states net pay {p['net']:,.2f} on {p['date']}", _ref(exs[p["doc"]], "net_pay"))
            pd_ = date.fromisoformat(p["date"])
            covered = [s for s in stmt_periods if s[0] and s[1] and s[0] <= p["date"] <= s[1]]
            near = [dp for dp in deposits if abs((date.fromisoformat(dp["date"]) - pd_).days) <= days]
            exact = [dp for dp in near if abs(dp["amount"] - p["net"]) <= tol]
            if exact:
                dp = exact[0]
                dn = G.node(f"money:dep:{dp['doc']}:{dp['i']}", "money", f"Deposit {dp['amount']:,.2f}", sub=dp["date"], money_kind="deposit", amount=dp["amount"], date=dp["date"], payer=dp["description"])
                dn["docs"].append(dp["doc"])
                e = G.edge(pn["id"], dn["id"], "arrives as", "money", "verified", "pay_to_deposit", f"Net pay {p['net']:,.2f} ({p['date']}) arrives as a deposit of {dp['amount']:,.2f} on {dp['date']}", {"doc": p["doc"], "field": "net_pay", "value": p["net"]}, {"doc": dp["doc"], "field": "transaction", "value": dp["amount"], "page": dp["page"], "bbox": dp["bbox"], "text": dp["text"]})
            elif near:
                dp = min(near, key=lambda x: abs(x["amount"] - p["net"]))
                dn = G.node(f"money:dep:{dp['doc']}:{dp['i']}", "money", f"Deposit {dp['amount']:,.2f}", sub=dp["date"], money_kind="deposit", amount=dp["amount"], date=dp["date"], payer=dp["description"])
                dn["docs"].append(dp["doc"])
                e = G.edge(pn["id"], dn["id"], "arrives as", "money", "conflict", "pay_to_deposit", f"Pay stub says net pay {p['net']:,.2f} on {p['date']}, but the deposit that day is {dp['amount']:,.2f} ({p['net'] - dp['amount']:+,.2f})", {"doc": p["doc"], "field": "net_pay", "value": p["net"]}, {"doc": dp["doc"], "field": "transaction", "value": dp["amount"], "page": dp["page"], "bbox": dp["bbox"], "text": dp["text"]})
            elif covered:
                e = G.edge(pn["id"], f"doc:{covered[0][2]}", "arrives as", "money", "missing", "pay_to_deposit", f"No deposit of {p['net']:,.2f} within {days} days of {p['date']} on {covered[0][2]}")
            else:
                ph = G.node(f"missing:stmt:{p['date'][:7]}", "missing", f"Statement covering {p['date'][:7]} missing", missing_kind="document")
                e = G.edge(pn["id"], ph["id"], "arrives as", "money", "unverifiable", "pay_to_deposit", f"No statement covers the pay date {p['date']}, so the deposit cannot be checked")
            pe_ids.append(e["id"])
        states = [G.edges[int(i[1:]) - 1]["state"] for i in pe_ids]
        bp("pay_to_deposit", "conflict" if "conflict" in states else "missing" if "missing" in states else "unverifiable" if "unverifiable" in states else "verified", f"{states.count('verified')} of {len(states)} pay dates matched by a deposit", pe_ids)

    if workflow.rule(wf, "employer_pays_account") and employers:
        emp = next(iter(employers.values()))
        cands = []
        for p in pays:
            pd_ = date.fromisoformat(p["date"])
            cands += [dp for dp in deposits if abs((date.fromisoformat(dp["date"]) - pd_).days) <= 3]
        ep_edges = []
        if not deposits:
            bp("employer_pays_account", "unverifiable", "no statement deposits to check")
        else:
            payers = cands or deposits
            named = [dp for dp in payers if resolve.mentions(dp["description"], emp["label"]) >= 0.85]
            via = [dp for dp in payers if PAYROLL_PROVIDERS.search(dp["description"])]
            tgt = next(iter(acct_nodes.values()))["id"] if acct_nodes else app["id"]
            if named:
                e = G.edge(emp["id"], tgt, "pays into", "money", "verified", "employer_pays_account", f"Deposits name {emp['label']}: '{named[0]['description']}'", None, {"doc": named[0]["doc"], "field": "transaction", "value": named[0]["description"], "page": named[0]["page"], "bbox": named[0]["bbox"]})
                ep_edges.append(e["id"])
                bp("employer_pays_account", "verified", e["explain"], ep_edges)
            elif via:
                e = G.edge(emp["id"], tgt, "pays into", "money", "unverifiable", "employer_pays_account",
                           f"{emp['label']} never appears in the deposits; salary-day deposits come from a payroll provider ('{via[0]['description']}'). Confirm the provider pays on {emp['label']}'s behalf.", None,
                           {"doc": via[0]["doc"], "field": "transaction", "value": via[0]["description"], "page": via[0]["page"], "bbox": via[0]["bbox"]})
                ep_edges.append(e["id"])
                bp("employer_pays_account", "unverifiable", e["explain"], ep_edges)
            else:
                ex_dp = payers[0]
                e = G.edge(emp["id"], tgt, "pays into", "money", "conflict", "employer_pays_account",
                           f"{emp['label']} never appears in the deposits; money on pay days comes from '{ex_dp['description']}'", None,
                           {"doc": ex_dp["doc"], "field": "transaction", "value": ex_dp["description"], "page": ex_dp["page"], "bbox": ex_dp["bbox"]})
                ep_edges.append(e["id"])
                bp("employer_pays_account", "conflict", e["explain"], ep_edges)

    r_inc = workflow.rule(wf, "income_consistency")
    if r_inc and pays:
        p0 = pays[0]
        per_year = 26
        if p0.get("ps") and p0.get("pe"):
            span = (date.fromisoformat(p0["pe"]) - date.fromisoformat(p0["ps"])).days + 1
            per_year = next((n for lim, n, _ in FREQ if span <= lim), 12)
        gross = p0.get("gross")
        annual = round(gross * per_year, 2) if gross else None
        stated = ctx.get("stated_income")
        if stated and annual:
            diff = abs(annual - stated) / stated * 100
            st = "verified" if diff <= r_inc["params"]["tolerance_pct"] else "conflict"
            e = G.edge(app["id"], f"money:pay:{p0['doc']}", "income", "money", st, "income_consistency", f"Stated income {stated:,.0f} vs pay stubs {annual:,.0f}/yr ({diff:.0f}% apart)")
            bp("income_consistency", st, e["explain"], [e["id"]])
        elif annual:
            app["annual_income_from_stubs"] = annual
            bp("income_consistency", "verified", f"pay stubs imply about {annual:,.0f} a year; no stated income in the case context")

    if workflow.rule(wf, "invoice_paid"):
        inv_edges = []
        outs = [{**t, "doc": did, "i": i} for did, ex in exs.items() if ex["doc_type"] == "bank_statement" for i, t in enumerate(ex.get("transactions") or []) if t["direction"] == "out"]
        for did, ex in exs.items():
            if ex["doc_type"] not in ("invoice", "receipt"):
                continue
            tot = (ex["fields"].get("total") or {}).get("value")
            if tot is None:
                continue
            hit = [o for o in outs if abs((o["amount"] or 0) - tot) <= workflow.rule(wf, "invoice_paid")["params"]["tolerance"]]
            st = "verified" if hit else ("missing" if outs else "unverifiable")
            inv_edges.append(G.edge(f"doc:{did}", f"doc:{hit[0]['doc']}" if hit else app["id"], "paid by", "money", st, "invoice_paid", f"Invoice total {tot:,.2f} " + ("matches a payment" if hit else "has no matching payment"))["id"])
        if inv_edges:
            states = [G.edges[int(i[1:]) - 1]["state"] for i in inv_edges]
            bp("invoice_paid", "conflict" if "conflict" in states else "missing" if "missing" in states else "verified", f"{states.count('verified')} of {len(states)} invoices matched", inv_edges)

    # ---------------------------------------------------------------- time flow
    if workflow.rule(wf, "statement_chain"):
        ss = sorted([(s[0] or s[1] or "", s[1], s[2]) for s in stmt_periods])
        ch_edges = []
        for (ps1, pe1, d1), (ps2, pe2, d2) in zip(ss, ss[1:]):
            F1, F2 = exs[d1]["fields"], exs[d2]["fields"]
            notes, st = [], "verified"
            if stmt_accounts.get(d1) != stmt_accounts.get(d2):
                st, notes = "conflict", [f"account ending {stmt_accounts.get(d1)} then {stmt_accounts.get(d2)}"]
            cb, ob = (F1.get("closing_balance") or {}).get("value"), (F2.get("opening_balance") or {}).get("value")
            if cb is not None and ob is not None and abs(cb - ob) > 0.01:
                st = "conflict"
                notes.append(f"closing balance {cb:,.2f} but next opening balance {ob:,.2f}")
            if pe1 and ps2:
                gap = (date.fromisoformat(ps2) - date.fromisoformat(pe1)).days
                if gap > 5:
                    missing_month = (date.fromisoformat(pe1) + timedelta(days=3)).strftime("%B %Y")
                    ph = G.node(f"missing:stmt:{missing_month}", "missing", f"{missing_month} statement missing", missing_kind="document")
                    ch_edges.append(G.edge(f"doc:{d1}", ph["id"], "followed by", "time", "missing", "statement_chain", f"Gap of {gap} days between {d1} and {d2}: the {missing_month} statement is missing")["id"])
                    ch_edges.append(G.edge(ph["id"], f"doc:{d2}", "followed by", "time", "missing", "statement_chain", f"{missing_month} statement missing")["id"])
                    continue
            ch_edges.append(G.edge(f"doc:{d1}", f"doc:{d2}", "followed by", "time", st, "statement_chain", "; ".join(notes) or f"{d1} closes at {cb:,.2f}, {d2} opens at {ob:,.2f}" if cb is not None and ob is not None else "; ".join(notes) or "consecutive statements", _ref(exs[d1], "closing_balance"), _ref(exs[d2], "opening_balance"))["id"])
        if ch_edges:
            states = [G.edges[int(i[1:]) - 1]["state"] for i in ch_edges]
            bp("statement_chain", "conflict" if "conflict" in states else "missing" if "missing" in states else "verified", f"{len(ss)} statements in the chain", ch_edges)
        elif len(ss) == 1:
            bp("statement_chain", "verified", "one statement only")

    if workflow.rule(wf, "recency"):
        window = int(wf.get("window_days", 90))
        cutoff = (date.fromisoformat(app_date) - timedelta(days=window)).isoformat()
        stale = []
        for did, ex in exs.items():
            dd = _doc_date(ex)
            if ex["doc_type"] in ("passport", "drivers_license"):
                continue
            if dd and dd < cutoff:
                stale.append(did)
                G.nodes[f"doc:{did}"]["stale"] = True
        bp("recency", "conflict" if stale else "verified", (f"older than {window} days: {', '.join(stale)}" if stale else f"all documents within {window} days of {app_date}"))

    if workflow.rule(wf, "required_documents"):
        present = [exs[d]["doc_type"] for d in exs]
        miss = []
        for req in wf.get("required_documents", []):
            have = sum(1 for t in present if t in req["types"])
            if have < int(req["count"]):
                need = int(req["count"]) - have
                ph = G.node(f"missing:req:{req['label']}", "missing", f"Missing: {req['label']} ({need} more)", missing_kind="required", required=req)
                G.edge(app["id"], ph["id"], "must provide", "time", "missing", "required_documents", f"The workflow needs {req['count']} x {req['label']}; {have} uploaded")
                miss.append(f"{req['label']} ({have}/{req['count']})")
        bp("required_documents", "missing" if miss else "verified", ("missing " + ", ".join(miss)) if miss else "every required document is present")

    # ---------------------------------------------------------------- write
    for n in G.nodes.values():
        n["docs"] = sorted(set(n["docs"]))
    counts = {s: sum(1 for e in G.edges if e["state"] == s) for s in ("verified", "conflict", "missing", "unverifiable")}
    graph = {"case_type": case_type, "context": ctx, "applicant": applicant_name, "nodes": list(G.nodes.values()), "edges": G.edges, "counts": counts}
    gp = write_json(case, "graph/graph.json", graph)
    bpp = write_json(case, "checks/blueprint.json", {"workflow": wf["id"], "rules": blueprint})

    flags = []
    sev_of = {r["rule"]: r["severity"] for r in blueprint}
    req_missing = [e for e in G.edges if e["rule"] == "required_documents" and e["state"] == "missing"]
    if req_missing:
        flags.append(flag("graph_required_documents", f"{len(req_missing)} required document type(s) missing: " + "; ".join(e["explain"] for e in req_missing), "medium", evidence=[gp], deterministic=True, layer="relationship", values={"missing": [e["explain"] for e in req_missing]}))
    for e in G.edges:
        if e["state"] not in ("conflict", "missing") or not e["rule"] or e["rule"] == "required_documents":
            continue
        if e["source"].startswith("missing:"):
            continue  # the placeholder's incoming link already carries this finding
        sev = sev_of.get(e["rule"], "medium")
        if e["state"] == "missing" and sev in ("critical", "high"):
            sev = "medium"  # missing stays medium until the applicant supplies it
        a, b = e.get("a") or {}, e.get("b") or {}
        flags.append(flag(f"graph_{e['rule']}", e["explain"], sev, doc=a.get("doc") or b.get("doc"), field=a.get("field"), evidence=[gp], deterministic=True, layer="relationship", values={"edge": e["id"], "state": e["state"], "flow": e["flow"], "a": a, "b": b}, page=a.get("page") or b.get("page"), bbox=a.get("bbox") or b.get("bbox")))
    audit(case, "engine:graph", "build", case_type, counts)
    return result([gp, bpp], f"graph: {len(G.nodes)} nodes, {len(G.edges)} links ({counts['verified']} verified, {counts['conflict']} conflicting, {counts['missing']} missing, {counts['unverifiable']} unverifiable)", flags, counts=counts)
