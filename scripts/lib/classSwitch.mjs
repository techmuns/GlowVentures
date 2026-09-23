// A FUND MOVING A HOLDING BETWEEN ITS OWN UNIT CLASSES — and the family's cost
// and dates carried through it rather than restated by it.
//
// *"The user does not believe this data."* Buoyant read Invested ₹72.5 Cr and a
// gain of ₹4.51 Cr on the Portfolio Monitor. The family paid ₹70.85 Cr and has
// made ₹6.14 Cr: both folios were moved from Class A1 into Class A4, the fund
// books a move as a redemption and an allotment at that day's NAV, and the cost
// it prints for the new class restarts at the switch-day value.
//
// THREE STEPS, IN THIS ORDER, and `build-book.mjs` is their only caller:
//
//   reclassificationsFrom     the two legs a statement prints, paired
//   carryLotsThroughSwitches  each class's dated contributions, moved with it
//   carryCostThroughSwitches  the holding's cost = what its contributions paid
//
// They live here rather than inside `build-book.mjs` for ONE reason: that file
// runs on import and writes the book, so nothing could exercise a gate on inputs
// this book does not happen to contain. `__tests__/classSwitch.test.mjs` does —
// every gate below is broken there on constructed inputs and made to refuse.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const r2 = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);
const r3 = (n) => (n === null || n === undefined ? null : Math.round(n * 1000) / 1000);
/** Half of the last decimal a unit count is printed to — `dropDepositoryDuplicates`'s rule. */
export const UNIT_TIE = 0.0005;

/**
 * A CLASS SWITCH, READ AS THE TWO LEGS THE STATEMENT PRINTS.
 *
 * A fund moves a holding between its own unit classes by redeeming one and
 * allotting the other on the same day for the same rupees — 3P folded B1 and B2
 * into B3, Buoyant moved both family folios from Class A1 into A4. The readers
 * carry each leg as `kind: "reclassification"`, deliberately outside
 * `CAPITAL_KINDS`: no money came in or went out, so neither leg is what the
 * family paid or received, and neither may reach `capitalMoves`.
 *
 * What the pair IS is the join between two classes' records, and nothing else in
 * this book can make it: without it, money paid for Class A1 units is a record
 * about a holding the family no longer has, and the Class A4 holding is costed
 * at whatever the fund restated the switch at. Paired on (day, rupees) — each
 * leg is struck at its own class NAV and rounded apart, so ±₹1, which is this
 * book's settlement tolerance and covers Buoyant's observed ₹0.06. A leg with
 * no partner is NAMED and carried nowhere: the units it moved then came from, or
 * went to, something this book cannot see.
 */
export function reclassificationsFrom(cashFlows, accountId, notes, label) {
  const legs = (cashFlows ?? []).filter((c) => c.kind === "reclassification" && c.date
    && isNum(c.amount) && isNum(c.units) && c.securityKey);
  const ins = legs.filter((c) => c.amount > 0);
  const used = new Set();
  const out = [];
  for (const o of legs.filter((c) => c.amount < 0)) {
    const i = ins.find((x) => !used.has(x) && x.date === o.date && x.securityKey !== o.securityKey
      && Math.abs(x.amount + o.amount) <= 1);
    if (!i) {
      notes.push(`${label}: the ${o.date} reclassification out of ${o.security} (${-o.amount}) has no leg into `
        + "another class that day for the same rupees, so nothing is carried through it");
      continue;
    }
    used.add(i);
    out.push({
      accountId, date: o.date,
      from: o.securityKey, fromSecurity: o.security, fromUnits: Math.abs(o.units),
      to: i.securityKey, toSecurity: i.security, toUnits: Math.abs(i.units),
      amount: r2(i.amount),
    });
  }
  for (const i of ins.filter((x) => !used.has(x))) {
    notes.push(`${label}: the ${i.date} reclassification into ${i.security} (${i.amount}) has no leg out of `
      + "another class that day for the same rupees, so nothing is carried through it");
  }
  return out;
}

