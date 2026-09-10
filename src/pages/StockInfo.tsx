import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Wallet, Layers, TrendingUp, Coins, Activity, Building2 } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  sum, sumOrNull, consolidatedMarketValue, dedupedPositions, isFundVehicle, isCompanyShare, assetClassLabel,
  holdingRoute, ROUTE_LABEL, ROUTE_NOTE,
  holdingBucket, bucketLabel, isMandateHeld, mandateLabel,
  MANDATE_BUCKET, DIRECT_EQUITY_BUCKET, UNROUTED_EQUITY_BUCKET,
} from "@/lib/analytics";
import { fmtCurrency, fmtNum, fmtPct, fmtDate, changeColor, DASH } from "@/lib/format";
import { AbsentValue, AbsentCell } from "@/components/Absent";

import { loadStockLedger, type StockLedger } from "@/lib/ledger";
import { symbolFor } from "@/lib/quotes";
import { accountIndex, ownerOf, providerOf, strategyOf, engagementOf } from "@/lib/accounts";
import { ResearchPanel } from "@/components/ResearchPanel";
import { FundLookthrough } from "@/components/FundLookthrough";
import { canHaveLookthrough } from "@/lib/lookthrough";
import { ReturnsTable } from "@/components/ReturnsTable";
import { RatioTable } from "@/components/RatioTable";
import { InvestmentTools } from "@/components/InvestmentTools";
import { CompanyResearchPreview } from "@/components/CompanyResearchPreview";

