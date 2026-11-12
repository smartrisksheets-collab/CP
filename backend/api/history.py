"""
Issuer history: three audited years plus an optional half-year interim.

Pure functions, no database or AI calls, so every rule here is unit tested.

A period record is a dict:
    periodEnd     "YYYY-MM-DD"
    periodMonths  12 for a full year, 6 for a half-year
    audited       True / False / None (unknown)
    basis         "company" / "group" / None
    figures       same keys as the main figures (revenue, netIncome, ebit, ...) plus operatingCashFlow
    source        "current" (the scored statement), "upload", "comparative" or "stored"
    docPeriodEnd  period end of the newest column in the document it came from
    oneOff        optional {"amount": number, "reason": str}: removed from EBIT, EBITDA and net income
                  for the trend only, never from the base score

Phase 1 runs in shadow mode: the adjustment is calculated and saved, never added to the score.
"""
from __future__ import annotations

import math
import re
import statistics
from datetime import date, datetime

from api.scoring import SPECS, _n

HISTORY_VERSION = "h1.0"

MODES = ("off", "shadow")   # "applied" is reserved for Phase 2, after the back-test

# Starting values from the feature spec; tuned in the Phase 2 back-test
DIRECTION_THRESHOLD   = 0.10   # relative change FY-2 to FY0 that counts as better or worse
DIRECTION_POINTS      = 0.5
STABILITY_LOW_CV      = 0.15
STABILITY_HIGH_CV     = 0.35
DEBT_GROWTH_GAP       = 0.25   # debt growth minus EBITDA growth that raises a red flag
ALTMAN_DISTRESS       = 1.23   # the model's own Z' distress band
ADJ_MIN, ADJ_MAX      = -5.0, 3.0
RESTATEMENT_TOLERANCE = 0.02
COVERAGE_CAP          = 10.0   # interest cover above 10x is treated as 10x, so 60x to 40x is not "weaker"

INTERIM_MARGIN_DROP_PTS  = 2.0
INTERIM_COVER_DROP       = 0.20
INTERIM_ACID_DROP        = 0.15

CONFIDENCE_FACTOR = {"full": 1.0, "partial": 0.5, "limited": 0.0}

# The four trend ratios are the model's own; DSCR and Altman Z' are shown for context only
TREND_RATIOS = (
    # id, label, higher_is_better, absolute floor for the relative change
    ("net_income_margin", "Net Income Margin", True, 1.0),
    ("interest_coverage", "Interest Coverage", True, 0.5),
    ("debt_to_ebitda",    "Net Debt / EBITDA", False, 0.5),
    ("quick_ratio",       "Acid-Test Ratio",   True, 0.1),
)
CONTEXT_RATIOS = (
    ("dscr",     "Debt Service Coverage"),
    ("altman_z", "Altman Z'-Score"),
)

# Fields the history extraction returns and the Review step shows for each prior period
PERIOD_FIELDS = (
    "revenue", "netIncome", "ebit", "depreciationAndAmortisation", "financeCost",
    "cash", "inventory", "prepaidExpenses", "currentAssets", "currentLiabilities",
    "totalAssets", "totalLiabilities", "shortTermDebt", "longTermDebt",
    "shareholdersEquity", "retainedEarnings", "operatingCashFlow",
)
CORE_FIELDS = ("revenue", "netIncome", "ebit", "totalAssets", "shareholdersEquity")

_MEASURES = {s.id: s for s in SPECS}

_MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], start=1)}
_MONTHS.update({k[:3]: v for k, v in list(_MONTHS.items())})
_MONTHS["sept"] = 9


# ── Small helpers ─────────────────────────────────────────────
def normalise_rc(value) -> str | None:
    """'RC 123456', 'rc-123456', '123456' -> '123456'. None if no digits."""
    digits = re.sub(r"\D", "", str(value or ""))
    return digits.lstrip("0") or None if digits else None


