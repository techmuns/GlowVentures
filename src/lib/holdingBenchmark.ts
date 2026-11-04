/**
 * ── EVERY HOLDING AGAINST ITS OWN INDEX, ON ITS OWN MONEY (Stage 10kd) ──────
 *
 *   *"Map a benchmark to every holding by what it is … If the holding is a
 *    smallcap then the benchmark should be nifty smallcap 250, if the holding
 *    is a largecap company then nifty 50 … if the investment in a portfolio
 *    holding is in tranches then we need to show benchmark return also based
 *    on tranches investment in the same magnitude and time period."*
 *
 * WHICH INDEX — the most specific source first:
 *
 *  1. A MANDATE is compared with the index its manager's own report prints
 *     (`BOOK_ACCOUNT_RETURNS`: "S&P BSE 500 Total Return Index", "N50TRI" …),
 *     in the price version the feed carries.
 *  2. A LISTED SHARE takes its size class from AMFI's half-yearly list (SEBI's
 *     rank rule: the 100 largest large cap, the next 150 mid cap, the rest small
 *     cap) — Nifty 50, Nifty Midcap 150, Nifty Smallcap 250.
 *  3. A FUND by its SEBI scheme category as its name states it: small cap,
 *     mid cap, large cap, an index scheme's own index; a diversified equity
 *     scheme or an equity AIF the Nifty 500.
 *  4. An unlisted company or a private fund, which AMFI does not rank, the
 *     Nifty 500 — the broad market, as a public-market equivalent.
 *  5. Cash, liquid, arbitrage, debt and hybrid schemes have none here: their
 *     benchmarks are money-market, arbitrage, debt or blended indices that no
 *     keyless feed carries, so the cell says which and shows no figure.
 *
 * ON WHICH MONEY — the row's own dated record (`RowCapital.legs`), each payment
 * into the index on its day and each sale or dividend out of it on its day,
 * each line closing on its own date (the public-market equivalent). The index
 * figure is then struck with the measure the cell shows: an HPR is the index's
 * gain over the same paid-in money, an XIRR or a CAGR the index's money-weighted
 * annual rate over the same flows. A row whose purchases are not all dated has
 * no like-for-like index figure, and says so rather than borrowing the index's
 * move over a guessed window.
 */
import AMFI from "@/data/amfiMarketCap.json";
import { BOOK_ACCOUNT_RETURNS } from "@/data/glowData";
import { benchmarkByKey, type Benchmark, type BenchmarkKey } from "./benchmarks";
import { xirrPct } from "./bucketXirr";
import { quoteSymbolFor, symbolFor } from "./quotes";
import { UPSTOX_INSTRUMENTS } from "../../shared/upstoxInstruments.mjs";
import type { CapitalLeg } from "./analytics";
import type { IndexLevel } from "./periodReturns";
import type { Position } from "./types";

/** The short label the cell prints; the full name is its hover. */
export const BENCH_SHORT: Record<BenchmarkKey, string> = {
  "nifty-500": "N500", "nifty-50": "N50", "nifty-next-50": "NN50", "nifty-midcap-150": "M150",
  "nifty-smallcap-250": "S250", sensex: "Sensex", "bse-500": "BSE500",
};

export type HoldingBenchmark =
  | { bench: Benchmark; why: string }
  | { bench: null; why: string };

