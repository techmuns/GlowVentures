// 360 ONE PRIVATE WEALTH — "PORTFOLIO ANALYSIS REPORT - CLIENT LEVEL", ~11pp.
//
// One PDF, several reports. The sections are located by their headings rather
// than by page number, because a bundle grows a page whenever a client holds one
// more scheme and a fixed "p6" would then read the wrong table:
//
//   p2  Executive Summary            -> account totals, engagement model
//   p4  Corpus, Income & Expense     -> corpus / income / expense
//   p6  Detailed Holding Statement   -> the holdings
//   p7  Transaction Statement        -> dated cash flows
//   p7  Corporate Action Statement   -> corporate actions
//
// Holdings are AIF / PMS units: no ISIN, no ticker, name only. The `manager`
// column is the scheme sleeve, not the owner.
//
// ─────────────────────────────────────────────────────────────────────────────
// CALIBRATION STATUS: verified against the four real bundles in this drop —
// CRN37702 (Ajay) and CRN60117 (Bharat), each at 31 May 2026 and 30 Jun 2026.
//
// What that calibration had to cope with:
//
//   • ONE LOGICAL HOLDING SPANS SEVEN PHYSICAL LINES. The instrument name wraps
//     over four, the portfolio manager over three, and the figures are split
//     across TWO of them — quantity/cost/value/IRR on the first, and
//     %Unrealized, Realized and Benchmark IRR on the fourth. Read line by line
//     that is four holdings, three of them figureless. `readRecords` groups the
//     body into records instead: a record STARTS at a row carrying a quantity,
//     and every row until the next such row fills columns it left empty.
//   • "Price As on" is a DATE column and sits beside no price at all — the NAV
//     per unit is not printed, only the Net Asset Value. A `marketPrice` alias
//     of /^price/ bound to it and read `30-Jun-26` as a price, which is why the
//     alias below is anchored against exactly that.
//   • The transaction and corporate-action sections routinely print
//     "No data available to generate …". That is a REPORTED EMPTY, not a
//     missing table, and it is recorded as such — a reader who sees
//     "table not found" goes looking for a parsing bug that isn't there.
// ─────────────────────────────────────────────────────────────────────────────
import { findTable, readRows, findLabelledNumber, rowsMatching, toAuditSheet } from "../lib/table.mjs";
import { parseNum, parseNumInfo } from "../lib/parseNum.mjs";
import {
  makeHolding, makeTotals, makeFlows, makeCashFlow, makeMember,
  normalizeEngagement, dominantEngagement,
} from "../lib/document.mjs";
import { toIso } from "../lib/classify.mjs";

export const PROVIDER = "360 ONE Private Wealth";

const SECTION_HEADINGS = {
  "executive-summary": /executive\s+summary/i,
  "corpus-income-expense": /corpus\s*,?\s*income\s*(&|and)?\s*expense/i,
  "detailed-holding-statement": /detailed\s+holding\s+statement/i,
  "transaction-statement": /transaction\s+statement/i,
  "corporate-action": /corporate\s+action/i,
};

