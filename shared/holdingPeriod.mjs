// HOW LONG A LOT HAS BEEN HELD, AS THE INCOME-TAX ACT COUNTS IT (Stage 10fx).
//
// `build-book` split a lot register into short- and long-term cost with
// `held >= 365 days`. Section 2(42A) does not count days: a capital asset is
// SHORT-TERM if held for "not more than" its period in MONTHS, so a lot is
// long-term only from the day AFTER the anniversary that closes the period — a
// share bought on 7 Oct 2025 is still short-term on 7 Oct 2026 and long-term on
// 8 Oct. Counting 365 days called it long-term a day early, two days early
// across a leap day, and put `daysToLT` one short of the date a sale would
// actually be taxed as long-term.
//
// AND THE PERIOD IS THE ASSET'S. Twelve months for listed equity shares and
// units of an equity-oriented fund; twenty-four for unlisted shares and other
// capital assets; and a "specified mutual fund" (s.50AA — a debt or liquid
// scheme's units bought on or after 1 Apr 2023) is never long-term at all,
// whatever it is held for. A holding this book cannot place among those gets no
// split — null, rendered `—` — rather than the equity rule applied by default:
// a tax basis is a figure somebody might act on.
//
// Pure, so the suite can hold the rule to dated cases without a build — and
// SHARED (Stage 10fx): `build-book` splits the registers with it and the browser
// re-ages the same lots to today with it (`src/lib/ltDate.ts`), so the book's
// split and the page's cannot disagree about when a lot turns long-term.

const DAY = 86400000;
const ms = (iso) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * `n` calendar months after `date`, clamped to the month's last day — the
 * period a month-count closes on (29 Feb 2024 + 12 months is 28 Feb 2025).
 */
export function addMonths(date, n) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)) - 1, d = Number(date.slice(8, 10));
  const target = new Date(Date.UTC(y, m + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last)));
}

/** The first day a lot bought on `purchaseDate` is long-term under a `months` period. */
export function longTermFrom(purchaseDate, months) {
  return iso(ms(addMonths(purchaseDate, months)) + DAY);
}

/** The date from which a debt or liquid fund's units are "specified mutual fund" units (s.50AA). */
export const SPECIFIED_FUND_FROM = "2023-04-01";

/**
 * Which holding period the Act gives this holding, from what the book carries
 * about it — `{ months, specifiedFund }`, or `{ months: null, why }` where the
 * book cannot tell. A mutual fund's units are known by their ISIN (`INF…`), the
 * one identifier that says a holding is a fund's units rather than a company's
 * shares; their orientation by the asset class the statement prints.
 */
export function longTermRuleOf({ assetClass, marketSide, isin }) {
  const fundUnits = typeof isin === "string" && /^INF/i.test(isin);
  if (fundUnits) {
    if (assetClass === "Equity") return { months: 12, specifiedFund: false };
    if (assetClass === "Debt" || assetClass === "Cash") return { months: 24, specifiedFund: true };
    return { months: null, why: `a fund's units whose asset class (${assetClass ?? "none printed"}) does not say whether the scheme is equity-oriented` };
  }
  if (assetClass === "Equity" && marketSide === "listed") return { months: 12, specifiedFund: false };
  if (assetClass === "Equity" && marketSide === "private") return { months: 24, specifiedFund: false };
  return { months: null, why: `no holding period this book can place for a ${assetClass ?? "holding with no asset class"}${marketSide ? ` (${marketSide})` : ""}` };
}

/**
 * The short/long-term split of a lot register that accounts for the units held
 * exactly (the caller's gate), at `asOf`:
 *   stCostBasis, ltCostBasis — what the short- and long-term lots cost;
 *   daysToLT — days from `asOf` to the first day the soonest short-term lot
 *     turns long-term; null where none will (all long-term, or a specified
 *     fund's units);
 *   why — set, and the three figures null, where the rule is unknown.
 * Lots carry `{ purchaseDate, totalCost }`.
 */
export function termSplit(lots, asOf, holding) {
  const rule = longTermRuleOf(holding);
  if (rule.months === null) return { stCostBasis: null, ltCostBasis: null, daysToLT: null, why: rule.why };
  let st = 0, lt = 0, soonest = null, never = 0;
  const r2 = (x) => Math.round(x * 100) / 100;
  for (const l of lots) {
    if (rule.specifiedFund && l.purchaseDate >= SPECIFIED_FUND_FROM) { st = r2(st + l.totalCost); never += 1; continue; }
    const from = longTermFrom(l.purchaseDate, rule.months);
    if (asOf >= from) { lt = r2(lt + l.totalCost); continue; }
    st = r2(st + l.totalCost);
    const toGo = Math.round((ms(from) - ms(asOf)) / DAY);
    if (soonest === null || toGo < soonest) soonest = toGo;
  }
  return {
    stCostBasis: st, ltCostBasis: lt, daysToLT: soonest,
    why: never ? `${never} lot(s) are specified mutual fund units (bought on or after ${SPECIFIED_FUND_FROM}, s.50AA), which are never long-term` : null,
  };
}
