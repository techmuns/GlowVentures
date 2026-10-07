// WHAT THE ASSISTANT IS TOLD, CHECKED AGAINST THE BOOK THE SCREEN SHOWS.
//   npm run test:family
//
// ── WHY THIS IS THE MOST IMPORTANT SUITE OF THE THREE ───────────────────────
//
// Every other screen in this app renders figures a reader can trace to a
// statement. The chat renders SENTENCES, and a language model briefed with a
// wrong number will repeat it fluently and without a dash anywhere. There is no
// `AbsentCell` in a paragraph. So the context is the last place a wrong figure
// can be caught.
//
// ── AND THE BOOK IT IS CHECKED AGAINST IS THE SCREEN'S ──────────────────────
//
// This suite used to anchor the context on `BOOK_SUMMARY` and raw
// `BOOK_POSITIONS` — and so it ENFORCED the defect the audit found (SC-B1…B5):
// the model was handed the statement book while the dialog sat in front of a
// dashboard showing published NAVs, current holdings only and the
// private-market capital accounts only. The input below is assembled exactly
// as `PortfolioContext` assembles it with no quote feed, and every expectation
// is RE-EXPRESSED here from `glowData.ts` by a different path from the
// builder's (its own dedupe, its own current-holdings rule, its own grouping),
// or held to a second surface built on the same book (the search's category
// rows, Private Market's `capitalScope`) — so agreement is a cross-check, not a
// figure compared with its own copy. Each load-bearing difference (statement
// vs screen, every row vs current holdings, 15 capital accounts vs 11, one row vs one holding) is
// asserted to EXIST on this book, so a builder that went back would fail.
import { BOOK_SUMMARY, BOOK_POSITIONS, BOOK_ACCOUNTS, BOOK_POLYCAB, BOOK_COMMITMENTS, BOOK_SHARE_MOVEMENTS, BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
import { applyFundNavs, depositoryCashHoldings, depositoryFundHoldings, partialValuationNotes, unpricedStatementUnits, withPartialValuation } from "@/lib/fundNavs";
import { depositoryShareHoldings, shareCandidates } from "@/lib/depositoryShares";
import { applyCorporateActionQuotes } from "@/lib/corporateActions";
import { applyQuotes } from "@/lib/quotes";
import { labelledAccounts, labelledPositions } from "@/lib/securityLabel";
import { dedupedPositions, publicPrivateSplit, isCashEquivalent } from "@/lib/analytics";
import { buildSearchIndex } from "@/lib/searchIndex";
import { capitalScope } from "@/lib/privateMarket";
import { MARKET_SIDE_UNPLACED } from "@/lib/aifCategory";
import { buildDashboardContext, contextPreamble, contextTickers, describeContext, type ChatBook } from "@/lib/chatContext";
import type { Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const CR = 1e7;
/** Crore, to two decimals — so a tie-out is to the paise the context rounds to. */
const near = (name: string, a: unknown, b: number, tol = 0.02) =>
  ok(name, typeof a === "number" && Math.abs(a - b) <= tol, `${a} vs ${b}`);
const add = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

// ── THE BOOK THE PAGES READ, assembled as PortfolioContext assembles it ─────
// The labelled rows through the corporate-action layer; the funds a depository
// reports on a transaction-only demat (Stage 10ce cash, 10cy the rest) and the
// fund units a holding statement records and values nowhere (A-17, Stage 10cz)
// through the quote overlay; the listed shares a statement records, which are
// rows only while a feed prices them — none here, with no feed; AMFI's
// published NAVs over all of them; and the live registry with its
// partial-valuation notes, built from the same inputs PortfolioContext gives it.
const baseAccounts = labelledAccounts(BOOK_ACCOUNTS);
const DEP = depositoryFundHoldings();
const UNPRICED = unpricedStatementUnits();
const LIVE_ONLY_FUNDS = [...DEP, ...UNPRICED];
const SHARES = depositoryShareHoldings(null, null, undefined, baseAccounts);
const positions = applyFundNavs([
  ...applyCorporateActionQuotes(labelledPositions(BOOK_POSITIONS), baseAccounts, null, null).positions,
  ...applyQuotes([...LIVE_ONLY_FUNDS], null), ...SHARES]);
const liveAccounts = withPartialValuation(baseAccounts,
  partialValuationNotes([...LIVE_ONLY_FUNDS, ...SHARES], BOOK_SHARE_MOVEMENTS, BOOK_POSITIONS, BOOK_UNVALUED_HOLDINGS, shareCandidates()));
const split = publicPrivateSplit(positions);
const book: ChatBook = {
  portfolio: {
    asOf: BOOK_SUMMARY.asOf,
    totalValue: split.listed + split.private + split.unplaced,
    listedValue: split.listed, privateValue: split.private, unplacedValue: split.unplaced,
    accounts: liveAccounts, positions, commitments: BOOK_COMMITMENTS,
  },
  consolidated: dedupedPositions(positions),
  basis: "STATEMENT",
  quotesAsOf: null,
};
const blocks = buildDashboardContext(book);
const block = <T = Record<string, unknown>>(kind: string) =>
  blocks.find((b) => b.kind === kind) as unknown as T;

// ── INDEPENDENT RE-EXPRESSIONS of the rules the screen applies ──────────────
// First row of each dedupe group, in order; a fund redeemed to nil units against
// a published price; a security whose WHOLE consolidated value is under ₹1,000
// and not a measured zero. Written here, not imported, so the builder's helpers
// are checked rather than trusted.
const firstPerGroup = (rows: Position[]) => {
  const seen = new Set<string>();
  return rows.filter((p) => !p.dedupeGroup || (seen.has(p.dedupeGroup) ? false : (seen.add(p.dedupeGroup), true)));
};
const FUNDS = new Set(["AIF", "Mutual Fund", "ETF"]);
const closed = (p: Position) => FUNDS.has(p.assetClass) && p.quantity === 0 && p.currentPrice != null;
const deduped = firstPerGroup(positions);
const keyValue = new Map<string, number>();
for (const p of deduped) keyValue.set(p.securityKey, (keyValue.get(p.securityKey) ?? 0) + p.marketValue);
const speck = (key: string) => { const v = keyValue.get(key) ?? 0; return v !== 0 && Math.abs(v) < 1000; };
const current = deduped.filter((p) => !closed(p) && !speck(p.securityKey));
const screenTotal = add(deduped.map((p) => p.marketValue));
const currentTotal = add(current.map((p) => p.marketValue));
const acct = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
/** The live registry's partial-valuation notes (Stage 10ce), by account. */
const partialNote = new Map(liveAccounts.filter((a) => !!a.partialValuation).map((a) => [a.accountId, a.partialValuation as string]));

ok("the context is a non-empty set of named blocks",
  blocks.length > 0 && blocks.every((b) => typeof b.kind === "string" && b.kind.length > 0),
  blocks.map((b) => b.kind).join(", "));

// ── SC-B1: THE FIGURES ARE THE SCREEN'S, AND SAY THEIR BASIS ────────────────
{
  const s = block<{ currentValueOfHoldingsCr: number; listedCr: number; privateCr: number; notPlacedCr: number;
    positions: number; distinctSecurities: number; accounts: number; unit: string;
    basis: { kind: string; summary: string; publishedNav: { holdings: number; dated: string[] } | null };
    reportDates: { newestStatement: string; valuedStatements: { from: string; to: string } | null };
    countsExclude: { closedPositions: number; belowFloor: { positions: number; floorRupees: number } } }>("book_summary");
  near("the Current Value of Holdings is the screen's — published NAVs applied", s.currentValueOfHoldingsCr, screenTotal / CR);
  // LOAD-BEARING: on this book the screen and the statement book differ, so a
  // builder that went back to `BOOK_SUMMARY` fails the line above by this much.
  ok("...and the screen's figure really differs from the statement book's here",
    Math.abs(screenTotal - BOOK_SUMMARY.totalValue) > CR, `${(screenTotal / CR).toFixed(2)} vs ${(BOOK_SUMMARY.totalValue / CR).toFixed(2)} Cr`);
  near("...its listed side is the screen's", s.listedCr, split.listed / CR);
  near("...and its private side", s.privateCr, split.private / CR);
  // SC-D3: the third side is small here, and two decimals of a crore rounded
  // ₹98,742 UP to a lakh. Held to 1% of the rupee figure, not to a paisa-crore.
  // Since Stage 10dh the review places every private line, so this side can be
  // a MEASURED zero; it must then be sent as zero, never rounded or omitted.
  ok("...and the side nothing places, at a precision that does not round it up to a lakh",
    split.unplaced === 0 ? s.notPlacedCr === 0
      : split.unplaced > 0 && Math.abs(s.notPlacedCr * CR - split.unplaced) / split.unplaced < 0.01,
    `${s.notPlacedCr} Cr vs ₹${split.unplaced}`);
  near("...and the three sides reconstruct the whole", s.listedCr + s.privateCr + s.notPlacedCr, s.currentValueOfHoldingsCr, 0.03);
  const nav = current.filter((p) => p.navPriced && !p.live);
  ok("the basis says how many holdings AMFI's published NAV priced, and on which date",
    !!s.basis.publishedNav && s.basis.publishedNav.holdings === nav.length && nav.length > 0
      && JSON.stringify(s.basis.publishedNav.dated) === JSON.stringify([...new Set(nav.map((p) => p.navDate))].sort())
      && /published NAV/i.test(s.basis.summary) && s.basis.kind === "STATEMENT",
    `${s.basis.publishedNav?.holdings} of ${nav.length}: ${s.basis.summary}`);
  const valued = [...new Set(current.filter((p) => p.marketValue !== 0).map((p) => acct.get(p.accountId)?.asOf ?? ""))].sort();
  ok("the report dates name the newest statement and the range the valued ones span",
    s.reportDates.newestStatement === BOOK_SUMMARY.asOf
      && s.reportDates.valuedStatements?.from === valued[0] && s.reportDates.valuedStatements?.to === valued[valued.length - 1],
    JSON.stringify(s.reportDates.valuedStatements));
  ok("the unit is stated, with its rounding", /crore/i.test(s.unit) && /significant/i.test(s.unit));

  // ── SC-B2: THE COUNTS ARE MORNING CIO'S — current holdings only ──────────
  ok("positions and names are the holdings the dashboard lists",
    s.positions === current.length && s.distinctSecurities === new Set(current.map((p) => p.securityKey)).size,
    `${s.positions} positions, ${s.distinctSecurities} names`);
  // Struck on the rows the SCREEN is built from, not on the statement rows:
  // since Stage 10cz the live book carries rows the statement basis does not
  // (fund units a holding statement records and values nowhere), so it has
  // more rows than `BOOK_POSITIONS` and a comparison against those would fail
  // a builder that is right.
  ok("...which is fewer than the rows the screen is built from, so the check is load-bearing",
    current.length < positions.length, `${current.length} of ${positions.length} rows`);
  ok("...and what they leave out is counted, not dropped in silence",
    s.countsExclude.closedPositions === deduped.filter(closed).length
      && s.countsExclude.belowFloor.positions === deduped.filter((p) => !closed(p) && speck(p.securityKey)).length
      && s.countsExclude.belowFloor.floorRupees === 1000,
    JSON.stringify(s.countsExclude));
  ok("every account in the registry is counted", s.accounts === BOOK_ACCOUNTS.length, String(s.accounts));
}

// ── SC-B2: THE ALLOCATION IS THE SEARCH'S CATEGORY ROWS, ROW FOR ROW ────────
//
// Two surfaces, one book: the search's category rows and this block are built
// from the same positions through the same key, and a reader may see both
// within a minute. They must say the same thing.
{
  const a = block<{ categories: { category: string; valueCr: number; holdings: number }[] }>("allocation_by_category");
  ok("the categories count exactly the holdings the dashboard lists",
    add(a.categories.map((c) => c.holdings)) === current.length, `${add(a.categories.map((c) => c.holdings))} of ${current.length}`);
  near("...and sum to the current holdings' value", add(a.categories.map((c) => c.valueCr)), currentTotal / CR, 0.06);
  const index = buildSearchIndex({ positions, consolidated: book.consolidated, accounts: liveAccounts, money: (n) => `₹${n}` });
  const searchRows = index.filter((e) => e.kind === "category" && e.chip === "Category");
  const miss = a.categories.filter((c) => {
    const r = searchRows.find((e) => e.label === c.category);
    const n = Number(/^(\d+) holding/.exec(r?.detail ?? "")?.[1]);
    return !r || n !== c.holdings || Math.abs(r.weight / CR - c.valueCr) > 0.01;
  });
  ok("...and every category row is the search's own, count and value", miss.length === 0 && searchRows.length === a.categories.length,
    miss.map((c) => c.category).join(", ") || `${a.categories.length} categories`);
}

// ── SC-B2: PER MEMBER, AS THE FAMILY PAGE SHOWS IT — NOT DEDUPED ────────────
{
  const o = block<{ owners: { owner: string; valueCr: number | null; accounts: number; holdings: number }[] }>("by_family_member");
  const owners = [...new Set(BOOK_ACCOUNTS.map((a) => a.owner))];
  const wrong = owners.filter((owner) => {
    const r = o.owners.find((x) => x.owner === owner);
    const ids = new Set(BOOK_ACCOUNTS.filter((a) => a.owner === owner).map((a) => a.accountId));
    const v = add(positions.filter((p) => ids.has(p.accountId)).map((p) => p.marketValue));
    return !r || r.accounts !== ids.size || typeof r.valueCr !== "number" || Math.abs(r.valueCr - v / CR) > 0.02;
  });
  ok("every member's value and account count is their own accounts', from the registry", wrong.length === 0 && o.owners.length === owners.length,
    wrong.join(", ") || `${owners.length} members`);
  const gap = add(o.owners.map((x) => x.valueCr ?? 0)) - screenTotal / CR;
  near("...and the members sum to more than the whole by the double count", gap,
    (add(positions.map((p) => p.marketValue)) - screenTotal) / CR, 0.05);
}

// ── SC-C1 / SC-D2: EVERY ACCOUNT, COUNTING WHAT THE DASHBOARD LISTS ─────────
{
  const acc = block<{ shown: number; total: number; rows: { provider: string; accountNo: string; holdings: number;
    valueCr: number | null; valueNote: string | null; valueBasis: string | null; statementAsOf: string | null }[] }>("accounts");
  ok("every account is sent, none cut by a cap", acc.shown === BOOK_ACCOUNTS.length && acc.rows.length === BOOK_ACCOUNTS.length,
    `${acc.rows.length} of ${BOOK_ACCOUNTS.length}`);
  const byNo = new Map(acc.rows.map((r) => [`${(r as { owner?: string | null }).owner}|${r.provider}|${r.accountNo}`, r]));
  const wrongCount: string[] = [];
  let specked = 0;
  for (const a of BOOK_ACCOUNTS) {
    const rows = positions.filter((p) => p.accountId === a.accountId);
    const listed = rows.filter((p) => !closed(p) && !speck(p.securityKey));
    if (listed.length < rows.filter((p) => !closed(p)).length) specked++;
    const r = byNo.get(`${a.owner}|${a.provider}|${a.accountNo}`);
    if (!r || r.holdings !== listed.length) wrongCount.push(`${a.accountNo}: ${r?.holdings} vs ${listed.length}`);
    if (r && r.statementAsOf !== a.asOf) wrongCount.push(`${a.accountNo} as-of`);
  }
  ok("each account's holdings count leaves out the specks under the floor and the closed rows, and carries its date",
    wrongCount.length === 0, wrongCount.slice(0, 4).join("; "));
  ok("...and this book has an account holding such specks, so the count is load-bearing", specked > 0, `${specked} accounts`);
  ok("a valued account names its price basis", acc.rows.filter((r) => typeof r.valueCr === "number" && r.valueCr !== 0)
    .every((r) => !!r.valueBasis && /mark|NAV|quote|consolidated review/.test(r.valueBasis)));
}

// ── SC-A1: AN ACCOUNT NO STATEMENT VALUES IS NULL; A REDEEMED ONE IS A MEASURED 0
//
// The payload used to say `valueCr: 0` for every account with no position row —
// India SME's three folios, Sky Capital's four, the income-only 360 ONE pair,
// the face-value custody accounts — so "what is my India SME investment worth?"
// was answered with a zero. The finiteness walk below cannot see that: 0 is
// finite. So the two facts are re-derived HERE, from the book's own rows and
// reasons by a different expression from the builder's, and held to the
// payload account by account.
{
  const acc = block<{ rows: { accountNo: string; provider: string; valueCr: number | null; valueNote: string | null }[] }>("accounts");
  const byNo = new Map(acc.rows.map((r) => [`${(r as { owner?: string | null }).owner}|${r.provider}|${r.accountNo}`, r]));
  const absent: string[] = [], nil: string[] = [], specksOnly: string[] = [], wrong: string[] = [];
  for (const a of BOOK_ACCOUNTS) {
    const r = byNo.get(`${a.owner}|${a.provider}|${a.accountNo}`);
    if (!r) continue;
    // The rows of the book HANDED IN — the live one, where a transaction-only
    // demat carries the cash-equivalent funds its depository reports (10ce).
    const rows = positions.filter((p) => p.accountId === a.accountId);
    // A measured nil: every row at nil units against a published price, or no
    // row at all because the statement's balance is nil (its own words).
    const measuredNil = rows.length
      ? rows.every((p) => p.quantity === 0 && p.currentPrice != null)
      : /balance is nil/i.test(a.noPositionsReason ?? "");
    // Every row the account HAS is under the ₹1,000 floor, so the dashboard
    // lists none of them — the two ASK PMS accounts since the September 2026
    // delivery, each holding only a bank balance of paise. Their value is sent
    // (it is a measurement, and not zero) with the floor named, never as a
    // bare figure that reads like a holding the screen forgot to draw.
    const allSpecks = rows.length > 0 && !measuredNil
      && rows.every((p) => closed(p) || speck(p.securityKey)) && rows.some((p) => !closed(p));
    if (rows.length === 0 && !measuredNil) {
      absent.push(a.accountNo);
      if (r.valueCr !== null || !r.valueNote) wrong.push(`${a.accountNo} should be null with a reason, got ${r.valueCr}`);
    } else if (measuredNil) {
      nil.push(a.accountNo);
      if (r.valueCr !== 0 || !/measured nil/i.test(r.valueNote ?? "")) wrong.push(`${a.accountNo} should be a measured 0, got ${r.valueCr} / ${r.valueNote}`);
    } else if (allSpecks) {
      specksOnly.push(a.accountNo);
      const v = add(rows.map((p) => p.marketValue)) / CR;
      if (typeof r.valueCr !== "number" || r.valueCr === 0 || Math.abs(r.valueCr - v) > Math.max(Math.abs(v) * 0.005, 1e-12)
        || !/under ₹1,000/.test(r.valueNote ?? "") || !/lists none of them/.test(r.valueNote ?? ""))
        wrong.push(`${a.accountNo} holds only specks under the floor, so its value ${v} Cr should be sent with the floor named, got ${r.valueCr} / ${r.valueNote}`);
    } else if (typeof r.valueCr !== "number"
      || r.valueNote !== (partialNote.has(a.accountId) ? `Partly valued — ${partialNote.get(a.accountId)}` : null)) {
      wrong.push(`${a.accountNo} holds a valued position, got ${r.valueCr} / ${r.valueNote}`);
    }
  }
  ok("an account no statement values is null with its reason, a redeemed one a measured 0 with its reason",
    wrong.length === 0, wrong.slice(0, 4).join("; "));
  // LOAD-BEARING: both kinds exist on this book, or the check passes over nothing.
  ok("...and this book has both kinds, so the check is not vacuous",
    absent.length > 0 && nil.length > 0, `${absent.length} not valued, ${nil.length} measured nil`);
  // The third kind — an account whose every row is a speck — has a subject only
  // where a drop brings one; this one does (the two ASK PMS bank balances).
  if (specksOnly.length) ok("...and an account holding only specks under the floor sends its value with the floor named",
    true, specksOnly.join(", "));
  else console.log("NOT CHECKED an account holding only specks under the floor — none on this book");
  // A FIGURE FOR SOME OF AN ACCOUNT'S HOLDINGS NAMES THE REST (Stage 10ce): the
  // live book values a transaction-only demat's cash equivalents and nothing
  // else on it, and the account's row carries the registry's own note saying so.
  ok("...and an account the live book values only in part says so, in the registry's own words",
    partialNote.size > 0 && [...partialNote.keys()].every((id) => {
      const a = liveAccounts.find((x) => x.accountId === id)!;
      const r = byNo.get(`${a.owner}|${a.provider}|${a.accountNo}`);
      return !!r && typeof r.valueCr === "number" && r.valueCr > 0 && r.valueNote === `Partly valued — ${a.partialValuation}`;
    }), `${partialNote.size} partly valued`);
}

// ── THE DEPOSITORY-VALUED CASH IS INSIDE THE TOTALS THE CONTEXT REPORTS ─────
//
// Main's first cut of this block told the model these funds were NOT in the
// totals above — true of a statement-basis builder, false of this one, which is
// built from the screen's book (SC-B1) and so carries them in the Cash line and
// the Current Value of Holdings. Held from both ends: the live book's block
// lists exactly the rows that book carries and says they are included; a
// statement-basis book lists none and says so, never a ₹0 total.
{
  type Dep = { note: string; totalCr: number | null; rows: { fund: string; accountId: string; valueCr: number; unitsAsOf: string | null }[] };
  const d = block<Dep>("cash_valued_from_depository_units");
  // The cash `depositoryCashHoldings` values, found in the live book — a second
  // path to the builder's own filter on the row's kind and class.
  const cashKeys = new Set(depositoryCashHoldings().map((u) => `${u.accountId}|${u.securityKey}|${u.quantity}`));
  const depRows = positions.filter((p) => cashKeys.has(`${p.accountId}|${p.securityKey}|${p.quantity}`) && !closed(p) && !speck(p.securityKey));
  ok("the live book carries depository-valued cash for the block to describe", depRows.length > 0, `${depRows.length} rows`);
  ok("...and the block lists exactly those rows, at their own values",
    d.rows.length === depRows.length && depRows.every((p) => d.rows.some((r) => r.accountId === p.accountId
      && r.fund === p.security && Math.abs(r.valueCr - p.marketValue / CR) <= 0.01)),
    `${d.rows.length} vs ${depRows.length}`);
  near("...totalling their value", d.totalCr, add(depRows.map((p) => p.marketValue)) / CR, 0.02);
  ok("...and says they are INCLUDED in the totals above, never that they are left out",
    /INCLUDED in the Cash line and the Current Value of Holdings/.test(d.note) && !/NOT in/.test(d.note), d.note.slice(0, 120));
  const stmtPositions = applyFundNavs(applyCorporateActionQuotes(labelledPositions(BOOK_POSITIONS), baseAccounts, null, null).positions);
  const stmtSplit = publicPrivateSplit(stmtPositions);
  const stmtBook: ChatBook = {
    portfolio: {
      asOf: BOOK_SUMMARY.asOf,
      totalValue: stmtSplit.listed + stmtSplit.private + stmtSplit.unplaced,
      listedValue: stmtSplit.listed, privateValue: stmtSplit.private, unplacedValue: stmtSplit.unplaced,
      accounts: baseAccounts, positions: stmtPositions, commitments: BOOK_COMMITMENTS,
    },
    consolidated: dedupedPositions(stmtPositions), basis: "STATEMENT", quotesAsOf: null,
  };
  const sd = buildDashboardContext(stmtBook).find((b) => b.kind === "cash_valued_from_depository_units") as unknown as Dep;
  ok("a book that carries no depository-valued row says so, with no total and no rows",
    !!sd && sd.rows.length === 0 && sd.totalCr === null && /No holding in this book is valued from a depository/.test(sd.note));
}

// ── Stage 10cy/10cz: THE REST OF WHAT A STATEMENT'S QUANTITY VALUES ─────────
//
// The same transaction-only demat carries funds that are NOT cash (Stage 10cy),
// and a statement's listed shares are rows only while a feed prices them. Each
// has a block of its own; told only the cash, a model asked "how much Bandhan
// Large & Mid Cap do I hold" would miss the units on this demat and contradict
// the screen. And every row the live book values from a statement's quantity
// must land in exactly ONE block — a row in two is counted twice by a model
// that adds blocks up, and a row in none is a holding the model cannot see.
{
  type Fund = { note: string; totalCr: number | null; rows: { fund: string; accountId: string; units: number; valueCr: number }[] };
  const f = block<Fund>("funds_valued_from_depository_units");
  const cashKeys = new Set(depositoryCashHoldings().map((u) => `${u.accountId}|${u.securityKey}|${u.quantity}`));
  const fundKeys = new Set(DEP.map((u) => `${u.accountId}|${u.securityKey}|${u.quantity}`).filter((k) => !cashKeys.has(k)));
  const fundRows = positions.filter((p) => fundKeys.has(`${p.accountId}|${p.securityKey}|${p.quantity}`) && !closed(p) && !speck(p.securityKey));
  ok("the other funds on the transaction-only demat have a block of their own, row for row",
    !!f && f.rows.length === fundRows.length && fundRows.every((p) => f.rows.some((r) => r.accountId === p.accountId
      && r.fund === p.security && Math.abs(r.valueCr - p.marketValue / CR) <= 0.01)),
    `${f?.rows?.length ?? "no block"} vs ${fundRows.length}`);
  near("...totalling their value", f?.totalCr, add(fundRows.map((p) => p.marketValue)) / CR, 0.02);
  ok("...saying they are INCLUDED in the totals and are not cash",
    !!f && /INCLUDED in the Current Value of Holdings/.test(f.note) && /not cash/i.test(f.note));
  // LOAD-BEARING: the funds the family asked to see are on this book.
  ok("...and this book has such funds", fundRows.length > 0, `${fundRows.length} rows`);

  type Shr = { note: string; totalCr: number | null; rows: unknown[] };
  const sh = block<Shr>("shares_valued_at_the_live_quote_from_a_statement_quantity");
  // No feed here, so no share is a row — and the block must say so rather than
  // read as the family holding none.
  ok("with no quote feed the shares block lists none and says why, never a ₹0 total",
    !!sh && sh.rows.length === 0 && sh.totalCr === null && /quote feed has priced none/i.test(sh.note)
      && SHARES.length === 0, sh?.note?.slice(0, 120));
  ok("...while the statements do record shares the feed would value, named in the quantity block",
    shareCandidates().length > 0 && (block<{ rows: { accountId: string; units: number }[] }>("holdings_a_statement_records_and_values_nowhere")?.rows ?? [])
      .some((r) => shareCandidates().some((c) => c.accountId === r.accountId && c.quantity === r.units)),
    `${shareCandidates().length} candidates`);

  const kinds = ["cash_valued_from_depository_units", "funds_valued_from_depository_units",
    "fund_units_a_holding_statement_records_and_values_nowhere", "shares_valued_at_the_live_quote_from_a_statement_quantity"];
  const listed = kinds.flatMap((k) => (block<{ rows: { accountId: string; units: number; fund?: string; security?: string }[] }>(k)?.rows ?? [])
    .map((r) => `${r.accountId}|${r.fund ?? r.security}|${r.units}`));
  const onScreen = positions.filter((p) => !!p.depositoryUnits && !closed(p) && !speck(p.securityKey))
    .map((p) => `${p.accountId}|${p.security}|${p.quantity}`);
  ok("every row the live book values from a statement's quantity is in exactly one block",
    listed.length === onScreen.length && new Set(listed).size === listed.length && onScreen.every((k) => listed.includes(k)),
    `${listed.length} listed vs ${onScreen.length} on screen`);
}

// ── SC-B5: THE LARGEST HOLDINGS ARE HOLDINGS, NOT STATEMENT ROWS ────────────
{
  const t = block<{ shown: number; total: number; rows: { securityKey: string; security: string; valueCr: number;
    pctOfBook: number | null; priceBasis: string; heldIn: { accountNo: string | null; statementAsOf: string | null }[] }[] }>("top_holdings");
  const byKey = new Map<string, Position[]>();
  for (const p of current) byKey.set(p.securityKey, [...(byKey.get(p.securityKey) ?? []), p]);
  const ranked = [...byKey].map(([k, rows]) => ({ k, rows, v: add(rows.map((p) => p.marketValue)) })).sort((a, b) => b.v - a.v);
  ok("one row per security", new Set(t.rows.map((r) => r.securityKey)).size === t.rows.length && t.total === byKey.size,
    `${t.rows.length} rows, ${t.total} securities`);
  ok("...and they are the largest securities, in order, each at its whole value across accounts",
    t.rows.every((r, i) => r.securityKey === ranked[i]?.k && Math.abs(r.valueCr - ranked[i].v / CR) <= 0.02),
    t.rows.slice(0, 3).map((r) => `${r.security} ${r.valueCr}`).join("; "));
  // LOAD-BEARING: the largest holding is several statements' rows, so a ranking
  // of rows would put a smaller figure first.
  const biggestRow = Math.max(...current.map((p) => p.marketValue));
  ok("...which on this book is larger than any one statement row", ranked[0].v > biggestRow + CR,
    `${(ranked[0].v / CR).toFixed(2)} Cr vs ${(biggestRow / CR).toFixed(2)} Cr`);
  ok("...named as the screen names it", t.rows.every((r) => r.security === byKey.get(r.securityKey)![0].security));
  // SC-C10: every row says what priced it and on whose statement of which date.
  ok("every row carries its price basis and each account's statement date",
    t.rows.every((r) => !!r.priceBasis && r.heldIn.length === byKey.get(r.securityKey)!.length
      && r.heldIn.every((h) => !!h.accountNo && !!h.statementAsOf)));
  near("...and its share of the book is of the holdings the dashboard lists",
    t.rows[0].pctOfBook, (ranked[0].v / currentTotal) * 100, 0.01);
}

// ── SC-B3: THE CAPITAL ACCOUNTS ARE PRIVATE MARKET'S — AND THE REST NAMED ───
{
  const c = block<{ privateMarket: { accounts: number; committedCr: number; calledCr: number | null; paidCr: number | null;
    distributedCr: number | null; rows: { fund: string }[] };
    publicMarketFunds: { accounts: number; committedCr: number | null; rows: { fund: string }[] } }>("capital_accounts");
  const scope = capitalScope(BOOK_COMMITMENTS, BOOK_ACCOUNTS);
  ok("the private-market capital accounts are exactly the ones Private Market counts",
    c.privateMarket.accounts === scope.onPage.length && c.privateMarket.rows.length === scope.onPage.length,
    `${c.privateMarket.accounts} of ${BOOK_COMMITMENTS.length}`);
  near("...and so is what they committed", c.privateMarket.committedCr, add(scope.onPage.map((x) => x.committed)) / CR);
  near("...what the funds have called", c.privateMarket.calledCr,
    add(scope.onPage.map((x) => x.called ?? 0)) / CR);
  // Distribution: the printed figure, or the reconciled payouts less equalisation.
  const dist = scope.onPage.map((x) => x.distributed ?? (x.payouts ? add(x.payouts.filter((p) => p.kind !== "equalisation").map((p) => p.gross)) : null));
  near("...and what they have paid back", c.privateMarket.distributedCr,
    add(dist.filter((d): d is number => d != null)) / CR, 0.005);
  ok("the public-market funds' capital accounts are named apart, never counted with them",
    c.publicMarketFunds.accounts === BOOK_COMMITMENTS.length - scope.onPage.length && c.publicMarketFunds.accounts > 0
      && c.publicMarketFunds.rows.every((r) => !c.privateMarket.rows.some((x) => x === r)),
    `${c.publicMarketFunds.accounts} named apart`);
  ok("...and together the two are the whole register", c.privateMarket.accounts + c.publicMarketFunds.accounts === BOOK_COMMITMENTS.length);
  ok("the legacy `drawnCr` — called for some readers, paid for others — is not sent",
    !JSON.stringify(c).includes("drawnCr"));
}

// ── THE RING-FENCE: NAMED, DATED, SCOPED, AND OUTSIDE EVERY TOTAL (PC-04) ───
{
  const w = block<{ ringFenced: { valueCr: number; security: string | null; shares: number | null; statementAsOf: unknown;
    heldIn: { accountNo: string; statementAsOf: string | null }[]; valueBasis: string; note: string } }>("what_this_book_does_not_carry");
  const f = w.ringFenced;
  near("the ring-fenced holding's value is the book's own", f.valueCr, add(BOOK_POLYCAB.map((p) => p.marketValue)) / CR, 0.05);
  ok("...named, so the model can recognise a question about it", !!f.security, String(f.security));
  const fencedAccts = [...new Set(BOOK_POLYCAB.map((p) => p.accountId))].map((id) => acct.get(id)!);
  ok("...with its share count, its statement's date and the account it covers",
    f.shares === add(BOOK_POLYCAB.map((p) => p.quantity!))
      && f.heldIn.length === fencedAccts.length && f.heldIn.every((h, i) => h.accountNo === fencedAccts[i].accountNo && h.statementAsOf === fencedAccts[i].asOf)
      && (f.statementAsOf === fencedAccts[0]?.asOf),
    `${f.shares} shares, ${JSON.stringify(f.statementAsOf)}`);
  ok("...and its basis, so a statement value is not passed off as today's",
    /statement's mark/i.test(f.valueBasis) && /not today's price/.test(f.valueBasis)
      && (fencedAccts.length !== 1 || f.valueBasis.includes(`as of ${fencedAccts[0].asOf}`)) && /today/i.test(f.note),
    f.valueBasis);
  // WHOSE it is (PC-04): the account's owner and custodian, as the registry
  // names them — never "the family's promoter stock", which one demat is not.
  ok("...held in the account(s) the registry names, by owner and custodian",
    f.heldIn.every((h, i) => (h as { owner?: string }).owner === fencedAccts[i].owner
      && (h as { provider?: string }).provider === fencedAccts[i].provider),
    JSON.stringify(f.heldIn));
  ok("...and called one demat's holding, never the family's promoter stock",
    (fencedAccts.length === 1 ? /^One demat's holding/.test(f.note) : f.note.startsWith(`${fencedAccts.length} demats' holdings`))
      && !/the family's promoter stock/i.test(f.note) && /not a figure for the family's whole promoter holding/.test(f.note),
    f.note.slice(0, 120));
  ok("...and told that it is NOT in any total above", /excluded/i.test(f.note) && /not add/i.test(f.note));
  const s = block<{ currentValueOfHoldingsCr: number }>("book_summary");
  ok("...and the total it reports genuinely excludes it", f.valueCr > s.currentValueOfHoldingsCr
    && Math.abs(s.currentValueOfHoldingsCr - screenTotal / CR) < 0.02,
    `fenced ${f.valueCr} Cr vs ${s.currentValueOfHoldingsCr} Cr`);
}

// ── THE CAVEATS ARE MEASURED ON THE SAME BOOK, NOT ASSERTED ─────────────────
{
  const w = block<{
    costBasis: { positionsWithNoCost: number; of: number; valueCr: number; inAccountsTheFamilyRuns: number; note: string };
    blendedAsOf: { newest: string; accountsBehind: number };
    marketSideUnplaced: { note: string; funds: string[] };
    notCarried: string[];
    instruction: string;
  }>("what_this_book_does_not_carry");
  const costless = current.filter((p) => p.costBasis == null);
  ok("the cost-less count is over the holdings the dashboard lists",
    w.costBasis.positionsWithNoCost === costless.length && w.costBasis.of === current.length,
    `${w.costBasis.positionsWithNoCost} of ${w.costBasis.of}`);
  near("...and so is their value", w.costBasis.valueCr, add(costless.map((p) => p.marketValue)) / CR, 0.05);
  const selfRun = costless.filter((p) => ["Direct", "Execution"].includes(acct.get(p.accountId)?.engagement ?? "")).length;
  ok("...and where they sit is counted, not claimed", w.costBasis.inAccountsTheFamilyRuns === selfRun
    && w.costBasis.note.includes(`${selfRun} of these ${costless.length}`), w.costBasis.note);
  ok("...and there ARE such positions, so the caveat is load-bearing", costless.length > 0);
  ok("the blended as-of names how many accounts are behind",
    w.blendedAsOf.newest === BOOK_SUMMARY.asOf && w.blendedAsOf.accountsBehind === BOOK_ACCOUNTS.filter((a) => a.asOf < BOOK_SUMMARY.asOf).length
      && w.blendedAsOf.accountsBehind > 0,
    `${w.blendedAsOf.accountsBehind} behind ${w.blendedAsOf.newest}`);
  // SC-C8: the dashboard's own sentence, which names the family's placing too.
  ok("the side nothing places is explained in the dashboard's own words — the family's placing included",
    w.marketSideUnplaced.note.includes(MARKET_SIDE_UNPLACED) && /family/i.test(MARKET_SIDE_UNPLACED)
      && !blocks.some((b) => JSON.stringify(b).includes("Funds whose statements print no SEBI category, so this book places them")));
  ok("...and names exactly the funds on neither side",
    JSON.stringify(w.marketSideUnplaced.funds) === JSON.stringify([...new Set(current.filter((p) => (p.marketSide ?? null) === null).map((p) => p.security))].sort()),
    w.marketSideUnplaced.funds.join(", "));
  ok("the instruction forbids estimating a figure that is not in the context",
    /never estimate/i.test(w.instruction) && /name what would supply it/i.test(w.instruction));
  ok("...and the permanent absences are listed", w.notCarried.length >= 3);
  // SC-C9: Private Market shows a money-weighted XIRR per private FUND, so the
  // context must not tell the model the book carries no XIRR at all.
  ok("the absences do not deny the per-fund XIRR Private Market shows",
    !w.notCarried.some((x) => /^Per-security XIRR/i.test(x)) && w.notCarried.some((x) => /XIRR/.test(x) && /Private Market/.test(x)));
  // SC-D3: "the archive begins in April" was false — the oldest statement is
  // 31 March — and is re-derived from the registry now.
  const oldest = BOOK_ACCOUNTS.map((a) => a.asOf).filter(Boolean).sort()[0];
  ok("the YTD absence names the oldest statement date, derived", !w.notCarried.some((x) => /begins in April/i.test(x))
    && w.notCarried.some((x) => x.includes(oldest)), oldest);
}

// ── A-17 / Stage 10cz: units a statement records and values nowhere are named ──
//
// The dashboard values these fund units at AMFI's NAV where a witness puts them
// on the NAV's basis — the line's own last-movement rate, or a sibling
// statement's price for the scheme. The context must carry those rows in a
// block of their own, never inside the transaction-only demat's cash block, and
// each must say WHAT put it on the basis and whether it counts as cash. Built
// from the screen's book (SC-B1), it says they are INCLUDED in its totals; a
// statement-basis book carries none and says so.
{
  type Row = { fund: string; accountId: string; units: number; valueCr: number | null;
    lastMovementRate: number | null; pricedLikeAccountId: string | null; countsAsCash: boolean };
  type Blk = { note: string; rows: Row[]; totalCr: number | null };
  const b = block<Blk>("fund_units_a_holding_statement_records_and_values_nowhere");
  // The rows the page draws: every unit `unpricedStatementUnits` values, found in
  // the live book — a second path to the builder's own filter on the row's kind.
  const valuedHere = new Set(UNPRICED.map((u) => `${u.accountId}|${u.securityKey}|${u.quantity}`));
  const want = positions.filter((p) => valuedHere.has(`${p.accountId}|${p.securityKey}|${p.quantity}`) && !closed(p) && !speck(p.securityKey));
  const cash = block<{ rows: { accountId: string; fund: string }[] }>("cash_valued_from_depository_units");
  ok("the context names the fund units a holding statement records and values nowhere",
    !!b && Array.isArray(b.rows) && b.rows.length === want.length
      && want.every((p) => b.rows.some((r) => r.accountId === p.accountId && r.units === p.quantity)),
    `${b?.rows?.length ?? "no block"} vs ${want.length}`);
  near("...totalling their value", b?.totalCr, add(want.map((p) => p.marketValue)) / CR, 0.02);
  ok("...each names what put it on the NAV's basis — its own last-movement rate, or the account whose statement prices the scheme",
    !!b && b.rows.every((r) => (typeof r.lastMovementRate === "number" && r.lastMovementRate > 0)
      || (typeof r.pricedLikeAccountId === "string" && r.pricedLikeAccountId.length > 0)));
  // LOAD-BEARING, BOTH KINDS: a block where every row was one kind would let the
  // other half of the check above pass over nothing.
  ok("...and this book carries both kinds of witness",
    !!b && b.rows.some((r) => typeof r.lastMovementRate === "number") && b.rows.some((r) => !!r.pricedLikeAccountId),
    `${b?.rows.filter((r) => typeof r.lastMovementRate === "number").length ?? 0} by their own rate, `
      + `${b?.rows.filter((r) => !!r.pricedLikeAccountId).length ?? 0} by a sibling statement`);
  // CASH IS SAID PER ROW, AND IT IS THE PAGE'S OWN TEST. A liquid fund on a
  // Motilal demat counts as cash (the family's instruction); a block claiming
  // "not cash" of every row would contradict the page's Cash line.
  ok("...each says whether it counts as cash, exactly as the page files it",
    !!b && want.every((p) => b.rows.some((r) => r.accountId === p.accountId && r.units === p.quantity
      && r.countsAsCash === isCashEquivalent(p))),
    `${b?.rows.filter((r) => r.countsAsCash).length ?? 0} count as cash`);
  ok("...and says they are INCLUDED in the totals above, never that they are left out",
    !!b && /INCLUDED in the Current Value of Holdings/.test(b.note) && !/NOT in/.test(b.note), b?.note?.slice(0, 120));
  const cashHere = new Set(depositoryCashHoldings().map((u) => `${u.accountId}|${u.securityKey}|${u.quantity}`));
  const cashWant = positions.filter((p) => cashHere.has(`${p.accountId}|${p.securityKey}|${p.quantity}`) && !closed(p) && !speck(p.securityKey));
  ok("...and none of them is filed in the transaction-only demat's cash block",
    !!cash && want.every((p) => !cash.rows.some((r) => r.accountId === p.accountId && r.fund === p.security))
      && cash.rows.length === cashWant.length, `${cash?.rows?.length} cash rows vs ${cashWant.length}`);
  const stmtPositions = applyFundNavs(applyCorporateActionQuotes(labelledPositions(BOOK_POSITIONS), baseAccounts, null, null).positions);
  const stmtSplit = publicPrivateSplit(stmtPositions);
  const sb = buildDashboardContext({
    portfolio: {
      asOf: BOOK_SUMMARY.asOf,
      totalValue: stmtSplit.listed + stmtSplit.private + stmtSplit.unplaced,
      listedValue: stmtSplit.listed, privateValue: stmtSplit.private, unplacedValue: stmtSplit.unplaced,
      accounts: baseAccounts, positions: stmtPositions, commitments: BOOK_COMMITMENTS,
    },
    consolidated: dedupedPositions(stmtPositions), basis: "STATEMENT", quotesAsOf: null,
  }).find((x) => x.kind === "fund_units_a_holding_statement_records_and_values_nowhere") as unknown as Blk;
  ok("...and a statement-basis book lists none, with no total and no rows",
    !!sb && sb.rows.length === 0 && sb.totalCr === null && /No holding in this book is valued from fund units/.test(sb.note));
  // LOAD-BEARING: this book has such a row, or the checks above pass over nothing.
  ok("...and this book has at least one such row", want.length > 0 && UNPRICED.length > 0, `${want.length} row(s)`);
}

// ── Every quantity line is named, with why it carries no value ─────────────
{
  type Row = { security: string; accountId: string; units: number; why: string; reportedBy: string | null };
  const b = block<{ rows: Row[]; count: number }>("holdings_a_statement_records_and_values_nowhere");
  const why = new Set(["last-movement-price", "face-value", "no-rate"]);
  ok("the context names every holding a statement records as a quantity",
    !!b && b.rows.length === BOOK_UNVALUED_HOLDINGS.length && b.count === BOOK_UNVALUED_HOLDINGS.length
      && BOOK_UNVALUED_HOLDINGS.every((u) => b.rows.some((r) => r.accountId === u.accountId && r.units === u.quantity)),
    `${b?.rows?.length ?? "no block"} vs ${BOOK_UNVALUED_HOLDINGS.length}`);
  ok("...each with why it carries no value, in one of the three words the note defines",
    !!b && b.rows.every((r) => why.has(r.why)));
  // LOAD-BEARING: the last-movement rows are the whole reason this block exists.
  ok("...and the last-movement rows are among them",
    !!b && b.rows.some((r) => r.why === "last-movement-price"),
    `${b?.rows.filter((r) => r.why === "last-movement-price").length ?? 0} of ${b?.rows.length ?? 0}`);
  // No row may carry a figure a model could sum: units only.
  ok("...and no row carries a value a model could add up",
    !!b && b.rows.every((r) => !Object.keys(r).some((k) => /value|cr$|price|mark/i.test(k))));
  // A line the screen values now says so; the rest are in no total. Struck on
  // the units `unpricedStatementUnits` values, a second path to the builder's.
  type Live = { accountId: string; units: number; shownLiveNow: boolean };
  const lb = block<{ rows: Live[] }>("holdings_a_statement_records_and_values_nowhere");
  // A line the NAV values but whose whole holding is under the ₹1,000 floor is
  // on no screen (`currentHoldings` drops it everywhere), so the dashboard does
  // NOT show it and must not say it does — the same `speck` rule as above.
  const unitKey = (u: { accountId: string; quantity: number | null }) => `${u.accountId}|${u.quantity}`;
  const liveUnits = new Set(UNPRICED.filter((u) => !speck(u.securityKey)).map(unitKey));
  const speckUnits = new Set(UNPRICED.filter((u) => speck(u.securityKey)).map(unitKey));
  ok("...each says whether the dashboard values it now — true of every line a fund's NAV values here",
    !!lb && lb.rows.filter((r) => liveUnits.has(`${r.accountId}|${r.units}`)).every((r) => r.shownLiveNow === true)
      && lb.rows.some((r) => r.shownLiveNow === false),
    `${lb?.rows.filter((r) => r.shownLiveNow).length ?? 0} shown live of ${lb?.rows.length ?? 0}`);
  // LOAD-BEARING on this book: four such lines, ₹3 to ₹105, sit on Bharat's
  // Motilal demat. A builder that read the live rows before the floor would
  // tell the model the dashboard shows lines it does not.
  ok("...and a line the NAV values under the ₹1,000 floor is not shown, and says so",
    speckUnits.size > 0 && !!lb && lb.rows.filter((r) => speckUnits.has(`${r.accountId}|${r.units}`)).length === speckUnits.size
      && lb.rows.filter((r) => speckUnits.has(`${r.accountId}|${r.units}`)).every((r) => r.shownLiveNow === false),
    `${speckUnits.size} line(s) under the floor`);
}

// ── NO FABRICATED ZEROS ANYWHERE IN THE CONTEXT ────────────────────────────
//
// A `?? 0` in the builder would hand the model a measured-looking zero for
// something the book never reported — the absent-vs-zero rule, arriving through
// a JSON payload instead of a table cell. Every *Cr field must be a finite
// number or null, and never NaN, which JSON.stringify silently turns into
// `null` in an array and drops from an object. And every `valueCr: 0` must
// carry the note saying it is a measured nil.
{
  const walk = (v: unknown, path: string, out: string[]) => {
    if (v === null || v === undefined) return;
    if (typeof v === "number") { if (!Number.isFinite(v)) out.push(path); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, out)); return; }
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`, out);
  };
  const bad: string[] = [];
  walk(blocks, "ctx", bad);
  ok("no non-finite number anywhere in the context", bad.length === 0, bad.slice(0, 3).join(", "));
  ok("...and it survives a JSON round trip unchanged",
    JSON.stringify(JSON.parse(JSON.stringify(blocks))) === JSON.stringify(blocks));
}

// ── the preamble actually carries the data ─────────────────────────────────
{
  const pre = contextPreamble(blocks);
  ok("the preamble embeds the context as JSON", pre.includes(JSON.stringify(blocks)));
  ok("...and states the rules the answer must follow",
    /Never state a figure that is not in this context/i.test(pre)
    && /crore/i.test(pre)
    && /BLEND of report dates/i.test(pre)
    && /ring-fenced/i.test(pre)
    && /null figure is ABSENT/i.test(pre));
  // A CONTEXT TOO BIG TO SEND IS A CONTEXT THAT IS NOT SENT. The edge function
  // refuses a body over 256 KB, so this is the bound that matters.
  const bytes = new TextEncoder().encode(pre).length;
  ok("...and the whole preamble fits well inside the function's body limit",
    bytes < 200_000, `${(bytes / 1024).toFixed(1)} KB`);
}

// ── SC-C1: THE PANEL'S OWN DESCRIPTION IS TRUE OF THE PAYLOAD ──────────────
//
// The introduction the reader sees before asking anything used to be typed into
// the JSX and was untrue in three places — "this dashboard" over the statement
// book, "every account" over 50 of 51, and a promise that the assistant sees no
// figure the dashboard does not show. Each count is held to a figure derived
// HERE, from the book, never to the block the description reads.
{
  const d = describeContext(blocks);
  const text = `${d.lead}${d.missing} ${d.limits}`;
  const members = new Set(BOOK_ACCOUNTS.map((a) => a.owner)).size;
  const names = new Set(current.map((p) => p.securityKey)).size;
  const scope = capitalScope(BOOK_COMMITMENTS, BOOK_ACCOUNTS);
  ok("the panel names every account the snapshot carries — all of the registry's",
    text.includes(`all ${BOOK_ACCOUNTS.length} accounts`), `${BOOK_ACCOUNTS.length}: ${d.lead.slice(0, 160)}`);
  ok("...every member and trust", text.includes(`each of the ${members} family members and trusts`), String(members));
  ok("...the largest holdings it really sends", text.includes(`the ${Math.min(25, names)} largest holdings`),
    String(Math.min(25, names)));
  ok("...and the capital accounts Private Market counts, with the public-market ones named apart",
    text.includes(`the ${scope.onPage.length} private-market capital accounts`)
    && text.includes(`the ${scope.elsewhere.length} public-market funds' capital accounts named apart`),
    `${scope.onPage.length} + ${scope.elsewhere.length}`);
  ok("...says the figure is the top bar's, not the statement book's", /the top bar shows/.test(d.lead));
  ok("...and makes none of the three claims that were false",
    !/every account with its owner and report date/i.test(text)
    && !/see a figure the dashboard does not/i.test(text)
    && !/snapshot of this dashboard —/i.test(text)
    && !/undrawn commitments/i.test(text));
}

// ── tickers are real, resolved symbols ─────────────────────────────────────
{
  const t = contextTickers(book);
  const known = new Set(BOOK_POSITIONS.map((p) => p.symbol).filter(Boolean) as string[]);
  ok("every ticker sent is a symbol the book actually resolved",
    t.length > 0 && t.every((x) => known.has(x)), `${t.length}: ${t.slice(0, 4).join(", ")}`);
  ok("...and the list is capped rather than the whole book", t.length <= 15, String(t.length));
  ok("...and no symbol twice", new Set(t).size === t.length);
}

process.exit(fails ? 1 : 0);
