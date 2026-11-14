"""Document-type packs: classification and field extraction.

A pack (workflows/doctypes/<id>.yaml) lists the keywords that identify the
document, the fields to read (with label anchors, a type and a graph role) and
the checks to run. Adding a new financial document type = adding one file.
Every extracted value keeps the page and box it was read from.
"""

from __future__ import annotations

import re
from datetime import date
from functools import lru_cache

import yaml
from dateutil import parser as dparser

from .core import ROOT
from .textlayer import lines_of

PACK_DIR = ROOT / "workflows" / "doctypes"

MONEY_RE = re.compile(r"\(?-?\$?\s?\d{1,3}(?:,\d{3})+(?:\.\d{2})?\)?|\(?-?\$?\s?\d+\.\d{2}\)?")
DATE_RES = [
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b"),
    re.compile(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2},? \d{4}\b", re.I),
    re.compile(r"\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]* \d{4}\b", re.I),
]
MRZ_LINE = re.compile(r"^[A-Z0-9<]{28,44}$")
# MICR: 9-digit routing, then account, then serial, separated by transit/on-us
# symbols (which often come out of text layers or OCR as odd characters).
MICR_RE = re.compile(r"(?<!\d)(\d{9})(?!\d)[^\d]{1,4}([\d-]{4,20})(?:[^\d]{1,4}(\d{3,6}))?")
# One-word labels this generic only count when written as a label ("Bank:").
GENERIC_LABELS = {"name", "bank", "date", "address", "account", "amount", "total", "from", "to", "through", "net", "gross", "company", "employer", "customer", "employee", "issuer", "store", "merchant", "vendor", "provider", "dear", "exp", "iss", "dl", "class", "drawer", "routing", "tax", "subtotal"}
ORG_HINTS = {
    "bank": re.compile(r"(?i)\b(bank|credit union|savings|bancorp|financial|trust)\b"),
    "employer": re.compile(r"(?i)\b(ltd|llc|inc|corp|company|co\.|group|logistics|services|holdings)\b"),
    "provider": re.compile(r"(?i)\b(energy|electric|power|gas|water|utilities|utility|telecom)\b"),
    "vendor": re.compile(r"(?i)\b(ltd|llc|inc|corp|company|store|shop|services)\b"),
}


@lru_cache(maxsize=1)
def packs() -> dict[str, dict]:
    out = {}
    for p in sorted(PACK_DIR.glob("*.yaml")):
        d = yaml.safe_load(p.read_text(encoding="utf-8"))
        out[d["id"]] = d
    return out


def reload_packs() -> None:
    packs.cache_clear()


# ---------------------------------------------------------------- parsing
def parse_money(s: str) -> float | None:
    m = MONEY_RE.search(s or "")
    if not m:
        return None
    t = m.group(0)
    neg = t.startswith("(") or "-" in t
    v = float(re.sub(r"[^\d.]", "", t) or 0)
    return -v if neg else v


def all_money(s: str) -> list[tuple[float, int, int]]:
    out = []
    for m in MONEY_RE.finditer(s or ""):
        t = m.group(0)
        neg = t.startswith("(") or "-" in t
        try:
            v = float(re.sub(r"[^\d.]", "", t))
        except ValueError:
            continue
        out.append((-v if neg else v, m.start(), m.end()))
    return out


def parse_date(s: str) -> str | None:
    for r in DATE_RES:
        m = r.search(s or "")
        if m:
            try:
                return dparser.parse(m.group(0), dayfirst=False).date().isoformat()
            except (ValueError, OverflowError):
                continue
    return None


def norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip(" :-\t")).strip()


def parse_value(kind: str, raw: str):
    raw = norm_text(raw)
    if not raw:
        return None
    if kind == "money":
        return parse_money(raw)
    if kind == "date":
        return parse_date(raw)
    if kind == "routing":
        m = re.search(r"\b(\d{9})\b", raw)
        return m.group(1) if m else None
    if kind == "account":
        m = re.search(r"[*xX\d][*xX\d -]{3,}\d", raw)
        return re.sub(r"[\s-]", "", m.group(0)) if m else None
    if kind == "card":
        m = re.search(r"\b(?:\d[ -]?){13,19}\b", raw)
        return re.sub(r"\D", "", m.group(0)) if m else None
    return raw


