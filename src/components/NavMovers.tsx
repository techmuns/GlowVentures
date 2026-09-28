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
import { navMoverModel, isDrastic, unitBasisDiffers, DRASTIC_PCT, type NavMover } from "@/lib/navMovers";
import { fmtPct, changeColor, DASH } from "@/lib/format";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";

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
// A published NAV is as recent as the last `npm run build-fund-navs` (AMFI's
// file, refreshed every morning) — or, for the few schemes that file does not
// carry, the last `npm run build-lookthrough`. So the heading carries the newest
// date, a row carries its own, and a row struck on an older date than the newest
// says so and is kept out of the tile's one-day figure. Calling any of it "today" would be
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
 * line, the basis (the tile's hover since the family asked for the panel that
 * carried it to go), the derived rupee figure and every skipped-holding reason
 * are unchanged — which is the point, because the two branches are
 * different measurements and the whole risk of putting them behind one control
 * is that they start to look like one. `DailyMovers.tsx` argues that at length.
 *
 * THE TOGGLE RENDERS IN ALL FOUR BRANCHES, including loading, store-down and
 * nothing-priced. A control that disappears when the store does not answer
 * strands a reader on a card that cannot fill, with no way back to the one that
 * works. The prop is optional so this component still stands alone.
 */
/** The columns, in the order this table's rows write their cells. */
const NAV_MOVER_COLS = ["scheme", "nav", "move", "impact", "held"] as const;

