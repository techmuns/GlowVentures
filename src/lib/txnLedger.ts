/**
 * ── ONE DATED RECORD PER THING, FROM THE TWO THE STATEMENTS PUBLISH ─────────
 *
 *   *"why are there 'capital in and out/trades' toggle switch provided when…
 *    There is no need of that. Just show all the transactions of different
 *    categories in the Category filter page, and then same in the Asset
 *    classes, buckets. Show all the data in the same table just like as it is
 *    in the holding page… Suppose there is a transaction in a PMS mandate, then
 *    show the name of the PMS mandate and after clicking on that row we should
 *    be able to see drop down of all the transactions within that PMS."*
 *
 * The Transactions card carried a TOGGLE between the family's own dated capital
 * and their managers' dealing. This merges the two into one row set, keyed the
 * way both already key, so the card draws one table sectioned on the same
 * Category / Asset class / Basket axis the Holdings table uses.
 *
 * ── THE ROW MERGES; THE MONEY DOES NOT ──────────────────────────────────────
 *
 * This is the whole of what makes the merge safe, and it is MEASURED on the
 * rendered page rather than feared. A contribution moves money INTO an account;
 * a trade moves it about INSIDE one. Summing the two blocks into a single
 * "Bought" column reports the family as having put in
 *
 *     ₹221.5 Cr paid in + ₹70.4 Cr the managers spent  =  ₹291.9 Cr
 *
 * against a real ₹221.5 Cr — a ₹70.4 Cr overstatement on the figure a reader
 * scans for, every one of those three the page's own printed total. THREE rows
 * carry both halves and each is overstated on its own line: Green Lantern
 * 510861 ₹10 Cr + ₹1.75 Cr, SVAN 8710067 ₹14.5 Cr + ₹1.31 Cr, SVAN 8710090
 * ₹9.5 Cr + ₹85.4 L.
 *
 * So the row is one row and the COLUMNS stay in two blocks that are never
 * added — Committed / Purchase / Redemption / Realised / Unrealised, and
 * Bought / Sold / P&L on sales — each summed down its own column into its own
 * footer cell. (It was Capital in / out / Net invested until Stage 10bw: a net
 * that subtracted a redemption CARRYING appreciation from what was paid in, so
 * 3P read −₹2.56 Cr of "net invested" and every return struck on it was wrong.) A cell whose row
 * has no half to fill it renders `AbsentCell` with the reason, which is this
 * book's standing rule for a figure that exists for some rows and not others.
 *
 * ── AND THE FIRST MEASUREMENT OF THAT OVERLAP WAS WRONG ─────────────────────
 *
 * It was taken by walking the archive's `transaction-statement` documents
 * directly and found ONE overlapping account carrying ₹3.51 Cr of dealing. Both
 * halves are wrong: `loadTransactions` applies `AUTHORITATIVE`, which also names
 * SVAN's SEBI INVESTOR REPORT for transactions — so THREE accounts carry both —
 * and it supersedes and dedupes, so Green Lantern's own dealing is ₹1.75 Cr on
 * the tape the page draws rather than a raw sum of every matching document. The
 * figures above are read off the RENDERED PAGE, which is the only place the
 * question is actually settled.
 *
 * ── AND THE TWO HALVES KEY THE SAME WAY ALREADY ─────────────────────────────
 *
 *   `capitalRollup`      one group per ACCOUNT
 *   `rollup(…,"auto")`   one group per MANDATE (a PMS account) or per SECURITY
 *
 * So an account's capital record and its mandate's dealing land on one key by
 * construction, and a security row cannot collide with either. Measured on the
 * rendered page: 34 rows, of which 11 carry a capital record and 26 a trades
 * group, three carry both — and the two non-mandate trade accounts (Buoyant's
 * AIF folio and the LKP broking account) publish no capital record at all, so
 * no security row collides with one.
 *
 * ── A DISAGREEMENT ABOUT THE SECTION DRAWS TWO ROWS, RATHER THAN PICKING ────
 *
 * The section is part of the key, exactly as it is inside `rollup` — a group
 * that spanned two sections and was summed into both would double-count itself
 * in whichever footer read the sections. The two halves reach a section through
 * different helpers (`forAccount` from the account's own holdings, `forTxn`
 * from the trade), and where those disagree the account draws a capital row in
 * one section and a trades row in the other rather than either winning
 * silently. Measured on this book that is ZERO rows on all three axes, and
 * `txnLedger.test.ts` asserts it — but "measured today" is not "true by
 * construction", which is why the honest failure is two rows and not a guess.
 */
