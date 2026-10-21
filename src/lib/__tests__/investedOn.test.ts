// WHEN EACH HOLDING'S MONEY WENT IN, CHECKED AGAINST THE GENERATED BOOK (Stage 10fm).
//   npm run test:family   (ONLY="invested on")
//
// ── WHAT COULD GO WRONG HERE, AND WHY NO PAGE WOULD SHOW IT ─────────────────
//
// A date is the easiest figure in this book to fabricate convincingly. The
// first buy a window happens to print looks exactly like the holding's
// purchase date, and on a share the manager held before the window opened it
// is not one — nothing on screen would tell the two apart. So every date the
// derivation hands out is struck here against an anchor it did not compute:
//
//   Σ buys − Σ sells over the dated window = the position's own `quantity`
//       (the holding statement's figure, read by a different reader from a
//        different document than the trades)
//   a manager's first buy falls on or after the inception date its account's
//       statement prints (a mandate cannot buy before it is funded)
//   a review line's dates are the review's own printed range
//
// and each refusal is made to refuse on the real book.
import { BOOK_ACCOUNTS, BOOK_HOLDING_TRADES, BOOK_POSITIONS } from "@/data/glowData";
import { accountInvestedOn, holdingTradesOf, investedOnOf, lineUndatedReason, investmentDateOf, investmentDateMissingReason, fmtInvestedDate } from "@/lib/investedOn";
import { withReviewAccessors } from "@/lib/reviewColumns";
import type { Position } from "@/lib/types";
import { depositoryFundHoldings, unpricedStatementUnits } from "@/lib/fundNavs";
import { shareCandidates } from "@/lib/depositoryShares";
import { investedOnTitle } from "@/lib/investedOn";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvestedOnCell } from "@/components/InvestedOnCell";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const ACC = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));

{
  const tz = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    ok("a purchase keeps its calendar day west of UTC", fmtInvestedDate("2022-08-03") === "3 Aug 2022");
    ok("month-only dates retain their precision", fmtInvestedDate("2025-03") === "Mar 2025");
  } finally {
    if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
  }
}

{
  const key = "hdfc-balanced-advantage-fund-regular-plan-growth";
  const hdfc = BOOK_POSITIONS.filter((p) => p.securityKey === key);
  const expected: Record<string, string> = { "hdfc-mutual-fund-15644806": "2022-08-03", "hdfc-mutual-fund-16002141": "2022-08-05" };
  ok("the reported MF has both folios in the book", hdfc.length === 2);
  for (const p of hdfc) {
    const scope = { positions: [p] };
    ok(`MF ${p.accountId}: its own allotment dates the row`, investmentDateOf(scope)?.first === expected[p.accountId]);
    const accessors = withReviewAccessors<Position>({}, (p) => ({ positions: [p] }), true);
    ok("member-scoped date sorting uses the same date as its cell", accessors.investedOn(p) === expected[p.accountId]);
  }
  ok("the combined MF row uses both folios", investmentDateOf({ positions: hdfc })?.first === "2022-08-03" && investmentDateOf({ positions: hdfc })?.last === "2022-08-05");
  ok("a derived exposure never borrows a fund's purchase date", investmentDateOf() === null && investmentDateMissingReason().includes("derived exposure"));
  const account = BOOK_ACCOUNTS.find((a) => a.engagement === "PMS" && a.inceptionDate)!;
  ok("a mandate row uses the family's inception date", investmentDateOf({ accountId: account.accountId, isMandate: true })?.first === account.inceptionDate);
}

