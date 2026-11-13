"""
Health report for a general review (decision D053): no instrument, so no pass or fail.
The 56-point score becomes a health score in %, rated by dimension, using the same
scored ratios. Display-only ratios (Altman Z') never count.
"""

STRONG, FAIR = 75, 40  # % of the points available
DIMENSIONS = ("Liquidity", "Profitability", "Returns", "Leverage", "Coverage")


def rating(pct: float) -> str:
    return "Strong" if pct >= STRONG else "Fair" if pct >= FAIR else "Weak"


def health_report(ratios: list[dict]) -> dict:
    scored = [r for r in ratios or [] if not r.get("display_only") and r.get("max_score")]
    got = sum(r.get("score") or 0 for r in scored)
    avail = sum(r.get("max_score") or 0 for r in scored)
    pct = round(got / avail * 100) if avail else 0
    dims = []
    for name in DIMENSIONS:
        rs = [r for r in scored if r.get("category") == name]
        if not rs:
            continue
        g, a = sum(r.get("score") or 0 for r in rs), sum(r["max_score"] for r in rs)
        p = round(g / a * 100) if a else 0
        dims.append({"name": name, "score": g, "max": a, "pct": p, "rating": rating(p)})
    ranked = sorted(scored, key=lambda r: (r.get("score") or 0) / r["max_score"])
    return {
        "score": got, "max": avail, "pct": pct, "rating": rating(pct), "dimensions": dims,
        # Full-marks ratios and the weakest ratios, by name, for the report
        "strengths": [r["name"] for r in reversed(ranked) if (r.get("score") or 0) == r["max_score"]][:4],
        "watch": [r["name"] for r in ranked if (r.get("score") or 0) / r["max_score"] < FAIR / 100][:4],
    }