import { acctKey, rollupTotals, type GroupRow } from "./txnRollup";
import { sumOrNull } from "./analytics";
import { capitalTotals, type CapitalGroup } from "./tranches";
import { sortRows, type TxnSort } from "./txnSort";

/** What a merged row is the dated record OF. */
export type DatedRowKind =
  /** An account — a mandate the family funded, or a fund folio. */
  | "account"
  /** A security dealt outside a mandate — the family's own, or a fund folio's. */
  | "security";

export type DatedRow = {
  /** `<section>\0acct:<provider>|<accountNo>` or `<section>\0sec:<securityKey>`. */
  key: string;
  section: string;
  kind: DatedRowKind;
  label: string;
  /** The second line: whose money, which house, which account number. */
  sublabel: string | null;
  /**
   * The account this row is about, where it is about one. Null on a SECURITY
   * row, which is an instrument dealt across however many accounts carried it
   * — the account is not a property of it.
   */
  accountId: string | null;
  /**
   * THE TWO HALVES, KEPT APART. Either may be null and at least one is not.
   * Every money column reads exactly one of them, which is what stops a reader
   * — or a future edit — adding a contribution to a trade.
   */
  capital: CapitalGroup | null;
  trades: GroupRow | null;
  /**
   * What the ACCOUNT is worth today, from the book — a fact about the account
   * and not about either dated record, which is why it is resolved once here
   * rather than taken off the capital half. Null on a security row.
   */
  value: number | null;
  /**
   * The dated span across BOTH halves — what the table is ORDERED on, and the
   * only figure here that neither half can supply alone.
   *
   * A COUNT of the dated rows behind the row sat here too and was DELETED: the
   * two counts are already columns (How it went in, Trades), and a third
   * summing them would be a figure under no heading — read by its own test and
   * by nothing else, which is the dead-field failure this repo keeps naming.
   */
  first: string;
  last: string;
};

/**
 * Merge the two rollups into one row set.
 *
 * Pure in its arguments, the seam every helper here uses: the caller supplies
 * the already-filtered, already-sectioned halves, so the arithmetic can be
 * exercised against a fixture rather than against whatever the drop contains.
 *
 * `sectionOfAccount` is asked for the capital half's section — `forAccount` in
 * `txnAxis.ts`, which delegates to `groupKeyFor` rather than answering itself.
 * The trades half already carries its own.
 *
 * ── AND THE MERGE ORDERS ITS OWN OUTPUT ─────────────────────────────────────
 *
 * The first cut returned the map's INSERTION order — every capital row, then
 * every trades row — so 23 of this book's 34 rows were in no order at all under
 * a card whose default the family asked for by name: *"by default the
 * transactions show from newest to oldest."* Both rollups sort their own output
 * and the merge threw it away; nothing on screen said so, and the ordering
 * check did not see it because it read the capital rows alone. Widening that
 * check to every row is what found it.
 *
 * "LARGEST FIRST" RANKS ON THE ROW'S BIGGEST SINGLE BLOCK, never on the two
 * added. `Math.max` of what the family paid in and what their managers dealt is
 * the largest figure the row actually carries; adding them is the ₹70.4 Cr
 * defect this module exists to refuse, and it would arrive here as an ORDER
 * rather than as a figure — which is worse, because no cell on the page would
 * contradict it.
 */
