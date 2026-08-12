import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldAlert, ShieldCheck, Split } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentCell, AbsentSection } from "@/components/Absent";
import { parseRatioTable, checkIdentity, shareCountBreaks } from "@/lib/ratioTable";

// RATIO ANALYSIS — the spec's per-share ratios, margins, returns, liquidity,
// leverage and valuation, over seven year-ends.
//
// This is the second half of `ratio_source`'s own instruction: it answers with a
// moneycontrol URL and the words "Use WebReader Tool", and the page it points at
// carries the table labelled on both axes. `functions/api/ratios.js` follows
// that chain; `src/lib/ratioTable.ts` reads it.
//
// ── THE IDENTITY CHECK IS THE POINT OF THIS COMPONENT ───────────────────────
//
// The resolver was measured getting the company WRONG. Asked for ABCAPITAL it
// answered with Tata Capital's page, while five other tickers resolved
// correctly. A screen of real ratios under the wrong company's name is the
// worst kind of fabrication available here — every figure true, every one
// somebody else's, and nothing on screen a reader could use to tell.
//
// So the page's own H1 is compared against this holding's name through the
// book's own `securityKeyOf`, and A MISMATCH RENDERS NOTHING. Not a warning
// above the table: no table.

/** The check's reason reads mid-sentence in one place and sentence-initial in another. */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Fetched =
  | { ok: true; text: string; sourceUrl: string; stale?: boolean; ageS?: number }
  | { ok: false; failureCode: string; pointer: string | null; upstreamStatus: number | null };

async function fetchRatioTable(ticker: string): Promise<Fetched> {
  try {
    const r = await fetch("/api/ratios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ table: true, ticker }),
    });
    const d = await r.json().catch(() => null);
    if (!d || !d.ok || typeof d.text !== "string") {
      return { ok: false, failureCode: d?.failureCode ?? `HTTP_${r.status}`, pointer: d?.pointer ?? null, upstreamStatus: d?.upstreamStatus ?? null };
    }
    return { ok: true, text: d.text, sourceUrl: d.sourceUrl, stale: d.stale, ageS: d.ageS };
  } catch (e) {
    return { ok: false, failureCode: "NETWORK", pointer: e instanceof Error ? e.message : null, upstreamStatus: null };
  }
}

const REASONS: Record<string, string> = {
  NO_SOURCE_URL: "The ratio resolver answered, but gave no source page to read.",
  SOURCE_URL_NOT_ALLOWED: "The ratio resolver pointed at a host this dashboard will not fetch with its data token.",
  READER_EMPTY: "The reader reached the source page but could not extract readable text from it.",
  READER_ERROR: "The reader could not fetch the source page.",
  UPSTREAM_NO_RESPONSE: "The data service didn't respond in time. It has been intermittently unavailable, so this is very likely an outage rather than a company with no ratios — the request is already retried once before giving up.",
  UPSTREAM_ERROR: "The data service returned a gateway error. That is the service being down, not an answer about this company — the request is already retried once before giving up.",
  NOT_CONFIGURED: "The data token isn't set on this deployment.",
  NETWORK: "Couldn't reach the server.",
};

