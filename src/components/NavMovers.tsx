import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { accountIndex } from "@/lib/accounts";
import { currentHoldings } from "@/lib/analytics";
import { loadFundNavs, type SchemeMatch } from "@/lib/lookthrough";
import { navMoverModel, isDrastic, DRASTIC_PCT, type NavMover } from "@/lib/navMovers";
import { fmtPct, changeColor, DASH } from "@/lib/format";

// ── DAILY-NAV MOVERS ────────────────────────────────────────────────────────
//
// The second half of "today's movers", over the instruments the quote feed
// cannot reach. `navMovers.ts` carries the whole argument for why this is a
// separate MEASUREMENT on separate dates rather than more rows on the quote-fed
// card it now toggles with, and why the rupee figure is derived from the book's
// value rather than from units × NAV. This file renders it.
//
// ── IT DRAWS EVERY COVERED ROW, AND THAT IS DELIBERATE ──────────────────────
//
// Today's movers shows a top six per side, which is right for 33 direct-equity
// names. Here the covered set is 18 rows, and a top-N would have to choose
// between two rankings that disagree at the extremes: by percentage the biggest
// mover on this book is a ₹107 residual holding in an index fund, and by rupees
// it is a ₹42 Cr position that moved 0.12%. Neither is wrong and hiding either
// is. So every row is drawn, ranked, with its VALUE in the row — which makes a
// 0.86% move on ₹107 self-evidently trivial without anything being suppressed.
//
// ── THE DATE IS ON THE CARD, NOT THE WORD "TODAY" ───────────────────────────
//
// A published NAV is as recent as the last `npm run build-lookthrough`, and the
// schemes do not all publish on the same day — this book spans two dates. So
// the heading carries the newest date, a row carries its own, and a row struck
// on an older date than the newest says so. Calling any of it "today" would be
// the defect `/api/indices` already cost this repo: a real figure under the
// wrong day, which is the kind a reader cannot catch.

type Rank = "pct" | "impact";

/**
 * ── IT IS ONE BRANCH OF A TOGGLE NOW, AND NOT A CARD OF ITS OWN ─────────────
 *
 * *"give a toggle button in the direct equity daily movers for 'direct
 * equity/ETF & Mutual Funds', and remove the separate daily movers for ETF and
 * Mutual Funds."* Both halves of that are one change: this card stopped
 * standing beside Today's movers and became the second branch of it.
 *
 * NOTHING IT MEASURES MOVED. The title, the published-NAV date, the coverage
 * line, the basis paragraph, the derived rupee figure and every skipped-holding
 * reason are unchanged — which is the point, because the two branches are
 * different measurements and the whole risk of putting them behind one control
 * is that they start to look like one. `DailyMovers.tsx` argues that at length.
 *
 * THE TOGGLE RENDERS IN ALL FOUR BRANCHES, including loading, store-down and
 * nothing-priced. A control that disappears when the store does not answer
 * strands a reader on a card that cannot fill, with no way back to the one that
 * works. The prop is optional so this component still stands alone.
 */
