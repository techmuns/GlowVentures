/**
 * WHEN, AND BY WHAT, A HOLDING'S VALUE IS STRUCK (VD-17, DSM-C4).
 *
 * A holding the ICICI Bank NSDL statement marks is worth what it was on that
 * statement's date — 31 March — and the company page printed its value with no
 * date at all, beside figures the live feed moves every minute. The fund card
 * went the other way: it dated the family's holding by its STATEMENT while the
 * value it multiplied was AMFI's published NAV of a later day.
 *
 * One answer for both, from the rule that already decides where a return's
 * window ends (`valueDateOf` in `analytics.ts`): a live quote is struck at its
 * own moment, a published NAV on AMFI's date, a statement mark on its
 * statement's date. Where the rows behind a holding are not all struck on one
 * date, `at` is null and the words say so — the page never picks one of the
 * dates to stand for the others.
 *
 * `nowMs` is passed in, never read here, so a page and its suite agree.
 */
import { commonValueDate, valueDateOf } from "@/lib/analytics";
import { fmtDate } from "@/lib/format";

export type ValuedBy = "live" | "nav" | "statement" | "review" | "mixed";

export type ValuedRow = {
  accountId: string;
  live?: boolean;
  navPriced?: boolean;
  navDate?: string;
  quoteAgeS?: number | null;
  /** The day the statement's prices are of, where it differs from its balances' (VD-17). */
  priceAsOf?: string | null;
  /**
   * A line the family's consolidated review values (Stage 10dh): its date is the
   * review's closing for it, and no statement marks it — so the words must not
   * call it a statement's mark.
   */
  review?: boolean;
  /** …and a review line held at what was paid, with no valuation at all. */
  valuedAtCost?: boolean;
};

export type HoldingValuation = {
  /** The one date every row's value is struck at, or null where they differ. */
  at: string | null;
  /** Live quote, published NAV, statement mark — or a mix of them. Null with no rows. */
  by: ValuedBy | null;
  /** How many distinct dates the rows are struck on. */
  dates: number;
  /** A few words for the face — a status and a date, never a sentence. Null with no rows. */
  words: string | null;
  /** The sentence for the hover: what values it, on which date, and what stays as printed. */
  why: string;
};

const KIND = (r: ValuedRow): Exclude<ValuedBy, "mixed"> =>
  (r.live ? "live" : r.navPriced ? "nav" : r.review ? "review" : "statement");
/** What each kind IS, for a sentence naming a mix of them. */
const KIND_WORDS: Record<Exclude<ValuedBy, "mixed">, string> = {
  live: "a live quote", nav: "AMFI's published NAV", statement: "a statement's own mark", review: "the family's consolidated review",
};

export function holdingValuation(
  rows: readonly ValuedRow[],
  statementAsOf: (accountId: string) => string | null | undefined,
  nowMs: number,
): HoldingValuation {
  if (!rows.length) return { at: null, by: null, dates: 0, words: null, why: "" };
  const ds = rows.map((r) => valueDateOf(r, statementAsOf(r.accountId), nowMs));
  const at = commonValueDate(ds);
  const kinds = [...new Set(rows.map(KIND))];
  const by: ValuedBy = kinds.length === 1 ? kinds[0] : "mixed";
  const dates = new Set(ds).size;
  const d = at ? fmtDate(at) : null;
  // A review line held at cost is not VALUED on its date — the review records
  // what was paid and no valuation — so the words say so rather than "valued".
  const allAtCost = rows.every((r) => r.valuedAtCost === true);
  const someAtCost = rows.some((r) => r.valuedAtCost === true);
  const words = d == null ? `valued on ${dates} dates`
    : by === "live" ? `live price · ${d}`
    : by === "nav" ? `AMFI NAV · ${d}`
    : by === "statement" ? `statement mark · ${d}`
    : by === "review" ? (allAtCost ? `held at cost · review, ${d}` : `consolidated review · ${d}`)
    : `valued ${d}`;
  const kept = "Quantity, cost and realised gains stay exactly as the statements print them.";
  // A statement that PRICES its balances on another day says so: ICICI's NSDL
  // statement counts shares at 31 Mar and values them at the 30 Mar close. The
  // value is struck on the pricing day (`at`); the balances' own day is named.
  const drawn = [...new Set(rows
    .filter((r) => KIND(r) === "statement" && r.priceAsOf && r.priceAsOf !== statementAsOf(r.accountId))
    .map((r) => statementAsOf(r.accountId))
    .filter((x): x is string => !!x))];
  const priced = drawn.length === 1 ? ` The statement counts its balances at ${fmtDate(drawn[0])} and prices them as of ${d}.` : "";
  const why = d == null
    ? `The statements behind this holding value it on ${dates} different dates, so no one date is given for the total — each account's own date is on its row.`
    : by === "live" ? `Marked to a live quote, ${d}. ${kept}`
    : by === "nav" ? `Valued at AMFI's published NAV of ${d} — newer than the statement's own mark; only the value moves. ${kept}`
    : by === "statement" ? `Valued at the statement's own mark, dated ${d} — that day's prices, not today's.${priced} No live quote or published NAV reaches this holding.`
    : by === "review" ? (allAtCost
      ? `Held at cost on the family's consolidated review (MOPWM), as of ${d}: the review records what was paid for this holding and no valuation, so its value is its cost and no gain is struck on it. No statement, live quote or published NAV values it.`
      : `Valued by the family's consolidated review (MOPWM), as of ${d} — the review's own figure for this holding, a total with no price per unit${someAtCost ? "; the lines it records with no valuation are held at what was paid" : ""}. No statement, live quote or published NAV values it.`)
    : `Valued on ${d}, by more than one source: ${kinds.map((k) => KIND_WORDS[k]).join(" and ")}.`;
  return { at, by, dates, words, why };
}
