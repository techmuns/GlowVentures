import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { accountIndex, engagementOf } from "@/lib/accounts";
import { holdingBucket, bucketLabel, DIRECT_EQUITY_BUCKET } from "@/lib/analytics";
import { fetchIndices, STRIP_INDEX_IDS, type IndexFeed } from "@/lib/indices";
import { fmtPct, fmtNum, changeColor, DASH } from "@/lib/format";
import { symbolCoverage } from "@/lib/quotes";

// ── TODAY'S MOVERS, OVER DIRECT EQUITY ───────────────────────────────────────
//
// "which are today's movers, which are gainers … what are my gainers, what are
// my losers" and "my stocks and ETFs are up, Sensex is down this much, Nifty".
// Two questions on one card, because the second is only meaningful beside the
// first: a book up 0.4% is good news against an index down 1.1% and bad news
// against one up 2%.
//
// ── THE SET IS DIRECT EQUITY, BY REQUEST, AND THAT IS A DIFFERENT SET ────────
//
// *"daily movers/losers should comprise of direct equity holdings only."*
//
// `DIRECT_EQUITY_BUCKET` is this app's own answer to WHO CHOSE A HOLDING —
// settled in Stage 10L after the family reported the same thing three times, and
// applied again to the Transactions tab in Stage 10p. It means shares the family
// bought in its own demat or broking account (`Direct` / `Execution`), never
// shares a discretionary manager picked, and never a fund or an ETF. Measured on
// this book that is 37 holdings worth ₹94.9 Cr, of which 33 names and ₹82.3 Cr
// can reach the quote feed at all.
//
// What the narrowing LEAVES OUT is the point of the request and is therefore
// NAMED on the card rather than dropped: 131 priceable names worth ₹124.9 Cr
// held inside PMS mandates, and three ETFs worth ₹24.6 Cr. Before this the list
// mixed them — Jammu Kashmir Bank (Carnelian's pick) sat beside Fractal
// Analytics (the family's own demat) under one heading.
//
// ── THE ETFs CAME BACK AS TABS, AND THE TABS HAVE GONE AGAIN ────────────────
//
// *"remove these stocks etf mutual funds selectors for this top movers section…
// we will only show direct equity as default."*
//
// Stage 10ad answered the family's own first wording ("MY STOCKS AND ETFS are
// up, Sensex is down this much") by making the card open on the two together
// with Stocks, ETFs and Mutual funds each a tab of its own, behind `?movers=`.
// They have now asked for the selector to go and for the card to cover DIRECT
// EQUITY alone, which is the Stage 10t set exactly: shares the family bought in
// its own demat or broking account.
//
// THE OTHER THREE SCOPES ARE DELETED, NOT LEFT REACHABLE BY URL. The Holdings
// basis switch (Stage 10q) and the sector dropdown (Stage 10ah) both kept their
// param when their control went, and the stated reason was that pinning the
// flag to a literal would leave branches threaded through fifteen other sites
// unreachable — the dead-code-that-looks-alive failure. Nothing here is in that
// position: the ETF and Mutual-fund scopes existed ONLY to be tabs, they have no
// other caller, and one declared scope leaves no branch behind. So the rule that
// applies is the other one this repo keeps — a thing with exactly one caller
// goes with its caller, as `exportDeck.ts` went with the Review deck button.
//
// EVERY CAPTION STILL READS THE SCOPE RATHER THAN A LITERAL. The heading, the
// tile label, the coverage line, the index sentence and the excluded footer are
// five statements about which holdings the figure covers; spelling "Direct
// equity" into each of them is five places for one of them to be reworded and
// start describing a set the card does not show. That is the caption-that-widens
// failure the Capital invested tile already cost this book once, and one
// constant is what stops it.
//
// ── AND THE DAY'S MOVE IS OVER THE PRICED PART OF THAT SET ───────────────────
//
// A day change needs a LIVE price and the PREVIOUS CLOSE behind it; four Direct
// Equity names resolve to no NSE symbol and can never have one. Summing them in
// as zero would divide a real rupee move by a larger base and report a fraction
// of the true percentage — the classic "blend a missing value in as zero"
// failure, on the one figure a reader compares against an index. So the
// percentage is struck on the previous close of the positions that HAVE one, and
// the tile names what that covers.
//
// A POSITION WITH NO DAY CHANGE IS NOT A FLAT POSITION. `dayChange` is null when
// the feed gave no previous close, and null never enters a sum or a ranking —
// an unpriced holding must not appear in "today's losers" at ₹0.

