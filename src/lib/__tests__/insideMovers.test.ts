// THE HOLDINGS INSIDE THE AIFs AND THE PMS MANDATES, RANKED BY THE DAY'S MOVE.
//   npm run test:family -- ONLY="holdings inside the AIFs and PMS mandates"
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   "we will not show that particular AIF or the PMS that is having the highest
//    gain or lose but we will show the holding INSIDE all of the AIF and PMS
//    which are having the highest daily gain or lose."
//
// Four things can go wrong quietly here, and not one of them shows on a
// rendered page — every figure would be correctly formatted and plausibly sized:
//
//   • A WRAPPER DRAWN AS A ROW. The family's sentence is about exactly this, and
//     a card listing "Buoyant Opportunities Strategy +1.4%" renders perfectly.
//   • THE TWO HALVES ADDED. A PMS share is MEASURED — a price on a quantity the
//     family's own statement reports. An AIF line is DERIVED — a price on a
//     weight a fund published a month ago. Summing them is a one-line edit and
//     the sum is a figure no document supports.
//   • A COMPANY REFUSED ON ONE HALF AND PRICED ON THE OTHER. The percentage is
//     ONE quote's; a quote this book will not stand behind for a mandate row is
//     no better for a disclosed line of the same company.
//   • THE RING-FENCE BREACHED THROUGH A DISCLOSURE. A fund the family holds can
//     disclose the promoter block — `lookthrough.ts` measured Rs 88,891 of it
//     inside a scheme — and the fence is keyed on a SECURITY, so it has to reach
//     a disclosed line too or `/cio` names Polycab.
//
// ── THE ANCHORS ARE TWO GENERATED ARTEFACTS, NOT TYPED FIGURES ──────────────
//
// `glowData.ts` comes from `source/` through `build-book`; the disclosure model
// comes from `public/audit/` through `build-read-models`. Both move on their own
// schedules, so every expectation over them is either DERIVED from them on this
// run or written as a RELATION that survives either moving. The gates that this
// book cannot exercise are exercised on CONSTRUCTED input, each with its own
// before-and-after, so a gate that stopped working fails rather than abstains.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_ACCOUNTS, BOOK_POLYCAB } from "@/data/glowData";
import { accountIndex, engagementOf } from "@/lib/accounts";
import { AT_COST_BUCKET, MANDATE_BUCKET, currentHoldings, holdingBucket } from "@/lib/analytics";
import { deriveFundDisclosures, type ArchiveDoc } from "@/lib/ledgerModel";
import { familyValue } from "@/lib/lookthrough";
import { insideMovers } from "@/lib/insideMovers";
import { applyQuotes, symbolFor, symbolForKey, type Quote, type QuoteFeed } from "@/lib/quotes";
import { securityKeyOf } from "@/lib/securityKey";
import type { FundDisclosureData } from "@/lib/fundDisclosures";
import type { ActionFeed } from "@/lib/corporateActions";
import type { Position } from "@/lib/types";
import { LIVE_POSITIONS } from "./liveBook";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (name: string, got: number | null | undefined, want: number, tol = 0.01) => {
  const pass = got != null && Math.abs(got - want) <= tol;
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${got} want ${want}`); }
  else console.log(`ok   ${name} = ${got}`);
};
const cr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;

const ROOT = process.env.GLOW_ROOT ?? process.cwd();
const manifest = JSON.parse(readFileSync(path.join(ROOT, "src/data/readModels.json"), "utf8"));
const disclosures = JSON.parse(readFileSync(
  path.join(ROOT, `public/views/${manifest.revision}/fund-disclosures.json`), "utf8"),
) as FundDisclosureData;

const accts = accountIndex(BOOK_ACCOUNTS);

// ── THE FEED. A SUITE HAS NO QUOTES, SO IT BUILDS ONE OUT OF THE BOOK ───────
//
// Every price is the book's own mark times one factor, with the mark as the
// previous close — so the day's move is the SAME number on every symbol and no
// expectation below can be satisfied by a ranking that happens to come out
// right. A company only a fund disclosed has no mark in this book, so it is
// priced at a round figure: that is also the one case `priceLooksLikeSameSecurity`
// passes for want of anything to compare against, which `vacuous` counts.
const FACTOR = 1.1;
const SESSION = "2026-10-07";
const TRADED = `${SESSION}T06:29:00.000Z`;
const ASOF = `${SESSION}T06:30:00.000Z`;
const quote = (price: number, prevClose: number, tradedAt = TRADED): Quote => ({
  price, prevClose, open: null, dayLow: null, dayHigh: null, low52: null, high52: null,
  marketCap: null, volume: null, yearChangePct: null, ageS: 0, source: "upstox", tradedAt,
  observedAt: ASOF,
});
const feedOf = (quotes: Record<string, Quote>, asOf = ASOF): QuoteFeed => ({
  quotes, asOf, missing: [], pending: [], fresh: Object.keys(quotes).length, stale: 0,
});

/** The symbols this card asks about, derived WITHOUT the model under test. */
function scopeOf(positions: Position[], data: FundDisclosureData) {
  const held = currentHoldings(positions);
  const bucket = (p: Position) => holdingBucket(p, engagementOf(accts, p));
  const mandate = held.filter((p) => bucket(p) === MANDATE_BUCKET);
  const aif = held.filter((p) => bucket(p) === "AIF");
  const own = new Map<string, string>();
  for (const p of mandate) { const s = symbolFor(p); if (s && !own.has(p.securityKey)) own.set(p.securityKey, s); }
  const symbolOf = (k: string) => own.get(k) ?? symbolForKey(k);
  const disclosing = data.funds.filter((f) => aif.some((p) => f.fundKeys.includes(p.securityKey)));
  const lineKeys = new Set(disclosing.flatMap((f) => f.lines.map((l) => l.securityKey)));
  const marks = new Map<string, number>();
  for (const p of positions) {
    if (p.currentPrice != null && p.currentPrice > 0 && !marks.has(p.securityKey)) marks.set(p.securityKey, p.currentPrice);
  }
  return { held, mandate, aif, disclosing, lineKeys, symbolOf, marks,
    symbols: [...new Set([...mandate.map((p) => symbolFor(p)), ...[...lineKeys].map(symbolOf)]
      .filter((s): s is string => Boolean(s)))] };
}

const scope = scopeOf(LIVE_POSITIONS, disclosures);
const quotes: Record<string, Quote> = {};
for (const [key, sym] of [...scope.mandate.map((p) => [p.securityKey, symbolFor(p)] as const),
  ...[...scope.lineKeys].map((k) => [k, scope.symbolOf(k)] as const)]) {
  if (!sym || quotes[sym]) continue;
  const mark = scope.marks.get(key) ?? 100;
  quotes[sym] = quote(mark * FACTOR, mark);
}
const feed = feedOf(quotes);
// `applyQuotes` is what sets `live` and replaces the mark, and `dailyMovers`
// refuses a row that is not live — so a suite that skips it measures a card with
// no mandate half at all. This is `PortfolioContext`'s own composition.
const priced = applyQuotes(LIVE_POSITIONS, feed);
// AND THE SECOND PATH HAS TO BE STRUCK ON THE SET THE MODEL IS HANDED, which is
// `priced` and not the statement book. `applyQuotes` does two things a claim
// about a FIGURE can trip over: it replaces every quoted row's mark, so the
// mandate's own denominator moves with the fixture; and it gives a row whose
// statement printed no mark one, since `priceLooksLikeSameSecurity(live, null)`
// is the standing vacuous pass — which is exactly the set `vacuous` counts. The
// quote feed above is built from the STATEMENT marks, because that is what a
// fixture has to start from; every claim about a rupee figure or a mark below
// reads `live`.
const live = scopeOf(priced, disclosures);
const noActions: ActionFeed | null = null;
const inside = insideMovers({ positions: priced, accounts: BOOK_ACCOUNTS, quotes: feed,
  returns: new Map(), actions: noActions, disclosures });

console.log(`\n${inside.rows.length} rows · session ${inside.session} · ${inside.scopeSymbols.length} symbols`);
console.log(`  mandate ${inside.mandate.positions} positions · ${inside.mandate.names} names · ${cr(inside.mandate.value)} · ${inside.mandate.priced} priced ${cr(inside.mandate.pricedValue)}`);
console.log(`  funds   ${inside.fund.funds} folios · ${cr(inside.fund.value)} · ${inside.fund.disclosing.length} disclosing · derived ${cr(inside.fund.derivedValue)} · verified ${inside.fund.verified} vacuous ${inside.fund.vacuous}`);

// ── THE LOAD-BEARING GATE ───────────────────────────────────────────────────
// A suite that passes over no input claims confidence nobody earned.
ok("the card draws rows", inside.rows.length > 0, `${inside.rows.length}`);
ok("the mandate half has shares to rank", inside.mandate.priced > 0, `${inside.mandate.priced} of ${inside.mandate.names} names`);
ok("a fund discloses something this book can join", inside.fund.disclosing.length > 0,
  inside.fund.disclosing.map((f) => `${f.fund} (${f.lines} lines)`).join(", "));
const viaRows = inside.rows.filter((r) => r.via.length > 0);
ok("some row carries a disclosed half", viaRows.length > 0, `${viaRows.length} rows`);
ok("some row carries BOTH halves", viaRows.some((r) => r.mandateValue != null),
  `${viaRows.filter((r) => r.mandateValue != null).length} rows`);
ok("some row is the disclosed half alone", viaRows.some((r) => r.mandateValue == null),
  viaRows.filter((r) => r.mandateValue == null).map((r) => r.security).join(", ") || "none");

// ── 1. A WRAPPER IS NEVER A ROW ─────────────────────────────────────────────
// The family's own sentence, as a claim. Asserted from both ends: no AIF folio
// the book holds, and no fund key the disclosure names.
const aifKeys = new Set(scope.aif.map((p) => p.securityKey));
const wrapperKeys = new Set([...aifKeys, ...disclosures.funds.flatMap((f) => f.fundKeys)]);
ok("there are wrappers to exclude", wrapperKeys.size > 0, `${wrapperKeys.size} keys`);
ok("no AIF folio or disclosing fund is a row",
  inside.rows.every((r) => !wrapperKeys.has(r.securityKey)),
  inside.rows.filter((r) => wrapperKeys.has(r.securityKey)).map((r) => r.security).join(", ") || "none");
// A PMS mandate is an ACCOUNT, not a security, so it cannot be a row by
// construction — but every row must be a share the mandate reports or a line a
// fund disclosed, and nothing else.
const inScopeKeys = new Set([...scope.mandate.map((p) => p.securityKey), ...scope.lineKeys]);
ok("every row is a company one of the two halves names",
  inside.rows.every((r) => inScopeKeys.has(r.securityKey)));

// ── 2. THE TWO HALVES ARE NEVER ADDED ───────────────────────────────────────
const sumFundValue = inside.rows.reduce((a, r) => a + (r.fundValue ?? 0), 0);
near("the derived total is the rows' own derived halves", inside.fund.derivedValue, sumFundValue, 1e-6);
// LOAD-BEARING: if the two figures coincided, every claim here would be
// trivially satisfied and a card that added them would pass.
ok("the measured and derived halves are different figures",
  Math.abs(inside.mandate.pricedValue - inside.fund.derivedValue) > 1e7,
  `${cr(inside.mandate.pricedValue)} vs ${cr(inside.fund.derivedValue)}`);
ok("no row's mandate value is its derived value",
  inside.rows.every((r) => r.mandateValue == null || r.fundValue == null
    || Math.abs(r.mandateValue - r.fundValue) > 1e-6));
// A DERIVED HALF CARRIES NO RUPEE DAY IMPACT. The fund's units are not marked
// at the underlying's live prices, so a fund-only row has no impact at all.
ok("a row with no mandate half carries no rupee day impact",
  inside.rows.every((r) => r.mandateValue != null || r.mandateDayChange == null),
  inside.rows.filter((r) => r.mandateValue == null && r.mandateDayChange != null).map((r) => r.security).join(", ") || "none");

// ── 3. THE DERIVED VALUE IS `familyValue`, RECOMPUTED ON A SECOND PATH ──────
// The units the family holds of the disclosing fund, times the weight the fund
// printed — read from the committed model and the book directly, never through
// the model under test.
let expected = 0;
for (const f of disclosures.funds) {
  const units = scope.held.filter((p) => f.fundKeys.includes(p.securityKey))
    .reduce((a, p) => a + p.marketValue, 0);
  if (!(units > 0)) continue;
  for (const l of f.lines) {
    const row = inside.rows.find((r) => r.securityKey === l.securityKey);
    if (!row || !row.via.some((v) => v.fund === f.fund)) continue;
    if (l.pctNetAssets == null || !(l.pctNetAssets > 0)) continue;
    expected += familyValue(units, l.pctNetAssets);
  }
}
near("the derived total is familyValue over the fund's own units", inside.fund.derivedValue, expected, 1);

// ── 4. A WEIGHT THAT ROUNDS TO NOTHING WITHHOLDS THE FIGURE, WITH ITS REASON ─
// The fund prints two decimals, so 0.00% is "below the printing precision"
// rather than "none of it" — a row that printed ₹0 there would state an exposure
// nobody measured. The row still stands on the move, which is measured either way.
const zeroWeight = disclosures.funds.flatMap((f) => f.lines.filter((l) => l.pctNetAssets != null && !(l.pctNetAssets > 0))
  .map((l) => ({ fund: f.fund, line: l })));
const noWeight = disclosures.funds.flatMap((f) => f.lines.filter((l) => l.pctNetAssets == null)
  .map((l) => ({ fund: f.fund, line: l })));
console.log(`  disclosure: ${zeroWeight.length} zero-weight lines, ${noWeight.length} with no weight printed`);
for (const { fund, line } of [...zeroWeight, ...noWeight]) {
  const row = inside.rows.find((r) => r.securityKey === line.securityKey);
  const unp = inside.fund.unpriced.find((u) => u.security.toLowerCase().includes(line.security.toLowerCase().slice(0, 12)));
  if (!row) { ok(`a weightless line no quote reached is named (${line.security})`, !!unp, unp?.reason ?? "not named"); continue; }
  ok(`a weightless line withholds its derived figure (${line.security})`,
    row.fundValue == null && !!row.fundValueWhy && row.fundValueWhy.includes(fund),
    `fundValue=${row.fundValue} why=${row.fundValueWhy}`);
}

// ── 5. `vacuous` COUNTS THE IDENTITY CHECKS PASSED FOR WANT OF A MARK ───────
// `priceLooksLikeSameSecurity(live, null)` is true — the standing convention —
// so a company only a fund disclosed is passed because this book carries no
// mark for it, not because the quote was checked. That must be counted and
// stated, never left to be assumed.
near("every priced disclosed line is counted verified or vacuous",
  inside.fund.verified + inside.fund.vacuous, viaRows.length, 0);
ok("the vacuous count is exactly the rows this book carries no mark for",
  inside.fund.vacuous === viaRows.filter((r) => !live.marks.has(r.securityKey)).length,
  `${inside.fund.vacuous} vacuous · ${viaRows.filter((r) => !live.marks.has(r.securityKey)).map((r) => r.security).join(", ") || "none unmarked"}`);
ok("the identity check does bite on this book", inside.fund.verified > 0, `${inside.fund.verified} verified`);

// ── 6. THE AIF SCOPE IS THE ALLOCATION ROW'S ────────────────────────────────
// So the coverage this card states can be checked against the figure Morning
// CIO prints two cards up. An AIF the review carries AT COST is in its own
// bucket, has no mark to be a share of, and is not in this denominator.
near("the fund denominator is the AIF allocation row's own value",
  inside.fund.value, scope.aif.reduce((a, p) => a + p.marketValue, 0), 1);
near("the fund count is the AIF folios the book holds",
  inside.fund.funds, new Set(scope.aif.map((p) => p.securityKey)).size, 0);
const atCost = scope.held.filter((p) => holdingBucket(p, engagementOf(accts, p)) === AT_COST_BUCKET);
ok("an at-cost private holding is in neither half", atCost.length > 0
  && atCost.every((p) => !aifKeys.has(p.securityKey)), `${atCost.length} at-cost rows`);
near("the mandate denominator is the PMS allocation row's own value",
  inside.mandate.value, live.mandate.reduce((a, p) => a + p.marketValue, 0), 1);

// ── 7. COVERAGE IS A SHARE OF SOMETHING, AND THE REST IS NAMED ──────────────
ok("the mandate's priced value is a share of its own scope",
  inside.mandate.pricedValue <= inside.mandate.value + 1,
  `${cr(inside.mandate.pricedValue)} of ${cr(inside.mandate.value)}`);
near("the priced and unpriced names account for the whole mandate half",
  inside.mandate.priced + new Set(inside.mandate.unpriced.map((u) => u.security)).size,
  inside.mandate.names, 0);
ok("every disclosed line not drawn is named with the gate's own reason",
  inside.fund.unpriced.every((u) => u.reason.trim().length > 0),
  `${inside.fund.unpriced.length} named`);
const silentKeys = new Set(inside.fund.silent.map((s) => s.fund));
near("every AIF folio either discloses or is named silent",
  inside.fund.disclosing.length + silentKeys.size,
  new Set(scope.aif.map((p) => p.securityKey)).size, 0);

// ── 8. `scopeSymbols` IS THE UNION OF BOTH HALVES, DEDUPLICATED ─────────────
// `/api/quotes` prices a bounded slice per request, so a ranking struck before
// the last of them lands is a ranking over a subset (Stage 10an). The card holds
// on this set and nothing wider.
ok("the scope is the union of both halves, computed a second way",
  inside.scopeSymbols.length === scope.symbols.length
  && scope.symbols.every((s) => inside.scopeSymbols.includes(s)),
  `${inside.scopeSymbols.length} symbols`);
ok("no symbol is waited on twice", new Set(inside.scopeSymbols).size === inside.scopeSymbols.length);

// ── 9. EVERY ROW'S PERCENTAGE IS THE EXCHANGE'S OWN FIGURE ──────────────────
// The same number for both halves of a row, which is the whole reason one row
// can carry a measured and a derived figure without mixing a measurement.
ok("every drawn percentage is its own quote's, recomputed", inside.rows.every((r) => {
  const q = feed.quotes[scope.symbolOf(r.securityKey) ?? ""];
  return !!q && Math.abs((q.price / q.prevClose! - 1) * 100 - r.dayChangePct) < 1e-9;
}));
near("the fixture's one factor is the move on every row", inside.rows[0].dayChangePct, (FACTOR - 1) * 100, 1e-9);

// ── 10. THE RING-FENCE REACHES A DISCLOSED LINE ─────────────────────────────
// Measured rather than reasoned: the key bridges every spelling this corpus
// prints, which is what makes keying on it alone safe where a disclosure prints
// no identifier at all.
ok("the book fences something", BOOK_POLYCAB.length > 0, `${BOOK_POLYCAB.length} rows`);
const fence = new Set(BOOK_POLYCAB.map((p) => p.securityKey));
for (const spelling of ["POLYCAB INDIA LTD", "Polycab India Ltd.", "POLYCAB INDIA LIMITED - EQ", "POLYCAB INDIA LIMITED"]) {
  ok(`the fenced key bridges "${spelling}"`, fence.has(securityKeyOf(spelling)), securityKeyOf(spelling));
}
const doc = (lines: { security: string; pct: number | null }[]): ArchiveDoc => ({
  docKey: "test-fund-2026-08-31-portfolio-snap", provider: "Test Fund", accountNo: "1",
  owner: "Ajay Jaisinghani", ownerId: "ajay", asOf: "2026-08-31", reportType: "portfolio-snap",
  sourcePath: "test.pdf", pages: 1, sections: [], status: "parsed", periodFrom: null, periodTo: null,
  holdings: [{ security: "Test Fund Class A", securityKey: "test-fund-class-a", assetClass: "AIF",
    quantity: 100, costBasis: 1000, marketValue: 2000 }],
  schemeHoldings: lines.map((l) => ({ security: l.security, isin: null, industry: null,
    quantity: null, marketValue: null, pctNetAssets: l.pct })),
} as unknown as ArchiveDoc);
const fencedDoc = doc([{ security: "ICICI BANK LTD", pct: 8 }, { security: "POLYCAB INDIA LTD", pct: 5 }]);
const unfenced = deriveFundDisclosures([fencedDoc]);
const fenced = deriveFundDisclosures([fencedDoc], fence);
ok("without the fence a disclosed line names the promoter block",
  unfenced.funds[0].lines.some((l) => fence.has(l.securityKey)), `${unfenced.funds[0].lines.length} lines`);
ok("with the fence it is dropped",
  fenced.funds[0].lines.length === 1 && !fenced.funds[0].lines.some((l) => fence.has(l.securityKey)),
  `${fenced.funds[0].lines.length} line`);
// A coverage figure that still counted the fenced weight would name it in a
// number. 8 of 13 points, not 13.
near("the fenced weight is out of the coverage figure too", fenced.funds[0].pctCovered, 8, 1e-9);
near("…and in it without the fence", unfenced.funds[0].pctCovered, 13, 1e-9);
// AND THE COMMITTED MODEL CARRIES NO FENCED LINE. On this book nothing is
// fenced out, so the fence moves nothing — which is why the constructed case
// above is the only thing that can prove it works.
ok("the committed disclosure model names no fenced company",
  !disclosures.funds.some((f) => f.lines.some((l) => fence.has(l.securityKey))));

// ── 11. A COMPANY THE MANDATE HALF REFUSES IS REFUSED ON THE DISCLOSED HALF ─
// The percentage is the same quote's, so it is as suspect either way. This book
// has no such company today, so it is constructed.
const mandateAcct = BOOK_ACCOUNTS.find((a) => scope.mandate.some((p) => p.accountId === a.accountId))!;
const shared = viaRows.find((r) => r.mandateValue != null)!;
const sharedSymbol = scope.symbolOf(shared.securityKey)!;
{
  // A quote a hundred times the book's mark for the same company: the identity
  // check refuses it (`priceLooksLikeSameSecurity`), and `dailyMovers` omits the
  // mandate row. The disclosed line of that company must go with it.
  const mark = scope.marks.get(shared.securityKey)!;
  const bad = feedOf({ ...quotes, [sharedSymbol]: quote(mark * 100, mark) });
  const out = insideMovers({ positions: applyQuotes(LIVE_POSITIONS, bad), accounts: BOOK_ACCOUNTS,
    quotes: bad, returns: new Map(), actions: null, disclosures });
  ok("a company whose quote fails identity is refused on both halves",
    !out.rows.some((r) => r.securityKey === shared.securityKey) && out.omitted.has(shared.securityKey),
    out.omitted.get(shared.securityKey) ?? "drawn anyway");
  ok("…and is named among the disclosed lines no quote reached",
    out.fund.unpriced.some((u) => u.reason.includes("identity")),
    out.fund.unpriced.find((u) => u.reason.includes("identity"))?.security ?? "not named");
}

// ── 12. THE SESSION IS RESOLVED OVER BOTH HALVES ────────────────────────────
// Struck over the mandate half alone, a disclosed company trading in a NEWER
// session than every mandate row would be refused "older or invalid session" —
// so the one row a reader came for would vanish while the card still reconciled
// with itself. Constructed, because this book's fixture puts every symbol in
// one session.
{
  const fundOnly = viaRows.find((r) => r.mandateValue == null);
  const target = fundOnly ?? shared;
  const sym = scope.symbolOf(target.securityKey)!;
  const older = `2026-10-06T06:29:00.000Z`;
  const mixed: Record<string, Quote> = {};
  for (const [s, q] of Object.entries(quotes)) mixed[s] = s === sym ? q : quote(q.price, q.prevClose!, older);
  const mf = feedOf(mixed);
  const out = insideMovers({ positions: applyQuotes(LIVE_POSITIONS, mf), accounts: BOOK_ACCOUNTS,
    quotes: mf, returns: new Map(), actions: null, disclosures });
  ok("the session is the newest either half traded in", out.session === SESSION, String(out.session));
  ok("a disclosed company in the newest session is drawn",
    out.rows.some((r) => r.securityKey === target.securityKey),
    out.omitted.get(target.securityKey) ?? "drawn");
  // The honest consequence: the mandate rows are now on an older session and are
  // refused. A card that resolved the session per half would draw both, which is
  // two measurements under one heading.
  ok("…and the rows on the older session are refused, not quietly mixed",
    out.rows.length < inside.rows.length, `${out.rows.length} rows of ${inside.rows.length}`);
}

// ── 13. A CORPORATE ACTION ON THE EX-DATE REFUSES THE DISCLOSED LINE TOO ────
// An exchange close may still be on the pre-split basis on the ex-date, which is
// a fact about the SECURITY and the day rather than about an account — so it is
// read off the feed by identifier, never from a per-account plan a disclosed
// company has none of.
{
  const actions = {
    version: 1, capturedAt: ASOF, requestedFrom: SESSION, requestedTo: SESSION,
    verifiedThrough: SESSION, symbols: null, isins: [], rowCount: 1,
    rows: [{ id: "split-1", ticker: sharedSymbol, isin: null, source: "test",
      company: shared.security, type: "split", purpose: "Stock split", exDate: SESSION,
      recordDate: null, factor: 2, cashPerShare: null, issue: null }],
  } as unknown as ActionFeed;
  const out = insideMovers({ positions: priced, accounts: BOOK_ACCOUNTS, quotes: feed,
    returns: new Map(), actions, disclosures });
  const refused = !out.rows.some((r) => r.securityKey === shared.securityKey);
  ok("a split on the ex-date refuses the company", refused,
    out.omitted.get(shared.securityKey) ?? "drawn anyway");
  ok("…with the basis named rather than a bare absence",
    (out.omitted.get(shared.securityKey) ?? "").includes("previous-close basis"),
    out.omitted.get(shared.securityKey) ?? "");
}

// ── 14. THE DISCLOSED HALF IS NOT THE LOOK-THROUGH STORE (Stage 10df) ───────
// Folding an AIF's weights into `public/lookthrough/` would change the partition
// every stock-axis figure rests on. So the AIF this card reads must be absent
// from that store, and the card's own derived figure must be in no book total.
{
  const store = JSON.parse(readFileSync(path.join(ROOT, "public/lookthrough/index.json"), "utf8"));
  const schemes = Object.keys(store.schemes ?? {});
  const disclosingKeys = inside.fund.disclosing.flatMap((d) =>
    disclosures.funds.find((f) => f.fund === d.fund)?.fundKeys ?? []);
  ok("the disclosing AIF folio is in no look-through scheme",
    disclosingKeys.length > 0 && disclosingKeys.every((k) => !schemes.includes(k)),
    `${disclosingKeys.length} folio keys, ${schemes.length} schemes`);
}

console.log(`\n${fails === 0 ? "PASS" : `FAIL — ${fails}`}`);
process.exit(fails === 0 ? 0 : 1);
