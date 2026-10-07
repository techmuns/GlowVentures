#!/usr/bin/env node
/**
 * ── WHICH UPSTOX INSTRUMENT EACH NSE SYMBOL IS ──────────────────────────────
 *
 * *"I have got the upstox token for live current market prices for all
 * tickers in the dashboard."*
 *
 * Upstox prices by INSTRUMENT KEY, never by trading symbol. For an NSE share or
 * ETF the key is `NSE_EQ|<ISIN>`, and this book's live layer speaks NSE symbols
 * (`src/data/nseSymbols.json`, keyed on securityKey). So something has to say
 * which instrument each symbol is, and it must be a LOOKUP rather than a
 * judgement: a wrong key prices somebody else's company, correctly formatted,
 * and nothing on screen could catch it.
 *
 * The lookup is Upstox's OWN public instrument list — keyless, the file the two
 * sister dashboards (Glow and Sattva Central Research) already map against in
 * production:
 *
 *   https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz
 *
 * ── THE RULES, EACH A WRONG ANSWER AVOIDED ─────────────────────────────────
 *
 *   1. EXACT TRADING SYMBOL, in the NSE cash segment, and only a series that is
 *      a share or a listed unit. NSE_EQ also carries bonds, SGBs, T-bills and
 *      G-secs, some under the same symbol as a company's share — Glow Central
 *      Research measured that — so the series is an allowlist, not a guess.
 *   2. MORE THAN ONE CANDIDATE IS REFUSED, never resolved by picking the first.
 *   3. WHERE THE BOOK CARRIES AN ISIN FOR THE SYMBOL, THE KEY MUST CARRY THE SAME
 *      ONE. A disagreement is refused and named. (Measured when this was
 *      written: 40 symbols carry a book ISIN and all 40 agree.)
 *   4. A SYMBOL WITH NO EXACT MATCH IS JOINED ON THE BOOK'S OWN ISIN, IF IT HAS
 *      ONE — an identifier, not a name: a renamed ticker keeps its ISIN. There is
 *      no fuzzy tier. HEG (renamed HEG Advanced Material, now HEGAM) was the
 *      case that stayed unmapped, because the book carries no ISIN for it. It
 *      maps since Stage 10dl, and not through this rule: `build-nse-symbols`
 *      carries a cited `heg → HEGAM` override, `build-book` puts HEGAM on the
 *      position, and rule 1 then matches it exactly. A symbol that still has no
 *      match is named in the report, and `/api/quotes` falls back to the muns
 *      feed for it.
 *
 * WHAT IT WRITES IS A MAP, NOT A PRICE. `shared/upstoxInstruments.mjs` is
 * imported by `functions/api/quotes.js`; it carries no figure and never enters
 * `glowData.ts`. Idempotent — nothing moved upstream, nothing written — and
 * `--check` writes nothing and is the control run. Re-run it when a drop brings
 * a new listed holding, AFTER `npm run build-symbols`.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "shared/upstoxInstruments.mjs");
const DOC = join(ROOT, "docs/UPSTOX-INSTRUMENTS.md");
const CHECK = process.argv.includes("--check");
const SOURCE = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";

/**
 * NSE cash-market series that are a SHARE or a listed UNIT (ETF, REIT, InvIT,
 * SME board). The same allowlist Glow Central Research filters on; everything
 * else in NSE_EQ — N0-NZ bonds, SG gold bonds, GS/TB government paper — is a
 * different security that can share a company's symbol.
 */
const CASH_SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ", "RR", "IV", "IT", "E1"]);
const KEY_SHAPE = /^NSE_EQ\|IN[A-Z0-9]{10}$/;

const die = (m) => { console.error(`build-upstox-instruments: ${m}`); process.exit(1); };

/** The array literal behind a `export const NAME: T[] = [...]` in a generated file. */
function bookArray(src, name) {
  const m = new RegExp(`export const ${name}[^=]*= (\\[[\\s\\S]*?\\n\\]);`).exec(src);
  return m ? JSON.parse(m[1]) : null;
}