// Per-stock drill-down: how one security is held across the family's entities, its
// tax basis, every dated buy/sell from the ledger, and — from the muns research
// endpoints — street estimates, screener financial tables and concall documents.
export function StockInfo() {
  // Keyed by securityKey — this book's providers mostly print a name and nothing
  // else, so an ISIN route would leave most holdings unreachable.
  const { securityKey = "" } = useParams();
  const { portfolio, fmtFromBase, convertFromBase, displayCurrency, quotesStatus } = usePortfolio();
  const [led, setLed] = useState<StockLedger | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setLed(undefined);
    loadStockLedger(securityKey).then((r) => { if (alive) setLed(r); });
    return () => { alive = false; };
  }, [securityKey]);

  const rows = useMemo(() => (portfolio ? portfolio.positions.filter((p) => p.securityKey === securityKey) : []), [portfolio, securityKey]);
  // COUNT ONCE. Two of this book's securities are reported under two members
  // (360 ONE Special Opp under both CRNs, Transition Fund I under both trusts);
  // both share this securityKey, so summing the raw rows doubled this name's
  // value, quantity, cost and P&L. `dedupedPositions` collapses only the
  // dedupeGroup rows — a name held by several different accounts still sums all.
  const drows = useMemo(() => dedupedPositions(rows), [rows]);
  // Denominator for this security's weight — the whole consolidated book (each
  // dedupeGroup once). This is "% of book", not "% of listed book": the stock
  // page shows any holding, AIF units included, and those are not listed.
  const bookMV = useMemo(() => (portfolio ? consolidatedMarketValue(portfolio.positions) : 0), [portfolio]);
  const accIdx = useMemo(() => accountIndex(portfolio?.accounts ?? []), [portfolio]);
  if (!portfolio) return null;

  const name = rows[0]?.security ?? led?.name ?? securityKey;
  /**
   * A FUND UNIT IS NOT A COMPANY, AND THIS PAGE MUST NOT RESEARCH IT AS ONE.
   *
   * The route is `/stock/:securityKey` and it serves every holding, which is
   * right — an AIF folio's quantity, cost, entities and dated ledger all belong
   * on a page of their own. What does not belong is the five company panels
   * underneath: a returns table, a ratio table, screener's financials, concalls
   * and insider trades, each rendering its own "nothing came back" state for a
   * holding that HAS no company behind it. Five dashed boxes under a fund's name
   * read as five failed feeds, which is the "a card that can never be filled
   * must not look like one that is waiting" rule, five times over.
   *
   * This is a PERMANENT, DECIDED absence, stated once, and it is decided by the
   * asset class rather than by the ticker being null: a company whose NSE symbol
   * this book could not resolve is a resolver shortfall and keeps its panels,
   * because a future `build-symbols` fills them. A fund never will.
   *
   * CASH IS IN THE SAME SET AND `Unlisted` IS NOT. A cash line and a liquid
   * sweep have no company behind them either. An unlisted COMPANY does — it is
   * a company whose figures nobody publishes, which is a data gap the panels
   * are right to report as one, so it keeps them.
   */
  const assetClass = rows[0]?.assetClass ?? null;
  /**
   * HOW THIS NAME IS HELD, not just what it is.
   *
   * The family opened this page on Jammu Kashmir Bank, read the asset class as
   * "direct equity", and saw two lines below that Carnelian manages it. The
   * page was contradicting itself: the shares are equity — that part was never
   * wrong — but nothing said the family did not choose them.
   *
   * One name can be held both ways at once (Onesource sits in a mandate and in
   * a demat), so the routes are collected across the rows and the chip states
   * every one of them rather than the first.
   */
  const routes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      const k = holdingRoute(engagementOf(accIdx, r) || null);
      seen.set(k, (seen.get(k) ?? 0) + r.marketValue);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, accIdx]);
  /**
   * WHERE THE HOLDINGS TABLES FILE THIS NAME — the same key they group on.
   *
   * The chip beside the security name used to read `assetClassLabel(assetClass)`,
   * and for a share a discretionary manager picked that is the falsehood the
   * family reported twice: a page headed "Jammu Kashmir Bank", chipped with the
   * word the holdings table reserves for shares the family chose itself, saying
   * two lines lower that Carnelian manages it. The asset class was never wrong —
   * these ARE company shares, they keep their GICS sector and their concall and
   * every exposure surface still counts them (`isCompanyShare`). What the chip
   * was doing was answering a question it had not been asked.
   *
   * `holdingBucket` is the ONE place that decides the grouping, so this chip and
   * the Portfolio Monitor's section headings cannot drift apart — a bucket
   * re-derived per screen is a bucket that disagrees with itself.
   *
   * One name can in principle be held both ways at once (none is in this drop),
   * so the buckets are collected ACROSS the rows and every one is chipped rather
   * than the first row's speaking for all of them.
   */
  const buckets = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      const k = holdingBucket(r, engagementOf(accIdx, r) || null);
      seen.set(k, (seen.get(k) ?? 0) + r.marketValue);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, accIdx]);
  /**
   * THE MANDATES THIS NAME SITS INSIDE, for the line above the fold and the
   * link on each row.
   *
   * A reader who lands on a company page from a search has no way to discover
   * that the position is one of thirty-odd a manager runs on the family's
   * behalf, and no way to reach the other twenty-nine — which is precisely what
   * the family asked for. The account IS the mandate (`/mandate/:accountId`):
   * two managers here run one strategy for two members, so each has its own
   * as-of, its own statement total and its own page.
   */
  const mandates = useMemo(() => rows
    .filter((r) => isMandateHeld(engagementOf(accIdx, r) || null))
    .map((r) => ({
      accountId: r.accountId,
      // Strategy where the manager prints one, else the provider — one helper,
      // so this link is labelled exactly as the mandate page titles itself.
      label: mandateLabel(accIdx.get(r.accountId)),
      provider: providerOf(accIdx, r),
      owner: ownerOf(accIdx, r),
      mv: r.marketValue,
    }))
    .sort((a, b) => b.mv - a.mv), [rows, accIdx]);
  /**
   * WHAT THE MANDATE ROWS ACTUALLY ARE — because the line above the fold and the
   * mandate chip's tooltip each name a NOUN, and a typed noun is a claim.
   *
   * `holdingBucket` puts a mandate's WHOLE account in the mandate bucket, cash
   * sleeve included, and that is deliberate: the mandate is worth what its own
   * statement says it is worth. So 18 of this book's mandate-held rows are not
   * shares at all — ₹9.51 Cr of `Cash` across the ten mandates, plus Cash
   * Rec/Payable, a liquid sweep and a TDS receivable — and the mandate page
   * links every one of them to `/stock/<securityKey>`. Arriving here from that
   * link, a hardcoded "the family owns these shares" describes a ₹9.51 Cr
   * balance as shares, on the same screen whose research card says in as many
   * words that this holding is a balance and not a share in a company. Two
   * contradictory claims about one figure, and the false one is the specific
   * one a reader believes.
   *
   * So the noun is DERIVED from the rows the sentence actually covers — the
   * mandate-held subset, not the page's first row and not its asset class,
   * because one name could in principle be a share in one account and something
   * else in another and the sentence speaks only for the mandates.
   */
  const mandateRows = useMemo(
    () => rows.filter((r) => isMandateHeld(engagementOf(accIdx, r) || null)),
    [rows, accIdx]);
  const mandateAllShares = mandateRows.length > 0 && mandateRows.every(isCompanyShare);
  const mandateNoShares = mandateRows.length > 0 && !mandateRows.some(isCompanyShare);
  /** Where none of them is a share and they are all ONE class, the sentence can
   *  name that class instead of reaching for a generic noun. Mixed classes fall
   *  back to the neutral wording rather than picking one to speak for the rest. */
  const mandateClass = mandateNoShares && new Set(mandateRows.map((r) => r.assetClass)).size === 1
    ? assetClassLabel(mandateRows[0].assetClass)
    : null;
  /** The mandate bucket's tooltip, on the same derivation and for the same
   *  reason: "Company shares, held under a discretionary mandate" is true of
   *  Jammu & Kashmir Bank and false of the cash sleeve sitting in the same
   *  bucket by design. */
  const mandateBucketTip = mandateAllShares
    ? "Company shares, held under a discretionary mandate. The holdings tables file them under the manager who chose them, not with the shares the family bought itself."
    : mandateNoShares
      ? `${mandateClass ?? "Not a company share"} — held inside a discretionary mandate. The holdings tables file a mandate's WHOLE account under its manager, the balances beside the shares included, so the mandate's total ties to the statement it came from. That is why this sits under ${MANDATE_BUCKET} rather than under its own class.`
      : `Held inside a discretionary mandate. The holdings tables file a mandate's whole account under its manager — the shares it holds and the balances beside them — rather than splitting one statement across classes.`;
  /** What one unit of this holding IS, for the Quantity tile's caption. */
  const qtyNoun = assetClass === "Cash" ? "balance"
    : assetClass === "Equity" || assetClass === "Unlisted" ? "shares held"
    : assetClass ? "units held"
    : "held";
  const notACompany = rows.length > 0 && rows.every((r) => isFundVehicle(r) || r.assetClass === "Cash");
  const fundVehicle = rows.length > 0 && rows.every(isFundVehicle);
  const NOT_A_COMPANY_LABEL: Record<string, string> = {
    "Mutual Fund": "a mutual fund", ETF: "an ETF", AIF: "an AIF folio", Cash: "a cash line",
  };
  const sector = rows[0]?.sector;
  const providerSector = rows[0]?.providerSector;
  const isin = rows[0]?.isin;
  /**
   * NULL, NOT ZERO. This read `?? 0` and printed a 2xl "₹0" as the CMP headline
   * of every holding its statement marks at a TOTAL VALUE rather than a per-unit
   * price — 360 ONE's AIF units among them, whose page therefore led with a zero
   * price above a ₹1.47 Cr holding value. `price()` renders null as an em dash,
   * so the default was the whole of the bug: a figure produced by a default is
   * the exact failure this book exists to prevent, and the caption underneath
   * already says which mark the number came from.
   */
  const cmp = rows[0]?.currentPrice ?? null;
  const qty = sum(drows.map((r) => r.quantity));
  const cost = sumOrNull(drows.map((r) => r.costBasis));
  const mv = sum(drows.map((r) => r.marketValue));
  const pnl = sumOrNull(drows.map((r) => r.unrealizedPnL));
  // Both stay NULL when no statement reported a cost for this name, so the
  // tiles render `—`. A zero average cost reads as shares acquired for nothing
  // and a zero return as break-even; neither was measured.
  const avgCost = cost !== null && qty > 0 ? cost / qty : null;
  const ret = cost !== null && pnl !== null && cost > 0 ? (pnl / cost) * 100 : null;
  /**
   * WHY THERE IS NO COST — the question the reader actually opened this page with.
   *
   * `costBasis` is null on 60 of this book's 371 positions and every one of them
   * is genuinely absent at source: measured across the whole audit archive, NOT
   * ONE of those (account, security) pairs carries a cost on any record type —
   * a depository reports what shares are worth, never what they were bought for.
   * So the dash is right and the page was still wrong, because it said nothing:
   * Avg cost printed "invested —", which is a SECOND DASH rather than a reason,
   * and Unrealised P&L printed "on cost" over a holding that has no cost, which
   * describes a basis the figure does not have.
   *
   * Two tiles on the same strip already do this properly ("no capital gain
   * statement covers this name", "no live quote"), and the difference is the
   * whole of `Absent.tsx`'s rule: a reason is a REQUIRED argument, because "no
   * data" tells a reader nothing about whether to go and find something. A
   * reader who cannot tell "the custodian does not send this" from "the
   * dashboard is broken" will assume the second.
   *
   * The custodian is NAMED rather than described, and the claim is scoped to
   * THIS holding — `providerOf` reads the account registry, so nothing here
   * infers a custodian from a security name (§2), and the sentence stays true
   * for an account that reports cost on its other rows but not this one.
   */
  const costWhy = (() => {
    const who = [...new Set(drows.map((r) => providerOf(accIdx, r)).filter(Boolean))];
    if (who.length === 1) return `no cost on the ${who[0]} statement for this holding`;
    if (who.length > 1) return "no statement for this holding reports a cost";
    return "no statement in this book reports a cost for this holding";
  })();
  const weight = bookMV > 0 ? (mv / bookMV) * 100 : 0;
  // Null, not zero, when no statement supplied the figure — see sumOrNull.
  const stCost = sumOrNull(drows.map((r) => r.stCostBasis));
  const ltCost = sumOrNull(drows.map((r) => r.ltCostBasis));
  const div = sumOrNull(drows.map((r) => r.dividendReceived));
  // Live-quote state for this name. Every lot shares one quote, so this is
  // all-or-nothing in practice; the day move is summed across the lots.
  const sym = rows[0] ? symbolFor(rows[0]) : null;
  const live = drows.length > 0 && drows.every((r) => r.live);
  const dayPct = live ? rows[0]?.dayChangePct ?? null : null;
  const dayChange = sum(drows.map((r) => r.dayChange ?? 0));
  /**
   * PER-OWNER, SO THE RAW ROWS. This counted `drows` and reported "Held in 1
   * entity" for 360 ONE Special Opportunities — a holding reported on Ajay's
   * CRN37702 and Bharat's CRN60117, whose own "Position by account" table two
   * cards below listed both of them. The pill and the table contradicted each
   * other on one screen.
   *
   * It is the §"consolidated counts once, per-account does not" rule: the
   * CONSOLIDATED value below is right to dedupe, and a count of the entities
   * that report this name is not a consolidated figure — it is the answer to
   * "whose statements is this on", and the answer is two.
   */
  const held = new Set(rows.map((r) => r.accountId)).size;
  const exited = held === 0;
  /**
   * What the account rows carry that the (consolidated) footer beneath them does
   * not. Non-zero only where this name is reported under more than one member,
   * and named under the table so a reader who adds the rows and gets a bigger
   * number than the Total can see why. Derived from the two sets, never typed.
   */
  const dupCollapsed = sum(rows.map((r) => r.marketValue)) - sum(drows.map((r) => r.marketValue));

  const price = (n: number | null | undefined) =>
    (typeof n === "number" && Number.isFinite(n) ? fmtCurrency(convertFromBase(n), displayCurrency) : "—");
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const buys = (led?.txns ?? []).filter((t) => t.side === "Buy");
  const firstBought = buys.length ? buys[buys.length - 1].date : null;
  const lastAdded = buys.length ? buys[0].date : null;
  // Null when the long-term cost is unknown — the bar is hidden rather than
  // drawn at zero, which would read as "none of this is long-term".
  const ltPct = ltCost !== null && cost !== null && cost > 0 ? (ltCost / cost) * 100 : null;

  return (
    <div>
      <div className="mb-2 text-[12px] text-slate-500">
        <Link to="/monitor" className="text-champagne-400 hover:underline">Portfolio Monitor</Link>
        <span className="mx-1.5">›</span>Stock Info
      </div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/monitor" className="mb-1 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-300">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to holdings
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* WHERE THIS HOLDING IS FILED, which for everything that is not a
                mandate-held share is still exactly its asset class — a fund's
                chip reads AIF, a cash line's reads Cash, and only a share a
                manager chose now reads the mandate bucket instead of a word
                that claims the family picked it. `bucketLabel` and the monitor's
                section headings come from the same function on purpose.

                A fund's `sector` is "Unclassified" in the model — true, and
                misleading on screen, since it reads as a sector nobody got round
                to assigning rather than a property the thing does not have. That
                is stated separately below. */}
            {buckets.map(([k]) => (
              <Pill key={k} tone={k === MANDATE_BUCKET || k === DIRECT_EQUITY_BUCKET || k === UNROUTED_EQUITY_BUCKET ? "info" : "core"}>
                <span title={k === MANDATE_BUCKET
                  ? mandateBucketTip
                  : `How the holdings tables group this holding — ${bucketLabel(k)}.`}>{bucketLabel(k)}</span>
              </Pill>
            ))}
            {/* The bucket above says WHERE THE BOOK FILES IT; this says HOW IT
                CAME TO BE HELD. They coincide for a mandate — which is the whole
                point of the regrouping — and they do not for anything else: an
                AIF folio buckets as AIF and is routed as a fund vehicle, and a
                cash sleeve inside a mandate buckets with the mandate while its
                own route is the mandate too. Kept because the route is stated
                per row in the table below and a chip a reader can compare it
                against is how the two are checked against each other. */}
            {routes.map(([k]) => (
              <Pill key={k} tone="core">
                <span title={ROUTE_NOTE[k as keyof typeof ROUTE_NOTE]}>via {ROUTE_LABEL[k as keyof typeof ROUTE_LABEL]}</span>
              </Pill>
            ))}
            {sector && !fundVehicle && <Pill tone="info">{sector}</Pill>}
            {fundVehicle && (
              <span className="text-[11px] text-slate-600" title="A GICS sector is a property of a company. This holding is a wrapper over many of them and no statement here prints a sector for it.">
                no sector — a fund holds many
              </span>
            )}
            {/* The provider's own sector label, kept alongside ours — the
                taxonomies differ per platform and neither is authoritative. */}
            {providerSector && providerSector !== sector && (
              <Pill><span title="Sector exactly as the provider printed it">{providerSector}</span></Pill>
            )}
            {isin
              ? <span className="mono text-[11px] text-slate-500">{isin}</span>
              : <span className="text-[11px] text-slate-600" title="This provider reports no ISIN for this holding.">no ISIN reported</span>}
            {sym && <span className="mono text-[11px] text-slate-500">{sym}</span>}
            <Pill>{exited ? "Position closed" : `Held in ${held} ${held === 1 ? "entity" : "entities"}`}</Pill>
          </div>
        </div>
        {!exited && (
          <div className="text-right">
            <div className="mono text-2xl font-semibold text-slate-100">{price(cmp)}</div>
            {/* WHY THIS IS THREE STATES AND NOT TWO.
                It read `live ? "live" : "no live quote for this security"`, so
                every not-live case asserted the same thing — including the one
                where the fetch had simply not come back yet. On a page still
                loading, the top bar said "Fetching prices…" while this line said
                the security has no live quote: two contradictory claims on one
                screen, and the wrong one is the specific one a reader believes.
                That is the "your session expired" failure again — a message must
                diagnose the ACTUAL failure.

                The states are genuinely different facts, and `PortfolioContext`
                already separates them: a name with no NSE symbol can NEVER go
                live and no token would change it, while a symbol whose quote did
                not arrive is a feed shortfall that may resolve on a refresh. */}
            <div className="mt-0.5 text-[10.5px] text-slate-500">
              {live
                ? `CMP \u00b7 live${sym ? ` \u00b7 ${sym}` : ""}`
                : (() => {
                    const mark = `CMP \u00b7 statement mark${rows[0] ? `, ${accIdx.get(rows[0].accountId)?.asOf ?? portfolio.asOf}` : ""}`;
                    if (quotesStatus === "loading") return `${mark} — fetching the live price\u2026`;
                    if (!sym) return `${mark} — no NSE symbol resolves for this name, so it cannot be priced live`;
                    if (quotesStatus === "unavailable") return `${mark} — the price feed did not respond`;
                    return `${mark} — the price feed returned no quote for ${sym}`;
                  })()}
            </div>
          </div>
        )}
      </div>

      {/* ABOVE THE FOLD, NOT SIX CARDS DOWN.
          The "Held via" column three cards below has always carried this, and
          the family read the page top-to-bottom and formed their belief from the
          chip before they ever reached it. A fact that contradicts what a reader
          has already concluded has to arrive before the conclusion does. It
          names the mandate and links to it, because "a manager chose this" with
          no way to see WHAT ELSE that manager chose is half an answer. */}
      {mandates.length > 0 && (
        <p className="mb-4 text-[12.5px] leading-relaxed text-slate-400">
          <span className="font-medium text-slate-300">Held through {mandates.length === 1 ? "a discretionary mandate" : `${mandates.length} discretionary mandates`}</span>
          {/* THE NOUN IS DERIVED, NOT TYPED — see `mandateAllShares` above. This
              sentence renders for every mandate-held row, and a mandate's bucket
              takes its whole account, so "these shares" was printed over the
              cash sleeve, the liquid sweep and a TDS receivable as well as over
              Jammu & Kashmir Bank. A mixed set gets the neutral wording rather
              than one of its classes speaking for the rest. */}
          {mandateAllShares
            ? " — the family owns these shares and the manager decides them: "
            : mandateNoShares && mandateClass
              ? ` — this is ${mandateClass} the mandate ${mandates.length === 1 ? "account holds" : "accounts hold"}, not a share the manager chose: `
              : " — the family owns these holdings and the manager runs the accounts they sit in: "}
          {mandates.map((m, i) => (
            <span key={m.accountId}>
              {i > 0 && ", "}
              <Link to={`/mandate/${encodeURIComponent(m.accountId)}`} className="text-champagne-400 hover:underline" title="Open the mandate — every holding the manager runs inside it, and the statement it ties to">{m.label}</Link>
              <span className="text-slate-500">{m.label === m.provider ? "" : ` · ${m.provider}`} · {m.owner}</span>
            </span>
          ))}
          {". Every other holding in "}{mandates.length === 1 ? "that mandate" : "those mandates"}{" is on "}
          {mandates.length === 1 ? "its" : "their"}{" own page."}
        </p>
      )}

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Holding value" value={fmtFromBase(mv, { compact: true })} sub={`${weight.toFixed(1)}% of book`} icon={<Wallet className="h-4 w-4" />} />
        {/* THE SAME TYPED NOUN, ONE TILE OVER. `/stock/:securityKey` serves every
            holding, so "shares held" was printed under the quantity of an AIF
            folio's units and under a mandate's cash balance. It comes off the
            asset class the row carries, and an unstated class gets the noun that
            claims nothing. */}
        <Kpi label="Quantity" value={fmtNum(qty)} sub={qtyNoun} icon={<Layers className="h-4 w-4" />} />
        {/* Both of these say WHY when they are absent — see `costWhy`. The dash
            is correct on 60 of this book's positions and it is not the whole
            answer: "invested —" and "on cost" told a reader nothing about
            whether the figure was missing or the page was broken. */}
        <Kpi label="Avg cost"
          value={avgCost === null ? <AbsentValue /> : <span className="mono">{price(avgCost)}</span>}
          sub={cost === null ? <span className="text-slate-500">{costWhy}</span> : `invested ${money(cost)}`}
          icon={<Coins className="h-4 w-4" />} />
        <Kpi label="Unrealised P&L"
          value={pnl === null ? <AbsentValue /> : <span className={changeColor(pnl)}>{fmtFromBase(pnl, { compact: true, sign: true })}</span>}
          delta={ret}
          sub={pnl === null ? <span className="text-slate-500">{costWhy}</span> : "on cost"}
          icon={<TrendingUp className="h-4 w-4" />} />
        {/* Realised P&L exists only where a capital gain statement covers this
            name's sells. Null is not zero: the sells may be real and what they
            realised simply never reported. */}
        <Kpi label="Realised P&L"
          value={led === undefined ? "…" : led?.realizedProfit == null
            ? <AbsentValue />
            : <span className={changeColor(led.realizedProfit)}>{fmtFromBase(led.realizedProfit, { compact: true, sign: true })}</span>}
          sub={led === undefined ? "booked on exits" : led?.realizedProfit == null
            ? <span className="text-slate-500">no capital gain statement covers this name</span>
            : "booked on exits"}
          icon={<Activity className="h-4 w-4" />} />
        <Kpi label="Change today"
          value={dayPct == null ? <span className="text-slate-500">—</span> : <span className={changeColor(dayPct)}>{fmtPct(dayPct, { sign: true })}</span>}
          sub={dayPct == null ? "no live quote" : `${fmtFromBase(dayChange, { compact: true, sign: true })} on the position`}
          icon={<Building2 className="h-4 w-4" />} />
      </div>

      {exited ? (
        <Card className="mt-5" title="Position" subtitle="This name is fully exited — no current holding.">
          <p className="text-sm text-slate-400">Realised P&amp;L and the full transaction history are below.</p>
        </Card>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Position by account" subtitle="How this name is held — the owning entity, who chose the position, and the platform that runs the account" pad={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full whitespace-nowrap text-sm">
                <thead className="border-b border-ink-700">
                  <tr>
                    <th className="label-xs px-4 py-2 text-left font-medium">Entity</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Managed by</th>
                    <th className="label-xs px-4 py-2 text-left font-medium">Held via</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Qty</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Avg cost</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Invested</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Current</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Unreal. P&L</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Return</th>
                    <th className="label-xs px-4 py-2 text-right font-medium">Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {[...rows].sort((a, b) => b.marketValue - a.marketValue).map((r) => {
                  const eng = engagementOf(accIdx, r) || null;
                  const route = holdingRoute(eng);
                  return (
                    /* COUNTED STRUCTURALLY, NEVER BY LINE. `check:pages` used to
                       count these rows by splitting the table's innerText on
                       newlines, which works only while every cell is one line —
                       and the MANAGED BY cell below carries a strategy sub-line
                       whenever the account prints one. The entity-count check
                       therefore passed on a dually-reported holding whose
                       accounts name no strategy and failed on one that does,
                       which is a fact about the fixture rather than the page. */
                    <tr key={r.accountId} data-account-row={r.accountId} className="hover:bg-ink-700/40">
                      <td className="px-4 py-2.5 font-medium text-slate-100">{ownerOf(accIdx, r)}</td>
                      <td className="px-4 py-2.5 text-[12px] text-slate-400">
                        {providerOf(accIdx, r)}
                        {strategyOf(accIdx, r) && <div className="text-[10px] text-slate-600">{strategyOf(accIdx, r)}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-slate-400">
                        {/* ONE LINE. A second <div> here becomes a newline in
                            innerText, which splits every account row in two and
                            breaks the entity-count check on a dually-reported
                            holding. The engagement rides in the tooltip, and the
                            mandate link is INLINE for the same reason. */}
                        <span title={`${eng || "engagement not stated"} — ${ROUTE_NOTE[route]}`}>
                          {ROUTE_LABEL[route]}
                        </span>
                        {/* THE ROW IS THE DOOR INTO THE MANDATE. A reader who
                            arrived on this name has one question left — what
                            else is in there — and this is the only place on the
                            page that can answer it per account, which matters
                            where one name is held under two different mandates.
                            Labelled with the strategy the manager prints, or the
                            manager itself where none is printed. */}
                        {isMandateHeld(eng) && (
                          <>
                            {" · "}
                            <Link to={`/mandate/${encodeURIComponent(r.accountId)}`} className="text-champagne-400 hover:underline"
                              title="Open this mandate — every holding the manager runs in it, tied to the statement it came from">
                              {mandateLabel(accIdx.get(r.accountId))}
                            </Link>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-300">{fmtNum(r.quantity)}</td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">{r.avgCost === null ? <AbsentCell reason="this provider prints no per-unit cost for the holding" /> : price(r.avgCost)}</td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">{money(r.costBasis)}</td>
                      <td className="px-4 py-2.5 text-right mono text-slate-200">{money(r.marketValue)}</td>
                      <td className={`px-4 py-2.5 text-right mono ${changeColor(r.unrealizedPnL)}`}>{money(r.unrealizedPnL, true)}</td>
                      <td className={`px-4 py-2.5 text-right mono ${changeColor(r.returnPct)}`}>{fmtPct(r.returnPct, { sign: true, decimals: 1 })}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${(r.ltCostBasis ?? 0) >= (r.stCostBasis ?? 0) ? "bg-emerald-500/15 text-gain" : "bg-amber-500/15 text-amber-400"}`}>{r.stCostBasis === null && r.ltCostBasis === null ? DASH : (r.ltCostBasis ?? 0) >= (r.stCostBasis ?? 0) ? "LT" : "ST"}</span>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-ink-600 font-semibold">
                  <tr>
                    <td className="px-4 py-2.5 text-left text-slate-200">Total</td>
                    <td />
                    <td />
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{fmtNum(qty)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{price(avgCost)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{money(cost)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-100">{money(mv)}</td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(pnl)}`}>{money(pnl, true)}</td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(ret)}`}>{fmtPct(ret, { sign: true, decimals: 1 })}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* CARRY BOTH, COUNT ONCE — and SAY SO where both are on screen.
                Every row above is a statement as its issuer printed it, so a
                name reported under two members has two rows; the Total is the
                consolidated figure, which counts the holding once. Without this
                line the two disagree by exactly the duplicate and a reader who
                adds the column has found a contradiction. */}
            {dupCollapsed > 1 && (
              <p className="border-t border-ink-700/60 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
                The rows above add to {money(sum(rows.map((r) => r.marketValue)))}: this is ONE holding, reported on
                each of the {held} statements listed. Both are shown as printed, and the Total counts it once —
                {money(mv)}, the same basis as the current value of holdings. Which statement owns it is a question about the
                family's affairs, not a parsing rule, so neither row is suppressed.
              </p>
            )}
          </Card>

          <Card title="Tax basis & holding">
            <div className="flex items-center justify-between py-2 text-sm"><span className="text-slate-400">Long-term cost</span><span className="mono text-slate-100">{ltCost === null ? <AbsentCell reason="the long/short split needs per-lot purchase dates, and only a lot register carries them — see the note below" /> : money(ltCost)}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Short-term cost</span><span className="mono text-slate-100">{stCost === null ? <AbsentCell reason="the long/short split needs per-lot purchase dates, and only a lot register carries them — see the note below" /> : money(stCost)}</span></div>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full border border-ink-700">
              <div style={{ width: `${ltPct ?? 0}%`, background: "#10b981" }} />
              <div style={{ width: `${ltPct === null ? 0 : 100 - ltPct}%`, background: "rgba(245,158,11,.5)" }} />
            </div>
            {/* No lot dates in this book, so the split is unknown — say so rather
                than drawing an empty bar that reads as "all short-term". */}
            <div className="mt-1.5 flex justify-between text-[10.5px] text-slate-500">
              {ltPct === null
                ? <span>Long-term / short-term split {DASH} no lot dates on the statements</span>
                : <><span>Long-term {ltPct.toFixed(0)}%</span><span>Short-term {(100 - ltPct).toFixed(0)}%</span></>}
            </div>
            {/* A purchase date only exists where the statements' window covers
                the buy. Absent here means "not in this window", not "never
                bought" — the tooltip says which. */}
            <div className="mt-2 flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">First bought</span><span className="mono text-slate-100">{firstBought ? fmtDate(firstBought) : led === undefined ? "…" : <AbsentCell reason="no purchase in the window the transaction statements cover — this holding predates it" />}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Last added</span><span className="mono text-slate-100">{lastAdded ? fmtDate(lastAdded) : led === undefined ? "…" : <AbsentCell reason="no purchase in the window the transaction statements cover" />}</span></div>
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Dividends recorded</span><span className="mono text-slate-100">{div !== null && div > 0 ? fmtFromBase(div, { compact: true }) : <AbsentCell reason="no dividend statement in this book records an event in this name" />}</span></div>
            {/* The denominator is the WHOLE consolidated book — see `bookMV`
                above, which is deliberately not the listed subset because this
                page serves every holding. The label said "listed book" anyway,
                so an AIF folio's page read "Weight in listed book 38.0%" about a
                holding that is not listed and against a total that is not the
                listed one. Wrong on both halves of a three-word label. */}
            <div className="flex items-center justify-between border-t border-ink-700/60 py-2 text-sm"><span className="text-slate-400">Weight in book</span><span className="mono text-slate-100" title="Share of the current value of holdings — every asset class, each dually-reported holding counted once.">{weight.toFixed(1)}%</span></div>
          </Card>
        </div>
      )}

      {/* Transaction history */}
      <Card className="mt-5" title="Transaction history" subtitle='Every dated buy & sell from the ledger — the "Transaction Info" drill-down' pad={false}
        right={led && led.txns.length ? <Pill>{led.txns.length} rows · {led.txns.filter((t) => t.side === "Sell").length} sells</Pill> : undefined}>
        <div className="max-h-[460px] overflow-auto">
          {led === undefined ? (
            <div className="grid h-32 place-items-center text-sm text-slate-500">Loading transactions…</div>
          ) : led == null ? (
            <div className="grid h-32 place-items-center px-6 text-center text-sm text-slate-500">
              The audit archive didn't respond. Refresh to retry — it is served alongside the app, so this is the
              archive being unreachable rather than your session being stale.
            </div>
          ) : led.txns.length === 0 ? (
            <div className="grid h-32 place-items-center px-6 text-center text-[12.5px] leading-relaxed text-slate-500">
              <span className="max-w-md">
                No transaction in this name over the window the statements cover
                {led.periodFrom && led.periodTo ? <> ({fmtDate(led.periodFrom)} → {fmtDate(led.periodTo)})</> : null}.
                A holding bought before that window and untraded since carries no row here — the transaction
                statements are a period record, not a lot history.
              </span>
            </div>
          ) : (
            <table className="min-w-full whitespace-nowrap text-sm">
              <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Date</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Type</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Entity</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Qty</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Rate</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {led.txns.map((t, i) => (
                  <tr key={i} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2 mono text-[12px] text-slate-400">{fmtDate(t.date)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.side === "Buy" ? "bg-indigo-500/10 text-indigo-300" : "bg-red-500/15 text-loss"}`}>{t.side === "Buy" ? "BUY" : "SELL"}</span>
                    </td>
                    <td className="px-4 py-2 text-[13px] text-slate-300">{t.account}</td>
                    <td className="px-4 py-2 text-right mono text-slate-300">{fmtNum(t.qty)}</td>
                    <td className="px-4 py-2 text-right mono text-slate-400">{price(t.rate)}</td>
                    <td className="px-4 py-2 text-right mono text-slate-200">{fmtFromBase(t.amount, { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Investment tools are the family's OWN judgements — a target price or a
          review date is as meaningful against a fund as against a company — so
          they render for every holding. */}
      {/* WHAT THE FUND HOLDS — the look-through, where a disclosure resolves.
          Placed ABOVE the research-absence card because it answers the question
          that card used to have to refuse: "what companies am I holding through
          this fund". The card below still refuses the COMPANY research (a fund
          has no PE and no concall) and now also states, for a fund with no
          resolved disclosure, that this is why there is no list. */}
      {fundVehicle && rows.length > 0 && canHaveLookthrough(rows[0]) && (
        <FundLookthrough securityKey={securityKey} name={name} holdingValue={mv} asOfHolding={rows[0] ? accIdx.get(rows[0].accountId)?.asOf ?? portfolio.asOf : portfolio.asOf} />
      )}

      {notACompany ? (
        <Card className="mt-5" title={`Company research — not applicable to ${NOT_A_COMPANY_LABEL[assetClass ?? ""] ?? "this holding"}`}>
          <p className="text-[12.5px] leading-relaxed text-slate-400">
            This holding is <span className="font-medium text-slate-300">{assetClassLabel(assetClass)}</span>
            {fundVehicle
              ? <> — one line standing for a portfolio the manager assembles, not a share in a company.</>
              : <> — a balance, not a share in a company.</>} So there is no price history, no PE, no balance sheet,
            no concall and no insider filing for it, and the five panels that carry those for a company are absent
            here by decision rather than by a feed being down.
          </p>
          {fundVehicle && (
            <>
              <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
                The companies inside it are the manager's holdings, not this book's — no statement issued to this family
                names them. {canHaveLookthrough(rows[0])
                  ? <>A MUTUAL FUND scheme nonetheless discloses its portfolio monthly, and where that disclosure
                    resolves it is shown above under its own heading. It is the AMC's document, not this family's, so
                    the fund&rsquo;s value still stays whole here and in every total rather than being spread across the
                    sectors of companies the family does not directly own.</>
                  : <>An AIF publishes no such disclosure — SEBI requires a monthly portfolio from a mutual fund and not
                    from a Category II or III alternative fund — so there is no scheme document to join to this folio,
                    and the fund&rsquo;s value stays whole.</>}
              </p>
              {/* WHY THIS HAS TO BE SAID HERE, AND SAID AS A CONTRAST.
                  A reader who has just learnt that a share held through a PMS is
                  listed inside that manager's drill-down will come to a fund
                  expecting the same page and read its absence as something not
                  built yet. The two look alike and are not: a PMS reports every
                  share it holds because the FAMILY owns those shares — the
                  manager only chose them — so the rollup is a real, documented
                  one. A fund unit is one purchase of somebody else's portfolio,
                  the fund owns the companies, and no statement here says which
                  they are. So there is no list to render, and this is a decided,
                  permanent absence rather than an empty table waiting on a feed. */}
              <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
                <span className="font-medium text-slate-300">A mandate&rsquo;s constituents and a fund&rsquo;s are two
                different kinds of fact, and the difference is worth keeping in view.</span> Under a mandate the family
                owns each share and the manager merely picks it, so every one is reported BY NAME on a statement issued
                to this family, and the mandate&rsquo;s own page carries all of them at the family&rsquo;s own cost and
                value. A fund unit is the opposite: the fund owns the companies, and what this family is told is only
                what the unit is worth. Anything shown above about what the scheme holds comes from the AMC&rsquo;s
                public disclosure and carries no cost, no purchase date and no figure about this family except the one
                derived from a published weight.
              </p>
            </>
          )}
        </Card>
      ) : (
        <ReturnsTable ticker={sym} name={name} />
      )}

      <InvestmentTools
        securityKey={securityKey}
        name={name}
        price={rows[0]?.currentPrice ?? null}
        priceIsLive={live}
      />

      {!notACompany && (
        <>
          <RatioTable ticker={sym} name={name} />

          <ResearchPanel ticker={sym} name={name} />

          {/* Deep company research — live 52-week range & insider trades, a pointer
              to the live Research panel above, and previews for the sections no
              endpoint serves as structured data yet. */}
          <CompanyResearchPreview name={name} ticker={sym} price={rows[0]?.currentPrice ?? null} live={live}
            low52={rows[0]?.low52 ?? null} high52={rows[0]?.high52 ?? null} />
        </>
      )}

    </div>
  );
}