export function mergeDatedRecords(
  capital: CapitalGroup[],
  trades: GroupRow[],
  sectionOfAccount: (accountId: string) => string,
  valueOfAccount: (accountId: string) => number | null,
  sort: TxnSort = "recent",
): DatedRow[] {
  const byKey = new Map<string, DatedRow>();

  const span = (r: DatedRow) => {
    const dates = [r.capital?.first, r.capital?.last, r.trades?.first, r.trades?.last]
      .filter((d): d is string => !!d).sort();
    r.first = dates[0] ?? "";
    r.last = dates.at(-1) ?? "";
  };

  for (const g of capital) {
    const section = sectionOfAccount(g.accountId);
    const key = `${section}\u0000acct:${acctKey(g.provider, g.accountNo)}`;
    const row: DatedRow = {
      key, section, kind: "account",
      label: g.label,
      // THE PROVIDER IS ALWAYS ON THE SECOND LINE, for the reason `txnRollup`
      // gives: a strategy name is whatever the manager printed, and Molecule's
      // is the single word "GROWTH", which as a heading names nobody.
      sublabel: [g.owner, g.label === g.provider ? null : g.provider, g.accountNo].filter(Boolean).join(" · ") || null,
      accountId: g.accountId,
      capital: g, trades: null,
      value: valueOfAccount(g.accountId),
      first: "", last: "",
    };
    span(row);
    byKey.set(key, row);
  }

  for (const t of trades) {
    // `rollup` already builds `<section>\0acct:…` / `<section>\0sec:…`, which is
    // the same key space the capital half above writes into — so a mandate's two
    // halves land on one row without either side re-deriving the other's
    // identity.
    const existing = byKey.get(t.key);
    if (existing) {
      existing.trades = t;
      span(existing);
      continue;
    }
    const isAccount = t.key.includes("\u0000acct:");
    const row: DatedRow = {
      key: t.key, section: t.section,
      kind: isAccount ? "account" : "security",
      label: t.label, sublabel: t.sublabel,
      accountId: isAccount ? t.accountId : null,
      capital: null, trades: t,
      // A MANDATE THE FAMILY FUNDED BEFORE THIS ARCHIVE BEGINS IS STILL WORTH
      // SOMETHING TODAY. Nine of this book's ten mandates publish no dated
      // capital record at all, and the account's market value is a fact about
      // the ACCOUNT rather than about either dated record — so it is filled
      // from the same place the capital half's is, rather than left absent
      // because one document is missing.
      value: isAccount && t.accountId ? valueOfAccount(t.accountId) : null,
      first: "", last: "",
    };
    span(row);
    byKey.set(t.key, row);
  }

  /**
   * Sorted by KEY first so the mode's own comparator, which is stable, resolves
   * every tie the same way on every run rather than however the Map happened to
   * be filled — the rule `capitalRollup` already follows one level down.
   */
  const out = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  return sortRows(out, sort, (r) => {
    const paidIn = r.capital && r.capital.contributions > 0 ? r.capital.paidIn : null;
    const dealt = r.trades && (r.trades.bought != null || r.trades.sold != null)
      ? (r.trades.bought ?? 0) + (r.trades.sold ?? 0) : null;
    return paidIn == null && dealt == null ? null : Math.max(paidIn ?? 0, dealt ?? 0);
  });
}

/**
 * The footer, summed FROM the rows on screen — never recomputed off either
 * source again.
 *
 * Each column totals its OWN half. A footer that added the two would be the
 * ₹13.51 Cr defect one level up, and a footer derived independently of its own
 * rows can be right on its own terms while every row above it is wrong, which
 * is the Private Market page's PM-1 and the reason `rollupTotals` and
 * `capitalTotals` already work this way.
 */
