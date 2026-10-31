import anthropic
import asyncio
import json
import re
import os

from api.scoring import CUTOFF_SCORE, MAX_SCORE, normalise_rates

CLAUDE_MODEL      = "claude-opus-5-5"
CLAUDE_EFFORT     = "medium" # thinking is always on; effort sets its depth (raise to "high" if extraction misses figures)
CLAUDE_MAX_TOKENS = 16000    # covers thinking plus the JSON reply
CLAUDE_TIMEOUT    = 300      # seconds; thinking on long PDFs needs headroom
MAX_RETRIES       = 3

client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


# ── Shared helpers ────────────────────────────────────────────
def _strip_fences(text: str) -> str:
    return re.sub(r"^```json\s*|^```\s*|```\s*$", "", text.strip(), flags=re.MULTILINE).strip()


def _parse_json(raw: str) -> dict:
    """RuntimeError on failure, so callers refund the credit and return a clean 502."""
    try:
        return json.loads(_strip_fences(raw))
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        raise RuntimeError("The AI response could not be read. Please try again.")


async def _create(content):
    """One Messages call. fallbacks="default" re-runs a safety-declined request on a fallback model."""
    return await client.beta.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=CLAUDE_MAX_TOKENS,
        output_config={"effort": CLAUDE_EFFORT},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=[{"role": "user", "content": content}],
    )


def _response_text(response) -> str:
    """Join the text blocks; thinking blocks come first and carry no answer text."""
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined to process this document. Please check the file and try again.")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("Claude's response was cut off. Please try again.")
    text = "".join(block.text for block in response.content if block.type == "text")
    if not text.strip():
        raise RuntimeError("Claude returned an empty response. Please try again.")
    return text


async def _call(content) -> str:
    """One Claude call with retries on rate limits, timeouts and overload."""
    delay = 8
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = await asyncio.wait_for(_create(content), timeout=CLAUDE_TIMEOUT)
            return _response_text(response)

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
            if e.status_code in (400, 413) and _is_document_error(e.message):
                raise RuntimeError(
                    "The document could not be read. If it is password-protected or damaged, "
                    "save an unlocked copy (or photos of the pages) and upload again."
                )
            raise RuntimeError(f"Claude API error ({e.status_code}): {e.message}")
        except anthropic.APIError as e:
            raise RuntimeError(f"Claude API error: {e}")


def _is_document_error(message: str) -> bool:
    lc = str(message or "").lower()
    return any(k in lc for k in ("pdf", "image", "document", "password", "encrypt"))


# Applies to every extraction prompt: uploads may be scans or phone photos
SCAN_NOTE = """
The pages may be scanned or photographed: possibly rotated, skewed, faint or split across several images in page order.
Read them as printed. If a figure is illegible, return null for it rather than guess."""


async def _call_with_document(blocks: list[dict], prompt: str) -> str:
    """Call Claude with a document's content blocks (one PDF or page photos) and a text prompt."""
    return await _call([*blocks, {"type": "text", "text": prompt + SCAN_NOTE}])


async def _call_text_only(prompt: str) -> str:
    """Call Claude with text only."""
    return await _call(prompt)


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
- In a multi-column layout, the Company column is typically the THIRD column (after the two Group columns).
- The column order in Nigerian IFRS accounts is typically: Group current year | Group prior year | Company current year | Company prior year.
- You MUST read the column headers carefully before extracting any figure.

How to verify you have the right figures:
- After extracting revenue, confirm it appears on the FACE of the Statement of Comprehensive Income
  as the top-line figure for the Company — not in a note, not in a segment table, not in consolidation workings.
- If you see multiple revenue figures on the same page, use ONLY the one under the Company/Standalone current year column.
- Do NOT use figures from: elimination columns, intercompany schedules, subsidiary breakdowns,
  segment analyses, or consolidation adjustment tables.
- If unsure which column is standalone, the Company revenue will ALWAYS be LOWER than Group revenue.
  Group revenue is always higher than Company revenue due to subsidiary consolidation.
  For example: if you see 483,842,269 and 230,625,974 — the Company figure is 230,625,974.

