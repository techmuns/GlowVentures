// ── THE BENCHMARKS THE NAV CHART CAN BE SET AGAINST ─────────────────────────
//
// *"Allow us to select different benchmarks to compare the portfolio returns
// with and make sure that the benchmark returns are live just like the Nifty
// 500 benchmark."*
//
// LIVE MEANS THE SAME PIPE, NOT A SECOND ONE. The Nifty 500 line has always come
// from `/api/prices` — Yahoo's keyless chart endpoint, settled daily closes, the
// same history the company pages read. Every benchmark here comes through that
// exact call, so none of them is a baked series that goes stale and every one of
// them moves on the same day the Nifty 500 does. Nothing here is harvested,
// typed in or interpolated.
//
// ── A SYMBOL THAT LOOKS RIGHT IS NOT THE INDEX ───────────────────────────────
//
// Trap 2 in `functions/api/indices.js`, measured on this very upstream:
// `NIFTY_MIDCAP_150.NS` answers 200 with a well-formed rupee figure for an
// instrument that is not the Nifty Midcap 150, and `^NSMIDCP` — a symbol that
// reads like a midcap index — is the Nifty NEXT 50. So each benchmark DECLARES
// the name its upstream must report, `/api/prices` hands that name back, and
// `benchmarkIdentity` compares the two before a single close is drawn. A
// mismatch draws no line and says what answered instead. A chart line from the
// wrong index is the worst figure available here: correct, well formed, and
// about a different market.
//
// Every symbol and name below was MEASURED against the live upstream on
// 2026-09-23 (`longName` in brackets):
//
//   ^CRSLDX            [NIFTY 500]          history from 2005-09-26
//   ^NSEI              [NIFTY 50]           from 2007-09-17
//   ^NSMIDCP           [NIFTY NEXT 50]      from 2007-09-17
//   NIFTYMIDCAP150.NS  [NIFTY MIDCAP 150]   from 2019-01-14
//   NIFTYSMLCAP250.NS  [NIFTY SMLCAP 250]   from 2005-04-01
//   ^BSESN             [S&P BSE SENSEX]     from 1997-07-01
//   BSE-500.BO         [S&P BSE 500 INDEX]  from 2007-09-17
//
// ── THEY ARE PRICE INDICES, AND THE HOVER SAYS SO ────────────────────────────
//
// The managers' own reports compare against TOTAL-RETURN versions (N50TRI,
// S&P BSE 500 TRI, NSmCap250TRI). The keyless feed carries the price indices
// only, so a dividend is in the book's line and not in the benchmark's. That is
// the same basis the Nifty 500 line has always been on; it is stated on every
// benchmark rather than left for a reader to assume.
import { NIFTY_500_SYMBOL, NIFTY_500_LABEL } from "@/lib/indices";
import type { PriceHistory } from "@/lib/prices";

export type BenchmarkKey =
  | "nifty-500" | "nifty-50" | "nifty-next-50" | "nifty-midcap-150"
  | "nifty-smallcap-250" | "sensex" | "bse-500";

export type Benchmark = {
  key: BenchmarkKey;
  /** What the control and the chart call it. */
  label: string;
  /** The index's full name, for the hover. */
  name: string;
  /** Yahoo's symbol — the one thing `/api/prices` is asked for. */
  symbol: string;
  /**
   * The names the upstream may report for THIS index, normalised (lowercase,
   * alphanumerics only). "NIFTY SMLCAP 250" is the source's own abbreviation of
   * "Nifty Smallcap 250" and is the same index; a different index or an
   * unnamed instrument must match none of them.
   */
  expect: readonly string[];
  /** One line on what the index is — the hover's first sentence. */
  about: string;
  /** `useViewParam` reads `title` for a button's hover. */
  title: string;
};

const PRICE_BASIS = "A price index — dividends are not in it, so it runs slightly behind the total-return version a manager's own report compares against.";
const SOURCE = "From the same live price service as the Nifty 500 line, checked by the name the service reports for it.";

