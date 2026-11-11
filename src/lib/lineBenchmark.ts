/**
 * ── EACH RETURNS-TAB ROW AGAINST ITS OWN INDEX, ON ITS OWN MONEY (Stage 10mq) ─
 *
 *   *"the market return column and the return XIRR column are showing the same
 *    returns … replace the market column with benchmark return similar to what
 *    we have in portfolio monitor … appropriate benchmarks for different
 *    investments."*
 *
 * The Market return column restated the Return column wherever a row is one
 * holding: both were that holding's own move over the period. It is replaced by
 * the index the row would have earned on the same money.
 *
 *  - WHICH INDEX is Portfolio Monitor's (`holdingBenchmark.ts`, Stage 10kd): a
 *    managed account by the benchmark its manager's report prints, a listed
 *    share by AMFI's size class, a fund by its category, a private holding the
 *    Nifty 500. Cash, debt, arbitrage and hybrid holdings have no index the feed
 *    carries and are named, never given one.
 *  - ON WHICH MONEY: every unit behind the row's figure — its opening value and
 *    each dated payment in or out — goes into ITS OWN index on the day it moved
 *    and closes on the unit's own closing date (the public-market equivalent,
 *    `pmeWindowRows` / `pmeInceptionRows`). A row holding different kinds is
 *    therefore a blend of each holding's own index, weighted by its own money.
 *  - BY WHICH MEASURE: the Return column's own (`measureWindow` /
 *    `measureInception`, the same type and debt rule), so an absolute return
 *    under a year is compared with the index's absolute return, an XIRR with
 *    the index's XIRR.
 *
 * A unit with no index, or whose index has no close on a date its money moved,
 * is left out of BOTH sides of the comparison and named: `book` is the row's
 * figure over the same units, so the gap never sets an index over part of the
 * money beside a return over all of it.
 */
import { allDebt } from "./analytics";
import { datedSinceInvestment } from "./cardBenchmark";
import { rowBenchmark, type HoldingBenchmark } from "./holdingBenchmark";
import { measureInception, measureWindow, pmeInceptionRows, pmeWindowRows, type AccountWindow, type IndexLevel, type InceptionRow, type ReturnType } from "./periodReturns";
import type { Benchmark, BenchmarkKey } from "./benchmarks";
import type { ReturnSelection, ReturnUnit, SelectedLine } from "./selectedSegmentReturns";
import type { Account, CapitalMove, PositionTranches } from "./types";

export type UnitLevels = (key: BenchmarkKey) => { level: IndexLevel } | { reason: string; pending?: true };

export type BenchContext = {
  isMandate: (accountId: string) => boolean;
  moves: readonly CapitalMove[];
  tranches: Readonly<Record<string, PositionTranches>>;
  accounts: readonly Account[];
};

/** One index the row's money went into: how much, and why that index (null where its holdings' reasons differ). */
export type BenchUse = { bench: Benchmark; why: string | null; units: number; invested: number };
/** `noIndex`: the holding has no index the feed carries (cash, debt, arbitrage, hybrid, metal) — not a gap in its record. */
export type BenchLeftOut = { label: string; invested: number; why: string; noIndex?: true };

export type LineBenchmark = {
  uses: BenchUse[];
  left: BenchLeftOut[];
  coveredInvested: number;
  totalInvested: number;
  /** The index figure, on the Return column's measure. */
  pct: number | null;
  annual: boolean;
  shownAs: ReturnType | null;
  /** The row's own figure over the same units the index was bought with. */
  book: number | null;
  /** The dates the index was first bought and last closed on. */
  from: string | null;
  to: string | null;
  reason: string | null;
  /** The index closes are still loading — not a gap in the record. */
  pending?: true;
};

/** The index one return unit is compared with: a whole managed account by its manager's report, otherwise its holdings'. */
export function unitBenchmark(u: ReturnUnit, isMandate: (accountId: string) => boolean): HoldingBenchmark {
  if (u.key === u.accountId && isMandate(u.accountId)) return rowBenchmark(u.positions, [u.accountId]);
  const held = u.positions.filter((p) => p.marketValue > 0);
  return rowBenchmark(held.length ? held : u.positions, null);
}

const NO_RETURN = "This row has no measured return, so there is no dated money to put into an index.";

