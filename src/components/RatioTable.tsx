import { requestDeadline } from "@/lib/requestDeadline";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldAlert, ShieldCheck, Split } from "lucide-react";
import { Pill } from "@/components/Pill";
import { AbsentCell, AbsentSection } from "@/components/Absent";
import { parseRatioTable, checkIdentity, shareCountBreaks } from "@/lib/ratioTable";
import { isOutage, outageHeadline, outageSentence } from "@/lib/upstreamStatus";

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
// The resolver is wrong about a QUARTER OF THE TIME. Measured across the first
// fifteen holdings in this book that carry an NSE symbol, four came back as an
// entirely different company: Aditya Birla Capital -> Tata Capital, Bajaj Auto
// -> Bajaj Finance, Alivus Life Sciences -> Altius Telecom, BLS International
// -> Sona BLW. A screen of real ratios under the wrong company's name is the
// worst kind of fabrication available here — every figure true, every one
// somebody else's, and nothing on screen a reader could use to tell.
//
// So the page's own H1 AND the company name inside its URL are both compared
// against this holding through the book's own `securityKeyOf`, and A MISMATCH
// RENDERS NOTHING. Not a warning above the table: no table. Two identifiers
// rather than one because moneycontrol abbreviates its H1 ("BHEL", "AFL")
// where the URL spells the name out — checking only the title refused two
// pages that were about the right company, and a wrong page is wrong on both.

/** The check's reason reads mid-sentence in one place and sentence-initial in another. */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Fetched =
  | { ok: true; text: string; sourceUrl: string; stale?: boolean; refreshing?: boolean; ageS?: number }
  | { ok: false; failureCode: string; pointer: string | null; upstreamStatus: number | null };

const ratioRequests = new Map<string, { at: number; value: Promise<Fetched> }>();
function fetchRatioTable(ticker: string): Promise<Fetched> {
  const cached = ratioRequests.get(ticker);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.value;
  const value = loadRatioTable(ticker).then((r) => { if (!r.ok || r.refreshing) ratioRequests.delete(ticker); return r; });
  if (ratioRequests.size >= 40) ratioRequests.delete(ratioRequests.keys().next().value!);
  ratioRequests.set(ticker, { at: Date.now(), value });
  return value;
}
async function loadRatioTable(ticker: string): Promise<Fetched> {
  const deadline = requestDeadline(65_000);
  try {
    const r = await fetch("/api/ratios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ table: true, ticker }),
      signal: deadline.signal,
    });
    const d = await r.json().catch(() => null);
    if (!d || !d.ok || typeof d.text !== "string") {
      return { ok: false, failureCode: d?.failureCode ?? `HTTP_${r.status}`, pointer: d?.pointer ?? null, upstreamStatus: d?.upstreamStatus ?? null };
    }
    return { ok: true, text: d.text, sourceUrl: d.sourceUrl, stale: d.stale, refreshing: d.refreshing, ageS: d.ageS };
  } catch (e) {
    return { ok: false, failureCode: "NETWORK", pointer: e instanceof Error ? e.message : null, upstreamStatus: null };
  } finally { deadline.dispose(); }
}

const REASONS: Record<string, string> = {
  NO_SOURCE_URL: "The ratio resolver answered, but gave no source page to read.",
  SOURCE_URL_NOT_ALLOWED: "The ratio resolver pointed at a host this dashboard will not fetch with its data token.",
  READER_EMPTY: "The reader reached the source page but could not extract readable text from it.",
  NOT_CONFIGURED: "The data token isn't set on this deployment.",
};

/**
 * DRAWN AS A PANEL OF THE COMPANY RESEARCH CARD, not as a card of its own. The
 * position page is tabs now, and ratios are one sub-tab of that card beside
 * Financials and Insider deals instead of a separate "Ratio analysis" card a
 * reader scrolled past. The body, the identity check and the refusal are
 * unchanged; only the frame moved — and the stand-alone frame went with its
 * last caller rather than being kept as a mode nothing selects.
 */
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
  const identity = useMemo(
    () => (doc && state?.ok ? checkIdentity(doc, name, state.sourceUrl) : null),
    [doc, name, state],
  );
  const breaks = useMemo(() => (doc && identity?.matches ? shareCountBreaks(doc) : []), [doc, identity]);

  if (!ticker) return null;

  const body = (() => {
    if (state === undefined) {
      return <div className="grid h-24 place-items-center text-sm text-slate-500">Loading ratio analysis…</div>;
    }
    if (!state.ok) {
      // THE HEADLINE FOLLOWS THE CAUSE. A gateway status is a fact about the
      // service; "No ratio table for this company" over a 522 tells a reader
      // this company publishes no ratios, which is a wrong diagnosis they will
      // act on. Only a genuine answer — a resolver that gave no page, a page
      // with no readable table — may say anything about the company.
      const outage = isOutage(state);
      return (
        <AbsentSection
          what={outage ? outageHeadline : "No ratio table for this company"}
          needs={outage
            ? outageSentence(state, "the seven-year ratio table")
            : `${REASONS[state.failureCode] ?? "The data service returned an error."}${
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
            company's ratios with nothing on it to say so. Measured across the first fifteen holdings that carry an
            NSE symbol, four resolved to an entirely different company — so this is checked per page rather than
            trusted, and a page that cannot be attributed is refused rather than shown.`}>
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
            Attribution checked — {identity.reason}. The ratio source resolves by name and was measured returning a
            DIFFERENT company for four of the first fifteen holdings tried, so every page is verified against this
            holding before a figure from it is shown.
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
          {/* Exempt, declared: the columns are the source's own seven year-ends
                and the rows are its line items with its own section headings, so
                sorting would scramble a document and moving a year would break
                its chronology. */}
            <table className="min-w-full whitespace-nowrap text-[12.5px]"
              data-table-static="the columns are the periods of an upstream financial document and the rows are its own line items, in its own order — sorting the rows would scramble a statement and moving a period would break its chronology">
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

        {/* THE BASIS AND THE SOURCE LINK ON THE FACE; how the table is read is
            the line's hover (Stage 10cp). */}
        <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500"
          title="Read by row label and column header, never by position — the source puts a chart placeholder in the second column, and a positional read would take it as the most recent year and shift every figure back one.">
          {doc.basis && <>{doc.basis} basis · </>}
          <a href={state.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-slate-400 hover:text-champagne-400">
            Source page <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </>
    );
  })();

  return (
    <div data-ratio-table>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] text-slate-500">Per-share, profitability, liquidity, coverage and valuation ratios, as the source reports them</span>
        <div className="flex items-center gap-1.5">
          {state?.ok && state.stale && <Pill tone="warn">last saved copy</Pill>}
          {identity && !identity.matches && <Pill tone="warn"><ShieldAlert className="mr-1 inline h-3 w-3" />refused</Pill>}
        </div>
      </div>
      {body}
    </div>
  );
}
