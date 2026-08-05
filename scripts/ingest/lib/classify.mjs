// Best-effort classification of one statement PDF.
//
// Everything here is a GUESS and is labelled as one. The inventory's job is to
// make the shape of the drop visible — which provider, which account, which
// date, which kind of report — so a human can decide what is authoritative
// before any figure is extracted. A field this cannot determine comes back
// null, and a file it cannot place lands in the inventory's "could not
// classify" section rather than being filed under a plausible guess.
//
// Two provider signatures are seeded from real documents; the generic
// keyword pass catches the rest.

export const REPORT_TYPES = [
  "holdings", "appraisal", "fact-sheet", "performance-summary", "performance-history",
  "performance-benchmark", "transaction-statement", "corporate-action", "capital-gain",
  "capital-register", "dividend-statement", "bank-book", "expense-statement",
  "corporate-benefits", "capital-call", "distribution-notice", "contract-note",
  // The SEBI-prescribed PMS INVESTOR REPORT: account overview, portfolio
  // summary, capital contributions since inception, the period's trades and a
  // holding report, all in one statement. SVAN issues it monthly and Green
  // Lantern quarterly, in the same regulator-mandated shape.
  "investor-report",
  // A DEPOSITORY movement statement — CDSL's own record of shares entering and
  // leaving a demat account. Deliberately not "transaction-statement", which it
  // is titled: a demat debit can be a pledge, a remat or an off-market transfer
  // with no trade behind it, and the statement prints no price for any of them.
  "demat-statement",
  // A fund's own holdings, published under SEBI's disclosure rules. Carries no
  // client and no units — archived for look-through, worth nothing to the book.
  "scheme-portfolio",
  // A Category-II AIF's pass-through income for one folio, split by TAX HEAD.
  // The only place in this drop that says which rate the family's AIF income
  // attracts, which is not a detail a "distribution-notice" would carry.
  "statement-of-earnings",
  "unknown",
];

// ── Date parsing ─────────────────────────────────────────────────────────────
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n) => String(n).padStart(2, "0");

/**
 * Normalise a printed date to ISO. Indian statements are day-first throughout,
 * so `03/04/2026` is 3 April — never 4 March. Anything ambiguous enough to need
 * the other reading would be a different provider and a different rule.
 */
export function toIso(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return s;
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/))) {
    const [, d, mo, yy] = m;
    // The capital gain statement prints two-digit years (`07/05/26`) while every
    // other report prints four. Two digits are read as 20xx: these are 2025-26
    // statements of a book whose earliest inception is 2025, and no row in the
    // drop predates 2000. A wider rule would need a pivot year, and a pivot year
    // guessed here would silently move a trade by a century.
    const y = yy.length === 2 ? `20${yy}` : yy;
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
    return null;
  }
  // `30 Jun 2026` and `30-Jun-26`. The two-digit year reads as 20xx on the same
  // rule as the numeric form above: 360 ONE's holding statement prints its
  // "Price As on" and its corporate-action dates this way, and no row in the
  // drop predates 2000.
  if ((m = s.match(/^(\d{1,2})[\s-]*([A-Za-z]{3,})[\s-]*,?[\s-]*(\d{2}|\d{4})$/))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return mo ? `${y}-${pad(mo)}-${pad(m[1])}` : null;
  }
  if ((m = s.match(/^([A-Za-z]{3,})[\s-]+(\d{1,2}),?[\s-]+(\d{4})$/))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return mo ? `${m[3]}-${pad(mo)}-${pad(m[2])}` : null;
  }
  return null;
}

const DATE_PATTERN = String.raw`(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\s-]*[A-Za-z]{3,}[\s-]*,?[\s-]*\d{4}|[A-Za-z]{3,}[\s-]+\d{1,2},?[\s-]+\d{4})`;

/** First date appearing after `label` in the (scrambled) text. */
function dateAfter(text, label) {
  const re = new RegExp(label + String.raw`\s*[:\-]?\s*` + DATE_PATTERN, "i");
  const m = text.match(re);
  return m ? toIso(m[1]) : null;
}