type Row = {
  securityKey: string;
  security: string;
  dayChange: number;
  dayChangePct: number;
  marketValue: number;
  entities: string[];
};

const TOP_N = 6;

/**
 * ── WHAT "TODAY'S MOVERS" COVERS ────────────────────────────────────────────
 *
 * *"we will only show direct equity as default."*
 *
 * A set of `holdingBucket` keys — the SAME function the allocation table and the
 * Portfolio Monitor group on — so this card and the Direct Equity row a reader
 * clicks on Morning CIO's allocation table cover exactly the same holdings.
 * Re-deriving "is this the family's own share" from the asset class would be a
 * second answer: a share a discretionary manager picked is ordinary listed
 * equity too, and `holdingBucket` is where that distinction lives.
 *
 * `subject` and `verb` exist because these captions are SENTENCES about the set
 * — "Direct equity IS −0.2% against the Nifty 500" — and a label interpolated
 * into one has to agree with the verb after it. `noun` is what one name in the
 * set is called in the coverage line and in the empty state.
 */
const SCOPE = {
  label: "Direct Equity",
  buckets: [DIRECT_EQUITY_BUCKET] as readonly string[],
  // `subject` is interpolated into TWO sentences — "… is +11% against the Nifty
  // 500" and "… only. Also moved today and not counted here" — so it carries no
  // leading article: "The direct equity only." reads as a fragment.
  subject: "Direct equity", verb: "is", noun: "direct-equity",
} as const;