function bench(b: Omit<Benchmark, "title">): Benchmark {
  return { ...b, title: `${b.name} — ${b.about} ${SOURCE} ${PRICE_BASIS}` };
}

/**
 * THE ORDER IS THE CONTROL'S ORDER, AND THE FIRST IS THE DEFAULT. `useViewParam`
 * keeps the first param-free, so `/cio?tab=nav` is still the Nifty 500 chart the
 * family has been reading and every existing link keeps landing on it.
 */
export const BENCHMARKS: readonly Benchmark[] = [
  bench({ key: "nifty-500", label: NIFTY_500_LABEL, name: "Nifty 500", symbol: NIFTY_500_SYMBOL, expect: ["nifty500"],
    about: "the 500 largest NSE-listed companies, about 90% of the market's value — the broadest single index of the market this book invests in." }),
  bench({ key: "nifty-50", label: "Nifty 50", name: "Nifty 50", symbol: "^NSEI", expect: ["nifty50"],
    about: "the 50 largest NSE-listed companies." }),
  bench({ key: "nifty-next-50", label: "Nifty Next 50", name: "Nifty Next 50", symbol: "^NSMIDCP", expect: ["niftynext50"],
    about: "the 50 companies ranked immediately after the Nifty 50." }),
  bench({ key: "nifty-midcap-150", label: "Midcap 150", name: "Nifty Midcap 150", symbol: "NIFTYMIDCAP150.NS", expect: ["niftymidcap150"],
    about: "the 150 companies ranked 101–250 by market value. Its published history starts in 2019, so the longest ranges draw it from there." }),
  bench({ key: "nifty-smallcap-250", label: "Smallcap 250", name: "Nifty Smallcap 250", symbol: "NIFTYSMLCAP250.NS",
    expect: ["niftysmlcap250", "niftysmallcap250"],
    about: "the 250 companies ranked 251–500 by market value." }),
  bench({ key: "sensex", label: "Sensex", name: "S&P BSE Sensex", symbol: "^BSESN", expect: ["spbsesensex", "bsesensex"],
    about: "30 large BSE-listed companies." }),
  bench({ key: "bse-500", label: "BSE 500", name: "S&P BSE 500", symbol: "BSE-500.BO", expect: ["spbse500index", "spbse500", "bse500"],
    about: "the 500 largest BSE-listed companies — the price version of the benchmark several of this family's managers report against." }),
];

export const DEFAULT_BENCHMARK = BENCHMARKS[0];

export function benchmarkByKey(key: string | null | undefined): Benchmark {
  return BENCHMARKS.find((b) => b.key === key) ?? DEFAULT_BENCHMARK;
}

const norm = (s: string | null | undefined) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * IDENTITY BEFORE FIGURES. The history is usable only if the upstream reported
 * one of the names this benchmark declares. A response that carries NO name is
 * refused too: an unverified line is exactly what the check exists to stop, and
 * "the service did not say" is not evidence that it is the right index.
 */
export function benchmarkIdentity(h: PriceHistory, b: Benchmark):
  { ok: true } | { ok: false; reportedName: string | null } {
  const reported = [h.longName, h.shortName, h.name].filter((x): x is string => !!x);
  if (reported.some((n) => b.expect.includes(norm(n)))) return { ok: true };
  return { ok: false, reportedName: reported[0] ?? null };
}

/** Why no line is drawn for a benchmark whose name did not match, in words. */
export function benchmarkMismatchReason(b: Benchmark, reportedName: string | null): string {
  return reportedName
    ? `The price service answered for "${reportedName}" rather than ${b.name}, so no ${b.label} line is drawn. A symbol that answers with a different index would draw a correct-looking line for the wrong market.`
    : `The price service did not say which instrument it answered for, so the ${b.label} line cannot be shown to be ${b.name} and is not drawn.`;
}