# ---------------------------------------------------------------- classification
def classify(text: str, filename: str = "") -> tuple[str, float, dict]:
    low = (text + " " + filename.replace("_", " ")).lower()
    scores = {}
    for pid, p in packs().items():
        kws = p.get("keywords") or []
        if not kws:
            continue
        hit = sum(1 for k in kws if str(k).lower() in low)
        scores[pid] = hit / max(4, len(kws)) + (0.5 if pid.replace("_", " ") in filename.lower().replace("_", " ") else 0)
    if not scores or max(scores.values()) == 0:
        return "generic", 0.0, scores
    best = max(scores, key=scores.get)
    return best, round(min(1.0, scores[best]), 3), scores


# ---------------------------------------------------------------- field extraction
def _union(ws: list[dict]) -> list[float]:
    return [min(w["b"][0] for w in ws), min(w["b"][1] for w in ws), max(w["b"][2] for w in ws), max(w["b"][3] for w in ws)]


def _find_label(line: list[dict], label: str) -> tuple[int, int] | None:
    """Index range of words in `line` that spell `label` (case-insensitive)."""
    toks = [re.sub(r"[^a-z0-9#$']", "", w["t"].lower()) for w in line]
    lab = [re.sub(r"[^a-z0-9#$']", "", x) for x in str(label).lower().split()]
    lab = [x for x in lab if x]
    n = len(lab)
    generic = n == 1 and lab[0] in GENERIC_LABELS
    for i in range(len(toks) - n + 1):
        if toks[i : i + n] == lab:
            if generic and not line[i]["t"].rstrip().endswith(":"):
                continue
            return i, i + n
    return None


def _gap_break(prev: dict, w: dict) -> bool:
    """A column break: the horizontal gap is far wider than a word space."""
    ch = (prev["b"][2] - prev["b"][0]) / max(1, len(prev["t"]))
    h = prev["b"][3] - prev["b"][1]
    return (w["b"][0] - prev["b"][2]) > max(6 * ch, 2.2 * h, 40)


def _cut_at_next_label(words: list[dict]) -> list[dict]:
    """A value ends where the next label starts ("... Amount: 1,500") or at a column break."""
    out = []
    for i, w in enumerate(words):
        if i > 0 and ((w["t"].endswith(":") and not re.search(r"\d", w["t"])) or _gap_break(words[i - 1], w)):
            break
        out.append(w)
    return out


def _nice(name: str) -> str:
    return " ".join(x.capitalize() if x.isupper() else x for x in name.split()) if name.isupper() else name


def _header_org(pages: list[dict], role: str) -> tuple[str, dict, list[dict]] | None:
    """Issuer names usually sit in the page header, not behind a label."""
    hint = ORG_HINTS.get(role)
    if not hint or not pages:
        return None
    pg = pages[0]
    for line in lines_of(pg["words"])[:6]:
        segs: list[list[dict]] = [[]]
        for i, w in enumerate(line):  # split the line into columns; labels end a segment
            if i > 0 and _gap_break(line[i - 1], w):
                segs.append([])
            segs[-1].append(w)
        for seg in segs:
            head = []
            for w in seg:
                if w["t"].endswith(":"):
                    break
                head.append(w)
            text = " ".join(w["t"] for w in head)
            if not text:
                continue
            name = re.split(r"\s+[-|]\s+", text)[0].strip()
            if hint.search(name) and 2 <= len(name.split()) <= 8:
                ws = [w for w in head if w["t"] in name.split()]
                return _nice(name), pg, ws or head
    return None