// ── what the dashboard can ask about ────────────────────────────────────────
// Exactly `symbolFor(p)` in src/lib/quotes.ts, over the book: the symbol the
// statement printed, else the securityKey bridge. Built over BOOK_POSITIONS, so
// the ring-fenced holding (kept out of that array) is never in this map either.
const glow = readFileSync(join(ROOT, "src/data/glowData.ts"), "utf8");
const positions = bookArray(glow, "BOOK_POSITIONS") ?? die("no BOOK_POSITIONS in glowData.ts");
const bridge = JSON.parse(readFileSync(join(ROOT, "src/data/nseSymbols.json"), "utf8"));

/**
 * …AND EVERY SHARE A STATEMENT RECORDS WITHOUT VALUING IT, which the dashboard
 * prices at the live quote: a holding statement's lines the book carries as
 * quantities (`BOOK_UNVALUED_HOLDINGS` — since Stage 10cz that is every share on
 * the Motilal Oswal CDSL statements, whose printed rate is a last movement's
 * price and not a valuation), and a transaction-only account's closing balances
 * (Stage 10cy). Asked off positions alone, this map would drop those symbols on
 * its next run and the quote feed would stop pricing them through Upstox with
 * nothing failing anywhere. The ring-fenced holding is in none of these arrays.
 */
const recorded = bookArray(glow, "BOOK_UNVALUED_HOLDINGS") ?? [];
const txOnly = new Set((bookArray(glow, "BOOK_ACCOUNTS") ?? [])
  .filter((a) => a.transactionsOnly === true).map((a) => a.accountId));
const movementsSrc = (() => {
  const i = glow.indexOf("export const BOOK_SHARE_MOVEMENTS");
  const a = i < 0 ? -1 : glow.indexOf("= {", i);
  const b = a < 0 ? -1 : glow.indexOf("\n};", a);
  return a < 0 || b < 0 ? {} : JSON.parse(glow.slice(a + 2, b + 2));
})();
const closing = Object.values(movementsSrc).filter((w) => txOnly.has(w.accountId)
  && w.reason == null && typeof w.closing === "number" && w.closing > 0);

/** symbol → { names, isins } — the book's own evidence about each symbol. */
const asked = new Map();
for (const p of [...positions,
  ...recorded.filter((u) => typeof u.quantity === "number" && u.quantity > 0 && !u.sameUnitsReportedBy),
  ...closing]) {
  const sym = p.symbol || bridge[p.securityKey];
  if (!sym) continue;
  const e = asked.get(sym) ?? { names: new Set(), isins: new Set() };
  e.names.add(p.security);
  if (p.isin) e.isins.add(p.isin);
  asked.set(sym, e);
}

