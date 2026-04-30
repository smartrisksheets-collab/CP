from io import BytesIO

try:
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
    from reportlab.graphics.shapes import Drawing, Rect
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

from api.models import Assessment

# ── Unicode font (for ₦ and other non-Latin-1 chars) ──────────
import os as _os
from reportlab.pdfbase import pdfmetrics as _pm
from reportlab.pdfbase.ttfonts import TTFont as _TTF

def _register_unicode_font():
    candidates = [
        # Windows
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibri.ttf",
        # Linux (Render)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if _os.path.exists(path):
            _pm.registerFont(_TTF("UniFont", path))
            _pm.registerFont(_TTF("UniFont-Bold", path.replace("Sans.ttf","Sans-Bold.ttf").replace("Regular","Bold")))
            return True
    return False

_HAS_UNIFONT = _register_unicode_font()
_CURRENCY_FONT = "UniFont" if _HAS_UNIFONT else "Helvetica"

# ── Brand colors ───────────────────────────────────────────────
C_NAVY     = colors.HexColor("#1F2854")
C_EMERALD  = colors.HexColor("#01b88e")
C_AMBER    = colors.HexColor("#EF9F27")
C_BLUE     = colors.HexColor("#378ADD")
C_CREAM    = colors.HexColor("#F5F5F2")
C_BORDER   = colors.HexColor("#E8E8E8")
C_BODY     = colors.HexColor("#2C2C2C")
C_GREY     = colors.HexColor("#888888")
C_MUTED    = colors.HexColor("#9aaed4")
C_RED      = colors.HexColor("#E24B4A")
C_GRN_BG   = colors.HexColor("#EAF3DE")
C_GRN_FG   = colors.HexColor("#27500A")
C_AMB_BG   = colors.HexColor("#FFF8E1")
C_AMB_FG   = colors.HexColor("#7B4F00")
C_SGBG     = colors.HexColor("#d1fae5")
C_SGFG     = colors.HexColor("#064e3b")
C_GREY_BG  = colors.HexColor("#F1EFE8")
C_GREY_FG  = colors.HexColor("#5F5E5A")
C_RED_BG   = colors.HexColor("#FCEBEB")
C_RED_FG   = colors.HexColor("#791F1F")

# ── Layout constants ───────────────────────────────────────────
PAGE_W, PAGE_H = A4
MARGIN  = 10 * mm
CW      = PAGE_W - 2 * MARGIN   # full content width ≈ 538 pt
HALF    = CW / 2
QUAR    = CW / 4

# Scoring row col widths (must sum to CW)
_SC_NAME  = 148
_SC_VAL   = 50
_SC_BAND  = 84
_SC_SCR   = 52
_SC_BAR   = CW - _SC_NAME - _SC_VAL - _SC_BAND - _SC_SCR

# Verdict bar col widths
_VD_L   = 115
_VD_R   = 135
_VD_M   = CW - _VD_L - _VD_R

DIMS = [
    ("Quick Ratios",         "Liquidity"),
    ("Profitability Ratios", "Profitability"),
    ("Return Ratios",        "Returns"),
    ("Leverage Ratios",      "Leverage"),
    ("Coverage Ratios",      "Coverage"),
    ("Distress Indicator",   "Bankruptcy"),
]


# ── Number helpers ─────────────────────────────────────────────
def _n(v):
    try:    return float(v) if v is not None else 0.0
    except: return 0.0

def _fmt_bn(val):
    try:
        amount = f"{float(val)/1_000_000:.1f}bn"
        return f"\u20a6{amount}" if _HAS_UNIFONT else f"NGN {amount}"
    except:
        return "N/A"

def _pct(num, den):
    try:    return f"{float(num)/float(den)*100:.1f}%"
    except: return "N/A"

def _fmt_x(val, dp=2):
    try:    return f"{float(val):.{dp}f}x"
    except: return "N/A"


# ── Style factory ──────────────────────────────────────────────
def _ST():
    def ps(name, **kw):
        base = dict(fontName=_CURRENCY_FONT, fontSize=8, leading=10,
                    textColor=C_NAVY, spaceBefore=0, spaceAfter=0)
        base.update(kw)
        return ParagraphStyle(name, **base)
    return {
        "eyebrow"  : ps("eyebrow",  fontSize=7,  textColor=C_EMERALD, fontName="Helvetica-Bold", leading=9),
        "hd_name"  : ps("hd_name",  fontSize=15, textColor=colors.white, fontName="Helvetica-Bold", leading=18),
        "hd_sub"   : ps("hd_sub",   fontSize=7,  textColor=C_MUTED, leading=9),
        "hd_verd"  : ps("hd_verd",  fontSize=17, textColor=colors.HexColor("#6ee7b7"),
                         fontName="Helvetica-Bold", leading=20, alignment=TA_RIGHT),
        "hd_score" : ps("hd_score", fontSize=7,  textColor=C_MUTED, leading=9, alignment=TA_RIGHT),
        "met_lbl"  : ps("met_lbl",  fontSize=7,  textColor=C_GREY, leading=9),
        "met_val"  : ps("met_val",  fontSize=13, textColor=C_NAVY, fontName=_CURRENCY_FONT, leading=16),
        "sec_hdr"  : ps("sec_hdr",  fontSize=9,  textColor=colors.white, fontName="Helvetica-Bold", leading=11),
        "cp_lbl"   : ps("cp_lbl",   fontSize=7,  textColor=C_GREY, leading=9),
        "cp_val"   : ps("cp_val",   fontSize=9,  textColor=C_NAVY, fontName="Helvetica-Bold", leading=11),
        "tile_lbl" : ps("tile_lbl", fontSize=7,  textColor=C_GREY, fontName="Helvetica-Bold", leading=9),
        "tile_body": ps("tile_body",fontSize=8,  textColor=C_BODY, leading=11),
        "sw_hdr_g" : ps("sw_hdr_g", fontSize=7,  textColor=C_GRN_FG, fontName="Helvetica-Bold", leading=9),
        "sw_hdr_r" : ps("sw_hdr_r", fontSize=7,  textColor=C_RED_FG, fontName="Helvetica-Bold", leading=9),
        "sw_body"  : ps("sw_body",  fontSize=8,  textColor=C_BODY, leading=11),
        "sw_tck_g" : ps("sw_tck_g", fontSize=9,  textColor=C_EMERALD, fontName="Helvetica-Bold", leading=11),
        "sw_tck_r" : ps("sw_tck_r", fontSize=9,  textColor=C_RED, fontName="Helvetica-Bold", leading=11),
        "dim_name" : ps("dim_name", fontSize=7,  textColor=C_GREY, fontName="Helvetica-Bold", leading=9),
        "dim_tot"  : ps("dim_tot",  fontSize=9,  textColor=C_NAVY, fontName="Helvetica-Bold", leading=11, alignment=TA_RIGHT),
        "r_name"   : ps("r_name",   fontSize=8,  textColor=C_NAVY, leading=10),
        "r_val"    : ps("r_val",    fontSize=8,  textColor=C_GREY, leading=10),
        "vd_lbl"   : ps("vd_lbl",   fontSize=7,  textColor=C_GREY, fontName="Helvetica-Bold", leading=9),
        "vd_score" : ps("vd_score", fontSize=16, textColor=C_EMERALD, fontName="Helvetica-Bold", leading=19),
        "vd_thr"   : ps("vd_thr",   fontSize=7,  textColor=C_GREY, leading=9),
        "vd_sub"   : ps("vd_sub",   fontSize=7,  textColor=C_GREY, leading=9, alignment=TA_RIGHT),
        "rec_lbl"  : ps("rec_lbl",  fontSize=7,  textColor=C_EMERALD, fontName="Helvetica-Bold", leading=9),
        "rec_body" : ps("rec_body", fontSize=8,  textColor=C_BODY, leading=12),
        "footer"   : ps("footer",   fontSize=7,  textColor=colors.HexColor("#aaaaaa"),
                         alignment=TA_CENTER, leading=9),
    }


# ── Drawing helpers ────────────────────────────────────────────
def _bar(width, pct, bar_color, height=5):
    pct = max(0.0, min(100.0, float(pct)))
    d   = Drawing(width, height)
    d.add(Rect(0, 0, width, height, fillColor=C_BORDER, strokeColor=None))
    if pct > 0:
        d.add(Rect(0, 0, width * pct / 100, height, fillColor=bar_color, strokeColor=None))
    return d

def _accent(hex_color, w=22, h=3):
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, fillColor=colors.HexColor(hex_color), strokeColor=None))
    return d

