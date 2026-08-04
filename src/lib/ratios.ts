// Multi-company ratio lookup, via the /api/ratios server proxy.
//
// The client spec asks to compare up to four companies across financials,
// ratios, valuation and returns. `ratio_source` is the only endpoint in the muns
// catalogue that takes several tickers and several metrics in ONE call, which is
// why the comparison page is built on it.
//
// WHAT COMES BACK IS PROSE. The upstream returns text/plain with no documented
// schema, so this — like `research.ts` — hands it through verbatim and computes
// nothing from it. A comparison TABLE of parsed values would be the nicer screen
// and the wrong one: there is no contract saying which number is which company's
// PE, and inventing that mapping is how a dashboard that promises traceability
// starts showing figures nobody can trace.
//
// The typed, checkable half of a comparison — price, market cap, 52-week range,
// day and year change — comes from the quote feed instead, which does have a
// verified shape (see src/lib/quotes.ts).

/** The metrics the comparison page asks for by default, in the spec's order. */
export const DEFAULT_METRICS = [
  "PE", "PB", "EV/EBITDA", "ROE", "ROCE", "Debt to Equity", "Dividend Yield",
] as const;

export type Ratios = {
  tickers: string[];
  metrics: string[];
  /** The upstream's own words. Never parsed. */
  text: string;
  /** Definitions for the metrics asked for, when requested. */
  formulas: string | null;
  cached: boolean;
};

export type RatiosError = { failureCode: string; upstreamStatus: number | null; detail: string | null };

export const isRatiosError = (r: Ratios | RatiosError): r is RatiosError =>
  typeof (r as RatiosError).failureCode === "string";

export async function fetchRatios(
  tickers: string[],
  metrics: readonly string[] = DEFAULT_METRICS,
  opts: { formulas?: boolean } = {},
): Promise<Ratios | RatiosError> {
  if (!tickers.length) return { failureCode: "NO_TICKERS", upstreamStatus: null, detail: null };
  try {
    const r = await fetch("/api/ratios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tickers, metrics, formulas: !!opts.formulas }),
    });
    const d = await r.json().catch(() => null);
    if (!d || !d.ok) {
      const err: RatiosError = {
        failureCode: d?.failureCode ?? (r.ok ? "BAD_RESPONSE" : `HTTP_${r.status}`),
        upstreamStatus: d?.upstreamStatus ?? null,
        detail: d?.diagnostics?.[0]?.bodyPreview ?? d?.diagnostics?.[0]?.errorMessage ?? null,
      };
      console.warn("[ratios]", err, d ?? "(no body)");
      return err;
    }
    return {
      tickers: Array.isArray(d.tickers) ? d.tickers : tickers.slice(),
      metrics: Array.isArray(d.metrics) ? d.metrics : [...metrics],
      text: String(d.text ?? ""),
      formulas: d.formulas ? String(d.formulas) : null,
      cached: !!d.cached,
    };
  } catch (e) {
    return { failureCode: "NETWORK", upstreamStatus: null, detail: e instanceof Error ? e.message : String(e) };
  }
}