export function NavMovers({ scopeToggle }: { scopeToggle?: React.ReactNode }) {
  const { portfolio, consolidated, fmtFromBase } = usePortfolio();
  /**
   * THE DEFAULT IS THE PERCENTAGE, matching the card it toggles with — *"keep % wise
   * as the default view and ₹ wise absolute as the second toggle option"* — and
   * matching what was asked for here, which is a move rather than an impact:
   * *"if there is a drastic moment in the line item … can we capture that"*.
   */
  const [rank, setRank] = useState<Rank>("pct");
  const view = useTableView("nav-movers", NAV_MOVER_COLS);
  /** `undefined` = still loading · `null` = the store did not answer. */
  const [schemes, setSchemes] = useState<Map<string, SchemeMatch> | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadFundNavs().then((m) => { if (alive) setSchemes(m); });
    return () => { alive = false; };
  }, []);

  const model = useMemo(() => {
    // THE LOOK-THROUGH STORE IS A FALLBACK NOW (B-02), so a store that did not
    // answer no longer blanks the card: every scheme AMFI's file carries is still
    // priced, and the few that only the store could have priced are named with
    // that reason. Only a store still in flight holds the card, so it renders
    // once rather than redrawing when the fallback lands.
    if (!portfolio || schemes === undefined) return null;
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
  if (!model || model.rows.length === 0) {
    return (
      <Card className="lg:col-span-3" title={title} right={scopeToggle}>
        <AbsentSection what="No ETF or mutual-fund holding has a published NAV move"
          needs={`Neither AMFI's daily NAV file nor the look-through store carries a scheme with two published NAVs for any of the ${model?.scopeNames ?? 0} names held here. A move needs a NAV and the one before it; \`npm run build-fund-navs\` refreshes AMFI's file and accumulates the previous day.`} />
      </Card>
    );
  }

  /**
   * THE CARD'S OWN RANKING IS THE DEFAULT AND A COLUMN SORT OVERRIDES IT. The
   * two answer different questions — the ranking is by the SIZE of a move
   * whichever way it went, a column sort is signed — so neither replaces the
   * other, and clicking a heading a third time clears the sort and hands the
   * ranking back.
   */
  const rows = sortRows(
    [...model.rows].sort(rank === "impact"
      ? (a, b) => Math.abs(b.move) - Math.abs(a.move)
      : (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)),
    view.sort,
    {
      scheme: (r) => r.scheme,
      nav: (r) => Number(String(r.nav).replace(/[^\d.-]/g, "")),
      move: (r) => r.changePct,
      impact: (r) => r.move,
      held: (r) => r.value,
    },
  );
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
  /**
   * WHAT THIS MEASUREMENT IS — the panel that stood beside the tile, as the
   * tile's own hover. Plain text, because a `title` renders no markup; the
   * sentences are the panel's, so nothing a reader relied on was reworded.
   */
  const basisText = [
    `Each scheme's own published NAV against the one before it — ${model.oldestNavDate === model.newestNavDate
      ? `both struck ${model.newestNavDate}.`
      : `struck between ${model.oldestNavDate} and ${model.newestNavDate}; a scheme does not publish on a non-business day, so the rows do not share one date.`}`,
    "That is a different measurement from the Direct Equity branch of this card, which is a live intraday price against the previous session's close — the two are never added together.",
    // MNT-10: the value is units × AMFI's NAV wherever the overlay priced the
    // holding — not "its own statement's" mark, which is true of the few AMFI
    // does not price.
    "The rupee figure is derived: the scheme's move applied to what this book values the holding at — units × AMFI's published NAV where AMFI publishes one, and the statement's own mark where it does not.",
    "Each scheme's NAV is AMFI's own daily file — the same NAV the rest of the dashboard values the fund at. A scheme that file does not carry is on the look-through store's NAV, and its row says so.",
    ...(model.olderRows ? [`${model.olderRows} scheme${model.olderRows === 1 ? "" : "s"} last published on an earlier day ${model.olderRows === 1 ? "is" : "are"} listed with ${model.olderRows === 1 ? "its" : "their"} own date and kept out of the figure above, which is one day's move.`] : []),
    "AIF folios are not here — no alternative fund publishes a daily NAV.",
  ].join("\n\n");

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

      {/* ── THE TILE IS THE WHOLE ROW NOW, AND ITS BASIS IS ITS HOVER ──────────
          *"remove the highlighted texts from the dashboard UI"* — pointed at the
          "What this measures" panel that stood beside this tile.

          Every claim in it was audited before it went, the method this file has
          run on every removal:

            · "each scheme's published NAV against the one before it" and the
              span of dates — the heading carries the newest date, and every row
              struck on an OLDER one says so on its own second line
              (`SchemeNote`), so a reader is never misled about a row's day;
            · "never added to the Direct Equity branch" — NO SECOND HOME, and
              it is the load-bearing one: one control switching between two
              measurements is exactly where a future edit would sum them;
            · "the rupee figure is derived" — already the `₹ on holding`
              column's own hover, and now the tile's too;
            · "AIF folios are not here" — NO SECOND HOME.

          The two without one go into this tile's HOVER with the rest, which is
          weaker than a caption and is said here rather than glossed.
          `check:pages` reads them there and asserts the panel stays gone. */}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 rounded-xl border border-ink-700 bg-ink-900/60 p-4"
           data-testid="navmovers-tile" title={basisText}
           data-navmovers-move={model.move} data-navmovers-pct={model.changePct ?? ""}
           data-navmovers-covered={model.coveredValue} data-navmovers-scope={model.scopeValue}>
        {/* THE TILE IS DATED, AND THE DATE IS THE HEADING RATHER THAN "TODAY". */}
        {/* THE FIGURES CARRY STRUCTURAL HANDLES.
            Reintroducing two bugs proved why: an aggregate struck as the
            unweighted MEAN of the rows, and a model that stopped SUMMING a
            scheme's holdings, both left the sweep completely clean. Every check
            on this card was counting rows and reading dates — comparing the page
            with itself — and neither defect changes a count or a date. They are
            reconciled against `NAV_MOVERS_BOOK` now, which derives the same four
            figures from the book and the store by a different path. */}
        <div>
          <div className="label-xs" data-testid="navmovers-asof">
            Published NAV &middot; {model.newestNavDate}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={`font-display text-[22px] font-bold tabular ${changeColor(model.move)}`}>
              {fmtFromBase(model.move, { compact: true, sign: true })}
            </span>
            <span className={`text-[13px] font-semibold tabular ${changeColor(model.changePct)}`}>
              {model.changePct == null ? DASH : fmtPct(model.changePct, { sign: true })}
            </span>
          </div>
        </div>
        {/* THE FIGURES ON ITS FACE, THE SENTENCE IN ITS HOVER (Stage 10cp) —
            the family asked for the lines that explain a card to go. What the
            move stands on is still on screen, in rupees and in schemes; what the
            store could not price is counted on the face and named below. Two
            more counts ride on the face beside them, each explained in the
            hover: a scheme last published on an OLDER day is listed below with
            its own date and is not in the figure (rule 8, MNT-9), and the liquid
            funds are Cash by the family's rule, so "of the ₹X held" must not
            read as every fund they own (MNT-15). */}
        <p className="max-w-2xl text-[11px] leading-relaxed text-slate-500 sm:text-right" data-testid="navmovers-coverage"
          data-navmovers-older={model.olderRows} data-navmovers-cash-funds={model.cashFunds.names}
          title={`The move is struck on ${fmtFromBase(model.coveredValue, { compact: true })} of the ${fmtFromBase(model.scopeValue, { compact: true })} held, across ${model.rows.length} scheme${model.rows.length === 1 ? "" : "s"} behind ${model.scopeNames} name${model.scopeNames === 1 ? "" : "s"}${
            model.skipped.length > 0
              ? ` — ${model.skipped.length} holding${model.skipped.length === 1 ? "" : "s"}${
                  skippedNames === model.skipped.length ? "" : ` across ${skippedNames} name${skippedNames === 1 ? "" : "s"}`
                } worth ${fmtFromBase(skippedValue, { compact: true })} resolve no scheme and are not counted either way`
              : ""}.${
            model.olderRows > 0
              ? ` ${model.olderRows} scheme${model.olderRows === 1 ? "" : "s"} worth ${fmtFromBase(model.olderValue, { compact: true })} last published earlier ${model.olderRows === 1 ? "is" : "are"} listed below with ${model.olderRows === 1 ? "its" : "their"} own date and ${model.olderRows === 1 ? "is" : "are"} not in this figure, which is one day's move.`
              : ""}${
            model.cashFunds.names > 0
              ? ` ${model.cashFunds.names} liquid fund${model.cashFunds.names === 1 ? "" : "s"} worth ${fmtFromBase(model.cashFunds.value, { compact: true })} ${model.cashFunds.names === 1 ? "is" : "are"} Cash on this dashboard and not on this card.`
              : ""}`}>
          {fmtFromBase(model.coveredValue, { compact: true })} of {fmtFromBase(model.scopeValue, { compact: true })} held
          {" "}· {model.rows.length} scheme{model.rows.length === 1 ? "" : "s"} · {model.scopeNames} name{model.scopeNames === 1 ? "" : "s"}
          {model.skipped.length > 0 ? ` · ${model.skipped.length} not priced` : ""}
          {/* COUNTS ON THE FACE, THE SENTENCES IN THE HOVER (Stage 10cp): which
              schemes are on an older day and why they are not in the move, and
              which liquid funds are Cash on this dashboard, are the title's. */}
          {model.olderRows > 0 ? ` · ${model.olderRows} on an older NAV` : ""}
          {model.cashFunds.names > 0 ? ` · ${model.cashFunds.names} in Cash` : ""}
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <Tr view={view} className="border-b border-ink-700">
              <SortHeader col="scheme" view={view} align="left" pad="py-1.5 pr-2">Scheme</SortHeader>
              <SortHeader col="nav" view={view} pad="py-1.5 pr-3">NAV</SortHeader>
              <SortHeader col="move" view={view} pad="py-1.5 pr-3"
                title={`The scheme's own published move, NAV against the one before it. Every scheme with a published move is listed; a move of ${DRASTIC_PCT}% or more in one published day is chipped drastic.`}>Move</SortHeader>
              <SortHeader col="impact" view={view} pad="py-1.5 pr-3" title="The scheme's move applied to what this book values the holding at. Derived — the two sides are dated differently.">&#8377; on holding</SortHeader>
              <SortHeader col="held" view={view} pad="py-1.5" title="What this book values these holdings at: units × AMFI's published NAV where AMFI publishes one, else the statement's own mark. Each cell's hover says which.">Held</SortHeader>
            </Tr>
          </thead>
          <tbody className="divide-y divide-ink-700">
            {rows.map((r) => (
              <Tr view={view} key={r.schemecode} className="hover:bg-ink-700/40" data-navmover-row={r.schemecode}
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
                    data-navmover-source={r.source}
                    title={`${r.prevNavDate} ${r.prevNav} → ${r.navDate} ${r.nav} · ${r.source === "amfi" ? "AMFI's daily NAV file" : "the look-through store (AMFI's daily file does not carry this scheme)"}`}>
                  {r.nav}
                </td>
                <td className={`py-1.5 pr-3 text-right tabular ${rank === "pct" ? "font-semibold" : ""} ${changeColor(r.changePct)}`}>
                  {fmtPct(r.changePct, { sign: true })}
                  {isDrastic(r) && <span className="ml-1.5 align-middle" title={`A move of ${DRASTIC_PCT}% or more in one published day. The chip labels a row and never decides which rows are drawn.`}><Pill tone={r.changePct > 0 ? "gain" : "loss"}>drastic</Pill></span>}
                </td>
                <td className={`py-1.5 pr-3 text-right tabular ${rank === "impact" ? "font-semibold" : ""} ${changeColor(r.move)}`}>
                  {fmtFromBase(r.move, { compact: true, sign: true })}
                </td>
                <td className="py-1.5 text-right tabular text-slate-400"
                    title={r.valueBasis === "nav"
                      ? `What this book values the holding at: its units × AMFI's published NAV of ${r.navDate}.`
                      : r.valueBasis === "mixed"
                        ? `What this book values these holdings at: units × AMFI's published NAV of ${r.navDate} on some statements, and the statement's own mark${r.valueAsOf ? ` (${r.valueAsOf})` : ""} on the rest.`
                        : r.valueAsOf
                          ? `What this book values the holding at, on its own statement of ${r.valueAsOf} — a different date from the ${r.navDate} NAV beside it.`
                          : "What this book values the holding at, on the statement that reports it."}>
                  {fmtFromBase(r.value, { compact: true })}
                </td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* WHAT THE STORE COULD NOT PRICE IS NAMED, with its own reason. A
          holding dropped in silence is indistinguishable from one that moved
          nothing. The NAMES are on the face and the reason is the line's hover
          (Stage 10cp) — a depository's funds on a transaction-only demat
          (Stage 10cx) brought two schemes this store never resolved, and the
          reason beside them ran the line past one short line. */}
      {model.skipped.length > 0 && (
        <div className="mt-3 space-y-0.5" data-testid="navmovers-skipped">
          {skippedByReason.map((g) => (
            <p key={g.reason} className="text-[11px] text-slate-500" title={`Not priced here — ${g.reason}.`}>
              Not priced here: {g.names.map((n, i) => (
                <span key={n.security}>{i > 0 ? " \u00b7 " : ""}{n.security}
                  {n.rows > 1 ? <span className="text-slate-600"> ({n.rows} statements)</span> : null}
                </span>
              ))}
            </p>
          ))}
        </div>
      )}
      {/* THE "Every scheme is listed · … chipped drastic" LINE UNDER THE TABLE
          IS GONE (Stage 10cp): the bound is the Move heading's hover and each
          chip's own, where a reader looking at a chip asks what it means. */}
    </Card>
  );
}

/**
 * The second line under a scheme's name, and every part of it is conditional —
 * a note that renders on every row is chrome, and one that renders on the rows
 * it is true of is information.
 */
function SchemeNote({ row, newest }: { row: NavMover; newest: string | null }) {
  // ONE SHORT LINE ON THE ROW, THE WHY IN ITS HOVER — a note on a table is one
  // line, and the DSP Gold row carried four clauses running to 228 characters.
  const bits: string[] = [];
  const why: string[] = [];
  // Only where the book holds BOTH plans of one fund, which is what makes two
  // rows of one scheme name legitimate rather than a duplicate.
  if (row.plan) bits.push(`${row.plan} plan`);
  if (row.keys > 1) { bits.push(`${row.keys} holdings clubbed`); why.push(`${row.keys} holdings in this book resolve to this one scheme, so they are one row.`); }
  else if (row.positions > 1) bits.push(`${row.positions} statements`);
  // A ROW OLDER THAN THE NEWEST SAYS SO. Without it a reader takes the card's
  // heading date for every row on it.
  if (newest && row.navDate !== newest) {
    bits.push(`NAV ${row.navDate}`);
    why.push(`This scheme last published on ${row.navDate}, before the ${newest} the card is dated, so it is listed and kept out of the day's figure.`);
  }
  // The store's own tier, surfaced only where it is NOT the ISIN — an exact
  // identifier needs no disclosure and a name match does.
  if (row.matchedVia !== "isin") { bits.push(`matched on ${row.matchedVia}`); why.push(`The scheme was matched on its ${row.matchedVia}, not an ISIN.`); }
  // WHOSE NAV (B-02): only where it is not AMFI's file, which every other
  // surface prices from.
  if (row.source === "lookthrough") { bits.push("look-through NAV"); why.push("AMFI's daily NAV file does not carry this scheme, so its NAV is the fund look-through store's."); }
  // THE UNIT BASES DIFFER (MNT-3). The book's units and this NAV are not one
  // unit — ₹151 a unit on the statement beside a ₹14.76 NAV — so `units × NAV`
  // would be an order of magnitude out. Said on the row, never left for a
  // reader to multiply.
  if (unitBasisDiffers(row) && row.unitRatio != null) {
    bits.push("units on another basis · % move only");
    why.push(`The book's units are on another basis from this NAV (its mark is ${row.unitRatio.toFixed(1)}× the NAV), so only the percentage move is applied — never units × NAV.`);
  }
  if (!bits.length) return null;
  return <div className="text-[10.5px] text-slate-500" data-scheme-note title={why.length ? why.join(" ") : undefined}>{bits.join(" · ")}</div>;
}