=== FROM STATEMENT OF COMPREHENSIVE INCOME (P&L) ===
- revenue: The TOP LINE figure labelled Revenue, Turnover, or Investment Income under the COMPANY current year column. NOT gross profit.
- priorYearRevenue: Same revenue line, COMPANY prior year column.
- netIncome: Bottom line — Profit for the year / Profit after taxation, COMPANY current year column.
- ebit: Operating profit / Profit from operations / Profit before finance costs and tax, COMPANY current year column.
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
Use ONLY the COMPANY current year column for all balance sheet figures.
- totalAssets: Total assets grand total.
- currentAssets: Total current assets subtotal.
- cash: Cash and cash equivalents from current assets.
- inventory: Inventories or Stocks from current assets. Return 0 if not present.
- prepaidExpenses: Prepayments or Prepaid expenses from current assets. Return 0 if not present.
- totalLiabilities: Total liabilities grand total.
- currentLiabilities: Total current liabilities subtotal. It MUST include every current liability line:
  trade and other payables, accruals, short-term borrowings, commercial papers, overdrafts, current portion
  of long-term debt, tax payable and other current liabilities. If the statement shows no subtotal,
  add those lines up. It is never just the short-term borrowings line.
- tradePayables: Trade and other payables plus accruals from current liabilities. Return 0 if not present.
- shareholdersEquity: Total equity / Total shareholders funds.
- retainedEarnings: Retained earnings or Accumulated surplus from equity section.

=== DEBT — MOST COMMON EXTRACTION ERROR ===
Debt means every interest-bearing obligation: borrowings, loans, bank loans, overdrafts,
commercial papers, bonds, notes, debentures and finance leases.
It appears in TWO sections of the balance sheet. You MUST check BOTH, and you MUST open the notes
behind lines such as "Other liabilities" or "Other long-term liabilities", because commercial papers,
bonds and overdrafts are often disclosed only inside those notes.
- shortTermDebt: Interest-bearing obligations within CURRENT LIABILITIES (including commercial papers
  and bank overdrafts), COMPANY current year column.
- longTermDebt: Interest-bearing obligations within NON-CURRENT LIABILITIES (including bonds), COMPANY current year column.
  Never return 0 for longTermDebt without explicitly checking non-current liabilities and their notes.
- totalDebt: shortTermDebt + longTermDebt.
- Do NOT count trade payables, accruals, tax payable, customer deposits or joint venture funding as debt.

=== FINANCE COST ===
- financeCost: Total finance costs / interest expense for the year from the income statement
  (or its note), COMPANY current year column, as a positive number. Exclude finance income.

=== INTEREST RATES — FROM NOTES TO THE ACCOUNTS ===
- shortTermInterestRate: Rate on short-term borrowings as a percentage number (e.g. 21.5 for 21.5%). Midpoint if range.
- longTermInterestRate: Rate on long-term borrowings as a percentage number (e.g. 17.5 for 17.5%).

=== METADATA ===
- reportingPeriod: Financial year end date from the face of the statements (e.g. 31 December 2025).
- auditorName: Name of the audit firm from the independent auditors report.
- auditOpinion: Clean / Qualified / Emphasis of matter.

=== PRIOR YEAR FIGURES (COMPANY prior year column — for year-on-year analysis) ===
Extract from the COMPANY prior year column only (the column next to the current year):
- priorYearNetIncome: Profit for the year / Profit after taxation, prior year COMPANY column.
- priorYearEBIT: Operating profit / Profit from operations, prior year COMPANY column.
- priorYearTotalDebt: Sum of short-term and long-term debt (same definition as above), prior year COMPANY column.
- priorYearTotalAssets: Total assets, prior year COMPANY column.
- priorYearShareholdersEquity: Total equity attributable to shareholders, prior year COMPANY column.

