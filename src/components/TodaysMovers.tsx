import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { accountIndex, engagementOf } from "@/lib/accounts";
import { holdingBucket, bucketLabel, currentHoldings, DIRECT_EQUITY_BUCKET, MANDATE_BUCKET } from "@/lib/analytics";
import { fetchIndices, STRIP_INDEX_IDS, type IndexFeed } from "@/lib/indices";
import { indexSession, istDate } from "@/components/IndexStrip";
import { fmtPct, fmtNum, changeColor, DASH } from "@/lib/format";
import { dailyMovers, type DailyMover } from "@/lib/dailyMovers";
import { symbolCoverage, symbolsFor } from "@/lib/quotes";
import { shareCandidates } from "@/lib/depositoryShares";
import { liveWithheldReason } from "@/lib/corporateActions";

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
// ── THE SCOPE HERE IS A CONSTANT, AND THE TOGGLE ABOVE IT IS NOT A SCOPE ─────
//
// Four tabs sat on this card once — Stocks & ETFs / Stocks / ETFs / Mutual
// funds, on `?movers=` — after the family read their own first wording ("my
// stocks and ETFs are up") as asking for the ETFs back. They removed them
// (*"we will only show direct equity as default"*), and `MOVER_SCOPES`,
// `CANNOT_BE_PRICED` and every caption that read an active tab went with the
// control: each was a different SET of ONE model, so keeping three unselectable
// ones alive would have left their captions, nouns, verbs and a mutual-fund
// absence essay standing for a card that renders one set for ever.
//
// THIS CARD'S SET IS STILL THAT ONE CONSTANT. What sits in the `right` slot now
// is `DailyMovers`' toggle, and it does something different in kind: it swaps
// this whole card for `NavMovers`, which is a different MEASUREMENT on
// different dates — a published NAV against the one before it, not a live price
// against the previous close. Nothing here widens, and the two are never summed.
// See `DailyMovers.tsx`, which is where that distinction is argued.
//
// EVERY CAPTION READS THE SET rather than a literal — the tile label, the
// coverage line, the index comparison and the excluded footer each state what
// the figure covers, and a caption that widens or narrows a figure it does not
// is the failure the Capital invested tile already cost this book once. They
// read one constant now instead of an active tab, which is the same discipline
// with one fewer thing that can drift.
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

type Row = DailyMover;

// EVERY MOVER IS LISTED, NOT THE FIRST SIX (Stage 10dk). The headings count
// every name that moved each way — "15 gainers", "23 losers" — and a list cut to
// six under that count read as a card that had lost the rest. The family asked
// for the whole list; the ranking still decides the ORDER, never the length.

/**
 * ── WHAT "TODAY'S MOVERS" COVERS ────────────────────────────────────────────
 *
 * A set of `holdingBucket` keys — the SAME function the allocation table and the
 * Portfolio Monitor group on — so this card and the row a reader clicks on
 * Morning CIO's allocation table cover exactly the same holdings. Re-deriving
 * "is this direct equity" from the asset class would be a second answer: a share
 * a discretionary manager picked is not a holding the family chose, and
 * `holdingBucket` is where that distinction lives.
 *
 * `subject` and `verb` exist because these captions are SENTENCES about the set
 * — "Direct equity IS −0.2% against the Nifty 500" — and a label interpolated
 * into one has to agree with the verb after it. `noun` is what one name in the
 * set is called in the coverage line. They are fields rather than inline strings
 * because four separate captions read them, and four hand-typed labels are four
 * chances for one of them to describe a different set from the figure it sits on.
 */
const SCOPE = {
  label: "Direct Equity",
  buckets: [DIRECT_EQUITY_BUCKET] as readonly string[],
  subject: "Direct equity",
  verb: "is",
  noun: "direct-equity",
} as const;

/**
 * ── IT IS ONE BRANCH OF A TOGGLE NOW, AND IT RENDERS THE CONTROL ────────────
 *
 * *"give a toggle button in the direct equity daily movers for 'direct
 * equity/ETF & Mutual Funds'."* `DailyMovers` owns the choice and hands the
 * control down; this card renders it in its own `right` slot beside the
 * ranking, in EVERY branch including the loading and absent ones. A toggle that
 * vanishes while the feed is down strands a reader on a card that cannot fill.
 *
 * The prop is optional so this component still stands alone — which is what the
 * `cio-filling` route walks, and what a future caller outside the toggle gets.
 */
