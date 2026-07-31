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
  "corporate-benefits", "capital-call", "distribution-notice", "contract-note", "unknown",
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
  if ((m = s.match(/^(\d{1,2})[\s-]*([A-Za-z]{3,})[\s-]*,?[\s-]*(\d{4})$/))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return mo ? `${m[3]}-${pad(mo)}-${pad(m[1])}` : null;
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
  const hit = /360\s*ONE/i.test(text) || /PORTFOLIO\s+ANALYSIS\s+REPORT/i.test(text) || /\b360one\b/i.test(name);
  if (!hit) return null;
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
const PMS_FILE = /^[A-Z]{1,4}\d+_\d+_/i;

function matchGoldstandard(text, name) {
  const byText = /GOLDSTANDARD\s+WEALTH/i.test(text) || /GREEN\s+LANTERN\s+CAPITAL/i.test(text)
    || /CARNELIAN\s+ASSET\s+MANAGEMENT/i.test(text) || /Aristos\s+Equity\s+Portfolio/i.test(text);
  const byName = PMS_FILE.test(name);
  if (!byText && !byName) return null;

  // `Account : 12345  Some Owner Name`
  const provider = /GREEN\s+LANTERN\s+CAPITAL/i.test(text) ? "Green Lantern Capital LLP"
    : /CARNELIAN\s+ASSET\s+MANAGEMENT/i.test(text) ? "Carnelian Asset Management and Advisors Pvt Ltd"
    : /GOLDSTANDARD\s+WEALTH/i.test(text) || /Aristos/i.test(text) ? "Goldstandard Wealth Private Limited"
    : /^GLC/i.test(name) ? "Green Lantern Capital LLP"
    : /^CBP/i.test(name) ? "Carnelian Asset Management and Advisors Pvt Ltd"
    : /^G\d/i.test(name) ? "Goldstandard Wealth Private Limited"
    : null;
  const strategy = /Aristos\s+Equity\s+Portfolio/i.test(text) ? "Aristos Equity Portfolio"
    : /GLC\s+GROWTH\s+FUND/i.test(text) ? "GLC Growth Fund"
    : /CARNELIAN\s+BESPOKE\s+PORTFOLIO/i.test(text) ? "Carnelian Bespoke Portfolio"
    : null;
  const acct = text.match(/Account\s*[:#-]\s*([A-Z0-9-]{2,20})\s+([A-Za-z][A-Za-z.&'\- ]{2,80})/i);
  let accountNo = acct ? acct[1] : null;
  // The strategy name sits right after the owner on the same header line, so its
  // leading token has to stop the name or it reads as part of it.
  let ownerName = acct ? trimPersonName(acct[2], strategy ? [strategy.split(" ")[0]] : []) : null;
  // The filename repeats the account number twice; trust it when the text didn't parse.
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
    const g = genericReportType(text);
    if (g) { reportType = g; matchedBy = "Goldstandard signature + content keywords"; }
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

const GENERIC_PROVIDER_RULES = [
  [/360\s*ONE/i, "360 ONE Private Wealth"],
  [/GOLDSTANDARD\s+WEALTH/i, "Goldstandard Wealth Private Limited"],
  [/GREEN\s+LANTERN\s+CAPITAL/i, "Green Lantern Capital LLP"],
  [/CARNELIAN\s+ASSET\s+MANAGEMENT/i, "Carnelian Asset Management and Advisors Pvt Ltd"],
  [/\bKotak\s+(?:Mahindra\s+)?(?:Bank|Securities|Investment)/i, "Kotak"],
  [/\bICICI\s+(?:Securities|Prudential|Bank)/i, "ICICI"],
  [/\bHDFC\s+(?:Securities|Bank|AMC)/i, "HDFC"],
  [/\bAxis\s+(?:Securities|Bank|AMC)/i, "Axis"],
  [/\bMotilal\s+Oswal/i, "Motilal Oswal"],
  [/\bNuvama\b/i, "Nuvama"],
  [/\bJulius\s+Baer/i, "Julius Baer"],
  [/\bEdelweiss\b/i, "Edelweiss"],
  [/\bAvendus\b/i, "Avendus"],
  [/\bCAMS\b|Computer\s+Age\s+Management/i, "CAMS"],
  [/\bKFin(?:tech)?\b|Karvy/i, "KFintech"],
];

function genericProvider(text) {
  for (const [re, name] of GENERIC_PROVIDER_RULES) if (re.test(text)) return name;
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