def parse_period_end(value) -> str | None:
    """Turn '31 December 2025', 'December 31, 2025', '31/12/2025' or '2025-12-31' into ISO."""
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.strftime("%Y-%m-%d")
    s = str(value).strip().lower()
    s = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", s).replace(",", " ")
    m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m:
        return _iso(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = re.search(r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})", s)
    if m:  # Nigerian statements are day first
        return _iso(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    m = re.search(r"(\d{1,2})\s+([a-z]+)\s+(\d{4})", s)
    if m and m.group(2) in _MONTHS:
        return _iso(int(m.group(3)), _MONTHS[m.group(2)], int(m.group(1)))
    m = re.search(r"([a-z]+)\s+(\d{1,2})\s+(\d{4})", s)
    if m and m.group(1) in _MONTHS:
        return _iso(int(m.group(3)), _MONTHS[m.group(1)], int(m.group(2)))
    return None


def _iso(y, mo, d) -> str | None:
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def _d(iso: str) -> date:
    return date.fromisoformat(iso)


def _months_between(later: str, earlier: str) -> float:
    return (_d(later) - _d(earlier)).days / 30.4375


def period_label(p: dict) -> str:
    end = _d(p["periodEnd"])
    months = int(p.get("periodMonths") or 12)
    if months >= 12:
        return f"FY{end.year}"
    if months == 6:
        return f"H1 {end.year}" if end.month <= 7 else f"H2 {end.year}"
    return f"{months}M {end.strftime('%b %Y')}"


def _is_interim(p: dict) -> bool:
    try:
        return int(p.get("periodMonths") or 12) < 12
    except (TypeError, ValueError):
        return False


def _trend_figures(p: dict) -> dict:
    """Figures used for the trend: one-off item removed, EBITDA and total debt derived."""
    f = {k: v for k, v in (p.get("figures") or {}).items()}
    if f.get("ebitda") is None and f.get("ebit") is not None:
        f["ebitda"] = _n(f.get("ebit")) + _n(f.get("depreciationAndAmortisation"))
    one_off = _n((p.get("oneOff") or {}).get("amount"))
    if one_off:
        for key in ("ebit", "ebitda", "netIncome"):
            if f.get(key) is not None:
                f[key] = _n(f[key]) - one_off
    return f


def _ratio(f: dict, ratio_id: str) -> dict:
    value, special = _MEASURES[ratio_id].measure(f)
    fmt = _MEASURES[ratio_id].fmt
    if special:
        display = {"na": "N/A", "no_debt": "No debt", "negative_ebitda": "N/M"}[special]
    elif fmt == "pct":
        display = f"{value:.1f}%"
    elif fmt == "x":
        display = f"{value:.2f}x"
    else:
        display = f"{value:.2f}"
    return {"value": round(value, 4), "display": display, "special": special}


def _has_figures(p: dict) -> bool:
    """A usable period needs revenue; a full year also needs a balance sheet. Interim reports
    compare the income statement with the same half of last year but the balance sheet with
    the last year end, so the prior half usually has no balance sheet."""
    f = p.get("figures") or {}
    if not is_finite_number(f.get("revenue")) or _n(f.get("revenue")) == 0:
        return False
    return _is_interim(p) or (is_finite_number(f.get("totalAssets")) and _n(f.get("totalAssets")) != 0)


# ── Merge and restatement check ───────────────────────────────
_SOURCE_RANK = {"current": 3, "upload": 2, "comparative": 1, "stored": 0}


def _differs(a: dict, b: dict) -> list[dict]:
    out = []
    for key in CORE_FIELDS:
        va, vb = a.get(key), b.get(key)
        if va is None or vb is None:
            continue
        va, vb = _n(va), _n(vb)
        base = max(abs(va), abs(vb), 1)
        if abs(va - vb) / base > RESTATEMENT_TOLERANCE:
            out.append({"field": key, "used": va, "other": vb, "pct": round((va - vb) / base * 100, 1)})
    return out


def merge_periods(candidates: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    One record per period. The current statement always wins its own year (the analyst
    reviewed it); otherwise the newest document wins, so a restated comparative replaces
    the original. Returns (periods newest first, restatement notes).
    """
    groups: dict[tuple, list[dict]] = {}
    for c in candidates:
        end = parse_period_end(c.get("periodEnd"))
        if not end or not _has_figures(c):
            continue
        c = {**c, "periodEnd": end, "periodMonths": int(c.get("periodMonths") or 12),
             "docPeriodEnd": parse_period_end(c.get("docPeriodEnd")) or end}
        groups.setdefault((end, c["periodMonths"]), []).append(c)

    merged, notes = [], []
    for (end, months), items in groups.items():
        items.sort(key=lambda c: (
            c.get("source") == "current",
            c.get("audited") is not False,
            c["docPeriodEnd"],
            _SOURCE_RANK.get(c.get("source"), 0),
        ), reverse=True)
        winner = items[0]
        for other in items[1:]:
            diffs = _differs(winner.get("figures") or {}, other.get("figures") or {})
            if diffs:
                notes.append({
                    "type": "restatement", "period": period_label(winner),
                    "usedSource": winner.get("source"), "otherSource": other.get("source"),
                    "differences": diffs,
                })
                break
        merged.append(winner)
    merged.sort(key=lambda p: (p["periodEnd"], -p["periodMonths"]), reverse=True)
    return merged, notes


# ── Year selection ────────────────────────────────────────────
def _pick_prior_year(years: list[dict], after: dict) -> dict | None:
    """The full-year period ending about 12 months before `after` (9 to 18 months)."""
    best = None
    for p in years:
        gap = _months_between(after["periodEnd"], p["periodEnd"])
        if 9 <= gap <= 18 and (best is None or abs(gap - 12) < abs(_months_between(after["periodEnd"], best["periodEnd"]) - 12)):
            best = p
    return best


def select_years(fy0: dict, periods: list[dict]) -> tuple[list[dict], list[dict]]:
    """FY0, FY-1, FY-2 as available, oldest first, plus notes on irregular years."""
    annual = [p for p in periods if not _is_interim(p) and p["periodEnd"] < fy0["periodEnd"]]
    chosen, notes, current = [fy0], [], fy0
    for _ in range(2):
        prior = _pick_prior_year(annual, current)
        if not prior:
            break
        gap = _months_between(current["periodEnd"], prior["periodEnd"])
        if abs(gap - 12) > 1.5 or int(current.get("periodMonths") or 12) != 12:
            notes.append({"type": "irregular_period", "period": period_label(current),
                          "message": f"{period_label(current)} does not cover a regular 12 months; "
                                     "the year end may have changed."})
        chosen.append(prior)
        current = prior
    return list(reversed(chosen)), notes


# ── Components ────────────────────────────────────────────────
def _capped(ratio_id: str, r: dict) -> float | None:
    if r["special"] == "no_debt":
        return COVERAGE_CAP if ratio_id == "interest_coverage" else 0.0
    if r["special"]:
        return None
    v = r["value"]
    return min(v, COVERAGE_CAP) if ratio_id == "interest_coverage" else v


def _direction(ratio_id, label, higher_better, floor, old: dict, new: dict) -> dict:
    o, n = old[ratio_id], new[ratio_id]
    item = {"id": ratio_id, "label": label, "from": o["display"], "to": n["display"]}
    if ratio_id == "debt_to_ebitda" and (o["special"] == "negative_ebitda") != (n["special"] == "negative_ebitda"):
        weaker = n["special"] == "negative_ebitda"
        return {**item, "direction": "weakening" if weaker else "improving",
                "points": -DIRECTION_POINTS if weaker else DIRECTION_POINTS}
    ov, nv = _capped(ratio_id, o), _capped(ratio_id, n)
    if ov is None or nv is None:
        return {**item, "direction": "n/a", "points": 0.0}
    diff = (nv - ov) if higher_better else (ov - nv)
    rel = diff / max(abs(ov), floor)
    if rel > DIRECTION_THRESHOLD:
        return {**item, "direction": "improving", "points": DIRECTION_POINTS, "change": round(rel * 100, 1)}
    if rel < -DIRECTION_THRESHOLD:
        return {**item, "direction": "weakening", "points": -DIRECTION_POINTS, "change": round(rel * 100, 1)}
    return {**item, "direction": "stable", "points": 0.0, "change": round(rel * 100, 1)}


def _stability(year_figs: list[dict]) -> dict:
    margins = [_n(f.get("ebitda")) / _n(f.get("revenue")) * 100 for f in year_figs if _n(f.get("revenue")) > 0]
    if len(margins) < 2:
        return {"points": 0.0, "cv": None, "detail": "Not enough years to measure stability."}
    mean = statistics.fmean(margins)
    if mean <= 0:
        return {"points": -1.0, "cv": None, "detail": "Average EBITDA margin is zero or negative."}
    cv = statistics.stdev(margins) / abs(mean)
    points = 1.0 if cv < STABILITY_LOW_CV else 0.0 if cv <= STABILITY_HIGH_CV else -1.0
    return {"points": points, "cv": round(cv * 100, 1),
            "detail": f"EBITDA margin varied {cv * 100:.1f}% year to year."}


def _growth(new, old):
    old, new = _n(old), _n(new)
    return None if old <= 0 else (new - old) / old


def _red_flags(years: list[dict], year_figs: list[dict], ratios: list[dict]) -> list[dict]:
    flags = []
    losses = [period_label(y) for y, f in zip(years, year_figs) if f.get("netIncome") is not None and _n(f["netIncome"]) < 0]
    if losses:
        flags.append({"id": "loss_year", "label": f"Loss in {', '.join(losses)}"})

    ocf = [(period_label(y), f.get("operatingCashFlow")) for y, f in zip(years, year_figs)]
    known = [(lbl, _n(v)) for lbl, v in ocf if v is not None]
    negative = [lbl for lbl, v in known if v < 0]
    latest_negative = ocf[-1][1] is not None and _n(ocf[-1][1]) < 0
    if latest_negative or len(negative) >= 2:
        flags.append({"id": "negative_ocf", "label": f"Negative operating cash flow in {', '.join(negative)}"})

    if len(year_figs) >= 2:
        old, new = year_figs[0], year_figs[-1]
        debt_g = _growth(_n(new.get("shortTermDebt")) + _n(new.get("longTermDebt")),
                         _n(old.get("shortTermDebt")) + _n(old.get("longTermDebt")))
        ebitda_g = _growth(new.get("ebitda"), old.get("ebitda"))
        if debt_g is not None and ebitda_g is not None and debt_g - ebitda_g > DEBT_GROWTH_GAP:
            gap = round((debt_g - ebitda_g) * 100)
            flags.append({"id": "debt_outgrew_ebitda",
                          "label": f"Debt grew {gap} percentage points faster than EBITDA"})

    distress = [period_label(y) for y, r in zip(years, ratios)
                if not r["altman_z"]["special"] and r["altman_z"]["value"] < ALTMAN_DISTRESS]
    if distress:
        flags.append({"id": "altman_distress", "label": f"Altman Z'-Score in the distress zone in {', '.join(distress)}"})
    return flags


def _confidence(years: list[dict], notes: list[dict]) -> tuple[str, list[str]]:
    reasons = []
    if len(years) < 2:
        return "limited", ["Fewer than two financial years available."]
    if len(years) < 3:
        reasons.append("Only two financial years available.")
    unaudited = [period_label(y) for y in years if y.get("audited") is False]
    if unaudited:
        reasons.append(f"{', '.join(unaudited)} not audited.")
    if any(y.get("basis") == "group" for y in years):
        reasons.append("Some years are group (consolidated) figures, not company figures.")
    if any(n["type"] == "irregular_period" for n in notes):
        reasons.append("A year does not cover a regular 12 months.")
    return ("partial" if reasons else "full"), reasons


# ── Interim early warning ─────────────────────────────────────
def interim_warning(fy0: dict, periods: list[dict]) -> dict:
    interims = sorted([p for p in periods if _is_interim(p)], key=lambda p: p["periodEnd"], reverse=True)
    if not interims:
        return {"status": "none"}
    current = interims[0]
    if current["periodEnd"] <= fy0["periodEnd"]:
        return {"status": "stale", "current": period_label(current),
                "message": f"{period_label(current)} is not later than the latest audited year, so it was ignored."}
    prior = next((p for p in interims[1:] if p["periodMonths"] == current["periodMonths"]
                  and 10 <= _months_between(current["periodEnd"], p["periodEnd"]) <= 14), None)
    if not prior:
        return {"status": "no_comparative", "current": period_label(current),
                "message": "The interim has no figures for the same half of last year, so no comparison was possible."}

    cf, pf = _trend_figures(current), _trend_figures(prior)
    cr = {rid: _ratio(cf, rid) for rid in ("net_income_margin", "interest_coverage", "quick_ratio")}
    pr = {rid: _ratio(pf, rid) for rid in ("net_income_margin", "interest_coverage", "quick_ratio")}

    def check(cid, label, rule, prior_disp, current_disp, triggered):
        return {"id": cid, "label": label, "rule": rule, "prior": prior_disp, "current": current_disp,
                "triggered": triggered}

    checks = []
    a, b = pr["net_income_margin"], cr["net_income_margin"]
    checks.append(check("margin", "Net income margin", f"Flag if down more than {INTERIM_MARGIN_DROP_PTS:g} percentage points",
                        a["display"], b["display"],
                        None if a["special"] or b["special"] else (a["value"] - b["value"]) > INTERIM_MARGIN_DROP_PTS))
    a, b = pr["interest_coverage"], cr["interest_coverage"]
    av, bv = _capped("interest_coverage", a), _capped("interest_coverage", b)
    checks.append(check("cover", "Interest coverage", f"Flag if down more than {INTERIM_COVER_DROP:.0%}",
                        a["display"], b["display"],
                        None if av is None or bv is None or av <= 0 else (av - bv) / av > INTERIM_COVER_DROP))
    a, b = pr["quick_ratio"], cr["quick_ratio"]
    checks.append(check("acid", "Acid-test ratio", f"Flag if down more than {INTERIM_ACID_DROP:.0%}",
                        a["display"], b["display"],
                        None if a["value"] <= 0 else (a["value"] - b["value"]) / a["value"] > INTERIM_ACID_DROP))
    ocf_now, ocf_before = cf.get("operatingCashFlow"), pf.get("operatingCashFlow")
    disp = lambda v: "N/A" if v is None else ("Positive" if _n(v) >= 0 else "Negative")
    checks.append(check("ocf", "Operating cash flow", "Flag if negative", disp(ocf_before), disp(ocf_now),
                        None if ocf_now is None else _n(ocf_now) < 0))

    available = [c for c in checks if c["triggered"] is not None]
    return {
        "status": "ok", "current": period_label(current), "prior": period_label(prior),
        "audited": current.get("audited"), "checks": checks,
        "triggered": sum(1 for c in available if c["triggered"]), "available": len(available),
    }


# ── Public entry point ────────────────────────────────────────
def build_fy0(figures: dict) -> dict | None:
    """The scored statement as a period record, or None if its year end is unknown."""
    hist = figures.get("history") or {}
    end = parse_period_end(hist.get("fy0PeriodEnd") or figures.get("reportingPeriod"))
    if not end:
        return None
    fy0_figs = {k: figures.get(k) for k in PERIOD_FIELDS if k != "operatingCashFlow"}
    fy0_figs["ebitda"] = figures.get("ebitda")
    fy0_figs["operatingCashFlow"] = hist.get("fy0OperatingCashFlow")
    return {"periodEnd": end, "periodMonths": 12, "audited": True, "basis": "company",
            "figures": fy0_figs, "source": "current", "docPeriodEnd": end,
            "oneOff": hist.get("fy0OneOff")}


def analyse(figures: dict) -> dict | None:
    """
    History analysis for the figures being scored, or None when the figures carry no history.
    figures["history"] = {"periods": [...], "fy0PeriodEnd", "fy0OperatingCashFlow", "fy0OneOff",
                          "rcNumber", "analystComment"}
    """
    hist = figures.get("history")
    if not isinstance(hist, dict):
        return None
    fy0 = build_fy0(figures)
    if not fy0:
        return {"version": HISTORY_VERSION, "status": "no_period_end", "applied": False,
                "message": "The year end of the current statement is unknown. Enter it on Review Data to compare years."}

    periods, notes = merge_periods([fy0, *(hist.get("periods") or [])])
    seen = {(n["type"], n.get("period")) for n in notes}
    notes = [n for n in (hist.get("extractionNotes") or []) if (n.get("type"), n.get("period")) not in seen] + notes
    fy0 = next(p for p in periods if p["periodEnd"] == fy0["periodEnd"] and p["periodMonths"] == 12)
    years, year_notes = select_years(fy0, periods)
    notes += year_notes

    year_figs = [_trend_figures(y) for y in years]
    year_ratios = [{rid: _ratio(f, rid) for rid in [t[0] for t in TREND_RATIOS] + [c[0] for c in CONTEXT_RATIOS]}
                   for f in year_figs]

    table = []
    for y, f, r in zip(years, year_figs, year_ratios):
        table.append({
            "label": period_label(y), "periodEnd": y["periodEnd"], "audited": y.get("audited"),
            "source": y.get("source"), "ratios": r,
            "ebitdaMargin": round(_n(f.get("ebitda")) / _n(f.get("revenue")) * 100, 2) if _n(f.get("revenue")) > 0 else None,
            "operatingCashFlow": f.get("operatingCashFlow"),
            "oneOff": y.get("oneOff") if _n((y.get("oneOff") or {}).get("amount")) else None,
        })

    confidence, reasons = _confidence(years, notes)
    direction = [_direction(rid, label, hb, floor, year_ratios[0], year_ratios[-1])
                 for rid, label, hb, floor in TREND_RATIOS] if len(years) >= 2 else []
    a = sum(d["points"] for d in direction)
    stability = _stability(year_figs) if len(years) >= 2 else {"points": 0.0, "cv": None, "detail": "Not enough years."}
    flags = _red_flags(years, year_figs, year_ratios) if len(years) >= 2 else []
    c = -float(min(len(flags), 4))
    subtotal = max(ADJ_MIN, min(ADJ_MAX, a + stability["points"] + c))
    factor = CONFIDENCE_FACTOR[confidence]
    adjustment = round(subtotal * factor, 1) + 0.0  # + 0.0 turns -0.0 into 0.0

    weaker = sum(1 for d in direction if d["direction"] == "weakening")
    better = sum(1 for d in direction if d["direction"] == "improving")
    overall = ("Not enough history" if len(years) < 2 else
               "Weakening" if weaker > better else "Improving" if better > weaker else "Stable")

    return {
        "version": HISTORY_VERSION, "status": "ok", "applied": False,
        "years": table, "yearsAvailable": len(years),
        "direction": direction, "stability": stability, "redFlags": flags,
        "components": {"direction": a, "stability": stability["points"], "redFlags": c},
        "subtotal": subtotal, "confidence": confidence, "confidenceReasons": reasons,
        "factor": factor, "adjustment": adjustment, "overall": overall,
        "interim": interim_warning(fy0, periods),
        "notes": notes,
        "analystComment": (hist.get("analystComment") or "").strip() or None,
        "rcNumber": normalise_rc(hist.get("rcNumber")),
    }


def periods_to_store(figures: dict) -> list[dict]:
    """Every period worth keeping for the issuer after a completed run: the merged set."""
    hist = figures.get("history") or {}
    fy0 = build_fy0(figures)
    candidates = ([fy0] if fy0 else []) + list(hist.get("periods") or [])
    merged, _ = merge_periods(candidates)
    return merged


def needs_comment(analysis: dict | None) -> bool:
    """A triggered interim warning needs an analyst comment before the run."""
    if not analysis or analysis.get("status") != "ok":
        return False
    interim = analysis.get("interim") or {}
    return interim.get("status") == "ok" and interim.get("triggered", 0) > 0 and not analysis.get("analystComment")


def is_finite_number(v) -> bool:
    try:
        return math.isfinite(float(v))
    except (TypeError, ValueError):
        return False
