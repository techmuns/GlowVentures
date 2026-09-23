/**
 * ── THE PUBLISHED NAV: WHAT IT MAY MOVE, AND WHAT IT MUST NOT ──────────────
 *
 * Anchored on the two GENERATED artefacts — `glowData.ts` and `fundNavs.ts` —
 * rather than on a fixture, so every expectation is derived on the run and a
 * hand-written pair cannot prove only that two inventions agree.
 *
 * The load-bearing ones are the REFUSALS. An overlay that priced everything,
 * or one that quietly moved a cost, renders a page full of plausible figures
 * and no structural check can see it.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  applyFundNavs, fundNavFor, FUND_NAV_COUNT,
  depositoryCashHoldings, partialValuationNotes, VALUE_DEPOSITORY_CASH_UNITS, isArbitrageFund,
} from "../fundNavs";
import { isCashEquivalent } from "../analytics";
import { BOOK_FUND_NAVS } from "@/data/fundNavs";
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_SHARE_MOVEMENTS } from "@/data/glowData";
import type { Position } from "../types";

let pass = 0;
const fails: string[] = [];
const ok = (what: string, cond: boolean, note = "") => {
  if (cond) { pass += 1; console.log(`ok   ${what}${note ? ` — ${note}` : ""}`); }
  else { fails.push(what); console.log(`FAIL ${what}${note ? ` — ${note}` : ""}`); }
};

console.log("──── Fund NAVs");

// ── the join ────────────────────────────────────────────────────────────────
console.log("── every scheme is reached by an identifier, never by a name ──");
ok("the store is not empty — a suite that passes over no input claims nothing",
  BOOK_FUND_NAVS.length > 0, `${BOOK_FUND_NAVS.length} scheme(s), ${FUND_NAV_COUNT} usable`);
ok("every entry carries the ISIN it was joined on",
  BOOK_FUND_NAVS.every((e) => /^IN[EF][0-9A-Z]{9}$/.test(e.isin)));
ok("...and says which tier supplied it",
  BOOK_FUND_NAVS.every((e) => e.isinFrom === "statement" || e.isinFrom === "look-through"));
ok("both tiers are actually in use, so neither is dead",
  BOOK_FUND_NAVS.some((e) => e.isinFrom === "statement") && BOOK_FUND_NAVS.some((e) => e.isinFrom === "look-through"));
ok("every NAV is a positive finite number with its own publication date",
  BOOK_FUND_NAVS.every((e) => Number.isFinite(e.nav) && e.nav > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date)));

// A REFUSAL MUST NAME ITS CAUSE — the rule `Absent.tsx` enforces on screen,
// applied to the data that decides whether a figure appears at all.
console.log("── a refused scheme carries its NAV and its reason ──");
ok("every scheme refused for value names why",
  BOOK_FUND_NAVS.filter((e) => !e.usableForValue).every((e) => !!e.notUsableReason && e.notUsableReason.length > 20));
ok("...and every usable one carries no reason, so the field cannot drift into prose",
  BOOK_FUND_NAVS.filter((e) => e.usableForValue).every((e) => e.notUsableReason === null));

// ── the basis gate, which is what stops a ten-fold error ────────────────────
console.log("── the units and the NAV are on one basis, or the NAV does not value ──");
const marksOf = (key: string) => BOOK_POSITIONS
  .filter((p) => p.securityKey === key && typeof p.currentPrice === "number")
  .map((p) => p.currentPrice as number);
ok("every scheme cleared for value is within a factor of two of the book's own mark",
  BOOK_FUND_NAVS.filter((e) => e.usableForValue).every((e) => {
    const m = marksOf(e.securityKey);
    return m.length === 0 || m.some((x) => e.nav / x >= 0.5 && e.nav / x <= 2);
  }));
/**
 * LOAD-BEARING, AND STATED AS AN INEQUALITY. On this book DSP Gold is marked
 * ₹151.10 against a NAV of ₹14.7633 — a share-count break. The gate is only
 * worth having if applying it would actually change an answer, so the suite
 * asserts a holding EXISTS that the naive `quantity × NAV` would misprice by
 * more than a factor of two, whether or not the join currently reaches it.
 */