Return ONLY this JSON — no other text:
{"revenue":number,"priorYearRevenue":number,"netIncome":number,"ebit":number,
"depreciationAndAmortisation":number,"cash":number,"inventory":number,"prepaidExpenses":number,
"currentAssets":number,"totalAssets":number,"currentLiabilities":number,"tradePayables":number,"totalLiabilities":number,
"shortTermDebt":number,"longTermDebt":number,"totalDebt":number,
"shareholdersEquity":number,"retainedEarnings":number,
"financeCost":number,"shortTermInterestRate":number,"longTermInterestRate":number,
"reportingPeriod":string,"auditorName":string,"auditOpinion":string,
"priorYearNetIncome":number,"priorYearEBIT":number,"priorYearTotalDebt":number,
"priorYearTotalAssets":number,"priorYearShareholdersEquity":number}"""


async def extract_figures(blocks: list[dict]) -> dict:
    raw     = await _call_with_document(blocks, EXTRACTION_PROMPT)
    figures = _parse_json(raw)
    # The prompt asks for percentages; if the model still returns a decimal (0.215),
    # the legacy rule converts it, then rateUnit marks the figures as percentages
    figures = normalise_rates({k: v for k, v in figures.items() if k != "rateUnit"})

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


async def extract_rating(blocks: list[dict]) -> dict:
    raw = await _call_with_document(blocks, RATING_PROMPT)
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


async def extract_cp_terms(blocks: list[dict]) -> dict:
    raw = await _call_with_document(blocks, CP_TERMS_PROMPT)
    return _parse_json(raw)


# ── 4. Narrative generation ───────────────────────────────────
async def generate_narrative(figures: dict, ratios: list, client_info: dict) -> dict:
    def n(v):
        try: return float(v) if v is not None else 0
        except (TypeError, ValueError): return 0

    def fmt(val):
        if val is None: return "N/A"
        return f"₦{n(val) / 1_000_000:.1f}bn"

    def pct(num, den):
        return f"{(n(num) / n(den)) * 100:.1f}" if n(den) else "N/A"

    # Scored ratios come from the engine's saved result, never recomputed here
    by_id = {r.get("id"): r for r in ratios}
    def saved(ratio_id):
        return (by_id.get(ratio_id) or {}).get("display_value", "N/A")

    f       = figures
    td      = n(f.get("shortTermDebt")) + n(f.get("longTermDebt"))
    de      = f"{td / n(f.get('shareholdersEquity')) * 100:.1f}" if n(f.get("shareholdersEquity")) > 0 else "N/A"

    # ── Prior year derived metrics ────────────────────────────
    py_rev    = n(f.get("priorYearRevenue"))
    py_ni     = n(f.get("priorYearNetIncome"))
    py_ebit   = n(f.get("priorYearEBIT"))
    py_td     = n(f.get("priorYearTotalDebt"))
    py_assets = n(f.get("priorYearTotalAssets"))
    py_eq     = n(f.get("priorYearShareholdersEquity"))

    def chg(curr, prior):
        return f"{((curr - prior) / abs(prior) * 100):+.1f}%" if prior else "N/A"

    ratio_lines = "\n".join(
        f"  • {r['name']}: {r['display_value']} | Band: {r['band']} | "
        + ("Info only, not scored" if r.get("display_only") else f"Score: {r['score']}/{r['max_score']}")
        for r in ratios
    )

    prompt = f"""You are a senior Nigerian capital markets credit analyst writing a concise risk assessment.

COMPANY: {client_info.get('clientName')}
EXTERNAL CREDIT RATING: {client_info.get('creditRating') or 'Not provided'}
REVIEW DATE: {client_info.get('reviewDate')}

