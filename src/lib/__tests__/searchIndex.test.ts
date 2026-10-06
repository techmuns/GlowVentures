// THE TOP BAR'S SEARCH — EVERY THING A READER CAN TYPE, CHECKED AGAINST THE BOOK.
//   npm run test:family
//
//   "this whole thing needs to be a very smart search bar which takes me to
//    exactly where i want to go … any equity, any fund, any position that I
//    have taken, any tab, etc."
//
// The failures worth catching are the ones a reader would only find by typing
// the one thing that does not work:
//
//   • an identifier (ISIN, symbol, account number) that does not land on its
//     own holding first — checked for EVERY identifier the book carries, not a
//     sample, because the one that fails is always the one nobody typed;
//   • a member, a page or a mandate that a better-named row outranks;
//   • the ring-fenced promoter holding reachable as anything but its page;
//   • a destination that resolves to nothing, or a detail line carrying a
//     missing field.
//
// Every expectation is derived from `glowData.ts` on the run.
import { recordedLines } from "../recordedHoldings";
import { BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_POLYCAB, BOOK_CAPITAL_MOVES, BOOK_SHARE_MOVEMENTS, BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
import { currentHoldings, dedupedPositions, negligibleKeys, isMandateHeld, isRedeemedToNil, isCashEquivalent, sum } from "@/lib/analytics";
import { accountIndex } from "@/lib/accounts";
import { groupKeyFor, groupLabelFor } from "@/lib/groupAxis";
import { applyFundNavs, depositoryFundHoldings, partialValuationNotes, unpricedStatementUnits, withPartialValuation } from "@/lib/fundNavs";
import { depositoryShareHoldings, shareCandidates } from "@/lib/depositoryShares";
import { applyCorporateActionQuotes } from "@/lib/corporateActions";
import { applyQuotes } from "@/lib/quotes";
import { parseDrilldown } from "@/lib/drilldown";
import { NAV } from "@/lib/nav";
import { buildSearchIndex, fencedIdentityOf, searchEntries, scoreText, looksLikeQuestion, normSearch } from "@/lib/searchIndex";
import { labelledAccounts, labelledPositions, labelVariants, securityLabel } from "@/lib/securityLabel";
import { REVIEW_GAPS } from "@/data/reviewGaps";
import { BOOK_FUND_NAVS } from "@/data/fundNavs";
import SCHEME_NAMES from "@/data/schemeNames.json";
import { securityKeyOf } from "@/lib/securityKey";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}`);
};
const money = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;
/**
 * THE BOOK AS THE PAGE NAMES IT. `SmartSearch` builds this list from
 * `PortfolioContext`, which names every holding once (`labelledPositions`) and
 * cases every strategy (`labelledAccounts`). Built from the raw statements
 * instead, this suite checked a list the page does not draw — a company under
 * whichever spelling its first row printed, a mandate in its manager's
 * capitals — which is the gap `stockExposure.test.ts` was found to have with
 * its fund list. One step, shared, so the two cannot diverge.
 */
const positions = labelledPositions(BOOK_POSITIONS);
const consolidated = dedupedPositions(positions);
const accounts = labelledAccounts(BOOK_ACCOUNTS);
const index = buildSearchIndex({
  positions, consolidated, accounts, money, recorded: BOOK_UNVALUED_HOLDINGS,
  capitalMoves: BOOK_CAPITAL_MOVES, fenced: fencedIdentityOf(BOOK_POLYCAB),
});
/**
 * AND THE INDEX THE TOP BAR ACTUALLY BUILDS ON THE LIVE BOOK — assembled as
 * `PortfolioContext` assembles it: the labelled rows through the
 * corporate-action layer; the funds a depository reports on a transaction-only
 * demat (Stage 10ce cash, 10cy the rest) and the fund units a holding statement
 * records and values nowhere (A-17, Stage 10cz) through the quote overlay; the
 * listed shares a statement records, which are rows only while a feed prices
 * them (none here, with no feed); AMFI's published NAVs over all of them; and
 * the registry with its partial-valuation notes. What a row says about its
 * figure's basis and date (SC-C2, SC-C3) is only testable on the figures the
 * screen shows.
 */
const LIVE_ONLY_FUNDS = [...depositoryFundHoldings(), ...unpricedStatementUnits()];
const SHARES = depositoryShareHoldings(null, null, undefined, accounts);
const screenPositions = applyFundNavs([
  ...applyCorporateActionQuotes(positions, accounts, null, null).positions, ...applyQuotes([...LIVE_ONLY_FUNDS], null), ...SHARES]);
const screenAccounts = withPartialValuation(accounts,
  partialValuationNotes([...LIVE_ONLY_FUNDS, ...SHARES], BOOK_SHARE_MOVEMENTS, BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS, shareCandidates()));
const screenIndex = buildSearchIndex({
  positions: screenPositions, consolidated: dedupedPositions(screenPositions), accounts: screenAccounts, money,
  recorded: BOOK_UNVALUED_HOLDINGS, capitalMoves: BOOK_CAPITAL_MOVES, fenced: fencedIdentityOf(BOOK_POLYCAB),
});
const top = (q: string) => searchEntries(index, q, 10)[0]?.entry;
const topN = (q: string, n: number) => searchEntries(index, q, 10).slice(0, n).map((h) => h.entry);

console.log("── every holding is findable, once ──");
{
  const small = negligibleKeys(BOOK_POSITIONS);
  const FUNDS = new Set(["AIF", "Mutual Fund", "ETF"]);
  const rowsOf = (k: string) => consolidated.filter((p) => p.securityKey === k);
  const isClosed = (k: string) => rowsOf(k).every((p) => isRedeemedToNil(p));
  // A BALANCE LINE — a measured ₹0 that is no redemption and no fund (SC-D3):
  // re-expressed here, never read off the builder.
  const balanceLine = (k: string) => !isClosed(k) && sum(rowsOf(k).map((p) => p.marketValue)) === 0
    && rowsOf(k).every((p) => !FUNDS.has(p.assetClass));
  const keys = new Set(consolidated.filter((p) => !small.has(p.securityKey)).map((p) => p.securityKey));
  const offered = [...keys].filter((k) => !balanceLine(k));
  // …and every key a statement records at a quantity with no valued row
  // standing for it (Stage 10cz) — one entry each, never a second one for a
  // key a valued row already carries.
  const recordedKeys = new Set(recordedLines(BOOK_UNVALUED_HOLDINGS)
    .filter((l) => !keys.has(l.homeKey) && !small.has(l.homeKey))
    .map((l) => l.homeKey));
  const holdings = index.filter((e) => e.kind === "holding");
  ok("one holding entry per security above the floor, a ₹0 balance line aside, and per recorded-only security",
    holdings.length === offered.length + recordedKeys.size && holdings.filter((e) => e.recorded).length === recordedKeys.size,
    `${holdings.length} vs ${offered.length} + ${recordedKeys.size}`);
  ok("no holding under the family's ₹1,000 floor is offered", [...small].every((k) => !index.some((e) => e.id === `holding:${k}`)));
  const lines = [...keys].filter(balanceLine);
  ok("…and no ₹0 balance line is offered as a holding, of which this book has some", lines.length > 0
    && lines.every((k) => !index.some((e) => e.id === `holding:${k}`)), lines.join(", "));
  /**
   * A HELD position opens its own page. A REDEEMED one opens the Transactions
   * tab ONLY where the family's dated capital record carries money coming back
   * for its account (SC-C5) — 3P's Full Units Redemption is there, the HDFC
   * folio's schemes print nil units and no dated movement anywhere — and
   * otherwise its own page, and its line says which.
   */
  const outOnRecord = new Set(BOOK_CAPITAL_MOVES.filter((m) => m.direction === "out").map((m) => m.accountId));
  const current = new Set(currentHoldings(consolidated).map((p) => p.securityKey));
  const onRecord = (k: string) => BOOK_POSITIONS.some((p) => p.securityKey === k && outOnRecord.has(p.accountId));
  const wrong = holdings.filter((e) => !e.recorded).filter((e) => {
    const key = e.id.slice("holding:".length);
    if (!isClosed(key)) return e.href !== `/stock/${encodeURIComponent(key)}` || !current.has(key);
    return onRecord(key)
      ? e.href !== "/monitor?show=transactions" || !/on Transactions/.test(e.detail)
      : e.href !== `/stock/${encodeURIComponent(key)}` || /Transactions/.test(e.detail) || !/no statement in this book dates/.test(e.detail);
  });
  ok("every held position opens its holding page; a redeemed one says where its redemption is only where it is", wrong.length === 0,
    wrong.slice(0, 3).map((e) => `${e.label} → ${e.href} · ${e.detail}`).join("; "));
  const closedKeys = [...keys].filter(isClosed);
  ok("…and this book has a redemption on the record AND one with none, so both branches are exercised",
    closedKeys.some(onRecord) && closedKeys.some((k) => !onRecord(k)), closedKeys.join(", "));
}

console.log("── a holding a statement records, and nothing values, is still findable (Stage 10cz) ──");
{
  /**
   * The Motilal CDSL demat's rate and value belong to each holding's LAST
   * DEPOSITORY MOVEMENT, so its rows are quantities in the book, valued on the
   * live basis only while a quote or a published NAV answers. With nothing
   * valuing Kaynes the search found no Kaynes at all. A missing premise is a
   * FAILURE here, never an abstention: an empty set would let every claim
   * below pass by asserting nothing.
   */
  const recordedEntries = index.filter((e) => e.kind === "holding" && e.recorded);
  ok("the book records holdings that nothing values", recordedEntries.length > 0, String(recordedEntries.length));
  const valuedKeys = new Set(positions.map((p) => p.securityKey));
  const twice = recordedEntries.filter((e) => valuedKeys.has(e.id.slice("holding:".length)));
  ok("…and none is offered for a key a valued row already stands for", twice.length === 0, twice.map((e) => e.label).join("; "));
  const figure = recordedEntries.filter((e) => !/^Not valued · /.test(e.detail) || /₹/.test(e.detail));
  ok("every one says it is not valued, and states no figure", figure.length === 0, figure.slice(0, 3).map((e) => e.detail).join("; "));
  const opens = recordedEntries.filter((e) => e.href !== `/stock/${encodeURIComponent(e.id.slice("holding:".length))}`);
  ok("every one opens its own holding page", opens.length === 0, opens.map((e) => e.href).join("; "));
  // A line whose units another account's own statement reports is that
  // account's holding, seen from the custodian's side — never an entry of its own.
  const onlyMirrored = new Set(BOOK_UNVALUED_HOLDINGS.filter((u) => u.sameUnitsReportedBy).map((u) => u.securityKey));
  for (const u of BOOK_UNVALUED_HOLDINGS) if (!u.sameUnitsReportedBy) onlyMirrored.delete(u.securityKey);
  for (const k of valuedKeys) onlyMirrored.delete(k);
  ok("a custodian's copy of units a fund reports is not offered as a holding of its own",
    [...onlyMirrored].every((k) => !index.some((e) => e.id === `holding:${k}`)), [...onlyMirrored].join(", "));
  // THE UNITS ARE THE STATEMENT'S: each entry's count is the sum of its own lines.
  const unitsWrong = recordedEntries.filter((e) => {
    const key = e.id.slice("holding:".length);
    const want = recordedLines(BOOK_UNVALUED_HOLDINGS).filter((l) => l.homeKey === key)
      .reduce((a, l) => a + l.quantity, 0);
    return !e.detail.includes(`${want.toLocaleString("en-IN", { maximumFractionDigits: 3 })} units`);
  });
  ok("every one carries the units its statement lines record", unitsWrong.length === 0, unitsWrong.slice(0, 3).map((e) => `${e.label}: ${e.detail}`).join("; "));

  // ONE COMPANY, ONE RESULT. Two statements spelling one company are one entry,
  // filed under the key the live layer files a priced line under; a fund keeps
  // its own key (the extractor join BOOK-REPORT names is left visible).
  const lines = recordedLines(BOOK_UNVALUED_HOLDINGS);
  const holdingEntries = index.filter((e) => e.kind === "holding");
  const nonFundIsins = [...new Set(lines.filter((l) => l.isin && l.assetClass !== "Mutual Fund" && l.assetClass !== "ETF")
    .map((l) => l.isin!.toUpperCase()))];
  const split = nonFundIsins.filter((i) => holdingEntries.filter((e) => e.codes.some((c) => c.toUpperCase() === i)).length > 1);
  ok("no company a statement records stands as two results", nonFundIsins.length > 0 && split.length === 0,
    split.slice(0, 4).join(", ") || `${nonFundIsins.length} ISINs`);
  // The four this book first split, by the identifier that joins each.
  for (const [what, isin] of [["Clean Max", "INE647U01026"], ["National Stock Exchange", "INE721I01024"],
    ["Everest Fleet preference", "INE0LTR03090"], ["Blue Ashva Varenya", "INF0VGG22429"]] as const) {
    const hits = holdingEntries.filter((e) => e.codes.some((c) => c.toUpperCase() === isin));
    // Since Stage 10dh a statement's line the review's own line supersedes (the
    // Everest Fleet preference shares) is in no table, so it is in no result —
    // and that is only allowed where nothing in the book still carries its ISIN.
    const carried = BOOK_POSITIONS.some((p) => p.isin?.toUpperCase() === isin)
      || lines.some((l) => l.isin?.toUpperCase() === isin);
    ok(`${what} is one result`, hits.length === 1 || (hits.length === 0 && !carried),
      hits.map((e) => e.id).join(", ") || (carried ? "none, though the book carries it" : "none"));
  }
}

console.log("── an identifier lands on its own row, first — every one of them ──");
{
  /**
   * GROUPED BY ISIN, because one ISIN can sit under TWO keys — the eight
   * "one security keyed twice" cases `docs/BOOK-REPORT.md` names (Helios Flexi
   * Cap is one: the AMC folio's full name and the depository's clipped
   * `HELIOS FCF D-GROW`). Those are one security the extractor has not joined,
   * and the search must offer EVERY row of it rather than silently pick one —
   * so an ISIN naming n holdings must bring all n into the first n rows.
   */
  const byIsin = new Map<string, string[]>();
  for (const e of index.filter((x) => x.kind === "holding" && !x.closed)) {
    for (const c of e.codes.filter((x) => /^IN[EF]/.test(x))) byIsin.set(c, [...(byIsin.get(c) ?? []), e.id]);
  }
  ok("the book carries ISIN-bearing holdings to test on", byIsin.size > 0, String(byIsin.size));
  const miss = [...byIsin].filter(([isin, ids]) => {
    const got = topN(isin, ids.length).map((e) => e.id);
    return !ids.every((id) => got.includes(id));
  });
  ok(`every one of the ${byIsin.size} ISINs brings every holding it names to the top`, miss.length === 0,
    miss.slice(0, 3).map(([i]) => `${i} → ${top(i)?.label}`).join("; "));
  // THE GROUPING IS LOAD-BEARING ONLY WHILE THE BOOK HAS SUCH A CASE — so the
  // case is named when it exists, and its absence is said rather than passed.
  const shared = [...byIsin].filter(([, ids]) => ids.length > 1);
  if (shared.length) ok(`…including ${shared.length} ISIN(s) the book carries under two keys, each offering every row`, true, shared.map(([i]) => i).join(", "));
  else console.log("ok   (no ISIN sits under two keys in this drop — the grouping above has no shared case to prove)");
  // A symbol shared by two rows (a fund's unit classes) cannot pick one — so
  // the claim is struck on the symbols that name ONE holding.
  const bySym = new Map<string, string[]>();
  for (const e of index.filter((x) => x.kind === "holding" && !x.closed)) {
    for (const c of e.codes.filter((x) => !/^IN[EF]/.test(x))) bySym.set(c, [...(bySym.get(c) ?? []), e.id]);
  }
  const unique = [...bySym].filter(([, ids]) => ids.length === 1);
  const symMiss = unique.filter(([sym, ids]) => !topN(sym, 2).some((e) => e.id === ids[0]));
  ok(`every one of the ${unique.length} unique NSE symbols finds its holding in the first two`, symMiss.length === 0,
    symMiss.slice(0, 3).map(([s]) => `${s} → ${top(s)?.label}`).join("; "));
  // ACCOUNT NUMBERS: a mandate's opens the mandate, every other account's opens
  // the account row — first, whatever else shares its digits.
  // The review's holder accounts (Stage 10dh) share one account number, "MOPWM":
  // a shared number cannot land on one account first, so it must land on ONE OF
  // its own accounts, and every unique number on its own.
  const sharedNo = (a: (typeof BOOK_ACCOUNTS)[number]) => BOOK_ACCOUNTS.filter((b) => b.accountNo === a.accountNo).length > 1;
  const sharedMiss = BOOK_ACCOUNTS.filter(sharedNo).filter((a) => {
    const id = top(a.accountNo)?.id ?? "";
    return !BOOK_ACCOUNTS.some((b) => b.accountNo === a.accountNo && (id === `account:${b.accountId}` || id === `mandate:${b.accountId}`));
  });
  ok("a shared account number finds one of its own accounts first", sharedMiss.length === 0,
    sharedMiss.slice(0, 3).map((a) => `${a.accountNo} → ${top(a.accountNo)?.label}`).join("; "));
  const acctMiss = BOOK_ACCOUNTS.filter((a) => !sharedNo(a)).filter((a) => {
    const want = isMandateHeld(a.engagement) ? `mandate:${a.accountId}` : `account:${a.accountId}`;
    return top(a.accountNo)?.id !== want;
  });
  ok(`every one of the ${BOOK_ACCOUNTS.filter((a) => !sharedNo(a)).length} unique account numbers finds its own account first`, acctMiss.length === 0,
    acctMiss.slice(0, 3).map((a) => `${a.accountNo} → ${top(a.accountNo)?.label}`).join("; "));
}

console.log("── people, pages and mandates ──");
{
  const owners = [...new Set(BOOK_ACCOUNTS.map((a) => a.owner))];
  const miss = owners.filter((o) => top(o)?.id !== `person:${o}`);
  ok(`every one of the ${owners.length} members and trusts finds their entity first by full name`, miss.length === 0, miss.join(", "));
  ok("a member's page is the family page scoped to them",
    owners.every((o) => index.find((e) => e.id === `person:${o}`)?.href === `/family?entity=${encodeURIComponent(o)}`));
  const pageMiss = NAV.filter((n) => top(n.label)?.href !== n.to);
  ok(`every one of the ${NAV.length} nav pages finds itself first by its own label`, pageMiss.length === 0,
    pageMiss.map((n) => `${n.label} → ${top(n.label)?.label}`).join("; "));
  const mandates = BOOK_ACCOUNTS.filter((a) => isMandateHeld(a.engagement));
  ok("every PMS mandate opens its own mandate page",
    mandates.every((a) => index.find((e) => e.id === `mandate:${a.accountId}`)?.href === `/mandate/${encodeURIComponent(a.accountId)}`));
}

console.log("── the words people use ──");
{
  ok("'transactions' opens the Transactions tab", top("transactions")?.href === "/monitor?show=transactions");
  ok("'compare sectors' opens Sector Composition's Compare tab", top("compare sectors")?.href === "/sectors?view=compare",
    top("compare sectors")?.label);
  ok("'polycab dividend' opens Polycab's corporate actions tab", top("polycab dividend")?.href === "/polycab?view=actions",
    top("polycab dividend")?.label);
  ok("'direct equity' still opens the Direct Equity holdings, not the sector tab",
    top("direct equity")?.kind === "category", `${top("direct equity")?.kind}:${top("direct equity")?.label}`);
  ok("'alerts' opens Morning CIO's All alerts tab", top("alerts")?.href === "/cio?tab=alerts", top("alerts")?.label);
  ok("…and so does 'stop loss', the word the alert boxes use", top("stop loss")?.href === "/cio?tab=alerts", top("stop loss")?.label);
  ok("'uncalled' opens the Private Market page", top("uncalled")?.href === "/private-market");
  ok("'dry powder' reaches uncalled capital", top("dry powder")?.id === "fig:uncalled");
  ok("'tax' opens Capital Gains", top("tax")?.href === "/capital-gains");
  ok("'banks' finds the Financials sector first", top("banks")?.id === "sector:Financials", top("banks")?.label);
  ok("'xirr' finds the money-weighted return", topN("xirr", 2).some((e) => e.id === "fig:xirr"));
  // THE LARGEST HOLDING BY ITS FIRST WORD, and by a ONE-EDIT typo of it.
  const largest = index.filter((e) => e.kind === "holding" && !e.closed).sort((a, b) => b.weight - a.weight)[0];
  const word = normSearch(largest.label).split(" ").find((w) => w.length >= 6 && /^[a-z]+$/.test(w))!;
  ok("the largest holding carries a word to test on", !!word, largest.label);
  ok(`its first long word ("${word}") finds it first`, top(word)?.id === largest.id, top(word)?.label);
  const typo = word[0] + word[2] + word[1] + word.slice(3);
  ok(`…and so does a transposition ("${typo}")`, topN(typo, 3).some((e) => e.id === largest.id), topN(typo, 3).map((e) => e.label).join(" | "));
}

console.log("── a review's spelling of a held scheme finds the scheme (SC-B4) ──");
{
  /**
   * The family's review spells a fund with its plan and option bolted on, and
   * the note under an empty result must not be the answer for a fund the book
   * holds — so the SEARCH must find it. Re-expressed here: the scheme's
   * published names (AMFI's, joined on the book's ISIN), the plan/option words
   * and the review's `SL` / `Pru`, written out again rather than imported.
   */
  type SchemeRec = { name: string; amfiName: string };
  const schemes = SCHEME_NAMES as Record<string, SchemeRec>;
  const TAIL = /\b(direct|regular|plan|growth|gr|grw|grow|g|d|dp|option|dd|idcw|dividend|reinvestment|reinvest|payout|daily|weekly|monthly|quarterly|bonus)\b/g;
  const stem = (n: string) => n.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsl\b/g, "sun life").replace(/\bpru\b/g, "prudential")
    .replace(TAIL, " ").replace(/\s+/g, " ").trim();
  const flat = (k: string) => k.replace(/-/g, "");
  const relK = (a: string, b: string) => b.startsWith(a) || a.startsWith(b) || flat(b).startsWith(flat(a)) || flat(a).startsWith(flat(b));
  const bookKeys = [...new Set(BOOK_POSITIONS.map((p) => securityKeyOf(p.security)))].filter(Boolean);
  const heldBy = new Map<string, Set<string>>();
  for (const p of BOOK_POSITIONS) {
    const names = [schemes[p.securityKey]?.name, schemes[p.securityKey]?.amfiName,
      BOOK_FUND_NAVS.find((e) => e.securityKey === p.securityKey)?.scheme].filter((x): x is string => !!x);
    for (const n of names) {
      const k = securityKeyOf(stem(n));
      if (k) heldBy.set(k, (heldBy.get(k) ?? new Set()).add(p.securityKey));
    }
  }
  const cases = REVIEW_GAPS.flatMap((g) => {
    const raw = securityKeyOf(g.name);
    if (!raw || bookKeys.some((bk) => relK(raw, bk))) return [];
    const k = securityKeyOf(stem(g.name));
    const keys = new Set([...heldBy.entries()].filter(([hk]) => !!k && relK(k, hk)).flatMap(([, v]) => [...v]));
    return keys.size ? [{ name: g.name, keys }] : [];
  });
  ok("this book carries review lines naming a scheme it holds — the cases exist", cases.length > 0, String(cases.length));
  const wrong = cases.filter((c) => {
    const h = searchEntries(index, c.name, 10)[0]?.entry;
    return !h || h.kind !== "holding" || ![...c.keys].some((k) => h.id === `holding:${k}`);
  });
  ok("every one is found, first, as the holding the book reports", wrong.length === 0,
    wrong.map((c) => `${c.name} → ${searchEntries(index, c.name, 10)[0]?.entry.label ?? "nothing"}`).join("; "));
  // LOAD-BEARING: at least one of them is found by NOTHING but the stem — its
  // entry's names and words score zero against the review's spelling — so the
  // check above is not passing on the ordinary tiers alone.
  const stemOnly = cases.filter((c) => {
    const e = index.find((x) => [...c.keys].some((k) => x.id === `holding:${k}`));
    return !!e && [...e.names, ...e.keywords].every((n) => scoreText(c.name, n).score === 0);
  });
  ok("…and some are found by the scheme's published name alone, which the hover says", stemOnly.length > 0
    && stemOnly.every((c) => /plan and option set aside/.test(searchEntries(index, c.name, 10)[0]?.matched ?? "")),
    `${stemOnly.length}: ${stemOnly.slice(0, 3).map((c) => c.name).join("; ")}`);
  ok("…and a query the stem reduces to one word is not widened by it — 'direct equity' is still the category",
    top("direct equity")?.kind === "category");
}

console.log("── what a row says about its figure is true of the figure (SC-C2…C7, SC-D1…D3) ──");
{
  const idx = accountIndex(BOOK_ACCOUNTS);
  const label = groupLabelFor("category");
  // SC-C4 — a holding filed under two categories names both, largest first.
  const sc = dedupedPositions(screenPositions);
  const byKey = new Map<string, typeof sc>();
  for (const p of sc) byKey.set(p.securityKey, [...(byKey.get(p.securityKey) ?? []), p]);
  const multi = [...byKey].filter(([, rows]) => new Set(rows.map((p) => groupKeyFor("category", idx, p))).size > 1);
  const catWrong = multi.filter(([k, rows]) => {
    const by = new Map<string, number>();
    for (const p of rows) { const g = groupKeyFor("category", idx, p); by.set(g, (by.get(g) ?? 0) + Math.abs(p.marketValue)); }
    const held = [...by].filter(([, v]) => v > 0);
    const want = (held.length ? held : [...by]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([g]) => label(g)).join(" + ");
    const e = screenIndex.find((x) => x.id === `holding:${k}`);
    return !e || !e.detail.startsWith(`${want} · `);
  }).map(([k]) => k);
  ok("a holding filed under two categories names each that holds some of it, largest first — never whichever row sorts first",
    multi.length > 0 && catWrong.length === 0, `${multi.length} such: ${catWrong.join(", ") || multi.map(([k]) => k).join(", ")}`);
  // …and a category a holding's rows are filed under but that holds NONE of its
  // value is not named — the book's "Cash" line was PMS cash sleeves plus two
  // nil Buoyant lines filed under Cash, and "PMS mandates + Cash" said the Cash
  // category held some of the ₹9.51 Cr.
  const zeroCatsOf = (byK: Map<string, typeof sc>) => [...byK].flatMap(([k, rows]) => {
    const by = new Map<string, number>();
    for (const p of rows) { const g = groupKeyFor("category", idx, p); by.set(g, (by.get(g) ?? 0) + Math.abs(p.marketValue)); }
    const pos = [...by].filter(([, v]) => v > 0);
    return pos.length ? [...by].filter(([, v]) => v === 0).map(([g]) => ({ k, g: label(g) })) : [];
  });
  const namedIn = (ix: typeof screenIndex, k: string) =>
    (ix.find((e) => e.id === `holding:${k}`)?.detail ?? "").split(" · ")[0].split(" + ");
  const zeroCats = zeroCatsOf(byKey);
  /**
   * THE BOOK'S OWN CASE LEFT WITH THE SEPTEMBER 2026 DELIVERY: Buoyant's 31 Aug
   * portfolio snaps supersede the 31 Jul appraisals and print no nil cash
   * sleeve, so no holding on this book is filed under a category that holds
   * none of its value. The claim abstains with that evidence — and the
   * constructed case below puts Buoyant's old line back and holds the rule as a
   * hard failure, so the abstention never stands alone.
   */
  if (zeroCats.length === 0) {
    console.log(`NOT CHECKED …and a category holding none of the value is not named, on this book — no holding is filed under a category that holds none of its value (${byKey.size} holdings searched); the constructed case below holds it`);
  } else {
    const zeroNamed = zeroCats.filter(({ k, g }) => namedIn(screenIndex, k).includes(g));
    ok("…and a category holding none of the value is not named", zeroNamed.length === 0,
      `${zeroCats.length} such: ${zeroNamed.map((x) => `${x.k}→${x.g}`).join(", ") || zeroCats.map((x) => `${x.k}/${x.g}`).join(", ")}`);
  }
  {
    // Constructed: the book's own cash sleeves (every one in a PMS mandate)
    // beside a NIL Cash line in a fund folio — the shape the Buoyant folios
    // carried until their snaps superseded it. Built through the index the
    // page builds, so the row's own detail line is what is read.
    const sleeves = positions.filter((p) => p.securityKey === "cash" && p.marketValue !== 0);
    const folio = BOOK_ACCOUNTS.find((a) => !isMandateHeld(a.engagement) && a.engagement === "AIF");
    const nil = sleeves[0] && folio
      ? { ...sleeves[0], accountId: folio.accountId, marketValue: 0, quantity: 0, costBasis: 0, unrealizedPnL: 0, dedupeGroup: undefined, alsoReportedUnder: undefined } as (typeof positions)[number]
      : null;
    const withNil = nil ? [...positions, nil] : positions;
    const nilIndex = buildSearchIndex({
      positions: withNil, consolidated: dedupedPositions(withNil), accounts, money, recorded: BOOK_UNVALUED_HOLDINGS,
      capitalMoves: BOOK_CAPITAL_MOVES, fenced: fencedIdentityOf(BOOK_POLYCAB),
    });
    const ccByKey = new Map<string, typeof sc>([["cash", dedupedPositions(withNil).filter((p) => p.securityKey === "cash")]]);
    const ccZero = zeroCatsOf(ccByKey);
    // LOAD-BEARING: the nil line really is filed under a category of its own,
    // and that category really holds none of the value — or the case below
    // would pass whatever the index did.
    ok("constructed: a nil Cash line in a fund folio beside the PMS cash sleeves is filed under a category holding none of the value",
      !!nil && sleeves.length > 0 && ccZero.length === 1 && ccZero[0].g === label("Cash"),
      `${sleeves.length} sleeve(s) · ${ccZero.map((x) => x.g).join(", ") || "none"}`);
    ok("constructed: …and the row names only the category that holds the money",
      ccZero.length === 1 && !namedIn(nilIndex, "cash").includes(ccZero[0].g) && namedIn(nilIndex, "cash").length > 0,
      namedIn(nilIndex, "cash").join(" + "));
  }

  // SC-C2 — a member's figure is Family & Entities', not "as the statements print it".
  const owners = [...new Set(BOOK_ACCOUNTS.map((a) => a.owner))];
  const persons = owners.map((o) => screenIndex.find((e) => e.id === `person:${o}`));
  ok("a member's row names the page its figure is, and claims no statement basis",
    persons.every((e) => !!e && /as Family & Entities shows it/.test(e.detail) && !/statements print/.test(e.detail)));

  // SC-C3 — an account valued at AMFI's NAV says so, with the NAV's date; one on
  // its statement's marks says so, with the statement's.
  const accountRows = BOOK_ACCOUNTS.filter((a) => !isMandateHeld(a.engagement)).map((a) => {
    const rows = screenPositions.filter((p) => p.accountId === a.accountId && p.marketValue !== 0);
    const e = screenIndex.find((x) => x.id === `account:${a.accountId}`);
    return { a, rows, e };
  }).filter((r) => r.rows.length > 0 && r.e);
  const allNav = accountRows.filter((r) => r.rows.every((p) => p.navPriced && !p.live));
  const allStmt = accountRows.filter((r) => r.rows.every((p) => !p.navPriced && !p.live));
  // A scheme publishes on its own days, so an account holding several can carry
  // NAVs of different dates: the row then names the span, first to last, and
  // never one date as if it priced every scheme in it.
  const navWrong = allNav.filter((r) => {
    const ds = [...new Set(r.rows.map((p) => p.navDate).filter((x): x is string => !!x))].sort();
    const when = ds.length === 1 ? ds[0] : `${ds[0]} to ${ds[ds.length - 1]}`;
    return !ds.length || !r.e!.detail.includes(`AMFI's NAV of ${when}`) || !r.e!.detail.includes(`statement of ${r.a.asOf}`);
  });
  const navSpans = allNav.filter((r) => new Set(r.rows.map((p) => p.navDate)).size > 1).length;
  const stmtWrong = allStmt.filter((r) => !r.e!.detail.includes(`statement's marks of ${r.a.asOf}`) || /AMFI/.test(r.e!.detail));
  ok("an account valued at AMFI's NAV names the NAV's date beside its statement's", allNav.length > 0 && navWrong.length === 0,
    `${allNav.length} (${navSpans} across several NAV dates): ${navWrong.map((r) => r.e!.detail).slice(0, 2).join("; ")}`);
  ok("…and one on its statement's marks says so, with that date", allStmt.length > 0 && stmtWrong.length === 0,
    `${allStmt.length}: ${stmtWrong.map((r) => r.e!.detail).slice(0, 2).join("; ")}`);

  // SC-D2 — an account's count is what the dashboard lists. Struck on the
  // SCREEN book, because since Stage 10cz every holding under the family's
  // ₹1,000 floor is a fund unit a statement records and only AMFI's NAV values
  // (the Motilal demats' Invesco Contra and ICICI index-fund residues): the
  // statement book carries no speck at all, and a count struck there would pass
  // by never meeting the rule it exists for.
  const small = negligibleKeys(screenPositions);
  const countWrong = BOOK_ACCOUNTS.filter((a) => !isMandateHeld(a.engagement)).filter((a) => {
    const n = screenPositions.filter((p) => p.accountId === a.accountId && !small.has(p.securityKey) && !isRedeemedToNil(p)).length;
    const e = screenIndex.find((x) => x.id === `account:${a.accountId}`);
    const m = /· (\d+) holdings? ·/.exec(e?.detail ?? "");
    return n > 0 ? !m || Number(m[1]) !== n : !!m;
  }).map((a) => a.accountNo);
  const specky = BOOK_ACCOUNTS.filter((a) => screenPositions.some((p) => p.accountId === a.accountId && small.has(p.securityKey)));
  ok("an account's count leaves out the holdings under the ₹1,000 floor and the redeemed ones", countWrong.length === 0
    && specky.length > 0, `wrong: ${countWrong.join(", ") || "none"} · accounts holding specks: ${specky.length}`);

  // SC-D3 — a redeemed account and an unvalued one read apart.
  const emptyAccts = BOOK_ACCOUNTS.filter((a) => !isMandateHeld(a.engagement)
    && !BOOK_POSITIONS.some((p) => p.accountId === a.accountId));
  const redeemedEmpty = emptyAccts.filter((a) => /redeemed/i.test(a.noPositionsReason ?? ""));
  const unvaluedEmpty = emptyAccts.filter((a) => !/redeemed/i.test(a.noPositionsReason ?? ""));
  const say = (a: typeof BOOK_ACCOUNTS[number]) => index.find((x) => x.id === `account:${a.accountId}`)?.detail ?? "";
  ok("an account redeemed to a nil balance says it is a measured zero; one no statement values says that",
    redeemedEmpty.length > 0 && unvaluedEmpty.length > 0
      && redeemedEmpty.every((a) => /measured zero/.test(say(a)))
      && unvaluedEmpty.every((a) => /no statement in this book values it/.test(say(a))),
    `${redeemedEmpty.length} redeemed, ${unvaluedEmpty.length} unvalued`);

  // SC-D3 — one ISIN under two keys: each row says it is one of two. Struck on
  // the SCREEN book: the depository's `HELIOS FCF D-GROW` is a Motilal line the
  // statement book records at a quantity only (Stage 10cz), so the AMC folio's
  // Helios stands alone there, and the pair meets only where AMFI's NAV values
  // the depository's units beside it.
  const twinRows = screenIndex.filter((e) => e.kind === "holding" && /rows for ISIN/.test(e.detail));
  const isinKeys = new Map<string, Set<string>>();
  for (const p of dedupedPositions(screenPositions)) {
    const isin = (SCHEME_NAMES as Record<string, { isin: string }>)[p.securityKey]?.isin ?? p.isin;
    if (isin && !small.has(p.securityKey)) isinKeys.set(isin, (isinKeys.get(isin) ?? new Set()).add(p.securityKey));
  }
  const twins = [...isinKeys].filter(([, ks]) => ks.size > 1).flatMap(([, ks]) => [...ks]);
  ok("a scheme the statements name two ways says so on each of its rows",
    twins.length > 0 && twins.every((k) => twinRows.some((e) => e.id === `holding:${k}`)), `${twins.length} rows`);

  // SC-D1 — a share of the book never reads as nothing.
  const zeroPct = index.filter((e) => /\b0\.00% of the book/.test(e.detail)).map((e) => e.label);
  const tiny = index.filter((e) => e.kind === "holding" && !e.closed && e.weight > 0 && e.weight / sum(currentHoldings(consolidated).map((p) => p.marketValue)) < 0.0001);
  ok("no row reads \"0.00% of the book\", and a holding under 0.01% says so", zeroPct.length === 0
    && tiny.length > 0 && tiny.every((e) => /under 0\.01% of the book/.test(e.detail)), `${zeroPct.join(", ")} · ${tiny.length} tiny`);

  // SC-C6 — a figure result opens a page that SHOWS the figure.
  const fig = (id: string) => index.find((e) => e.id === id)?.href ?? "";
  ok("the money-weighted return opens Morning CIO with its own tile on screen",
    /^\/cio\?(.*&)?tiles=([^&]*,)?mwr(,|&|$)/.test(fig("fig:xirr")), fig("fig:xirr"));
  ok("…and Distributions opens Private Market with the Distributions tile on screen",
    /^\/private-market\?(.*&)?tiles=([^&]*,)?distributed(,|&|$)/.test(fig("fig:distributions")), fig("fig:distributions"));

  // SC-C7 — no word claims a holding the book does not have, and a word the
  // book DOES earn is answered. "arbitrage" belongs on the Cash row exactly
  // while that row holds an arbitrage fund — re-expressed here from the book
  // each index is built over, never read off the builder: the statement book
  // holds none, the live book values the one a depository reports (Stage 10ce).
  const cashIdsOf = (xs: typeof index) => xs.filter((e) => e.kind === "category" && e.id.endsWith(":Cash")).map((e) => e.id);
  for (const [basis, ix, rows] of [["statement", index, positions], ["live", screenIndex, screenPositions]] as const) {
    const holds = currentHoldings(dedupedPositions([...rows]))
      .some((p) => groupKeyFor("category", idx, p) === "Cash" && /\barbitrage\b/i.test(p.security));
    const arb = searchEntries(ix, "arbitrage", 10).map((h) => h.entry);
    const reached = arb.filter((e) => cashIdsOf(ix).includes(e.id));
    ok(`on the ${basis} book 'arbitrage' reaches the Cash row exactly when that row holds an arbitrage fund (${holds ? "it does" : "it does not"})`,
      holds ? reached.length > 0 : reached.length === 0, arb.map((e) => e.id).join(", "));
  }
  // …and the two books differ here, or the check above passes over one branch.
  const holdsOn = (rows: readonly typeof positions[number][]) => currentHoldings(dedupedPositions([...rows]))
    .some((p) => groupKeyFor("category", idx, p) === "Cash" && /\barbitrage\b/i.test(p.security));
  ok("…and one book holds an arbitrage fund while the other does not, so both branches are exercised",
    holdsOn(screenPositions) && !holdsOn(positions));
  ok("…and 'net worth' is not answered with the Current Value of Holdings", top("net worth")?.id !== "fig:book", top("net worth")?.id);
  ok("…and the Transactions tab no longer promises every redemption", !/every dated/.test(index.find((e) => e.id === "view:transactions")?.detail ?? "every dated"));
}