/**
 * Cut a person/entity name out of scrambled text.
 *
 * The text has no line breaks, so a greedy capture after "Client Name :" runs
 * straight on into the next label — `<first> <last> Report As On Date`. The
 * name is therefore taken as a short run of words and cut at the first token
 * that starts a known label, plus any caller-supplied stop word (the detected
 * strategy name, whose first token otherwise reads as part of the owner).
 */
const NAME_STOPS = new Set([
  "report", "date", "as", "on", "of", "at", "account", "statement", "portfolio",
  "client", "family", "name", "scheme", "strategy", "equity", "fund", "current",
  "valuation", "period", "folio", "crn", "no", "number", "code", "summary",
  "holding", "holdings", "appraisal", "performance", "transaction", "total", "page",
]);

export function trimPersonName(raw, extraStops = []) {
  if (!raw) return null;
  const stops = new Set([...NAME_STOPS, ...extraStops.map((w) => w.toLowerCase())]);
  const words = String(raw).trim().split(/\s+/);
  const out = [];
  for (const w of words) {
    const bare = w.replace(/[^A-Za-z]/g, "").toLowerCase();
    if (!bare || stops.has(bare)) break;
    out.push(w);
    if (out.length === 5) break;      // no real name runs longer than this here
  }
  const name = out.join(" ").replace(/[,;:.]+$/, "").trim();
  return name.length >= 2 ? name : null;
}

/** First capture group after `label`, trimmed and length-capped. */
function fieldAfter(text, label, pattern = String.raw`([^:|]{2,80}?)`) {
  const re = new RegExp(label + String.raw`\s*[:\-]?\s*` + pattern + String.raw`(?=\s{2,}|\s*[A-Z][a-z]+\s*(?:Name|Date|No|Number)|$)`, "i");
  const m = text.match(re);
  return m ? m[1].trim().replace(/\s+/g, " ") || null : null;
}

// ── Provider signatures ──────────────────────────────────────────────────────

/**
 * 360 ONE PRIVATE WEALTH — "PORTFOLIO ANALYSIS REPORT - CLIENT LEVEL", ~11pp.
 * Header carries Family Name, Client Name (CRN…), Report As On Date. The file is
 * a BUNDLE: executive summary, a detailed holding statement, a transaction
 * statement and a corporate-action statement all in one PDF. It gets one primary
 * reportType for grouping and a `sections` list so the overlap stays visible.
 * Holdings are AIF/PMS units — no ISIN, no ticker.
 */