export function RatioTable({ ticker, name }: { ticker: string | null; name: string }) {
  const [state, setState] = useState<Fetched | undefined>(undefined);

  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    setState(undefined);
    fetchRatioTable(ticker).then((r) => { if (alive) setState(r); });
    return () => { alive = false; };
  }, [ticker]);

  const doc = useMemo(() => (state?.ok ? parseRatioTable(state.text) : null), [state]);
  const identity = useMemo(() => (doc ? checkIdentity(doc, name) : null), [doc, name]);
  const breaks = useMemo(() => (doc && identity?.matches ? shareCountBreaks(doc) : []), [doc, identity]);

  if (!ticker) return null;

  const body = (() => {
    if (state === undefined) {
      return <div className="grid h-24 place-items-center text-sm text-slate-500">Loading ratio analysis…</div>;
    }
    if (!state.ok) {
      return (
        <AbsentSection
          what="No ratio table for this company"
          needs={`${REASONS[state.failureCode] ?? "The data service returned an error."}${
            state.upstreamStatus ? ` (upstream ${state.upstreamStatus})` : ""}${
            state.pointer ? ` It pointed at ${state.pointer}.` : ""}`} />
      );
    }
    if (!doc || !identity) return null;

    // ── THE REFUSAL ────────────────────────────────────────────────────────
    if (!identity.matches) {
      return (
        <AbsentSection
          what="The ratio source resolved to a different company"
          needs={`${sentence(identity.reason)}. The page carries a full ratio table and every figure on it is real — which is
            exactly why it is not shown: rendered under this holding's name it would be a screen of another
            company's ratios with nothing on it to say so. The resolver is right for most tickers and wrong for
            some, so this is checked per company rather than trusted.`}>
          <a href={state.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-champagne-400">
            See the page it resolved to <ExternalLink className="h-3 w-3" />
          </a>
        </AbsentSection>
      );
    }
    if (!doc.periods.length || !doc.rows.length) {
      return (
        <AbsentSection
          what="The source page carried no ratio table"
          needs="It is the right company's page and it was read successfully, but the table this reads was not in it." />
      );
    }

    return (
      <>
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/[0.07] px-3.5 py-2.5 text-[12px] text-emerald-200">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Attribution checked: {identity.reason}. The ratio source resolves by name and was measured returning a
            different company for one ticker in six, so this is verified per company rather than assumed.
          </span>
        </div>

        {/* THE SHARE-COUNT TRAP, NAMED WHERE IT BITES. */}
        {breaks.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-[12px] text-amber-200">
            <Split className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Per-share rows are NOT adjusted for share-count events, and there {breaks.length === 1 ? "is one" : `are ${breaks.length}`} in
              this history: at {breaks.map((b) => b.period.label).join(", ")} every per-share line moves by about{" "}
              {breaks.map((b) => `${b.factor.toFixed(2)}x`).join(", ")} together while the margins hold, which is a change in the
              number of shares rather than in the business. Read the per-share columns across that year with that in mind.
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-[12.5px]">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-3 py-2 text-left font-medium">Indicator</th>
                {doc.periods.map((p) => (
                  <th key={p.label} className="label-xs px-3 py-2 text-right font-medium">{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {doc.rows.map((r) => (
                r.heading ? (
                  <tr key={r.label} className="bg-ink-800/50">
                    <td colSpan={doc.periods.length + 1} className="label-xs px-3 py-1.5 text-slate-400">{r.label}</td>
                  </tr>
                ) : (
                  <tr key={r.label} className="hover:bg-ink-700/30">
                    <td className="px-3 py-2 text-slate-200">
                      {r.label}
                      {r.perShare && <span className="ml-1.5 text-[10px] text-amber-400/70" title="per-share — not adjusted for splits or bonus issues">per share</span>}
                    </td>
                    {r.values.map((v, i) => (
                      <td key={doc.periods[i].label} className="px-3 py-2 text-right mono text-slate-200">
                        {v === null
                          ? <AbsentCell reason="the source reports no value for this indicator in this year" />
                          : v.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
          Read by row label and column header, never by position — the source puts a chart placeholder in the second
          column, and a positional read would take it as the most recent year and shift every figure back one.{" "}
          {doc.basis && <>Figures are on the source's {doc.basis.toLowerCase()} basis. </>}
          <a href={state.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-slate-400 hover:text-champagne-400">
            Source page <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </>
    );
  })();

  return (
    <Card className="mt-5" title="Ratio analysis"
      subtitle="Per-share, profitability, liquidity, coverage and valuation ratios, as the source reports them"
      right={
        <div className="flex items-center gap-1.5">
          {state?.ok && state.stale && <Pill tone="warn">last saved copy</Pill>}
          {identity && !identity.matches && <Pill tone="warn"><ShieldAlert className="mr-1 inline h-3 w-3" />refused</Pill>}
          <Pill tone="info">{ticker}</Pill>
        </div>
      }>
      {body}
    </Card>
  );
}