def extract_fields(pack: dict, pages: list[dict]) -> dict:
    """pages: [{page, words}] -> {field: {value, raw, page, bbox, conf}}"""
    fields: dict[str, dict] = {}
    used: set[tuple[int, int, int]] = set()
    specs = pack.get("fields") or {}
    # longest labels first across all fields, so "employee name" beats "name"
    order = sorted(
        ((fname, spec, lab) for fname, spec in specs.items() for lab in spec.get("labels", [])),
        key=lambda x: -len(x[2]),
    )
    for fname, spec, label in order:
        if fname in fields:
            continue
        kind = spec.get("type", "text")
        for pg in pages:
            lines = lines_of(pg["words"])
            for li, line in enumerate(lines):
                hit = _find_label(line, label)
                if not hit:
                    continue
                key = (pg["page"], li, hit[0])
                if key in used:
                    continue
                after = _cut_at_next_label(line[hit[1] :])
                raw_words = [w for w in after if w["t"].strip(":") != ""]
                val = parse_value(kind, " ".join(w["t"] for w in raw_words)) if raw_words else None
                if val is None and li + 1 < len(lines):
                    lx0 = line[hit[0]]["b"][0]
                    below = [w for w in lines[li + 1] if w["b"][2] >= lx0 - 30]
                    if kind in ("address",) and li + 2 < len(lines):
                        below2 = [w for w in lines[li + 2] if w["b"][2] >= lx0 - 30]
                        cand = " ".join(w["t"] for w in below) + ", " + " ".join(w["t"] for w in below2)
                        v2 = parse_value(kind, cand)
                        if v2:
                            raw_words, val = below + below2, v2
                    if val is None and below:
                        v2 = parse_value(kind, " ".join(w["t"] for w in below))
                        if v2 is not None:
                            raw_words, val = below, v2
                if val is None:
                    continue
                if kind in ("money",) and raw_words:
                    # keep only the first amount's words for the box
                    for w in raw_words:
                        if MONEY_RE.search(w["t"]):
                            raw_words = [w]
                            break
                used.add(key)
                fields[fname] = {
                    "value": val,
                    "raw": " ".join(w["t"] for w in raw_words),
                    "type": kind,
                    "role": spec.get("role"),
                    "label": label,
                    "page": pg["page"],
                    "bbox": _union(raw_words) if raw_words else None,
                    "conf": round(min(w.get("conf", 1.0) for w in raw_words), 3) if raw_words else None,
                }
                break
            if fname in fields:
                break
    # issuer names from the page header when no label carried them
    for fname, spec in specs.items():
        if fname in fields or spec.get("type") != "org":
            continue
        got = _header_org(pages, spec.get("role") or "")
        if got:
            name, pg, ws = got
            fields[fname] = {"value": name, "raw": name, "type": "org", "role": spec.get("role"), "label": "page header", "page": pg["page"], "bbox": _union(ws), "conf": 1.0}
    return fields


