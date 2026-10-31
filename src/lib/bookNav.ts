/**
 * ── THE WHOLE BOOK'S NAV, STRUCK FROM THE DATED RECORD (Stage 10ge) ─────────
 *
 *   *"now that we have a lot more holdings invested and purchase dates in the
 *    dashboard holdings data we should be able to fill this NAV completely and
 *    accurately now. Fix this NAV according to the principal investment,
 *    additional capital brought in, buys and sale transactions, dividends …
 *    everything basically."*
 *
 * `BOOK_NAV_HISTORY` is struck over the accounts whose STATEMENTS value them
 * twice — 21 of 80, ₹247 Cr of an ₹837 Cr book — and holds each at its mark
 * with the capital between two marks netted at the later one. Everything else
 * the book now carries was outside it: the Sanshi folios valued once, the
 * review's private lines, every fund whose money went in on a dated call, and
 * the purchase dates Stage 10fm and 10fw put behind the holdings.
 *
 * This series is the WHOLE book, one unit per investment (an account, or a line
 * of the review's holder buckets, which are separate investments — Stage 10dh):
 *
 *   value(d) = its latest valuation on or before d
 *              + the capital dated after that valuation, up to d
 *
 * A VALUATION is a statement mark, a verified financial-year opening, a return
 * record's closing, the book's own value on its statement date, or the review's
 * mark on a private line. The CAPITAL is the record every return surface reads:
 * the verified return record where one exists, otherwise the dated capital
 * record with the funds' own calls and payouts and the review's purchases,
 * sales and income (`capitalMovesWithCalls`). Principal and additional capital
 * enter on their dates at what was paid; a sale, redemption, income or dividend
 * paid out leaves on its date at what was paid out. Money therefore never reads
 * as performance, and performance is recognised only where a valuation says so.
 *
 * TWO LINES, TWO PANELS, because two different questions are asked of them:
 *
 *  · THE RETURN (the index, "ex capital flows") is chained over the units VALUED
 *    at both ends of each link, net of the capital that link carried:
 *        r = (close − capital in) / open − 1
 *    A unit joins at its first valuation in the window — or at its first payment,
 *    where its record reaches inception and that payment falls in the window —
 *    and contributes nothing on the link it joins. A line the review holds AT
 *    COST is never in it: cost is not a valuation, and a return struck over it
 *    would blend an unmeasured figure in as 0% (`AT_COST_RETURN`).
 *  · THE NAV LEVEL ("incl. capital added") is every rupee the book holds: a unit
 *    not yet valued is carried at what was paid for it, which is how a fund's
 *    administrator carries an investment until it is first marked, and an
 *    at-cost line is at its cost throughout.
 *
 * WHAT IT DOES NOT DO: interpolate between valuations, price a holding off a
 * market quote, or take a purchase price as a valuation of anything bought
 * before the window opens. A fund bought in 2025 and first valued on 30 Jun 2026
 * joins the return on 30 Jun, because its value on the window's first day is
 * nowhere in the archive. A step between two valuations whose capital no record
 * covers is carried as `unreportedFlowValue` and named, as before.
 */
import type {
  Account, AccountReturnCoverage, CapitalMove, Commitment, NavCoverage, NavPoint, Position,
  PositionTranches, ReviewFlow,
} from "./types";
import { capitalMovesWithCalls, contributionsAreComplete } from "./tranches";
import { isValuedAtCost } from "./analytics";

/**
 * Where a unit's valuation on a date comes from. `nil` is the day the record's
 * own running unit balance returns to nothing — a full redemption, which is a
 * measured ₹0 however the money was carried before it. `assumed` is a demat's
 * listed shares at a published close, carried forward from their statement
 * (`assumedBookNav.ts`, Stage 10iz) — never part of the statement series.
 */
export type NavMarkSource = "statement" | "opening" | "record" | "book" | "review" | "nil" | "assumed";

export type NavUnitMark = { date: string; value: number; source: NavMarkSource };

/**
 * ONE INVESTMENT, as the series reads it.
 *
 * `flows` is external capital, POSITIVE IN: a contribution, call or purchase is
 * positive; a redemption, sale, income or dividend paid out, or tax deducted
 * from the account, is negative. A manager's trades inside a mandate are not
 * here — they move nothing in or out of the account, and its marks carry them.
 */
