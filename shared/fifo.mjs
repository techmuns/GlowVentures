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
  const lots = [];          // { cls, date, units, cost, origin, unitsBought, label, carriedFrom }
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
      // Units of THIS lot sold before now travel with it only when the whole of
      // what is left is taken — a slice of a lot is not the lot's history.
      const soldBefore = lot.units - take <= tie ? Math.max(0, lot.unitsBought - lot.units) : 0;
      taken.push({ date: lot.date, units: take, cost, origin: lot.origin, cls: lot.cls, soldBefore,
        label: lot.label, carriedFrom: lot.carriedFrom });
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
      lots.push({ cls: e.cls ?? null, date: e.date, units, cost: Math.abs(e.amount ?? 0), origin: e.date,
        unitsBought: units, label: e.label ?? null, carriedFrom: null });
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
        // A lot partly sold BEFORE the switch stays partly sold after it: what
        // was bought is scaled by the same ratio as what is carried.
        lots.push({ cls: e.to ?? null, date: t.date, units: t.units * scale, cost: t.cost, origin: t.origin,
          unitsBought: (t.units + t.soldBefore) * scale, label: t.label,
          carriedFrom: t.carriedFrom ?? t.cls ?? e.from ?? null });
      }
      // A CARRIED LOT KEEPS ITS PLACE IN THE QUEUE. It was bought when it was
      // bought, so it must be consumed before a newer lot already in the class
      // — appended at the end, a later sale would take the newest units first,
      // which is LIFO wearing FIFO's name. Stable, so same-date lots keep order.
      lots.sort((a, b) => a.date.localeCompare(b.date));
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

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * ── FIFO OVER A FUND'S OWN UNIT RECORD ───────────────────────────────────────
 *
 * *"match the number of units being sold and purchased, and use the methodology
 * of FIFO."* Three fund statements print every unit that came in and went out,
 * and for each of them the statement's own Cost column is NOT a FIFO cost:
 *
 *   BUOYANT  — the A1 → A4 class switch is printed as a redemption and a fresh
 *              allotment, and the Cost column restamps the switched units at the
 *              switch NAV. The family's A1 contributions vanish from the cost.
 *   NEO      — 14,162.8 units were redeemed and paid back at ₹14.16 L, and the
 *              printed cost is still the ₹5 Cr ever drawn.
 *   3P       — the whole folio was switched into one class and then redeemed;
 *              the gain on it is a REALISED figure no position carried.
 *
 * So wherever an account's dated record carries a SALE (a withdrawal with units)
 * or a SWITCH (a same-day reclassification out of one class and into another,
 * for the same rupees), the record is run through the one lot engine. Where a
 * unit LEFT the holding, `build-book` takes the FIFO answer; where only a switch
 * moved it (Buoyant), `carryCostThroughSwitches` carries the cost and this
 * answer is the CHECK it must agree with. An account whose record holds only
 * purchases is left alone: with nothing sold, FIFO's cost IS the sum of the
 * purchases, and the statement's own cost already ties to that to the paisa
 * (Sanshi).
 *
 * Here rather than in `build-book` so the suite can run the same record through
 * the same function and hold the book to it.
 *
 * WHAT BUYS A LOT is every rupee the family paid for its units (VD-24): a
 * self-contained contribution's printed NET — what the fund invested — plus the
 * CHARGES the same row prints (3P's setup expense and stamp duty, which its
 * reader ties to the paisa: gross − charges = net). A row that prints a net and
 * NO charge line carries `expenses: null`, and only there does it count as nil:
 * Buoyant's 1 Apr deposit prints a net of ₹1,00,58,861.66 against a ₹1 Cr gross
 * because the ₹58,861.66 Gain Distr. of that day was reinvested — money that
 * bought units, not a charge. The rule is stated as the statement prints it and
 * never as the larger of gross and net, which would pick whichever figure a
 * future layout happened to print larger. An allotment's amount is its own. A
 * contribution that is a RUNNING BALANCE is refused, because differencing a
 * cumulative figure is how ₹22 Cr gets invented (see `capitalMovesFrom`). A
 * distribution is income; where it was reinvested, the allotment it funded is
 * the purchase.
 *
 * Returns `null` when the account needs no FIFO (nothing was sold or switched),
 * or `{ ledger, reason }` — `reason` non-null when the record could not be run.
 */
export function fifoFromCashFlows(cashFlows) {
  const rows = (cashFlows ?? []).filter((c) => c.date && c.securityKey && isNum(c.units) && c.units !== 0);
  const sells = rows.filter((c) => c.kind === "withdrawal" && c.units < 0);
  const switches = rows.filter((c) => c.kind === "reclassification");
  if (!sells.length && !switches.length) return null;

  const events = [];
  for (const c of rows) {
    if (c.kind === "contribution" && c.units > 0) {
      if (!isNum(c.netAmount)) {
        return { ledger: null, reason: `the ${c.date} contribution prints a running balance rather than what it bought, so its units carry no cost of their own` };
      }
      // Net plus the charges the row prints; null charges only on a row that
      // prints no charge line (see above).
      const paid = Math.round((c.netAmount + (isNum(c.expenses) ? c.expenses : 0)) * 100) / 100;
      events.push({ order: 0, date: c.date, kind: "buy", cls: c.securityKey, units: c.units, amount: paid, label: c.description });
    } else if (c.kind === "allotment" && c.units > 0) {
      if (!isNum(c.amount)) return { ledger: null, reason: `the ${c.date} allotment prints no amount` };
      events.push({ order: 0, date: c.date, kind: "buy", cls: c.securityKey, units: c.units, amount: c.amount, label: c.description });
    } else if (c.kind === "withdrawal" && c.units < 0) {
      events.push({ order: 2, date: c.date, kind: "sell", cls: c.securityKey, units: -c.units, amount: Math.abs(c.amount ?? 0) });
    }
  }
  // A SWITCH IS A PAIR: units out of one class and into another on one date for
  // the same rupees (±₹1, the tolerance every switch in this archive is paired
  // to). An unpaired reclassification is money this reader cannot follow, and
  // the account is refused rather than half-run.
  const outs = switches.filter((c) => c.units < 0);
  const ins = switches.filter((c) => c.units > 0);
  const used = new Set();
  for (const o of outs) {
    const i = ins.find((x) => !used.has(x) && x.date === o.date && x.securityKey !== o.securityKey
      && isNum(x.amount) && isNum(o.amount) && Math.abs(Math.abs(x.amount) - Math.abs(o.amount)) <= 1);
    if (!i) return { ledger: null, reason: `the ${o.date} reclassification out of ${o.security} funds no same-day reclassification in` };
    used.add(i);
    events.push({ order: 1, date: o.date, kind: "switch", from: o.securityKey, to: i.securityKey, units: -o.units, unitsIn: i.units });
  }
  if (used.size !== ins.length) return { ledger: null, reason: "a reclassification in is funded by no same-day reclassification out" };
  // Within one date: purchases, then switches, then sales — a same-day switch
  // must be able to carry a lot bought that morning, and a sale must see it.
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  return { ledger: fifoLedger(events), reason: null };
}
