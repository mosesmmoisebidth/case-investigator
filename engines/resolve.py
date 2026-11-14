"""Entity resolution: decide when two mentions are the same person, address,
organisation or account, and record why. Normalise first, then compare parts
(surname and first name or initial; house number and street; account last 4).
"""

from __future__ import annotations

import re
import unicodedata

from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler

TITLES = {"mr", "mrs", "ms", "miss", "dr", "prof", "sir", "madam", "jr", "sr", "ii", "iii"}
# USPS standard street suffix and unit abbreviations (Publication 28).
ADDR_ABBR = {
    "street": "st", "avenue": "ave", "road": "rd", "boulevard": "blvd", "drive": "dr", "lane": "ln", "court": "ct",
    "place": "pl", "terrace": "ter", "highway": "hwy", "parkway": "pkwy", "circle": "cir", "square": "sq",
    "apartment": "apt", "suite": "ste", "unit": "unit", "floor": "fl", "north": "n", "south": "s", "east": "e", "west": "w",
    "northeast": "ne", "northwest": "nw", "southeast": "se", "southwest": "sw", "#": "apt",
}


def ascii_lower(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return s.lower()


# ------------------------------------------------------------------ people
def name_parts(name: str) -> list[str]:
    s = ascii_lower(name)
    if "," in s:  # "DOE, JOHN Q" -> "john q doe"
        a, b = s.split(",", 1)
        s = f"{b} {a}"
    toks = [t for t in re.sub(r"[^a-z ]", " ", s).split() if t not in TITLES]
    return toks


def same_person(a: str, b: str) -> tuple[bool, float, str]:
    pa, pb = name_parts(a), name_parts(b)
    if not pa or not pb:
        return False, 0.0, "name missing"
    la, lb = pa[-1], pb[-1]
    sur = JaroWinkler.similarity(la, lb)
    if sur < 0.92:
        return False, round(sur * 0.5, 3), f"surnames differ ('{la}' vs '{lb}')"
    fa, fb = pa[0], pb[0]
    if fa == fb:
        first, why = 1.0, f"same first name '{fa}'"
    elif len(fa) == 1 or len(fb) == 1:
        first, why = (0.9, f"initial '{fa[0]}.' matches '{fb if len(fa) == 1 else fa}'") if fa[0] == fb[0] else (0.0, "initials differ")
    else:
        first = JaroWinkler.similarity(fa, fb)
        why = f"first names '{fa}' / '{fb}'"
    # middle names may be dropped, but must not contradict
    mids_a, mids_b = pa[1:-1], pb[1:-1]
    mid_ok = not (mids_a and mids_b and mids_a[0][0] != mids_b[0][0])
    score = round(0.55 * sur + 0.45 * first - (0 if mid_ok else 0.25), 3)
    same = sur >= 0.92 and first >= 0.88 and mid_ok
    return same, score, f"same surname '{la}', {why}" + ("" if mid_ok else ", middle names differ")


# ------------------------------------------------------------------ addresses
def norm_address(s: str) -> str:
    s = ascii_lower(s).replace(".", " ").replace(",", " , ")
    toks = [ADDR_ABBR.get(t, t) for t in re.sub(r"[^a-z0-9#, ]", " ", s).split()]
    return " ".join(t for t in toks if t != ",")


def street_part(s: str) -> str:
    """'12 elm st springfield il 62701' -> '12 elm st' (before the first comma when given)."""
    first = ascii_lower(s).split(",")[0]
    return norm_address(first)


def same_address(a: str, b: str) -> tuple[bool, float, str]:
    na, nb = norm_address(a), norm_address(b)
    num_a = re.match(r"\d+", na)
    num_b = re.match(r"\d+", nb)
    if num_a and num_b and num_a.group(0) != num_b.group(0):
        return False, 0.3, f"house numbers differ ({num_a.group(0)} vs {num_b.group(0)})"
    sa, sb = street_part(a), street_part(b)
    st = fuzz.token_set_ratio(sa, sb) / 100
    full = fuzz.token_set_ratio(na, nb) / 100
    score = round(0.7 * st + 0.3 * full, 3)
    if st < 0.85:
        return False, score, f"streets differ ('{sa}' vs '{sb}')"
    return score >= 0.85, score, f"same street '{sa}'"


# ------------------------------------------------------------------ organisations
LEGAL = re.compile(r"\b(ltd|limited|llc|inc|incorporated|corp|corporation|co|company|plc|na|n a|national association|group)\b")


def norm_org(s: str) -> str:
    s = ascii_lower(s).replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(LEGAL.sub(" ", s).split())


def same_org(a: str, b: str) -> tuple[bool, float, str]:
    na, nb = norm_org(a), norm_org(b)
    if not na or not nb:
        return False, 0.0, "name missing"
    s = max(fuzz.token_set_ratio(na, nb), fuzz.partial_ratio(na, nb) if min(len(na), len(nb)) >= 5 else 0) / 100
    return s >= 0.88, round(s, 3), f"'{na}' vs '{nb}'"


def mentions(text: str, org: str) -> float:
    """How strongly a free-text line (e.g. a deposit description) names `org`."""
    no = norm_org(org)
    if not no:
        return 0.0
    return round(fuzz.partial_ratio(no, norm_org(text)) / 100, 3)


# ------------------------------------------------------------------ accounts
def last4(acct: str | None) -> str | None:
    if not acct:
        return None
    d = re.sub(r"\D", "", acct)
    return d[-4:] if len(d) >= 4 else None
