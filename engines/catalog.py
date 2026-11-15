"""Document catalog and page sorter.

The catalog (workflows/catalog/documents.yaml) lists every kind of document a
bank, lender, landlord, insurer or account-opening team may ask for. This module
scores each page against it and splits a mixed upload into separate documents:

  classify_page(page)  -> the best catalog type for one page, with the phrases
                          that decided it, a confidence and the runner-up
  sort_pages(pages)    -> groups consecutive pages into documents. A new
                          document starts on "page 1 of N", when the type
                          changes with confidence, when the account number or
                          statement period changes, when a second first page
                          of the same type appears (a second "opening balance"),
                          or when a one-page type repeats.

Every decision is explainable: each page records why it was sorted the way it
was, and an investigator (or the agent) can override a document's type.

  python -m engines.catalog --markdown docs/DOCUMENT_CATALOG.md
"""

from __future__ import annotations

import re
import sys
import unicodedata
from functools import lru_cache
from pathlib import Path

import yaml

from . import doctypes, textlayer

CATALOG = Path(__file__).resolve().parent.parent / "workflows" / "catalog" / "documents.yaml"
TOP_LINES = 12  # a title in the first lines of a page is a heading
MIN_SCORE = 3.0  # below this a page is "not recognised"
SURE = 0.35  # confidence above which a page may start a new document on its own


