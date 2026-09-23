// ── FIFO — MATCH EVERY UNIT SOLD AGAINST THE EARLIEST UNIT BOUGHT ──────────────
//
// *"Everything in the returns part and all the calculations on the dashboard
// need to be accounted for using the methodology of FIFO … match the number of
// units being sold and purchased."* — the family, through the client.
//
// One lot engine, imported by `build-book` (which strikes every position's cost
// and realised gain with it) and by the browser (which needs only the return
// formula at the bottom, for the live-quote and published-NAV overlays). Two
// implementations of "which units did that sale take" is how one screen comes
// to disagree with another about a gain — the reason `holdingBucket`,
// `costCoversSet` and `companyExposure` are each one function.
//
// ── THREE EVENTS, AND THE THIRD IS THE ONE THAT WAS GETTING THIS WRONG ───────
//
//   buy     units come in at a cost        → a new lot, dated
//   sell    units go out for proceeds      → the OLDEST lots are consumed first;
//                                            the gain is proceeds − their cost
//   switch  units of one class become      → the consumed lots are CARRIED into
//           units of another, no money       the new class with their own cost
//           leaving the family               and their own purchase date
//
// A CLASS SWITCH IS NOT A SALE. Buoyant's statement books Ajay's A1 → A4 switch
// as a "Unit Redemption" of 14,89,474.0032 A1 units for ₹22,53,53,990.90 and a
// fresh "Units Allotment" of 16,19,755.8012 A4 units for the same amount, and
// its own Cost column restamps those units at the switch NAV. Read as a sale
// and a purchase, the family's four contributions (₹21.01 Cr) disappear from
// the cost, ₹1.53 Cr of gain goes into a "realised" figure no document reports,
// and the holding's return reads 3.71% where the fund's own fact sheet — Capital
// Invested ₹46.00 Cr, Profit ₹3.30 Cr — says 7.17%. No money left the family on
// that date, so no unit was sold: the lots are carried.
//
// ── WHAT THIS ENGINE WILL NOT DO ────────────────────────────────────────────
//
// It will not invent a lot. A sale that consumes more units than the recorded
// purchases hold is a SHORTFALL — some units were bought by something the
// record does not contain — and it is reported, never absorbed into a lot at a
// cost nobody paid. The caller decides what a shortfall means (the book
// withholds the FIFO figure and keeps the statement's own).

/** Half of the last decimal a unit count is printed to — the book's own tie. */
export const UNIT_TIE = 0.0005;

/**
 * Run a dated sequence of unit events through FIFO.
 *
 * @param events {date, kind:"buy"|"sell"|"switch", units, amount, from?, to?, unitsIn?, cls?}[]
 *   buy    — `units` > 0 bought for `amount` (the money that bought them), into class `cls`
 *   sell   — `units` > 0 sold out of class `cls` for `amount` (the proceeds)
 *   switch — `units` > 0 of class `from` became `unitsIn` of class `to`; no money moves
 *   Events on one date are applied in the order given, so a caller that needs a
 *   switch applied before a same-day sale says so by ordering them.
 * @returns lots still held, every realised match, and the totals a return needs.
 */