FINANCIAL FIGURES — CURRENT vs PRIOR YEAR (₦'000):
  Revenue:             {fmt(f.get('revenue'))}  |  Prior: {fmt(py_rev)}  |  Change: {chg(n(f.get('revenue')), py_rev)}
  Net Income:          {fmt(f.get('netIncome'))}  |  Prior: {fmt(py_ni)}  |  Change: {chg(n(f.get('netIncome')), py_ni)}
  EBIT:                {fmt(f.get('ebit'))}  |  Prior: {fmt(py_ebit)}  |  Change: {chg(n(f.get('ebit')), py_ebit)}
  EBITDA:              {fmt(f.get('ebitda'))}
  Cash & Equivalents:  {fmt(f.get('cash'))}
  Current Assets:      {fmt(f.get('currentAssets'))}
  Current Liabilities: {fmt(f.get('currentLiabilities'))}
  Total Assets:        {fmt(f.get('totalAssets'))}  |  Prior: {fmt(py_assets)}
  Total Liabilities:   {fmt(f.get('totalLiabilities'))}
  Shareholders Equity: {fmt(f.get('shareholdersEquity'))}  |  Prior: {fmt(py_eq)}  |  Change: {chg(n(f.get('shareholdersEquity')), py_eq)}
  Total Debt:          {fmt(td)}  |  Prior: {fmt(py_td)}  |  Change: {chg(td, py_td)}
  Retained Earnings:   {fmt(f.get('retainedEarnings'))}

DERIVED METRICS:
  Net Income Margin:   {pct(f.get('netIncome'), f.get('revenue'))}%
  Return on Assets:    {pct(f.get('netIncome'), f.get('totalAssets'))}%
  Return on Equity:    {pct(f.get('netIncome'), f.get('shareholdersEquity'))}%
  Debt to Equity:      {de}%
  Net Debt / EBITDA:   {saved('debt_to_ebitda')}
  DSCR (EBITDA / (Finance Cost + Short-term Debt)):  {saved('dscr')}
  Current Ratio:       {saved('current_ratio')}
  Cash Ratio:          {saved('cash_ratio')}

COMPUTED SCORING RATIOS:
{ratio_lines}

SCORING RESULT:
  Total Score: {client_info.get('totalScore')} / {MAX_SCORE}
  Eligible: {f'YES — meets the {CUTOFF_SCORE}-point cut-off' if client_info.get('eligible') else f'NO — below the {CUTOFF_SCORE}-point cut-off'}
  Score Tier: {'STRONG (≥ 42 pts)' if (client_info.get('totalScore') or 0) >= 42 else 'MARGINAL (34–41 pts)' if client_info.get('eligible') else 'BELOW THRESHOLD (< 34 pts)'} 

INSTRUCTIONS:
- Each narrative section: 2–3 sentences MAXIMUM.
- Sentence 1: Name the PRIMARY metric driving this status and cite its exact value.
- Sentence 2: State what this means for the issuer's debt service capacity or credit risk.
- Sentence 3 (only if prior year data is not N/A): State the most material year-on-year change.
- No filler phrases ("it is worth noting", "overall", "it should be mentioned"). Be direct.
- Every sentence must contain at least one specific figure. Third person. ₦ for Naira.

For strengths and weaknesses:
- Each item must be exactly ONE sentence: name the metric, cite the figure, and state the business implication.
- Do not just restate the score — explain why it matters to a creditor.

Return ONLY valid JSON with no markdown and no backticks:
{{
  "financialStanding": "Strong|Fair|Weak",
  "financialStandingReview": "2-3 sentences: primary profitability metric driving this status, its YoY movement",
  "cashFlowRating": "Strong|Moderate|Weak",
  "cashFlowReview": "2-3 sentences: EBITDA or liquidity figure driving this status, what it means for debt service. One sentence MUST state how far current assets (Current Ratio) and cash (Cash Ratio) cover current liabilities, citing both ratios.",
  "creditRiskLevel": "Low|Moderate|High",
  "creditRiskReview": "2-3 sentences: primary leverage metric, what it means for creditors",
  "futureRiskLevel": "Low|Moderate|High",
  "futureRisksReview": "2-3 sentences: most material forward risk grounded in current trend",
  "creditRatingReview": "1-2 sentences: what the external rating implies for this specific issuance",
  "recommendation": "2–3 sentences. Opening MUST match the score tier exactly — no exceptions: STRONG (≥ 42 pts): start with 'The quantitative profile supports investment consideration —' then state key strengths. MARGINAL (34–41 pts): start with 'Analysts are advised to proceed with caution —' then state the specific concern and which ratio drives it. BELOW THRESHOLD (< 34 pts): start with 'Analysts are advised to apply caution and supplement this quantitative assessment with thorough qualitative review —' then state the primary quantitative concern with its computed value. Final sentence: name the single ratio most decisive to the outcome and what qualitative evidence could strengthen the credit case. NEVER use the words: NOT RECOMMENDED, RECOMMENDED for investment, APPROVED FOR INVESTMENT, APPROVED WITH CAUTION, or DECLINED.",
  "strengths": ["one sentence: metric + exact figure + WHY it is a credit strength", "..."],
  "weaknesses": ["one sentence: metric + exact figure + WHY it elevates credit risk", "..."]
}}"""

    raw = await _call_text_only(prompt)
    return _parse_json(raw)