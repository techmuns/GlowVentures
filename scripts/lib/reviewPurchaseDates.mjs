// WHEN A STATEMENT-COSTED HOLDING WAS BOUGHT, OFF THE REVIEW'S DATED PURCHASES
// (Stage 10ms).
//
// *"If we already have the average cost of a holding, then why are we not
//  showing the invested date? … in this Man Industries, we have the average
//  cost, but we don't have the dates. Is it correct? Or are we missing out on
//  the dates from the files?"* — the family, 11 Nov 2026.
//
// An average cost is ONE number a broker prints; it carries no dates. HDFC
// Securities' InvestRight export prints Ajay's 4,80,000 Man Industries at
// ₹327.64 and nothing about when they were bought, and the account's trade
// details report runs from 1 April 2026 — after every purchase. So the book
// dated none of them, though the family's 30 June review prints both buys
// ("Transactions since inception": 60,000 on 10 Jan 2025, 4,57,317 on 25 Jul
// 2025, under HDFC Bank) and the investment register prints the second.
//
// Cost recovery (`recoverHoldingCosts.mjs`) reads those rows only for a
// holding with NO cost, and a statement cost is never replaced. This reads the
// same rows for the DATES of a holding whose cost the statement prints — and
// only where they are provably the units held:
//
//   1. the review's block for this owner, product and custodian buys (and
//      sells) to exactly its own 30 June Closing, first-in, first-out;
//   2. the account's own trade window opens by the day after that Closing and
//      agrees with the review, day by day, where the two overlap;
//   3. the window's later trades carry the lots on to EXACTLY the units the
//      holding statement holds;
//   4. where the window stops before the holding's date, the units bought in
//      the gap would be short-term: so every surviving lot must be long-term
//      and the broker's own LONG TERM QTY must be every unit — a unit bought in
//      the gap and still held would be short-term on its lot record;
//   5. what the surviving lots cost is the statement's cost within 0.5% (the
//      broker adds charges; Kingfa ties to the paisa, Man Industries to 0.007%).
//
// Any step short and the holding carries the reason, not a date. The statement's
// cost, quantity, value and date are untouched: this is a date source for the
// Invested on column only.

import { REVIEW_AS_OF } from "./reviewPrivateRead.mjs";
import { longTermFrom, longTermRuleOf } from "../../shared/holdingPeriod.mjs";

const EPS = 1e-6;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * IDENTITY ALIASES, NEVER AMOUNTS OR DATES: which review product is this
 * security. Each was checked by name against the review row and the broker's
 * symbol; a new entry needs the same check.
 */
export const REVIEW_PRODUCT_BY_KEY = Object.freeze({
  "man-industries-india": "Man Industries",
  "deepak-fertilisers-and-petrochemicals": "Deepak Fert",
  "kingfa-science-and-technology-india": "Kingfa Science & Technology Ltd.",
  "manorama-industries": "Manorama Industries Ltd.",
  // Stage 10mv: 1,77,000 bought 18 Jul 2024; 67,000 sold 23–29 Jul 2026 on the
  // account's own trade report; 1,10,000 held, every one long-term.
  vedanta: "Vedanta",
});

/**
 * Which review "Advisor" block is this account's custody. HDFC Securities
 * 3110320 settles into HDFC Bank's depository; the review's HDFC Bank block for
 * Ajay holds this account's shares to the unit (`HOLDER_BY_TRADING_ACCOUNT`).
 */
export const REVIEW_CUSTODY_BY_ACCOUNT = Object.freeze({
  "hdfc-securities-3110320": "HDFC Bank",
});

function nextDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** FIFO: take `qty` from the oldest lots; the units no lot holds, or 0. */
function sellFifo(lots, qty) {
  let left = qty;
  while (left > EPS && lots.length) {
    const take = Math.min(left, lots[0].units);
    lots[0].units = r6(lots[0].units - take);
    left = r6(left - take);
    if (lots[0].units <= EPS) lots.shift();
  }
  return left;
}

/**
 * The review-dated purchases still held by one holding — null where no alias
 * names it, `{ reason }` where the rows do not prove the units, else the lots'
 * first and last date, their count and the evidence.
 *
 * `trades` are the account's own dated rows for this security
 * (`holdingTradeRows`); `window` its trade statements' unbroken window.
 */
