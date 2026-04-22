try:
    from weasyprint import HTML
    WEASYPRINT_AVAILABLE = True
except OSError:
    WEASYPRINT_AVAILABLE = False
from api.models import Assessment


def _fmt(val) -> str:
    """Format number with commas. Returns N/A if None."""
    try:
        return f"{int(val):,}" if val is not None else "N/A"
    except (TypeError, ValueError):
        return "N/A"


def _score_color(score: int, max_score: int) -> str:
    if score == max_score: return "#1E7E34"
    if score <= 0:         return "#A32D2D"
    return "#854F0B"


def _score_bg(score: int, max_score: int) -> str:
    if score == max_score: return "#EAF3DE"
    if score <= 0:         return "#FCEBEB"
    return "#d1fae5"


def _rating_color(rating: str) -> str:
    mapping = {
        "Strong"  : "#1E7E34",
        "Fair"    : "#854F0B",
        "Weak"    : "#A32D2D",
        "Low"     : "#1E7E34",
        "Moderate": "#854F0B",
        "High"    : "#A32D2D",
    }
    return mapping.get(rating, "#5A5A5A")


def _build_ratio_rows(ratios: list) -> str:
    CATEGORY_LABELS = {
        "Liquidity"  : "Quick Ratios",
        "Profitability": "Profitability Ratios",
        "Returns"    : "Return Ratios",
        "Leverage"   : "Leverage Ratios",
        "Coverage"   : "Coverage Ratios",
        "Bankruptcy" : "Corporate Bankruptcy",
    }
    seen_cats = set()
    rows      = ""

    for r in ratios:
        cat = r.get("category", "")
        label = CATEGORY_LABELS.get(cat, cat)

        if cat not in seen_cats:
            rows += f"""
            <tr style="background:#1F2854;color:#fff;">
                <td colspan="6" style="padding:6px 8px;font-weight:bold;font-size:9pt;">{label}</td>
            </tr>"""
            seen_cats.add(cat)

        score    = r.get("score", 0)
        max_s    = r.get("max_score", 0)
        s_color  = _score_color(score, max_s)
        s_bg     = _score_bg(score, max_s)

        rows += f"""
        <tr>
            <td>{r.get('name','')}</td>
            <td style="font-size:8pt;color:#666;">{r.get('formula','')}</td>
            <td style="font-size:8pt;">{r.get('benchmark','')}</td>
            <td>
                <span style="background:{s_bg};color:{s_color};
                      padding:2px 6px;border-radius:999px;font-size:8pt;">
                    {r.get('display_value','N/A')}
                </span>
            </td>
            <td style="font-weight:bold;color:{s_color};text-align:right;">{score}</td>
            <td style="color:#888;text-align:right;">{max_s}</td>
        </tr>"""

    return rows


def _build_cp_terms(cp: dict | None) -> str:
    if not cp:
        return "<p style='color:#888;font-size:9pt;'>No CP terms provided.</p>"

    def v(key): return cp.get(key) or "—"

    has_b = cp.get("seriesB") is not None

    header = f"""
    <tr>
        <th>Parameter</th>
        <th>{v('seriesA') or 'Tranche A'}</th>
        {'<th>' + (v('seriesB') or 'Tranche B') + '</th>' if has_b else ''}
    </tr>"""

    def row(label, a_key, b_key=None, colspan=False):
        b_cell = ""
        if has_b and b_key:
            b_cell = f"<td>{v(b_key)}</td>"
        elif colspan:
            b_cell = ""
            return f"<tr><td>{label}</td><td colspan='2'>{v(a_key)}</td></tr>"
        return f"<tr><td>{label}</td><td>{v(a_key)}</td>{b_cell}</tr>"

    return f"""
    <table>
        <thead>{header}</thead>
        <tbody>
            {row('Programme Size', 'programmeSize', colspan=True)}
            {row('Target Size',    'targetSize',    colspan=True)}
            {row('Tenor',          'tenorA',        'tenorB')}
            {row('Discount Rate',  'discountRateA', 'discountRateB')}
            {row('Implied Yield',  'impliedYieldA', 'impliedYieldB')}
            {row('Offer Opens',    'offerOpen',     colspan=True)}
            {row('Offer Closes',   'offerClose',    colspan=True)}
            {row('Funding Date',   'fundingDate',   colspan=True)}
            {row('Min Subscription','minSubscription', colspan=True)}
            {row('Use of Proceeds','useOfProceeds', colspan=True)}
            {row('Taxation',       'taxation',      colspan=True)}
        </tbody>
    </table>"""