console.log("── the ring-fence ──");
{
  const keys = new Set(BOOK_POLYCAB.map((p) => p.securityKey));
  const isins = new Set(BOOK_POLYCAB.map((p) => p.isin).filter(Boolean));
  ok("the ring-fenced holding is in no entry but the Polycab page's own",
    !index.some((e) => e.id !== "page:/polycab"
      && ([...keys].some((k) => e.id.includes(k) || e.href.includes(k)) || e.codes.some((c) => isins.has(c)))));
  // PC-05 — the company's full name and its ISIN reach the PAGE, first, and
  // nothing outside it: "Nothing in this book matches" about a ₹12,351 Cr
  // holding was the BSE defect again.
  // Derived from the statement's own name, never typed: the company's short
  // name ("Polycab India"), its full name without the depository's furniture
  // ("Polycab India Limited") and its ISIN.
  const fencedFull = BOOK_POLYCAB[0]?.security.replace(/\s*-\s*EQ\b.*$/i, "").trim();
  const fencedName = fencedFull?.split(/\s+/).slice(0, 2).join(" ");
  for (const q of [fencedName, fencedFull, [...isins][0]].filter((x): x is string => !!x)) {
    const got = searchEntries(index, q, 10).map((h) => h.entry);
    ok(`'${q}' finds the Polycab page first, and nothing outside it`,
      got.length > 0 && got[0].id === "page:/polycab"
        && got.every((e) => (e.kind === "page" || e.kind === "view") && (e.href === "/polycab" || e.href.startsWith("/polycab?"))),
      got.map((e) => `${e.kind}:${e.label}`).join(", "));
  }
  // THE PAGE FIRST, THEN ONLY ITS OWN TABS. Every hit must open the Polycab
  // page itself — a holding, an account or a figure anywhere else is the leak
  // the fence exists to stop — and there must be at least one hit, so an empty
  // result cannot pass as a fence that held.
  const hits = searchEntries(index, "polycab", 10).map((h) => h.entry);
  const ownPage = (e: (typeof hits)[number]) =>
    (e.kind === "page" || e.kind === "view") && (e.href === "/polycab" || e.href.startsWith("/polycab?"));
  ok("'polycab' finds the Polycab page first, and nothing outside it",
    hits.length > 0 && hits[0].kind === "page" && hits[0].href === "/polycab" && hits.every(ownPage),
    hits.map((e) => `${e.kind}:${e.label}`).join(", "));
}