export function reviewPurchaseDates({ accountId, ownerId, holding, asOf, window, trades = [], reviewRows, ownerOf, workbook }) {
  const product = REVIEW_PRODUCT_BY_KEY[holding?.securityKey];
  const custody = REVIEW_CUSTODY_BY_ACCOUNT[accountId];
  if (!product || !custody) return null;
  const none = (reason) => ({ reason });
  const rows = (reviewRows ?? []).filter((r) => r.product === product && r.advisor === custody && ownerOf(r.investor) === ownerId);
  if (!rows.length) return none(`the review's ${custody} block records no "${product}" for this owner`);
  const closings = rows.filter((r) => r.txn === "Closing");
  if (closings.length !== 1 || !closings[0].date || !isNum(closings[0].qty)) {
    return none(`the review's ${custody} block for "${product}" has ${closings.length} dated Closing rows, not one`);
  }
  const closing = closings[0];
  if (!isNum(holding.quantity) || !(holding.quantity > 0)) return none("the holding statement prints no unit count");
  if (!asOf) return none("the holding statement prints no date");

  // 1. The review's own block, to its own Closing.
  const lots = [];
  const events = rows.filter((r) => r.txn !== "Closing" && r.txn !== "Div / Int")
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.row - b.row);
  for (const r of events) {
    if (!r.date || r.date > closing.date) return none(`review row ${r.row} is undated or after its own Closing`);
    if (r.txn !== "Purchase" && r.txn !== "Sale") return none(`review row ${r.row} is a ${r.txn}, not a dated purchase or sale`);
    if (!isNum(r.qty) || !(r.qty > 0) || !isNum(r.value)) return none(`review row ${r.row} prints no units or amount`);
    if (r.txn === "Purchase") lots.push({ date: r.date, units: r.qty, unitCost: Math.abs(r.value) / r.qty });
    else if (sellFifo(lots, r.qty) > EPS) return none(`review row ${r.row} sells units no earlier purchase holds`);
  }
  const reviewUnits = r6(lots.reduce((n, l) => n + l.units, 0));
  if (Math.abs(reviewUnits - closing.qty) > EPS) {
    return none(`the review's purchases and sales leave ${reviewUnits} units against its own Closing of ${closing.qty}`);
  }

  // 2. The account's window reaches back to the Closing, and agrees where they overlap.
  if (!window || window.from > nextDay(closing.date)) {
    return none(`the account's trade statements ${window ? `open on ${window.from}` : "print no period"}, so the trades after the review's ${closing.date} Closing are not all in this drop`);
  }
  const own = trades.filter((t) => t.side === "buy" || t.side === "sell");
  if (own.some((t) => !isNum(t.quantity) || !(t.quantity > 0))) return none("an account trade prints no unit count");
  const net = (list, sideOf, qtyOf) => {
    const m = new Map();
    for (const x of list) m.set(x.date, r6((m.get(x.date) ?? 0) + (sideOf(x) === "buy" ? 1 : -1) * qtyOf(x)));
    return m;
  };
  const overlapOwn = net(own.filter((t) => t.date >= window.from && t.date <= closing.date), (t) => t.side, (t) => t.quantity);
  const overlapReview = net(events.filter((r) => r.date >= window.from), (r) => (r.txn === "Purchase" ? "buy" : "sell"), (r) => r.qty);
  for (const d of new Set([...overlapOwn.keys(), ...overlapReview.keys()])) {
    if (Math.abs((overlapOwn.get(d) ?? 0) - (overlapReview.get(d) ?? 0)) > EPS) {
      return none(`on ${d} the account's trades and the review's rows do not move the same units`);
    }
  }

  // 3. The account's later trades carry the lots to the holding's units.
  const through = window.to < asOf ? window.to : asOf;
  const later = own.filter((t) => t.date > closing.date && t.date <= through)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.side === b.side ? 0 : a.side === "buy" ? -1 : 1));
  for (const t of later) {
    if (t.side === "buy") {
      if (!isNum(t.amount)) return none(`the account's buy of ${t.date} prints no amount`);
      lots.push({ date: t.date, units: t.quantity, unitCost: t.amount / t.quantity });
    } else if (sellFifo(lots, t.quantity) > EPS) return none(`the account's sale of ${t.date} takes units no earlier purchase holds`);
  }
  const units = r6(lots.reduce((n, l) => n + l.units, 0));
  if (Math.abs(units - holding.quantity) > EPS) {
    return none(`the review's ${closing.qty} units on ${closing.date}, carried through the account's trades to ${through}, are ${units}; the holding statement holds ${holding.quantity}`);
  }
  if (!lots.length) return none("no purchase lot survives");

  // 4. The broker's long-term quantity, and the gap the window leaves.
  const rule = longTermRuleOf(holding);
  if (rule.months === null) return none(`no holding period to check the dates against: ${rule.why}`);
  const longTermUnits = r6(lots.filter((l) => asOf >= longTermFrom(l.date, rule.months)).reduce((n, l) => n + l.units, 0));
  const printedLT = holding.longTermQuantity;
  if (isNum(printedLT) && Math.abs(printedLT - longTermUnits) > EPS) {
    return none(`these dates make ${longTermUnits} units long-term on ${asOf}; the broker's portfolio prints ${printedLT}`);
  }
  if (window.to < asOf) {
    const gapFrom = nextDay(window.to);
    if (!isNum(printedLT)) return none(`the trade statements end on ${window.to}, before the holding's ${asOf}, and the portfolio prints no long-term quantity to close the gap`);
    if (asOf >= longTermFrom(gapFrom, rule.months)) return none(`the trade statements end on ${window.to}, more than a holding period before the holding's ${asOf}`);
    if (Math.abs(printedLT - holding.quantity) > EPS) {
      return none(`the trade statements end on ${window.to}, before the holding's ${asOf}; ${r6(holding.quantity - printedLT)} of its units are short-term on the broker's own record, so a purchase between the two cannot be ruled out`);
    }
  }

  // 5. The lots' cost is the statement's.
  const lotCost = lots.reduce((n, l) => n + l.units * l.unitCost, 0);
  if (!isNum(holding.totalCost) || !(holding.totalCost > 0)) return none("the holding statement prints no cost to check the lots against");
  if (Math.abs(lotCost - holding.totalCost) > 0.005 * holding.totalCost) {
    return none(`the surviving lots cost ₹${lotCost.toFixed(2)}, the statement ₹${holding.totalCost.toFixed(2)} — more than 0.5% apart`);
  }

  const dates = lots.map((l) => l.date).sort();
  return {
    first: dates[0], last: dates.at(-1), lots: lots.length, units,
    closing: { date: closing.date, units: closing.qty }, through,
    sales: later.filter((t) => t.side === "sell").length,
    longTermUnits,
    lotCost: Math.round(lotCost * 100) / 100,
    evidence: { path: workbook, sheet: "Transactions since inception", rows: [...events.map((r) => r.row), closing.row].sort((a, b) => a - b) },
    reviewAsOf: REVIEW_AS_OF,
  };
}