export function datedTotals(rows: DatedRow[]) {
  const cap = rows.map((r) => r.capital).filter((c): c is CapitalGroup => !!c);
  const trd = rows.map((r) => r.trades).filter((t): t is GroupRow => !!t);
  /**
   * EACH HALF TOTALLED BY THE FUNCTION THAT ALREADY OWNS IT.
   *
   * `capitalTotals` and `rollupTotals` lost their last on-screen caller when the
   * two tables became one, and the first cut of this REIMPLEMENTED both — two
   * definitions of the capital footer and two of the trades one, free to
   * disagree the first time either was edited, which is the failure
   * `holdingBucket` and `costCoversSet` were each extracted to stop. Calling
   * them instead keeps one definition per half AND keeps their own suites
   * checking a live path rather than a function nothing runs.
   */
  const c = capitalTotals(cap);
  const t = rollupTotals(trd);
  return {
    rows: rows.length,
    accounts: c.accounts,
    contributions: c.contributions,
    withdrawals: c.withdrawals,
    paidIn: c.paidIn,
    tookOut: c.tookOut,
    /**
     * NET INVESTED IS GONE, AND IT WAS NOT A LAYOUT CHOICE.
     *
     * It was purchases less redemptions, and a redemption is principal PLUS
     * appreciation — so the footer subtracted every rupee of gain that had come
     * back from the money that went in, exactly as each row did (3P read
     * −₹2.56 Cr). Redemption and appreciation are their own columns now, each
     * totalled over the rows that state one, and nothing adds or subtracts them
     * from the purchase column.
     */
    redemption: cap.length === 0 ? null : c.redemption,
    redemptionOf: c.redemptionOf,
    committed: c.committed,
    committedOf: c.committedOf,
    /**
     * VALUE IS THIS MODULE'S OWN, and deliberately not `capitalTotals.value`.
     * That one is struck over the capital groups; this is struck over the
     * ACCOUNT ROWS, which includes the nine mandates that publish no dated
     * capital record and are worth ₹138.7 Cr between them. The count rides with
     * it so the cell can say how much of the table it covers — a security row
     * is an instrument rather than an account and contributes none.
     */
    value: sumOrNull(rows.map((r) => r.value)),
    valueOf: rows.filter((r) => r.value !== null).length,
    /**
     * APPRECIATION AND ITS TWO PARTS, over the capital rows that PUBLISH each —
     * `capitalTotals`' own `sumOrNull`, so a withheld figure is skipped rather
     * than blended in as zero and the count says how many rows stand behind it.
     * They are AMOUNTS, which is why they get a total where a return — a rate
     * on each row's own denominator — cannot.
     */
    appreciation: c.appreciation,
    appreciationOf: c.appreciationOf,
    realisedGain: c.realised,
    realisedGainOf: c.realisedOf,
    unrealisedGain: c.unrealised,
    unrealisedGainOf: c.unrealisedOf,
    trades: t.trades,
    buys: t.buys,
    sells: t.sells,
    bought: t.bought,
    sold: t.sold,
    realized: t.realized,
    realizedOf: t.realizedOf,
    securities: t.securities,
  };
}

export type DatedSectionRows = {
  key: string;
  rows: DatedRow[];
  totals: ReturnType<typeof datedTotals>;
};

/**
 * The sections, in the axis's own reading order, each subtotal summed from the
 * rows that section draws — `orderSections` in `txnAxis.ts`, so this table and
 * the Holdings table cannot draw the same sections in a different order.
 */
export function datedSectionRollup(
  rows: DatedRow[],
  order: (keys: string[]) => string[],
): DatedSectionRows[] {
  const by = new Map<string, DatedRow[]>();
  for (const r of rows) (by.get(r.section) ?? by.set(r.section, []).get(r.section)!).push(r);
  return order([...by.keys()]).map((key) => {
    const rs = by.get(key) ?? [];
    return { key, rows: rs, totals: datedTotals(rs) };
  });
}
