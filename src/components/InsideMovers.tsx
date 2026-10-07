import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { istDate } from "@/components/IndexStrip";
import { fmtPct, fmtNum, changeColor, DASH } from "@/lib/format";
import { insideMovers, type InsideMoverRow } from "@/lib/insideMovers";
import { loadFundDisclosures } from "@/lib/fundDisclosures";
import type { FundDisclosureData } from "@/lib/ledgerModel";
import { splitFundClass } from "../../shared/securityKey.mjs";

// ── THE MOVERS INSIDE THE AIFs AND THE PMS MANDATES ──────────────────────────
//
// *"In the daily movers section we have 2 scopes as of now, Direct equity and
// ETF and mutual funds. We need to add another section that would be AIF and
// PMS… I hope you understand that we will not show that particular AIF or the
// PMS that is having the highest gain or lose but we will show the holding
// inside all of the AIF and PMS which are having the highest daily gain or
// lose."* — the family, 7 Oct 2026.
//
// So A WRAPPER IS NEVER A ROW. Every row on this card is a COMPANY, and which
// companies there are to rank, how each one's figure is struck and what is left
// out is `src/lib/insideMovers.ts` — one model, so the two halves of the card
// cannot be struck on two sessions or two quotes. What this file does is draw
// it, and keep the one distinction that must never be flattened on screen:
//
//   - a PMS mandate reports every share, so its day's move AND its rupee impact
//     are MEASURED, through the same gate the Direct Equity card is struck on;
//   - an AIF reports a folio. One fund in this book discloses its own portfolio,
//     as a name and a weight, so the family's exposure to a company inside it is
//     DERIVED and carries NO RUPEE DAY IMPACT — the fund's units are not marked
//     daily at the underlying's live prices, and the weight is a month old.
//
// THE PERCENTAGE IS THE SAME FIGURE EITHER WAY. It is the exchange's own move
// for the company, which is the whole reason one row can carry both halves
// without mixing a measurement — and it is why the ranking a reader asked for
// ("the holding … having the highest daily gain or lose") is answerable at all
// over a set that is part reported and part derived.
//
// ── THE DERIVED FIGURE IS A VALUE, NOT A DAY'S IMPACT ────────────────────────
//
// It is therefore NOT a fourth column beside the money column, which is a day's
// move: two money figures in adjacent columns under one heading is the
// caption-that-does-not-describe-its-figure failure this book has paid for more
// than once. It is a chip UNDER THE NAME, labelled `derived` in words at the
// point it appears rather than in a tooltip (Stage 10aj), and the tile above
// says in words that it is in no total on this card.
//
// ── NO INDEX STRIP, AND THAT IS A DECISION ───────────────────────────────────
//
// The Direct Equity branch sets the family's own book against the Nifty 500,
// because that is a like-for-like comparison: a book of listed shares the family
// chose, against an index of listed shares, over one session. Neither half here
// is that. A PMS mandate's shares are a manager's picks and the derived half is
// not marked daily at all, so a "scope vs index" line would set a figure struck
// over a part-derived set against a market index and invite a reader to read it
// as performance. `NavMovers` left it out for its own reason (a published NAV is
// not a session) and `IndexStrip` renders the four levels at the top of every
// route regardless, so nothing is lost by not drawing them twice.
// ─────────────────────────────────────────────────────────────────────────────

type Row = InsideMoverRow;
// EVERY MOVER IS LISTED, NOT THE FIRST SIX (Stage 10dm), as on the Direct
// Equity branch: the headings count every company that moved each way, and the
// ranking decides the ORDER, never the length.
const SCOPE_LABEL = "AIF & PMS";

/** A fund without its unit class — the class is the family's holding, not the fund. */
const fundLabel = (f: string) => splitFundClass(f)?.fund ?? f;