export type NavUnit = {
  key: string;
  accountId: string;
  /** The line, for a unit that is one line of a review holder bucket or a review-valued account. */
  securityKey: string | null;
  marks: NavUnitMark[];
  flows: { date: string; amount: number }[];
  /**
   * The unit's first payment, where its record reaches inception — it held
   * nothing before this day. Null where the record starts part-way.
   */
  origin: string | null;
  /**
   * True where the origin's payments are each dated. False where the review
   * gives only the month or span the money went in, and the unit is carried at
   * cost from the end of that span: good enough to put the money in the NAV
   * level, never a valuation a return could start from.
   */
  originDated: boolean;
  /** Held at cost by the review — in the NAV level, never in the return. */
  atCost: boolean;
  /** The date through which the unit's dated capital is complete. */
  recordTo: string | null;
  /** The build's own proof of each step between two statement marks (`proveLink`). */
  steps: { from: string; to: string; basis: string; net: number | null }[];
  /** What the statement book carries for it today. */
  bookValue: number;
};

export type BookNavInput = {
  accounts: readonly Account[];
  /** The STATEMENT book — the series is struck on statement marks (MNT-25). */
  positions: readonly Position[];
  moves: readonly CapitalMove[];
  commitments: readonly Commitment[];
  reviewFlows: readonly ReviewFlow[];
  tranches: Record<string, PositionTranches>;
  fromInception: readonly string[];
  /** Each account's dated statement valuations (`BOOK_ACCOUNT_NAV_HISTORY`). */
  accountNav: Record<string, readonly NavPoint[]>;
  /** The selected return record per account (`BOOK_ACCOUNT_RETURN_RECORDS`). */
  returnRecords: Record<string, AccountReturnCoverage>;
  /** The statement series' coverage, for its per-step proofs (`BOOK_NAV_COVERAGE`). */
  coverage: NavCoverage;
};

/** The book's own speck floor (`currentHoldings`): below it a balance is a residue, not a holding. */
const SPECK = 1000;

const DAY = 86_400_000;
const shift = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** A position carries money unless it is a ₹0 line with no cost (`datedCapital.ts`). */
const carries = (p: Position) => p.marketValue !== 0 || (typeof p.costBasis === "number" && p.costBasis !== 0);

/** A capital move as signed money in. Null where the statement prints no amount. */
const signedMove = (m: CapitalMove): number | null =>
  m.amount == null ? null : m.direction === "in" ? m.amount : -m.amount;

/**
 * Marks keyed by date, the stronger source winning a date two sources both
 * value: the selected return record, then the book's own holdings, then the
 * statement series, then a printed opening.
 */
const RANK: Record<NavMarkSource, number> = { record: 0, review: 0, book: 1, statement: 2, opening: 3, nil: 4, assumed: 5 };

/**
 * THE DAYS A RECORD'S OWN UNITS RUN OUT. Where every move carries its units, a
 * running balance that returns to nothing after a redemption is a valuation of
 * ₹0 on that day. Without it a fund redeemed at a gain — paid out more than was
 * paid in — would be carried at a cost that does not exist until the next
 * statement struck its nil.
 */