def _bar_color(sc, mx):
    if sc == mx: return C_EMERALD
    if sc <= 0:  return C_RED
    return C_AMBER

def _score_fg(sc, mx):
    if sc == mx: return C_GRN_FG
    if sc <= 0:  return C_RED_FG
    return C_AMB_FG

def _band_colors(sc, mx):
    if sc == mx: return C_GRN_BG, C_GRN_FG
    if sc <= 0:  return C_RED_BG, C_RED_FG
    return C_SGBG, C_SGFG

def _badge_colors(rating):
    r = (rating or "").lower()
    if r in ("strong", "low"):    return C_GRN_BG, C_GRN_FG
    if r in ("moderate", "high"): return C_AMB_BG, C_AMB_FG
    return C_GREY_BG, C_GREY_FG

def _badge(text, bg, fg):
    p = ParagraphStyle("bdg", fontName="Helvetica-Bold", fontSize=7,
                       textColor=fg, leading=9, alignment=TA_CENTER)
    t = Table([[Paragraph(text or "\u2014", p)]])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), bg),
        ("LEFTPADDING",   (0,0), (-1,-1), 5),
        ("RIGHTPADDING",  (0,0), (-1,-1), 5),
        ("TOPPADDING",    (0,0), (-1,-1), 2),
        ("BOTTOMPADDING", (0,0), (-1,-1), 2),
    ]))
    return t


