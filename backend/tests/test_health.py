from api.health import health_report, rating


def r(name, cat, score, mx, display_only=False):
    return {"name": name, "category": cat, "score": score, "max_score": mx, "display_only": display_only}


def test_rating_edges():
    assert rating(75) == "Strong" and rating(74) == "Fair" and rating(40) == "Fair" and rating(39) == "Weak"


def test_health_report():
    h = health_report([r("Current", "Liquidity", 4, 4), r("Cash", "Liquidity", 0, 4),
                       r("DSCR", "Coverage", 6, 8), r("Z", "Bankruptcy", 0, 0, True)])
    assert h["score"] == 10 and h["max"] == 16 and h["pct"] == 62 and h["rating"] == "Fair"
    assert [d["name"] for d in h["dimensions"]] == ["Liquidity", "Coverage"]
    assert h["dimensions"][0]["rating"] == "Fair" and h["dimensions"][1]["rating"] == "Strong"
    assert h["strengths"] == ["Current"] and h["watch"] == ["Cash"]


def test_empty():
    assert health_report([])["pct"] == 0
