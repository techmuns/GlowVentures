// A PMS ACCOUNT'S OWN TAPE, CARRIED PAST ITS HOLDING STATEMENT AS ONE MANDATE (Stage 10mg).
//
// *"If we have transaction data that shows buy or sale transactions then those
// should be considered to update the portfolio"* — the family, 6 Nov 2026.
//
// Green Lantern's holdings are dated 27 Jul 2026 and its own transaction
// statements run to 22-23 Sep. Stage 10dw rolls a holding forward only where a
// depository balance or capital-gain lots witness the tape, and a PMS has
// neither, so two months of the manager's own trades were on no page. Rolling
// one holding at a time would also be wrong for a mandate: a sale moves value
// into its CASH line, and a purchase adds a NAME the statement never held.
//
// So the whole account rolls, or none of it does, witnessed by the manager's
// own later FACT SHEET, which prints every line's market value (cash and the
// liquid fund included) and the portfolio value they add to:
//   1. the fact sheet is dated after the statement, the tape reaches it, and
//      its lines add to its printed portfolio value;
//   2. no line goes below nil, and no split, bonus or unregistered demerger
//      falls between the statement and the tape's last day (the saved NSE
//      capture, `countActions`); a registered demerger (`shared/demergers.mjs`)
//      allots its child units on the record date;
//   3. on the fact sheet's date the roll holds exactly the names it lists —
//      every name it carries to nil absent, every name it holds present;
//   4. each held name's printed value over its rolled units is a price within
//      a factor of two of the tape's own last trade price (the statement's
//      mark where the tape never traded it) — a demerger's parent and child
//      together, since the record date moves value from one to the other.
// Each line is then marked at the fact sheet's value over its units, the cash
// line at the fact sheet's cash, and trades after the fact sheet move units
// and cash by their own settlement amounts. Live quotes still price the
// shares; the statement basis keeps its snapshot.
//
// COST: the capital-gain statements stop at the holding statement, so a name
// SOLD after it carries no cost or realised figure (null, never estimated). A
// name only bought after it adds those buys to the statement's cost; a name the
// statement never held is costed first-in first-out on its own trades. A
// demerger's parent and child carry none: no apportionment is on record.
import { countActions } from "./shareActions.mjs";
import { DEMERGERS } from "../../shared/demergers.mjs";
import { fifoLedger } from "../../shared/fifo.mjs";

const EPS = 1e-6;
const r2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
const r6 = (v) => Math.round(v * 1e6) / 1e6;

/**
 * `positions`: the account's statement positions. `trades`: its tape rows dated
 * after `asOf` ({ date, side, securityKey, security, quantity, unitPrice, settled }).
 * `factSheet`: { asOf, corpus, docKey, values: [{ securityKey, security, marketValue }] }.
 * Returns `{ reason }` or the roll.
 */