function nilMarks(moves: readonly CapitalMove[]): NavUnitMark[] {
  if (!moves.length || moves.some((m) => m.units == null)) return [];
  const out: NavUnitMark[] = [];
  const byDate = new Map<string, number>();
  for (const m of moves) byDate.set(m.date, (byDate.get(m.date) ?? 0) + Math.abs(m.units as number) * (m.direction === "in" ? 1 : -1));
  let bal = 0, peak = 0;
  for (const [date, du] of [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    bal += du;
    peak = Math.max(peak, bal);
    if (du < 0 && bal <= Math.max(1e-6, peak * 1e-9)) { out.push({ date, value: 0, source: "nil" }); bal = 0; peak = 0; }
  }
  return out;
}
function mergeMarks(marks: NavUnitMark[]): NavUnitMark[] {
  const by = new Map<string, NavUnitMark>();
  for (const m of marks) {
    if (!Number.isFinite(m.value)) continue;
    const cur = by.get(m.date);
    if (!cur || RANK[m.source] < RANK[cur.source]) by.set(m.date, m);
  }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const sortFlows = (fs: { date: string; amount: number }[]) =>
  fs.filter((f) => Number.isFinite(f.amount) && f.amount !== 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/**
 * A PRIVATE LINE: the review's own mark, and the review's own dated rows.
 *
 * Its record reaches inception where its dated purchases less its sales add up
 * to the cost the review carries — `reviewShortfall`'s test. A line the review
 * dates by day and none of whose purchases it itemises is one payment of its
 * cost on that day (`investedOn`'s reading of the same column). A line dated
 * only by a month or a span enters the NAV LEVEL at its cost at the end of that
 * span, and never the return: the review does not say what was paid when.
 */
function lineUnit(a: Account, p: Position, moves: readonly CapitalMove[], key: string): NavUnit {
  const flows = sortFlows(moves.map((m) => ({ date: m.date, amount: signedMove(m) ?? Number.NaN })));
  const cost = typeof p.costBasis === "number" ? p.costBasis : null;
  let origin: string | null = null;
  let originDated = false;
  if (flows.length && !moves.some((m) => m.amount == null)) {
    const bought = sum(moves.filter((m) => m.direction === "in").map((m) => m.amount ?? 0));
    const sold = sum(moves.filter((m) => m.direction === "out" && m.payoutKind === "capital").map((m) => m.amount ?? 0));
    if (cost != null && Math.abs(bought - sold - cost) <= 1) { origin = flows[0].date; originDated = true; }
  } else if (!flows.length && cost != null && cost > 0 && p.investedDates) {
    const { from, to } = p.investedDates;
    if (from === to && isDay(from)) {
      flows.push({ date: from, amount: cost });
      origin = from; originDated = true;
    } else if (/^\d{4}-\d{2}/.test(to)) {
      const end = isDay(to) ? to : monthEnd(to.slice(0, 7));
      flows.push({ date: end, amount: cost });
      origin = end; originDated = false;
    }
  }
  const markDate = p.priceAsOf ?? a.asOf;
  return {
    key, accountId: a.accountId, securityKey: p.securityKey,
    marks: mergeMarks([...nilMarks(moves), ...(markDate ? [{ date: markDate, value: p.marketValue, source: "review" as const }] : [])]),
    flows, origin, originDated,
    atCost: isValuedAtCost(p),
    // The review's rows are read off the same sheet its value is, so they run to it.
    recordTo: markDate ?? null,
    steps: [],
    bookValue: p.marketValue,
  };
}

/** Every investment the book holds or held, one unit each. */
export function navUnits(input: BookNavInput): NavUnit[] {
  const record = capitalMovesWithCalls([...input.moves], [...input.commitments], input.accounts, input.reviewFlows);
  const movesBy = new Map<string, CapitalMove[]>();
  for (const m of record) (movesBy.get(m.accountId) ?? movesBy.set(m.accountId, []).get(m.accountId)!).push(m);
  const posBy = new Map<string, Position[]>();
  for (const p of input.positions) (posBy.get(p.accountId) ?? posBy.set(p.accountId, []).get(p.accountId)!).push(p);
  const commitmentOf = new Map(input.commitments.map((c) => [c.accountId, c]));
  const fromInception = new Set(input.fromInception);
  const stepsOf = new Map(input.coverage.covered.map((c) => [c.accountId, c.steps ?? []]));

  /**
   * A HOLDING TWO ACCOUNTS BOTH REPORT IS COUNTED ONCE (`dedupeGroup`) — the
   * statement series' rule 3, kept. Every copy after the first is left out of
   * its account's value, and that account is valued off the book's rows alone,
   * because its statement series sums every row it printed.
   */
  const seenGroup = new Set<string>();
  const dup = new Set<Position>();
  for (const p of input.positions) {
    if (!p.dedupeGroup) continue;
    if (seenGroup.has(p.dedupeGroup)) dup.add(p); else seenGroup.add(p.dedupeGroup);
  }

  const units: NavUnit[] = [];
  for (const a of input.accounts) {
    const printed = posBy.get(a.accountId) ?? [];
    const hasDup = printed.some((p) => dup.has(p));
    const all = printed.filter((p) => !dup.has(p));
    const own = all.filter(carries);
    const moves = movesBy.get(a.accountId) ?? [];
    // A REVIEW HOLDER BUCKET IS ITS LINES, and an account the review values is
    // the review's line: its statement's own series is the holding the review's
    // line replaced in the book (Stage 10dh), and mixing the two would value one
    // document's money against the other's.
    // A line the family advised is held at what was paid in the same way, and an
    // account of them runs line by line: no account value exists to measure it on.
    const advised = own.length > 0 && own.every((p) => p.costBasisSource === "family-advice");
    if (a.reviewHolder || advised || (own.length > 0 && own.every((p) => p.review))) {
      const byLine = a.reviewHolder || advised;
      for (const p of own) {
        const mine = byLine ? moves.filter((m) => m.securityKey === p.securityKey) : moves;
        units.push(lineUnit(a, p, mine, byLine ? `${a.accountId}|${p.securityKey}` : a.accountId));
      }
      continue;
    }

    const rec = input.returnRecords[a.accountId]?.record ?? null;
    const marks: NavUnitMark[] = (hasDup ? [] : input.accountNav[a.accountId] ?? [])
      .map((p) => ({ date: p.date, value: p.nav, source: "statement" as const }));
    // A fund redeemed to nil units keeps its rows at ₹0: that is a valuation too.
    if (all.length && a.asOf) marks.push({ date: a.asOf, value: sum(all.map((p) => p.marketValue)), source: "book" });
    let flows: { date: string; amount: number }[];
    let recordTo: string | null;
    let origin: string | null = null;
    if (rec) {
      // THE SELECTED RECORD (the standing rule): its opening is a valuation on
      // the day before it, its closing a valuation on its own date, and its
      // dated flows are the account's capital through that date.
      const opening = rec.flows.find((f) => /^Opening portfolio value/i.test(f.description ?? ""));
      if (opening) marks.push({ date: shift(opening.date, -1), value: -opening.amount, source: "opening" });
      marks.push({ date: rec.asOf, value: rec.value, source: "record" });
      // The record's cash rows carry no units; the capital record's do.
      marks.push(...nilMarks(moves.filter((m) => !opening || m.date >= opening.date)));
      // `CashFlow.amount` is negative for capital in.
      flows = rec.flows.filter((f) => f !== opening).map((f) => ({ date: f.date, amount: -f.amount }));
      recordTo = rec.capitalRecordTo ?? rec.asOf;
      // Where the record's flows are read off the very statement the book's
      // value is, its dated rows run to that statement's date.
      if (a.asOf && a.asOf > recordTo && (rec.flowSources ?? []).some((s) => s.includes(a.asOf as string))) recordTo = a.asOf;
    } else {
      flows = moves.map((m) => ({ date: m.date, amount: signedMove(m) ?? Number.NaN }));
      marks.push(...nilMarks(moves));
      const complete = moves.length > 0 && !moves.some((m) => m.amount == null)
        && contributionsAreComplete(a.accountId, moves, [...input.positions], input.tranches, a.inceptionDate,
          commitmentOf.get(a.accountId) ?? null, fromInception.has(a.accountId)) === null;
      const firstIn = moves.filter((m) => m.direction === "in").map((m) => m.date).sort()[0] ?? null;
      if (complete && firstIn) origin = firstIn;
      // A capital RECORD runs to the date its account says; a fund's call list
      // is read off the statement its value comes from, so it runs to that.
      recordTo = a.capitalRecordTo ?? (moves.length && moves.every((m) => m.fromCall) ? a.asOf : null);
    }
    const merged = mergeMarks(marks);
    const sorted = sortFlows(flows);
    if (!merged.length && !sorted.length) continue;
    units.push({
      key: a.accountId, accountId: a.accountId, securityKey: null,
      marks: merged, flows: sorted, origin, originDated: origin != null,
      atCost: false, recordTo,
      steps: stepsOf.get(a.accountId) ?? [],
      bookValue: sum(own.map((p) => p.marketValue)),
    });
  }
  return units.sort((x, y) => x.key.localeCompare(y.key));
}

/** The unit's latest valuation on or before `d`, or null. */
function markOnOrBefore(u: NavUnit, d: string): NavUnitMark | null {
  let hit: NavUnitMark | null = null;
  for (const m of u.marks) { if (m.date <= d) hit = m; else break; }
  return hit;
}

/**
 * The unit's value at the END of `d`: its latest valuation plus the capital
 * dated after it — or, before any valuation, what has been paid in, where the
 * record reaches inception. Null where nothing values it yet.
 *
 * NEVER BELOW NIL. A redemption is paid at the fund's price, not at the value
 * it was last carried at, so money out can exceed what was carried; a value
 * that would go negative is an investment with nothing left in it, not a debt —
 * and the gain the redemption revealed is recognised on its day.
 */
export function unitValueAt(u: NavUnit, d: string): number | null {
  const m = markOnOrBefore(u, d);
  if (m) return Math.max(0, m.value + sum(u.flows.filter((f) => f.date > m.date && f.date <= d).map((f) => f.amount)));
  if (u.origin && d >= u.origin) return Math.max(0, sum(u.flows.filter((f) => f.date <= d).map((f) => f.amount)));
  return null;
}

/**
 * WHEN A UNIT JOINS THE RETURN, given the window's first day `start`.
 *
 *  · a line held at cost — never;
 *  · a unit whose first dated payment falls in the window — that day, from nil;
 *  · a unit valued on or before `start` and not again after it — `start`,
 *    carried at that valuation (the rule every point of the series follows);
 *  · otherwise its first valuation after `start`. A valuation BEFORE the window
 *    with another after it would recognise, inside the window, a move that
 *    partly happened before it — so the unit waits for the later one.
 */
export function returnEntry(u: NavUnit, start: string): string | null {
  if (u.atCost) return null;
  if (u.origin && u.originDated && u.origin >= start) return u.origin;
  const pre = markOnOrBefore(u, start);
  const post = u.marks.find((m) => m.date > start) ?? null;
  if (pre && (pre.date === start || !post)) return start;
  return post?.date ?? null;
}

/** When a unit enters the NAV level — its first valuation, or its first payment from nil. */
export function levelEntry(u: NavUnit): string | null {
  const first = u.marks[0]?.date ?? null;
  if (u.origin && (!first || u.origin < first)) return u.origin;
  return first;
}

export type BookNavUnitCoverage = {
  key: string;
  accountId: string;
  securityKey: string | null;
  /** When it joins the return; null where it never can (held at cost, or never valued). */
  returnFrom: string | null;
  /** When it enters the NAV level. */
  levelFrom: string | null;
  /** How it joins the return. */
  entry: "start" | "payment" | "valuation" | null;
  atCost: boolean;
  bookValue: number;
  /** Its value at the series' last point, on the series' own rule. */
  endValue: number | null;
  /** Its latest valuation's date. */
  lastValued: string | null;
  /** Steps whose capital no record settles, as `from → to`. */
  unproven: string[];
};

export type BookNavCoverage = {
  from: string | null;
  to: string | null;
  units: BookNavUnitCoverage[];
  /** The date every unit the return can ever hold has joined it. */
  returnCompleteFrom: string | null;
  /** The date every unit holding value at the end is in the NAV level. */
  levelCompleteFrom: string | null;
  /** The NAV level at the last point, and the statement book it reconciles to. */
  levelEnd: number;
  statementBook: number;
  /** Valuations newer than the book's own holdings statement, and capital dated after a unit's last valuation. */
  newerMarks: number;
  capitalAfterLastValuation: number;
};

export type BookNavSeries = { points: NavPoint[]; coverage: BookNavCoverage };

/**
 * THE WINDOW'S FIRST DAY — the financial-year opening the verified return
 * records start from (Stage 10fc: "records start on 1 Apr 2026"), so the series
 * opens where the archive's valuations do. Falls back to the earliest
 * statement valuation.
 */
export function seriesStart(units: readonly NavUnit[]): string | null {
  const openings = units.flatMap((u) => u.marks.filter((m) => m.source === "opening").map((m) => m.date)).sort();
  if (openings.length) return openings[0];
  return units.flatMap((u) => u.marks.map((m) => m.date)).sort()[0] ?? null;
}

/** The whole-book series over `units`, from `start` to the latest valuation. */
export function bookNavSeries(units: readonly NavUnit[], start: string | null = seriesStart(units)): BookNavSeries {
  const empty: BookNavSeries = {
    points: [],
    coverage: {
      from: null, to: null, units: [], returnCompleteFrom: null, levelCompleteFrom: null,
      levelEnd: 0, statementBook: sum(units.map((u) => u.bookValue)), newerMarks: 0, capitalAfterLastValuation: 0,
    },
  };
  if (!start) return empty;
  const end = units.flatMap((u) => u.marks.map((m) => m.date)).sort().at(-1) ?? null;
  if (!end || end <= start) return empty;

  const returnFrom = new Map(units.map((u) => [u.key, returnEntry(u, start)]));
  const levelFrom = new Map(units.map((u) => [u.key, levelEntry(u)]));
  const dates = [...new Set([
    start,
    ...units.flatMap((u) => [...u.marks.map((m) => m.date), ...u.flows.map((f) => f.date)]),
  ])].filter((d) => d >= start && d <= end).sort();

  const holdsAtEnd = (u: NavUnit) => Math.abs(unitValueAt(u, end) ?? u.bookValue) >= SPECK;
  const inReturn = (u: NavUnit, d: string) => {
    const f = returnFrom.get(u.key);
    return f != null && d >= f && unitValueAt(u, d) != null;
  };
  const inLevel = (u: NavUnit, d: string) => {
    const f = levelFrom.get(u.key);
    return f != null && d >= f && unitValueAt(u, d) != null;
  };
  // COMPLETE ONCE THE LAST ARRIVAL IS IN. A unit that joins from nil on its first
  // payment held nothing before it, so its joining leaves nothing out; one that
  // joins at a valuation was there all along, unmeasured, until that day.
  const fromNil = (u: NavUnit, d: string | null | undefined) => d != null && u.origin === d && u.originDated;
  const returnCompleteFrom = units
    .filter((u) => holdsAtEnd(u) && returnFrom.get(u.key) != null && !fromNil(u, returnFrom.get(u.key)))
    .map((u) => returnFrom.get(u.key) as string).concat(start).sort().at(-1) as string;
  const levelCompleteFrom = units
    .filter((u) => holdsAtEnd(u) && !(u.origin != null && levelFrom.get(u.key) === u.origin))
    .map((u) => levelFrom.get(u.key) ?? end).map((d) => (d < start ? start : d)).concat(start).sort().at(-1) as string;

  /**
   * HOW EACH STEP BETWEEN TWO VALUATIONS IS SETTLED — the build's proof where
   * it struck one, the dated record where it runs past the step, and otherwise
   * unproven: the step's MOVE is what might be capital, as before (A-10).
   * The proof's capital that no dated row carries lands on the step's last day.
   */
  const unprovenOf = new Map<string, string[]>();
  const settle = (u: NavUnit, a: string, b: string): { undated: number; unproven: boolean } => {
    const dated = sum(u.flows.filter((f) => f.date > a && f.date <= b).map((f) => f.amount));
    const proof = u.steps.find((s) => s.from === a && s.to === b && s.basis !== "unproven" && s.net != null);
    if (proof) return { undated: (proof.net as number) - dated, unproven: false };
    if (u.recordTo && b <= u.recordTo) return { undated: 0, unproven: false };
    (unprovenOf.get(u.key) ?? unprovenOf.set(u.key, []).get(u.key)!).push(`${a} → ${b}`);
    return { undated: 0, unproven: true };
  };
  // Each valuation of a unit that closes a step, with what settles it.
  const stepAt = new Map<string, { undated: number; unproven: boolean; move: number }>();
  for (const u of units) {
    for (let i = 1; i < u.marks.length; i++) {
      const a = u.marks[i - 1], b = u.marks[i];
      if (b.date <= start) continue;
      const s = settle(u, a.date, b.date);
      stepAt.set(`${u.key}|${b.date}`, { ...s, move: Math.abs(b.value - a.value) });
    }
    // From nil to the first valuation: settled only by a record that reaches it.
    const first = u.marks[0];
    if (first && u.origin && u.origin < first.date && first.date > start) {
      const settled = !!u.recordTo && first.date <= u.recordTo;
      if (!settled) (unprovenOf.get(u.key) ?? unprovenOf.set(u.key, []).get(u.key)!).push(`${u.origin} → ${first.date}`);
      stepAt.set(`${u.key}|${first.date}`, { undated: 0, unproven: !settled, move: Math.abs(first.value) });
    }
  }

  const points: NavPoint[] = [];
  let prev: string | null = null;
  let levelBefore = new Set<string>();
  for (const d of dates) {
    const level = units.filter((u) => inLevel(u, d));
    const nav = sum(level.map((u) => unitValueAt(u, d) as number));
    /**
     * WHAT MOVED THE LEVEL THAT IS NOT A VALUATION — the capital in or out of
     * investments already in it (new money from nil included), and the value of
     * an investment JOINING at a valuation it already had. The rest of the
     * level's move is valuations.
     */
    let levelFlowIn = 0, levelJoined = 0;
    if (prev) {
      const p0 = prev;
      for (const u of level) {
        if (levelBefore.has(u.key)) levelFlowIn += sum(u.flows.filter((f) => f.date > p0 && f.date <= d).map((f) => f.amount));
        else if (u.origin != null && levelFrom.get(u.key) === u.origin) levelFlowIn += unitValueAt(u, d) as number;
        else levelJoined += unitValueAt(u, d) as number;
      }
    }
    levelBefore = new Set(level.map((u) => u.key));
    const panel = units.filter((u) => inReturn(u, d));
    const valuedOn = panel.filter((u) => u.marks.some((m) => m.date === d) || (u.origin === d && u.originDated));
    const panelValue = sum(panel.map((u) => unitValueAt(u, d) as number));
    let linkOpen: number | null = null, linkClose: number | null = null, flowIn = 0, unknown = 0;
    let common: NavUnit[] = [];
    if (prev) {
      const p0 = prev;
      common = panel.filter((u) => inReturn(u, p0));
      linkOpen = sum(common.map((u) => unitValueAt(u, p0) as number));
      linkClose = sum(common.map((u) => unitValueAt(u, d) as number));
      for (const u of common) {
        flowIn += sum(u.flows.filter((f) => f.date > p0 && f.date <= d).map((f) => f.amount));
        const s = stepAt.get(`${u.key}|${d}`);
        if (s) { flowIn += s.undated; if (s.unproven) unknown += s.move; }
      }
    }
    points.push({
      period: d,
      date: d,
      nav: r2(nav),
      accountsOnDate: valuedOn.length,
      accountsCarried: panel.length - valuedOn.length,
      flowIn: prev ? r2(flowIn) : 0,
      unreportedFlowValue: prev ? r2(unknown) : 0,
      linkOpen: linkOpen == null ? null : r2(linkOpen),
      linkClose: linkClose == null ? null : r2(linkClose),
      linkAccounts: common.length,
      panelComplete: d >= returnCompleteFrom,
      levelComplete: d >= levelCompleteFrom,
      levelUnits: level.length,
      levelFlowIn: prev ? r2(levelFlowIn) : 0,
      levelJoined: prev ? r2(levelJoined) : 0,
      panelValue: r2(panelValue),
    });
    prev = d;
  }

  const unitsCov: BookNavUnitCoverage[] = units.map((u) => {
    const rf = returnFrom.get(u.key) ?? null;
    return {
      key: u.key, accountId: u.accountId, securityKey: u.securityKey,
      returnFrom: rf,
      levelFrom: levelFrom.get(u.key) ?? null,
      entry: rf == null ? null : rf === start ? "start" : u.origin === rf && u.originDated ? "payment" : "valuation",
      atCost: u.atCost,
      bookValue: u.bookValue,
      endValue: unitValueAt(u, end),
      lastValued: u.marks.at(-1)?.date ?? null,
      unproven: unprovenOf.get(u.key) ?? [],
    };
  });
  const levelEnd = points.at(-1)?.nav ?? 0;
  const statementBook = sum(units.map((u) => u.bookValue));
  // THE LEVEL RECONCILES TO THE STATEMENT BOOK IN TWO NAMED STEPS: a valuation
  // newer than the holdings statement the book carries, and capital dated after
  // a unit's last valuation. Each is measured per unit, never inferred.
  let newerMarks = 0, capitalAfter = 0;
  for (const u of units) {
    const last = u.marks.at(-1);
    const after = sum(u.flows.filter((f) => f.date > (last?.date ?? "") && f.date <= end).map((f) => f.amount));
    if (!last) { capitalAfter += unitValueAt(u, end) ?? 0; continue; }
    capitalAfter += after;
    newerMarks += last.value - u.bookValue;
  }
  return {
    points,
    coverage: {
      from: start, to: end, units: unitsCov, returnCompleteFrom, levelCompleteFrom,
      levelEnd, statementBook: r2(statementBook), newerMarks: r2(newerMarks), capitalAfterLastValuation: r2(capitalAfter),
    },
  };
}

/**
 * THE COVERAGE, SPLIT THE WAY A READER ACTS ON IT — every list computed off the
 * series' own units, so the card's counts cannot drift from what was chained.
 */
export type BookNavStats = {
  /** Investments holding value at the series' end. */
  holding: BookNavUnitCoverage[];
  /** …of which in the return at the end, and their value there. */
  inReturn: BookNavUnitCoverage[];
  inReturnValue: number;
  /** In the return from the window's first day. */
  fromStart: BookNavUnitCoverage[];
  /** Joined at a valuation inside the window — before it, unmeasured. */
  joinedLater: BookNavUnitCoverage[];
  /** Bought from nil inside the window. */
  boughtInWindow: BookNavUnitCoverage[];
  /** Held at cost by the review: in the NAV level, never the return. */
  atCost: BookNavUnitCoverage[];
  atCostValue: number;
  /** In the return from the first day and never valued again after it — carried at that valuation. */
  notRevalued: BookNavUnitCoverage[];
  /** A step whose capital no record settles. */
  unproven: BookNavUnitCoverage[];
};

export function bookNavStats(c: BookNavCoverage): BookNavStats {
  const holding = c.units.filter((u) => Math.abs(u.endValue ?? u.bookValue) >= SPECK);
  const inReturn = holding.filter((u) => u.returnFrom != null);
  const atCost = holding.filter((u) => u.atCost);
  return {
    holding,
    inReturn,
    inReturnValue: sum(inReturn.map((u) => u.endValue ?? 0)),
    fromStart: inReturn.filter((u) => u.entry === "start"),
    joinedLater: inReturn.filter((u) => u.entry === "valuation"),
    boughtInWindow: inReturn.filter((u) => u.entry === "payment"),
    atCost,
    atCostValue: sum(atCost.map((u) => u.endValue ?? 0)),
    notRevalued: inReturn.filter((u) => u.entry === "start" && u.lastValued != null && c.from != null && u.lastValued <= c.from),
    unproven: c.units.filter((u) => u.unproven.length > 0),
  };
}

/** The series over a book, as `PortfolioContext` reads it. */
export function buildBookNav(input: BookNavInput): BookNavSeries {
  return bookNavSeries(navUnits(input));
}

/**
 * ── THE DATES A COMPARISON MAY START ON (Stage 10iv) ─────────────────────────
 *
 * Each investment is held at its latest valuation until the next one, and the
 * next one's whole move lands on its own date. So a comparison started on a
 * date when an investment was last valued weeks earlier, and is valued again
 * later, carries the move from BEFORE the start into the period: Carnelian's,
 * Goldstandard's and V.E.C's April–June gains arrive on their 6–10 July
 * statements, and a period from 27 July would count none of them while one from
 * 26 April would count all of them against an index that had already risen.
 *
 * A date qualifies when at most `maxLeak` of the return's value there is such
 * an investment — not valued within `withinDays` before the date and valued
 * again after it — the period to the series' end is at least `minDays` long,
 * and it is at least `minGapDays` after the last day offered: a demat valued at
 * every close (Stage 10iz) puts a valuation on 1, 2, 6 and 7 April, and each is
 * the 31 March comparison again, not another period. The series' first day is
 * always offered: it is the base every point is struck from. Measured on this
 * book, 31 Mar 2026 is the one date that qualifies (0%; 30 Jun 21%, 30 Sep 11%).
 */
export function comparableStarts(
  units: readonly NavUnit[], series: BookNavSeries,
  { maxLeak = 0.05, withinDays = 7, minDays = 30, minGapDays = 28 }:
    { maxLeak?: number; withinDays?: number; minDays?: number; minGapDays?: number } = {},
): string[] {
  const start = series.coverage.from, end = series.coverage.to;
  if (!start || !end) return [];
  const daysBetween = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY;
  const out = [start];
  for (const p of series.points) {
    const d = p.date;
    if (d <= start || !(p.accountsOnDate ?? 0) || daysBetween(d, end) < minDays) continue;
    if (daysBetween(out[out.length - 1], d) < minGapDays) continue;
    let panel = 0, leak = 0;
    for (const u of units) {
      const from = returnEntry(u, start);
      const v = from != null && d >= from ? unitValueAt(u, d) : null;
      if (v == null) continue;
      panel += v;
      let last = markOnOrBefore(u, d)?.date ?? null;
      if (u.origin && u.originDated && u.origin <= d && (!last || u.origin > last)) last = u.origin;
      const fresh = last != null && daysBetween(last, d) <= withinDays;
      if (!fresh && u.marks.some((m) => m.date > d)) leak += v;
    }
    if (panel > 0 && leak / panel <= maxLeak) out.push(d);
  }
  return out;
}