async function main() {
  const res = await fetch(SOURCE, { headers: { "user-agent": "GlowVentures/1.0 (instrument map)" } });
  if (!res.ok) die(`${SOURCE} answered HTTP ${res.status}`);
  // Checked by CONTENT, not status: a CDN answering 200 with an error page is a
  // failure this repo has met before (NSE's masters).
  let list;
  try { list = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8")); }
  catch (e) { die(`the instrument list did not decode as gzipped JSON (${e.message})`); }
  if (!Array.isArray(list) || list.length < 1000) die(`the instrument list is not a list of instruments (${Array.isArray(list) ? list.length : typeof list})`);

  const cash = list.filter((i) => i && i.segment === "NSE_EQ" && CASH_SERIES.has(i.instrument_type)
    && KEY_SHAPE.test(i.instrument_key || "") && i.trading_symbol);
  if (cash.length < 1000) die(`only ${cash.length} NSE cash instruments — the list's shape has changed`);
  const bySymbol = new Map(), byIsin = new Map();
  for (const i of cash) {
    bySymbol.set(i.trading_symbol, [...(bySymbol.get(i.trading_symbol) ?? []), i]);
    const isin = i.instrument_key.split("|")[1];
    byIsin.set(isin, [...(byIsin.get(isin) ?? []), i]);
  }

  const mapped = {}, unmapped = [];
  for (const sym of [...asked.keys()].sort()) {
    const { names, isins } = asked.get(sym);
    const name = [...names][0];
    if (isins.size > 1) { unmapped.push({ sym, name, why: `the book carries two ISINs for this symbol (${[...isins].join(", ")}), so it cannot say which instrument it is` }); continue; }
    const bookIsin = [...isins][0] ?? null;
    const exact = bySymbol.get(sym) ?? [];
    if (exact.length > 1) { unmapped.push({ sym, name, why: `${exact.length} NSE cash instruments trade as ${sym} (${exact.map((i) => i.instrument_key).join(", ")}) — refused rather than picking one` }); continue; }
    if (exact.length === 1) {
      const i = exact[0], isin = i.instrument_key.split("|")[1];
      if (bookIsin && bookIsin !== isin) { unmapped.push({ sym, name, why: `Upstox lists ${sym} as ${isin}, but the book's own statement prints ${bookIsin} — refused` }); continue; }
      mapped[sym] = { key: i.instrument_key, tradingSymbol: i.trading_symbol, series: i.instrument_type, joinedBy: bookIsin ? "symbol+isin" : "symbol" };
      continue;
    }
    // No exact symbol. The book's own ISIN is the only other identifier allowed.
    const viaIsin = bookIsin ? (byIsin.get(bookIsin) ?? []) : [];
    if (viaIsin.length === 1) {
      const i = viaIsin[0];
      mapped[sym] = { key: i.instrument_key, tradingSymbol: i.trading_symbol, series: i.instrument_type, joinedBy: "isin" };
      continue;
    }
    unmapped.push({ sym, name, why: bookIsin
      ? `no NSE cash instrument trades as ${sym}, and ${viaIsin.length ? `${viaIsin.length} carry the book's ISIN ${bookIsin}` : `none carries the book's ISIN ${bookIsin}`}`
      : `no NSE cash instrument trades as ${sym}, and the book carries no ISIN to join on — the symbol may have been renamed; this holding stays on the muns feed` });
  }

  const count = Object.keys(mapped).length;
  const body = `${HEADER}
export const UPSTOX_INSTRUMENTS = Object.freeze(${JSON.stringify(mapped, null, 1)});

/** How many NSE symbols the dashboard can ask about, and how many are mapped above. */
export const UPSTOX_INSTRUMENT_COVERAGE = Object.freeze(${JSON.stringify({ asked: asked.size, mapped: count, unmapped: unmapped.map((u) => u.sym) })});
`;
  const joined = (how) => Object.values(mapped).filter((m) => m.joinedBy === how).length;
  const doc = `# Upstox instruments — which instrument each NSE symbol is

Generated by \`npm run build-upstox-instruments\`. **Never hand-edited**; the
builder is idempotent and \`--check\` writes nothing.

Source: Upstox's own public instrument list, \`${SOURCE}\` — its NSE
cash-market shares and units only. Every symbol is matched on its EXACT trading
symbol, or on the book's own ISIN — never on a name. (The list's own size moves
every day and is deliberately not printed here, so this file changes only when a
MAPPING does.)

| | |
| --- | ---: |
| NSE symbols the dashboard can ask about | **${asked.size}** |
| Mapped to an Upstox instrument | **${count}** |
| …on the symbol, with the book's own ISIN agreeing | ${joined("symbol+isin")} |
| …on the symbol alone (the book prints no ISIN for it) | ${joined("symbol")} |
| …on the book's ISIN (the ticker has changed) | ${joined("isin")} |
| Not mapped — priced by the muns feed instead, if at all | ${unmapped.length} |

## Not mapped

${unmapped.map((u) => `- **${u.sym}** (${u.name}) — ${u.why}.`).join("\n") || "_None._"}
`;

  const prevBody = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  const prevDoc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  const changed = prevBody !== body || prevDoc !== doc;
  if (CHECK) {
    console.log(changed ? "build-upstox-instruments --check: WOULD CHANGE" : "build-upstox-instruments --check: no change");
    process.exit(changed ? 1 : 0);
  }
  if (changed) { writeFileSync(OUT, body); writeFileSync(DOC, doc); }
  console.log(`build-upstox-instruments: ${count} of ${asked.size} symbols mapped, ${unmapped.length} not mapped${changed ? "" : " (no change)"}`);
  for (const u of unmapped) console.log(`  not mapped: ${u.sym} — ${u.why}`);
}

const HEADER = `// GENERATED by \`npm run build-upstox-instruments\` — do not edit by hand.
//
// NSE trading symbol → the Upstox instrument that IS that security, taken from
// Upstox's own public instrument list and matched on the exact symbol or the
// book's own ISIN, never on a name. \`functions/api/quotes.js\` prices through
// it; \`tradingSymbol\` is what Upstox must echo back before a price is used.
//
// A map, not a figure: nothing here reaches \`glowData.ts\` or any total.
`;

main().catch((e) => die(e?.message ?? String(e)));