// ── 1. A TRADE-DATED HOLDING: THE WINDOW ACCOUNTS FOR EVERY UNIT ────────────
{
  const dated = BOOK_POSITIONS.filter((p) => p.tradeRecord?.held);
  ok("the trades date some holdings on this book", dated.length > 50, `${dated.length} holdings`);
  const bad = dated.filter((p) => {
    const r = p.tradeRecord!;
    const ts = holdingTradesOf(p).filter((t) => t.date >= r.from && t.date <= r.to);
    const net = ts.reduce((a, t) => a + (t.side === "buy" ? 1 : -1) * (t.quantity ?? NaN), 0);
    return !(Math.abs(net - (p.quantity ?? NaN)) < 1e-6);
  });
  ok("every one: the window's buys less its sells are the units the holding statement holds", bad.length === 0,
    bad.slice(0, 3).map((p) => `${p.accountId}|${p.securityKey}`).join(", "));
  const early = dated.filter((p) => {
    const inc = ACC.get(p.accountId)?.inceptionDate;
    return !!inc && p.tradeRecord!.held!.first < inc;
  });
  ok("no holding is dated before its account's printed inception", early.length === 0,
    early.slice(0, 3).map((p) => `${p.securityKey} ${p.tradeRecord!.held!.first}`).join(", "));
  const firstBuys = dated.filter((p) => {
    const h = p.tradeRecord!.held!;
    const buys = holdingTradesOf(p).filter((t) => t.side === "buy" && t.date <= p.tradeRecord!.to).map((t) => t.date);
    return !buys.includes(h.first) || !buys.includes(h.last) || h.first > h.last;
  });
  ok("its first and last dates are dates of its own buys", firstBuys.length === 0);
  const d = investedOnOf([dated[0]]);
  ok("the column reads the trades' dates", d?.first === dated[0].tradeRecord!.held!.first && d.sources.includes("trades"));
}

// ── 2. ...AND ONE THEY DO NOT ACCOUNT FOR IS NOT DATED BY THEM ──────────────
{
  const partial = BOOK_POSITIONS.filter((p) => p.tradeRecord && !p.tradeRecord.held && (p.tradeRecord.unaccounted ?? 0) > 0
    && !p.heldSince && !p.investedDates && !p.recoveredCost?.heldPurchases);
  ok("the book carries holdings the trades only partly account for", partial.length > 0, `${partial.length} holdings`);
  ok("incomplete trades date a holding only with an exact saved bonus bridge", partial.every((p) => {
    const d=investedOnOf([p]);return !d || d.sources.includes("bonus-trades");
  }));
  ok("each says why, in the window's own terms", partial.every((p) => {
    if (investedOnOf([p])) return true;
    const why = lineUndatedReason(p) ?? "";
    return why.includes(p.tradeRecord!.from) && /dated trade/.test(why);
  }));
}

// ── 3. A ROW IS DATED ONLY WHERE EVERY LINE IS ──────────────────────────────
{
  const dated = BOOK_POSITIONS.find((p) => p.tradeRecord?.held)!;
  const undated = BOOK_POSITIONS.find((p) => p.tradeRecord && !p.tradeRecord.held && !p.heldSince && !p.investedDates && !p.recoveredCost?.heldPurchases)!;
  ok("one undated line leaves the row undated, never dated by the rest", investedOnOf([dated, undated]) === null);
  const two = BOOK_POSITIONS.filter((p) => p.tradeRecord?.held).slice(0, 2);
  const both = investedOnOf(two)!;
  ok("two dated lines: the earlier first, the later last, their payments added",
    both.first === [two[0].tradeRecord!.held!.first, two[1].tradeRecord!.held!.first].sort()[0]
    && both.payments === two[0].tradeRecord!.held!.lots + two[1].tradeRecord!.held!.lots);
}

// ── 4. THE REVIEW'S RANGE, AS THE REVIEW PRINTS IT ──────────────────────────
{
  const review = BOOK_POSITIONS.filter((p) => p.investedDates && !p.heldSince && !p.tradeRecord);
  const wrong = review.filter((p) => {
    const d = investedOnOf([p]);
    return !d || (d.sources.length === 1 && d.sources[0] === "review" && (d.first !== p.investedDates!.from || d.last !== p.investedDates!.to));
  });
  ok("every review line is dated, by its own range where nothing stronger dates it", wrong.length === 0,
    wrong.slice(0, 3).map((p) => p.securityKey).join(", "));
  const month = review.find((p) => /^\d{4}-\d{2}$/.test(p.investedDates!.from));
  ok("a month the review prints is never widened to a day", !month || investedOnOf([month])!.first.length === 7);
  ok("...and a range counts no payments it does not print", !month || investedOnOf([month])!.payments === null);
}