const wouldBreak = BOOK_POSITIONS.filter((p) => {
  const e = fundNavFor(p);
  if (!e || !(p.currentPrice as number) || !(p.quantity > 0)) return false;
  const r = e.nav / (p.currentPrice as number);
  return r < 0.5 || r > 2;
});
if (wouldBreak.length === 0) {
  /**
   * NOT EXERCISED ON THIS BOOK, AND SAID OUT LOUD RATHER THAN PASSED OVER
   * NOTHING. `[].every(...)` is true, so the obvious assertion here would
   * report a working gate on a run where the gate never ran — `golden.mjs`'s
   * rule, arriving through an empty set.
   *
   * Both share-count breaks in this book are the DSP metal ETFs, and AMFI does
   * not list the ISINs their statements carry, so the join never reaches them
   * and the band has no subject. The gate stays because the next drop could
   * bring one that resolves; what cannot be claimed is that this run proved it.
   */
  console.log("NOT CHECKED  the basis gate refuses a share-count break — no scheme in this book both RESOLVES and sits outside the band (the two that break it, the DSP metal ETFs, are not in AMFI's file at all)");
} else {
  ok("no holding the overlay accepts would be mispriced by a factor of two",
    wouldBreak.every((p) => !fundNavFor(p)?.usableForValue),
    `${wouldBreak.length} holding(s) sit outside the band`);
}

// ── the overlay itself ──────────────────────────────────────────────────────
console.log("── the overlay moves the price and the value, and nothing else ──");
const before = BOOK_POSITIONS as Position[];
const after = applyFundNavs(before);
ok("it returns one row per row, in order", after.length === before.length
  && after.every((p, i) => p.securityKey === before[i].securityKey));

const moved = after.filter((p, i) => p.marketValue !== before[i].marketValue);
ok("it moved at least one holding — an overlay that priced nothing is not wired",
  moved.length > 0, `${moved.length} row(s) repriced`);

/**
 * §6, ASSERTED FIELD BY FIELD. This is the whole guarantee: a published price
 * is evidence about what a unit is worth and about nothing else. A future edit
 * that let it touch a cost or a realised figure would render perfectly.
 */
const FROZEN = ["quantity", "costBasis", "realizedPnL", "dividendReceived", "accruedIncome",
  "stCostBasis", "ltCostBasis", "heldSince", "investedOn", "accountId", "securityKey",
  "assetClass", "sector", "isin", "dayChange", "dayChangePct", "prevClose", "live"] as const;
ok("quantity, cost, realised, dividends, dated fields and the INTRADAY fields are untouched",
  after.every((p, i) => FROZEN.every((f) =>
    JSON.stringify((p as Record<string, unknown>)[f]) === JSON.stringify((before[i] as Record<string, unknown>)[f]))));

ok("a repriced row's value is exactly its own units times the published NAV",
  moved.every((p) => {
    const e = fundNavFor(p);
    return !!e && Math.abs(p.marketValue - p.quantity * e.nav) < 0.000001;
  }));
ok("...and its price IS that NAV, never a value divided back out",
  moved.every((p) => p.currentPrice === fundNavFor(p)?.nav));
ok("every repriced row is marked as NAV-priced and carries the publication date",
  moved.every((p) => p.navPriced === true && /^\d{4}-\d{2}-\d{2}$/.test(p.navDate ?? "")));
ok("...and NONE of them is marked live — a NAV is not an intraday quote",
  moved.every((p) => !p.live));

// A LIVE QUOTE WINS. One scheme in this book resolves an NSE symbol, and an
// intraday price is fresher than a NAV published for the previous business day.
const asLive = before.map((p) => (fundNavFor(p)?.usableForValue ? { ...p, live: true } : p));
ok("a holding the quote feed already priced is left alone",
  applyFundNavs(asLive).every((p, i) => p.marketValue === asLive[i].marketValue));

// A HOLDING WITH NO UNITS IS NOT PRICED INTO EXISTENCE. `quantity × NAV` on a
// closed position is a measured zero either way, and overlaying it would mark a
// row the family no longer holds as though it had been revalued.
ok("a holding with no units is never repriced",
  after.every((p, i) => (before[i].quantity > 0) || p.marketValue === before[i].marketValue));