# ── Reusable block builders ────────────────────────────────────
def _sec_hdr(title, ST):
    t = Table([[Paragraph(title, ST["sec_hdr"])]], colWidths=[CW])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_NAVY),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ]))
    return t

def _cp_cell(label, value, ST):
    return [Paragraph(label, ST["cp_lbl"]),
            Spacer(1, 2),
            Paragraph(value or "\u2014", ST["cp_val"])]

def _tile(label, accent_hex, badge_text, badge_bg, badge_fg, body, ST):
    inner_w = HALF - 20
    badge_w = 78
    label_w = inner_w - badge_w
    lr = Table(
        [[Paragraph(label, ST["tile_lbl"]), _badge(badge_text, badge_bg, badge_fg)]],
        colWidths=[label_w, badge_w],
    )
    lr.setStyle(TableStyle([
        ("LEFTPADDING",   (0,0), (-1,-1), 0),
        ("RIGHTPADDING",  (0,0), (-1,-1), 0),
        ("TOPPADDING",    (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    return [_accent(accent_hex), Spacer(1, 5), lr, Spacer(1, 5),
            Paragraph(body or "", ST["tile_body"])]

def _sw_item(text, tick_style, ST):
    inner_w = HALF - 20
    t = Table([[Paragraph(tick_style[0], ST[tick_style[1]]),
                Paragraph(text, ST["sw_body"])]],
              colWidths=[14, inner_w - 14])
    t.setStyle(TableStyle([
        ("LEFTPADDING",   (0,0), (-1,-1), 0),
        ("RIGHTPADDING",  (0,0), (-1,-1), 0),
        ("TOPPADDING",    (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ]))
    return t


# ── Main element builder ───────────────────────────────────────
def _build_elements(assessment: Assessment):
    ST     = _ST()
    f      = assessment.figures   or {}
    n      = assessment.narrative or {}
    cp     = f.get("cpTerms")    or {}
    ratios = assessment.ratios   or []

    # Metrics
    revenue         = _fmt_bn(f.get("revenue"))
    net_margin      = _pct(f.get("netIncome"), f.get("revenue"))
    td              = _n(f.get("shortTermDebt")) + _n(f.get("longTermDebt"))
    net_debt        = td - _n(f.get("cash"))
    ebitda          = _n(f.get("ebitda"))
    net_debt_ebitda = _fmt_x(net_debt / ebitda) if ebitda > 0 else "N/A"
    st_int          = _n(f.get("shortTermDebt")) * _n(f.get("shortTermInterestRate"))
    lt_int          = _n(f.get("longTermDebt"))  * _n(f.get("longTermInterestRate"))
    total_int       = st_int + lt_int
    icr             = _fmt_x(_n(f.get("ebit")) / total_int) if total_int > 0 else "N/A"

    score      = assessment.total_score or 0
    max_score  = assessment.max_score   or 56
    cutoff     = 34
    score_pct  = round(score / max_score * 100) if max_score else 0
    eligible   = assessment.eligible
    margin_pts = abs(score - cutoff)
    verdict    = "ELIGIBLE" if eligible else "NOT ELIGIBLE"
    vd_color   = C_EMERALD  if eligible else C_RED
    vd_margin  = "Meets"    if eligible else "Below"

    try:
        review_date = f.get("reviewDate") or assessment.created_at.strftime("%d %b %Y")
    except Exception:
        review_date = "\u2014"

    eq = n.get("financialStanding", "Fair")
    lq = n.get("cashFlowRating",    "Moderate")
    cs = n.get("creditRiskLevel",   "Moderate")
    fr = n.get("futureRiskLevel",   "Moderate")

    # Altman Z body
    altman = next((r for r in ratios if r.get("id") == "altman_z"), None)
    if altman:
        z_sc   = altman.get("score", 0)
        z_mx   = altman.get("max_score", 10)
        zone   = ("safe zone (> 3.0)" if z_sc == z_mx
                  else "distress zone (< 1.8)" if z_sc <= 0
                  else "grey zone (1.8\u20132.9)")
        distress = (f"Altman Z-Score of {altman.get('display_value','N/A')} places the company "
                    f"in the {zone}, earning {z_sc} out of {z_mx} points. Ongoing monitoring "
                    f"is warranted throughout the tenor of the instrument.")
    else:
        distress = n.get("futureRisksReview", "")

    # Strengths / Weaknesses
    strengths, weaknesses = [], []
    for r in ratios:
        sc = r.get("score", 0); mx = r.get("max_score", 0)
        nm = r.get("name","");   dv = r.get("display_value",""); bd = r.get("band","")
        if sc == mx and mx > 0:
            strengths.append(f"{nm} of {dv} ({bd}) earns the maximum {sc} out of {mx} points.")
        elif sc <= 0:
            weaknesses.append(f"{nm} of {dv} ({bd}) scores {sc} out of {mx}, dragging the total score.")
    if not strengths and n.get("financialStandingReview"):
        strengths.append(n["financialStandingReview"].split(".")[0] + ".")
    if not weaknesses and n.get("futureRisksReview"):
        weaknesses.append(n["futureRisksReview"].split(".")[0] + ".")

    E = []  # elements list

    # ── 1. HEADER ─────────────────────────────────────────────
    hdr = Table([[
        [Paragraph("Commercial Paper Assessment", ST["eyebrow"]),
         Spacer(1, 4),
         Paragraph(assessment.client_name or "Client", ST["hd_name"]),
         Spacer(1, 3),
         Paragraph(f"Review date: {review_date} &nbsp;|&nbsp; "
                   f"Rating: {assessment.credit_rating or 'N/A'} &nbsp;|&nbsp; "
                   f"Senior Unsecured Commercial Paper", ST["hd_sub"])],
        [Paragraph(verdict, ST["hd_verd"]),
         Spacer(1, 4),
         Paragraph(f"{score} / {max_score} pts &nbsp;&middot;&nbsp; "
                   f"{score_pct}% &nbsp;&middot;&nbsp; Threshold: 60%", ST["hd_score"])],
    ]], colWidths=[CW * 0.68, CW * 0.32])
    hdr.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_NAVY),
        ("LEFTPADDING",   (0,0), (-1,-1), 16),
        ("RIGHTPADDING",  (0,0), (-1,-1), 16),
        ("TOPPADDING",    (0,0), (-1,-1), 14),
        ("BOTTOMPADDING", (0,0), (-1,-1), 14),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ]))
    E.append(hdr)

    # ── 2. METRICS STRIP ──────────────────────────────────────
    def mcell(lbl, val):
        return [Paragraph(lbl, ST["met_lbl"]), Spacer(1, 2), Paragraph(val, ST["met_val"])]

    metrics = Table([[mcell("REVENUE", revenue), mcell("NET MARGIN", net_margin),
                      mcell("NET DEBT / EBITDA", net_debt_ebitda), mcell("INTEREST COVER", icr)]],
                    colWidths=[QUAR] * 4)
    metrics.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_CREAM),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
        ("TOPPADDING",    (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LINEAFTER",     (0,0), (2, 0),  0.5, C_BORDER),
        ("LINEBELOW",     (0,0), (-1,-1), 0.5, C_BORDER),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ]))
    E.append(metrics)

    # ── 3. CP TERMS ───────────────────────────────────────────
    E.append(_sec_hdr("COMMERCIAL PAPER TERMS", ST))
    cp_tbl = Table([
        [_cp_cell("Programme Size (\u20a6)", cp.get("programmeSize"),  ST),
         _cp_cell("Target Size (\u20a6)",    cp.get("targetSize"),     ST),
         _cp_cell("Discount Rate A",   cp.get("discountRateA"),  ST),
         _cp_cell("Discount Rate B",   cp.get("discountRateB"),  ST)],
        [_cp_cell("Offer Opens",       cp.get("offerOpen"),      ST),
         _cp_cell("Offer Closes",      cp.get("offerClose"),     ST),
         _cp_cell("Min. Subscription (\u20a6)", cp.get("minSubscription"),ST),
         _cp_cell("Taxation",          cp.get("taxation"),       ST)],
        [_cp_cell("Use of Proceeds",   cp.get("useOfProceeds"),  ST),
         "", _cp_cell("Instrument Type", "Senior Unsecured Commercial Paper", ST), ""],
    ], colWidths=[QUAR] * 4)
    cp_tbl.setStyle(TableStyle([
        ("SPAN",          (0,2), (1,2)),
        ("SPAN",          (2,2), (3,2)),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LINEAFTER",     (0,0), (2,-1),  0.5, C_BORDER),
        ("LINEBELOW",     (0,0), (-1,1),  0.5, C_BORDER),
        ("LINEBELOW",     (0,2), (-1,2),  0.5, C_BORDER),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ]))
    E.append(cp_tbl)

    # ── 4. CREDIT RISK SCORECARD ──────────────────────────────
    E.append(_sec_hdr("CREDIT RISK SCORECARD", ST))
    tiles = [
        ("EARNINGS QUALITY",            "#01b88e", eq,  *_badge_colors(eq),  n.get("financialStandingReview","")),
        ("LIQUIDITY &amp; DEBT SERVICE","#EF9F27", lq,  *_badge_colors(lq),  n.get("cashFlowReview","")),
        ("CAPITAL STRUCTURE",           "#378ADD", cs,  *_badge_colors(cs),  n.get("creditRiskReview","")),
        ("RATING CONTEXT",              "#378ADD", assessment.credit_rating or "N/A",
         C_GREY_BG, C_GREY_FG,                                               n.get("creditRatingReview","")),
        ("FORWARD RISK OUTLOOK",        "#EF9F27", fr,  *_badge_colors(fr),  n.get("futureRisksReview","")),
        ("DISTRESS INDICATOR",          "#EF9F27", "See Z-score", C_GREY_BG, C_GREY_FG, distress),
    ]
    sc_rows = [[_tile(*tiles[i], ST), _tile(*tiles[i+1], ST)] for i in range(0, 6, 2)]
    sc_tbl  = Table(sc_rows, colWidths=[HALF, HALF])
    sc_tbl.setStyle(TableStyle([
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("RIGHTPADDING",  (0,0), (-1,-1), 10),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("LINEAFTER",     (0,0), (0,-1),  0.5, C_BORDER),
        ("LINEBELOW",     (0,0), (-1,1),  0.5, C_BORDER),
        ("LINEBELOW",     (0,2), (-1,2),  0.5, C_BORDER),
    ]))
    E.append(sc_tbl)

    # ── 5. KEY STRENGTHS & WEAKNESSES ─────────────────────────
    E.append(_sec_hdr("KEY STRENGTHS &amp; WEAKNESSES", ST))

    def sw_col(items, hdr_sty, hdr_txt, hdr_bg, tick):
        inner_w = HALF - 20
        hdr = Table([[Paragraph(hdr_txt, ST[hdr_sty])]], colWidths=[inner_w])
        hdr.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), hdr_bg),
            ("LEFTPADDING",   (0,0), (-1,-1), 6),
            ("RIGHTPADDING",  (0,0), (-1,-1), 6),
            ("TOPPADDING",    (0,0), (-1,-1), 3),
            ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ]))
        col = [hdr, Spacer(1, 6)]
        col += [_sw_item(i, tick, ST) for i in items[:4]]
        return col

    sw = Table([[
        sw_col(strengths, "sw_hdr_g", "Key Strengths",  C_GRN_BG, ("\u2713","sw_tck_g")),
        sw_col(weaknesses,"sw_hdr_r", "Key Weaknesses", C_RED_BG, ("\u2717","sw_tck_r")),
    ]], colWidths=[HALF, HALF])
    sw.setStyle(TableStyle([
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("RIGHTPADDING",  (0,0), (-1,-1), 10),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("LINEAFTER",     (0,0), (0,-1),  0.5, C_BORDER),
        ("LINEBELOW",     (0,0), (-1,-1), 0.5, C_BORDER),
    ]))
    E.append(sw)

    # ── 6. SCORING BREAKDOWN ──────────────────────────────────
    E.append(_sec_hdr("SCORING BREAKDOWN BY DIMENSION", ST))
    E.append(Spacer(1, 8))

    for dim_name, cat in DIMS:
        dim_ratios = [r for r in ratios if r.get("category") == cat]
        if not dim_ratios:
            continue
        dim_tot = sum(r.get("score", 0) for r in dim_ratios)
        dim_mx  = sum(r.get("max_score", 0) for r in dim_ratios)

        dim_hdr = Table([[Paragraph(dim_name, ST["dim_name"]),
                          Paragraph(f"{dim_tot} / {dim_mx}", ST["dim_tot"])]],
                        colWidths=[CW * 0.7, CW * 0.3])
        dim_hdr.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), C_CREAM),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (0,0), (-1,-1), 10),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("BOX",           (0,0), (-1,-1), 0.5, C_BORDER),
        ]))
        E.append(dim_hdr)

        for r in dim_ratios:
            sc = r.get("score", 0)
            mx = r.get("max_score", 1) or 1
            bc       = _bar_color(sc, mx)
            bnd_bg, bnd_fg = _band_colors(sc, mx)

            band_p = ParagraphStyle("bnd2", fontName="Helvetica", fontSize=7,
                                    textColor=bnd_fg, leading=9, alignment=TA_CENTER)
            band_tbl = Table([[Paragraph(r.get("band",""), band_p)]],
                             colWidths=[_SC_BAND - 10])
            band_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0,0), (-1,-1), bnd_bg),
                ("LEFTPADDING",   (0,0), (-1,-1), 4),
                ("RIGHTPADDING",  (0,0), (-1,-1), 4),
                ("TOPPADDING",    (0,0), (-1,-1), 2),
                ("BOTTOMPADDING", (0,0), (-1,-1), 2),
            ]))

            scr_p = ParagraphStyle("scr2", fontName="Helvetica-Bold", fontSize=8,
                                   textColor=_score_fg(sc, mx), leading=10, alignment=TA_RIGHT)
            row = Table([[
                Paragraph(r.get("name",""),            ST["r_name"]),
                Paragraph(r.get("display_value","N/A"),ST["r_val"]),
                band_tbl,
                _bar(_SC_BAR - 8, max(0, min(100, sc / mx * 100)), bc),
                Paragraph(f"{sc} / {mx}", scr_p),
            ]], colWidths=[_SC_NAME, _SC_VAL, _SC_BAND, _SC_BAR, _SC_SCR])
            row.setStyle(TableStyle([
                ("LEFTPADDING",   (0,0), (-1,-1), 10),
                ("RIGHTPADDING",  (0,0), (-1,-1), 6),
                ("TOPPADDING",    (0,0), (-1,-1), 5),
                ("BOTTOMPADDING", (0,0), (-1,-1), 5),
                ("LINEBELOW",     (0,0), (-1,-1), 0.5, C_BORDER),
                ("BOX",           (0,0), (-1,-1), 0.5, C_BORDER),
                ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
            ]))
            E.append(row)

        E.append(Spacer(1, 6))

    # ── 7. VERDICT BAR ────────────────────────────────────────
    vd_word_ps = ParagraphStyle("vdw2", fontName="Helvetica-Bold", fontSize=12,
                                textColor=vd_color, leading=15, alignment=TA_RIGHT)
    vd = Table([[
        [Paragraph("Total Score", ST["vd_lbl"]),
         Spacer(1, 3),
         Paragraph(f"{score} / {max_score}", ST["vd_score"])],
        [_bar(_VD_M - 16, score_pct, C_EMERALD, height=7),
         Spacer(1, 3),
         Paragraph(f"60% eligibility threshold at {cutoff} pts", ST["vd_thr"])],
        [Paragraph(verdict, vd_word_ps),
         Spacer(1, 3),
         Paragraph(f"{vd_margin} threshold by {margin_pts} pt{'s' if margin_pts!=1 else ''}",
                   ST["vd_sub"])],
    ]], colWidths=[_VD_L, _VD_M, _VD_R])
    vd.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_CREAM),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("BOX",           (0,0), (-1,-1), 0.5, C_BORDER),
    ]))
    E.append(vd)
    E.append(Spacer(1, 8))

    # ── 8. RECOMMENDATION ─────────────────────────────────────
    rec = Table([[
        "",
        [Paragraph("Investment Committee Recommendation", ST["rec_lbl"]),
         Spacer(1, 4),
         Paragraph(n.get("recommendation",""), ST["rec_body"])],
    ]], colWidths=[4, CW - 4])
    rec.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (0,-1),  C_EMERALD),
        ("BACKGROUND",    (1,0), (1,-1),  C_CREAM),
        ("LEFTPADDING",   (0,0), (0,-1),  0),
        ("RIGHTPADDING",  (0,0), (0,-1),  0),
        ("TOPPADDING",    (0,0), (0,-1),  0),
        ("BOTTOMPADDING", (0,0), (0,-1),  0),
        ("LEFTPADDING",   (1,0), (1,-1),  12),
        ("RIGHTPADDING",  (1,0), (1,-1),  12),
        ("TOPPADDING",    (1,0), (1,-1),  10),
        ("BOTTOMPADDING", (1,0), (1,-1),  10),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
    ]))
    E.append(rec)
    E.append(Spacer(1, 10))

    # ── 9. FOOTER ─────────────────────────────────────────────
    ft = Table([[Paragraph(
        "Generated by SmartRisk Credit \u00b7 "
        "SmartRisk Sheets Technologies Limited (RC: 9170218) \u00b7 "
        "Confidential \u2014 for authorised personnel only",
        ST["footer"],
    )]], colWidths=[CW])
    ft.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_CREAM),
        ("LINEABOVE",     (0,0), (-1,-1), 0.5, C_BORDER),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    E.append(ft)

    return E


# ── Public entry point ─────────────────────────────────────────
def build_pdf(assessment: Assessment) -> bytes:
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError(
            "PDF generation unavailable: reportlab is not installed. "
            "Run: pip install reportlab"
        )
    output = BytesIO()
    doc    = SimpleDocTemplate(
        output, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN,  bottomMargin=MARGIN,
    )
    doc.build(_build_elements(assessment))
    return output.getvalue()