export function rollAccountTape({ asOf, positions, trades, tapeTo, factSheet, saved, symbolOf, isinOf = () => null, demergers = DEMERGERS }) {
  const fail = (reason) => ({ reason });
  const F = factSheet?.asOf;
  if (!asOf || !tapeTo || !(tapeTo > asOf)) return fail("the tape does not run past the statement");
  if (!F || !(F > asOf)) return fail("no fact sheet is dated after the statement");
  if (tapeTo < F) return fail(`the tape stops on ${tapeTo}, before the ${F} fact sheet`);
  const values = factSheet.values ?? [];
  const printed = values.reduce((s, v) => s + v.marketValue, 0);
  if (!values.length || !(typeof factSheet.corpus === "number") || Math.abs(printed - factSheet.corpus) > Math.max(1, values.length)) // gate 1
    return fail(`the fact sheet's ${values.length} lines add to ${r2(printed)}, not its printed portfolio value of ${factSheet.corpus}`);
  if (trades.some((t) => !(t.quantity > 0) || !(typeof t.settled === "number"))) return fail("a tape row carries no unit count or settlement amount");

  const fsValue = new Map(values.map((v) => [v.securityKey, v.marketValue]));
  const traded = new Set(trades.map((t) => t.securityKey));
  const isCash = (p) => p.assetClass === "Cash" && !traded.has(p.securityKey);
  const held = positions.filter((p) => !isCash(p));
  const cash = positions.filter(isCash);
  const keys = new Set([...held.map((p) => p.securityKey), ...traded]);
  const stated = (k) => held.filter((p) => p.securityKey === k).reduce((s, p) => s + (p.quantity ?? 0), 0);
  // Units on a date, a registered demerger's child allotted on its record date.
  const children = demergers.filter((d) => d.recordDate > asOf && d.recordDate <= tapeTo);
  for (const d of children) keys.add(d.childKey);
  const unitsOn = (k, date) => {
    let q = stated(k) + trades.filter((t) => t.securityKey === k && t.date <= date)
      .reduce((s, t) => s + (t.side === "buy" ? t.quantity : -t.quantity), 0);
    for (const d of children) if (d.childKey === k && d.recordDate <= date) q += unitsOn(d.parentKey, d.recordDate) * d.ratio;
    return r6(q);
  };
  for (const k of keys) if (unitsOn(k, tapeTo) < -EPS || trades.some((t) => t.securityKey === k && unitsOn(k, t.date) < -EPS))
    return fail(`the tape sells more ${k} than the statement and its buys hold`);                                                   // gate 2
  if (!saved || saved.through < tapeTo) return fail(`the saved corporate actions reach ${saved?.through ?? "nothing"}, not the tape's ${tapeTo}`);
  // By symbol (the book's own key to symbol): the capture prints SBIN under its
  // pre-2014 ISIN, and gate 4 catches any unit count an unseen action would break.
  for (const k of keys) {
    const a = countActions(saved, symbolOf(k), isinOf(k), asOf, tapeTo);
    if (a.reason) return fail(a.reason);
    if (a.actions.length) return fail(`${k}'s ${a.actions[0].kind} of ${a.actions[0].date} falls inside the roll`);
  }
  for (const k of keys) {                                                                                                         // gate 3
    const has = unitsOn(k, F) > EPS;
    if (has !== fsValue.has(k)) return fail(`on ${F} the roll ${has ? `holds ${unitsOn(k, F)} ${k}` : `holds no ${k}`} where the fact sheet ${fsValue.has(k) ? "lists it" : "does not list it"}`);
  }
  // …and the fact sheet lists nothing the roll does not know but cash and what is owed to the account.
  const CASH_LINE = /\b(cash|receivable|payable)\b/i;
  for (const v of values) {
    if (keys.has(v.securityKey) || cash.some((p) => p.securityKey === v.securityKey)) continue;
    if (!CASH_LINE.test(`${v.security} ${v.sector ?? ""}`)) return fail(`the fact sheet lists ${v.securityKey}, which neither the statement nor the tape holds`);
  }
  // Gate 4: the printed value over the rolled units is a price the tape's own trades bear out.
  const lastPrice = (k) => trades.filter((t) => t.securityKey === k && t.date <= F && t.unitPrice > 0).at(-1)?.unitPrice
    ?? (() => { const p = held.find((x) => x.securityKey === k); return p ? (p.currentPrice ?? (p.quantity > 0 ? p.marketValue / p.quantity : null)) : null; })();
  const priced = new Map();
  for (const k of keys) {
    const u = unitsOn(k, F);
    if (!(u > EPS)) continue;
    const price = fsValue.get(k) / u;
    priced.set(k, price);
    const child = children.find((d) => d.childKey === k), parent = children.find((d) => d.parentKey === k);
    if (child) continue;                                    // checked with its parent
    const together = parent && unitsOn(parent.childKey, F) > EPS ? price + parent.ratio * (fsValue.get(parent.childKey) / unitsOn(parent.childKey, F)) : price;
    const ref = lastPrice(k);
    if (!(ref > 0)) return fail(`${k} has no trade price or statement mark to bear out its ${F} value`);
    if (!(together / ref > 0.5 && together / ref < 2)) return fail(`${k}'s ${F} value over its ${u} rolled units is ${r2(together)} a unit, against ${r2(ref)} on the tape`);
  }

  // The rolled lines. Trades after the fact sheet move units and cash by their own amounts.
  const after = trades.filter((t) => t.date > F);
  const cashLine = cash.find((p) => p.securityKey === "cash") ?? null;
  if (after.length && !cashLine) return fail(`${after.length} trade(s) after the fact sheet and no cash line to settle them in`);
  const priceOf = (k) => priced.get(k) ?? trades.filter((t) => t.securityKey === k && t.unitPrice > 0).at(-1)?.unitPrice ?? null;
  const rows = [];
  for (const k of keys) {
    const p = held.find((x) => x.securityKey === k) ?? null;
    const mine = trades.filter((t) => t.securityKey === k);
    const quantity = unitsOn(k, tapeTo);
    const sold = mine.some((t) => t.side === "sell");
    const demerged = children.some((d) => d.childKey === k || d.parentKey === k);
    let costBasis = null, realizedPnL = null, costOfUnitsSold = null, heldPurchases;
    if (quantity <= EPS) costBasis = 0;
    else if (demerged) costBasis = null;
    else if (!p) {
      // Every unit bought on this tape: first-in first-out on its own trades.
      const ledger = fifoLedger(mine.map((t) => ({ date: t.date, kind: t.side, cls: k, units: t.quantity, amount: Math.abs(t.settled) })));
      costBasis = r2(ledger.costHeld); realizedPnL = r2(ledger.realisedGain); costOfUnitsSold = r2(ledger.costSold);
      const dates = ledger.lots.filter((l) => l.units > EPS).map((l) => l.date).sort();
      if (dates.length) heldPurchases = { first: dates[0], last: dates.at(-1), lots: dates.length };
    } else if (!sold && typeof p.costBasis === "number") {
      costBasis = r2(p.costBasis + mine.reduce((s, t) => s + Math.abs(t.settled), 0));
      realizedPnL = p.realizedPnL ?? null; costOfUnitsSold = p.costOfUnitsSold ?? null;
    }
    rows.push({ securityKey: k, statement: p, quantity, price: quantity > EPS ? priceOf(k) : null, priceAsOf: priced.has(k) ? F : mine.at(-1)?.date ?? F,
      costBasis, realizedPnL, costOfUnitsSold, trades: mine.length, ...(heldPurchases ? { heldPurchases } : {}),
      security: p?.security ?? mine[0]?.security ?? values.find((v) => v.securityKey === k)?.security ?? k });
  }
  // Cash lines: the fact sheet's own figure, the cash line settled for any later trade; a line it no longer prints is nil.
  const settledAfter = after.reduce((s, t) => s + (t.side === "sell" ? 1 : -1) * Math.abs(t.settled), 0);
  for (const p of cash) {
    const v = (fsValue.get(p.securityKey) ?? 0) + (p === cashLine ? settledAfter : 0);
    rows.push({ securityKey: p.securityKey, statement: p, quantity: r2(v), price: 1, priceAsOf: F, cash: true,
      costBasis: r2(v), realizedPnL: null, costOfUnitsSold: null, trades: p === cashLine ? after.length : 0, security: p.security });
  }
  for (const v of values) {
    if (keys.has(v.securityKey) || cash.some((p) => p.securityKey === v.securityKey)) continue;
    rows.push({ securityKey: v.securityKey, statement: null, quantity: r2(v.marketValue), price: 1, priceAsOf: F, cash: true,
      costBasis: r2(v.marketValue), realizedPnL: null, costOfUnitsSold: null, trades: 0, security: v.security });
  }
  return { through: tapeTo, factSheetAsOf: F, factSheet: factSheet.docKey, trades: trades.length, rows,
    demergers: children.map((d) => ({ parentKey: d.parentKey, childKey: d.childKey, recordDate: d.recordDate, ratio: d.ratio })) };
}