// HOW THIS TABLE IS READ, and what had to be established before it could be.
//
// The header is a THREE-LINE block naming sixteen columns, and the PDF fuses
// pairs of them in two different ways. Both are recoverable, but only after the
// evidence says which figure carries which label — never from position alone.
//
//   1. FUSED IN ONE SPAN — "Value * Holding %" is one header item above one data
//      item, `14,580,412.51 100.00 %`. Told apart by FORM: an amount then a
//      percentage. The amount is confirmed by the executive summary's own
//      Current Value. See `splitValueAndPct`.
//
//   2. STACKED IN ONE COLUMN — `Gain/Loss : Unrealized *` sits directly above
//      `Unrealized %`, and `Gain/Loss : Total *` above `Realized *`, in the same
//      column. The record's first line carries the upper label's figure and a
//      continuation line carries the lower one. That assignment is checked
//      against three of the report's own identities rather than assumed; see
//      SECOND_LINE, which lists them.
//
// Every ambiguous column still gets its own ALIAS, and that is load-bearing
// independently of what is done with the value: an alias is what tells the
// layout engine a column boundary exists there. Dropping `unrealized` did not
// leave its figure unread — it merged that column into `distributedIncome` and
// produced the cell `"4,713,765.51 2,037,517.00"`, one number lost and the other
// unparseable.
//
// Order matters: `priceAsOn` binds before `marketPrice`, which explicitly
// refuses "Price As on" — the bundle prints a DATE under that heading and no NAV
// per unit anywhere, so a bare /^price/ alias read `30-Jun-26` as a price.
const HOLDING_COLUMNS = {
  security:     [/^(scheme|instrument|investment|product|security|particulars|name|description)/],
  manager:      [/^(portfolio manager|manager|amc|fund house|sponsor|scheme manager)/],
  quantity:     [/^(units?|quantity|qty|balance units)/],
  totalCost:    [/^(holding cost|cost|invested|purchase cost|amount invested|book cost)/],
  priceAsOn:    [/^(price as on|nav as on|valuation date)/],
  marketPrice:  [/^(nav(?!\s*as\s*on)|price(?!\s*as\s*on)|rate|unit price)/],
  marketValue:  [/^(net asset value|current value|market value|value|valuation|present value)/],
  unrealized:   [/^(unrealis|unrealiz|notional gain|mtm)/],
  distributedIncome: [/^(distributed income|income distributed|dividend|payout|income)/],
  // The column headed "Gain/Loss : Total *" over "Realized *". Its FIRST value
  // is the total; the realized figure is the second — see SECOND_LINE.
  totalGain:    [/^(total \*|total$|realis|realiz|booked)/],
  positionIrr:  [/^(irr|xirr|irr %)/],
  excessPerformance: [/^(excess|performance)/],
  benchmark:    [/^benchmark$/],
};

/**
 * `14,580,412.51 100.00 %` → { value, pct }.
 *
 * Only splits when the cell is exactly an amount followed by a percentage, which
 * is the shape "Value * Holding %" prints. Anything else is left alone and
 * reported as unparseable rather than cut at a guess.
 */
const VALUE_AND_PCT = /^(-?[\d,]+(?:\.\d+)?)\s+(-?[\d,]+(?:\.\d+)?)\s*%$/;

function splitValueAndPct(raw) {
  const m = VALUE_AND_PCT.exec(String(raw ?? "").trim());
  if (!m) return { value: raw, pct: null };
  return { value: m[1], pct: m[2] };
}

const TXN_COLUMNS = {
  date:        [/^(date|transaction date|txn date|trade date)/],
  description: [/^(description|particulars|narration|transaction type|type|nature)/],
  security:    [/^(scheme|instrument|investment|security|product)/],
  units:       [/^(units?|quantity|qty)/],
  amount:      [/^(amount|value|gross amount|net amount)/],
};

/**
 * The Corporate Action Statement, whose header shares NOT ONE label with the
 * transaction statement's. Its own two lines read:
 *
 *   Corporate Action | Ex-Date Or   | Bonus Or Right |         |
 *   Details / Portfolio Name | Details | Record Date  | Or Split Qty. | Amount* | Target Scheme
 *
 * Run against TXN_COLUMNS only `Amount*` matched, one field of the three
 * required, so the table was never found and six real distributions totalling
 * 8,53,660 went unread while the section reported itself empty.
 */
const CORPORATE_ACTION_COLUMNS = {
  member:      [/^(details\s*\/\s*portfolio name|portfolio name)/],
  description: [/^(corporate action|details)/],
  date:        [/^(ex-?date|record date|ex-?date or)/],
  units:       [/^(bonus or right|or split qty|split qty)/],
  amount:      [/^(amount|value|gross amount|net amount)/],
  targetScheme:[/^target scheme/],
};

const TERMINATOR = /\b(total|grand total|sub ?total)\b/i;
const warn = (warnings, code, detail) => warnings.push({ code, detail });

/**
 * Member sub-accounts, from p2's "SUMMARY BY ENGAGEMENT MODELS" / Members block.
 *
 * The statement lists them as `- <Engagement> (<MemberId>)`:
 *   CRN60117 -> "- Advisory (CRN60117LE53288)", "- Distribution (CRN60117LE51867)"
 *   CRN37702 -> "- Distribution (CRN37702LE53856)", "- Executionary (CRN37702E29000)"
 *
 * One CRN therefore spans several engagements, which is why engagement cannot be
 * a single value on the account.
 */
const MEMBER_LINE = /-\s*([A-Za-z][A-Za-z ]{2,20}?)\s*\((CRN[A-Z0-9]+)\)/gi;