console.log("── every destination resolves, every line is a sentence ──");
{
  const badHref = index.filter((e) => !e.href.startsWith("/"));
  ok("every entry has an address inside the app", badHref.length === 0, badHref.map((e) => e.id).join(", "));
  const drill = index.filter((e) => e.href.startsWith("/holdings?"));
  ok("every drill-down address parses to a scope the drill-down page knows",
    drill.every((e) => parseDrilldown(new URLSearchParams(e.href.split("?")[1])) != null),
    drill.filter((e) => !parseDrilldown(new URLSearchParams(e.href.split("?")[1]))).map((e) => e.href).join(", "));
  const badText = index.filter((e) => !e.detail.trim() || /\bundefined\b|\bNaN\b|\bnull\b/.test(`${e.label} ${e.detail}`));
  ok("no label or detail is empty or carries a missing field", badText.length === 0,
    badText.slice(0, 3).map((e) => `${e.id}: ${e.detail}`).join("; "));
  const ids = index.map((e) => e.id);
  ok("every entry id is unique", new Set(ids).size === ids.length);
}

console.log("── the categories partition the book, as the allocation table does ──");
{
  const current = currentHoldings(consolidated);
  const total = sum(current.map((p) => p.marketValue));
  for (const chip of ["Category", "Basket", "Asset class"]) {
    const rows = index.filter((e) => e.kind === "category" && e.chip === chip);
    ok(`the ${chip.toLowerCase()} rows exist`, rows.length > 0);
    ok(`…and every ${chip.toLowerCase()} opens its own drill-down scope`,
      rows.every((e) => parseDrilldown(new URLSearchParams(e.href.split("?")[1]))?.key != null));
  }
  ok("the book carries a total to partition", total > 0);
}