// ── AMFI'S SIZE CLASS ───────────────────────────────────────────────────────
type AmfiRow = [isin: string, rank: number, nse: string | null, bse: string | null, name: string];
const SIZE = new Map<string, { cls: "large" | "mid"; rank: number }>();
for (const [cls, rows] of [["large", AMFI.large], ["mid", AMFI.mid]] as const) {
  for (const [isin, rank, nse] of rows as unknown as AmfiRow[]) {
    SIZE.set(isin, { cls, rank });
    if (nse) SIZE.set(`NSE:${nse}`, { cls, rank });
  }
}
/** Every other company AMFI lists — small cap by SEBI's rule. */
const SMALL = new Set([...AMFI.small.split(" "), ...AMFI.smallNse.split(" ").map((s) => `NSE:${s}`)]);
const AMFI_DATE =new Date(`${AMFI.asOf}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const AMFI_LIST = `AMFI's list of ${AMFI_DATE} (six-month average market value)`;

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 >= 11 && n % 100 <= 13) ? 0 : Math.min(n % 10, 4) % 4] ?? "th"}`;

/**
 * The share's ISIN: the statement's, else the one its verified exchange
 * instrument carries (`NSE_EQ|<ISIN>`) — an identifier join, never a name.
 */
function isinOf(p: Position): string | null {
  if (p.isin) return p.isin.trim().toUpperCase();
  const q = quoteSymbolFor(p);
  const key = q ? (UPSTOX_INSTRUMENTS as Record<string, { key?: string }>)[q]?.key : null;
  const m = key ? /^(?:NSE|BSE)_EQ\|(IN[A-Z0-9]{10})$/.exec(key) : null;
  return m ? m[1] : null;
}

function shareBenchmark(p: Position): HoldingBenchmark {
  const sym = symbolFor(p), isin = isinOf(p);
  const hit = (isin ? SIZE.get(isin) : undefined) ?? (sym ? SIZE.get(`NSE:${sym}`) : undefined);
  if (hit?.cls === "large") return { bench: benchmarkByKey("nifty-50"), why: `Large cap: ranked ${ordinal(hit.rank)} on ${AMFI_LIST}, so it is compared with the Nifty 50.` };
  if (hit?.cls === "mid") return { bench: benchmarkByKey("nifty-midcap-150"), why: `Mid cap: ranked ${ordinal(hit.rank)} on ${AMFI_LIST}, so it is compared with the Nifty Midcap 150.` };
  if ((isin && SMALL.has(isin)) || (sym && SMALL.has(`NSE:${sym}`))) {
    return { bench: benchmarkByKey("nifty-smallcap-250"),
      why: `Small cap: listed, but not among the 250 largest companies on ${AMFI_LIST}, so it is compared with the Nifty Smallcap 250.` };
  }
  // LISTED BUT NOT ON THE LIST. An SME-platform share (series SM / ST / M) is
  // small by the platform's own rule. A main-board listing after the list is
  // ranked against the list's own floors where its quote carries a market value
  // — NSE's own shares, listed since, are no small cap — and otherwise left to
  // the broad market rather than guessed small.
  const q = quoteSymbolFor(p);
  const series = q ? (UPSTOX_INSTRUMENTS as Record<string, { series?: string }>)[q]?.series : undefined;
  if (series && SME_SERIES.has(series)) {
    return { bench: benchmarkByKey("nifty-smallcap-250"),
      why: `Listed on an exchange's SME platform, which AMFI's list does not rank: small cap by the platform's own size rule, compared with the Nifty Smallcap 250.` };
  }
  const capCr = p.marketCap != null && p.marketCap > 0 ? p.marketCap / 1e7 : null;
  if (q && capCr != null) {
    const [key, cls, floor] = capCr >= AMFI.largeFloorCr ? ["nifty-50", "Large cap", `at least the ₹${AMFI.largeFloorCr.toLocaleString("en-IN")} Cr of the 100th company`] as const
      : capCr >= AMFI.midFloorCr ? ["nifty-midcap-150", "Mid cap", `at least the ₹${AMFI.midFloorCr.toLocaleString("en-IN")} Cr of the 250th company`] as const
      : ["nifty-smallcap-250", "Small cap", `below the ₹${AMFI.midFloorCr.toLocaleString("en-IN")} Cr of the 250th company`] as const;
    return { bench: benchmarkByKey(key),
      why: `${cls}: listed after ${AMFI_LIST}; its market value today, ₹${Math.round(capCr).toLocaleString("en-IN")} Cr, is ${floor} on that list. Compared with the ${benchmarkByKey(key).name}.` };
  }
  return { bench: benchmarkByKey("nifty-500"),
    why: q ? `Not on ${AMFI_LIST} — listed after it — and no market value has arrived to rank it, so it is compared with the broad Nifty 500.`
      : `Not on ${AMFI_LIST} and not traded on an exchange, so its size is unranked: compared, as a public-market equivalent, with the broad Nifty 500.` };
}
const SME_SERIES = new Set(["SM", "ST", "M", "MT"]);