def norm(s: str) -> str:
    """Lowercase, strip accents, unify quotes and spaces, so 'Relevé' == 'releve'."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("’", "'").replace("‘", "'").replace("`", "'")
    return re.sub(r"[ \t]+", " ", s)


def _pat(phrase: str) -> re.Pattern:
    return re.compile(r"(?<![a-z0-9])" + re.escape(norm(str(phrase)).strip()) + r"(?![a-z0-9])")


@lru_cache(maxsize=1)
def load() -> dict:
    raw = yaml.safe_load(CATALOG.read_text(encoding="utf-8"))
    fams = raw["families"]
    packs = doctypes.packs()
    types: dict[str, dict] = {}
    for t in raw["types"]:
        t = dict(t)
        t.setdefault("pack", "generic")
        if t["pack"] not in packs:
            t["pack"] = "generic"
        for k in ("titles", "keywords", "starts", "signals", "not", "used_for"):
            t[k] = [str(x) for x in (t.get(k) or [])]
        have = {norm(x) for x in t["titles"] + t["keywords"]}
        if t["id"] == t["pack"]:  # keep the detailed pack's own keywords as supporting words
            t["keywords"] += [str(k) for k in (packs[t["pack"]].get("keywords") or []) if norm(str(k)) not in have]
        t["family_label"] = fams.get(t["family"], {}).get("label", t["family"].title())
        t["_titles"] = [(x, _pat(x), len(norm(x).split())) for x in t["titles"]]
        t["_kw"] = [(x, _pat(x)) for x in t["keywords"]]
        t["_starts"] = [_pat(x) for x in t["starts"]]
        t["_not"] = [(x, _pat(x)) for x in t["not"]]
        types[t["id"]] = t
    return {"families": fams, "types": types}


def reload() -> None:
    load.cache_clear()


def get(type_id: str) -> dict:
    T = load()["types"]
    return T.get(type_id) or T["generic"]


def public() -> dict:
    """The catalog without compiled patterns, for the API and the docs."""
    c = load()
    fams = sorted(c["families"].items(), key=lambda kv: kv[1].get("order", 50))
    out = []
    for fid, f in fams:
        items = [t for t in c["types"].values() if t["family"] == fid]
        out.append(
            {
                "id": fid,
                "label": f["label"],
                "types": [{k: t[k] for k in ("id", "label", "pack", "used_for", "titles")} | {"checked": t["pack"] != "generic"} for t in items],
            }
        )
    return {"families": out, "count": sum(len(f["types"]) for f in out)}


# ---------------------------------------------------------------- machine signals
IBAN_RE = re.compile(r"\b([A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?)\b")
CARD_RE = re.compile(r"(?<!\d)(?:\d[ -]?){14,18}\d(?!\d)")
SWIFT_RE = re.compile(r"\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b")
SIGNAL_WEIGHT = {"mrz_td3": 5.0, "mrz_td1": 5.0, "micr": 3.0, "card_number": 3.0, "iban": 1.5, "swift": 1.5}


def _iban_ok(s: str) -> bool:
    s = s.replace(" ", "")
    if not 15 <= len(s) <= 34:
        return False
    r = s[4:] + s[:4]
    try:
        return int("".join(str(int(c, 36)) for c in r)) % 97 == 1
    except ValueError:
        return False


def signals(page: dict, text: str) -> set[str]:
    out: set[str] = set()
    mrz = doctypes.find_mrz([page])
    if mrz:
        out.add("mrz_td3" if len(mrz[-1]) == 44 else "mrz_td1" if len(mrz[-1]) == 30 else "mrz")
    if doctypes.find_micr([page]):
        out.add("micr")
    if any(_iban_ok(m) for m in IBAN_RE.findall(text)):
        out.add("iban")
    for m in CARD_RE.findall(text):
        d = re.sub(r"\D", "", m)
        if 15 <= len(d) <= 16 and _luhn(d):
            out.add("card_number")
            break
    low = text.lower()
    if ("swift" in low or "bic" in low) and SWIFT_RE.search(text):
        out.add("swift")
    return out


def _luhn(d: str) -> bool:
    s, alt = 0, False
    for ch in reversed(d):
        n = int(ch)
        if alt:
            n = n * 2 - 9 if n * 2 > 9 else n * 2
        s += n
        alt = not alt
    return s % 10 == 0


# ---------------------------------------------------------------- continuity cues
PAGE_OF = re.compile(r"(?:page|pagina|pag\.|seite|blatt|folha|pg\.?)\s*(\d{1,3})\s*(?:of|de|sur|von|di|van|/)\s*(\d{1,3})")
PAGE_FRAC = re.compile(r"^\s*(\d{1,2})\s*/\s*(\d{1,2})\s*$")
ACCT = re.compile(r"(?:account|acct|a/c|iban|compte|cuenta|conta|konto|rekening|card ending)\D{0,24}?([0-9*x•][0-9*x• -]{3,30}[0-9])")
PERIOD = re.compile(r"(?:statement period|period|from|du|del|vom|periodo)\s*:?\s*([a-z0-9][a-z0-9 ,./-]{5,18}?)\s*(?:to|through|thru|-|–|au|al|bis|a)\s*([a-z0-9][a-z0-9 ,./-]{5,18})")


def _cues(lines_norm: list[str]) -> dict:
    page_of = None
    for ln in lines_norm[:6] + lines_norm[-6:]:
        m = PAGE_OF.search(ln) or PAGE_FRAC.match(ln)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if 1 <= a <= b <= 500:
                page_of = (a, b)
                break
    full = "\n".join(lines_norm)
    acct = None
    m = ACCT.search(full)
    if m:
        digits = re.sub(r"\D", "", m.group(1))
        acct = digits[-4:] if len(digits) >= 4 else None
    period = None
    m = PERIOD.search(full)
    if m:
        period = doctypes.parse_date(m.group(1).strip(" ,.-"))
    return {"page_of": page_of, "acct": acct, "period": period}


# ---------------------------------------------------------------- one page
def classify_page(page: dict, filename: str = "") -> dict:
    lines = [" ".join(w["t"] for w in ln) for ln in textlayer.lines_of(page.get("words") or [])]
    raw = "\n".join(lines)
    ln_norm = [norm(x) for x in lines]
    top, full = "\n".join(ln_norm[:TOP_LINES]), "\n".join(ln_norm)
    fname = norm(re.sub(r"[_\-.]+", " ", Path(filename).stem)) if filename else ""
    sig = signals(page, raw)
    ranked = []
    for t in load()["types"].values():
        if t["id"] == "generic":
            continue
        why: list[str] = []
        tw = []
        for phrase, p, nw in t["_titles"]:
            if p.search(top):
                tw.append((4.0 + 0.75 * (nw - 1), phrase))
            elif p.search(full):
                tw.append((1.5 + 0.5 * (nw - 1), phrase))
        tw.sort(reverse=True)
        sc = 0.0
        if tw:
            sc += tw[0][0] + (0.5 * tw[1][0] if len(tw) > 1 else 0)
            why += [f'heading "{x[1]}"' for x in tw[:2]]
        kw = [x for x, p in t["_kw"] if p.search(full)]
        sc += 0.8 * min(len(kw), 6)
        if kw:
            why.append("words: " + ", ".join(kw[:4]))
        for s in t["signals"]:
            if s in sig:
                sc += SIGNAL_WEIGHT.get(s, 1.0)
                why.append({"mrz_td3": "passport MRZ", "mrz_td1": "ID card MRZ", "micr": "MICR line", "iban": "valid IBAN", "card_number": "card number (Luhn)", "swift": "SWIFT code"}.get(s, s))
        neg = [x for x, p in t["_not"] if p.search(full)]
        sc -= 3.0 * len(neg)
        if fname and any(p.search(fname) for _, p, _ in t["_titles"]):
            sc += 2.0
            why.append("file name")
        if sc > 0:
            ranked.append((round(sc, 2), t["id"], why))
    ranked.sort(key=lambda r: -r[0])
    best = ranked[0] if ranked else (0.0, "generic", [])
    second = ranked[1][0] if len(ranked) > 1 else 0.0
    if best[0] < MIN_SCORE:
        tid, conf, why = "generic", round(min(0.3, best[0] / 10), 3), ["not recognised"] + ([f"closest: {get(best[1])['label']}"] if best[0] > 0 else [])
    else:
        margin = (best[0] - second) / max(best[0], 1e-6)
        conf = round(min(1.0, best[0] / 9.0) * (0.5 + 0.5 * min(1.0, margin * 2)), 3)
        tid, why = best[1], best[2]
    t = get(tid)
    starts = any(p.search(full) for p in t["_starts"])
    return {
        "type": tid,
        "score": best[0] if tid != "generic" else 0.0,
        "conf": conf,
        "why": why,
        "alt": [{"type": r[1], "label": get(r[1])["label"], "score": r[0]} for r in ranked[1:3] if r[0] >= MIN_SCORE / 2],
        "signals": sorted(sig),
        "starts": starts,
        "blank": len(page.get("words") or []) < 5,
        **_cues(ln_norm),
    }


# ---------------------------------------------------------------- many pages
def sort_pages(pages: list[dict], filename: str = "") -> list[dict]:
    """Group a file's pages into documents. Returns [{type, conf, why, alt, pages, reasons}]."""
    groups: list[dict] = []
    for pg in pages:
        a = classify_page(pg, filename)
        pg["_sort"] = a
        if not groups:
            groups.append(_new(a, pg, "first page of the file"))
            continue
        g = groups[-1]
        gt = get(g["type"])
        sure = a["conf"] >= SURE and a["score"] >= 4.0
        reason = None
        if a["blank"]:
            pass
        elif a["page_of"] and a["page_of"][0] == 1:
            reason = f"page shows 1 of {a['page_of'][1]}"
        elif a["page_of"] and a["page_of"][0] > 1 and (g["last_page_of"] is None or a["page_of"][0] == g["last_page_of"][0] + 1):
            reason = None  # explicit continuation
        elif sure and a["type"] != g["type"]:
            if g["conf"] < 0.2 and len(g["pages"]) == 1:
                _adopt(g, a)  # an unrecognised cover page belongs to the document after it
            else:
                reason = f"type changes to {get(a['type'])['label']}"
        elif a["type"] == g["type"]:
            if a["acct"] and g["acct"] and a["acct"] != g["acct"]:
                reason = f"account changes (...{g['acct']} to ...{a['acct']})"
            elif a["period"] and g["period"] and a["period"] != g["period"]:
                reason = f"statement period changes ({g['period']} to {a['period']})"
            elif a["starts"] and g["seen_start"]:
                reason = "a second first page of the same kind"
            elif gt.get("max_pages") and len(g["pages"]) >= int(gt["max_pages"]):
                reason = f"{gt['label']} is a {gt['max_pages']}-page document"
        if reason:
            groups.append(_new(a, pg, reason))
        else:
            g["pages"].append(pg)
            if a["score"] > g["score"] and a["type"] == g["type"]:
                g.update(conf=a["conf"], score=a["score"], why=a["why"])
            g["acct"] = g["acct"] or a["acct"]
            g["period"] = g["period"] or a["period"]
            g["seen_start"] = g["seen_start"] or a["starts"]
            g["last_page_of"] = a["page_of"] or g["last_page_of"]
    for g in groups:
        for k in ("acct", "period", "seen_start", "last_page_of"):
            g.pop(k, None)
    return groups