console.log("── on the LIVE book: a cash equivalent is named Cash, and a partly valued account says so ──");
{
  /**
   * The top bar searches what the PAGE is handed — the live portfolio, which
   * carries the funds a depository reports on an account that sent no holding
   * statement (Stage 10ce's cash equivalents, Stage 10cy's other funds) and the
   * fund units a holding statement records and values nowhere (Stage 10cz).
   * `index` builds from `BOOK_POSITIONS`, which never holds those rows, so it
   * cannot see either rule below: this is `screenIndex`, the one the top bar
   * builds, through the same helpers `PortfolioContext` calls.
   */
  const dep = LIVE_ONLY_FUNDS;
  const livePositions = screenPositions;
  const liveAccounts = screenAccounts;
  const live = screenIndex;
  // A missing premise is a FAILURE, never an abstention: an empty set would
  // let every assertion below pass by asserting nothing.
  ok("the live book carries depository-valued cash equivalents to search", dep.some((p) => isCashEquivalent(p)), `${dep.length} rows`);
  // FINDABLE ABOVE THE FAMILY'S ₹1,000 FLOOR, AND NOT OFFERED BELOW IT. A fund
  // residue a Motilal statement records — 0.39 units of Invesco Contra, a few
  // units of two ICICI index funds — is worth tens of rupees at AMFI's NAV, and
  // the floor (Stage 10ax) keeps it off every list the Portfolio Monitor draws;
  // the search offering it would be the one screen that did not.
  const liveSmall = negligibleKeys(livePositions);
  const above = dep.filter((p) => !liveSmall.has(p.securityKey));
  const below = dep.filter((p) => liveSmall.has(p.securityKey));
  ok("…and every one of them above the ₹1,000 floor is findable", above.length > 0
    && above.every((p) => live.some((e) => e.id === `holding:${p.securityKey}`)),
    above.filter((p) => !live.some((e) => e.id === `holding:${p.securityKey}`)).map((p) => p.security).join("; ") || `${above.length} rows`);
  ok("…while one under it is not offered", below.every((p) => !live.some((e) => e.id === `holding:${p.securityKey}`)),
    below.filter((p) => live.some((e) => e.id === `holding:${p.securityKey}`)).map((p) => p.security).join("; "));
  // A LINE THE LIVE LAYER VALUES IS OFFERED ONCE, AS THE VALUED ROW: the
  // statement's recorded entry must give way the moment a price answers.
  const both = dep.filter((p) => live.some((e) => e.id === `holding:${p.securityKey}` && e.recorded));
  ok("…each as its valued row, never as the statement's unvalued line", both.length === 0,
    both.map((p) => p.security).join("; "));
  ok("…and a key is never offered twice on the live book",
    new Set(live.filter((e) => e.kind === "holding").map((e) => e.id)).size === live.filter((e) => e.kind === "holding").length);
  const cashEntries = live.filter((e) => e.kind === "holding" && isCashEquivalent({ securityKey: e.id.slice("holding:".length) }));
  const misnamed = cashEntries.filter((e) => e.chip !== "Cash");
  ok("every liquid and arbitrage fund chips as Cash, never as its wrapper", cashEntries.length > 0 && misnamed.length === 0,
    misnamed.map((e) => `${e.label} → ${e.chip}`).join("; "));
  // LOAD-BEARING: the check must cover funds whose statement typed a WRAPPER,
  // or it passes on the rows a PMS statement already filed under Cash.
  const wrapped = cashEntries.filter((e) => livePositions.some((p) => `holding:${p.securityKey}` === e.id && p.assetClass !== "Cash"));
  ok("…including funds a statement typed as a mutual fund or an ETF", wrapped.length > 0, `${wrapped.length} entries`);
  const partial = liveAccounts.filter((a) => a.partialValuation);
  ok("the live registry carries a partly valued account", partial.length > 0);
  const saysPartial = live.filter((e) => e.kind === "account" && /^[^·]+ · partly valued · /.test(e.detail));
  ok("…and exactly those accounts read \"partly valued\", before their figure",
    saysPartial.length === partial.length && partial.every((a) => saysPartial.some((e) => e.id === `account:${a.accountId}`)),
    `${saysPartial.length} entries vs ${partial.length} accounts`);
  ok("on the statement basis no account is called partly valued",
    !index.some((e) => e.kind === "account" && /partly valued/.test(e.detail)));
}