export function lineBenchmark(line: SelectedLine, selection: ReturnSelection, levels: UnitLevels, ctx: BenchContext): LineBenchmark {
  const totalInvested = line.units.reduce((s, u) => s + u.invested, 0);
  const none = (reason: string, extra: Partial<LineBenchmark> = {}): LineBenchmark => ({ uses: [], left: [], coveredInvested: 0, totalInvested,
    from: null, to: null, pct: null, annual: false, shownAs: null, book: null, reason, ...extra });
  if (!line.units.length || line.returnPct == null) return none(NO_RETURN);

  const absoluteInception = selection.inception && selection.type === "absolute";
  const left: BenchLeftOut[] = [];
  const leave = (u: ReturnUnit, why: string, noIndex = false) => left.push({ label: u.label, invested: u.invested, why, ...(noIndex ? { noIndex: true as const } : {}) });
  const priced: { u: ReturnUnit; hb: HoldingBenchmark & { bench: Benchmark }; level: IndexLevel }[] = [];
  for (const u of line.units) {
    const hb = unitBenchmark(u, ctx.isMandate);
    if (!hb.bench) { leave(u, hb.why, true); continue; }
    const lv = levels(hb.bench.key);
    // A close still loading holds the whole cell, so the figure never moves as fetches settle.
    if ("reason" in lv) {
      if (lv.pending) return none(lv.reason, { pending: true });
      leave(u, `${hb.bench.name}: ${lv.reason}`);
      continue;
    }
    priced.push({ u, hb: hb as HoldingBenchmark & { bench: Benchmark }, level: lv.level });
  }

  const debt = { debt: allDebt(line.units.flatMap((u) => u.positions)) };
  const covered: typeof priced = [];
  let from: string | null = null, to: string | null = null, pct: number | null = null, book: number | null = null, annual = false, shownAs: ReturnType | null = null, reason: string | null = null;

  if (absoluteInception) {
    // Gain over the money invested, unit by unit: a unit measured from a value
    // (`window`) puts that value into the index; one bought with dated money, those payments.
    let indexGain = 0, indexBase = 0, bookGain = 0, bookBase = 0;
    for (const x of priced) {
      if (x.u.window) {
        const p = pmeWindowRows([x.u.window], x.level);
        if (!p.rows) { leave(x.u, p.reason); continue; }
        indexGain += p.rows[0].gain; indexBase += x.u.invested;
      } else {
        const c = datedSinceInvestment([x.u], ctx.moves, ctx.tranches, ctx.accounts).dated[0];
        if (!c) { leave(x.u, "Not every purchase behind it is dated, so the index cannot be bought with the same money."); continue; }
        const l1 = x.level(c.closeOn);
        if (l1 == null || !(l1 > 0)) { leave(x.u, `the index has no close on or before ${c.closeOn}`); continue; }
        let g = 0, gap: string | null = null;
        for (const f of c.flows) {
          const l = x.level(f.date);
          if (l == null || !(l > 0)) { gap = `the index has no close on or before ${f.date}, when its money moved`; break; }
          g += -f.amount * (l1 / l) + f.amount;
        }
        if (gap) { leave(x.u, gap); continue; }
        indexGain += g; indexBase += c.paidIn;
      }
      bookGain += x.u.gain; bookBase += x.u.invested;
      covered.push(x);
    }
    if (covered.length && indexBase > 0 && bookBase > 0) {
      pct = (indexGain / indexBase) * 100; book = (bookGain / bookBase) * 100; shownAs = "absolute";
    }
  } else if (selection.inception) {
    const index: InceptionRow[] = [], own: InceptionRow[] = [];
    for (const x of priced) {
      if (!x.u.inception) { leave(x.u, "Its return is not measured from a dated capital record."); continue; }
      const p = pmeInceptionRows([x.u.inception], x.level);
      if (!p.rows) { leave(x.u, p.reason); continue; }
      index.push(p.rows[0]); own.push(x.u.inception); covered.push(x);
    }
    if (index.length) {
      const m = measureInception(index, selection.type, String, debt), b = measureInception(own, selection.type, String, debt);
      if (m.shown && m.pct != null && Number.isFinite(m.pct)) { pct = m.pct; annual = m.basis === "annual"; shownAs = m.shownAs ?? selection.type; from = m.working?.from ?? null; to = m.working?.to ?? null; }
      else reason = m.reason ?? "the index's flows do not yield this measure";
      book = b.shown && b.pct != null && Number.isFinite(b.pct) ? b.pct : null;
    }
  } else {
    const index: AccountWindow[] = [], own: AccountWindow[] = [];
    for (const x of priced) {
      if (!x.u.window) { leave(x.u, "Its return is not measured over a dated window."); continue; }
      const p = pmeWindowRows([x.u.window], x.level);
      if (!p.rows) { leave(x.u, p.reason); continue; }
      index.push(p.rows[0]); own.push(x.u.window); covered.push(x);
    }
    if (index.length) {
      const m = measureWindow(index, selection.type, String, debt), b = measureWindow(own, selection.type, String, debt);
      // Each record closes the index on its OWN closing date; one carried flat to the period's end adds nothing after it.
      if (m.shown && m.pct != null && Number.isFinite(m.pct)) { pct = m.pct; annual = m.basis === "annual"; shownAs = m.shownAs ?? selection.type; from = m.working?.from ?? null; to = index.map((r) => r.closeDate).sort().at(-1) ?? null; }
      else reason = m.reason ?? "the index's flows do not yield this measure";
      book = b.shown && b.pct != null && Number.isFinite(b.pct) ? b.pct : null;
    }
  }

  const uses = new Map<BenchmarkKey, BenchUse>();
  for (const x of covered) {
    const k = x.hb.bench.key, had = uses.get(k);
    if (had) { had.units++; had.invested += x.u.invested; if (had.why !== x.hb.why) had.why = null; }
    else uses.set(k, { bench: x.hb.bench, why: x.hb.why, units: 1, invested: x.u.invested });
  }
  const coveredInvested = covered.reduce((s, x) => s + x.u.invested, 0);
  if (!covered.length) reason = left.length === 1 ? left[0].why : left.length && left.every((l) => l.why === left[0].why) ? left[0].why
    : "No holding behind this row has an index the price feed carries with its money dated over these dates.";
  return { uses: [...uses.values()].sort((a, b) => b.invested - a.invested), left, coveredInvested, totalInvested,
    from: pct == null ? null : from, to: pct == null ? null : to, pct, annual, shownAs, book: pct == null ? null : book, reason: pct == null ? reason ?? NO_RETURN : null };
}