// ── A FUND, BY THE SEBI CATEGORY ITS NAME STATES ────────────────────────────
const DEBT_WHY = "A debt holding: its benchmark is a debt index, which no price feed here carries, so no index figure is shown.";
const NONE: [RegExp, string][] = [
  [/\bliquid|overnight|money market|liqbees|cash management|ultra short|low duration/i,
    "A cash fund: its benchmark is a money-market index (such as CRISIL Liquid Debt), which no price feed here carries, so no index figure is shown."],
  [/arbitrage/i, "An arbitrage fund: its benchmark is the Nifty 50 Arbitrage index, which no price feed here carries, so no index figure is shown."],
  [/balanced advantage|dynamic asset|hybrid|multi asset|absolute return|hedged/i,
    "A hybrid or hedged scheme: its benchmark blends equity and debt indices, which no price feed here carries, so no index figure is shown."],
  [/credit|income|\bdebt|\bbond|gilt|duration|corporate bond|banking (&|and) psu/i, DEBT_WHY],
  [/\bgold\b|\bsilver\b/i, "A precious-metal holding: no equity index measures it, so no index figure is shown."],
];
const FUND: [RegExp, BenchmarkKey, string][] = [
  [/next ?50|junior/i, "nifty-next-50", "An index scheme on the Nifty Next 50, compared with that index."],
  [/sensex/i, "sensex", "An index scheme on the Sensex, compared with that index."],
  [/small ?cap|\bsme\b|micro ?cap/i, "nifty-smallcap-250", "A small-cap scheme, compared with the Nifty Smallcap 250."],
  [/large ?(&|and) ?mid/i, "nifty-500", "A large & mid cap scheme: its own benchmark (Nifty LargeMidcap 250) is not in the feed, so it is compared with the broad Nifty 500."],
  [/mid ?cap/i, "nifty-midcap-150", "A mid-cap scheme, compared with the Nifty Midcap 150."],
  [/large ?cap|blue ?chip|nifty 100|nifty ?50\b|nifty ?bees/i, "nifty-50", "A large-cap scheme, compared with the Nifty 50."],
];

function fundBenchmark(p: Position): HoldingBenchmark {
  const name = p.security ?? p.securityKey;
  for (const [re, why] of NONE) if (re.test(name)) return { bench: null, why };
  for (const [re, key, why] of FUND) if (re.test(name)) return { bench: benchmarkByKey(key), why };
  return p.marketSide === "private"
    ? { bench: benchmarkByKey("nifty-500"), why: "A private fund: compared, as a public-market equivalent, with the broad Nifty 500." }
    : { bench: benchmarkByKey("nifty-500"), why: "A diversified equity scheme, compared with the broad Nifty 500." };
}

/** The index one statement line is compared with, and why. */
export function positionBenchmark(p: Position): HoldingBenchmark {
  if (p.assetClass === "Cash") return { bench: null, why: "Cash: no market index measures it." };
  if (p.assetClass === "Bond") return { bench: null, why: DEBT_WHY };
  if (p.assetClass === "Equity" && p.marketSide !== "private") return shareBenchmark(p);
  if (p.assetClass === "Unlisted" || p.assetClass === "Equity") {
    return { bench: benchmarkByKey("nifty-500"), why: "Unlisted, so AMFI ranks no size for it: compared, as a public-market equivalent, with the broad Nifty 500." };
  }
  return fundBenchmark(p);
}

// ── A MANDATE, BY ITS MANAGER'S OWN REPORT ──────────────────────────────────
const PRINTED: [RegExp, BenchmarkKey][] = [
  [/bse ?500/i, "bse-500"], [/nifty ?500|n500/i, "nifty-500"], [/smcap ?250|smallcap ?250/i, "nifty-smallcap-250"],
  [/midcap ?150/i, "nifty-midcap-150"], [/n50tri|nifty ?50\b/i, "nifty-50"], [/sensex/i, "sensex"],
];

/** The first benchmark the account's own report prints that the feed carries, in the report's order. */
export function printedBenchmark(accountId: string): { key: BenchmarkKey; printed: string; source: string } | null {
  const blocks = (BOOK_ACCOUNT_RETURNS as Record<string, { source: string; series: { series: string; isBenchmark: boolean }[] }[]>)[accountId] ?? [];
  for (const b of blocks) for (const s of b.series) {
    if (!s.isBenchmark) continue;
    const hit = PRINTED.find(([re]) => re.test(s.series));
    if (hit) return { key: hit[1], printed: s.series, source: b.source };
  }
  return null;
}

function mandateBenchmark(accountIds: readonly string[]): HoldingBenchmark {
  const printed = [...new Set(accountIds)].map(printedBenchmark);
  const keys = new Set(printed.map((x) => x?.key ?? null));
  if (keys.size === 1 && printed[0]) {
    const b = benchmarkByKey(printed[0].key);
    return { bench: b, why: `The manager's own report compares this mandate with "${printed[0].printed}"; the ${b.name} price index stands for it here.` };
  }
  return { bench: benchmarkByKey("nifty-500"),
    why: keys.size > 1 ? "Its managers' reports print different benchmarks, so the mandate is compared with the broad Nifty 500."
      : "Its manager's report prints no benchmark the feed carries, so the mandate is compared with the broad Nifty 500." };
}