/**
 * THROUGH A CLASS SWITCH, THE MONEY KEEPS ITS DATE AND ITS COST.
 *
 * Buoyant moved Ajay's Class A1 units into Class A4 on 01/06/2026. The fund
 * prints the Class A4 units' cost at the switch-day value, and the four dated
 * payments that bought them — 1 Jun 2024 onwards — stayed filed under a class
 * the family no longer holds. So the A4 holding's contributions accounted for
 * 17,96,901.616 of its 34,16,657.417 units, its gate failed, and the row read
 * `Invested on —` over money first paid in two years earlier.
 *
 * Each switch, in date order, moves the whole of the old class's allotted lots
 * into the new class: same date, same money, and units converted at the
 * switch's OWN printed ratio — units allotted into the new class ÷ units
 * redeemed out of the old one — so every lot's value today is its share of the
 * units the switch actually delivered. Nothing here is a rate of ours.
 *
 * ONLY WHERE THE LOTS ARE THE WHOLE OF WHAT MOVED. The lots allotted into the
 * old class up to the switch must account for every unit it redeemed, to the
 * printed precision, and nothing may have been redeemed from it for cash
 * before: otherwise WHICH units moved is a lot selection no statement makes,
 * and the switch is named and carried nowhere. A lot that went through two
 * switches keeps the class and units it was first BOUGHT as.
 */
export function carryLotsThroughSwitches(byKey, reclassifications, capitalMoves, notes) {
  for (const s of [...reclassifications].sort((a, b) =>
    a.date.localeCompare(b.date) || a.accountId.localeCompare(b.accountId) || a.from.localeCompare(b.from))) {
    const fromK = `${s.accountId}|${s.from}`;
    const toK = `${s.accountId}|${s.to}`;
    const lots = byKey.get(fromK) ?? [];
    const moved = lots.filter((m) => m.date <= s.date);
    const allotted = sum(moved.map((m) => m.units));
    const cashedOut = capitalMoves.some((m) => m.direction === "out" && m.accountId === s.accountId
      && m.securityKey === s.from && m.date <= s.date);
    if (!moved.length || cashedOut || Math.abs(allotted - s.fromUnits) > UNIT_TIE) {
      notes.push(`the ${s.date} switch from ${s.fromSecurity} into ${s.toSecurity} in ${s.accountId} is not carried: `
        + (cashedOut
          ? "units were redeemed from the old class for cash before it, so which units moved is a lot selection no statement makes"
          : `the dated contributions into the old class account for ${r3(allotted)} unit(s) against the ${s.fromUnits} it moved`));
      continue;
    }
    const ratio = s.toUnits / s.fromUnits;
    byKey.set(fromK, lots.filter((m) => m.date > s.date));
    byKey.set(toK, [...(byKey.get(toK) ?? []), ...moved.map((m) => ({
      ...m,
      // Rounded to the 4 decimals these funds print units to, and summed back
      // to the switch's own figure by the gate below rather than forced to it.
      units: Math.round(m.units * ratio * 1e4) / 1e4,
      security: s.toSecurity,
      securityKey: s.to,
      carriedFrom: {
        security: m.carriedFrom?.security ?? m.security,
        securityKey: m.carriedFrom?.securityKey ?? m.securityKey,
        units: m.carriedFrom?.units ?? m.units,
        switchedOn: s.date,
      },
    }))].sort((a, b) => a.date.localeCompare(b.date)));
    notes.push(`the ${s.date} switch from ${s.fromSecurity} into ${s.toSecurity} in ${s.accountId} carries `
      + `${moved.length} dated contribution(s) through it, at the switch's own ratio of ${s.toUnits} unit(s) allotted `
      + `for ${s.fromUnits} redeemed — the money keeps the date it was paid and the amount it cost`);
  }
  return byKey;
}

