// One contract for the Research capture, edge proxy, saved fallback and browser.
// Source text stays beside parsed terms. An unparsed term is never a zero.
export const RESEARCH_ACTIONS_URL = "https://glow-central-research.tech-441.workers.dev/data/corporate-actions.json";
export const isoDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v ? v : null;
const number = (v) => {
  const s = String(v ?? "").trim().replace(/,/g, "");
  return /^\d+(?:\.\d+)?$/.test(s) && Number.isFinite(Number(s)) ? Number(s) : null;
};
const safeUrl = (v) => {
  try { const u = new URL(v); return u.protocol === "https:" && /(^|\.)(nseindia\.com|screener\.in)$/.test(u.hostname) ? u.href : null; }
  catch { return null; }
};
const ratio = (text) => {
  const m = String(text ?? "").match(/^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/);
  return m && Number(m[1]) > 0 && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
};

export function parseAction(row) {
  let type = String(row.actionType || "other");
  const purpose = String(row.purpose || "");
  const s = row.screener;
  let factor = null, cashPerShare = null, issue = null;
  const official = row.source === "NSE" || row.sources?.includes("NSE");
  // A real collision in Research: RECLTD is REC on NSE but Recode on BSE.
  // Screener's numeric company key must not be treated as an NSE ticker.
  if (!official && (!s || s.companyKey !== row.ticker)) issue = "Source identity needs verification";
  if (!isoDay(row.exDate)) issue = "No valid ex-date";
  if (row.series && row.series !== "EQ" && row.series !== "BE" && row.series !== "SM") issue = "Not an ordinary equity series";
  if (type === "dividend" && /bonus|split|sub.?division|arrangement|demerger|rights|buy.?back|redemption|capital.?reduction/i.test(purpose)) {
    type = "other"; issue = "Combined cash/share action needs statement reconciliation";
  }
  if (type === "bonus") {
    // Preference-share bonuses, NCRPS and arrangements are NOT extra equity.
    if (/ncrps|preference|debenture|arrangement|warrant/i.test(purpose)) issue = "Non-equity bonus needs statement reconciliation";
    const match = purpose.match(/^bonus(?:\s+issue)?\s*[-·:]?\s*(\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?)\s*$/i);
    const a = match ? ratio(match[1]) : null;
    const b = ratio(s?.ratio);
    if (a !== null && b !== null && Math.abs(a - b) > 1e-8) issue = "Conflicting bonus ratios";
    const r = official ? a : b;
    if (r !== null) factor = 1 + r;
    else issue ||= "Bonus ratio needs verification";
  } else if (type === "split") {
    const old = number(s?.oldFaceValue), next = number(s?.newFaceValue);
    const m = purpose.match(/(?:from|face\s*value)\s*(?:rs\.?|re\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(?:\/-)?(?:\s*per\s*share)?\s*(?:to|→)\s*(?:rs\.?|re\.?|₹)?\s*(\d+(?:\.\d+)?)/i);
    const a = m && Number(m[1]) > 0 && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
    const b = old && next ? old / next : null;
    if (a !== null && b !== null && Math.abs(a - b) > 1e-8) issue = "Conflicting split ratios";
    factor = a ?? b;
    if (factor === null || factor <= 1) issue ||= "Split ratio needs verification";
  } else if (type === "dividend") {
    // Only one explicit rupee-per-share term is accepted; a percentage without
    // the event's own face value, or interim + special amounts, is ambiguous.
    const matches = [...purpose.matchAll(/(?:Rs\.?|Re\.?|₹)\s*(\d[\d,]*(?:\.\d+)?)\s*(?:\/-)?\s*per\s*share/gi)];
    if (official && matches.length === 1 && !/\+|and\s+(?:special|interim|final|dividend)|cum\s|including/i.test(purpose)) cashPerShare = number(matches[0][1]);
    if (cashPerShare === null) issue ||= "Rupees per share need verification";
  } else issue ||= "This action needs statement reconciliation";
  if (issue) { factor = null; cashPerShare = null; }
  return {
    id: String(row.id), ticker: String(row.ticker || "").toUpperCase(), isin: row.isin || null,
    company: String(row.company), type, exDate: isoDay(row.exDate), recordDate: isoDay(row.recordDate),
    purpose, source: String(row.source || "Glow Central Research"), sourceUrl: safeUrl(row.sourceUrl),
    factor, cashPerShare, issue,
  };
}

export function normalizeActionFeed(raw, symbols = null, isins = []) {
  if (raw?.version !== 1 || !Array.isArray(raw.rows) || !raw.rows.length || raw.rowCount !== raw.rows.length
    || !Number.isFinite(Date.parse(raw.capturedAt)) || !isoDay(raw.requestedFrom) || !isoDay(raw.requestedTo)
    || raw.rows.some((r) => !r?.id || !r.company || !r.purpose)) throw new Error("Invalid Research corporate-action capture");
  const selected = symbols ? new Set(symbols) : null;
  const identities = new Set(isins);
  const rows = raw.rows.filter((r) => !selected || selected.has(r.ticker) || identities.has(r.isin)).map(parseAction);
  // Duplicate IDs must agree. Conflicting records are retained as blocked events.
  const byId = new Map();
  for (const r of rows) {
    const prior = byId.get(r.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(r)) {
      r.issue = "Conflicting source records"; r.factor = null; r.cashPerShare = null;
    }
    byId.set(r.id, r);
  }
  const sourceDates = [raw.sources?.nse?.capturedAt, raw.sources?.screener?.capturedAt];
  const verifiedThrough = sourceDates.every((d) => Number.isFinite(Date.parse(d)))
    ? [...sourceDates, raw.capturedAt].map((d) => new Date(d).toISOString().slice(0, 10)).sort()[0] : null;
  return { version: 1, capturedAt: raw.capturedAt, requestedFrom: raw.requestedFrom,
    requestedTo: raw.requestedTo, verifiedThrough, symbols: symbols ? [...new Set(symbols)].sort() : null,
    isins, sourceUrl: RESEARCH_ACTIONS_URL, rows: [...byId.values()] };
}

export function validActionFeed(v) {
  return v?.version === 1 && Number.isFinite(Date.parse(v.capturedAt))
    && !!isoDay(v.requestedFrom) && !!isoDay(v.requestedTo)
    && (v.verifiedThrough === null || !!isoDay(v.verifiedThrough))
    && (v.symbols === null || Array.isArray(v.symbols) && v.symbols.every((s) => typeof s === "string"))
    && Array.isArray(v.isins) && v.isins.every((s) => typeof s === "string")
    && Array.isArray(v.rows) && v.rows.every((r) => typeof r.id === "string" && typeof r.ticker === "string"
      && (r.isin === null || typeof r.isin === "string") && typeof r.source === "string"
      && typeof r.company === "string" && typeof r.type === "string" && typeof r.purpose === "string"
      && (r.exDate === null || !!isoDay(r.exDate)) && (r.recordDate === null || !!isoDay(r.recordDate))
      && (r.factor === null || Number.isFinite(r.factor) && r.factor > 1)
      && (r.cashPerShare === null || Number.isFinite(r.cashPerShare) && r.cashPerShare >= 0)
      && (r.issue === null || typeof r.issue === "string")
      && (r.sourceUrl === null || safeUrl(r.sourceUrl) === r.sourceUrl));
}
