#!/usr/bin/env node
// The exchange closes `scripts/lib/tradeOpenings.mjs` values a PMS account's
// opening on, written to `scripts/ingest/reference/opening-closes.json` so the
// build reads them offline (Stage 10ni).
//
//   npm run build-opening-closes
//
// For every security a from-inception PMS ledger traded: its close as traded on
// each day the rebuild needs (31 December, 31 March, and each later holdings
// statement), the last session on or before the day and no more than a week
// before it. Yahoo's daily chart, keyless; its close is split-adjusted to today,
// so each is put back on the day's own units through the splits Yahoo lists
// after it. NSE first; BSE where NSE's history starts later than the window
// (a share listed on NSE late, such as WPIL). A share whose history starts
// inside the window records its first close: a demerged share listing then.
// Every answer must name the requested listing in INR.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inceptionLedgers, openingDays } from "./lib/tradeOpenings.mjs";
import { DEMERGERS } from "../shared/demergers.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "scripts/ingest/reference/opening-closes.json");
/** Traded names the NSE symbol table does not carry, by the ledger's own key. */
const SYMBOL_OVERRIDES = {
  "cesc": "CESC", "credit-access-grameen": "CREDITACC", "punjab-chem-and-crop-prot-l": "PUNJABCHEM",
  "shyam-metalics-and-energy": "SHYAMMETL", "amber-enterprises-india": "AMBER", "krishca-strapping-solutions": "KRISHCA",
  "apl-apollo-tubes": "APLAPOLLO", "cosmo-films": "COSMOFIRST", "firstsource-solutions": "FSL", "marksans-pharma": "MARKSANS",
  "repco-home-finance": "REPCOHOME", "s-h-kelkar-and": "SHK", "thirumalai-chemicals": "TIRUMALCHM", "thomas-cook-india": "THOMASCOOK",
};

const docs = fs.readdirSync(path.join(ROOT, "public/audit")).sort()
  .map((d) => path.join(ROOT, "public/audit", d, "document.json")).filter((f) => fs.existsSync(f))
  .map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const byAccount = new Map();
for (const d of docs) if (d.accountNo && d.engagement === "PMS") (byAccount.get(`${d.provider}::${d.accountNo}`) ?? byAccount.set(`${d.provider}::${d.accountNo}`, []).get(`${d.provider}::${d.accountNo}`)).push(d);
const asOf = docs.map((d) => d.asOf).filter(Boolean).sort().at(-1);
const days = new Set(openingDays(asOf));
const keys = new Set();
for (const [, list] of byAccount) {
  const L = inceptionLedgers(list);
  if (L.reason) continue;
  for (const t of L.tx.transactions ?? []) if (t.securityKey) keys.add(t.securityKey);
  for (const d of list) if (["holdings", "appraisal", "investor-report"].includes(d.reportType) && d.asOf > [...days].sort()[0]) days.add(d.asOf);
}
for (const d of DEMERGERS) if (keys.has(d.parentKey) && d.childSymbol) keys.add(d.childKey);
const symbols = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/nseSymbols.json"), "utf8"));
const symbolOf = (k) => SYMBOL_OVERRIDES[k] ?? symbols[k] ?? DEMERGERS.find((d) => d.childKey === k)?.childSymbol ?? null;

const START = `${[...days].sort()[0].slice(0, 4)}-11-01`;
const ist = (s) => new Date((s + 19800) * 1000).toISOString().slice(0, 10);
async function history(ticker) {
  const p1 = Math.floor(Date.parse(`${START}T00:00:00Z`) / 1000), p2 = Math.floor(Date.now() / 1000);
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d&events=splits`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; GlowVenturesBuild/1.0)" } }).then((x) => x.json()).catch(() => null);
  const res = r?.chart?.result?.[0];
  if (!res?.timestamp || res.meta?.currency !== "INR" || res.meta?.symbol?.toUpperCase() !== ticker.toUpperCase()) return null;
  const splits = Object.values(res.events?.splits ?? {}).map((s) => ({ date: ist(s.date), factor: s.numerator / s.denominator }));
  const bars = res.timestamp.map((s, i) => ({ date: ist(s), close: res.indicators.quote[0].close[i] })).filter((b) => Number.isFinite(b.close));
  return { ticker, bars, splits };
}
const late = (h) => !h || Date.parse(h.bars[0]?.date ?? "9999-12-31") - Date.parse(START) > 10 * 864e5;

const out = {};
for (const k of [...keys].sort()) {
  const s = symbolOf(k);
  if (!s) { out[k] = { symbol: null, reason: "no exchange symbol on record" }; continue; }
  let h = await history(`${s}.NS`);
  if (late(h)) { const b = await history(`${s}.BO`); if (b && (!h || b.bars[0].date < h.bars[0].date)) h = b; }
  if (!h?.bars.length) { out[k] = { symbol: s, reason: "no daily history in INR from Yahoo" }; continue; }
  const raw = (b) => Math.round(b.close * h.splits.filter((x) => x.date > b.date).reduce((f, x) => f * x.factor, 1) * 1e4) / 1e4;
  const closes = {};
  for (const day of [...days].sort()) {
    const b = h.bars.filter((x) => x.date <= day).at(-1);
    if (b && Date.parse(day) - Date.parse(b.date) <= 7 * 864e5) closes[day] = { on: b.date, close: raw(b) };
  }
  out[k] = { symbol: s, ticker: h.ticker, ...(late(h) ? { firstClose: { date: h.bars[0].date, close: raw(h.bars[0]) } } : {}), closes };
}
fs.writeFileSync(OUT, `${JSON.stringify({
  note: "Exchange closes as traded on each day (split-unadjusted), for rebuilding PMS opening values from their own ledgers (scripts/lib/tradeOpenings.mjs). Regenerate with npm run build-opening-closes.",
  source: "Yahoo Finance daily chart (NSE, else BSE), keyless", days: [...days].sort(), closes: out }, null, 1)}\n`);
console.log(`${path.relative(ROOT, OUT)}: ${Object.keys(out).length} securities, ${days.size} days; no history: ${Object.entries(out).filter(([, v]) => v.reason).map(([k]) => k).join(", ") || "none"}`);
