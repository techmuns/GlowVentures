#!/usr/bin/env node
// Build quote identities for direct holdings AND every company disclosed by
// held funds. Upstox's NSE/BSE masters supply identities, never prices.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { cashInstruments, instrumentIndex, resolveInstrument, quoteSymbol } from "../shared/upstoxInstrumentLookup.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const SOURCES = ["NSE", "BSE"].map((ex) => `https://assets.upstox.com/market-quote/instruments/exchange/${ex}.json.gz`);
// Statements retain former names or expand the exchange master's abbreviations.
// Each alias is checked against BOTH the current symbol and its equity ISIN.
// Renames: affle.com/investor-relations; cosmofirst.com/press-release;
// sasken.com/investors/frequently-asked-questions; Gujarat Gas's name-change
// filing of 16 May 2026 at gujaratgas.com. Other names are confirmed by
// NSE's EQUITY_L.csv / SME_EQUITY_L.csv and Upstox's current instrument master.
const ALIASES = {
  "affle-india": ["AFFLE", "INE00WC01027"],
  "chambal-fertilisers-and-chemicals": ["CHAMBLFERT", "INE085A01013"],
  "cosmo-films": ["COSMOFIRST", "INE757A01017"],
  "credit-access-grameen": ["CREDITACC", "INE741K01010"],
  "india-shelter-finance": ["INDIASHLTR", "INE922K01024"],
  "krishca-strapping-solutions": ["KRISHCA", "INE0NR701018"],
  "krn-heat-exchanger-and-refrigeration": ["KRN", "INE0Q3J01015"],
  "newgen-software-technologies": ["NEWGEN", "INE619B01017"],
  "rainbow-childrens-medicare": ["RAINBOW", "INE961O01016"],
  "red-tape": ["REDTAPE", "INE0LXT01019"],
  "sasken-communication-technologies": ["SASKEN", "INE231F01020"],
  "tata-teleservices-maharastra": ["TTML", "INE517B01013"],
  "indian-railways-finance": ["IRFC", "INE053F01010"],
  "pilani-investment-and-industries": ["PILANIINVS", "INE417C01014"],
  "fedbank-financial-services": ["FEDFINA", "INE007N01010"],
  "gujarat-gas": ["GUJENERGY", "INE844O01030"],
};
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const die = (m) => { throw new Error(`build-upstox-instruments: ${m}`); };
function bookArray(src, name) {
  const m = new RegExp(`export const ${name}[^=]*= (\\[[\\s\\S]*?\\n\\]);`).exec(src);
  return m ? JSON.parse(m[1]) : null;
}