/**
 * The index a row is compared with: a whole mandate by its report, otherwise
 * its lines' own — the largest line's where they differ, saying so.
 */
export function rowBenchmark(ps: readonly Position[], mandateAccountIds: readonly string[] | null): HoldingBenchmark {
  if (mandateAccountIds?.length) return mandateBenchmark(mandateAccountIds);
  if (!ps.length) return { bench: null, why: "This row holds no statement line to classify." };
  const each = ps.map((p) => ({ p, b: positionBenchmark(p) }));
  const keys = new Set(each.map((x) => x.b.bench?.key ?? null));
  if (keys.size === 1) return each[0].b;
  const top = [...each].sort((a, b) => (b.p.marketValue ?? 0) - (a.p.marketValue ?? 0))[0];
  return { bench: top.b.bench, why: `${top.b.why} Its lines differ in kind; this is the largest line's.` } as HoldingBenchmark;
}

// ── THE INDEX ON THE SAME MONEY ─────────────────────────────────────────────
export type IndexFigure =
  | { shown: true; pct: number; annual: boolean; from: string; to: string; how: string }
  /** `feed`: the index's closes are still loading or the price service failed — not a gap in the record (Stage 10lc). */
  | { shown: false; reason: string; feed?: true };

const dayList = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The index bought and sold with the row's own dated money. `annual` strikes
 * the money-weighted rate (XIRR; one payment, its CAGR); otherwise the gain
 * over the money paid in, cumulative — the HPR's definition. `valuedOn` is the
 * date the holding's own figure is valued on: a line still held closes there
 * where it is later than its record's close (an HPR on today's price).
 */
export function indexOnSameMoney(legs: readonly CapitalLeg[], level: IndexLevel, annual: boolean, valuedOn: string | null = null): IndexFigure {
  if (!legs.length) return { shown: false, reason: "no dated purchase is on record for this row" };
  const flows: { date: Date; amount: number }[] = [];
  let gain = 0, paidIn = 0, from: string | null = null, to: string | null = null, payments = 0;
  for (const leg of closeLegsOn(legs, valuedOn)) {
    if (!leg.flows.length) continue;
    const close = leg.close ? leg.close.date : leg.flows.map((f) => f.date).sort().at(-1)!;
    const l1 = level(close);
    if (l1 == null || !(l1 > 0)) return { shown: false, reason: `the index has no close on or before ${fmtDay(close)}` };
    let units = 0;
    for (const f of leg.flows) {
      if (f.date > close) continue;
      const l = level(f.date);
      if (l == null || !(l > 0)) return { shown: false, reason: `the index has no close on or before ${fmtDay(f.date)}, when this row's money moved` };
      units += -f.amount / l;
      gain += f.amount;
      if (f.amount < 0) { paidIn += -f.amount; payments++; if (from === null || f.date < from) from = f.date; }
      flows.push({ date: new Date(f.date), amount: f.amount });
    }
    const terminal = units * l1;
    gain += terminal;
    if (Math.abs(terminal) > 1e-6) flows.push({ date: new Date(close), amount: terminal });
    if (to === null || close > to) to = close;
    // More taken out than the same money in the index would be worth: the
    // public-market equivalent's known limit, and no rate is solved through it.
    if (terminal < -1e-6 && annual) return { shown: false, reason: "more money came out of this holding than the same payments in the index would be worth, so the index has no like-for-like rate" };
  }
  if (!(paidIn > 0) || from === null || to === null) return { shown: false, reason: "no dated payment into this row is on record" };
  const span = `${payments === 1 ? "the same payment on" : `the same ${payments} payments from`} ${fmtDay(from)}${legs.some((l) => l.flows.some((f) => f.amount > 0)) ? ", sales and payouts out on their days," : ""} to ${fmtDay(to)}`;
  if (!annual) return { shown: true, pct: (gain / paidIn) * 100, annual: false, from, to, how: `The index bought with ${span}: its gain over the money paid in.` };
  const r = xirrPct(flows);
  if (r == null || !Number.isFinite(r)) return { shown: false, reason: "the index's flows over these dates do not solve to a rate" };
  return { shown: true, pct: r, annual: true, from, to,
    how: `The index bought with ${span} (${dayList(from, to)} days): its money-weighted rate a year.` };
}