def _new(a: dict, pg: dict, reason: str) -> dict:
    return {"type": a["type"], "conf": a["conf"], "score": a["score"], "why": a["why"], "alt": a["alt"], "pages": [pg], "split_reason": reason, "acct": a["acct"], "period": a["period"], "seen_start": a["starts"], "last_page_of": a["page_of"]}


def _adopt(g: dict, a: dict) -> None:
    g.update(type=a["type"], conf=a["conf"], score=a["score"], why=a["why"], alt=a["alt"], acct=a["acct"], period=a["period"], seen_start=a["starts"])


# ---------------------------------------------------------------- docs
def markdown() -> str:
    c = public()
    out = [
        "# Document catalog",
        "",
        f"{c['count']} document types in {len(c['families'])} families. The intake sorter reads every page of every upload, matches it against this catalog and splits a mixed upload into separate documents.",
        "",
        "**Checked** means a detailed pack reads its fields and runs document-specific checks. Every other type is still recognised, sorted, run through the PDF, pixel and character forensics and linked on the relationship graph, with general field reading.",
        "",
        "Generated from `workflows/catalog/documents.yaml` by `python -m engines.catalog --markdown docs/DOCUMENT_CATALOG.md`.",
        "",
    ]
    for f in c["families"]:
        out += [f"## {f['label']} ({len(f['types'])})", "", "| Document | Checked | Used for | Recognised by headings such as |", "|---|---|---|---|"]
        for t in f["types"]:
            out.append(f"| {t['label']} | {'yes' if t['checked'] else ''} | {', '.join(t['used_for'])} | {', '.join(t['titles'][:5])} |")
        out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--markdown":
        Path(sys.argv[2]).write_text(markdown(), encoding="utf-8")
        print(f"wrote {sys.argv[2]}")
    else:
        print(public()["count"], "types")