async function main() {
  const glow = readFileSync(join(ROOT, "src/data/glowData.ts"), "utf8");
  const positions = bookArray(glow, "BOOK_POSITIONS") ?? die("no BOOK_POSITIONS");
  const recorded = bookArray(glow, "BOOK_UNVALUED_HOLDINGS") ?? [];
  const txOnly = new Set((bookArray(glow, "BOOK_ACCOUNTS") ?? []).filter((a) => a.transactionsOnly).map((a) => a.accountId));
  const offset = glow.indexOf("export const BOOK_SHARE_MOVEMENTS");
  const start = glow.indexOf("= {", offset), end = glow.indexOf("\n};", start);
  const closing = Object.values(start < 0 || end < 0 ? {} : JSON.parse(glow.slice(start + 2, end + 2)))
    .filter((w) => txOnly.has(w.accountId) && w.reason == null && w.closing > 0);
  const book = [...positions, ...recorded.filter((u) => u.quantity > 0 && !u.sameUnitsReportedBy), ...closing];
  const bridge = read("src/data/nseSymbols.json");
  const fenced = bookArray(glow, "BOOK_POLYCAB") ?? [];
  const fencedIsins = new Set(fenced.flatMap((p) => p.isin ? [p.isin] : []));
  const fencedKeys = new Set(fenced.map((p) => p.securityKey));

  // Reuse the issuer normalization the table uses for debt disclosed by funds.
  // Its issuer's equity CMP is useful even when the held instrument is an NCD.
  const compiled = await build({ stdin: { contents: 'export { issuerKeyOf } from "./src/lib/lookthrough";', resolveDir: ROOT },
    bundle: true, write: false, format: "esm", platform: "node", alias: { "@": join(ROOT, "src") }, logLevel: "error" });
  const { issuerKeyOf } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);

  const lists = await Promise.all(SOURCES.map(async (url) => {
    const res = await fetch(url, { headers: { "user-agent": "GlowVentures/1.0 (instrument map)" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) die(`${url} answered HTTP ${res.status}`);
    const list = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"));
    if (!Array.isArray(list) || list.length < 1000) die(`${url}: incomplete instrument master`);
    if (cashInstruments(list).length < 1000) die(`${url}: equity instrument shape/coverage changed`);
    return list;
  }));
  const index = instrumentIndex(lists.flat());
  const resolve = (e) => {
    const alias = ALIASES[e.key];
    if (alias && !e.symbol) {
      if (e.isin && e.isin !== alias[1]) return { reason: "statement ISIN disagrees with the verified listing alias" };
      return resolveInstrument({ ...e, symbol: alias[0], isin: e.isin || alias[1] }, index);
    }
    return resolveInstrument(e, index);
  };
  const mapped = {}, securitySymbols = {}, isinSymbols = {}, unresolved = [];
  const refusedKeys = new Set();
  const add = (result) => {
    const i = result.instrument, symbol = quoteSymbol(i);
    mapped[symbol] = { key: i.instrument_key, tradingSymbol: i.trading_symbol, series: i.instrument_type, joinedBy: result.joinedBy };
    isinSymbols[i.instrument_key.split("|")[1]] = symbol;
    return symbol;
  };
  const identity = (key, symbol) => {
    if (refusedKeys.has(key)) return;
    if (securitySymbols[key] && securitySymbols[key] !== symbol) {
      delete securitySymbols[key]; refusedKeys.add(key);
      return;
    }
    securitySymbols[key] = symbol;
  };
  const allowed = (p) => !fencedIsins.has(p.isin) && !fencedKeys.has(p.securityKey) && !fencedKeys.has(issuerKeyOf(p.security ?? p.name));

  // Preserve the existing NSE-symbol contract. Renamed symbols remain aliases
  // of the exact ISIN, so an older statement still reaches the right quote.
  const asked = new Map();
  for (const p of book.filter(allowed)) {
    const symbol = p.symbol || bridge[p.securityKey];
    if (!symbol) continue;
    const e = asked.get(symbol) ?? { isins: new Set(), keys: new Set() };
    if (p.isin) e.isins.add(p.isin);
    e.keys.add(p.securityKey); asked.set(symbol, e);
  }
  const unmapped = [];
  for (const [symbol, e] of asked) {
    const result = e.isins.size > 1 ? { reason: "conflicting statement ISINs" }
      : resolve({ symbol, isin: [...e.isins][0] });
    if (!result.instrument) { unmapped.push(symbol); continue; }
    const alias = add(result);
    mapped[symbol] = mapped[alias];
    for (const key of e.keys) identity(key, alias);
  }

  // A holding without an NSE symbol (Yash Highvoltage, for example) can still
  // be an exact BSE identity. Never match a warrant/preference share by issuer.
  for (const p of book.filter(allowed)) {
    if (p.review || !["Equity", "ETF"].includes(p.assetClass)) continue;
    const result = resolve({ symbol: p.symbol || bridge[p.securityKey], isin: p.isin, key: p.securityKey });
    if (result.instrument) identity(p.securityKey, add(result));
    else unresolved.push({ key: p.securityKey, name: p.security, reason: result.reason });
  }

  const schemes = read("public/lookthrough/index.json").schemes;
  const codes = [...new Set(Object.values(schemes).map((s) => s.schemecode))].sort();
  for (const code of codes) {
    for (const h of read(`public/lookthrough/${code}.json`).holdings) {
      if (!(h.pctAum > 0) || !allowed(h)) continue;
      const key = issuerKeyOf(h.name);
      // Equity resolves by its own ISIN; debt resolves the issuer's share by
      // exact name, without mapping a bond's ISIN to the equity instrument.
      const equity = h.assetClass === "Equity";
      if (!equity && h.assetClass !== "Debt") continue;
      const result = resolve({ isin: equity ? h.isin : null, key });
      if (result.instrument) identity(key, add(result));
      else if (equity) unresolved.push({ key, name: h.name, reason: result.reason });
    }
  }

  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b, "en")));
  const uniqueUnresolved = [...new Map(unresolved.map((u) => [u.key, u])).values()]
    .filter((u) => !securitySymbols[u.key]).sort((a, b) => a.key.localeCompare(b.key));
  const coverage = { asked: Object.keys(mapped).length + unmapped.length, mapped: Object.keys(mapped).length, unmapped: unmapped.sort() };
  const body = `// GENERATED by npm run build-upstox-instruments. Do not edit by hand.
// NSE symbols and BSE:<symbol> quote keys -> verified exchange instruments.
// Security keys and ISINs include direct holdings and fund-disclosed companies.
export const UPSTOX_INSTRUMENTS = Object.freeze(${JSON.stringify(sorted(mapped), null, 1)});
export const UPSTOX_SECURITY_SYMBOLS = Object.freeze(${JSON.stringify(sorted(securitySymbols), null, 1)});
export const UPSTOX_ISIN_SYMBOLS = Object.freeze(${JSON.stringify(sorted(isinSymbols), null, 1)});
export const UPSTOX_INSTRUMENT_COVERAGE = Object.freeze(${JSON.stringify(coverage)});
`;
  const doc = `# Upstox quote coverage

Generated by \`npm run build-upstox-instruments\`; \`--check\` verifies without writing.

Sources: ${SOURCES.map((s) => `[Upstox instrument master](${s})`).join(", ")}.
NSE is preferred; BSE-only listings retain their exchange in the quote key.
Direct holdings, recorded depository balances and companies disclosed by funds
are matched by exact ISIN, verified trading symbol or exact normalized listing
name. Ambiguous identities are refused. Debt ISINs never price equity.

- ${coverage.mapped} quote keys; ${Object.keys(securitySymbols).length} security/issuer keys; ${Object.keys(isinSymbols).length} listed ISINs.
- ${Object.values(mapped).filter((i) => i.key.startsWith("BSE_EQ|")).length} BSE quote keys.
- Unmapped legacy symbols: ${unmapped.join(", ") || "none"}.

## Unresolved holdings and fund equity lines

${uniqueUnresolved.map((u) => `- **${u.name}** (\`${u.key}\`) — ${u.reason}.`).join("\n") || "None."}
`;
  let changed = false;
  for (const [path, value] of [["shared/upstoxInstruments.mjs", body], ["docs/UPSTOX-INSTRUMENTS.md", doc]]) {
    const file = join(ROOT, path);
    if (!existsSync(file) || readFileSync(file, "utf8") !== value) {
      changed = true; if (!CHECK) writeFileSync(file, value);
    }
  }
  console.log(`Upstox: ${coverage.mapped} quote keys, ${Object.keys(securitySymbols).length} companies/instruments, ${uniqueUnresolved.length} unresolved${changed ? CHECK ? " (WOULD CHANGE)" : " (updated)" : " (no change)"}`);
  if (CHECK && changed) process.exitCode = 1;
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