// ── 5. A MANDATE IS THE FAMILY'S OWN DATE ───────────────────────────────────
{
  const pms = BOOK_ACCOUNTS.filter((a) => a.engagement === "PMS" && BOOK_POSITIONS.some((p) => p.accountId === a.accountId && p.assetClass !== "Cash"));
  const wrong = pms.filter((a) => accountInvestedOn([a.accountId])?.first !== (a.inceptionDate ?? undefined));
  ok("every mandate holding shares is dated by the inception its statement prints", pms.length > 0 && wrong.length === 0,
    wrong.map((a) => a.accountId).join(", "));
  const noInception = BOOK_ACCOUNTS.find((a) => !a.inceptionDate)!;
  ok("an account no statement dates is not dated, nor is a pair it is one of",
    accountInvestedOn([noInception.accountId]) === null && accountInvestedOn([pms[0].accountId, noInception.accountId]) === null);
}

// ── 6. EVERY TRADE LISTED UNDER A HOLDING IS ITS OWN ────────────────────────
{
  const keys = new Set(BOOK_POSITIONS.map((p: Position) => `${p.accountId}|${p.securityKey}`));
  const stray = Object.keys(BOOK_HOLDING_TRADES).filter((k) => !keys.has(k));
  ok("every trade list hangs from a holding the book carries", stray.length === 0, stray.slice(0, 3).join(", "));
  const unordered = Object.entries(BOOK_HOLDING_TRADES).filter(([, ts]) => ts.some((t, i) => i > 0 && ts[i - 1].date > t.date));
  ok("each list runs oldest first", unordered.length === 0);
  const lotDates = Object.values(BOOK_HOLDING_TRADES).flat().filter((t) => t.boughtOn);
  ok("only a sale carries the dates its units were bought", lotDates.every((t) => t.side === "sell" && t.boughtOn!.every((d) => d <= t.date)));
}

{
  const all = [...BOOK_POSITIONS, ...shareCandidates(), ...depositoryFundHoldings(), ...unpricedStatementUnits()];
  const esds = all.find(p=>p.isin==='INE0DRI01029')!;
  const review = investedOnOf([esds]);
  ok('ESDS retains reviewed context without claiming its disputed custody lots reconcile',review?.first==='2024-09-09'&&!!review.reviewSource&&/not reconciled/.test(investedOnTitle(review)));
  const markup=renderToStaticMarkup(createElement(InvestedOnCell,{d:review,why:'No purchase date'}));
  ok('review context is visibly qualified and explains the source limit',/review<\/span>/.test(markup)&&/not reconciled/.test(markup));
  ok('an unmatched security cannot inherit a product date',investedOnOf([{...esds,securityKey:'unmatched',reviewSource:undefined}])===null);
  const managerMps=BOOK_POSITIONS.find(p=>p.accountId.endsWith('100022')&&p.securityKey==='mps')!;
  const directMps=all.find(p=>p.recoveredCost&&p.securityKey==='mps')!;
  ok('direct product dates never date a manager-held stock',!!managerMps&&investedOnOf([managerMps])===null);
  ok('a mixed direct/PMS company cannot borrow the direct review range',!!directMps&&investedOnOf([directMps,managerMps])===null);
}

{
  for (const [account, units] of [['510854',516],['510861',1032]] as const) {
    const p=BOOK_POSITIONS.find(p=>p.accountId.endsWith(account)&&p.securityKey==='zf-commercial-vehicle-control-systems-india')!;
    const before=JSON.stringify(p), d=investedOnOf([p]);
    ok(`ZF ${account}: the six original purchases survive the saved 5:1 bonus`,p.quantity===units&&d?.first==='2025-05-30'&&d.last==='2026-03-18'&&d.payments===6&&d.sources.includes('bonus-trades')&&d.adjustments?.some(a=>a.includes('2026-06-24'))===true);
    ok('a bonus date never replaces the purchase dates or changes financial data',d?.first!<'2026-06-24'&&before===JSON.stringify(p));
    ok('a bonus bridge cannot date a different quantity',investedOnOf([{...p,quantity:units+1}])===null);
    ok('a bonus after the holding date cannot date that holding',investedOnOf([{...p,tradeRecord:{...p.tradeRecord!,to:'2026-06-23'}}])===null);
  }
}

{
  const p=BOOK_POSITIONS.find(p=>p.accountId==='lkp-securities-98245'&&p.securityKey==='crompton-greaves-consumer-electrical')!;
  const d=investedOnOf([p]);
  ok('the 5,000-share Crompton balance keeps both dated lots, not only its oldest date',p.quantity===5000&&d?.first==='2025-03-04'&&d.last==='2025-11-12'&&d.payments===2);
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