function readMembers(pages, warnings) {
  const search = pagesForSection(pages, SECTION_HEADINGS["executive-summary"]);
  const scan = search.length ? search : pages;
  const found = new Map();
  for (const page of scan) {
    const text = page.rows.map((r) => r.cells.map((c) => c.text).join(" ")).join("\n");
    for (const m of text.matchAll(MEMBER_LINE)) {
      const providerEngagement = m[1].trim();
      const memberId = m[2].trim();
      if (found.has(memberId)) continue;
      const engagement = normalizeEngagement(providerEngagement);
      if (engagement === "unknown") {
        warn(warnings, "member-engagement-unrecognised",
          `${memberId} is labelled "${providerEngagement}", which maps to no known engagement`);
      }
      found.set(memberId, makeMember({
        memberId, label: `${providerEngagement} (${memberId})`, engagement, providerEngagement,
      }));
    }
  }
  if (!found.size) warn(warnings, "members-not-found", "no `- <Engagement> (CRN…)` lines matched on p2");
  return [...found.values()];
}

/**
 * The engagement carrying the most value, from p2's "SUMMARY BY ENGAGEMENT
 * MODELS" table: `<Engagement> <holding cost> <current value> <%holding>`.
 * Returns null when the block is absent — never a default.
 */
const ENGAGEMENT_ROW = /^([A-Za-z][A-Za-z ]{2,20}?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d.]+)\s*%$/;

function readEngagementWeights(pages) {
  const search = pagesForSection(pages, /SUMMARY\s+BY\s+ENGAGEMENT\s+MODELS/i);
  const best = { engagement: null, weight: -1 };
  for (const page of search) {
    for (const row of page.rows) {
      for (const cell of row.cells) {
        const m = ENGAGEMENT_ROW.exec(cell.text.replace(/\s+/g, " ").trim());
        if (!m) continue;
        const engagement = normalizeEngagement(m[1].trim());
        if (engagement === "unknown") continue;
        const weight = parseNum(m[3]) ?? 0;
        if (weight > best.weight) { best.engagement = engagement; best.weight = weight; }
      }
    }
  }
  return best.engagement;
}

/** Pages that contain a given section heading, in document order. */
function pagesForSection(pages, re) {
  return pages.filter((p) => rowsMatching(p, re).length > 0);
}

/**
 * Client name and as-of date, read off the running page header rather than the
 * flat text.
 *
 * The flat-text classifier cannot do this. Every inner page prints
 *
 *     Family Name :            Client Name :
 *     Ajay Jaisinghani (FRN…)  Mr. AJAY T JAISINGHANI (CRN37702)
 *
 * as two LINES — both labels, then both values — so a scan for "Client Name :"
 * followed by a name returns `Ajay Jaisinghani (FRN_L28405) Mr. AJAY`: the wrong
 * person's name glued to the start of the right one's. Cover page 1 is no better,
 * where the address block interleaves with "Report As On Date".
 *
 * The CRN is the anchor. The client's own name is the run of words immediately
 * BEFORE `(CRN…)` on the line that carries it, and the family name is whatever
 * precedes it, terminated by `(FRN…)`.
 */