/** Each line still held closed on `valuedOn` where that is later than its record's close — the date its HPR is valued on. */
export function closeLegsOn(legs: readonly CapitalLeg[], valuedOn: string | null): CapitalLeg[] {
  return legs.map((l) => (l.close && valuedOn && valuedOn > l.close.date ? { ...l, close: { ...l.close, date: valuedOn } } : l));
}

/** One dated payment and what it is worth on `to`: a contribution, or a holding bought once and never sold. */
export const onePaymentLeg = (date: string, paid: number, to: string, value: number): CapitalLeg =>
  ({ flows: [{ date, amount: -paid }], close: value > 0 ? { date: to, value } : null });

/**
 * ── A TOTAL ON THE SAME MONEY (Stage 10lc) ──────────────────────────────────
 *
 *   *"It should never show blank."*
 *
 * A section's or the table's return is pooled over its rows, so its index is
 * bought with every row's own legs, each closed on its own row's value date.
 * One row with a figure and no dated money leaves the total without a
 * like-for-like index, and the count says how many.
 */
export function pooledLegs(rows: readonly (readonly CapitalLeg[] | null)[]): { legs: CapitalLeg[] } | { undated: number; of: number } {
  const undated = rows.filter((l) => !l?.length).length;
  return undated ? { undated, of: rows.length } : { legs: rows.flatMap((l) => [...l!]) };
}

/**
 * ── THE INDEX LINE NAMES ITS GAP (Stage 10lc) ───────────────────────────────
 *
 * The return cell above it says "— No cost" (Stage 10jm); a bare "N500 —" under
 * a figure read as a blank. A gap in the RECORD names its cause in a few words,
 * the full reason its hover, most specific first. "2 of the 2" is every line,
 * not a part of them. The feed's own state (closes loading, the price service
 * down) is not one: it keeps the plain dash with its reason as the hover, so the
 * line does not change width when a fetch settles (`IndexFigure.feed`).
 */
const BENCH_GAPS: [RegExp, string][] = [
  [/no close on or before/i, "Index starts later"],
  [/more money came out/i, "No like-for-like"],
  [/do not solve/i, "No solution"],
  [/\bbuy 0 and sell/i, "No buy dates"],
  [/^some of\b|buy [1-9][\d,.]* and sell|does not account for every unit|on no dated trade in this drop/i, "Dates incomplete"],
  [/not dated in full/i, "No buy dates"],
  [/only as a span/i, "Range only"],
  [/record ends .* before/i, "Record ends early"],
  [/reaches inception/i, "Start not on record"],
  [/capital is known only as a total|no dated record|no dated payment|dated capital record/i, "No dated capital"],
  [/purchase|dated trade|bought|lot register|cost but not the date/i, "No buy dates"],
];
export function benchGapLabel(reason: string | null | undefined): string {
  const m = /(\d+) of the (\d+) /.exec(reason ?? "");
  const r = m && m[1] !== m[2] ? `some of ${reason}` : reason ?? "";
  return BENCH_GAPS.find(([re]) => re.test(r))?.[1] ?? "Not available";
}

/** The index's own move between two closes — a YTD window measured from a dated value. */
export function indexMove(from: string, to: string, level: IndexLevel): IndexFigure {
  const l0 = level(from), l1 = level(to);
  if (l0 == null || !(l0 > 0)) return { shown: false, reason: `the index has no close on or before ${fmtDay(from)}` };
  if (l1 == null || !(l1 > 0)) return { shown: false, reason: `the index has no close on or before ${fmtDay(to)}` };
  return { shown: true, pct: (l1 / l0 - 1) * 100, annual: false, from, to, how: `The index's move from ${fmtDay(from)} to ${fmtDay(to)}, the same window.` };
}

/** One purchase on `since`, valued on `to`: the index's compound rate over the same days. */
export function indexCompound(since: string, to: string, level: IndexLevel): IndexFigure {
  const l0 = level(since), l1 = level(to);
  if (l0 == null || !(l0 > 0)) return { shown: false, reason: `the index has no close on or before ${fmtDay(since)}` };
  if (l1 == null || !(l1 > 0)) return { shown: false, reason: `the index has no close on or before ${fmtDay(to)}` };
  const days = dayList(since, to);
  if (!(days > 0)) return { shown: false, reason: "the purchase and the valuation fall on the same day" };
  return { shown: true, pct: (Math.pow(l1 / l0, 365 / days) - 1) * 100, annual: true, from: since, to,
    how: `The index bought on ${fmtDay(since)} and valued on ${fmtDay(to)} (${days} days), compounded a year — the same single purchase.` };
}
