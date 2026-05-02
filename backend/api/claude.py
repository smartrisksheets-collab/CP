import anthropic
import asyncio
import json
import re
import os
from typing import Optional

CLAUDE_MODEL   = "claude-sonnet-4-5"
CLAUDE_TIMEOUT = 150  # seconds — narrative generation needs more headroom
MAX_RETRIES    = 3

client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


# ── Shared helpers ────────────────────────────────────────────
def _strip_fences(text: str) -> str:
    return re.sub(r"^```json\s*|^```\s*|```\s*$", "", text.strip(), flags=re.MULTILINE).strip()


def _parse_json(raw: str) -> dict:
    try:
        return json.loads(_strip_fences(raw))
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Could not parse JSON from Claude response: {raw[:200]}")


async def _call_with_pdf(base64_pdf: str, prompt: str) -> str:
    """Call Claude with a PDF document and a text prompt. Retries on 429."""
    delay = 8
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = await asyncio.wait_for(
                client.messages.create(
                    model=CLAUDE_MODEL,
                    max_tokens=2000,
                    messages=[{
                        "role": "user",
                        "content": [
                            {
                                "type": "document",
                                "source": {
                                    "type"      : "base64",
                                    "media_type": "application/pdf",
                                    "data"      : base64_pdf,
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }],
                ),
                timeout=CLAUDE_TIMEOUT,
            )
            return response.content[0].text

        except anthropic.RateLimitError:
            if attempt < MAX_RETRIES:
                await asyncio.sleep(delay)
                delay *= 2
                continue
            raise RuntimeError("Claude rate limit reached. Please wait 30 seconds and try again.")

        except asyncio.TimeoutError:
            if attempt < MAX_RETRIES:
                await asyncio.sleep(5)
                continue
            raise RuntimeError("Claude took too long to respond. Please try again in a moment.")

        except anthropic.APIStatusError as e:
            if e.status_code in (529, 500, 503) and attempt < MAX_RETRIES:
                await asyncio.sleep(delay)
                delay *= 2
                continue
            raise RuntimeError(f"Claude API error ({e.status_code}): {e.message}")
        except anthropic.APIError as e:
            raise RuntimeError(f"Claude API error: {e}")


async def _call_text_only(prompt: str) -> str:
    """Call Claude with text only. Retries on 429."""
    delay = 8
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = await asyncio.wait_for(
                client.messages.create(
                    model=CLAUDE_MODEL,
                    max_tokens=2000,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=CLAUDE_TIMEOUT,
            )
            return response.content[0].text

        except anthropic.RateLimitError:
            if attempt < MAX_RETRIES:
                await asyncio.sleep(delay)
                delay *= 2
                continue
            raise RuntimeError("Claude rate limit reached. Please wait 30 seconds and try again.")

        except asyncio.TimeoutError:
            if attempt < MAX_RETRIES:
                await asyncio.sleep(5)
                continue
            raise RuntimeError("Claude took too long to respond. Please try again in a moment.")

        except anthropic.APIStatusError as e:
            if e.status_code in (529, 500, 503) and attempt < MAX_RETRIES:
                await asyncio.sleep(delay)
                delay *= 2
                continue
            raise RuntimeError(f"Claude API error ({e.status_code}): {e.message}")
        except anthropic.APIError as e:
            raise RuntimeError(f"Claude API error: {e}")


# ── 1. Financial figures extraction ──────────────────────────
EXTRACTION_PROMPT = """You are a senior financial analyst extracting figures from Nigerian IFRS-compliant audited financial statements.
Extract figures from the PRIMARY FINANCIAL STATEMENTS ONLY — not from rating report summaries, ratio tables, or analyst commentary.
The primary statements are: Statement of Comprehensive Income, Statement of Financial Position, Statement of Cash Flows, and Notes to the Accounts.

RULES:
- All figures in N'000 as plain numbers — no symbols, no commas, no brackets.
- Negative values (e.g. losses) as negative numbers.
- Audited accounts ALWAYS show current year AND prior year side by side — extract BOTH where required.
- If a figure cannot be found in the primary statements after checking all four statements, return null.
- Return ONLY a valid JSON object. No markdown, no explanation, no code fences.

=== STANDALONE vs GROUP — MOST CRITICAL RULE ===
Nigerian audited accounts for group companies present BOTH standalone (Company) AND consolidated (Group) figures.
You MUST extract ONLY the STANDALONE / COMPANY figures — NEVER the consolidated or Group figures.
The issuing entity is the Company, not the Group. The obligor on the CP/Note is the legal entity itself.

How to identify standalone figures:
- Look for columns or sections labelled: Company, Parent Company, The Company, Standalone, or Entity.
- Standalone statements are often presented FIRST, before or alongside consolidated statements.
- If statements are on separate pages, the page heading will say "Company" or "Standalone".
- In a multi-column layout, the Company column is typically the THIRD column (after Group 2024 and Group 2023).
- The column order in Nigerian IFRS accounts is typically: Group 2024 | Group 2023 | Company 2024 | Company 2023.
- You MUST read the column headers carefully before extracting any figure.

How to verify you have the right figures:
- After extracting revenue, confirm it appears on the FACE of the Statement of Comprehensive Income
  as the top-line figure for the Company — not in a note, not in a segment table, not in consolidation workings.
- If you see multiple revenue figures on the same page, use ONLY the one under the Company/Standalone 2024 column.
- Do NOT use figures from: elimination columns, intercompany schedules, subsidiary breakdowns,
  segment analyses, or consolidation adjustment tables.
- If unsure which column is standalone, the Company revenue will ALWAYS be LOWER than Group revenue.
  Group revenue is always higher than Company revenue due to subsidiary consolidation.
  For example: if you see 483,842,269 and 230,625,974 — the Company figure is 230,625,974.

=== FROM STATEMENT OF COMPREHENSIVE INCOME (P&L) ===
- revenue: The TOP LINE figure labelled Revenue, Turnover, or Investment Income under the COMPANY 2024 column. NOT gross profit.
- priorYearRevenue: Same revenue line, COMPANY 2023 (prior year) column.
- netIncome: Bottom line — Profit for the year / Profit after taxation, COMPANY 2024 column.
- ebit: Operating profit / Profit from operations / Profit before finance costs and tax, COMPANY 2024 column.
  If not separately labelled: derive as Profit before tax + Finance costs - Finance income.
  IMPORTANT: Do NOT use Profit before tax as EBIT if there are finance cost line items.

=== DEPRECIATION & AMORTISATION (check all three locations in order) ===
- depreciationAndAmortisation: Search in this order:
  1. Statement of Cash Flows — adjustments section under operating activities, COMPANY column.
  2. Notes to the accounts — PPE note or intangible assets note.
  3. Income statement — if shown as a separate line item.
  Add depreciation + amortisation together if shown separately.
  This field is critical — do not return null without checking all three locations.

=== FROM STATEMENT OF FINANCIAL POSITION (BALANCE SHEET) ===
Use ONLY the COMPANY 2024 column for all balance sheet figures.
- totalAssets: Total assets grand total.
- currentAssets: Total current assets subtotal.
- cash: Cash and cash equivalents from current assets.
- inventory: Inventories or Stocks from current assets. Return 0 if not present.
- prepaidExpenses: Prepayments or Prepaid expenses from current assets. Return 0 if not present.
- totalLiabilities: Total liabilities grand total.
- currentLiabilities: Total current liabilities subtotal.
- shareholdersEquity: Total equity / Total shareholders funds.
- retainedEarnings: Retained earnings or Accumulated surplus from equity section.

=== DEBT — MOST COMMON EXTRACTION ERROR ===
In Nigerian audited accounts, debt is labelled Borrowings, Loans and borrowings, or Bank loans.
It appears in TWO sections of the balance sheet. You MUST check BOTH:
- shortTermDebt: Borrowings within the CURRENT LIABILITIES section, COMPANY 2024 column.
- longTermDebt: Borrowings within the NON-CURRENT LIABILITIES section, COMPANY 2024 column.
  Never return 0 for longTermDebt without explicitly checking non-current liabilities.
- totalDebt: shortTermDebt + longTermDebt.

=== INTEREST RATES — FROM NOTES TO THE ACCOUNTS ===
- shortTermInterestRate: Rate on short-term borrowings as decimal (e.g. 0.215 for 21.5%). Midpoint if range.
- longTermInterestRate: Rate on long-term borrowings as decimal.

=== METADATA ===
- reportingPeriod: Financial year end date from the face of the statements (e.g. 31 December 2024).
- auditorName: Name of the audit firm from the independent auditors report.
- auditOpinion: Clean / Qualified / Emphasis of matter.

Return ONLY this JSON — no other text:
{"revenue":number,"priorYearRevenue":number,"netIncome":number,"ebit":number,
"depreciationAndAmortisation":number,"cash":number,"inventory":number,"prepaidExpenses":number,
"currentAssets":number,"totalAssets":number,"currentLiabilities":number,"totalLiabilities":number,
"shortTermDebt":number,"longTermDebt":number,"totalDebt":number,
"shareholdersEquity":number,"retainedEarnings":number,
"shortTermInterestRate":number,"longTermInterestRate":number,
"reportingPeriod":string,"auditorName":string,"auditOpinion":string}"""


async def extract_figures(base64_pdf: str) -> dict:
    raw     = await _call_with_pdf(base64_pdf, EXTRACTION_PROMPT)
    figures = _parse_json(raw)

    # Compute EBITDA server-side
    ebit = figures.get("ebit")
    da   = figures.get("depreciationAndAmortisation")
    if ebit is not None and da is not None:
        figures["ebitda"] = ebit + da
    elif ebit is not None:
        figures["ebitda"] = ebit  # D&A not found — fallback, analyst should verify

    return figures


# ── 2. Credit rating extraction ───────────────────────────────
RATING_PROMPT = """You are extracting credit rating data from a Nigerian corporate rating report.
The report may be from Agusto & Co., GCR Ratings, DataPro, or another agency.

Extract ONLY these six structured fields:
1. RATING AGENCY NAME — e.g. "Agusto & Co.", "GCR Ratings", "DataPro"
2. LONG-TERM RATING — e.g. "A", "Bbb+", "BBB". For GCR, strip the "(NG)" suffix.
3. SHORT-TERM RATING — e.g. "A2". Return null if not present.
4. OUTLOOK — "Stable", "Positive", or "Negative".
5. ISSUE DATE — when the rating was issued.
6. EXPIRY DATE — when the rating expires. GCR: return null.

Return ONLY a valid JSON object, no markdown, no backticks:
{"ratingAgency":string,"longTermRating":string,"shortTermRating":string|null,
"ratingOutlook":string,"issueDate":string,"expiryDate":string|null}"""


async def extract_rating(base64_pdf: str) -> dict:
    raw = await _call_with_pdf(base64_pdf, RATING_PROMPT)
    return _parse_json(raw)


# ── 3. CP terms extraction ────────────────────────────────────
CP_TERMS_PROMPT = """You are extracting Commercial Paper indicative terms from a Nigerian capital markets email.

=== CRITICAL: WHERE TO EXTRACT FROM ===
This document is a forwarded email chain. It contains:
  - Email headers, signatures, and disclaimers (IGNORE ENTIRELY)
  - A company background section with financial highlights table (IGNORE ENTIRELY)
  - A numbered list of offer documents (IGNORE)
  - ONE two-column label/value table introduced by the phrase:
    "Please see indicative terms of the Commercial Paper Issuance below:" or similar.
    THIS IS THE ONLY TABLE YOU MAY EXTRACT FROM.

=== MULTI-TRANCHE ISSUANCES ===
The terms table may have two value columns for two tranches/series.
Tranche A = first (lower-numbered) series column.
Tranche B = second (higher-numbered) series column.
If only one tranche, populate A fields only and return null for B fields.

All fields are strings. Return null (not empty string) if a field is absent.

Return ONLY valid JSON, no markdown, no backticks:
{"issuer":null,"programmeSize":null,"targetSize":null,
"seriesA":null,"seriesB":null,"tenorA":null,"tenorB":null,
"discountRateA":null,"discountRateB":null,"impliedYieldA":null,"impliedYieldB":null,
"offerOpen":null,"offerClose":null,"fundingDate":null,
"issuerRating":null,"minSubscription":null,"useOfProceeds":null,"taxation":null}"""


async def extract_cp_terms(base64_pdf: str) -> dict:
    raw = await _call_with_pdf(base64_pdf, CP_TERMS_PROMPT)
    return _parse_json(raw)


# ── 4. Narrative generation ───────────────────────────────────
async def generate_narrative(figures: dict, ratios: list, client_info: dict) -> dict:
    def n(v):
        try: return float(v) if v is not None else 0
        except: return 0

    def fmt(val):
        if val is None: return "N/A"
        try:
            bn = n(val) / 1_000_000
            return f"₦{bn:.1f}bn"
        except: return "N/A"

    def pct(num, den):
        try:
            return f"{(n(num) / n(den)) * 100:.1f}" if n(den) else "N/A"
        except: return "N/A"

    f       = figures
    td      = n(f.get("shortTermDebt")) + n(f.get("longTermDebt"))
    net_debt = td - n(f.get("cash"))
    dscr    = f"{n(f.get('ebitda')) / td:.2f}" if td > 0 and n(f.get("ebitda")) else "N/A"
    net_dte = f"{net_debt / n(f.get('ebitda')):.2f}" if n(f.get("ebitda")) > 0 else "N/A"
    de      = f"{td / n(f.get('shareholdersEquity')) * 100:.1f}" if n(f.get("shareholdersEquity")) > 0 else "N/A"

    ratio_lines = "\n".join(
        f"  • {r['name']}: {r['display_value']} | Band: {r['band']} | Score: {r['score']}/{r['max_score']}"
        for r in ratios
    )

    prompt = f"""You are a senior Nigerian capital markets credit analyst writing a risk assessment narrative
for a credit risk report on a Commercial Paper or Promissory Note issuance.

COMPANY: {client_info.get('clientName')}
EXTERNAL CREDIT RATING: {client_info.get('creditRating') or 'Not provided'}
REVIEW DATE: {client_info.get('reviewDate')}

VERIFIED FINANCIAL FIGURES (₦'000):
  Revenue:             {fmt(f.get('revenue'))}
  Net Income:          {fmt(f.get('netIncome'))}
  EBITDA:              {fmt(f.get('ebitda'))}
  EBIT:                {fmt(f.get('ebit'))}
  Cash & Equivalents:  {fmt(f.get('cash'))}
  Total Assets:        {fmt(f.get('totalAssets'))}
  Total Liabilities:   {fmt(f.get('totalLiabilities'))}
  Shareholders Equity: {fmt(f.get('shareholdersEquity'))}
  Short-term Debt:     {fmt(f.get('shortTermDebt'))}
  Long-term Debt:      {fmt(f.get('longTermDebt'))}
  Total Debt:          {fmt(td)}
  Retained Earnings:   {fmt(f.get('retainedEarnings'))}

DERIVED METRICS:
  Net Income Margin:   {pct(f.get('netIncome'), f.get('revenue'))}%
  Return on Assets:    {pct(f.get('netIncome'), f.get('totalAssets'))}%
  Return on Equity:    {pct(f.get('netIncome'), f.get('shareholdersEquity'))}%
  Debt to Equity:      {de}%
  Net Debt / EBITDA:   {net_dte}x
  DSCR (EBITDA/Debt):  {dscr}x

COMPUTED SCORING RATIOS:
{ratio_lines}

SCORING RESULT:
  Total Score: {client_info.get('totalScore')} / 56
  Eligible: {'YES — meets the 34-point cut-off' if client_info.get('eligible') else 'NO — below the 34-point cut-off'}

Write six narrative sections for the credit risk report. Each should be 3–5 sentences.
Use formal Nigerian capital markets analyst language. Ground every statement in the specific
numbers above. Do not invent figures. Use ₦ for Naira. Write in third person.

Return ONLY valid JSON with no markdown and no backticks:
{{
  "financialStanding": "Strong|Fair|Weak",
  "financialStandingReview": "3-5 sentences on profitability, margins, ROA, revenue growth",
  "cashFlowRating": "Strong|Moderate|Weak",
  "cashFlowReview": "3-5 sentences on EBITDA, debt service coverage, working capital, liquidity",
  "creditRiskLevel": "Low|Moderate|High",
  "creditRiskReview": "3-5 sentences on leverage — debt to equity, net debt/EBITDA, interest burden",
  "futureRiskLevel": "Low|Moderate|High",
  "futureRisksReview": "3-5 sentences on forward-looking risks — earnings sustainability, macro, sector risks",
  "creditRatingReview": "2-3 sentences on what the external rating means in context of this issuance and computed scores",
  "recommendation": "2-3 sentences: overall recommendation to the investment committee with key supporting evidence"
}}"""

    raw = await _call_text_only(prompt)
    return _parse_json(raw)