export function TodaysMovers({ scopeToggle }: { scopeToggle?: React.ReactNode }) {
  const { portfolio, consolidated, quotesStatus, quoteFeed, corporateActionReturns, refreshQuotes, pendingFor, fmtFromBase } = usePortfolio();
  /**
   * THE DEFAULT IS THE PERCENTAGE MOVE, at the family's request — *"keep % wise
   * as the default view and ₹ wise absolute as the second toggle option."*
   *
   * The two answer different questions and neither subsumes the other, which is
   * why both are offered: a 9% move on a ₹40 L holding is the larger mover by
   * one measure and the smaller by the other. The order of the union type and
   * of the buttons below is the order they are OFFERED in, so both follow the
   * default rather than being set independently of it.
   */
  const [rank, setRank] = useState<"pct" | "impact">("pct");
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
     * THE ACTIVE SCOPE, and the axis is the ACCOUNT's engagement rather than the
     * security. `holdingBucket` reads it through `engagementOf`, which is the
     * one place this app decides who chose a holding; re-deriving it here would
     * be a second definition to drift — and it is the reason an ETF sitting
     * inside a PMS mandate is NOT in the ETF tab: the manager chose it, so it
     * belongs to the mandate exactly as a manager-picked share does.
     */
    const inScope = (p: typeof consolidated[number]) =>
      (SCOPE.buckets as readonly string[]).includes(holdingBucket(p, engagementOf(accts, p)));
    /**
     * CURRENT HOLDINGS, THROUGH THE ONE HELPER (MNT-6). This read `consolidated`
     * whole, so the scope counted the two sub-₹1,000 specks the family's floor
     * removes everywhere else — 37 direct-equity names here against the 35 the
     * Direct Equity drill-down lists, one click away. The funds branch of this
     * same card already read `currentHoldings`; the two branches now agree on
     * what the family holds.
     */
    const held = currentHoldings(consolidated);
    const scope = held.filter(inScope);
    /**
     * WHAT THE NARROWING LEAVES OUT, NAMED RATHER THAN DROPPED.
     *
     * Counted over the holdings that could otherwise have appeared here — the
     * ones carrying a live day change — because that is the list the reader is
     * looking at. A bucket with no priceable name in it never showed on this
     * card and does not need excusing.
     */
    const excluded = new Map<string, { mv: number; names: Set<string>; accounts: Set<string>; mandate: boolean }>();
    for (const p of held) {
      if (inScope(p)) continue;
      if (typeof p.dayChange !== "number" || !Number.isFinite(p.dayChange)) continue;
      const bucket = holdingBucket(p, engagementOf(accts, p));
      const key = bucketLabel(bucket);
      const e = excluded.get(key) ?? { mv: 0, names: new Set<string>(), accounts: new Set<string>(), mandate: bucket === MANDATE_BUCKET };
      e.mv += p.marketValue; e.names.add(p.securityKey); e.accounts.add(p.accountId);
      excluded.set(key, e);
    }
    /**
     * A COUNT AND ITS NOUN AGREE (MNT-17). The count is distinct SECURITIES, and
     * with the bucket label as its noun "131 PMS mandates" read as 131 mandates
     * where there are ten. Each entry is now "N holdings in K PMS mandates" or
     * "N ETF holdings" — the count first, the label inside the phrase it
     * qualifies.
     */
    const excludedRows = [...excluded.entries()]
      .map(([label, v]) => ({
        label, mv: v.mv, names: v.names.size, accounts: v.accounts.size,
        phrase: v.mandate
          ? `${v.names.size} holding${v.names.size === 1 ? "" : "s"} in ${v.accounts.size} ${label.replace(/s$/, "")}${v.accounts.size === 1 ? "" : "s"}`
          : `${v.names.size} ${label} holding${v.names.size === 1 ? "" : "s"}`,
      }))
      .sort((a, b) => b.mv - a.mv);

    const { rows, session, omitted, observedFrom, observedTo } = dailyMovers(scope, quoteFeed, corporateActionReturns, accts);
    const impactRows = rows.filter((r) => r.dayChange !== null && r.marketValue !== null);
    /**
     * THE NAMES RANKED BY % MOVE ALONE, AND WHY (Stage 10dc). The corporate-
     * action gate held their live VALUE back — a sale recorded after the
     * statement, a share event the capture cannot allocate — so their money
     * impact is unknown while the exchange's own % move is not. The card ranks
     * them by % and leaves them out of every rupee figure; the face says how
     * many, and the hover names them with the gate's own reason, because "share
     * counts await verification" is not a cause a reader can act on.
     */
    const priceOnly = rows.filter((r) => r.dayChange === null);
    const priceOnlyReasons = [...new Set(priceOnly.flatMap((r) => scope
      .filter((p) => p.securityKey === r.securityKey)
      .map((p) => liveWithheldReason(p, corporateActionReturns))
      .filter((x): x is string => !!x)))];
    /**
     * THE DATES OF THE QUANTITIES THE DAY'S PRICE MOVE IS MULTIPLIED BY (MNT-16).
     * A live price is today's; the number of shares it moves is what each
     * account's statement last reported, and on this book that runs from
     * 31 Mar (ICICI NSDL, LKP) to 31 Jul (the Motilal demats). The basis pill
     * that carried the staleness was removed from Morning CIO at the family's
     * request (Stage 10ao), so the span is stated on the tile it qualifies.
     */
    const qtyDates = [...new Set(scope
      .filter((p) => typeof p.dayChange === "number" && Number.isFinite(p.dayChange))
      .map((p) => accts.get(p.accountId)?.asOf)
      .filter((d): d is string => !!d))].sort();

    const movedValue = impactRows.reduce((a, r) => a + r.marketValue!, 0);
    const dayChange = impactRows.length ? impactRows.reduce((a, r) => a + r.dayChange!, 0) : null;
    const prevValue = movedValue - (dayChange ?? 0);
    const dayPct = prevValue > 0 && dayChange !== null ? (dayChange / prevValue) * 100 : null;

    // COVERAGE IS OVER THE SCOPE, NOT THE BOOK. "159 of 214 distinct names" was
    // true of the whole book and is a claim about a set this card no longer
    // shows; against the active scope the honest denominator is its own — 40
    // names for stocks and ETFs together, 37 for stocks alone.
    const cov = symbolCoverage(scope);
    const distinct = new Set(scope.map((p) => p.securityKey)).size;
    const scopeValue = scope.reduce((a, p) => a + p.marketValue, 0);
    // The symbols THIS CARD needs, so it can tell its own scope being complete
    // from the book being complete. The book is 161 symbols and fills over three
    // rounds; this scope is 33 and, named as `priority`, lands in one.
    //
    // …AND THE SHARES A DEPOSITORY REPORTS WITH NO PRICE (Stages 10cy and 10cz)
    // are in this scope only once the feed prices them: until then there is no
    // row to draw. Waiting on the rows alone would let the card rank the shares
    // that have landed and add the rest a round later, which is the "first shows
    // incomplete data" defect Stage 10an fixed, arriving through the one kind of
    // holding that is not a row until its price is in. So the card waits on
    // every candidate in its scope, which is exactly the set it asks for first
    // (`PRIORITY_SYMBOLS`). A symbol the feed cannot price is `missing`, never
    // pending, so this never waits for ever.
    const scopeSymbols = symbolsFor([...scope, ...shareCandidates().filter(inScope)]);

    const ranked = rank === "impact" ? impactRows : rows;
    const gainers = ranked.filter((r) => r.dayChangePct > 0);
    const losers = ranked.filter((r) => r.dayChangePct < 0);
    const flat = rows.length - gainers.length - losers.length;
    const cmp = rank === "impact"
      ? (a: Row, b: Row) => Math.abs(b.dayChange!) - Math.abs(a.dayChange!)
      : (a: Row, b: Row) => Math.abs(b.dayChangePct) - Math.abs(a.dayChangePct);
    return {
      rows, session, omitted, observedFrom, observedTo, impactNames: impactRows.length, dayChange, dayPct, movedValue, prevValue, scopeValue, excludedRows, scopeSymbols, qtyDates,
      priceOnlyNames: priceOnly.map((r) => r.security), priceOnlyReasons,
      pricedNames: rows.length, distinct, unpriceable: cov.withoutSymbol,
      gainers: [...gainers].sort(cmp),
      losers: [...losers].sort(cmp),
      gainCount: gainers.length, lossCount: losers.length, flat,
      gainSum: gainers.length && gainers.every((r) => r.dayChange !== null) ? gainers.reduce((a, r) => a + r.dayChange!, 0) : null,
      lossSum: losers.length && losers.every((r) => r.dayChange !== null) ? losers.reduce((a, r) => a + r.dayChange!, 0) : null,
      // How many of each side's names carry no money impact — the reason its
      // total is a dash rather than a sum (Stage 10dc).
      gainUnknown: gainers.filter((r) => r.dayChange === null).length,
      lossUnknown: losers.filter((r) => r.dayChange === null).length,
    };
  }, [portfolio, consolidated, rank, quoteFeed, corporateActionReturns]);

  useEffect(() => {
    if (model && model.impactNames === 0) setRank("pct");
  }, [model?.impactNames]);

  if (!portfolio || !model) return null;

  /**
   * ── THE CARD LANDS COMPLETE, OR IT SAYS IT IS STILL LANDING ────────────────
   *
   * *"this daily movers section take a lot of time to show data and sometimes
   * first shows incomplete data and then starts showing all the portfolio
   * movers… it should show all the data together rather than in bits and
   * pieces, so it does not confuses anyone using the dashboard."*
   *
   * That is a correctness complaint wearing a speed complaint's clothes. The
   * endpoint prices a bounded slice per request, so this card used to redraw on
   * every round — and EVERY FIGURE ON IT IS STRUCK OVER WHICHEVER NAMES HAD
   * ARRIVED. A top-gainers list over 3 of 33 names promotes a name that is not
   * the top and omits the one that is; the tile's own percentage divides a
   * partial rupee move by a partial previous close. Both are real arithmetic
   * over the wrong set — a wrong figure rather than a slow screen — and both
   * changed under the reader as the rounds landed.
   *
   * So the card holds until NOTHING IN ITS OWN SCOPE is pending, then renders
   * once. `pendingFor` is what makes that answerable: a symbol the feed
   * DEFERRED is answered in seconds, one it CANNOT PRICE never is, and the two
   * used to arrive as one list. Waiting on the second would hold this card for
   * the life of the tab.
   *
   * IT IS THE SCOPE'S OWN SYMBOLS, NEVER THE BOOK'S. Holding until all 161 land
   * would make a 33-name card wait on 128 names it does not show — the same fix
   * running the other way. Paired with `priority` in `PortfolioContext`, which
   * puts exactly these symbols in the first request, the wait is one round.
   *
   * AND A FAILED FEED IS NOT A SLOW ONE. When the feed is unavailable no answer
   * is coming, so the card stops waiting and renders what it has — which is the
   * absent state naming the feed, two branches below.
   */
  const scopePending = quotesStatus === "unavailable" ? [] : pendingFor(model.scopeSymbols);
  const settling = scopePending.length > 0;
  const landed = model.scopeSymbols.length - scopePending.length;

  const sessionLabel = model.session === istDate() ? "today" : model.session ? `session ${model.session}` : "latest available prices";
  const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const firstObserved = model.observedFrom ? time(model.observedFrom) : null;
  const lastObserved = model.observedTo ? time(model.observedTo) : null;
  const clock = firstObserved && lastObserved && firstObserved !== lastObserved
    ? `${firstObserved}–${lastObserved}` : firstObserved;

  return (
    /* THE SUBTITLE IS GONE AT THE FAMILY'S REQUEST, AND THE TITLE CARRIES THE
       SCOPE INSTEAD. What that sentence did that a reader still needs is name
       the SET — a card headed "Today's movers" over 33 of the book's 214 names
       is a claim about the book, and Stage 10L is three rounds of the family
       reporting exactly that kind of heading. So the scope moves into the
       heading, where it cannot be removed as chrome, and the quote timestamp
       moves to the tile that is actually as-of it. */
    <Card className="lg:col-span-3" title={`${model.session === istDate() ? "Today’s movers" : model.session ? "Latest session movers" : "Latest price movers"} · ${SCOPE.label}`}
      right={
        /* TWO CONTROLS, AND THEY ANSWER DIFFERENT QUESTIONS. The SCOPE toggle
           (owned by `DailyMovers`) switches which MEASUREMENT this card shows —
           a live intraday price here, a published NAV there, never summed. The
           RANKING reorders one list without changing which holdings are in it.
           The set itself is named in the heading above, so neither control has
           to carry it. */
        <div className="flex flex-wrap items-center justify-end gap-2">
        {scopeToggle}
        <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5" role="group" aria-label="Rank movers by">
          {/* `data-mover-rank` is the handle the sweep reads the OFFER and the
              ACTIVE choice off. Struck on the attribute rather than on the
              button labels, because "By % move" and "By ₹ impact" are exactly
              the prose a redesign is free to reword — the same contract
              `data-movers-scope` and `data-section` already carry. */}
          {(["pct", "impact"] as const).map((k) => (
            <button key={k} onClick={() => setRank(k)} disabled={k === "impact" && model.impactNames === 0} aria-pressed={rank === k} data-mover-rank={k}
              className={["rounded px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-40",
                rank === k ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
              {k === "impact" ? "By ₹ impact" : "By % move"}
            </button>
          ))}
        </div>
        </div>
      }>

      {/* Every name in scope carries a price and the feed is refreshing them.
          The figures below are complete and dated; this says only that a newer
          round is in flight. When the SCOPE ITSELF is incomplete the card draws
          no figures at all — see `settling` above. */}
      {quotesStatus === "loading" && !settling && model.rows.length > 0 && (
        <p className="mb-4 text-[11.5px] text-slate-500" data-movers-refreshing
          title="The figures below are the last complete round of prices; a newer round is in flight and replaces them when it settles.">Refreshing prices</p>
      )}
      {/* A FAILED ROUND OVER A CACHED SNAPSHOT (MNT-18). The session's last
          snapshot stays applied when a fetch fails, so these figures are real
          and dated — and a reader must be told they are not this minute's. */}
      {quotesStatus === "unavailable" && model.rows.length > 0 && (
        <p className="mb-4 text-[11.5px] text-amber-500/80" data-testid="movers-cached">
          The quote feed did not answer this round — showing saved prices{clock ? ` observed ${clock}` : ""}.
        </p>
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

        A failed feed names the service and offers a retry. Missing share
        verification with valid quotes still renders percentage rankings.

        With the snapshot cache behind it (`quoteCache.ts`) the first branch is
        reached only on a genuinely cold open: a reload inside the session
        renders the previous figures immediately and never passes through here.
      */}
      {settling || (model.rows.length === 0 && quotesStatus === "loading") ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600/70 px-6 py-10 text-center"
             data-testid="movers-loading" data-movers-landed={landed} data-movers-needed={model.scopeSymbols.length}>
          <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
          <div className="text-sm font-medium text-slate-300">Fetching prices…</div>
          {/* ONE LINE, THE COUNT — the reason the card waits is its hover. *"its
              obvious from the table what it is"*: a spinner that says how far
              along it is needs no paragraph under it. */}
          {model.scopeSymbols.length > 0 && (
            <p className="text-xs text-slate-500" data-movers-progress
              title="The day’s move needs a live price and the previous close behind it. Every figure on this card — the move, the ranking, the comparison against the index — is struck over the whole scope, so it is shown once the scope has landed in full rather than redrawn as each name arrives.">
              {landed} of {model.scopeSymbols.length} names have landed so far
            </p>
          )}
        </div>
      ) : model.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-600/70 px-6 py-8 text-center" data-testid="movers-unavailable" role="status">
          <p className="text-sm font-medium text-slate-300">Daily price changes are temporarily unavailable</p>
          <p className="mt-2 text-xs text-slate-500">
            {quotesStatus === "unavailable" ? "The quote service did not respond. Retrying automatically."
              : [...new Set(model.omitted.values())].join(" · ") || "Waiting for comparable market prices."}
          </p>
          <button className="mt-3 text-xs text-champagne-400 underline" onClick={refreshQuotes}>Retry prices</button>
        </div>
      ) : (
        <>
          {/* A STATUS ON THE FACE, THE SENTENCE IN THE HOVER (Stage 10dc). The
              line was a two-sentence paragraph on the card's face, which the
              family asked to be rid of on every page (Stage 10cp) and which
              that rule's own check fails on every route that serves quotes.
              What a reader must SEE is the count and that these names are
              ranked by % move alone; which names, and the gate's own reason
              for each, are the hover. */}
          {model.priceOnlyNames.length > 0 && (
            <p className="mb-3 text-xs text-amber-500/90" data-testid="movers-price-only"
              data-price-only={model.priceOnlyNames.length}
              title={`Share counts await verification for ${model.priceOnlyNames.length} name${model.priceOnlyNames.length === 1 ? "" : "s"} — ${model.priceOnlyNames.join(", ")}. Their exchange % moves are shown; their money impact is withheld and is in no rupee figure on this card.${rank === "impact" ? " This ranking includes only names with verified money impact." : ""}${model.priceOnlyReasons.length ? ` Why: ${model.priceOnlyReasons.map((x) => x.replace(/\.$/, "")).join(". ")}.` : ""}`}>
              {model.priceOnlyNames.length} name{model.priceOnlyNames.length === 1 ? "" : "s"} {rank === "impact" ? "left out" : "ranked by % move only"} · share count{model.priceOnlyNames.length === 1 ? "" : "s"} unverified
            </p>
          )}
          {/* ── The book's own move, and the four indices beside it ───────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
              <div className="label-xs">{SCOPE.label} &middot; {sessionLabel}</div>
              <div className={`mt-2 font-display text-[22px] font-bold tabular ${changeColor(model.dayChange)}`}>
                {fmtFromBase(model.dayChange, { compact: true, sign: true })}
              </div>
              {model.dayChange === null && <p className="mt-1 text-xs text-slate-500">Money impact awaits verified share counts</p>}
              <div className={`mt-0.5 text-[13px] font-semibold tabular ${changeColor(model.dayPct)}`}>
                {model.dayPct == null ? DASH : fmtPct(model.dayPct, { sign: true })}
              </div>
              {/* THE COVERAGE IS ON THE TILE, NOT IN A TOOLTIP. This percentage is
                  struck over the priced subset and a reader will compare it with
                  an index; the scope has to be visible at the same glance. */}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500" data-testid="movers-coverage"
                title={`${model.impactNames > 0
                  ? `The move is struck on ${fmtFromBase(model.movedValue, { compact: true })} of the ${fmtFromBase(model.scopeValue, { compact: true })} held, across ${model.impactNames} of ${model.distinct} ${SCOPE.noun} names — the rest lack a quote or a verified share count and are excluded from the money total.`
                  : `No money move is struck: none of the ${model.distinct} ${SCOPE.noun} names has both a live quote and a verified share count, so the ${fmtFromBase(model.scopeValue, { compact: true })} held carries no rupee figure here.`}${model.priceOnlyNames.length ? ` By % move the gainers and losers rank ${model.pricedNames} names, the ${model.priceOnlyNames.length} whose share count is unverified included.` : ""}${model.qtyDates.length ? ` The share counts are as of ${model.qtyDates.length === 1 ? model.qtyDates[0] : `${model.qtyDates[0]} to ${model.qtyDates[model.qtyDates.length - 1]}`}, the date of the statement that printed each.` : ""}${clock ? ` Quotes as of ${clock}.` : ""}`}>
                {/* THE VALUE THIS PERCENTAGE COVERS, BESIDE THE VALUE IT DOES
                    NOT. A name count alone hides how much of a scope a figure
                    stands on: the mutual-fund tab prices ONE of 20 schemes and
                    that one is worth ₹18,822 of ₹99.9 Cr, so "1 of 20" and
                    "₹18,822 of ₹99.9 Cr" are very different disclosures of the
                    same fact — and the second is the one a reader needs beside
                    a percentage printed at 22px. `scopeValue` was already
                    computed for this and rendered nowhere, which is this book's
                    most-repeated defect. */}
                {/* THE FACE IS THE TWO FIGURES; WHY THE REST ARE NOT COUNTED IS
                    THE HOVER — the family asked for the lines that explain the
                    card to go, and a count is not an explanation. The share
                    counts' own date rides in the hover beside it (MNT-15): a
                    day's move is today's price on a quantity a statement
                    printed, and that statement has a date. */}
                {/* FIGURES ONLY (Stage 10dc). #104 lengthened this into "N of M
                    names with price changes · … · K of M names with verified
                    impact", a sentence by Stage 10cp's own measure. The % move
                    ranks P names and the money total covers K; the line above
                    names the difference, and the hover says it in words. */}
                {/* AND NO RUPEE FIGURE OVER AN EMPTY SET. With every name's share
                    count unverified — the evidence still loading, or a reload
                    from a saved snapshot — the money total covers nothing, and
                    "₹0 of ₹64.8 Cr held" read as a measured zero. The count
                    stays; the value clause is drawn only over names it covers. */}
                {model.impactNames > 0 && <>{fmtFromBase(model.movedValue, { compact: true })} of {fmtFromBase(model.scopeValue, { compact: true })} held · </>}
                {model.impactNames} of {model.distinct} names{clock ? ` · quotes ${clock}` : ""}
              </p>
            </div>

            <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4 sm:col-span-1 lg:col-span-2">
              {/* THE SESSION THE LEVELS ARE FROM (MNT-19): "today" only where it is. */}
              <div className="label-xs" data-testid="movers-index-session">
                NSE indices · {(() => { const sess = indexSession(indices); return sess.today || !sess.date ? "today" : `session ${sess.date}`; })()}
              </div>
              {!indices && indexState === "loading" ? (
                <p className="mt-2 text-[11.5px] text-slate-500">Fetching index levels…</p>
              ) : !indices ? (
                <p className="mt-2 text-[11.5px] text-slate-500" title="Nothing has been substituted for a level.">
                  Index levels unavailable — the feed did not respond
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
              {indices && model.dayPct != null && indexSession(indices).date === model.session && (() => {
                const n500 = indices.indices.find((x) => x.id === "nifty-500");
                if (!n500 || n500.changePct == null || n500.sessionDate !== model.session) return null;
                const gap = model.dayPct - n500.changePct;
                return (
                  /* "THE PRICED BOOK" WAS TRUE AND IS NOT ANY MORE. This figure
                     is struck over the ACTIVE SCOPE, and a sentence that called
                     it the book would be the caption-that-widens failure the
                     Capital invested tile already cost this page once — so the
                     subject is the scope's own, and it moves with the tab. */
                  <p className="mt-3 border-t border-ink-700 pt-2 text-[11.5px] text-slate-400" data-testid="movers-vs-index"
                    title={`Struck on ${fmtFromBase(model.movedValue, { compact: true })} of the ${fmtFromBase(portfolio.totalValue, { compact: true })} book. Both are one session, and neither is a return over any longer window. The gap is the difference between two percentages, so it is in percentage points rather than a percentage of anything.`}>
                    {/* A GAP BETWEEN TWO PERCENTAGES IS IN POINTS (MNT-20), not a
                        percentage of anything — "+11.00%" read as a return. */}
                    {SCOPE.subject} {SCOPE.verb} <strong className={changeColor(gap)}>{`${gap > 0 ? "+" : gap < 0 ? "−" : ""}${fmtNum(Math.abs(gap), 2)} pts`}</strong> against the
                    Nifty 500 · {sessionLabel}
                  </p>
                );
              })()}
            </div>
          </div>

          {/* ── Gainers and losers ────────────────────────────────────────── */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* A COUNT AND ITS NOUN AGREE. "1 GAINERS" was on the family's own
                screenshot of this card, and a scope tab makes a one-name list an
                ordinary outcome rather than a rarity. */}
            <MoverList title={`${model.gainCount} gainer${model.gainCount === 1 ? "" : "s"}`} tone="gain" rows={model.gainers}
              total={model.gainSum} count={model.gainCount} unknown={model.gainUnknown} fmt={fmtFromBase} rank={rank} noun={SCOPE.noun} />
            <MoverList title={`${model.lossCount} loser${model.lossCount === 1 ? "" : "s"}`} tone="loss" rows={model.losers}
              total={model.lossSum} count={model.lossCount} unknown={model.lossUnknown} fmt={fmtFromBase} rank={rank} noun={SCOPE.noun} />
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
            <p className="mt-3 text-[11px] text-slate-500" data-testid="movers-excluded"
              title={`${SCOPE.subject} only — these also moved today and are in none of the figures above.`}>
              Not counted:{" "}
              {model.excludedRows.map((e, i) => (
                <span key={e.label}>
                  {i > 0 ? " · " : ""}{e.phrase} {fmtFromBase(e.mv, { compact: true })}
                </span>
              ))}.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function MoverList({ title, tone, rows, total, count, unknown, fmt, rank, noun }: {
  title: string; tone: "gain" | "loss"; rows: Row[]; total: number | null;
  /** How many names move this way in all, and how many of them carry no money impact. */
  count: number; unknown: number;
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
        {/* …AND A LIST WITH A NAME WHOSE MONEY IMPACT IS UNKNOWN HAS NO TOTAL
            EITHER (Stage 10dc). Ranked by % move, the list includes the names
            whose share count awaits verification; summing the rest would print a
            figure over part of the list under a heading counting all of it. So
            the total is a dash, and its hover says which names it is missing. */}
        {rows.length === 0
          ? <Pill><span title="No priced holding moved this way today, so there is no total to sum.">{DASH}</span></Pill>
          : total === null
            ? <Pill tone={tone}><span data-mover-total-absent={unknown}
                title={`No total: ${unknown} of these ${count} name${count === 1 ? "" : "s"} ${unknown === 1 ? "has" : "have"} an unverified share count, so ${unknown === 1 ? "its" : "their"} money impact is unknown and is not summed as zero.`}>{DASH}</span></Pill>
            : <Pill tone={tone}>{fmt(total, { compact: true, sign: true })}</Pill>}
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-[11.5px] text-slate-500"
          title="A measurement over the names the feed prices, not a statement about the whole book.">
          No priced {noun} holding moved this way today
        </p>
      ) : (
        <table className="mt-3 w-full text-[12px]">
          <tbody className="divide-y divide-ink-700">
            {rows.map((r) => (
              /* `data-mover-row` is the handle the sweep counts a RANKING by. A
                 partial list is well-formed prose, so "the card is not ranking
                 yet" can only be struck on structure. */
              <tr key={r.securityKey} data-mover-row={r.securityKey}>
                <td className="py-1.5 pr-2">
                  <Link to={`/stock/${encodeURIComponent(r.securityKey)}`}
                    className="text-slate-300 transition-colors hover:text-champagne-400"
                    title={r.entities.length ? `Held by ${r.entities.join(", ")}` : undefined}>
                    {r.security}
                  </Link>
                </td>
                {/* `data-mover-cell` names each figure, so the sweep can hold a
                    row's money cell to the book: a name ranked by % alone must
                    show a dash whose hover says why, never a ₹0 (Stage 10dc). */}
                <td data-mover-cell="pct" className={`py-1.5 pr-3 text-right tabular ${rank === "pct" ? "font-semibold" : ""} ${changeColor(r.dayChangePct)}`}>
                  {fmtPct(r.dayChangePct, { sign: true })}
                </td>
                <td data-mover-cell="impact" title={r.dayChange === null ? "Share count needs verification; the percentage is the exchange price move." : undefined} className={`py-1.5 text-right tabular ${rank === "impact" ? "font-semibold" : ""} ${changeColor(r.dayChange)}`}>
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