def extract_transactions(pages: list[dict]) -> list[dict]:
    """Statement rows: date, description, amount (+ in, - out), balance."""
    rows = []
    for pg in pages:
        lines = lines_of(pg["words"])
        cols: dict[str, float] = {}
        for line in lines:
            low = [w["t"].lower() for w in line]
            if any("balance" in t for t in low) and any(k in " ".join(low) for k in ("deposit", "credit", "withdraw", "debit", "amount")):
                for w in line:
                    t = w["t"].lower()
                    cx = (w["b"][0] + w["b"][2]) / 2
                    if t.startswith(("deposit", "credit")):
                        cols["in"] = cx
                    elif t.startswith(("withdraw", "debit")):
                        cols["out"] = cx
                    elif t.startswith("balance"):
                        cols["bal"] = cx
                    elif t.startswith("amount"):
                        cols["amt"] = cx
                continue
            text = " ".join(w["t"] for w in line)
            d = parse_date(" ".join(w["t"] for w in line[:3]))
            if not d:
                continue
            money_words = [w for w in line if MONEY_RE.fullmatch(w["t"].strip()) or MONEY_RE.fullmatch(w["t"].replace("$", "").strip())]
            if not money_words:
                continue
            desc_words = [w for w in line if w not in money_words and not parse_date(w["t"])]
            # drop leading date tokens like "Jan" "15," when date is textual
            desc = " ".join(w["t"] for w in desc_words if not re.fullmatch(r"(?i)(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?|\d{1,2},?|\d{4}", w["t"]))
            amt, bal, direction = None, None, None
            vals = [(parse_money(w["t"]), (w["b"][0] + w["b"][2]) / 2, w) for w in money_words]
            if "bal" in cols and len(vals) >= 2:
                bal_v = min(vals, key=lambda v: abs(v[1] - cols["bal"]))
                bal = bal_v[0]
                rest = [v for v in vals if v is not bal_v]
                if rest:
                    v = rest[0]
                    amt = abs(v[0])
                    if "in" in cols and "out" in cols:
                        direction = "in" if abs(v[1] - cols["in"]) < abs(v[1] - cols["out"]) else "out"
                    else:
                        direction = "out" if v[0] < 0 else "in"
            else:
                v = vals[0]
                amt, direction = abs(v[0]), ("out" if v[0] < 0 else "in")
                if len(vals) > 1:
                    bal = vals[-1][0]
            if direction is None:
                direction = "out" if re.search(r"(?i)withdraw|debit|purchase|payment to|fee|atm", desc) else "in"
            rows.append(
                {
                    "date": d,
                    "description": norm_text(desc),
                    "amount": amt,
                    "direction": direction,
                    "balance": bal,
                    "page": pg["page"],
                    "bbox": _union(line),
                    "text": text,
                }
            )
    return rows


TO_ALPHA = str.maketrans({"0": "O", "1": "I", "5": "S", "8": "B", "2": "Z", "6": "G"})
TO_DIGIT = str.maketrans({"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "S": "5", "B": "8", "Z": "2", "G": "6"})


def fix_td3(lines: list[str]) -> list[str]:
    """OCR often swaps O/0, I/1, S/5 in an MRZ; each TD3 position is either
    letters or digits, so map each character back by its position."""
    if len(lines) != 2 or len(lines[0]) != 44 or len(lines[1]) != 44:
        return lines
    l1 = lines[0][:2] + lines[0][2:5].translate(TO_ALPHA) + lines[0][5:].translate(TO_ALPHA)
    l2 = lines[1]
    digits = [9, *range(13, 20), 19, *range(21, 28), 27, 42, 43]
    alpha = [10, 11, 12, 20]
    chars = list(l2)
    for i in digits:
        chars[i] = chars[i].translate(TO_DIGIT)
    for i in alpha:
        chars[i] = chars[i].translate(TO_ALPHA)
    return [l1, "".join(chars)]


def find_mrz(pages: list[dict]) -> list[str]:
    out = []
    for pg in pages:
        for line in lines_of(pg["words"]):
            t = "".join(w["t"] for w in line).replace(" ", "").upper().replace("«", "<").replace("‹", "<")
            if MRZ_LINE.match(t) and t.count("<") >= 2:
                out.append(t)
    if len(out) >= 2 and len(out[-1]) == 44 and len(out[-2]) == 44 and pages and pages[0].get("source") == "ocr":
        out = out[:-2] + fix_td3(out[-2:])
    return out


def find_micr(pages: list[dict]) -> dict | None:
    for pg in pages:
        for line in reversed(lines_of(pg["words"])):
            t = " ".join(w["t"] for w in line)
            if not re.search(r"[⑆⑈:|]|\d{9}", t):
                continue
            m = MICR_RE.search(t)
            if m:
                return {
                    "routing": m.group(1),
                    "account": re.sub(r"\D", "", m.group(2)),
                    "serial": m.group(3),
                    "line": t,
                    "page": pg["page"],
                    "bbox": _union(line),
                }
    return None


def today() -> str:
    return date.today().isoformat()
