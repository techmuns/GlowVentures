// WHEN A HOLDING'S UNITS WERE BOUGHT, OFF ITS ACCOUNT'S OWN DATED TRADES (Stage 10fm).
//
// *"Investment dates are also missing in the dashboard in the portfolio
//  holdings … It should not be the case that the dates are given in the
//  statements and files, and we are not showing it in the dashboard."*
//
// A manager's transaction statement dates every buy and every sell of every
// share in the mandate, and the Holdings table's Invested on column read none
// of them: it dated a holding only off a fund's allotments, a lot register or a
// drawdown fund's calls, so 2 of 154 rows carried a date while Green Lantern's
// statements dated every trade since the account opened.
//
// ── WHAT A TAPE CAN DATE, AND WHAT IT CANNOT ───────────────────────────────
//
// A tape is a WINDOW. Green Lantern's runs from the day each account opened;
// SVAN's, Goldstandard's and Carnelian's from 1 April 2026 — a share their
// managers bought in 2024 is on none of them. So a date is only ever read off a
// window that accounts for EVERY unit held:
//
//     opening = units held − units bought in the window + units sold in it
//
// and only where that opening is NIL is every unit held one of the window's own
// buys. Those are matched first-in, first-out against the window's sells — the
// basis an Indian capital gain statement matches on — and the buys still holding
// units are the holding's dated purchases: the oldest is when the units held
// were first bought, the same meaning `Position.heldSince` has on a lot register.
//
// A POSITIVE OPENING DATES NOTHING. The units were held when the window opened,
// or arrived without a trade (a bonus, a split, a demerger, a transfer in) —
// and a bonus mid-window makes "the opening was sold first" false, so even a
// window whose sells exceed its opening is not matched. A NEGATIVE one says the
// tape and the holding statement disagree. Either way the record names the
// window and the arithmetic and carries no date: a window's first buy printed as
// the holding's purchase date would be a date about part of the units under a
// heading a reader reads as all of them.
//
// THE TRADES THEMSELVES ARE EVERY ROW, dated after the holding's statement or
// not: they are what the statement printed, and the page lists them under the
// holding. Only the arithmetic above stops at the holding's own date, because
// the quantity it balances against is struck there.

const EPS = 1e-6;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r6 = (n) => Math.round(n * 1e6) / 1e6;

/** The ISO day after `iso` — two windows that touch are one window. */
function nextDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * THE ACCOUNT'S TRADE STATEMENTS AS UNBROKEN WINDOWS — their printed periods,
 * merged where one starts on or before the day after another ends. A statement
 * that prints no period contributes none: its rows are still trades, but how far
 * it reaches is unknown, and a window cannot be assumed from the rows it holds.
 */
export function tradeWindows(docs) {
  const iv = docs
    .filter((d) => d.periodFrom && d.periodTo && d.periodFrom <= d.periodTo)
    .map((d) => ({ from: d.periodFrom, to: d.periodTo }))
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const out = [];
  for (const w of iv) {
    const last = out.at(-1);
    if (last && w.from <= nextDay(last.to)) { if (w.to > last.to) last.to = w.to; }
    else out.push({ ...w });
  }
  return out;
}

/** The unbroken window that contains `date`, or null. */
export function windowThrough(windows, date) {
  if (!date) return null;
  return windows.find((w) => w.from <= date && date <= w.to) ?? null;
}

/**
 * ONE TRADE PRINTED ON TWO OVERLAPPING STATEMENTS IS ONE TRADE — even where the
 * two print its rate to a different last decimal.
 *
 * Green Lantern's since-inception transaction statement and its April–July one
 * both print Alivus Life Sciences' 17 Apr 2026 buy of 56 units for ₹60,120.63,
 * one at 1,071.6538 and one at 1,071.6537. The book's dated-row key carries the
 * rate, so both survived as two buys and the tape held 56 units the holding
 * statement does not. Same day, side, units and settled amount is the same
 * trade; a statement's OWN repetition stays evidence (the `datedRowsAcross`
 * rule), so each group keeps as many rows as the one statement printing the
 * most of them. A row with no settled amount is matched on nothing looser than
 * the book already matched it on.
 */
export function oneCopyPerTrade(trades) {
  const groups = new Map();
  const out = [];
  for (const t of trades) {
    if (!isNum(t.amount) || !isNum(t.quantity)) { out.push(t); continue; }
    const k = [t.date, t.side, t.quantity, t.amount.toFixed(2)].join("|");
    const g = groups.get(k) ?? new Map();
    const src = t.source ?? "";
    g.set(src, [...(g.get(src) ?? []), t]);
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    out.push(...[...g.values()].reduce((a, b) => (b.length > a.length ? b : a)));
  }
  return out;
}

/**
 * ONE HOLDING'S DATED TRADES, as the page lists them — oldest first, and a buy
 * before a sell on one day (no unit can be sold before it is bought).
 *
 * A SALE CARRIES THE DATES ITS UNITS WERE BOUGHT where the account's capital
 * gain statement settles it: the lots sold that day under this security, and
 * only where their units add to the day's sales exactly. A day the lots do not
 * account for carries no `boughtOn` rather than a date about some of it.
 */