export function TodaysMovers() {
  const { portfolio, consolidated, quotesStatus, quotesAsOf, fmtFromBase } = usePortfolio();
  const [rank, setRank] = useState<"impact" | "pct">("impact");
  const [indices, setIndices] = useState<IndexFeed | null>(null);
  /**
   * THREE STATES, NOT TWO — the same rule `IndexStrip` already follows.
   *
   * This tile printed "Index levels unavailable — the feed did not respond"
   * whenever `indices` was null, which is true on the FIRST PAINT of every
   * open. A reader was told the feed had failed while the request was still in
   * flight. A failed POLL must not blank a good tile either: the last good
   * levels stay until a fresh set replaces them, and only a first load that
   * never succeeded reports the feed as down.
   */
  const [indexState, setIndexState] = useState<"loading" | "ok" | "down">("loading");

  useEffect(() => {
    let alive = true;
    let seen = false;
    const load = async () => {
      const f = await fetchIndices();
      if (!alive) return;
      if (f?.ok) { seen = true; setIndices(f); setIndexState("ok"); }
      // A FAILED POLL MUST NOT BLANK A GOOD TILE — only a first load that never
      // succeeded reports the feed as down. NOT COVERED BY `check:pages`, and
      // recorded here rather than left to look tested: reaching it needs one
      // successful response followed by a failure, and the poll is 60s apart.
      // It is the same guard `IndexStrip` carries for the same reason.
      else if (!seen) setIndexState("down");
    };
    load();
    const id = window.setInterval(() => { if (!document.hidden) load(); }, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const model = useMemo(() => {
    if (!portfolio) return null;
    const accts = accountIndex(portfolio.accounts);
    /**
     * THE SCOPE, and the axis is the ACCOUNT's engagement rather than the
     * security. `holdingBucket` reads it through `engagementOf`, which is the
     * one place this app decides who chose a holding; re-deriving it here would
     * be a second definition to drift — and it is what keeps a share a manager
     * picked out of this card even though it is the same asset as one beside
     * it: the mandate chose it, so it belongs to the mandate.
     */
    const inScope = (p: typeof consolidated[number]) =>
      (SCOPE.buckets).includes(holdingBucket(p, engagementOf(accts, p)));
    const scope = consolidated.filter(inScope);
    /**
     * WHAT THE NARROWING LEAVES OUT, NAMED RATHER THAN DROPPED.
     *
     * Counted over the holdings that could otherwise have appeared here — the
     * ones carrying a live day change — because that is the list the reader is
     * looking at. A bucket with no priceable name in it never showed on this
     * card and does not need excusing.
     */
    const excluded = new Map<string, { mv: number; names: Set<string> }>();
    for (const p of consolidated) {
      if (inScope(p)) continue;
      if (typeof p.dayChange !== "number" || !Number.isFinite(p.dayChange)) continue;
      const key = bucketLabel(holdingBucket(p, engagementOf(accts, p)));
      const e = excluded.get(key) ?? { mv: 0, names: new Set<string>() };
      e.mv += p.marketValue; e.names.add(p.securityKey);
      excluded.set(key, e);
    }
    const excludedRows = [...excluded.entries()]
      .map(([label, v]) => ({ label, mv: v.mv, names: v.names.size }))
      .sort((a, b) => b.mv - a.mv);

    // CONSOLIDATED: each dedupeGroup once, because this is a whole-book figure.
    // One name reported under two members must move the book once.
    const byKey = new Map<string, Row>();
    for (const p of scope) {
      if (typeof p.dayChange !== "number" || !Number.isFinite(p.dayChange)) continue;
      if (typeof p.dayChangePct !== "number" || !Number.isFinite(p.dayChangePct)) continue;
      const owner = accts.get(p.accountId)?.owner ?? null;
      const cur = byKey.get(p.securityKey);
      if (cur) {
        // The same security in several accounts is ONE mover. Its rupee impact
        // adds; its PERCENTAGE is the value-weighted one, re-derived from the
        // combined previous close rather than averaged — averaging two percents
        // over different position sizes is a figure neither statement supports.
        cur.dayChange += p.dayChange;
        cur.marketValue += p.marketValue;
        if (owner && !cur.entities.includes(owner)) cur.entities.push(owner);
      } else {
        byKey.set(p.securityKey, {
          securityKey: p.securityKey, security: p.security,
          dayChange: p.dayChange, dayChangePct: p.dayChangePct,
          marketValue: p.marketValue, entities: owner ? [owner] : [],
        });
      }
    }
    const rows = [...byKey.values()].map((r) => {
      const prev = r.marketValue - r.dayChange;
      return { ...r, dayChangePct: prev > 0 ? (r.dayChange / prev) * 100 : r.dayChangePct };
    });

    const movedValue = rows.reduce((a, r) => a + r.marketValue, 0);
    const dayChange = rows.reduce((a, r) => a + r.dayChange, 0);
    const prevValue = movedValue - dayChange;
    const dayPct = prevValue > 0 ? (dayChange / prevValue) * 100 : null;

    // COVERAGE IS OVER THE SCOPE, NOT THE BOOK. "159 of 214 distinct names" was
    // true of the whole book and is a claim about a set this card no longer
    // shows; against the active scope the honest denominator is its own — 40
    // names for stocks and ETFs together, 37 for stocks alone.
    const cov = symbolCoverage(scope);
    const distinct = new Set(scope.map((p) => p.securityKey)).size;
    const scopeValue = scope.reduce((a, p) => a + p.marketValue, 0);

    const gainers = rows.filter((r) => r.dayChange > 0);
    const losers = rows.filter((r) => r.dayChange < 0);
    const flat = rows.length - gainers.length - losers.length;
    const cmp = rank === "impact"
      ? (a: Row, b: Row) => Math.abs(b.dayChange) - Math.abs(a.dayChange)
      : (a: Row, b: Row) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct);
    return {
      rows, dayChange, dayPct, movedValue, prevValue, scopeValue, excludedRows,
      pricedNames: rows.length, distinct, unpriceable: cov.withoutSymbol,
      gainers: [...gainers].sort(cmp).slice(0, TOP_N),
      losers: [...losers].sort(cmp).slice(0, TOP_N),
      gainCount: gainers.length, lossCount: losers.length, flat,
      gainSum: gainers.reduce((a, r) => a + r.dayChange, 0),
      lossSum: losers.reduce((a, r) => a + r.dayChange, 0),
    };
  }, [portfolio, consolidated, rank]);

  if (!portfolio || !model) return null;

  const clock = quotesAsOf ? new Date(quotesAsOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    /* THE SUBTITLE IS GONE AT THE FAMILY'S REQUEST, AND THE TITLE CARRIES THE
       SCOPE INSTEAD. What that sentence did that a reader still needs is name
       the SET — a card headed "Today's movers" over 33 of the book's 214 names
       is a claim about the book, and Stage 10L is three rounds of the family
       reporting exactly that kind of heading. So the scope moves into the
       heading, where it cannot be removed as chrome, and the quote timestamp
       moves to the tile that is actually as-of it. */
    <Card className="lg:col-span-3" title={`Today\u2019s movers \u00b7 ${SCOPE.label}`}
      right={
        <div className="flex flex-wrap items-center gap-2">
          {/* THE SCOPE SELECTOR IS GONE AT THE FAMILY'S REQUEST. What is left in
              this slot RANKS the same rows two ways and changes no set — which
              is why it stays: a ₹40 L name up 9% is the larger mover by one
              measure and the smaller by the other, and neither ordering is the
              right one to pick for the reader. */}
          <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5" role="group" aria-label="Rank movers by">
            {(["impact", "pct"] as const).map((k) => (
              <button key={k} onClick={() => setRank(k)} aria-pressed={rank === k}
                className={["rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                  rank === k ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
                {k === "impact" ? "By ₹ impact" : "By % move"}
              </button>
            ))}
          </div>
        </div>
      }>

      {quotesStatus === "loading" && model.rows.length > 0 && (
        <p className="mb-4 text-[11.5px] text-slate-500">Fetching prices — figures are the last snapshot until they settle.</p>
      )}

      {/*
        AN EMPTY CARD MID-FETCH IS NOT AN ABSENCE, AND MUST NOT SAY IT IS.

        "No holding in this book carries a day change right now" is a claim
        ABOUT THE BOOK, and it used to render whenever there were no priced rows
        — including on the first paint of every cold open, while the feed was
        still in flight. A reader who sees it either believes their book cannot
        be priced or reloads until it goes away. That is the same defect this
        repo already records on the company page, where a panel still fetching
        asserted the security has no live quote: THE CAUSE PICKS THE HEADLINE.

        So the three states are separated. Still fetching says so. The feed
        having failed names the feed. Only a settled feed that priced nothing
        makes the claim about the book — and by then the claim is true.

        With the snapshot cache behind it (`quoteCache.ts`) the first branch is
        reached only on a genuinely cold open: a reload inside the session
        renders the previous figures immediately and never passes through here.
      */}
      {model.rows.length === 0 && quotesStatus === "loading" ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600/70 px-6 py-10 text-center"
             data-testid="movers-loading">
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
          <div className="text-sm font-medium text-slate-300">Fetching prices…</div>
          <p className="max-w-xl text-xs leading-relaxed text-slate-500">
            The day&rsquo;s move needs a live price and the previous close behind it. Nothing is shown until they land —
            no figure here has been estimated or carried over from another day.
          </p>
        </div>
      ) : model.rows.length === 0 ? (
        /* THE CAUSE PICKS THE HEADLINE, and there are two of them here rather
           than one. A feed that did not respond is a fact about the SERVICE and
           the top bar names it; a name that resolves no NSE symbol is a fact
           about that NAME, and no retry fixes it. Collapsing them tells a reader
           their book cannot be priced when the truth is that the feed is down —
           the confidently-wrong diagnosis this book keeps naming.

           A THIRD CAUSE WENT WITH THE MUTUAL-FUND TAB: a scheme has no trading
           symbol and can NEVER be priced intraday, which is a fact about the
           INSTRUMENT rather than about this name. It has no branch here because
           no fund is in this set any more, and it is written down rather than
           kept as an unreachable one — a scope that returns needs it back. */
        <AbsentSection
          what={`No ${SCOPE.noun} holding carries a day change right now`}
          needs={quotesStatus === "unavailable"
            ? "A day change needs a live price AND the previous close behind it, and the quote feed did not respond. Every holding is showing its statement mark; nothing has been substituted. The top bar names the failure."
            : `A day change needs a live price and a previous close. ${model.unpriceable} of the ${model.distinct} securities the family holds directly resolve to no NSE symbol and can never have one. Shares a discretionary manager picked, the ETFs and the fund units are not counted here — this card covers what the family bought itself.`} />
      ) : (
        <>
          {/* ── The book's own move, and the four indices beside it ───────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
              <div className="label-xs">{SCOPE.label} &middot; today</div>
              <div className={`mt-2 text-[22px] font-semibold tabular ${changeColor(model.dayChange)}`}>
                {fmtFromBase(model.dayChange, { compact: true, sign: true })}
              </div>
              <div className={`mt-0.5 text-[13px] font-semibold tabular ${changeColor(model.dayPct)}`}>
                {model.dayPct == null ? DASH : fmtPct(model.dayPct, { sign: true })}
              </div>
              {/* THE COVERAGE IS ON THE TILE, NOT IN A TOOLTIP. This percentage is
                  struck over the priced subset and a reader will compare it with
                  an index; the scope has to be visible at the same glance. */}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500" data-testid="movers-coverage">
                {/* THE VALUE THIS PERCENTAGE COVERS, BESIDE THE VALUE IT DOES
                    NOT. A name count alone hides how much of a set a figure
                    stands on — four of this scope's names resolve no symbol and
                    they are not four equal holdings — so "33 of 37" and
                    "₹82.3 Cr of ₹94.9 Cr" are different disclosures of one
                    fact, and the second is the one a reader needs beside a
                    percentage printed at 22px. `scopeValue` was already computed
                    for this and rendered nowhere, which is this book's
                    most-repeated defect. */}
                on {fmtFromBase(model.movedValue, { compact: true })} of the {fmtFromBase(model.scopeValue, { compact: true })} held,
                across {model.pricedNames} of {model.distinct} {SCOPE.noun} names — the rest carry no live quote and are
                not counted either way{clock ? ` · quotes ${clock}` : ""}
              </p>
            </div>

            <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4 sm:col-span-1 lg:col-span-2">
              <div className="label-xs">NSE indices · today</div>
              {!indices && indexState === "loading" ? (
                <p className="mt-2 text-[11.5px] text-slate-500">Fetching index levels…</p>
              ) : !indices ? (
                <p className="mt-2 text-[11.5px] text-slate-500">
                  Index levels unavailable — the feed did not respond. Nothing has been substituted for a level.
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
                  {STRIP_INDEX_IDS.map((id) => {
                    const q = indices.indices.find((x) => x.id === id);
                    if (!q) return null;
                    return (
                      <div key={id}>
                        <div className="truncate text-[11px] text-slate-500" title={q.label}>{q.label}</div>
                        <div className="tabular text-[13px] font-semibold text-slate-200">
                          {q.level == null ? DASH : fmtNum(q.level, 2)}
                        </div>
                        <div className={`tabular text-[11.5px] ${changeColor(q.changePct)}`}>
                          {q.changePct == null ? DASH : fmtPct(q.changePct, { sign: true })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {indices && model.dayPct != null && (() => {
                const n500 = indices.indices.find((x) => x.id === "nifty-500");
                if (!n500 || n500.changePct == null) return null;
                const gap = model.dayPct - n500.changePct;
                return (
                  /* "THE PRICED BOOK" WAS TRUE AND IS NOT ANY MORE. This figure
                     is struck over the SCOPE — direct equity, and the priced part
                     of it — and a sentence that called it the book would be the
                     caption-that-widens failure the Capital invested tile already
                     cost this page once. So the subject is the scope's own and is
                     read from it, never spelled in here. */
                  <p className="mt-3 border-t border-ink-700 pt-2 text-[11.5px] text-slate-400" data-testid="movers-vs-index">
                    {SCOPE.subject} {SCOPE.verb} <strong className={changeColor(gap)}>{fmtPct(gap, { sign: true })}</strong> against the
                    Nifty 500 today, on {fmtFromBase(model.movedValue, { compact: true })} of
                    the {fmtFromBase(portfolio.totalValue, { compact: true })} book. Both are one session, and neither is a
                    return over any longer window.
                  </p>
                );
              })()}
            </div>
          </div>

          {/* ── Gainers and losers ────────────────────────────────────────── */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* A COUNT AND ITS NOUN AGREE. "1 GAINERS" was on the family's own
                screenshot of this card, and over 33 priced names a one-name list
                is an ordinary session rather than a rarity. */}
            <MoverList title={`${model.gainCount} gainer${model.gainCount === 1 ? "" : "s"}`} tone="gain" rows={model.gainers}
              total={model.gainSum} fmt={fmtFromBase} rank={rank} noun={SCOPE.noun} />
            <MoverList title={`${model.lossCount} loser${model.lossCount === 1 ? "" : "s"}`} tone="loss" rows={model.losers}
              total={model.lossSum} fmt={fmtFromBase} rank={rank} noun={SCOPE.noun} />
          </div>
          {/* THE EXPLANATORY FOOTER IS GONE AT THE FAMILY'S REQUEST — the ranking
              rationale, the unchanged-name count and the multi-account rule all
              described HOW the card works to a reader who can see it working.
              What survives is the one thing a figure depends on and a reader
              cannot see: this card no longer covers the whole book, and the
              value it stops at has to be named or the narrowing is silent.
              Rendered from the book, so a drop with no PMS-held quotes prints
              nothing here rather than a sentence about an empty set. */}
          {model.excludedRows.length > 0 && (
            <p className="mt-3 text-[11px] text-slate-500" data-testid="movers-excluded">
              {SCOPE.subject} only. Also moved today and not counted here:{" "}
              {model.excludedRows.map((e, i) => (
                <span key={e.label}>
                  {i > 0 ? " · " : ""}{e.names} {e.label} {fmtFromBase(e.mv, { compact: true })}
                </span>
              ))}.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function MoverList({ title, tone, rows, total, fmt, rank, noun }: {
  title: string; tone: "gain" | "loss"; rows: Row[]; total: number;
  fmt: (n: number | null | undefined, o?: { compact?: boolean; sign?: boolean }) => string;
  rank: "impact" | "pct";
  /** What one holding in the active scope is called — the empty state says it. */
  noun: string;
}) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4" data-testid={`movers-${tone}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="label-xs">{title}</div>
        {/* AN EMPTY LIST HAS NO TOTAL, AND `₹0` IS NOT ONE. Summing an empty
            collection through a money formatter is the exact case §2 names — a
            measured zero and an absent measurement must never look the same —
            and on a day when nothing fell, "0 losers · ₹0" reads as a measured
            ₹0 of losses rather than as an empty set. The dash carries the reason;
            the sentence underneath says what was actually measured. */}
        {rows.length === 0
          ? <Pill><span title="No priced holding moved this way today, so there is no total to sum.">{DASH}</span></Pill>
          : <Pill tone={tone}>{fmt(total, { compact: true, sign: true })}</Pill>}
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-[11.5px] text-slate-500">
          No priced {noun} holding moved this way today — a measurement over the names the feed prices, not a
          statement about the whole book.
        </p>
      ) : (
        <table className="mt-3 w-full text-[12px]">
          <tbody className="divide-y divide-ink-700">
            {rows.map((r) => (
              <tr key={r.securityKey}>
                <td className="py-1.5 pr-2">
                  <Link to={`/stock/${encodeURIComponent(r.securityKey)}`}
                    className="text-slate-300 transition-colors hover:text-champagne-400"
                    title={r.entities.length ? `Held by ${r.entities.join(", ")}` : undefined}>
                    {r.security}
                  </Link>
                </td>
                <td className={`py-1.5 pr-3 text-right tabular ${rank === "pct" ? "font-semibold" : ""} ${changeColor(r.dayChangePct)}`}>
                  {fmtPct(r.dayChangePct, { sign: true })}
                </td>
                <td className={`py-1.5 text-right tabular ${rank === "impact" ? "font-semibold" : ""} ${changeColor(r.dayChange)}`}>
                  {fmt(r.dayChange, { compact: true, sign: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