export function InsideMovers({ scopeToggle }: { scopeToggle?: React.ReactNode }) {
  const { portfolio, consolidated, quoteFeed, quotesStatus, pendingFor, requestSymbols, refreshQuotes,
    corporateActions, corporateActionReturns, fmtFromBase } = usePortfolio();
  const [rank, setRank] = useState<"pct" | "impact">("pct");

  /**
   * THREE STATES, NOT TWO (`NavMovers`' own rule). `undefined` is the store
   * still loading, `null` is a store that did not answer, and a value is a
   * store that did. A store still loading is a fact about the FETCH; one that
   * did not answer is a fact about the STORE; one that answered and disclosed
   * nothing would be a fact about the FUNDS. Collapsing them lets a fetch in
   * flight say the funds disclose nothing.
   */
  const [disclosures, setDisclosures] = useState<FundDisclosureData | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadFundDisclosures()
      .then((d) => { if (alive) setDisclosures(d); })
      .catch(() => { if (alive) setDisclosures(null); });
    return () => { alive = false; };
  }, []);

  const model = useMemo(() => {
    if (!portfolio) return null;
    const inside = insideMovers({
      positions: consolidated, accounts: portfolio.accounts, quotes: quoteFeed,
      returns: corporateActionReturns, actions: corporateActions,
      // A STORE STILL LOADING IS PASSED AS ABSENT AND THE CARD HOLDS, below:
      // ranking the mandate half now and adding the disclosed half a round
      // later is the "first shows incomplete data" defect Stage 10an fixed,
      // arriving through a second source rather than through a second request.
      disclosures: disclosures ?? null,
    });

    /**
     * THE MEASURED HALF'S AGGREGATE, over the rows that carry BOTH a value and a
     * day change — the same construction the Direct Equity tile uses, so the two
     * tiles are comparable figures rather than two formulas. The previous close
     * is derived from those rows alone, so the percentage divides one set.
     */
    const impactRows = inside.rows.filter((r) => r.mandateDayChange !== null && r.mandateValue !== null);
    const movedValue = impactRows.reduce((a, r) => a + r.mandateValue!, 0);
    const dayChange = impactRows.length ? impactRows.reduce((a, r) => a + r.mandateDayChange!, 0) : null;
    const prevValue = movedValue - (dayChange ?? 0);
    const dayPct = prevValue > 0 && dayChange !== null ? (dayChange / prevValue) * 100 : null;

    /**
     * TWO REASONS A ROW CARRIES NO RUPEE IMPACT, AND THEY ARE WORDED APART.
     *
     * `withheld` is a share the family's mandate DOES hold and whose live value
     * the corporate-action gate held back (Stage 10dc) — answerable, and the
     * gate's own reason says what by.
     *
     * `fundOnly` is a company the family reach ONLY inside a fund. There is no
     * share count to verify and never will be: the fund's units are not marked
     * at the underlying's prices, so there is no rupee day impact to withhold.
     * Told the first reason a reader would go looking for a verification that
     * does not apply.
     */
    const withheld = inside.rows.filter((r) => r.mandateValue !== null && r.mandateDayChange === null);
    const fundOnly = inside.rows.filter((r) => r.mandateValue === null);

    const ranked = rank === "impact" ? impactRows : inside.rows;
    const gainers = ranked.filter((r) => r.dayChangePct > 0);
    const losers = ranked.filter((r) => r.dayChangePct < 0);
    const cmp = rank === "impact"
      ? (a: Row, b: Row) => Math.abs(b.mandateDayChange!) - Math.abs(a.mandateDayChange!)
      : (a: Row, b: Row) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct);
    return {
      inside, impactNames: impactRows.length, movedValue, dayChange, dayPct,
      withheldNames: withheld.map((r) => r.security),
      withheldReasons: [...new Set(withheld.map((r) => inside.omitted.get(r.securityKey))
        .filter((x): x is string => !!x))],
      fundOnlyNames: fundOnly.map((r) => r.security),
      gainers: [...gainers].sort(cmp),
      losers: [...losers].sort(cmp),
      gainCount: gainers.length, lossCount: losers.length,
      /**
       * A TOTAL ONLY WHERE IT COVERS ITS OWN LIST. Ranked by % move the list
       * holds the derived-only names and the withheld ones; summing the rest
       * would print a figure over part of a list under a heading counting all
       * of it (Stage 10dc).
       */
      gainSum: gainers.length && gainers.every((r) => r.mandateDayChange !== null)
        ? gainers.reduce((a, r) => a + r.mandateDayChange!, 0) : null,
      lossSum: losers.length && losers.every((r) => r.mandateDayChange !== null)
        ? losers.reduce((a, r) => a + r.mandateDayChange!, 0) : null,
      gainUnknown: gainers.filter((r) => r.mandateDayChange === null).length,
      lossUnknown: losers.filter((r) => r.mandateDayChange === null).length,
    };
  }, [portfolio, consolidated, quoteFeed, corporateActionReturns, corporateActions, disclosures, rank]);

  useEffect(() => {
    if (model && model.impactNames === 0) setRank("pct");
  }, [model?.impactNames]);

  if (!portfolio || !model) return null;
  const { inside } = model;

  /**
   * THE CARD LANDS COMPLETE, OR IT SAYS WHAT IT IS STILL WAITING ON.
   *
   * Two things have to arrive, and the ranking spans both — so it is drawn once
   * both are in rather than redrawn as each lands. `/api/quotes` prices a
   * bounded slice per request (Stage 10an) and the disclosure store is a second
   * fetch; a top-gainers list over one half of the set promotes a name that is
   * not the top and omits the one that is.
   *
   * A FAILED FETCH IS NOT A SLOW ONE, on either. An unavailable quote feed
   * stops the wait and renders what is there; a disclosure store that did not
   * answer stops it too, and the AIF tile says so rather than reporting that no
   * fund discloses anything.
   */
  /**
   * THE DISCLOSED COMPANIES HAVE TO BE ASKED FOR, OR THIS CARD WAITS FOR EVER.
   *
   * The quote request is built from the BOOK — its positions, the live-only
   * funds and the depository's own balances — and a company reached only
   * inside a fund is in none of those: it arrives in the disclosure store,
   * which loads after the first round has already gone out. A symbol nobody
   * asked about is pending for ever (`pendingAmong`), so the scope below could
   * never settle and the card held on its loading branch with 135 of 163 names
   * landed. Registering the scope is a UNION into the next round; the mandate
   * symbols in it are already asked for and cost nothing twice.
   */
  useEffect(() => { requestSymbols(inside.scopeSymbols); }, [requestSymbols, inside.scopeSymbols]);

  const scopePending = quotesStatus === "unavailable" ? [] : pendingFor(inside.scopeSymbols);
  const settling = scopePending.length > 0 || disclosures === undefined;
  const landed = inside.scopeSymbols.length - scopePending.length;

  const sessionLabel = inside.session === istDate() ? "today"
    : inside.session ? `session ${inside.session}` : "latest available prices";
  const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const firstObserved = inside.observedFrom ? time(inside.observedFrom) : null;
  const lastObserved = inside.observedTo ? time(inside.observedTo) : null;
  const clock = firstObserved && lastObserved && firstObserved !== lastObserved
    ? `${firstObserved}–${lastObserved}` : firstObserved;

  const d = inside.fund.disclosing;
  const disclosedValue = d.reduce((a, f) => a + f.value, 0);

  return (
    <Card className="lg:col-span-3"
      title={`${inside.session === istDate() ? "Today’s movers" : inside.session ? "Latest session movers" : "Latest price movers"} · ${SCOPE_LABEL}`}
      right={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {scopeToggle}
          <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5" role="group" aria-label="Rank movers by">
            {/* `data-mover-rank` is the handle, not the label — the same contract
                the Direct Equity card's ranking carries. */}
            {(["pct", "impact"] as const).map((k) => (
              <button key={k} onClick={() => setRank(k)} disabled={k === "impact" && model.impactNames === 0}
                aria-pressed={rank === k} data-mover-rank={k}
                className={["rounded px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40",
                  rank === k ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
                {k === "impact" ? "By ₹ impact" : "By % move"}
              </button>
            ))}
          </div>
        </div>
      }>

      {quotesStatus === "loading" && !settling && inside.rows.length > 0 && (
        <p className="mb-4 text-[11.5px] text-slate-500" data-movers-refreshing
          title="The figures below are the last complete round of prices; a newer round is in flight and replaces them when it settles.">Refreshing prices</p>
      )}
      {quotesStatus === "unavailable" && inside.rows.length > 0 && (
        <p className="mb-4 text-[11.5px] text-amber-500/80" data-testid="movers-cached">
          The quote feed did not answer this round — showing saved prices{clock ? ` observed ${clock}` : ""}.
        </p>
      )}

      {settling || (inside.rows.length === 0 && quotesStatus === "loading") ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600/70 px-6 py-10 text-center"
             data-testid="movers-loading" data-movers-landed={landed} data-movers-needed={inside.scopeSymbols.length}>
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
          <div className="text-sm font-medium text-slate-300">
            {disclosures === undefined ? "Reading what the funds disclosed…" : "Fetching prices…"}
          </div>
          {/* ONE LINE, THE COUNT — why the card waits is its hover. */}
          {disclosures !== undefined && inside.scopeSymbols.length > 0 && (
            <p className="text-xs text-slate-500" data-movers-progress
              title="The day’s move needs a live price and the previous close behind it, and the ranking spans the shares the mandates report and the companies the funds disclosed. Every figure here is struck over the whole scope, so it is shown once the scope has landed in full rather than redrawn as each name arrives.">
              {landed} of {inside.scopeSymbols.length} names have landed so far
            </p>
          )}
        </div>
      ) : inside.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-600/70 px-6 py-8 text-center" data-testid="movers-unavailable" role="status">
          <p className="text-sm font-medium text-slate-300">Daily price changes are temporarily unavailable</p>
          <p className="mt-2 text-xs text-slate-500">
            {quotesStatus === "unavailable" ? "The quote service did not respond. Retrying automatically."
              : [...new Set(inside.omitted.values())].join(" · ") || "Waiting for comparable market prices."}
          </p>
          <button className="mt-3 text-xs text-champagne-400 underline" onClick={refreshQuotes}>Retry prices</button>
        </div>
      ) : (
        <>
          {/* A STATUS ON THE FACE, THE SENTENCE IN THE HOVER (Stage 10cp). */}
          {model.withheldNames.length > 0 && (
            <p className="mb-3 text-xs text-amber-500/90" data-testid="movers-price-only"
              data-price-only={model.withheldNames.length}
              title={`Share counts await verification for ${model.withheldNames.length} name${model.withheldNames.length === 1 ? "" : "s"} a mandate holds — ${model.withheldNames.join(", ")}. Their exchange % moves are shown; their money impact is withheld and is in no rupee figure on this card.${rank === "impact" ? " This ranking includes only names with verified money impact." : ""}${model.withheldReasons.length ? ` Why: ${model.withheldReasons.map((x) => x.replace(/\.$/, "")).join(". ")}.` : ""}`}>
              {model.withheldNames.length} name{model.withheldNames.length === 1 ? "" : "s"} {rank === "impact" ? "left out" : "ranked by % move only"} · share count{model.withheldNames.length === 1 ? "" : "s"} unverified
            </p>
          )}
          {/* A DERIVED-ONLY NAME IS A DIFFERENT ABSENCE, so it is its own line.
              There is no share count to verify: the family hold the FUND, and a
              fund's units are not marked daily at what it holds. */}
          {model.fundOnlyNames.length > 0 && (
            <p className="mb-3 text-xs text-slate-500" data-testid="movers-fund-only"
              data-fund-only={model.fundOnlyNames.length}
              title={`${model.fundOnlyNames.length} compan${model.fundOnlyNames.length === 1 ? "y" : "ies"} the family reach only inside a fund — ${model.fundOnlyNames.join(", ")}. The exchange's own % move is shown; there is no rupee day impact, because the fund's units are not marked daily at the prices of what it holds and its disclosed weight is a month old.${rank === "impact" ? " This ranking leaves them out." : ""}`}>
              {model.fundOnlyNames.length} name{model.fundOnlyNames.length === 1 ? "" : "s"} {rank === "impact" ? "left out" : "ranked by % move only"} · held inside a fund
            </p>
          )}

          {/* ── The two halves, as two tiles that are never added ─────────── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4" data-testid="inside-mandate-tile">
              <div className="label-xs">PMS mandates &middot; {sessionLabel}</div>
              <div className={`mt-2 font-display text-[22px] font-bold tabular ${changeColor(model.dayChange)}`}>
                {fmtFromBase(model.dayChange, { compact: true, sign: true })}
              </div>
              {model.dayChange === null && <p className="mt-1 text-xs text-slate-500">Money impact awaits verified share counts</p>}
              <div className={`mt-0.5 text-[13px] font-semibold tabular ${changeColor(model.dayPct)}`}>
                {model.dayPct == null ? DASH : fmtPct(model.dayPct, { sign: true })}
              </div>
              {/* FIGURES ON THE FACE, THE SENTENCE IN THE HOVER. And no rupee
                  clause over an empty set: with no verified share count the
                  money total covers nothing, and "₹0 of ₹138.7 Cr held" reads
                  as a measured zero. */}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500" data-testid="inside-mandate-coverage"
                title={`${model.impactNames > 0
                  ? `The move is struck on ${fmtFromBase(model.movedValue, { compact: true })} of the ${fmtFromBase(inside.mandate.value, { compact: true })} the family hold inside PMS mandates, across ${model.impactNames} of ${inside.mandate.names} names — the rest lack a quote or a verified share count and are in no money total here.`
                  : `No money move is struck: none of the ${inside.mandate.names} names a mandate reports has both a live quote and a verified share count, so the ${fmtFromBase(inside.mandate.value, { compact: true })} held carries no rupee figure here.`}${inside.mandate.unpriced.length ? ` ${inside.mandate.unpriced.length} name${inside.mandate.unpriced.length === 1 ? "" : "s"} no quote reaches — ${inside.mandate.unpriced.slice(0, 8).map((u) => `${u.security} ${fmtFromBase(u.value, { compact: true })}`).join(", ")}${inside.mandate.unpriced.length > 8 ? ", and others" : ""} — are in neither figure; the cash a mandate sweeps into a liquid fund is most of it.` : ""}${clock ? ` Quotes as of ${clock}.` : ""}`}>
                {model.impactNames > 0 && <>{fmtFromBase(model.movedValue, { compact: true })} of {fmtFromBase(inside.mandate.value, { compact: true })} held &middot; </>}
                {model.impactNames} of {inside.mandate.names} names{clock ? ` · quotes ${clock}` : ""}
              </p>
            </div>

            <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4" data-testid="inside-fund-tile">
              <div className="label-xs">Inside the AIFs{d.length === 1 ? ` · as of ${d[0].asOf}` : ""}</div>
              <div className="mt-2 font-display text-[22px] font-bold tabular text-slate-200">
                {disclosures === null ? DASH : fmtFromBase(inside.fund.derivedValue, { compact: true })}
              </div>
              {/* THE FENCE IS ON THE FACE, IN WORDS, NEVER IN A TOOLTIP. This is
                  the family's share of what a fund disclosed — their units times
                  the fund's own weight — and it is a VALUE rather than a day's
                  move, so it is in neither figure beside it and in no book
                  total anywhere. */}
              <p className="mt-0.5 text-[11.5px] font-medium text-champagne-400/90" data-testid="inside-fund-fence">
                {disclosures === null ? "the disclosure store did not answer" : "derived · in no total above"}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500" data-testid="inside-fund-coverage"
                title={disclosures === null
                  ? "The store that carries what a fund disclosed did not answer this round. Nothing has been substituted for it, and this says nothing about whether the funds disclose a portfolio."
                  : `${d.length
                    ? `${d.map((f) => `${f.fund} discloses ${f.lines} lines adding to ${fmtNum(f.pctCovered, 2)}% of its own net assets as of ${f.asOf}, of which ${f.priced} (${fmtNum(f.pricedPct, 2)}%) reach an exchange quote`).join("; ")}. The derived figure is the family's ${fmtFromBase(disclosedValue, { compact: true })} of units times those weights, and it is in no total on this card and in no book total: a fund's units are not marked at the prices of what it holds.`
                    : "No AIF folio in this book publishes a portfolio this book can join, so no company inside one can be ranked here."}${inside.fund.silent.length ? ` ${inside.fund.silent.length} AIF folio${inside.fund.silent.length === 1 ? "" : "s"} publish${inside.fund.silent.length === 1 ? "es" : ""} nothing joinable — ${inside.fund.silent.slice(0, 12).map((s) => `${s.fund} ${fmtFromBase(s.value, { compact: true })}`).join(", ")} — so what they hold is not known rather than nothing.` : ""}${inside.fund.unpriced.length ? ` ${inside.fund.unpriced.length} disclosed line${inside.fund.unpriced.length === 1 ? "" : "s"} no quote reaches, carrying ${fmtNum(inside.fund.unpriced.reduce((a, u) => a + (u.pct ?? 0), 0), 2)}% of the disclosing fund.` : ""}${inside.fund.vacuous ? ` ${inside.fund.verified} of the ${inside.fund.verified + inside.fund.vacuous} priced companies had their quote checked against this book's own mark; the other ${inside.fund.vacuous} the book carries no mark for, so there was nothing to check it against.` : ""}`}>
                {disclosures === null
                  ? <>{inside.fund.funds} AIF folios held &middot; disclosures unread</>
                  : <>{fmtFromBase(disclosedValue, { compact: true })} of {fmtFromBase(inside.fund.value, { compact: true })} held &middot; {d.length} of {inside.fund.funds} funds disclose</>}
              </p>
            </div>
          </div>

          {/* ── Gainers and losers ────────────────────────────────────────── */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <InsideList title={`${model.gainCount} gainer${model.gainCount === 1 ? "" : "s"}`} tone="gain" rows={model.gainers}
              total={model.gainSum} count={model.gainCount} unknown={model.gainUnknown} fmt={fmtFromBase} rank={rank} />
            <InsideList title={`${model.lossCount} loser${model.lossCount === 1 ? "" : "s"}`} tone="loss" rows={model.losers}
              total={model.lossSum} count={model.lossCount} unknown={model.lossUnknown} fmt={fmtFromBase} rank={rank} />
          </div>
        </>
      )}
    </Card>
  );
}

function InsideList({ title, tone, rows, total, count, unknown, fmt, rank }: {
  title: string; tone: "gain" | "loss"; rows: Row[]; total: number | null;
  count: number; unknown: number;
  fmt: (n: number | null | undefined, o?: { compact?: boolean; sign?: boolean }) => string;
  rank: "impact" | "pct";
}) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4" data-testid={`movers-${tone}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="label-xs">{title}</div>
        {/* AN EMPTY LIST HAS NO TOTAL, AND A LIST HOLDING A NAME WITH NO MONEY
            IMPACT HAS NONE EITHER — `₹0` would read as a measured zero in the
            first case and as a complete sum in the second. */}
        {rows.length === 0
          ? <Pill><span title="No priced holding inside an AIF or a PMS mandate moved this way today, so there is no total to sum.">{DASH}</span></Pill>
          : total === null
            ? <Pill tone={tone}><span data-mover-total-absent={unknown}
                title={`No total: ${unknown} of these ${count} name${count === 1 ? "" : "s"} ${unknown === 1 ? "carries" : "carry"} no money impact — an unverified share count, or a company the family reach only inside a fund — so it is not summed as zero.`}>{DASH}</span></Pill>
            : <Pill tone={tone}>{fmt(total, { compact: true, sign: true })}</Pill>}
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-[11.5px] text-slate-500"
          title="A measurement over the names the feed prices, not a statement about every company inside the family's funds and mandates.">
          No AIF or PMS holding moved this way today
        </p>
      ) : (
        <table className="mt-3 w-full text-[12px]">
          <tbody className="divide-y divide-ink-700">
            {rows.map((r) => {
              const funds = [...new Set(r.via.map((v) => fundLabel(v.fund)))];
              return (
                <tr key={r.securityKey} data-mover-row={r.securityKey}>
                  <td className="py-1.5 pr-2">
                    <Link to={`/stock/${encodeURIComponent(r.securityKey)}`}
                      className="text-slate-300 transition-colors hover:text-champagne-400"
                      title={r.entities.length ? `Held by ${r.entities.join(", ")}` : undefined}>
                      {r.security}
                    </Link>
                    {/* THE DERIVED HALF, UNDER THE NAME AND LABELLED IN WORDS.
                        Never a money column of its own: a value beside a day's
                        move under one heading is two different figures in one
                        row of columns. */}
                    {funds.length > 0 && (
                      <div className="mt-0.5 text-[10.5px] text-champagne-400/80" data-mover-via={r.securityKey}
                        title={`${r.via.map((v) => `${v.fund} discloses ${v.pct == null ? "no weight for" : `${fmtNum(v.pct, 2)}% in`} this company as of ${v.asOf}`).join("; ")}.${r.fundValue != null
                          ? ` The family's share of it is ${fmt(r.fundValue)} — their units' value times that weight — which is derived, is in no figure above and is in no book total.`
                          : r.fundValueWhy ? ` No derived figure: ${r.fundValueWhy}.` : ""}`}>
                        inside {funds.length <= 2 ? funds.join(", ") : `${funds.length} funds`}
                        {r.fundValue != null ? <> &middot; {fmt(r.fundValue, { compact: true })} derived</> : <> &middot; weight not stated</>}
                      </div>
                    )}
                  </td>
                  <td data-mover-cell="pct" className={`py-1.5 pr-3 text-right align-top tabular ${rank === "pct" ? "font-semibold" : ""} ${changeColor(r.dayChangePct)}`}>
                    {fmtPct(r.dayChangePct, { sign: true })}
                  </td>
                  {/* THE CAUSE PICKS THE HOVER. A share a mandate holds whose
                      count the gate held back is answerable; a company reached
                      only inside a fund has no rupee day impact to hold back. */}
                  <td data-mover-cell="impact"
                    title={r.mandateDayChange !== null ? undefined
                      : r.mandateValue !== null
                        ? "Share count needs verification; the percentage is the exchange price move."
                        : "Held only inside a fund — its units are not marked daily at the prices of what it holds, so there is no rupee day impact. The percentage is the exchange price move."}
                    className={`py-1.5 text-right align-top tabular ${rank === "impact" ? "font-semibold" : ""} ${changeColor(r.mandateDayChange)}`}>
                    {fmt(r.mandateDayChange, { compact: true, sign: true })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