def _build_html(assessment: Assessment) -> str:
    ci        = assessment.client_info   if hasattr(assessment, "client_info") else {}
    n         = assessment.narrative     or {}
    f         = assessment.figures       or {}
    ratios    = assessment.ratios        or []
    cp        = f.get("cpTerms")
    eligible  = assessment.eligible
    score     = assessment.total_score or 0

    verdict_bg    = "#EAF3DE" if eligible else "#FCEBEB"
    verdict_border= "#97C459" if eligible else "#F09595"
    verdict_color = "#27500A" if eligible else "#791F1F"
    verdict_text  = "ELIGIBLE" if eligible else "NOT ELIGIBLE"
    verdict_sub   = "Meets" if eligible else "Below"

    ratio_rows  = _build_ratio_rows(ratios)
    cp_section  = _build_cp_terms(cp)

    def narrative_row(param, rating, review, rating_key=None):
        color = _rating_color(rating) if rating else "#5A5A5A"
        rating_cell = f"<td style='color:{color};font-weight:bold;width:12%;'>{rating or ''}</td>"
        return f"""
        <tr>
            <td style="width:18%;"><strong>{param}</strong></td>
            {rating_cell}
            <td>{review or ''}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {{ font-family: Arial, sans-serif; font-size: 10pt; color: #2C2C2C; margin: 0; padding: 0; }}
  .page {{ padding: 20mm; max-width: 210mm; margin: 0 auto; }}
  .cover-header {{ background: #1F2854; color: #fff; padding: 24px; text-align: center; margin-bottom: 16px; }}
  .cover-title {{ font-size: 16pt; font-weight: bold; color: #01b88e; margin-bottom: 8px; }}
  .cover-client {{ font-size: 13pt; font-weight: bold; color: #fff; }}
  .cover-meta {{ font-size: 9pt; color: #aaa; margin-top: 6px; }}
  .section-hdr {{ background: #1F2854; color: #fff; padding: 6px 10px; font-weight: bold;
                  font-size: 10pt; margin: 16px 0 8px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 12px; }}
  th {{ background: #2A3870; color: #fff; padding: 6px 8px; text-align: left; font-size: 9pt; }}
  td {{ padding: 6px 8px; border-bottom: 1px solid #E8E8E8; vertical-align: top; }}
  tr:nth-child(even) td {{ background: #F5F5F2; }}
  .footer {{ font-size: 8pt; color: #888; border-top: 1px solid #E0E0E0;
             padding-top: 8px; margin-top: 24px; text-align: center; }}
</style>
</head>
<body>
<div class="page">

  <div class="cover-header">
    <div class="cover-title">QUANTITATIVE CREDIT RISK ASSESSMENT</div>
    <div class="cover-client">{assessment.client_name or 'Client'}</div>
    <div class="cover-meta">
      Review Date: {f.get('reviewDate', '—')} &nbsp;|&nbsp;
      Issuer Rating: {assessment.credit_rating or 'Not provided'}
    </div>
  </div>

  <div class="section-hdr">1. Commercial Paper Terms</div>
  {cp_section}

  <div class="section-hdr">2. Risk Analysis</div>
  <table>
    <thead>
      <tr><th style="width:18%;">Risk Parameter</th><th style="width:12%;">Definition</th><th>Risk Review</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>Nature of CPs</strong></td><td>Senior Unsecured</td><td>These are unsecured short-tenor obligations.</td></tr>
      {narrative_row('Financial Standing', n.get('financialStanding'), n.get('financialStandingReview'))}
      {narrative_row('Cash Flow',          n.get('cashFlowRating'),    n.get('cashFlowReview'))}
      {narrative_row('Credit Rating',      assessment.credit_rating,   n.get('creditRatingReview'))}
      {narrative_row('Credit Risk',        n.get('creditRiskLevel'),   n.get('creditRiskReview'))}
      {narrative_row('Future Risks',       n.get('futureRiskLevel'),   n.get('futureRisksReview'))}
    </tbody>
  </table>
  <table>
    <tr><th style="width:18%;">Recommendation</th><td>{n.get('recommendation','')}</td></tr>
  </table>

  <div class="section-hdr">3. Key Financial Figures (₦'000)</div>
  <table>
    <thead><tr><th>Metric</th><th style="text-align:right;">Figure (₦'000)</th></tr></thead>
    <tbody>
      <tr><td>Revenue</td>               <td style="text-align:right;">{_fmt(f.get('revenue'))}</td></tr>
      <tr><td>Net Income</td>            <td style="text-align:right;">{_fmt(f.get('netIncome'))}</td></tr>
      <tr><td>EBITDA</td>               <td style="text-align:right;">{_fmt(f.get('ebitda'))}</td></tr>
      <tr><td>EBIT</td>                 <td style="text-align:right;">{_fmt(f.get('ebit'))}</td></tr>
      <tr><td>Cash & Equivalents</td>   <td style="text-align:right;">{_fmt(f.get('cash'))}</td></tr>
      <tr><td>Current Assets</td>       <td style="text-align:right;">{_fmt(f.get('currentAssets'))}</td></tr>
      <tr><td>Current Liabilities</td>  <td style="text-align:right;">{_fmt(f.get('currentLiabilities'))}</td></tr>
      <tr><td>Total Assets</td>         <td style="text-align:right;">{_fmt(f.get('totalAssets'))}</td></tr>
      <tr><td>Total Liabilities</td>    <td style="text-align:right;">{_fmt(f.get('totalLiabilities'))}</td></tr>
      <tr><td>Short-term Debt</td>      <td style="text-align:right;">{_fmt(f.get('shortTermDebt'))}</td></tr>
      <tr><td>Long-term Debt</td>       <td style="text-align:right;">{_fmt(f.get('longTermDebt'))}</td></tr>
      <tr><td>Shareholders' Equity</td> <td style="text-align:right;">{_fmt(f.get('shareholdersEquity'))}</td></tr>
      <tr><td>Retained Earnings</td>    <td style="text-align:right;">{_fmt(f.get('retainedEarnings'))}</td></tr>
    </tbody>
  </table>

  <div class="section-hdr">4. Quantitative Credit Risk Rating</div>
  <table>
    <thead>
      <tr>
        <th>Ratio</th><th>Formula</th><th>Benchmark</th>
        <th>Result</th><th style="text-align:right;">Score</th><th style="text-align:right;">Max</th>
      </tr>
    </thead>
    <tbody>
      {ratio_rows}
      <tr style="background:#F0F0F0;">
        <td colspan="4"><strong>TOTAL</strong></td>
        <td style="text-align:right;font-weight:bold;color:#1F2854;">{score}</td>
        <td style="text-align:right;color:#888;">56</td>
      </tr>
    </tbody>
  </table>

  <div style="background:{verdict_bg};border:2px solid {verdict_border};
              padding:16px;text-align:center;margin:16px 0;border-radius:4px;">
    <div style="font-size:16pt;font-weight:bold;color:{verdict_color};">{verdict_text}</div>
    <div style="font-size:10pt;color:#5A5A5A;margin-top:6px;">
      Score: {score} / 56 &mdash; {verdict_sub} the 34-point (60%) threshold
    </div>
  </div>

  <div class="footer">
    Generated by SmartRisk Credit &bull;
    SmartRisk Sheets Technologies Limited (RC: 9170218) &bull;
    For internal reference only. Confidential — authorised personnel only.
  </div>

</div>
</body>
</html>"""


def build_pdf(assessment: Assessment) -> bytes:
    if not WEASYPRINT_AVAILABLE:
        raise RuntimeError("PDF generation not available in this environment.")
    html = _build_html(assessment)
    return HTML(string=html).write_pdf()