/**
 * ── AND THE MARK IN THE BOOK IS A PRIMITIVE, WHICH THE PAGE CAN NO LONGER SHOW
 *
 * `check:pages` carried a route for this — the one holding whose statement
 * prints a rate its own value column contradicts (ICICI NFT NT 50 DP G: 60.4
 * against an implied 60.4167). The NAV overlay sets `marketValue = quantity ×
 * NAV`, so on every overlaid holding the two are equal BY CONSTRUCTION and
 * that holding is itself overlaid — the rendered page can no longer witness the
 * distinction at all, and a route asserting it would pass trivially.
 *
 * The claim is still true of the BOOK, which is where it was always about: the
 * ingest READS the printed rate rather than deriving it (§4b). So it is
 * asserted here, against `glowData.ts`, and the route was retired rather than
 * left unable to fail.
 */
console.log("── the book's own mark is read, not derived ──");
const primitive = BOOK_POSITIONS.filter((p) =>
  typeof p.currentPrice === "number" && p.quantity > 0
  && Math.abs((p.currentPrice as number) - p.marketValue / p.quantity) >= 0.005);
ok("at least one holding's printed rate is NOT its value over quantity",
  primitive.length > 0,
  primitive.map((p) => `${p.securityKey} ${p.currentPrice} vs ${(p.marketValue / p.quantity).toFixed(4)}`).join("; ") || "none — the ingest may have started deriving it");

// ── the depository's cash, valued where no statement marks it ──────────────
/**
 * *"Arbitrage funds or holdings into that cash as well, because arbitrage funds
 * are nothing but basically cash."* The three this family holds are on ONE
 * account — Ajay's main demat, which sent a TRANSACTION statement and no holding
 * statement — so they are a depository's closing balances and no position at
 * all. `depositoryCashHoldings` values those balances at AMFI's published NAV on
 * the LIVE basis, and every claim below is struck against the generated book and
 * the committed store rather than against the function's own output.
 */
console.log("── a depository's cash-equivalent units, valued at the published NAV ──");
const DEP = depositoryCashHoldings();
const txOnly = new Set(BOOK_ACCOUNTS.filter((a) => a.transactionsOnly === true).map((a) => a.accountId));
const crs = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;
ok("the switch is on, so the rows below are what the live book adds",
  VALUE_DEPOSITORY_CASH_UNITS === true);
ok("the book names which accounts sent a transaction statement and no holding statement",
  txOnly.size > 0, [...txOnly].join(", "));
ok("the depository contributes rows at all, so every claim below has a subject",
  DEP.length > 0, `${DEP.length} row(s), ${crs(DEP.reduce((a, p) => a + p.marketValue, 0))}`);
ok("...and they include the arbitrage funds the family asked about",
  DEP.some((p) => isArbitrageFund(p)), DEP.filter((p) => isArbitrageFund(p)).map((p) => p.securityKey).join("; "));
ok("every row sits on such an account and nowhere else",
  DEP.every((p) => txOnly.has(p.accountId)));
ok("...and no account that carries a book position gains one — its own holding statement already speaks",
  DEP.every((p) => !BOOK_POSITIONS.some((b) => b.accountId === p.accountId)));
ok("every row is a cash equivalent: the switch values the family's cash and nothing else",
  DEP.every((p) => isCashEquivalent(p)));

/** THE UNITS ARE THE DEPOSITORY'S, THE PRICE IS AMFI'S, AND NOTHING ELSE IS. */
const navByIsin = new Map(BOOK_FUND_NAVS.map((e) => [e.isin, e]));
const blocks = Object.values(BOOK_SHARE_MOVEMENTS);
const offUnits = DEP.filter((p) => {
  const w = blocks.filter((b) => b.accountId === p.accountId && b.isin === p.isin);
  return w.length !== 1 || w[0].reason !== null || w[0].closing !== p.quantity;
});
ok("every row's units are the depository's own closing balance, from a block that reconciled",
  offUnits.length === 0, offUnits.map((p) => p.securityKey).join("; "));
const offValue = DEP.filter((p) => {
  const e = p.isin ? navByIsin.get(p.isin) : undefined;
  return !e || !e.usableForValue || p.currentPrice !== e.nav || p.marketValue !== p.quantity * e.nav
    || p.navDate !== e.date;
});
ok("...and its value is exactly those units × the NAV AMFI published, dated as AMFI dated it",
  offValue.length === 0, offValue.map((p) => p.securityKey).join("; "));