/**
 * WHAT THE FAMILY PAID, NOT WHAT THE FUND RESTATED A SWITCH AT.
 *
 * *"The user does not believe this data."* Buoyant read Invested ₹72.5 Cr and
 * a gain of ₹4.51 Cr on the Portfolio Monitor. The family paid ₹70.85 Cr and has
 * made ₹6.14 Cr — which every Buoyant document states and the family's own
 * review carries. The appraisal this book takes a holding's cost from prints the
 * Class A4 units at their allotment amounts, and ONE of those allotments is the
 * switch: Class A1 units bought for ₹21.01 Cr, restated at ₹22.54 Cr on the day
 * they moved. ₹1.53 Cr of Ajay's gain and ₹9.1 L of Ankita's were reading as
 * money paid in. Rule 3 — the cost is a primitive — does not make a restatement
 * a purchase: the primitive for these units is what bought them, and the dated
 * record now carries it through the switch.
 *
 * So the position's cost becomes the sum of its OWN tranches, which is the gate
 * `positionTranchesFrom` has already passed — their units account for every unit
 * held — and two more gates keep it from ever replacing a cost it has not
 * explained:
 *
 *   A. THE PRINTED COST MUST BE THE ALLOTMENTS AT THEIR OWN AMOUNTS: the direct
 *      contributions into the class plus what the switch moved into it, to ±₹1.
 *      That is what says the statement restarted cost at the switch rather than
 *      costing the units some other way this book cannot see.
 *   B. THE GAP IS THE GAIN THE SWITCH CRYSTALLISED, and where the account holds
 *      nothing else and its own performance appraisal prints a since-inception
 *      Realized Gain, the two must agree to ±₹1 — a separately printed figure
 *      on a different document. Measured: ₹1,52,95,129.24 against
 *      ₹1,52,95,129.24, and ₹9,10,446.32 against ₹9,10,446.38.
 *
 * The statement's own figure is kept as `printedCostBasis` — a CHECK beside the
 * cost, rule 4 — and the position says where its cost came from.
 */
export function carryCostThroughSwitches(positions, positionTranches, reclassifications, accountBridges, notes) {
  for (const tr of Object.values(positionTranches)) {
    if (!tr.moves.some((m) => m.carriedFrom)) continue;
    const p = positions.find((x) => x.accountId === tr.accountId && x.securityKey === tr.securityKey);
    if (!p || !isNum(p.costBasis) || !(p.quantity > 0)) continue;
    const label = `${p.security} in ${p.accountId}`;
    const paid = r2(sum(tr.moves.map((m) => (isNum(m.invested) ? m.invested : NaN))));
    if (!Number.isFinite(paid)) {
      notes.push(`cost not carried through the switch for ${label}: a contribution behind it prints no invested amount`);
      continue;
    }
    // GATE A
    const direct = sum(tr.moves.filter((m) => !m.carriedFrom).map((m) => m.invested));
    const switchedIn = sum(reclassifications
      .filter((s) => s.accountId === p.accountId && s.to === p.securityKey).map((s) => s.amount));
    const allotments = r2(direct + switchedIn);
    if (Math.abs(allotments - p.costBasis) > 1) {
      notes.push(`cost not carried through the switch for ${label}: the statement's cost of ${p.costBasis} is not its `
        + `allotments at their own amounts (${allotments}), so it was not restated at the switch in a way this book can undo`);
      continue;
    }
    // GATE B
    const gap = r2(p.costBasis - paid);
    const alone = positions.every((x) => x === p || x.accountId !== p.accountId || !x.marketValue);
    const bridge = (accountBridges[p.accountId] ?? [])
      .find((b) => b.basis === "since-inception" && isNum(b.realized));
    if (alone && bridge && Math.abs(bridge.realized - gap) > 1) {
      notes.push(`cost not carried through the switch for ${label}: the switch restated ${gap} of gain, and the `
        + `account's own performance appraisal prints a since-inception Realized Gain of ${bridge.realized}`);
      continue;
    }
    p.printedCostBasis = p.costBasis;
    p.costBasis = paid;
    p.costBasisSource = "carried-through-switch";
    p.avgCost = Math.round((paid / p.quantity) * 1e4) / 1e4;
    p.unrealizedPnL = r2(p.marketValue - paid);
    p.returnPct = r2(((p.marketValue - paid) / paid) * 100);
    notes.push(`cost carried through the class switch for ${label}: ${paid} was paid for these units, against the `
      + `${p.printedCostBasis} the statement's cost column prints, which restarts cost at the switch-day NAV. The `
      + `${gap} between them is gain the fund booked as realised when it moved the units — `
      + (!alone
        ? "the account holds other positions, so its own realised figure cannot witness this one alone — "
        : bridge
        ? `the account's own performance appraisal prints exactly that as Realized Gain (${bridge.realized}) — `
        : "no performance appraisal for this account prints a realised figure to witness it — ")
      + "and it is part of this holding's unrealised gain, because no money left the fund.");
  }
}