const CRN_NAME = /([A-Za-z][A-Za-z.'\- ]{2,60}?)\s*\((CRN[A-Z0-9]+)\)/;
const FRN_NAME = /([A-Za-z][A-Za-z.'\- ]{2,60}?)\s*\(FRN[_A-Z0-9]*\)/;

function readHeaderIdentity(pages) {
  let client = null, crn = null, family = null, asOf = null;
  for (const page of pages) {
    for (const row of page.rows) {
      const line = row.cells.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
      if (!family) {
        const f = FRN_NAME.exec(line);
        if (f) family = f[1].trim();
      }
      if (!client) {
        // Cut the family name off the front first, or its trailing words are
        // read as the beginning of the client's.
        const afterFamily = family ? line.replace(new RegExp(`^.*?\\(FRN[_A-Z0-9]*\\)`), "") : line;
        const c = CRN_NAME.exec(afterFamily);
        if (c) { client = c[1].trim(); crn = c[2]; }
      }
      if (!asOf) {
        const m = /(?:Detailed Holding Statement|Performance Summary|Corpus, Income & Expense Report)\s+as\s+on\s+(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/i.exec(line)
          ?? /Report\s+As\s+On\s+Date\s+(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/i.exec(line);
        if (m) asOf = toIso(m[1]);
      }
      if (client && family && asOf) return { client, crn, family, asOf };
    }
  }
  return { client, crn, family, asOf };
}

/**
 * Group the body rows of a holding table into RECORDS.
 *
 * The bundle lays one holding out over several physical lines and splits its
 * figures across two of them, so line == record is simply false here. The rule:
 * a record STARTS at a row that carries a value in `anchorField` (Quantity — the
 * one column every real holding fills and no wrapped name or manager line ever
 * does), and each following row until the next anchor is a CONTINUATION.
 *
 * A continuation fills a field the record left empty and appends to the text
 * ones. It never OVERWRITES: the first value a column receives is the one the
 * statement printed on the record's own line, and a later line carrying a
 * benchmark name must not replace a figure already read.
 */
const TEXT_FIELDS = new Set(["security", "manager", "benchmark", "priceAsOn", "excessPerformance"]);

/**
 * `anchors` decides where a record STARTS. It is a predicate, not a
 * "is this a number" test: the holding table's anchor is Quantity (numeric) and
 * the corporate-action table's is Ex-Date (`18-May-26`), which is not a number
 * and against which a numeric anchor matched nothing at all — six events read
 * out of the PDF correctly and then discarded one line later.
 */
const isNumeric = (v) => parseNumInfo(v ?? "").status === "ok";
const isDate = (v) => !!toIso(String(v ?? "").trim());

function readRecords(rows, anchorField, anchors = isNumeric) {
  const records = [];
  for (const r of rows) {
    const anchored = anchors(r.fields[anchorField]);
    if (anchored || !records.length) {
      records.push({ y: r.y, fields: { ...r.fields }, extra: {}, cells: [...r.cells], lines: 1 });
      continue;
    }
    const rec = records[records.length - 1];
    rec.lines++;
    for (const [field, raw] of Object.entries(r.fields)) {
      const v = String(raw ?? "").trim();
      if (!v) continue;
      if (TEXT_FIELDS.has(field)) {
        const have = String(rec.fields[field] ?? "").trim();
        rec.fields[field] = have ? `${have} ${v}` : v;
      } else if (!String(rec.fields[field] ?? "").trim()) {
        rec.fields[field] = v;
      } else {
        // A SECOND value in a column the record already filled. Kept in order
        // rather than discarded: this table's header is two lines deep and a
        // column that receives two values is carrying both of its labels — see
        // SECOND_LINE below.
        (rec.extra[field] ??= []).push(v);
      }
    }
  }
  // A leading row with no anchor is layout noise, not a record.
  return records.filter((r) => anchors(r.fields[anchorField]));
}

/**
 * Columns that carry TWO labels, upper and lower, and therefore two values per
 * record — the first on the record's own line, the second on a continuation.
 *
 * Verified from the header's own coordinates (x, in points, right-aligned):
 *
 *   col @887   "Gain/Loss : Total *"  over  "Realized *"      6,751,282.51 / 0.00
 *   col @717   "Gain/Loss : Unrealized *" over "Unrealized %" 4,713,765.51 / 47.77 %
 *   col @962   "IRR"                  over  "Benchmark"       10.86 % / 11.93 %
 *
 * and confirmed by the report's own arithmetic, three ways:
 *   unrealized + distributed income + realized = total gain
 *     4,713,765.51 + 2,037,517.00 + 0.00 = 6,751,282.51
 *   unrealized / holding cost = unrealized %
 *     4,713,765.51 / 9,866,647.00 = 47.77 %
 *   IRR - benchmark IRR = excess performance
 *     10.86 % - 11.93 % = -1.07 %
 *
 * Three independent identities, all satisfied. Nothing here is inferred from
 * position alone.
 */
const SECOND_LINE = {
  unrealized: "pctGainLoss",
  totalGain: "realized",
  positionIrr: "benchmarkIrr",
};

const second = (rec, field) => rec.extra?.[field]?.[0] ?? null;

function readHoldings(pages, warnings, source) {
  const target = pagesForSection(pages, SECTION_HEADINGS["detailed-holding-statement"]);
  const search = target.length ? target : pages;
  if (!target.length) warn(warnings, "section-heading-not-found", "Detailed Holding Statement; scanned all pages");

  for (const page of search) {
    const table = findTable(page, HOLDING_COLUMNS, { minFields: 4, stopRe: TERMINATOR });
    if (!table || !("security" in table.columns)) continue;
    const { rows: rawRows } = readRows(page, table, { stopRe: TERMINATOR });
    const rows = readRecords(rawRows, "quantity");
    if (!rows.length) continue;

    const holdings = rows.map((r) => {
      const f = r.fields;
      const name = String(f.security ?? "").trim();
      const mv = splitValueAndPct(f.marketValue);
      return makeHolding({
        security: name,
        // The bundle's holdings are fund units. Anything naming itself an AIF or
        // a Category fund is AIF; the rest of this book's 360 ONE lines are
        // managed scheme units, which are Mutual Fund unless stated otherwise.
        assetClass: /\bAIF\b|category\s+(i|ii|iii)\b|alternative/i.test(name) ? "AIF" : "Mutual Fund",
        manager: f.manager ?? null,
        quantity: parseNum(f.quantity),
        totalCost: parseNum(f.totalCost),
        marketPrice: parseNum(f.marketPrice),
        marketValue: parseNum(mv.value),
        pctAssets: parseNum(mv.pct),
        distributedIncome: parseNum(f.distributedIncome),
        // Second line of the same column — the header's lower label. See
        // SECOND_LINE for the three identities that verify the assignment.
        unrealized: parseNum(f.unrealized),
        pctGainLoss: parseNum(second(r, "unrealized")),
        realized: parseNum(second(r, "totalGain")),
        positionIrrPct: parseNum(f.positionIrr),
        benchmarkIrrPct: parseNum(second(r, "positionIrr")),
        // The date the NAV was struck. It arrives with the benchmark name glued
        // to it on the continuation line, so only the leading date is kept.
        priceAsOn: (() => {
          const d = /^(\d{1,2}[-/][A-Za-z]{3,}[-/]\d{2,4})/.exec(String(f.priceAsOn ?? "").trim());
          return d ? toIso(d[1]) ?? d[1] : null;
        })(),
        // The bundle prints a Net Asset Value and NO NAV per unit. `marketValue`
        // here lands in `printed.marketValue`; deriveHolding adopts it because
        // price x quantity is not computable, and sets marketValueFromPrinted
        // itself. Setting that flag from this side would be asserting a
        // conclusion the derivation is what actually reaches.
        source,
      });
    });

    for (const r of rows) {
      for (const [field, raw] of Object.entries(r.fields)) {
        if (TEXT_FIELDS.has(field)) continue;
        const v = field === "marketValue" ? splitValueAndPct(raw).value : raw;
        if (parseNumInfo(v).status === "unparseable") {
          warn(warnings, "unparseable-cell", `${r.fields.security} · ${field} = ${JSON.stringify(raw)}`);
        }
      }
    }

    if (table.missing.length) warn(warnings, "columns-not-matched", table.missing.join(", "));
    return { holdings, sheet: toAuditSheet("detailed-holding-statement", Object.keys(table.columns), rows) };
  }
  warn(warnings, "holdings-table-not-found", "Detailed Holding Statement");
  return null;
}

function readExecutiveSummary(pages, warnings, source) {
  const target = pagesForSection(pages, SECTION_HEADINGS["executive-summary"]);
  const search = target.length ? target : pages;
  const find = (re) => {
    for (const page of search) {
      const hit = findLabelledNumber(page, re);
      if (hit) return hit.value;
    }
    return null;
  };
  // `Total Portfolio 9,866,647 14,580,413 11.70 %` — holding cost first, current
  // value second, IRR third. findLabelledNumber takes the FIRST number to the
  // right of the label, so the cost is what that call returns and the value has
  // to be read positionally from the same row. Reading them the other way round
  // reports the cost as the portfolio's value, which is wrong by the whole gain.
  const totalPortfolioRow = (() => {
    for (const page of search) {
      for (const row of page.rows) {
        const idx = row.cells.findIndex((c) => /^total\s+portfolio\b/i.test(c.text.trim()));
        if (idx < 0) continue;
        const nums = row.cells.slice(idx).flatMap((c) => {
          const t = c.text.replace(/^total\s+portfolio\b/i, " ");
          return [...t.matchAll(/-?[\d,]+(?:\.\d+)?/g)].map((m) => parseNum(m[0]));
        }).filter((n) => n !== null);
        if (nums.length >= 2) return nums;
      }
    }
    return null;
  })();

  const totals = makeTotals({
    totalMarketValue: totalPortfolioRow?.[1] ?? find(/^(portfolio value|total value|current value|net worth)/),
    totalCost: totalPortfolioRow?.[0] ?? find(/^(total cost|holding cost|invested|total investment)/),
    gainLoss: find(/^(total gain|net gain|profit)/),
    source,
  });
  // The engagement model is stated in words on p2 ("Advisory", "Distribution").
  let providerEngagement = null;
  for (const page of search) {
    for (const row of page.rows) {
      const joined = row.cells.map((c) => c.text).join(" ");
      const m = /(engagement\s*model|relationship\s*type|service\s*model)\s*[:\-]?\s*([A-Za-z /&-]{3,40})/i.exec(joined);
      if (m) { providerEngagement = m[2].trim(); break; }
    }
    if (providerEngagement) break;
  }
  const any = Object.entries(totals).some(([k, v]) => k !== "source" && v !== null);
  if (!any) warn(warnings, "executive-summary-not-read", "no labelled totals matched");
  return { totals: any ? totals : null, providerEngagement };
}

function readCorpus(pages, warnings, source) {
  const target = pagesForSection(pages, SECTION_HEADINGS["corpus-income-expense"]);
  const search = target.length ? target : [];
  if (!search.length) { warn(warnings, "section-heading-not-found", "Corpus, Income & Expense"); return null; }
  const find = (re) => {
    for (const page of search) {
      const hit = findLabelledNumber(page, re);
      if (hit) return hit.value;
    }
    return null;
  };
  // Every line on this report prints TWO figures — Financial Year Till Date and
  // Since Inception. `find` returns the first, which is the FYTD one, and that
  // is the window the rest of the book's flows use.
  //
  // `corpus:` unanchored matched the heading "Corpus, Income & Expense Report As
  // On 30 Jun 2026" and returned 2026 — a year read as a rupee figure. The
  // labels below are anchored to the report's own line labels for that reason.
  const f = makeFlows({
    corpus: find(/^total\s+corpus\b/),
    income: find(/^d\.?\s*net\s+income\b/),
    expenses: find(/^c\.?\s*expenses?\b/),
    fees: find(/^fees?$/),
    realized: find(/^a\.?\s*realized\s+gain/),
    unrealized: find(/^e\.?\s*unrealized\s+gain/),
    source,
  });
  return Object.entries(f).some(([k, v]) => k !== "source" && v !== null) ? f : null;
}

/** The bundle's own words for "this section is empty". */
const NO_DATA = /no\s+data\s+available\s+to\s+generate/i;

function readDatedRows(pages, warnings, headingRe, kind, source, columns = TXN_COLUMNS) {
  const target = pagesForSection(pages, headingRe);
  if (!target.length) return null;
  for (const page of target) {
    const headingIdx = rowsMatching(page, headingRe)[0]?.i ?? 0;
    const table = findTable(page, columns, { minFields: 3, from: headingIdx, stopRe: TERMINATOR });
    if (!table) continue;
    const { rows: rawRows } = readRows(page, table, { stopRe: TERMINATOR });
    // Each event prints over TWO lines — the member and its engagement on one,
    // the description, date and amount on the next. `date` is the anchor: it is
    // the field a grouping row ("Managed Account 853,660.0000") never carries and
    // every real event does.
    const rows = "date" in table.columns ? readRecords(rawRows, "date", isDate) : rawRows;
    const flows = rows
      .map((r) => makeCashFlow({
        date: r.fields.date ? toIso(r.fields.date) : null,
        description: [r.fields.member, r.fields.description].filter(Boolean).join(" · ") || r.fields.description || "",
        security: r.fields.security ?? r.fields.targetScheme ?? null,
        kind,
        units: parseNum(r.fields.units),
        amount: parseNum(r.fields.amount),
        source,
      }))
      .filter((f) => f.date || f.amount !== null || f.description);
    if (flows.length) {
      return { flows, sheet: toAuditSheet(kind, Object.keys(table.columns), rawRows) };
    }
  }
  // Only now, having failed to find rows, is the report's own "No data
  // available to generate …" the explanation. Checking it FIRST was wrong: the
  // 31 May bundle prints that line from its template AND then prints six
  // corporate actions underneath it, so an early return discarded 8,53,660 of
  // real distributions on the strength of a boilerplate string.
  //
  // The distinction still matters — "the provider printed nothing for this
  // period" sends a reader nowhere, "the parser could not find the table" sends
  // them hunting a bug — but it is a conclusion, not a shortcut.
  for (const page of target) {
    if (rowsMatching(page, NO_DATA).length) {
      warn(warnings, "section-reported-empty", `${kind}: the report states "No data available to generate …"`);
      return null;
    }
  }
  warn(warnings, "dated-table-not-found", kind);
  return null;
}

/**
 * Extract one 360 ONE bundle.
 * @returns {object} partial normalized document
 */
/**
 * The one document this reader handles: the client-level ANALYSIS PORTFOLIO
 * REPORT, identified by the section headings it is built from.
 *
 * 360 ONE also sends distribution letters, income-distribution notices and
 * annual statements of earnings, and five of them are in this drop. Handed to
 * this reader they produced a cascade — members-not-found, holdings-table-not-
 * found, executive-summary-not-read — which reads as a parser failing on a
 * document it should handle. It is the opposite: a document this engine has
 * never claimed to read. Saying so is the difference between a gap someone can
 * act on and a bug someone will go looking for.
 */
const IS_ANALYSIS_REPORT = /detailed\s+holding\s+statement|portfolio\s+analysis\s+report/i;

export function extract({ grid, meta }) {
  const warnings = [];
  const pages = grid.pages ?? [];
  const source = meta.docKey;
  const sections = {};

  const flat = pages.map((p) => p.text).join(" ");
  if (!IS_ANALYSIS_REPORT.test(flat)) {
    return {
      provider: PROVIDER,
      status: "failed",
      holdings: [], cashFlows: [], returns: [], members: [], sections: {},
      warnings: [{
        code: "no-reader-for-report-type",
        detail: "this engine reads 360 ONE's client-level PORTFOLIO ANALYSIS REPORT; "
          + "this document is a distribution letter or statement of earnings, for which no reader exists",
      }],
    };
  }

  const members = readMembers(pages, warnings);
  const h = readHoldings(pages, warnings, source);
  const holdings = h?.holdings ?? [];
  if (h) sections["detailed-holding-statement"] = h.sheet;

  const exec = readExecutiveSummary(pages, warnings, source);
  const corpus = readCorpus(pages, warnings, source);

  const txns = readDatedRows(pages, warnings, SECTION_HEADINGS["transaction-statement"], "transaction", source);
  const corpActions = readDatedRows(pages, warnings, SECTION_HEADINGS["corporate-action"], "corporate-action", source, CORPORATE_ACTION_COLUMNS);
  if (txns) sections["transaction-statement"] = txns.sheet;
  if (corpActions) sections["corporate-action"] = corpActions.sheet;
  const cashFlows = [...(txns?.flows ?? []), ...(corpActions?.flows ?? [])];

  // Engagement is DERIVED, never asserted and never defaulted.
  //
  // The holdings carry no memberId — the Detailed Holding Statement does not
  // print one — so weighting the members by holding value finds nothing and
  // returns "unknown" for every account with more than one member, which is both
  // of them. But p2 prints the weights directly: "SUMMARY BY ENGAGEMENT MODELS /
  // Distribution 9,866,647 14,580,413 100.0%". That block IS the provider's own
  // answer, so it is read and used, and `dominantEngagement` remains the fallback
  // for a bundle that does not carry it.
  const byModel = readEngagementWeights(pages);
  const engagement = byModel ?? dominantEngagement(members, holdings);
  if (engagement === "unknown") {
    warn(warnings, "engagement-unknown",
      "no member engagement could be determined; recorded as unknown rather than assumed");
  }
  const memberWording = members.map((m) => m.providerEngagement).filter(Boolean).join(" / ");
  const pe = exec.providerEngagement ?? (memberWording || null);

  const id = readHeaderIdentity(pages);
  if (!id.client) warn(warnings, "client-name-not-read", "no `<name> (CRN…)` on any page header");
  if (!id.asOf) warn(warnings, "as-of-not-read", "no `… as on <date>` heading found");

  const gotSomething = holdings.length || exec.totals || corpus || cashFlows.length;
  return {
    provider: PROVIDER,
    engagement,
    providerEngagement: pe,
    members,
    owner: id.client ?? null,
    accountNo: id.crn ? id.crn.replace(/^CRN/i, "") : null,
    asOf: id.asOf ?? null,
    familyGroup: id.family ?? meta.familyGroup ?? null,
    holdings,
    totals: exec.totals,
    flows: corpus,
    cashFlows,
    returns: [],
    sections,
    warnings,
    status: !gotSomething ? "failed" : warnings.length ? "partial" : "ok",
  };
}