ok("no row carries a cost — a depository holds units and did not buy them, and a ₹0 cost would book the lot as profit",
  DEP.every((p) => p.costBasis === null && p.unrealizedPnL === null && p.returnPct === null && p.costUnavailable === true));
ok("every row says where it came from: the depository's window and the NAV's own date",
  DEP.every((p) => p.navPriced === true && !!p.navDate && !!p.depositoryUnits?.asOf && !!p.depositoryUnits?.source));
const doubled = DEP.filter((p) => BOOK_POSITIONS.some((b) =>
  b.isin && p.isin && b.isin.toUpperCase() === p.isin.toUpperCase() && Math.abs(b.quantity - p.quantity) < 0.0005));
ok("no row repeats a book position — same ISIN and the same units would be one holding counted twice",
  doubled.length === 0, doubled.map((p) => p.securityKey).join("; "));
ok("the generated book carries no position on a transaction-only account — none of this is in `glowData.ts`",
  BOOK_POSITIONS.every((b) => !txOnly.has(b.accountId)));

/**
 * EACH GATE IS LOAD-BEARING, SHOWN ON CONSTRUCTED INPUTS, because on this book
 * a working gate and a deleted one can draw the same rows.
 */
console.log("── each gate refuses on its own ──");
ok("an account the book does not mark transaction-only yields nothing",
  depositoryCashHoldings(BOOK_ACCOUNTS.map((a) => ({ ...a, transactionsOnly: false }))).length === 0);
const firstAcct = DEP[0]?.accountId ?? "";
ok("...nor does one that also carries a position of its own",
  depositoryCashHoldings(BOOK_ACCOUNTS, [...BOOK_POSITIONS, { ...BOOK_POSITIONS[0], accountId: firstAcct }])
    .every((p) => p.accountId !== firstAcct));
const unreconciled = Object.fromEntries(Object.entries(BOOK_SHARE_MOVEMENTS)
  .map(([k, w]) => [k, { ...w, reason: "the rows did not walk to the printed closing balance" }]));
ok("a block whose rows did not walk to their printed closing yields nothing",
  depositoryCashHoldings(BOOK_ACCOUNTS, BOOK_POSITIONS, unreconciled).length === 0);
/**
 * AND THE CASH GATE BITES ON THE BOOK ITSELF. The same demat holds mutual funds
 * AMFI prices that are NOT cash — a large & mid cap fund, an equity savings fund
 * — and the family asked for arbitrage to be counted as cash, not for this
 * account to be valued. Those balances must stay out.
 */
// Keyed as the book keys the ISIN where the book carries it — the depository's
// own spelling of HDFC Liquid is not the key the live book values it under.
const bookKeyByIsin = new Map<string, string>();
for (const b of BOOK_POSITIONS) {
  const k = b.isin?.trim().toUpperCase();
  if (k && !bookKeyByIsin.has(k)) bookKeyByIsin.set(k, b.securityKey);
}
const keyOf = (w: { isin: string | null; securityKey: string }) =>
  bookKeyByIsin.get(w.isin?.trim().toUpperCase() ?? "") ?? w.securityKey;
const nonCash = blocks.filter((w) => txOnly.has(w.accountId) && w.reason === null && (w.closing ?? 0) > 0
  && w.isin && navByIsin.get(w.isin)?.usableForValue && !isCashEquivalent({ securityKey: keyOf(w) }));
ok("the same account holds priced funds that are not cash, so the cash gate has something to refuse",
  nonCash.length > 0, `${nonCash.length} balance(s), ${crs(nonCash.reduce((a, w) => a + (w.closing ?? 0) * (navByIsin.get(w.isin ?? "")?.nav ?? 0), 0))} at AMFI's NAV`);
ok("...and none of them is valued",
  nonCash.every((w) => !DEP.some((p) => p.isin === w.isin)));

/** THE ACCOUNT STOPS SAYING IT VALUES NOTHING, AND NAMES WHAT IT DOES NOT. */
const notes = partialValuationNotes(DEP);
const held = (id: string) => blocks.filter((w) => w.accountId === id && (w.closing ?? 0) > 0).length;
ok("every account a row came from carries a partial-valuation sentence",
  [...new Set(DEP.map((p) => p.accountId))].every((id) => (notes.get(id) ?? "").length > 40));