export function NavMovers({ scopeToggle }: { scopeToggle?: React.ReactNode }) {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();
  /**
   * THE DEFAULT IS THE PERCENTAGE, matching the card it toggles with — *"keep % wise
   * as the default view and ₹ wise absolute as the second toggle option"* — and
   * matching what was asked for here, which is a move rather than an impact:
   * *"if there is a drastic moment in the line item … can we capture that"*.
   */
  const [rank, setRank] = useState<Rank>("pct");
  /** `undefined` = still loading · `null` = the store did not answer. */
  const [schemes, setSchemes] = useState<Map<string, SchemeMatch> | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadFundNavs().then((m) => { if (alive) setSchemes(m); });
    return () => { alive = false; };
  }, []);

  const model = useMemo(() => {
    if (!portfolio || !schemes) return null;
    const accts = accountIndex(portfolio.accounts);
    // CURRENT HOLDINGS, on the CONSOLIDATED set — the same two filters every
    // allocation surface applies. A scheme redeemed to nil still publishes a
    // NAV, so without `currentHoldings` this card would report a daily move on
    // money the family no longer has.
    return navMoverModel(currentHoldings(consolidated), accts, schemes);
  }, [portfolio, consolidated, schemes]);

  if (!portfolio) return null;

  const title = "Daily NAV movers · ETFs & mutual funds";

  // THE THREE STATES ARE SEPARATED, and only the third is a claim about the
  // book. A store still loading is a fact about the fetch; a store that did not
  // answer is a fact about the store; a store that answered and priced nothing
  // is a fact about the holdings. Collapsing them is the defect this repo
  // records on the company page and on Today's movers.
  if (schemes === undefined) {
    return (
      <Card className="lg:col-span-3" title={title} right={scopeToggle}>
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600/70 px-6 py-8 text-center"
             data-testid="navmovers-loading">
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
          <div className="text-sm font-medium text-slate-300">Reading published NAVs…</div>
        </div>
      </Card>
    );
  }
  if (schemes === null) {
    return (
      <Card className="lg:col-span-3" title={title} right={scopeToggle}>
        <AbsentSection what="The NAV store did not respond"
          needs="These moves come from the committed AMFI NAV store rather than the live quote feed, and the request for it failed. Nothing has been substituted: every holding is showing its statement mark elsewhere on this page." />
      </Card>
    );
  }
  if (!model || model.rows.length === 0) {
    return (
      <Card className="lg:col-span-3" title={title} right={scopeToggle}>
        <AbsentSection what="No ETF or mutual-fund holding has a published NAV move"
          needs={`The store answered and carries no scheme with two published NAVs for any of the ${model?.scopeNames ?? 0} names held here. A move needs a NAV and the one before it; run \`npm run build-lookthrough\` against the AmfiBeas checkout to refresh the store.`} />
      </Card>
    );
  }

  const rows = [...model.rows].sort(rank === "impact"
    ? (a, b) => Math.abs(b.move) - Math.abs(a.move)
    : (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const skippedValue = model.skipped.reduce((a, s) => a + s.value, 0);
  /**
   * THE HOLDINGS THE STORE CANNOT PRICE, GROUPED BY THE REASON THEY CANNOT BE.
   *
   * Three different things put a holding here — no scheme resolves it, a scheme
   * resolves with no NAV, a scheme has one NAV and nothing to measure against —
   * and only the last is a "wait for tomorrow". The first draft printed
   * `skipped[0].reason` as though it were THE reason, which is right only while
   * every skipped holding happens to share a cause.
   *
   * Grouped by REASON and then by NAME, because a name reported by several
   * statements is one holding to a reader: LIQUIDBEES is four statement rows in
   * this book and one security, and a list repeating it four times reads as
   * four different problems.
   */
  const skippedByReason = [...model.skipped.reduce((m, s) => {
    const e = m.get(s.reason) ?? new Map<string, { security: string; value: number; rows: number }>();
    const n = e.get(s.securityKey) ?? { security: s.security, value: 0, rows: 0 };
    n.value += s.value; n.rows += 1;
    e.set(s.securityKey, n); m.set(s.reason, e);
    return m;
  }, new Map<string, Map<string, { security: string; value: number; rows: number }>>())]
    .map(([reason, names]) => ({ reason, names: [...names.values()] }));
  /** Distinct SECURITIES the store cannot price — the count the list shows. */
  const skippedNames = new Set(model.skipped.map((s) => s.securityKey)).size;

  return (
    <Card className="lg:col-span-3" title={title}
      right={
        /* TWO CONTROLS: the SCOPE toggle (owned by `DailyMovers`) switches which
           MEASUREMENT the card shows, and the RANKING reorders these rows. */
        <div className="flex flex-wrap items-center justify-end gap-2">
        {scopeToggle}
        <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5" role="group" aria-label="Rank NAV movers by">
          {(["pct", "impact"] as const).map((k) => (
            <button key={k} onClick={() => setRank(k)} aria-pressed={rank === k} data-navmover-rank={k}
              className={["rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                rank === k ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
              {k === "impact" ? "By ₹ impact" : "By % move"}
            </button>
          ))}
        </div>
        </div>
      }>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* THE TILE IS DATED, AND THE DATE IS THE HEADING RATHER THAN "TODAY". */}
        {/* THE FIGURES CARRY STRUCTURAL HANDLES.
            Reintroducing two bugs proved why: an aggregate struck as the
            unweighted MEAN of the rows, and a model that stopped SUMMING a
            scheme's holdings, both left the sweep completely clean. Every check
            on this card was counting rows and reading dates — comparing the page
            with itself — and neither defect changes a count or a date. They are
            reconciled against `NAV_MOVERS_BOOK` now, which derives the same four
            figures from the book and the store by a different path. */}
        <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4"
             data-navmovers-move={model.move} data-navmovers-pct={model.changePct ?? ""}
             data-navmovers-covered={model.coveredValue} data-navmovers-scope={model.scopeValue}>
          <div className="label-xs" data-testid="navmovers-asof">
            Published NAV &middot; {model.newestNavDate}
          </div>
          <div className={`mt-2 text-[22px] font-semibold tabular ${changeColor(model.move)}`}>
            {fmtFromBase(model.move, { compact: true, sign: true })}
          </div>
          <div className={`mt-0.5 text-[13px] font-semibold tabular ${changeColor(model.changePct)}`}>
            {model.changePct == null ? DASH : fmtPct(model.changePct, { sign: true })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500" data-testid="navmovers-coverage">
            on {fmtFromBase(model.coveredValue, { compact: true })} of the {fmtFromBase(model.scopeValue, { compact: true })} held,
            across {model.rows.length} scheme{model.rows.length === 1 ? "" : "s"} behind {model.scopeNames} name{model.scopeNames === 1 ? "" : "s"}
            {model.skipped.length > 0
              ? ` — ${model.skipped.length} holding${model.skipped.length === 1 ? "" : "s"}${
                  skippedNames === model.skipped.length ? "" : ` across ${skippedNames} name${skippedNames === 1 ? "" : "s"}`
                } worth ${fmtFromBase(skippedValue, { compact: true })} resolve no scheme and are not counted either way`
              : ""}
          </p>
        </div>

        {/* WHAT THIS MEASUREMENT IS, beside the figure rather than under the
            table: a reader switching from the quote-fed branch needs to
            know at a glance that the two are struck on different days and on
            different kinds of price. */}
        <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4 sm:col-span-2">
          <div className="label-xs">What this measures</div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400" data-testid="navmovers-basis">
            Each scheme&rsquo;s own <strong>published NAV against the one before it</strong> — {model.oldestNavDate === model.newestNavDate
              ? <>both struck {model.newestNavDate}</>
              : <>struck between {model.oldestNavDate} and {model.newestNavDate}; a scheme does not publish on a non-business day, so the rows do not share one date</>}.
            That is a different measurement from the Direct Equity branch of this card, which is a live intraday price
            against the previous session&rsquo;s close — the two are never added together.
            The rupee figure is <strong>derived</strong>: the scheme&rsquo;s move applied to what this book values the holding at, whose
            mark is its own statement&rsquo;s. AIF folios are not here — no alternative fund publishes a daily NAV.
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-2 font-medium">Scheme</th>
              <th className="py-1.5 pr-3 text-right font-medium">NAV</th>
              <th className="py-1.5 pr-3 text-right font-medium">Move</th>
              <th className="py-1.5 pr-3 text-right font-medium" title="The scheme's move applied to what this book values the holding at. Derived — the two sides are dated differently.">&#8377; on holding</th>
              <th className="py-1.5 text-right font-medium" title="What this book values these holdings at, on the statement that reports them.">Held</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700">
            {rows.map((r) => (
              <tr key={r.schemecode} className="hover:bg-ink-700/40" data-navmover-row={r.schemecode}
                  data-navmover-pct={r.changePct} data-navmover-keys={r.keys} data-navmover-date={r.navDate}>
                <td className="py-1.5 pr-2">
                  <Link to={`/stock/${encodeURIComponent(r.securityKey)}`}
                    className="text-slate-300 transition-colors hover:text-champagne-400"
                    title={r.entities.length ? `Held by ${r.entities.join(", ")}` : undefined}>
                    {r.scheme}
                  </Link>
                  <SchemeNote row={r} newest={model.newestNavDate} />
                </td>
                <td className="py-1.5 pr-3 text-right tabular text-slate-400"
                    title={`${r.prevNavDate} ${r.prevNav} → ${r.navDate} ${r.nav}`}>
                  {r.nav}
                </td>
                <td className={`py-1.5 pr-3 text-right tabular ${rank === "pct" ? "font-semibold" : ""} ${changeColor(r.changePct)}`}>
                  {fmtPct(r.changePct, { sign: true })}
                  {isDrastic(r) && <span className="ml-1.5 align-middle"><Pill tone={r.changePct > 0 ? "gain" : "loss"}>drastic</Pill></span>}
                </td>
                <td className={`py-1.5 pr-3 text-right tabular ${rank === "impact" ? "font-semibold" : ""} ${changeColor(r.move)}`}>
                  {fmtFromBase(r.move, { compact: true, sign: true })}
                </td>
                <td className="py-1.5 text-right tabular text-slate-400"
                    title={r.valueAsOf
                      ? `What this book values the holding at, on its own statement of ${r.valueAsOf} — a different date from the ${r.navDate} NAV beside it.`
                      : "What this book values the holding at, on the statement that reports it."}>
                  {fmtFromBase(r.value, { compact: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* WHAT THE STORE COULD NOT PRICE IS NAMED, with its own reason. A
          holding dropped in silence is indistinguishable from one that moved
          nothing. */}
      {model.skipped.length > 0 && (
        <div className="mt-3 space-y-0.5" data-testid="navmovers-skipped">
          {skippedByReason.map((g) => (
            <p key={g.reason} className="text-[11px] text-slate-500">
              Not priced here: {g.names.map((n, i) => (
                <span key={n.security}>{i > 0 ? " \u00b7 " : ""}{n.security}
                  {n.rows > 1 ? <span className="text-slate-600"> ({n.rows} statements)</span> : null}
                </span>
              ))} &mdash; {g.reason}.
            </p>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-slate-500" data-testid="navmovers-drastic-note">
        Every scheme with a published move is listed, ranked by {rank === "pct" ? "the size of the move" : "its rupee effect"}; a
        move of {DRASTIC_PCT}% or more in a single published day is chipped <em>drastic</em>. The chip labels a row and never
        decides which rows are drawn.
      </p>
    </Card>
  );
}

/**
 * The second line under a scheme's name, and every part of it is conditional —
 * a note that renders on every row is chrome, and one that renders on the rows
 * it is true of is information.
 */
function SchemeNote({ row, newest }: { row: NavMover; newest: string | null }) {
  const bits: string[] = [];
  // Only where the book holds BOTH plans of one fund, which is what makes two
  // rows of one scheme name legitimate rather than a duplicate.
  if (row.plan) bits.push(`${row.plan} plan`);
  if (row.keys > 1) bits.push(`${row.keys} holdings clubbed on one scheme`);
  else if (row.positions > 1) bits.push(`${row.positions} statements`);
  // A ROW OLDER THAN THE NEWEST SAYS SO. Without it a reader takes the card's
  // heading date for every row on it.
  if (newest && row.navDate !== newest) bits.push(`NAV ${row.navDate}`);
  // The store's own tier, surfaced only where it is NOT the ISIN — an exact
  // identifier needs no disclosure and a name match does.
  if (row.matchedVia !== "isin") bits.push(`scheme matched on ${row.matchedVia}, not an ISIN`);
  if (!bits.length) return null;
  return <div className="text-[10.5px] text-slate-500">{bits.join(" · ")}</div>;
}
