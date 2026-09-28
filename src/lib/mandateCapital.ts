/**
 * WHAT A MANDATE'S HOLDINGS COST, AGAINST WHAT WAS PAID IN (DSM-C6).
 *
 * A mandate page carries two figures a reader takes for one: the Invested tile,
 * which is the COST OF WHAT IS HELD — the shares the manager owns and the cash
 * it holds back — and the capital card below it, which is what the family PAID
 * IN less what it took out. SVAN 8710067 read ₹15.4 Cr on the tile and ₹14.5 Cr
 * on the card, with nothing on the page saying why.
 *
 * On a whole mandate the two are tied exactly, and FIFO says how: everything
 * the manager has banked — gains on shares sold, dividends and interest, less
 * fees — stays in the account as cash or is reinvested, so
 *
 *     cost of what is held = paid in − taken out + realised
 *
 * which is the identity `fifoTotals` strikes a whole mandate's realised on. This
 * is published ONLY where it holds to the rupee on the figures the page prints:
 * every row reports a cost (a skipped row's cost would otherwise be counted as
 * a gain), the account publishes its capital, and the three reproduce the cost.
 * Which basis the Invested tile should show is the family's question (delta
 * Q2); this changes neither, it names both and ties them.
 */
export type InvestedReconciliation = {
  costHeld: number;
  paidIn: number;
  takenOut: number;
  realised: number;
};

export function investedReconciliation(input: {
  /** Σ cost of the rows held, or null where none reports one. */
  costHeld: number | null;
  /** Rows reporting no cost. The identity needs every row's. */
  uncostedRows: number;
  /** The account's own capital record. */
  capital: { contributed: number; withdrawn: number } | null | undefined;
  /** FIFO's realised for the WHOLE mandate. */
  realised: number | null;
  /** The set is the whole mandate, not a filtered part of it. */
  wholeMandate: boolean;
}): InvestedReconciliation | null {
  const { costHeld, uncostedRows, capital, realised, wholeMandate } = input;
  if (!wholeMandate || uncostedRows > 0 || costHeld == null || realised == null || !capital) return null;
  if (!Number.isFinite(costHeld) || !Number.isFinite(realised) || !(capital.contributed > 0)) return null;
  const ties = Math.abs(capital.contributed - capital.withdrawn + realised - costHeld) <= 1;
  return ties ? { costHeld, paidIn: capital.contributed, takenOut: capital.withdrawn, realised } : null;
}