ok("...naming how many of its holdings are NOT valued, so a partial figure cannot read as the whole account",
  [...notes.entries()].every(([id, n]) => {
    const rest = held(id) - DEP.filter((p) => p.accountId === id).length;
    return rest === 0 ? /nothing else/.test(n) : n.includes(`other ${rest} holding`);
  }), [...notes.values()].join(" | ").slice(0, 300));

/**
 * ── THE UNIT-BASIS WITNESS, FROM THE FAMILY'S OWN DOCUMENT ──────────────────
 *
 * The builder's basis gate compares a published NAV against a STATEMENT MARK and
 * refuses a scheme more than a factor of two away — which is what caught DSP
 * Gold's ten-fold share-count break. A depository balance has no mark, so that
 * gate cannot run on these rows, and the one thing that could make them wrong by
 * ten times goes unchecked by it.
 *
 * So a document nobody in this join controls is asked instead. The family's
 * consolidated review records its own purchase of Motilal Oswal Arbitrage — a
 * unit count and the NAV paid — and the depository credits EXACTLY that many
 * units to this account on the settlement date. One purchase, two independent
 * documents, three decimals. The NAV the review paid is then held to the same
 * factor-of-two band against the NAV AMFI publishes today: the units the
 * depository counts are the units AMFI prices.
 */
console.log("── the depository's units and AMFI's NAV are one unit ──");
const REVIEW = path.join(process.cwd(), "source", "august-2026-d",
  "Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx");
if (!existsSync(REVIEW)) {
  ok("the family's consolidated review is on disk to witness the unit basis", false, REVIEW);
} else {
  const wb = XLSX.readFile(REVIEW);
  const sheet = wb.SheetNames.find((n) => /transactions since inception/i.test(n));
  const rows = sheet
    ? (XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, defval: "" }) as unknown[][])
    : [];
  const excelDate = (n: number) => new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
  type Buy = { product: string; date: string; units: number; nav: number };
  const buys: Buy[] = rows
    .filter((r) => r.some((c) => /^purchase$/i.test(String(c).trim())))
    .map((r) => {
      const i = r.findIndex((c) => /^purchase$/i.test(String(c).trim()));
      return { product: String(r[i - 1] ?? ""), date: excelDate(Number(r[i + 1])), units: Number(r[i + 2]), nav: Number(r[i + 3]) };
    })
    .filter((b) => Number.isFinite(b.units) && b.units > 0 && Number.isFinite(b.nav) && b.nav > 0);
  // The depository's own dated credits for every row valued here, read from the
  // archive document the balance came from — never from the review.
  type Credit = { isin: string; date: string; quantity: number };
  const credits: Credit[] = [];
  for (const src of new Set(DEP.map((p) => p.depositoryUnits?.source).filter(Boolean) as string[])) {
    const f = path.join(process.cwd(), "public", "audit", src, "document.json");
    if (!existsSync(f)) continue;
    const doc = JSON.parse(readFileSync(f, "utf8")) as { transactions?: { isin?: string | null; date?: string; quantity?: number | null }[] };
    for (const t of doc.transactions ?? []) {
      if (t.isin && t.date && typeof t.quantity === "number" && t.quantity > 0) credits.push({ isin: t.isin, date: t.date, quantity: t.quantity });
    }
  }
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  const witnessed = DEP.filter((p) => isArbitrageFund(p)).flatMap((p) => {
    const nav = navByIsin.get(p.isin ?? "")?.nav ?? 0;
    return buys
      .filter((b) => credits.some((c) => c.isin === p.isin && Math.abs(c.quantity - b.units) < 0.0005 && days(c.date, b.date) <= 5))
      .map((b) => ({ key: p.securityKey, b, nav }));
  });
  ok("the review records a purchase the depository credits unit for unit",
    witnessed.length > 0,
    witnessed.map((w) => `${w.b.product}: ${w.b.units} units on ${w.b.date} at ₹${w.b.nav}`).join("; ") || `${buys.length} purchases read, none matched`);
  ok("...at a NAV on the same scale AMFI publishes today — the builder's own factor-of-two band",
    witnessed.length > 0 && witnessed.every((w) => w.nav / w.b.nav >= 0.5 && w.nav / w.b.nav <= 2),
    witnessed.map((w) => `paid ₹${w.b.nav}, published ₹${w.nav}`).join("; "));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  FAILED: ${f}`); process.exit(1); }
console.log("All fund-NAV checks passed.");