export function holdingTradeRows(trades, lots = []) {
  const rows = trades
    .filter((t) => t.date && (t.side === "buy" || t.side === "sell"))
    .map((t) => ({
      date: t.date,
      side: t.side,
      quantity: isNum(t.quantity) ? t.quantity : null,
      price: isNum(t.unitPrice) ? t.unitPrice : null,
      amount: isNum(t.amount) ? t.amount : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.side === b.side ? 0 : a.side === "buy" ? -1 : 1));
  const soldOn = new Map();
  for (const r of rows) {
    if (r.side !== "sell") continue;
    soldOn.set(r.date, (soldOn.get(r.date) ?? 0) + (r.quantity ?? NaN));
  }
  const lotsOn = new Map();
  for (const l of lots) {
    if (!l.saleDate || !l.purchaseDate || !isNum(l.quantity)) continue;
    const e = lotsOn.get(l.saleDate) ?? { qty: 0, dates: new Set() };
    e.qty += l.quantity; e.dates.add(l.purchaseDate);
    lotsOn.set(l.saleDate, e);
  }
  for (const r of rows) {
    if (r.side !== "sell") continue;
    const sold = soldOn.get(r.date), l = lotsOn.get(r.date);
    if (l && isNum(sold) && Math.abs(l.qty - sold) <= EPS) r.boughtOn = [...l.dates].sort();
  }
  return rows;
}

/**
 * WHAT ONE HOLDING'S TRADES SAY ABOUT THE UNITS IT HOLDS — or null where its
 * account's trade statements do not reach the holding's own date.
 *
 * `held` is set only where the window's trades account for every unit held
 * (`unaccounted === 0`): the buys still holding units after first-in, first-out
 * matching, their first and last date and how many there are. `reason` says why
 * it is null in words a reader acts on; it is null where `held` is set or the
 * holding holds nothing.
 */
export function holdingTradeRecord({ rows, quantity, asOf, window }) {
  if (!window || !asOf || window.from > asOf) return null;
  const to = window.to < asOf ? window.to : asOf;
  const inWindow = rows.filter((t) => t.date >= window.from && t.date <= asOf);
  const base = {
    from: window.from, to,
    buys: inWindow.filter((t) => t.side === "buy").length,
    sells: inWindow.filter((t) => t.side === "sell").length,
  };
  const none = (reason, unaccounted = null) => ({ ...base, unaccounted, held: null, reason });
  if (window.to < asOf) {
    return none(`the transaction statements end on ${window.to}, before this holding's own statement of ${asOf}, so the trades between the two are not in this drop`);
  }
  if (!isNum(quantity)) return none("the holding statement prints no unit count to balance the trades against");
  if (inWindow.some((t) => !isNum(t.quantity) || t.quantity <= 0)) {
    return none("a trade in the window prints no unit count, so the units cannot be matched to the buys that hold them");
  }
  const bought = inWindow.filter((t) => t.side === "buy").reduce((a, t) => a + t.quantity, 0);
  const sold = inWindow.filter((t) => t.side === "sell").reduce((a, t) => a + t.quantity, 0);
  const opening = r6(quantity - bought + sold);
  // THE ARITHMETIC, NOT A CAUSE. Units on no dated trade were held before the
  // window, or moved in without a trade, or sit on a row no reader took — the
  // statements do not say which, so the sentence does not either.
  if (opening > EPS) {
    return none(base.buys + base.sells === 0
      ? `none of its ${r6(quantity)} units is on a dated trade: the transaction statements in this drop run from ${window.from} to ${to} and record no buy or sell of it`
      : `the transaction statements from ${window.from} to ${to} buy ${r6(bought)} and sell ${r6(sold)} units of it against ${r6(quantity)} held, so ${opening} of them are on no dated trade in this drop`,
    opening);
  }
  if (opening < -EPS) {
    return none(`the transaction statements from ${window.from} to ${to} buy ${r6(bought)} and sell ${r6(sold)} units of it, ${r6(bought - sold)} net, where the holding statement holds ${r6(quantity)} — the two do not agree, so the trades cannot say which units are held`);
  }
  // FIRST-IN, FIRST-OUT over the window's own buys, which hold every unit.
  const lots = [];
  for (const t of inWindow) {
    if (t.side === "buy") { lots.push({ date: t.date, qty: t.quantity }); continue; }
    let left = t.quantity;
    while (left > EPS && lots.length) {
      const take = Math.min(left, lots[0].qty);
      lots[0].qty = r6(lots[0].qty - take);
      left = r6(left - take);
      if (lots[0].qty <= EPS) lots.shift();
    }
    if (left > EPS) {
      return none(`a sale on ${t.date} takes ${left} units no earlier buy in the window holds, so the trades do not match first-in, first-out`, 0);
    }
  }
  if (!lots.length) return { ...base, unaccounted: 0, held: null, reason: null };
  return {
    ...base, unaccounted: 0,
    held: { first: lots[0].date, last: lots.at(-1).date, lots: lots.length },
    reason: null,
  };
}