console.log("── the matching tiers ──");
{
  ok("a whole word outranks the start of a longer word",
    scoreText("gold", "DSP Gold ETF").score > scoreText("gold", "Goldstandard Wealth").score);
  ok("the leading words outrank a whole word further in",
    scoreText("hdfc", "HDFC Balanced Advantage").score > scoreText("hdfc", "Axis HDFC Mixed").score);
  ok("an exact name outranks everything but an identifier", scoreText("ajay", "Ajay").score === 1000);
  ok("a one-edit near miss is found", scoreText("snashi", "Sanshi Fund I").score > 0);
  ok("…but two edits are not", scoreText("snahsi", "Sanshi Fund I").score === 0);
  ok("nothing matches nothing", searchEntries(index, "zzqqxx").length === 0);
  ok("an empty query returns nothing", searchEntries(index, "   ").length === 0);
  ok("a question reads as one", looksLikeQuestion("how much hdfc do i hold") && looksLikeQuestion("tax?"));
  ok("a name does not", !looksLikeQuestion("hdfc") && !looksLikeQuestion("sanshi fund"));
}

console.log("── one company, one name — and every name it was printed under finds it ──");
{
  /**
   *   "when I am searching Kaynes in the search bar, it is coming up in small
   *    cap and large cap both. It should be a single name only."
   *
   * The list is one row per `securityKey`, so a company is one row exactly when
   * it is one key — which `KEY_ALIASES` made true of SBI, Karur Vysya and
   * Crompton. What is checked here is the half that is NOT structural: the row
   * carries the one name the page shows, cased as a name, and every spelling a
   * statement printed still finds it. Joining two keys must not cost a reader
   * the name they type — the depository's `SBI` found nothing once the key was
   * State Bank of India's.
   */
  const holdings = index.filter((e) => e.kind === "holding");
  const misnamed = holdings.filter((e) => {
    const key = e.id.slice("holding:".length);
    return e.label !== securityLabel(key, e.label);
  });
  ok("every holding row carries the one name the page shows", misnamed.length === 0,
    misnamed.slice(0, 3).map((e) => e.label).join("; "));
  const shouting = (s: string) => !/[a-z]/.test(s) && (s.match(/\b[A-Z]{2,}\b/g)?.length ?? 0) >= 2;
  const cased = index.filter((e) => (e.kind === "holding" || e.kind === "mandate")
    && (shouting(e.label) || /^[a-z]/.test(e.label) && !/^[a-z]+[A-Z]/.test(e.label)));
  ok("...written as a name — never all in capitals, never opening in lower case", cased.length === 0,
    cased.slice(0, 3).map((e) => e.label).join("; "));
  const kaynes = searchEntries(index, "kaynes", 10).filter((h) => h.entry.kind === "holding");
  ok("the company the family searched for is ONE holding row", kaynes.length === 1,
    kaynes.map((h) => h.entry.label).join(" | "));
  const variants = labelVariants();
  ok("the book prints some companies under more than one name", variants.size > 0, String(variants.size));
  const lost: string[] = [];
  for (const [key, spellings] of variants) {
    for (const sp of spellings) {
      if (!searchEntries(index, sp, 10).some((h) => h.entry.id === `holding:${key}`)) lost.push(`${sp} → ${key}`);
    }
  }
  ok("every spelling a statement printed finds its company", lost.length === 0, lost.slice(0, 5).join("; "));
  ok("...the depository's `SBI` among them, first", top("sbi")?.id === "holding:state-bank-of-india", top("sbi")?.label);
}

console.log(fails ? `\n${fails} FAILED` : "\nall search checks passed");
process.exit(fails ? 1 : 0);