export function fifoLedger(events, { tie = UNIT_TIE } = {}) {
  const lots = [];          // { cls, date, units, cost, origin }
  const realised = [];      // { cls, buyDate, sellDate, units, cost, proceeds, gain }
  const shortfalls = [];    // { date, cls, units }

  // Stable by date: the order a caller gives within one date is kept.
  const ordered = events.map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i)
    .map((x) => x.e);

  /** Take `units` from class `cls`, oldest first. Returns the slices taken. */
  const consume = (cls, units, date) => {
    let need = units;
    const taken = [];
    for (let i = 0; i < lots.length && need > tie; i++) {
      const lot = lots[i];
      if (lot.cls !== cls || lot.units <= tie) continue;
      const take = Math.min(lot.units, need);
      const cost = lot.units - take <= tie ? lot.cost : lot.cost * (take / lot.units);
      taken.push({ date: lot.date, units: take, cost, origin: lot.origin });
      lot.units -= take;
      lot.cost -= cost;
      need -= take;
    }
    for (let i = lots.length - 1; i >= 0; i--) if (lots[i].units <= tie) lots.splice(i, 1);
    if (need > tie) shortfalls.push({ date, cls, units: need });
    return taken;
  };

  for (const e of ordered) {
    const units = Math.abs(e.units ?? 0);
    if (!(units > 0)) continue;
    if (e.kind === "buy") {
      lots.push({ cls: e.cls ?? null, date: e.date, units, cost: Math.abs(e.amount ?? 0), origin: e.date });
    } else if (e.kind === "sell") {
      const proceeds = Math.abs(e.amount ?? 0);
      const taken = consume(e.cls ?? null, units, e.date);
      const soldUnits = taken.reduce((s, t) => s + t.units, 0);
      for (const t of taken) {
        // Proceeds are the SALE's, apportioned by units — every unit in one sale
        // fetched the same price, which is what makes the split a measurement.
        const p = soldUnits > 0 ? proceeds * (t.units / units) : 0;
        realised.push({
          cls: e.cls ?? null, buyDate: t.date, sellDate: e.date, units: t.units,
          cost: t.cost, proceeds: p, gain: p - t.cost,
        });
      }
    } else if (e.kind === "switch") {
      const unitsIn = Math.abs(e.unitsIn ?? 0);
      const taken = consume(e.from ?? null, units, e.date);
      const outUnits = taken.reduce((s, t) => s + t.units, 0);
      // Every consumed lot reappears in the new class with ITS OWN cost and
      // purchase date; only the unit count is restated, in proportion.
      const scale = outUnits > 0 && unitsIn > 0 ? unitsIn / units : 0;
      for (const t of taken) {
        lots.push({ cls: e.to ?? null, date: t.date, units: t.units * scale, cost: t.cost, origin: t.origin });
      }
    }
  }
  // Re-sort by purchase date so a carried lot sits among the class's own lots
  // in the order FIFO will consume them next.
  lots.sort((a, b) => a.date.localeCompare(b.date));

  const unitsHeld = lots.reduce((s, l) => s + l.units, 0);
  const costHeld = lots.reduce((s, l) => s + l.cost, 0);
  const costSold = realised.reduce((s, r) => s + r.cost, 0);
  const proceeds = realised.reduce((s, r) => s + r.proceeds, 0);
  return {
    lots, realised, shortfalls,
    unitsHeld, costHeld, costSold, proceeds,
    realisedGain: proceeds - costSold,
  };
}

/** Lots and totals for ONE class, out of a ledger that ran several. */
export function fifoForClass(ledger, cls) {
  const lots = ledger.lots.filter((l) => l.cls === cls);
  const realised = ledger.realised.filter((r) => r.cls === cls);
  const costSold = realised.reduce((s, r) => s + r.cost, 0);
  const proceeds = realised.reduce((s, r) => s + r.proceeds, 0);
  return {
    lots, realised,
    unitsHeld: lots.reduce((s, l) => s + l.units, 0),
    costHeld: lots.reduce((s, l) => s + l.cost, 0),
    costSold, proceeds,
    realisedGain: proceeds - costSold,
  };
}

/**
 * ── THE ONE RETURN FORMULA ─────────────────────────────────────────────────
 *
 *   return = (unrealised + realised) ÷ (cost of units held + cost of units sold)
 *
 * Everything the holding produced, over every rupee that bought a unit of it.
 * A holding nobody has sold from reduces to the familiar unrealised ÷ cost, so
 * the formula changes nothing where FIFO has nothing to say; where units WERE
 * sold, the gain on them stays in the return instead of silently leaving it.
 *
 * NULL wherever the cost is unknown or not positive — never 0, which would read
 * as break-even: a depository reports what shares are worth and not what they
 * cost, and `marketValue − 0` is the whole position booked as profit.
 */
export function fifoReturnPct(marketValue, costHeld, realised, costSold) {
  if (typeof costHeld !== "number" || !Number.isFinite(costHeld)) return null;
  const sold = typeof costSold === "number" && Number.isFinite(costSold) ? costSold : 0;
  const gainSold = typeof realised === "number" && Number.isFinite(realised) ? realised : 0;
  const deployed = costHeld + sold;
  if (!(deployed > 0)) return null;
  return ((marketValue - costHeld + gainSold) / deployed) * 100;
}