function match360One(text, name) {
  /**
   * THE LETTERHEAD, NOT THE WHOLE DOCUMENT.
   *
   * `360 ONE` also appears as a HOLDING — `360 One WAM Limited` is a listed
   * company, and WhiteOak's multi-asset fund holds ₹10.16 Cr of it. Matching the
   * whole text filed that scheme's monthly portfolio disclosure, a document with
   * no client and no position in it, under 360 ONE Private Wealth and handed it
   * to a reader written for a client-level portfolio analysis report.
   *
   * Exactly the trap ISSUER_PROVIDER_RULES / HOUSE_PROVIDER_RULES were split to
   * avoid further down this file; this seeded matcher runs BEFORE that split and
   * had never been given the same discipline. The report title stays matched on
   * the whole text, because it is a title and appears once.
   */
  const head = text.slice(0, LETTERHEAD_CHARS);
  const hit = /360\s*ONE/i.test(head) || /PORTFOLIO\s+ANALYSIS\s+REPORT/i.test(text) || /\b360one\b/i.test(name);
  if (!hit) return null;
  // The group's ALTERNATES arm publishes per-folio AIF correspondence — a
  // distribution letter, a statement of earnings — which is a different document
  // family from the wealth arm's client-level report and has its own reader.
  // Claiming it here sent five statements to a reader that could only say it had
  // none for them.
  if (/360\s*ONE\s+ALTERNATES/i.test(text) && !/PORTFOLIO\s+ANALYSIS\s+REPORT/i.test(text)) return null;
  const crn = text.match(/CRN[\s:#-]*([A-Z0-9-]{4,20})/i);
  const client = trimPersonName(fieldAfter(text, "Client\\s*Name(?:\\s*\\(CRN[^)]*\\))?"));
  const family = trimPersonName(fieldAfter(text, "Family\\s*Name"));
  const asOf = dateAfter(text, "Report\\s*As\\s*On\\s*Date") || dateAfter(text, "As\\s*on\\s*Date") || dateAfter(text, "Report\\s*Date");

  const sections = [];
  if (/Detailed\s+Holding\s+Statement/i.test(text)) sections.push("holdings");
  if (/Transaction\s+Statement/i.test(text)) sections.push("transaction-statement");
  if (/Corporate\s+Action\s+Statement/i.test(text)) sections.push("corporate-action");
  if (/Executive\s+Summary/i.test(text)) sections.push("performance-summary");

  return {
    provider: "360 ONE Private Wealth",
    ownerName: client || family || null,
    // The wider family grouping the provider files the account under. Kept
    // distinct from the owner: several accounts share one Family Name.
    familyGroup: family || null,
    accountNo: crn ? crn[1] : null,
    asOfDate: asOf,
    // The holding statement is the authoritative section for the book; the rest
    // ride along in the same file.
    reportType: sections.includes("holdings") ? "holdings"
      : sections.includes("transaction-statement") ? "transaction-statement"
      : "unknown",
    sections,
    strategy: null,
    confidence: asOf && (client || family) ? "high" : "medium",
    matchedBy: "360 ONE signature",
  };
}

/**
 * GOLDSTANDARD WEALTH PRIVATE LIMITED — PMS, "Aristos Equity Portfolio".
 * Header: `Account : <no>  <owner name>`, plus `Report Date` or `As of <date>`.
 * Filenames look like `G<acct>_<acct>_<ReportType><n>OT_<n>.pdf`, and the file
 * name is the more reliable of the two signals for report type because the
 * on-page title is part of the scrambled text.
 * Listed Indian equity, name only — NO ISIN.
 */
const GOLDSTANDARD_FILE_TYPES = [
  [/currentportfolio/i, "holdings"],
  [/portfoliopositionmain/i, "holdings"],
  [/portfolioappraisal/i, "appraisal"],
  [/portfoliofactsheet/i, "fact-sheet"],
  [/portfolioperfsummary/i, "performance-summary"],
  [/portfolioperfhistory/i, "performance-history"],
  [/portfolioperfbm/i, "performance-benchmark"],
  [/transactionstatement/i, "transaction-statement"],
  [/capitalgain/i, "capital-gain"],
  [/capitalregister/i, "capital-register"],
  [/dividendstatement/i, "dividend-statement"],
  [/bankbook/i, "bank-book"],
  [/expensestmt/i, "expense-statement"],
  [/corporatebenefits/i, "corporate-benefits"],
];

/**
 * The shared PMS reporting system.
 *
 * Goldstandard (Aristos), Green Lantern and Carnelian all issue from it, with
 * identical filenames `<code>_<account>_<ReportType><n>OT (n).pdf`. That pattern
 * is the gate; the manager is then read from the letterhead, falling back to the
 * account-code prefix because the appraisal carries no letterhead.
 */
const PMS_FILE = /^[A-Z]{1,8}\d+_\d+_/i;

function matchGoldstandard(text, name) {
  const byText = /GOLDSTANDARD\s+WEALTH/i.test(text) || /GREEN\s+LANTERN\s+CAPITAL/i.test(text)
    || /CARNELIAN\s+ASSET\s+MANAGEMENT/i.test(text) || /Aristos\s+Equity\s+Portfolio/i.test(text)
    || /V\.?\s*E\.?\s*C\s+ASSAGO/i.test(text)
    || /MOLECULE\s+VENTURES/i.test(text);
  const byName = PMS_FILE.test(name);
  if (!byText && !byName) return null;

  // `Account : 12345  Some Owner Name`
  const provider = /GREEN\s+LANTERN\s+CAPITAL/i.test(text) ? "Green Lantern Capital LLP"
    : /CARNELIAN\s+ASSET\s+MANAGEMENT/i.test(text) ? "Carnelian Asset Management and Advisors Pvt Ltd"
    : /GOLDSTANDARD\s+WEALTH/i.test(text) || /Aristos/i.test(text) ? "Goldstandard Wealth Private Limited"
    : /V\.?\s*E\.?\s*C\s+ASSAGO/i.test(text) ? "V.E.C Assago Capital Management LLP"
    : /MOLECULE\s+VENTURES/i.test(text) ? "Molecule Ventures LLP"
    : /^GLC/i.test(name) ? "Green Lantern Capital LLP"
    : /^CBP/i.test(name) ? "Carnelian Asset Management and Advisors Pvt Ltd"
    : /^VEC/i.test(name) ? "V.E.C Assago Capital Management LLP"
    : /^G\d/i.test(name) ? "Goldstandard Wealth Private Limited"
    : null;
  const strategy = /Aristos\s+Equity\s+Portfolio/i.test(text) ? "Aristos Equity Portfolio"
    : /GLC\s+GROWTH\s+FUND/i.test(text) ? "GLC Growth Fund"
    : /CARNELIAN\s+BESPOKE\s+PORTFOLIO/i.test(text) ? "Carnelian Bespoke Portfolio"
    : /V\.?\s*E\.?\s*C\s+ASSAGO\s+Small\s+and\s+Mid-?Cap\s+Growth/i.test(text) ? "V.E.C ASSAGO Small and Mid-Cap Growth"
    : null;
  const acct = text.match(/Account\s*[:#-]\s*([A-Z0-9-]{2,20})\s+([A-Za-z][A-Za-z.&'\- ]{2,80})/i);
  let accountNo = acct ? acct[1] : null;
  // The strategy name sits right after the owner on the same header line, so its
  // leading token has to stop the name or it reads as part of it.
  let ownerName = acct ? trimPersonName(acct[2], strategy ? [strategy.split(" ")[0]] : []) : null;
  // Goldstandard ONLY: its filename repeats the account number twice
  // (`G100023_100024_…` on account 100024), so the second field is the account
  // and is trusted when the text didn't parse. This does NOT generalise — V.E.C
  // files `VECBES0004_145052_…` on account 128005, where the second field is the
  // client code, and reading it as the account filed the fact sheet under an
  // account number that appears on no statement.
  if (!accountNo) {
    const fn = name.match(/^G(\d+)_(\d+)_/i);
    if (fn) accountNo = fn[2];
  }

  const asOf = dateAfter(text, "Report\\s*Date") || dateAfter(text, "As\\s*of") || dateAfter(text, "As\\s*on");

  let reportType = "unknown";
  let matchedBy = "Goldstandard signature";
  for (const [re, type] of GOLDSTANDARD_FILE_TYPES) {
    if (re.test(name.replace(/[^A-Za-z]/g, ""))) { reportType = type; matchedBy = "Goldstandard filename"; break; }
  }
  if (reportType === "unknown") {
    // Molecule's file is named `Molecule_June_2026_392.pdf` — nothing in it maps
    // to a report type. Its CONTENT is unmistakable: a fact sheet's own
    // "Portfolio Holdings" table beside a "Sector Allocation" one.
    if (/Portfolio\s+Holdings/i.test(text) && /Sector\s+Allocation/i.test(text)) {
      reportType = "fact-sheet";
      matchedBy = "fact-sheet content (Portfolio Holdings + Sector Allocation)";
    } else {
      const g = genericReportType(text);
      if (g) { reportType = g; matchedBy = "Goldstandard signature + content keywords"; }
    }
  }

  return {
    provider,
    ownerName,
    accountNo,
    asOfDate: asOf,
    reportType,
    sections: reportType === "unknown" ? [] : [reportType],
    familyGroup: null,
    strategy,
    confidence: accountNo && asOf && reportType !== "unknown" ? "high" : "medium",
    matchedBy,
  };
}

// ── Generic content keywords, most specific first ────────────────────────────
const GENERIC_TYPE_RULES = [
  // A TITLE, and it comes first for a reason. This report's own footnote reads
  // "Net Rate includes brokerage, stamp duty, tax and any charge customarily
  // included in the contract note of broker, STT etc." — so the contract-note
  // keyword below matched all four SVAN statements and the fifteen-page Green
  // Lantern bundle, filing a SEBI investor report as a report type this repo has
  // no reader for. A phrase inside a footnote is not what a document is.
  [/PMS\s+INVESTOR\s+REPORT/i, "investor-report"],
  // ── A fund's OWN portfolio, not a client's. Matched first because the row of
  // holdings inside it will match almost any content keyword below.
  [/Portfolio\s+Statement\s+as\s+on|Monthly\s+Portfolio\s+(?:Statement|Disclosure)/i, "scheme-portfolio"],
  // A mutual-fund FOLIO statement — units, NAV and a value per scheme, which is
  // a holdings statement whatever the AMC titles it. Matched on the phrase every
  // one of them prints beside the folio number, so the looser `holding
  // statement` keyword below cannot claim a PMS report by mistake.
  [/Market Value of Balance Units at NAV|Your Account At A Glance|PORTFOLIO SUMMARY[\s\S]{0,200}?Unit Balance/i, "holdings"],
  // ── AIF pass-through correspondence, per folio.
  [/STATEMENT\s+OF\s+EARNINGS/i, "statement-of-earnings"],
  [/INCOME\s+DISTRIBUTION\s+LETTER/i, "distribution-notice"],
  // ── The broker/depository set, all four titled unambiguously. These come
  // before the looser keyword rules below because three of them contain a phrase
  // one of those rules matches: the CDSL statement is headed TRANSACTION
  // STATEMENT and is not a trade record at all, the depository statement is a
  // holding statement, and the P&L is a capital gain statement that says neither.
  [/DEPOSITORY\s+HOLDING\s+STATEMENT/i, "holdings"],
  [/STATEMENT\s+OF\s+ACCOUNT\s+FOR\s+THE\s+PERIOD/i, "demat-statement"],
  [/Annual\s*P\s*&?(?:amp;)?\s*L/i, "capital-gain"],
  [/Global\s+Details\s+Report/i, "transaction-statement"],
  [/capital\s+call|drawdown\s+notice|call\s+notice/i, "capital-call"],
  [/distribution\s+notice|redemption\s+(?:notice|advice)|payout\s+advice/i, "distribution-notice"],
  [/contract\s+note/i, "contract-note"],
  [/corporate\s+action/i, "corporate-action"],
  [/transaction\s+(?:statement|summary|report)|statement\s+of\s+transactions/i, "transaction-statement"],
  [/fact\s*sheet/i, "fact-sheet"],
  [/portfolio\s+appraisal|appraisal\s+report/i, "appraisal"],
  [/performance\s+history|historical\s+performance/i, "performance-history"],
  [/performance\s+summary|returns?\s+summary/i, "performance-summary"],
  [/holding\s+statement|statement\s+of\s+holdings?|current\s+portfolio|portfolio\s+holdings?|detailed\s+holding/i, "holdings"],
];

function genericReportType(text) {
  for (const [re, type] of GENERIC_TYPE_RULES) if (re.test(text)) return type;
  return null;
}

/**
 * ISSUERS come first and are matched on the WHOLE text, because these are the
 * names that appear on a letterhead and nowhere else.
 *
 * The order matters and so does the split below: a manager's own name is not
 * the only place a financial institution's name appears in its statement. SVAN's
 * monthly report HOLDS `Edelweiss Financial Services Ltd`, Sanshi Fund prints
 * the investor's HDFC bank details, Transition Venture prints an HDFC IFSC code
 * — and matching those against the whole document filed four different managers'
 * statements under the wrong house. Every one of them looked like a confident
 * classification.
 */
const ISSUER_PROVIDER_RULES = [
  // The ALTERNATES arm comes first and must: it signs its letters "360 ONE
  // ALTERNATES ASSET MANAGEMENT LIMITED", which the broader `360 ONE` rule below
  // also matches. Two arms of one group, two document families, two readers.
  [/360\s*ONE\s+ALTERNATES/i, "360 ONE Alternates Asset Management"],
  // The WEALTH arm, named as it names itself. A bare `360 ONE` also matches
  // `360 One WAM Limited`, which is a LISTED COMPANY — WhiteOak's multi-asset
  // fund holds Rs 10.16 Cr of it, and that one row filed the fund's own scheme
  // disclosure under this provider and sent it to a client-report reader.
  [/360\s*ONE\s+(?:PRIVATE\s+)?WEALTH|360\s*ONE\s+DISTRIBUTION|PORTFOLIO\s+ANALYSIS\s+REPORT/i, "360 ONE Private Wealth"],
  [/GOLDSTANDARD\s+WEALTH/i, "Goldstandard Wealth Private Limited"],
  [/GREEN\s+LANTERN\s+CAPITAL/i, "Green Lantern Capital LLP"],
  [/CARNELIAN\s+ASSET\s+MANAGEMENT/i, "Carnelian Asset Management and Advisors Pvt Ltd"],
  [/V\.?\s*E\.?\s*C\s+ASSAGO/i, "V.E.C Assago Capital Management LLP"],
  [/SVAN\s+INVESTMENT\s+MANAGERS/i, "SVAN Investment Managers LLP"],
  [/MOLECULE\s+VENTURES/i, "Molecule Ventures LLP"],
  [/SANSHI\s+FUND/i, "Sanshi Fund"],
  [/TRANSITION\s+VENTURE\s+CAPITAL/i, "Transition Venture Capital"],
  [/LKP\s+SEC|lkpsec\.com/i, "LKP Securities"],
  // Mutual-fund account statements. Matched on the AMC's FULL registered name,
  // which appears only on its own statement — never as a holding, where the
  // house shows up as a listed share ("HDFC Bank Ltd", "Kotak Mahindra Bank
  // Ltd"). That distinction is why these belong here and the bare bank names
  // stay in HOUSE_PROVIDER_RULES below.
  [/Aditya\s+Birla\s+Sun\s+Life\s+(?:Mutual\s+Fund|AMC)/i, "Aditya Birla Sun Life Mutual Fund"],
  [/Kotak\s+Mahindra\s+Mutual\s+Fund|Kotak\s+Mutual\s+Fund/i, "Kotak Mahindra Mutual Fund"],
  [/Mirae\s+Asset\s+(?:Mutual\s+Fund|Investment|Asset\s+Management|MF)/i, "Mirae Asset Mutual Fund"],
  [/HDFC\s+Mutual\s+Fund|HDFC\s+Asset\s+Management/i, "HDFC Mutual Fund"],
  [/WhiteOak\s+Capital|White\s*Oak\s+Capital/i, "Scheme portfolio disclosure"],
  [/\bMotilal\s+Oswal/i, "Motilal Oswal"],
  [/\bJulius\s+Baer/i, "Julius Baer"],
  [/\bAvendus\b/i, "Avendus"],
  [/\bCAMS\b|Computer\s+Age\s+Management/i, "CAMS"],
  [/\bKFin(?:tech)?\b|Karvy/i, "KFintech"],
];

/**
 * CUSTODIAN / BANK / AMC names, matched only against the HEAD of the document —
 * the letterhead region. These names also occur in a holdings table, a bank
 * details block and an IFSC code, where they say nothing about who issued the
 * statement.
 */
const HOUSE_PROVIDER_RULES = [
  [/\bKotak\s+(?:Mahindra\s+)?(?:Bank|Securities|Investment|MF|Mutual)/i, "Kotak"],
  [/\bICICI\s+(?:Securities|Prudential|Bank)/i, "ICICI"],
  [/\bHDFC\s+(?:Securities|Bank|AMC|Mutual)/i, "HDFC"],
  [/\bAditya\s+Birla\s+Sun\s+Life|\bABSL\b/i, "Aditya Birla Sun Life"],
  [/\bMirae\s+Asset/i, "Mirae Asset"],
  [/\bAxis\s+(?:Securities|Bank|AMC|Mutual)/i, "Axis"],
  [/\bNuvama\b/i, "Nuvama"],
  [/\bEdelweiss\b/i, "Edelweiss"],
];

/** How much of the text counts as "the letterhead" for the house rules. */
const LETTERHEAD_CHARS = 700;

function genericProvider(text) {
  for (const [re, name] of ISSUER_PROVIDER_RULES) if (re.test(text)) return name;
  const head = text.slice(0, LETTERHEAD_CHARS);
  for (const [re, name] of HOUSE_PROVIDER_RULES) if (re.test(head)) return name;
  return null;
}

/** Any labelled as-of-ish date, in order of how authoritative the label is. */
function genericAsOf(text) {
  const labels = [
    "Report\\s*As\\s*On\\s*Date", "Report\\s*Date", "As\\s*on\\s*Date", "As\\s*of\\s*Date",
    "As\\s*on", "As\\s*of", "Statement\\s*Date", "Valuation\\s*Date", "Period\\s*Ended?", "As\\s*at",
  ];
  for (const l of labels) {
    const d = dateAfter(text, l);
    if (d) return d;
  }
  return null;
}

/** A date encoded in the filename, e.g. `..._2026-06-30.pdf` or `..._30062026.pdf`. */
function dateFromName(name) {
  let m = name.match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  m = name.match(/(\d{2})[-_.]?(\d{2})[-_.]?(20\d{2})/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

/**
 * Classify one PDF from its filename and extracted text.
 * Returns { provider, ownerName, accountNo, asOfDate, reportType, sections,
 *           strategy, confidence, matchedBy } — any field may be null.
 */
export function classify({ fileName, text }) {
  const name = fileName || "";
  const t = text || "";

  const seeded = match360One(t, name) || matchGoldstandard(t, name);
  if (seeded) return seeded;

  const provider = genericProvider(t);
  const reportType = genericReportType(t) || genericReportType(name.replace(/[_-]/g, " "));
  const asOfDate = genericAsOf(t) || dateFromName(name);
  const accountNo = (t.match(/(?:Account|Folio|Client\s*Code|A\/c)\s*(?:No\.?|Number|#)?\s*[:#-]\s*([A-Z0-9][A-Z0-9\/-]{3,20})/i) || [])[1] || null;
  const ownerName = trimPersonName(fieldAfter(t, "(?:Client|Investor|Holder|Account)\\s*Name"))
    || trimPersonName(fieldAfter(t, "Family\\s*Name"));

  // Confidence is about how much of the row we could establish, and it is what
  // decides whether a file lands in the main tables or the "could not classify"
  // section of the report.
  const known = [provider, accountNo, asOfDate, reportType && reportType !== "unknown"].filter(Boolean).length;
  const confidence = known >= 3 ? "high" : known === 2 ? "medium" : "low";

  return {
    provider: provider || null,
    ownerName: ownerName || null,
    accountNo,
    asOfDate,
    reportType: reportType || "unknown",
    sections: reportType && reportType !== "unknown" ? [reportType] : [],
    familyGroup: null,
    strategy: null,
    confidence,
    matchedBy: provider || reportType ? "generic keywords" : "nothing matched",
  };
}
