import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Wallet, Layers, TrendingUp, Coins, Activity, Tag } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  sum, sumOrNull, consolidatedMarketValue, dedupedPositions, isFundVehicle, isCompanyShare, assetClassLabel,
  measuredReturn, type RowCapital,
  holdingRoute, ROUTE_LABEL, ROUTE_NOTE,
  holdingBucket, bucketLabel, isMandateHeld, mandateLabel,
  MANDATE_BUCKET, DIRECT_EQUITY_BUCKET, UNROUTED_EQUITY_BUCKET, isCashEquivalent,
} from "@/lib/analytics";
import { fmtCurrency, fmtNum, fmtPct, fmtDate, changeColor, DASH } from "@/lib/format";
import { fifoTotals, fifoBasisNote } from "@/lib/fifo";
import { AbsentValue, AbsentCell, AbsentSection } from "@/components/Absent";
import { fundNavFor, isArbitrageFund } from "@/lib/fundNavs";
import { carriedCostOf, carriedCostNote } from "@/lib/tranches";
import { BOOK_POSITION_TRANCHES } from "@/data/glowData";
import type { Position } from "@/lib/types";

import { loadStockLedger, type StockLedger } from "@/lib/ledger";
import { symbolFor } from "@/lib/quotes";
import { accountIndex, ownerOf, providerOf, strategyOf, engagementOf } from "@/lib/accounts";
import { ResearchPanel } from "@/components/ResearchPanel";
import { FundLookthrough } from "@/components/FundLookthrough";
import { canHaveLookthrough, companySectorIndex } from "@/lib/lookthrough";
import { useStockExposure } from "@/lib/useStockExposure";
import { UNCLASSIFIED } from "@/lib/sectors";
import { ReturnsTable } from "@/components/ReturnsTable";
import { InvestmentTools } from "@/components/InvestmentTools";
import { QuantityMovement } from "@/components/QuantityMovement";
import { CorporateActionReturns } from "@/components/CorporateActionReturns";
import { PageNav } from "@/components/PageNav";
import { useViewParam } from "@/components/ViewToggle";
import { movementsFor, unmovedAccountsFor } from "@/lib/shareMovements";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { useDatedCapital } from "@/lib/useDatedCapital";

/**
 * THE RETURN, AND WHICH RETURN IT IS.
 *
 * *"Where will I get to see holding period return? From the date of my purchase
 * till today… Absolute return and XIRR, both. Less than one year equity has to
 * be absolute. More than one year, then you should show me CAGR."*
 *
 * The holding-period return ALWAYS renders — it is the one this book can strike
 * for every costed holding, and the family called it the most important. The
 * annual rate renders BESIDE it, never instead of it, and only where a purchase
 * date is on file and the holding is a year old: `measuredReturn` holds the
 * guard that refuses to compound a shorter window (the +99.0% failure), so a
 * row without a date shows the holding-period figure alone and the tooltip says
 * which document would supply one.
 *
 * XIRR IS A THIRD LINE ONLY WHERE THE ROW IS AN ACCOUNT. A holding inside an
 * account has no cash flows of its own — the statements cover the current
 * period — so a dash on every row of every name would say that 371 times, and
 * none is drawn. But a row that is one WHOLE folio of a fund (Buoyant's, a
 * Sanshi folio, a drawdown fund) IS that account, and the account's dated
 * record of every payment in and out is exactly what a money-weighted return is
 * solved over (`datedCapital.ts`). There it shows — **15.30% and 9.76%** on
 * Buoyant's two folios, the IRR Buoyant's own fact sheet prints — beside the
 * holding-period return, never instead of it. Under a year it does not show:
 * the guard that refuses to compound a part-year is the one in
 * `measuredReturn`, and a second line repeating the HPR would be one number
 * under two names.
 */
function ReturnCells({ p, asOf, capital }: { p: Position; asOf: string; capital?: RowCapital | null }) {
  const hpr = measuredReturn(p, "absolute", asOf);
  const cagr = measuredReturn({ ...p, capital }, "cagr", asOf);
  // Only where the guard actually annualised. `cagr` falls back to the
  // holding-period figure under a year and tags it HPR — printing that as a
  // second line would show one number twice under two names.
  const annual = cagr.shown && cagr.tag === "CAGR" ? cagr : null;
  const xirr = capital?.dated ? measuredReturn({ ...p, capital }, "xirr", asOf) : null;
  const money = xirr && xirr.shown && xirr.tag === "XIRR" ? xirr : null;
  return (
    <>
      <span className="whitespace-nowrap">
        <span className="ret-tag mr-0.5">HPR</span>
        {hpr.shown
          ? <span className={changeColor(hpr.pct)} title={hpr.note}>{fmtPct(hpr.pct, { sign: true, decimals: 1 })}</span>
          : <AbsentCell reason={hpr.reason} />}
      </span>
      {annual && (
        <div className="whitespace-nowrap">
          <span className="ret-tag mr-0.5">CAGR</span>
          <span className={changeColor(annual.pct)} title={annual.note}>{fmtPct(annual.pct, { sign: true, decimals: 1 })}</span>
        </div>
      )}
      {money && (
        <div className="whitespace-nowrap" data-stock-xirr={money.pct}>
          <span className="ret-tag mr-0.5">XIRR</span>
          <span className={changeColor(money.pct)} title={money.note}>{fmtPct(money.pct, { sign: true, decimals: 1 })}</span>
        </div>
      )}
    </>
  );
}

/**
 * ── ONE TEMPLATE FOR EVERY HOLDING: FIVE TABS, AND THE PAGE DOES NOT SCROLL ──
 *
 * *"When I come inside a portfolio position it's an unbelievably bad UI
 * experience — please fix it all by making top sub tabs like we have done for
 * others and not having a long page I have to scroll, and remove what is not
 * necessary and consolidate what can be consolidated so it's one clean template
 * for all."*
 *
 * Measured before the change at 1500×1000: the company page was 1,496px taller
 * than the window it sat in — a header, six tiles, the account table, a folded
 * tax card, the quantity account, the transaction tape, the price chart, the
 * family's own targets, a ratio table, a research card, a trading-range card, an
 * insider table and a paragraph describing the cards above it, one under
 * another. A fund's page was a different stack again, so no two holdings read
 * the same way.
 *
 * THE SAME FIVE TABS ON EVERY HOLDING, and each answers one question:
 *
 *   Position         who holds it, through which account, at what cost and mark
 *   Transactions     what moved — dated buys and sells, the depository's own
 *                    quantity account, purchase dates and the tax split
 *   Price & returns  a company's price history; a fund's published NAV and its
 *                    own returns; for an AIF or a cash line, a decided absence
 *   Research         a company's financials, ratios, filings and insider deals;
 *                    a fund's disclosed holdings; otherwise a decided absence
 *   My targets       the family's own target price, fair value, levels and notes
 *
 * A tab whose question has no answer for this KIND of holding still opens, and
 * says so once and why — "a card that can never be filled must not look like one
 * that is waiting". Hiding it instead would make the template differ by asset
 * class, which is exactly what was reported.
 *
 * THE HEADER AND THE KPI STRIP ARE OUTSIDE THE PANEL, on every tab, and the
 * panel scrolls inside itself — Morning CIO's construction, and for its reason:
 * what the family asked for is that the headline and the tiles stop moving. The
 * no-scroll layout applies from `lg` up; below it the page flows and scrolls as
 * a phone needs, because a fixed-height column there would squeeze the panel to
 * nothing under six stacked tiles.
 *
 * IN `?tab=` LIKE EVERY OTHER VIEW IN THIS APP, so a tab is a link, Back steps
 * between tabs and `check:pages` reaches each one by URL. The first is
 * param-free. The labels are deliberately NOT the card headings they open, so a
 * check struck on a heading cannot be satisfied by the tab strip.
 */
const STOCK_TABS = [
  { key: "position", label: "Position",
    title: "Who holds it, through which account, at what cost and at what mark" },
  { key: "activity", label: "Transactions",
    title: "Dated buys and sells, the depository's own quantity account, the purchase dates and the tax split" },
  { key: "market", label: "Price & returns",
    title: "The security's own price history and returns — or, for a fund, its published NAV and returns" },
  { key: "research", label: "Research",
    title: "A company's financials, ratios, filings and insider deals — or, for a mutual fund, what it holds" },
  { key: "targets", label: "My targets",
    title: "The family's own target price, fair value, entry and exit levels, alerts and notes for this name" },
] as const;

/**
 * Each table's columns in DECLARED order — the order their cells are written
 * in below, which is what `<Tr>` permutes from. The first is the row's SUBJECT
 * and never moves (see `src/lib/tableView.ts`).
 */
/**
 * CMP SITS NEXT TO AVG COST, because that is the comparison a reader opens this
 * table to make — *"avg cost column has price but current NAV is not there… we
 * need a column of current NAV"*. The page had carried a holding-level mark in
 * its header since it was written and none per statement, so a holding reported
 * by several accounts showed one price above a table of several, and the ten
 * securities whose statements mark them DIFFERENTLY had no surface that could
 * say so at all.
 *
 * THE VALUE COLUMN IS "MARKET VALUE" NOW, NOT "CURRENT". Two columns along from
 * CMP it was headed "Current", and a reader scanning for the price found a
 * column called Current and it was money — part of why the missing mark went
 * unnoticed. It takes the Portfolio Monitor's own word for the same figure.
 *
 * AND THE BASIS COLUMN IS GONE. It printed LT or ST per row from the lot
 * register — which exists for ONE account in this book, so the column was a dash
 * on 368 of 371 positions — and the long/short split it summarised is on the
 * Transactions tab's tax card, cost by cost, where the family asked for tax to
 * be "just a click".
 */
const POS_COLS = ["entity", "managedBy", "qty", "avgCost", "cmp", "invested", "current", "pnl", "return"] as const;
const STOCK_TXN_COLS = ["date", "type", "entity", "qty", "rate", "amount"] as const;

/** What a holding that is not a company IS, for a heading that says so. */
const NOT_A_COMPANY_LABEL: Record<string, string> = {
  "Mutual Fund": "a mutual fund", ETF: "an ETF", AIF: "an AIF folio", Cash: "a cash line",
};

/**
 * HOW EACH SECTOR TIER IS NAMED, for the sector chip's hover. A sector placed
 * by a fund's filing or by screener.in is borrowed evidence rather than the
 * family's own statement, and a reader cannot tell which from the chip alone.
 */
const SECTOR_FROM: Record<string, string> = {
  book: "as this holding's own statement prints it",
  disclosure: "from a fund's own SEBI portfolio filing, joined on this company's ISIN — the same classification Sector Composition uses",
  vendor: "from screener.in, joined on the NSE symbol — the same classification Sector Composition uses",
};

export function StockInfo() {
  // Keyed by securityKey — this book's providers mostly print a name and nothing
  // else, so an ISIN route would leave most holdings unreachable.
  const { securityKey = "" } = useParams();
  const { portfolio, consolidated, fmtFromBase, convertFromBase, displayCurrency, quotesStatus } = usePortfolio();
  // WHICH TAB IS OPEN — see `STOCK_TABS` for what the five are and why the
  // choice lives in the URL.
  const [tab, setTab] = useViewParam(STOCK_TABS, {}, "tab");
  // Which account rows ARE a whole account on a dated record, for the XIRR line.
  const { dated: datedCap, universe: holdingsUniverse } = useDatedCapital();
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
  // The demat statements' own opening-to-closing quantity account for this
  // name, one row per account that issues a transaction statement.
  const moves = useMemo(() => movementsFor(securityKey), [securityKey]);
  // Accounts that hold this name, issue a transaction statement, and print no
  // block for it — the statement saying it did not move, which a reader shown
  // nothing at all cannot tell from a gap.
  const unmoved = useMemo(() => unmovedAccountsFor(rows), [rows]);
  // ABOVE THE EARLY RETURN — a hook that runs on some renders and not others
  // is a hooks-order error rather than a conditional table. Every hook this
  // page calls is declared here for that reason, including the four memos that
  // used to sit after the return and were a hooks-order bug waiting for a
  // render on which the book had not loaded.
  const posView = useTableView("stock-positions", POS_COLS);
  const txnView = useTableView("stock-txns", STOCK_TXN_COLS);
  /**
   * HOW THIS NAME IS HELD, not just what it is.
   *
   * The family opened this page on Jammu Kashmir Bank, read the asset class as
   * "direct equity", and saw two lines below that Carnelian manages it. The
   * page was contradicting itself: the shares are equity — that part was never
   * wrong — but nothing said the family did not choose them.
   *
   * One name can be held both ways at once (Onesource sits in a mandate and in
   * a demat), so the routes are collected across the rows and every one of them
   * is stated rather than the first. They ride in the bucket chip's hover now
   * rather than on a second chip beside it: for every holding in this book the
   * bucket already names the route — Direct Equity is the family's own account,
   * PMS mandates is a manager's, a fund's class is a fund vehicle — and the
   * Position tab states it again on every account row.
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
   * THE MANDATES THIS NAME SITS INSIDE, for the line under the name and the
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
   * WHAT THE MANDATE ROWS ACTUALLY ARE — because the mandate chip's tooltip
   * names a NOUN, and a typed noun is a claim.
   *
   * `holdingBucket` puts a mandate's WHOLE account in the mandate bucket, cash
   * sleeve included, and that is deliberate: the mandate is worth what its own
   * statement says it is worth. So 18 of this book's mandate-held rows are not
   * shares at all — ₹9.51 Cr of `Cash` across the ten mandates, plus Cash
   * Rec/Payable, a liquid sweep and a TDS receivable — and the mandate page
   * links every one of them to `/stock/<securityKey>`. Arriving here from that
   * link, a hardcoded "the family owns these shares" describes a ₹9.51 Cr
   * balance as shares, on the same screen whose research tab says in as many
   * words that this holding is a balance and not a share in a company.
   *
   * So the noun is DERIVED from the rows the tooltip actually covers — the
   * mandate-held subset, not the page's first row and not its asset class.
   *
   * THE LINE UNDER THE NAME NO LONGER NAMES ONE AT ALL. It used to read "— the
   * family owns these shares and the manager decides them: … Every other holding
   * in that mandate is on its own page", which was two sentences of explanation
   * above the figures on every visit. It names the mandate and links to it now;
   * a sentence that asserts no noun cannot assert the wrong one.
   */
  const mandateRows = useMemo(
    () => rows.filter((r) => isMandateHeld(engagementOf(accIdx, r) || null)),
    [rows, accIdx]);
  /**
   * ── THE SECTOR, ON THE SAME THREE TIERS SECTOR COMPOSITION USES ──────────
   *
   * The chip read `rows[0].sector` — the family's own statement and nothing
   * else — and a depository statement prints an ISIN, a quantity and a rate and
   * NO industry at all. So every company the family bought in its own demat
   * carried an "Unclassified" chip here (Clean Max, in the family's own
   * screenshot of this page) while Sector Composition, Family & Entities and the
   * Portfolio Monitor's stock axis all placed the same company. One screen
   * contradicting three others about one company is what `companySectorIndex`
   * exists to prevent, so this reads it: a PROJECTION of `companyExposure`,
   * never a second resolver, and the lower two tiers only ever FILL an empty
   * sector — a statement that printed one keeps it.
   *
   * ENABLED ONLY WHERE IT CAN CHANGE THE ANSWER: a company share whose own
   * statements print no sector. Everything else pays for no fetch, and a chip
   * the statement already answered is the same chip either way.
   *
   * OVER EVERY COMPANY SHARE AND NOT `currentHoldings(...)`, for the reason
   * Family & Entities records: a company's sector does not depend on how much of
   * it the family holds.
   */
  const bookSector = rows.find((r) => r.sector && r.sector !== UNCLASSIFIED)?.sector ?? null;
  const sectorWanted = rows.length > 0 && rows.every(isCompanyShare) && bookSector === null;
  const exposure = useStockExposure(consolidated, sectorWanted);
  const placed = useMemo(() => (sectorWanted && exposure.status !== "loading"
    ? companySectorIndex(consolidated.filter(isCompanyShare), exposure).get(securityKey) ?? null
    : null), [sectorWanted, exposure, consolidated, securityKey]);
  if (!portfolio) return null;

  const name = rows[0]?.security ?? led?.name ?? securityKey;
  /**
   * A FUND UNIT IS NOT A COMPANY, AND THIS PAGE MUST NOT RESEARCH IT AS ONE.
   *
   * The route is `/stock/:securityKey` and it serves every holding, which is
   * right — an AIF folio's quantity, cost, entities and dated ledger all belong
   * on a page of their own. What does not belong is the company research: a
   * returns table, ratios, screener's financials, concalls and insider trades,
   * each rendering its own "nothing came back" state for a holding that HAS no
   * company behind it. Those tabs state the absence ONCE, by decision, rather
   * than drawing five dashed boxes that read as five failed feeds.
   *
   * This is decided by the asset class rather than by the ticker being null: a
   * company whose NSE symbol this book could not resolve is a resolver shortfall
   * and keeps its research, because a future `build-symbols` fills it. A fund
   * never will.
   *
   * CASH IS IN THE SAME SET AND `Unlisted` IS NOT. A cash line and a liquid
   * sweep have no company behind them either. An unlisted COMPANY does — it is
   * a company whose figures nobody publishes, which is a data gap the research
   * tab is right to report as one.
   */
  const assetClass = rows[0]?.assetClass ?? null;
  const mandateAllShares = mandateRows.length > 0 && mandateRows.every(isCompanyShare);
  const mandateNoShares = mandateRows.length > 0 && !mandateRows.some(isCompanyShare);
  /** Where none of them is a share and they are all ONE class, the tooltip can
   *  name that class instead of reaching for a generic noun. Mixed classes fall
   *  back to the neutral wording rather than picking one to speak for the rest. */
  const mandateClass = mandateNoShares && new Set(mandateRows.map((r) => r.assetClass)).size === 1
    ? assetClassLabel(mandateRows[0].assetClass)
    : null;
  /** The mandate bucket's tooltip: "Company shares, held under a discretionary
   *  mandate" is true of Jammu & Kashmir Bank and false of the cash sleeve
   *  sitting in the same bucket by design. */
  const mandateBucketTip = mandateAllShares
    ? "Company shares, held under a discretionary mandate. The holdings tables file them under the manager who chose them, not with the shares the family bought itself."
    : mandateNoShares
      ? `${mandateClass ?? "Not a company share"} — held inside a discretionary mandate. The holdings tables file a mandate's WHOLE account under its manager, the balances beside the shares included, so the mandate's total ties to the statement it came from. That is why this sits under ${MANDATE_BUCKET} rather than under its own class.`
      : `Held inside a discretionary mandate. The holdings tables file a mandate's whole account under its manager — the shares it holds and the balances beside them — rather than splitting one statement across classes.`;
  /** How this name came to be held, in words, for every route its rows take. */
  const routeTip = routes
    .map(([k]) => `Held via ${ROUTE_LABEL[k as keyof typeof ROUTE_LABEL]} — ${ROUTE_NOTE[k as keyof typeof ROUTE_NOTE]}.`)
    .join(" ");
  /** What one unit of this holding IS, for the Quantity tile's caption. */
  const qtyNoun = assetClass === "Cash" ? "balance"
    : assetClass === "Equity" || assetClass === "Unlisted" ? "shares held"
    : assetClass ? "units held"
    : "held";
  const notACompany = rows.length > 0 && rows.every((r) => isFundVehicle(r) || r.assetClass === "Cash");
  const fundVehicle = rows.length > 0 && rows.every(isFundVehicle);
  /**
   * A LIQUID OR ARBITRAGE FUND IS CASH ON THIS PAGE TOO. The family's rule is
   * that such a fund is classified as nothing but cash, so the Research tab says
   * Cash rather than the wrapper its statement typed it as — and an arbitrage
   * fund is not looked through at all: its disclosed long shares are hedged by
   * short futures, and reading them as exposure would print stock the family
   * does not carry.
   */
  const cashFund = fundVehicle && rows.every((r) => isCashEquivalent(r));
  const arbitrage = rows.some((r) => isArbitrageFund(r));
  // A mutual fund or an ETF discloses its portfolio monthly and has a published
  // NAV; an AIF does neither. The one test, so the two tabs a scheme fills and
  // the note that refers to them cannot disagree about which schemes they are.
  const schemeHalves = fundVehicle && canHaveLookthrough(rows[0]);
  /**
   * AN ARBITRAGE FUND KEEPS ITS PRICE HALF AND LOSES ITS HOLDINGS HALF. The
   * reason it is not looked through is about what it HOLDS — long shares
   * hedged by short futures — and says nothing against the scheme's own
   * published NAV and returns, which are a statement about the fund rather than
   * about anything inside it. When the two halves were one card the whole card
   * had to go; on two tabs only the half the reason is about does.
   */
  const lookThroughHoldings = schemeHalves && !arbitrage;
  const notACompanyLabel = NOT_A_COMPANY_LABEL[assetClass ?? ""] ?? "this holding";
  const providerSector = rows.find((r) => r.providerSector)?.providerSector ?? null;
  const isin = rows[0]?.isin;
  /* The holding-level mark is resolved below, once `price` exists — whether
     one can be shown at all is a question about what the RENDERER can
     distinguish, so it cannot be answered before the renderer is defined. */
  const qty = sum(drows.map((r) => r.quantity));
  const cost = sumOrNull(drows.map((r) => r.costBasis));
  const mv = sum(drows.map((r) => r.marketValue));
  const pnl = sumOrNull(drows.map((r) => r.unrealizedPnL));
  // Both stay NULL when no statement reported a cost for this name, so the
  // tiles render `—`. A zero average cost reads as shares acquired for nothing
  // and a zero return as break-even; neither was measured.
  // LARGEST FIRST IS THE DEFAULT and a reader's own ranking replaces it. An
  // absent cost or price sorts LAST either way rather than as a zero, which
  // would rank a depository row that reports no cost among the cheapest.
  const posRows = sortRows([...rows].sort((a, b) => b.marketValue - a.marketValue), posView.sort, {
    entity: (r) => ownerOf(accIdx, r),
    managedBy: (r) => providerOf(accIdx, r),
    qty: (r) => r.quantity,
    avgCost: (r) => r.avgCost,
    // The statement's own mark, never `marketValue / quantity`: measured over
    // this book the two differ on ICICI NFT NT 50 DP G, whose statement prints
    // a rate of 60.4 against a value column implying 60.4167. The price is a
    // PRIMITIVE here (§4b) and deriving it would publish a figure the document
    // does not. An absent mark sorts LAST either way rather than as a zero.
    cmp: (r) => r.currentPrice,
    invested: (r) => r.costBasis,
    current: (r) => r.marketValue,
    pnl: (r) => r.unrealizedPnL,
    return: (r) => r.returnPct,
  });
  const avgCost = cost !== null && qty > 0 ? cost / qty : null;
  /**
   * FIFO — the realised gain on units of this holding already sold stays in
   * its return (`fifoTotals`), over the rows that report a cost, which is the
   * set Invested beside it is struck on.
   */
  const fifo = fifoTotals(drows.filter((r) => r.costBasis != null && !r.costUnavailable));
  const ret = cost !== null && pnl !== null && cost > 0 ? fifo.returnPct : null;
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
   * The custodian is NAMED rather than described, and the claim is scoped to
   * THIS holding — `providerOf` reads the account registry, so nothing here
   * infers a custodian from a security name (§2), and the sentence stays true
   * for an account that reports cost on its other rows but not this one.
   */
  const costWhy = (() => {
    // No rows at all is a name no statement now holds — there is no cost to
    // miss, and "no statement reports a cost" would send a reader looking.
    if (drows.length === 0) return "no current holding";
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
   * CRN37702 and Bharat's CRN60117, whose own "Position by account" table
   * listed both of them. The pill and the table contradicted each other on one
   * screen.
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
  /**
   * A COST CARRIED THROUGH A FUND'S CLASS SWITCH, and the figure the fund's own
   * statement prints instead. This is the page a reader opens with that
   * statement in hand, so the two must be told apart here in the same words the
   * Portfolio Monitor uses — `carriedCostNote` is the one place they are chosen.
   */
  const carried = cost === null ? null : carriedCostOf(drows, BOOK_POSITION_TRANCHES);
  const carriedWhy = carried ? carriedCostNote(carried, (v) => money(v)) : "";

  /**
   * THE MARK, AND WHY IT IS NOT `rows[0]`.
   *
   * NULL, NOT ZERO, first: this read `?? 0` and printed a 2xl "₹0" as the CMP
   * headline of every holding its statement marks at a TOTAL VALUE rather than
   * a per-unit price — 360 ONE's AIF units among them, whose page therefore led
   * with a zero price above a ₹1.47 Cr holding value. A figure produced by a
   * default is the exact failure this book exists to prevent.
   *
   * IT THEN READ `rows[0]?.currentPrice`, WHICH IS A DIFFERENT FABRICATION AND A
   * QUIETER ONE. A holding reported by several statements has several marks, and
   * they are not always the same figure — measured over this book, 10 of its 213
   * securities carry marks that render DIFFERENTLY, and the spread is not small:
   *
   *     Gland Pharma      ₹2,667.30 (Carnelian, 10 Aug)  ₹2,502.90 (SVAN, 31 Jul)
   *     DSP Gold ETF      ₹151.10 on ₹3.1 Cr            ₹141.24 on ₹16.9 Cr
   *     HELIOS FCF D-GROW ₹14.18                        ₹15.74
   *
   * So the page does not choose. Where every statement's mark renders as ONE
   * figure it is shown; where they do not, the price tile states that and sends
   * the reader to the per-account table, which prints each mark beside the
   * statement it came from. **The test is what the RENDERER can distinguish**,
   * not an invented tolerance: two marks the page would print identically are
   * one figure as far as a reader is concerned, and two it prints differently
   * are genuinely two.
   */
  /**
   * THE PUBLISHED NAV BEHIND THIS HOLDING, where one priced it. Read for the
   * CAPTION only — the figure itself already flows through `currentPrice`,
   * which `applyFundNavs` overlaid at the context. Reading it again to compute
   * a value would be a second source for one number.
   */
  const navMark = rows.some((r) => r.navPriced) ? fundNavFor({ securityKey }) : null;
  const cmpMarks = [...new Set(rows.map((r) => r.currentPrice)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map(price))];
  const cmpSplit = cmpMarks.length > 1;
  const cmp = cmpMarks.length === 1 ? cmpMarks[0] : null;
  /** The distinct statement dates behind a split mark, for the reason line. */
  const cmpDates = [...new Set(rows.filter((r) => r.currentPrice != null)
    .map((r) => accIdx.get(r.accountId)?.asOf).filter(Boolean) as string[])].sort();
  /**
   * ── THE PRICE TILE: THE MARK, WHAT IT IS, AND TODAY'S MOVE ─────────────────
   *
   * It was two things in two places: a 2xl figure at the header's right with a
   * sentence under it, and a "Change today" tile at the far end of the strip.
   * A price and the day's move on it are one reading, so they are one tile —
   * the figure, the move beside it where a live quote carries one, and a short
   * line saying WHICH mark this is. The header's right-hand end is where the
   * tabs sit now, exactly as on Morning CIO.
   *
   * WHY THIS IS FIVE STATES AND NOT TWO. It read `live ? "live" : "no live
   * quote"` once, so a page still loading asserted the security had no live
   * quote while the top bar said "Fetching prices…". A split mark, a holding
   * reported at a total value, a published NAV, a live quote and a statement
   * mark are different facts, and each gets its own line — with the full
   * sentence in the hover, since a tile is not the place for a paragraph.
   *
   * A NAV's move is NOT the tile's delta arrow. It is the scheme's move on its
   * own publication date, against the NAV before it, and an arrow beside a price
   * reads as today's move — the defect the index strip once had, where one
   * session was differenced against itself. It is in the line, with its date.
   */
  const markedRow = rows.find((r) => r.currentPrice != null);
  const markDate = markedRow ? accIdx.get(markedRow.accountId)?.asOf ?? portfolio.asOf : portfolio.asOf;
  const priceNote: { line: string; tip: string } = exited
    ? { line: "no current holding", tip: "This name is fully exited, so no statement marks it today." }
    : cmpSplit
    ? {
        line: `statements do not agree — ${cmpMarks.join(" and ")}`,
        tip: `The statements reporting this holding do not agree on a mark — ${cmpMarks.join(" and ")}, ${
          cmpDates.length > 1 ? `drawn ${cmpDates[0]} to ${cmpDates[cmpDates.length - 1]}` : `all drawn ${cmpDates[0] ?? portfolio.asOf}`
        }. No one price covers them, and a weighted mean of them is a figure no statement printed, so none is shown here. Each is beside its own statement on the Position tab.`,
      }
    : cmp === null
    ? {
        line: "reported at a total value, not a price per unit",
        tip: "No statement marks this holding per unit — it is reported at a total value, so there is no price to show. Its value is on the Position tab.",
      }
    : navMark
    ? {
        line: `AMFI NAV, ${navMark.date}${navMark.changePct == null ? "" : ` · ${navMark.changePct >= 0 ? "+" : ""}${navMark.changePct.toFixed(2)}% on its day`}`,
        tip: `AMFI's published NAV for ${navMark.scheme}, ${navMark.date}. A fund resolves no NSE trading symbol, so this is the industry's own daily NAV rather than an intraday quote — and its move is against the NAV before it, on its own date, not today's.${
          // NO STATEMENT PRICES A DEPOSITORY'S OWN CLOSING UNITS, so the tip
          // says whose count they are rather than implying a statement mark
          // that the NAV replaced.
          rows.some((r) => r.depositoryUnits)
            ? ` ${rows.every((r) => r.depositoryUnits) ? "These units are" : "Some units here are"} a depository's own closing balance, on an account that sent no holding statement, so no statement prices them.`
            : ""}`,
      }
    : live
    ? {
        line: `live${sym ? ` · ${sym}` : ""} · ${money(dayChange, true)} today`,
        tip: `The live price${sym ? ` for ${sym}` : ""}. The day's move is against the previous session's close, and is ${money(dayChange, true)} on this holding.`,
      }
    : assetClass === "Cash"
    ? {
        line: `a balance, as the statement of ${markDate} prints it`,
        tip: `A cash line is a balance, not a traded security, so it has no market price and no live quote. This is the per-unit figure the statement of ${markDate} prints against it.`,
      }
    : fundVehicle
    ? {
        // A FUND WITH NO PUBLISHED DAILY NAV — an AIF, or a scheme AMFI's file
        // did not price. "No NSE symbol" is true of it and beside the point: no
        // fund was ever going to have an intraday quote, so the line says whose
        // NAV this is instead of why a quote is missing.
        line: `the NAV on the statement of ${markDate}`,
        tip: `The NAV the manager struck, as the statement of ${markDate} prints it. A fund resolves no NSE trading symbol, so it never carries a live quote — and this one has no daily NAV in AMFI's published file either.`,
      }
    : (() => {
        // WHY IT IS NOT LIVE, and the causes are different facts: a name with
        // no NSE symbol can NEVER go live, while a symbol whose quote did not
        // arrive is a feed shortfall that may resolve on a refresh. The LINE
        // is a few words so the strip stays one height; the hover says it in
        // full.
        const [short, why] = quotesStatus === "loading" ? ["fetching live price…", "the live price is still being fetched"]
          : !sym ? ["no NSE symbol", "no NSE trading symbol resolves for this security, so it can never carry a live quote"]
          : quotesStatus === "unavailable" ? ["price feed down", "the price feed did not respond"]
          : ["no live quote", `the price feed returned no quote for ${sym}`];
        return {
          line: `statement mark, ${markDate} · ${short}`,
          tip: `The mark the statement of ${markDate} prints — not a live quote, because ${why}.`,
        };
      })();
  const buys = (led?.txns ?? []).filter((t) => t.side === "Buy");
  const firstBought = buys.length ? buys[buys.length - 1].date : null;
  const lastAdded = buys.length ? buys[0].date : null;
  // Null when the long-term cost is unknown — the bar is hidden rather than
  // drawn at zero, which would read as "none of this is long-term".
  const ltPct = ltCost !== null && cost !== null && cost > 0 ? (ltCost / cost) * 100 : null;
  const holdingAsOf = rows[0] ? accIdx.get(rows[0].accountId)?.asOf ?? portfolio.asOf : portfolio.asOf;

  /**
   * THE SECTOR CHIP, on the answer `placed` resolved above. Its three states are
   * distinct: still placing, placed by a named tier, and placed by none — and
   * only the last may say "Unclassified", because the first is not yet an
   * answer at all.
   */
  const sectorChip = (() => {
    // A CASH LINE HAS NO SECTOR. Its statement files it under a "Cash" heading,
    // and that word printed as a sector pill beside the Cash bucket said the
    // same thing twice while claiming a GICS sector nobody assigned.
    if (rows.length > 0 && rows.every((r) => r.assetClass === "Cash")) return null;
    if (fundVehicle) {
      return (
        <span className="text-[11px] text-slate-600" title="A GICS sector is a property of a company. This holding is a wrapper over many of them and no statement here prints a sector for it.">
          no sector — a fund holds many
        </span>
      );
    }
    if (bookSector) {
      return (
        <Pill tone="info">
          <span data-stock-sector="book" title={`${bookSector} — ${SECTOR_FROM.book}${providerSector && providerSector !== bookSector ? ` (printed as "${providerSector}")` : ""}.`}>{bookSector}</span>
        </Pill>
      );
    }
    if (!sectorWanted) {
      const s = rows[0]?.sector;
      return s ? <Pill tone="info"><span data-stock-sector="book">{s}</span></Pill> : null;
    }
    if (exposure.status === "loading") {
      return <span className="text-[11px] text-slate-600" data-stock-sector="loading">placing the sector…</span>;
    }
    if (placed?.from && placed.sector && placed.sector !== UNCLASSIFIED) {
      return (
        <Pill tone="info">
          <span data-stock-sector={placed.from} title={`${placed.sector} — ${SECTOR_FROM[placed.from] ?? ""}. No statement in this book prints a sector for this company.`}>{placed.sector}</span>
        </Pill>
      );
    }
    return (
      <Pill>
        <span data-stock-sector="none" title="No statement in this book prints a sector for this company, no fund this family holds files one against its ISIN, and screener.in places it nowhere this book can join to.">{UNCLASSIFIED}</span>
      </Pill>
    );
  })();

  return (
    <div className="flex flex-col lg:h-full">
      {/* ── THE HEADER: CRUMB, NAME AND TABS, AND WHAT KIND OF HOLDING ──────
          THE CRUMB NAMES THE HOLDING, NOT THE ROUTE. It read "Stock Info" on
          every one of 213 names, which is a description of the page; and the
          three buttons replace "Back to holdings", a hardcoded step to the
          Portfolio Monitor that was wrong for every reader who arrived from
          Sector Composition, a mandate, a drill-down or the movers card.

          THE TABS ARE AT THE RIGHT-HAND END OF THE NAME'S LINE, as on Morning
          CIO, and KEYED `data-stock-tab-key` — a claim about which tabs this
          page offers must not be struck on labels a redesign is free to reword.
          The name is `text-xl`, every other page's headline size, where it was
          `text-2xl` on this page alone. */}
      <div className="mb-3 shrink-0" data-stock-head>
        <PageNav className="mb-2" trail={[{ label: "Portfolio Monitor", to: "/monitor" }, { label: name }]} />
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2" data-stock-headline>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">{name}</h1>
          <div role="tablist" aria-label="Which part of this holding to show" data-stock-tabs
            className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
            {STOCK_TABS.map((v) => (
              <button key={v.key} type="button" role="tab" aria-selected={tab === v.key}
                title={v.title} data-stock-tab-key={v.key}
                onClick={() => setTab(v.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === v.key
                    ? "bg-champagne-500 text-ink-950 shadow-glow"
                    : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"
                }`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* WHERE THIS HOLDING IS FILED, which for everything that is not a
              mandate-held share is still exactly its asset class — a fund's
              chip reads AIF, a cash line's reads Cash, and only a share a
              manager chose now reads the mandate bucket instead of a word that
              claims the family picked it. `bucketLabel` and the monitor's
              section headings come from the same function on purpose. HOW it
              came to be held rides in the same chip's hover (`routeTip`). */}
          {buckets.map(([k]) => (
            <Pill key={k} tone={k === MANDATE_BUCKET || k === DIRECT_EQUITY_BUCKET || k === UNROUTED_EQUITY_BUCKET ? "info" : "core"}>
              <span title={`${k === MANDATE_BUCKET
                ? mandateBucketTip
                : `How the holdings tables group this holding — ${bucketLabel(k)}.`} ${routeTip}`}>{bucketLabel(k)}</span>
            </Pill>
          ))}
          {sectorChip}
          {isin
            ? <span className="mono text-[11px] text-slate-500">{isin}</span>
            : <span className="text-[11px] text-slate-600" title="This provider reports no ISIN for this holding.">no ISIN reported</span>}
          {sym && <span className="mono text-[11px] text-slate-500">{sym}</span>}
          <Pill>{exited ? "Position closed" : `Held in ${held} ${held === 1 ? "entity" : "entities"}`}</Pill>
        </div>
        {/* WHO CHOSE IT, UNDER THE NAME AND ON EVERY TAB. The family read this
            page top-to-bottom once and formed their belief from the chip before
            they reached the table that said a manager chose the share, so the
            mandate is named where the eye lands first — and linked, because "a
            manager chose this" with no way to see WHAT ELSE that manager chose
            is half an answer. One line now, where it was two sentences. */}
        {/* ONE LINE, NOT A PARAGRAPH. A name held under one or two mandates
            links each here; a cash sleeve sits in all ten of this book's
            mandates, and listing ten links under the name was a five-line wall
            above the figures. Beyond two it is a count, and every mandate is
            still one click away — each account row on the Position tab links
            to its own. */}
        {mandates.length > 0 && (
          <p className="mt-1.5 truncate text-[12px] text-slate-400" data-stock-mandates={mandates.length}
            title={mandates.map((m) => `${m.label}${m.label === m.provider ? "" : ` · ${m.provider}`} · ${m.owner}`).join("\n")}>
            <span className="font-medium text-slate-300">Held through {mandates.length === 1 ? "a discretionary mandate" : `${mandates.length} discretionary mandates`}</span>
            {" — "}
            {mandates.length > 2
              ? <span className="text-slate-500">each linked from its row on the Position tab</span>
              : mandates.map((m, i) => (
                <span key={m.accountId}>
                  {i > 0 && "; "}
                  <Link to={`/mandate/${encodeURIComponent(m.accountId)}`} className="text-champagne-400 hover:underline" title="Open the mandate — every holding the manager runs inside it, and the statement it ties to">{m.label}</Link>
                  <span className="text-slate-500">{m.label === m.provider ? "" : ` · ${m.provider}`} · {m.owner}</span>
                </span>
              ))}
          </p>
        )}
      </div>

      {/* ── THE KPI STRIP, THE SAME SIX TILES ON EVERY TAB ─────────────────── */}
      <div className="grid shrink-0 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-stock-strip>
        {/* AN EMPTY COLLECTION IS NOT A ZERO. A name reached from the dated
            ledger that no statement now holds has no rows at all, and summing
            nothing printed "₹0 · 0.0% of book" and "0 held" — a measurement
            nobody made. It is absent with its reason; a holding its fund
            redeemed to nil still HAS rows and keeps its measured zero. */}
        <Kpi label="Holding value"
          value={exited ? <AbsentValue /> : fmtFromBase(mv, { compact: true })}
          sub={exited ? <span className="text-slate-500">no current holding — fully exited</span> : `${weight.toFixed(1)}% of book`}
          icon={<Wallet className="h-4 w-4" />} />
        {/* THE SAME TYPED NOUN, ONE TILE OVER. `/stock/:securityKey` serves every
            holding, so "shares held" was printed under the quantity of an AIF
            folio's units and under a mandate's cash balance. It comes off the
            asset class the row carries, and an unstated class gets the noun that
            claims nothing. */}
        <Kpi label="Quantity"
          value={exited ? <AbsentValue /> : fmtNum(qty)}
          sub={exited ? <span className="text-slate-500">no current holding</span> : qtyNoun}
          icon={<Layers className="h-4 w-4" />} />
        {/* Both of these say WHY when they are absent — see `costWhy`. The dash
            is correct on 60 of this book's positions and it is not the whole
            answer: "invested —" and "on cost" told a reader nothing about
            whether the figure was missing or the page was broken. */}
        <Kpi label="Avg cost"
          value={avgCost === null ? <AbsentValue /> : <span className="mono">{price(avgCost)}</span>}
          sub={cost === null ? <span className="text-slate-500">{costWhy}</span>
            : carried ? <span title={carriedWhy} data-stock-cost-carried={carried.paid}>invested {money(cost)} &middot; as paid, across a class switch</span>
            : `invested ${money(cost)}`}
          icon={<Coins className="h-4 w-4" />} />
        {/* ONE FIGURE OR NONE — never one statement's mark standing for the
            rest. See `cmpMarks` for what the split is and why the tile refuses
            it rather than picking, and `priceNote` for the five states. */}
        <Kpi label={fundVehicle ? "NAV" : "CMP"}
          value={<span className="mono" data-stock-mark={cmpSplit ? "split" : cmp === null ? "none" : "one"}>{cmp ?? <AbsentValue />}</span>}
          delta={live && !cmpSplit ? dayPct : null}
          sub={<span className="text-slate-500" data-stock-mark-note title={priceNote.tip}>{priceNote.line}</span>}
          icon={<Tag className="h-4 w-4" />} />
        <Kpi label="Unrealised P&L"
          value={pnl === null ? <AbsentValue /> : <span className={changeColor(pnl)}>{fmtFromBase(pnl, { compact: true, sign: true })}</span>}
          delta={ret}
          sub={pnl === null ? <span className="text-slate-500">{costWhy}</span>
            // A COMPUTED ZERO KEEPS ITS ZERO, AND ITS REASON GOES IN THE TILE.
            // (Measured: the book's cash rows net to ₹0.11 of paise rounding
            // between the printed cost and value, so "no P&L" would overstate it.)
            : rows.every((r) => r.assetClass === "Cash") ? "a balance — its cost and value are one amount"
            // FIFO — the realised gain on units already sold stays in the
            // return beside it, and the hover says over what.
            : <span title={fifoBasisNote(fifo, (n) => money(n))}>return · FIFO{fifo.realised ? ` · incl. ${money(fifo.realised, true)} realised` : ""}</span>}
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
      </div>

      {/* ── THE PANEL ──────────────────────────────────────────────────────
          ONE TAB'S CONTENT, NEVER TWO. The others are UNMOUNTED rather than
          hidden: `display:none` keeps a node in the DOM but takes it out of
          `innerText`, so every text-struck check would read what it reads now
          while the page still paid to fetch a price history, a research
          document and an insider feed nobody opened.

          `min-h-0` is what makes `flex-1` shrink rather than grow the column
          past the window — without it the panel is as tall as its content and
          the page scrolls again, which is the whole of what was asked. */}
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto" data-stock-panel={tab}>

        {tab === "position" && (
          <div data-stock-section="position">
            {exited ? (
              <Card className="mt-5" title="Position" subtitle="This name is fully exited — no current holding.">
                <p className="text-sm text-slate-400">Realised P&amp;L is in the strip above, and the dated history is on the Transactions tab.</p>
              </Card>
            ) : (
              <Card className="mt-5" title="Position by account" subtitle="How this name is held — the owning entity, who chose the position, and the platform that runs the account" pad={false}>
                <div className="overflow-x-auto">
                  <table className="min-w-full whitespace-nowrap text-sm">
                    <thead className="border-b border-ink-700">
                      <Tr view={posView}>
                        <SortHeader col="entity" view={posView} align="left">Entity</SortHeader>
                        {/* HELD VIA MERGED IN HERE, AND THE COLUMN IS GONE.
                            *"This 'held via' can actually hide… use that space for
                            showing this column in entirety."* WHO CHOSE a position is
                            the distinction Stage 10j and 10L exist for, and the
                            mandate link is the door into the manager's own book, so
                            both ride in this cell. */}
                        <SortHeader col="managedBy" view={posView} align="left">Managed by · held via</SortHeader>
                        <SortHeader col="qty" view={posView}>Qty</SortHeader>
                        <SortHeader col="avgCost" view={posView}>Avg cost</SortHeader>
                        <SortHeader col="cmp" view={posView}
                          title="The per-unit mark this account's own statement prints, on its own report date — not a live quote and not market value divided by quantity. Where two statements report one holding they need not agree: a later statement carries a later price, and two rows of one scheme on one date that disagree are a discrepancy this book reports rather than averages.">CMP</SortHeader>
                        <SortHeader col="invested" view={posView}>Invested</SortHeader>
                        <SortHeader col="current" view={posView}>Market value</SortHeader>
                        <SortHeader col="pnl" view={posView}>Unreal. P&L</SortHeader>
                        <SortHeader col="return" view={posView}
                          title="HPR is the holding-period return — the total on cost from purchase to this statement's date, not annualised. CAGR appears beside it only where a lot register reports the purchase date and the holding is at least a year old; a shorter window is never compounded onto a year. XIRR appears only on a row that is a WHOLE account whose every payment in and out is dated — a fund folio, a drawdown fund — solved over the same record the Transactions card uses; a holding inside an account has no cash flows of its own, so it has none.">Return</SortHeader>
                      </Tr>
                    </thead>
                    <tbody className="divide-y divide-ink-700/60">
                      {posRows.map((r) => {
                      const eng = engagementOf(accIdx, r) || null;
                      const route = holdingRoute(eng);
                      // The account's dated capital where this row IS the whole account
                      // — the XIRR line's only source; undefined on a holding inside one.
                      const rowCap = datedCap?.behind([r], holdingsUniverse) ?? undefined;
                      return (
                        /* COUNTED STRUCTURALLY, NEVER BY LINE. `check:pages` used to
                           count these rows by splitting the table's innerText on
                           newlines, which works only while every cell is one line —
                           and the MANAGED BY cell below carries a strategy sub-line
                           whenever the account prints one. */
                        <Tr view={posView} key={r.accountId} data-account-row={r.accountId} className="hover:bg-ink-700/40">
                          <td className="px-4 py-2.5 font-medium text-slate-100">{ownerOf(accIdx, r)}</td>
                          {/* MAY WRAP. The table is `whitespace-nowrap` so figures
                              never break, and a mandate's printed strategy name
                              ("V.E.C ASSAGO Small and Mid-Cap Growth") pushed the
                              Return column past the card's edge. Names wrap here;
                              figures do not. */}
                          <td className="max-w-[20rem] whitespace-normal px-4 py-2.5 text-[12px] text-slate-400">
                            <div>{providerOf(accIdx, r)}</div>
                            {/* The route reads as a phrase — "via manager's mandate"
                                — because the column header no longer supplies the
                                word. `ROUTE_LABEL` is still the one place those
                                four words are chosen. */}
                            <div className="text-[10px] text-slate-600" data-held-via>
                              {strategyOf(accIdx, r) && !isMandateHeld(eng) && <>{strategyOf(accIdx, r)}{" · "}</>}
                              <span title={`${eng || "engagement not stated"} — ${ROUTE_NOTE[route]}`}>
                                via {ROUTE_LABEL[route]}
                              </span>
                            {/* THE ROW IS THE DOOR INTO THE MANDATE — the only place
                                on the page that can answer "what else is in there"
                                per account, which matters where one name is held
                                under two different mandates. */}
                            {isMandateHeld(eng) && (
                              <>
                                {" · "}
                                <Link to={`/mandate/${encodeURIComponent(r.accountId)}`} className="text-champagne-400 hover:underline"
                                  title="Open this mandate — every holding the manager runs in it, tied to the statement it came from">
                                  {mandateLabel(accIdx.get(r.accountId))}
                                </Link>
                              </>
                            )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right mono text-slate-300">{fmtNum(r.quantity)}</td>
                          <td className="px-4 py-2.5 text-right mono text-slate-400">{r.avgCost === null ? <AbsentCell reason="this provider prints no per-unit cost for the holding" /> : price(r.avgCost)}</td>
                          {/* THE MARK, PER STATEMENT, WITH THE DATE IT WAS STRUCK.
                              The date is the cell's own hover rather than a second
                              column. Guarded before `price()`, which returns a BARE
                              dash — an absence names its cause. */}
                          <td className="px-4 py-2.5 text-right mono text-slate-400" data-cmp={r.currentPrice ?? ""}>
                            {r.currentPrice === null
                              ? <AbsentCell reason="this statement reports the holding at a total value, not a price per unit, so there is no mark to show" />
                              : <span title={r.depositoryUnits
                                  /* NO STATEMENT MARKS THESE UNITS, so the sentence that
                                     says a NAV "replaces" one would be false here. */
                                  ? `${price(r.currentPrice)} — AMFI's published NAV for this scheme as of ${r.navDate}. No statement prices these units: they are the depository's own closing balance of ${r.depositoryUnits.asOf ?? "its statement date"} on an account that sent a transaction statement and no holding statement, and their value is those units at this NAV.`
                                  : r.navPriced
                                  ? `${price(r.currentPrice)} — AMFI's published NAV for this scheme as of ${r.navDate}, which is newer than the ${providerOf(accIdx, r)} statement's own mark and replaces it. Only the value moves: quantity, cost and every dated figure stay as the statement printed them.`
                                  : `Marked at ${price(r.currentPrice)} by the ${providerOf(accIdx, r)} statement${accIdx.get(r.accountId)?.asOf ? ` of ${accIdx.get(r.accountId)!.asOf}` : ""}.`}>
                                  {price(r.currentPrice)}
                                </span>}
                          </td>
                          <td className="px-4 py-2.5 text-right mono text-slate-400"
                            data-cost-carried={r.costBasisSource === "carried-through-switch" ? (r.costBasis ?? undefined) : undefined}
                            data-cost-printed={r.costBasisSource === "carried-through-switch" ? r.printedCostBasis : undefined}>
                            {r.costBasisSource === "carried-through-switch"
                              ? <span title={carriedCostNote(carriedCostOf([r], BOOK_POSITION_TRANCHES)!, (v) => money(v))}>{money(r.costBasis)}</span>
                              : money(r.costBasis)}
                          </td>
                          <td className="px-4 py-2.5 text-right mono text-slate-200">{money(r.marketValue)}</td>
                          <td className={`px-4 py-2.5 text-right mono ${changeColor(r.unrealizedPnL)}`}>{money(r.unrealizedPnL, true)}</td>
                          {/* WHICH RETURN, stated in the cell. `measuredReturn` is
                              the one place the methodology lives (Stage 10af). */}
                          <td className="px-4 py-2.5 text-right mono" data-stock-return
                            data-capital={rowCap ? (rowCap.dated ? "dated" : "undated") : undefined}>
                            <ReturnCells p={r} asOf={portfolio.asOf} capital={rowCap} />
                          </td>
                        </Tr>
                      );
                      })}
                    </tbody>
                    {/* THE FOOTER DRAWS ONLY WHERE THERE IS SOMETHING TO ADD UP. A
                        total of one row is the row again — and on this page the
                        strip above already carries the same four totals — so a
                        one-account holding draws its row and nothing under it.
                        The Polycab table's rule, for the same reason. */}
                    {posRows.length > 1 && (
                    <tfoot className="border-t-2 border-ink-600 font-semibold">
                      <TrFoot view={posView} className="px-4 py-2.5 text-left text-slate-200"
                        label={<>Total</>}
                        cells={{
                          qty: <td key="qty" className="px-4 py-2.5 text-right mono text-slate-300">{fmtNum(qty)}</td>,
                          avgCost: <td key="avgCost" className="px-4 py-2.5 text-right mono text-slate-300">{avgCost === null ? <AbsentCell reason={costWhy} /> : price(avgCost)}</td>,
                          /* A BLENDED AVG COST IS ARITHMETIC; A BLENDED MARK IS AN
                             INVENTION. Cost and quantity both ADD across
                             statements; prices do not. So the footer shows the mark
                             where every statement agrees on one and refuses where
                             they do not — the same resolution the price tile uses,
                             from the same `cmp`, so the two cannot disagree. */
                          cmp: (
                            <td key="cmp" className="px-4 py-2.5 text-right mono text-slate-300">
                              {cmpSplit
                                ? <AbsentCell reason={`the statements reporting this holding do not agree on a mark — ${cmpMarks.join(" and ")}. No one price covers the rows, and a weighted mean of them is a figure no statement printed`} />
                                : cmp === null
                                ? <AbsentCell reason="no statement reports a per-unit price for this holding — it is marked at a total value" />
                                : cmp}
                            </td>
                          ),
                          invested: <td key="invested" className="px-4 py-2.5 text-right mono text-slate-300">{money(cost)}</td>,
                          current: <td key="current" className="px-4 py-2.5 text-right mono text-slate-100">{money(mv)}</td>,
                          pnl: <td key="pnl" className={`px-4 py-2.5 text-right mono ${changeColor(pnl)}`}>{money(pnl, true)}</td>,
                          return: (
                            <td key="return" className={`px-4 py-2.5 text-right mono ${changeColor(ret)}`}
                              title={`The holding-period return across every row above, FIFO — the unrealised gain on what is held and the realised gain on units already sold, over the cost of both. Not annualised: these rows were bought on different dates, so there is no single window to compound over. ${fifoBasisNote(fifo, (n) => money(n))}`}>
                              <span className="ret-tag mr-0.5">HPR</span>{ret === null ? <AbsentCell reason={costWhy} /> : fmtPct(ret, { sign: true, decimals: 1 })}
                            </td>
                          ),
                        }} />
                    </tfoot>
                    )}
                  </table>
                </div>
                {/* CARRY BOTH, COUNT ONCE — and SAY SO where both are on screen.
                    Every row above is a statement as its issuer printed it, so a
                    name reported under two members has two rows; the Total is the
                    consolidated figure, which counts the holding once. */}
                {dupCollapsed > 1 && (
                  <p className="border-t border-ink-700/60 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
                    The rows above add to {money(sum(rows.map((r) => r.marketValue)))}: this is ONE holding, reported on
                    each of the {held} statements listed. Both are shown as printed, and the Total counts it once —
                    {money(mv)}, the same basis as the current value of holdings. Which statement owns it is a question about the
                    family's affairs, not a parsing rule, so neither row is suppressed.
                  </p>
                )}
              </Card>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div data-stock-section="activity">
            {/* ── HOLDING PERIOD & TAX — A CLICK, AS THE FAMILY ASKED ─────────
                *"And then tax maybe just make it a click."* It was a folded card
                under the account table; it is a card on this tab now, where the
                purchase dates it reads come from anyway — the dated buys below.
                The "Weight in book" row it carried is gone: the Holding value
                tile states the same figure on every tab. */}
            {!exited && (
              <Card className="mt-5" title="Holding period & tax"
                subtitle="The long- and short-term cost split, the purchase dates and the dividends recorded for this holding">
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5" data-stock-tax>
                  {([
                    ["Long-term cost", ltCost === null ? <AbsentCell reason="the long/short split needs per-lot purchase dates, and only a lot register carries them — one account in this book issues one" /> : money(ltCost)],
                    ["Short-term cost", stCost === null ? <AbsentCell reason="the long/short split needs per-lot purchase dates, and only a lot register carries them — one account in this book issues one" /> : money(stCost)],
                    /* A purchase date only exists where the statements' window
                       covers the buy. Absent here means "not in this window", not
                       "never bought" — the reason says which. */
                    ["First bought", firstBought ? fmtDate(firstBought) : led === undefined ? "…" : <AbsentCell reason="no purchase in the window the transaction statements cover — this holding predates it" />],
                    ["Last added", lastAdded ? fmtDate(lastAdded) : led === undefined ? "…" : <AbsentCell reason="no purchase in the window the transaction statements cover" />],
                    ["Dividends recorded", div !== null && div > 0 ? money(div) : <AbsentCell reason="no dividend statement in this book records an event in this name" />],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-ink-700 bg-ink-900/60 px-3.5 py-2.5">
                      <div className="label-xs">{label}</div>
                      <div className="mono mt-1 text-[15px] font-semibold text-slate-100">{value}</div>
                    </div>
                  ))}
                </div>
                {/* No lot dates for most of this book, so the split is unknown —
                    say so rather than drawing an empty bar that reads as "all
                    short-term". */}
                {ltPct === null ? (
                  <p className="mt-2.5 text-[11px] text-slate-500">Long-term / short-term split {DASH} no lot dates on the statements for this holding.</p>
                ) : (
                  <>
                    <div className="mt-3 flex h-2.5 overflow-hidden rounded-full border border-ink-700">
                      <div style={{ width: `${ltPct}%`, background: "#10b981" }} />
                      <div style={{ width: `${100 - ltPct}%`, background: "rgba(245,158,11,.5)" }} />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10.5px] text-slate-500">
                      <span>Long-term {ltPct.toFixed(0)}%</span><span>Short-term {(100 - ltPct).toFixed(0)}%</span>
                    </div>
                  </>
                )}
              </Card>
            )}

            {/* OPENING, PLUS, MINUS, CLOSING — read off the depository statement,
                which prints all four. Above the tape deliberately: the family
                asked for the quantity account first and the dated rows second. */}
            <QuantityMovement movements={moves} unmoved={unmoved} accounts={portfolio.accounts}
              held={new Set(rows.map((p) => p.accountId))} />

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
                      <Tr view={txnView}>
                        <SortHeader col="date" view={txnView} align="left">Date</SortHeader>
                        <SortHeader col="type" view={txnView} align="left">Type</SortHeader>
                        <SortHeader col="entity" view={txnView} align="left">Entity</SortHeader>
                        <SortHeader col="qty" view={txnView}>Qty</SortHeader>
                        <SortHeader col="rate" view={txnView}>Rate</SortHeader>
                        <SortHeader col="amount" view={txnView}>Amount</SortHeader>
                      </Tr>
                    </thead>
                    <tbody className="divide-y divide-ink-700/60">
                      {sortRows(led.txns, txnView.sort, {
                        date: (t) => t.date,
                        type: (t) => t.side,
                        entity: (t) => t.account,
                        qty: (t) => t.qty,
                        rate: (t) => t.rate,
                        amount: (t) => t.amount,
                      }).map((t, i) => (
                        <Tr view={txnView} key={i} className="hover:bg-ink-700/40">
                          <td className="px-4 py-2 mono text-[12px] text-slate-400">{fmtDate(t.date)}</td>
                          <td className="px-4 py-2">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${t.side === "Buy" ? "bg-indigo-500/10 text-indigo-300" : "bg-red-500/15 text-loss"}`}>{t.side === "Buy" ? "BUY" : "SELL"}</span>
                          </td>
                          <td className="px-4 py-2 text-[13px] text-slate-300">{t.account}</td>
                          <td className="px-4 py-2 text-right mono text-slate-300">{fmtNum(t.qty)}</td>
                          <td className="px-4 py-2 text-right mono text-slate-400">{price(t.rate)}</td>
                          <td className="px-4 py-2 text-right mono text-slate-200">{fmtFromBase(t.amount, { compact: true })}</td>
                        </Tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          </div>
        )}

        {tab === "market" && (
          <div data-stock-section="market">
            {/* A COMPANY'S PRICE, A SCHEME'S NAV, OR A DECIDED ABSENCE. The
                returns table carries the 52-week high and low as two of its own
                columns, which is why the separate Trading range card that printed
                the same two figures is gone. */}
            {/* …AND, UNDER THE PRICE RETURNS, THE RETURN THAT INCLUDES DIVIDENDS.
                The returns table is headed "excludes dividends"; this card is the
                other half of that sentence — each statement's window with the
                gross dividends declared in it and any split or bonus applied — so
                the two sit together, where a reader comparing a price return with
                a total return already is. It draws nothing for a holding that is
                not a company share. */}
            {!notACompany ? (
              <>
                <ReturnsTable ticker={sym} name={name} />
                <CorporateActionReturns securityKey={securityKey} />
              </>
            ) : schemeHalves ? (
              <FundLookthrough part="nav" securityKey={securityKey} name={name} holdingValue={mv} asOfHolding={holdingAsOf} />
            ) : (
              <Card className="mt-5" title={`Price history & returns — not applicable to ${notACompanyLabel}`}>
                <AbsentSection
                  what={`No market price for ${notACompanyLabel}`}
                  needs={assetClass === "Cash"
                    ? "A cash line is a balance, not a priced security, so there is no price history to chart and no returns series to measure. Its value is the one its statement prints, on the Position tab."
                    : "An AIF folio is not traded on an exchange and publishes no daily NAV — its manager strikes a NAV and the statement prints it. So there is no price history to chart and no returns series to measure here; the value and the date it was struck are on the Position tab."} />
              </Card>
            )}
          </div>
        )}

        {tab === "research" && (
          <div data-stock-section="research">
            {!notACompany ? (
              <ResearchPanel ticker={sym} name={name} />
            ) : (
              <>
                {/* WHAT THE FUND HOLDS — the look-through, where a disclosure
                    resolves. It answers the question the card below has to refuse
                    for a company-shaped page: "what am I holding through this". */}
                {lookThroughHoldings && (
                  <FundLookthrough part="holdings" securityKey={securityKey} name={name} holdingValue={mv} asOfHolding={holdingAsOf} />
                )}
                {/* ONE SHORT CARD, BY DECISION. A fund or a balance has no PE, no
                    balance sheet, no concall and no insider filing — absent
                    because of what the holding IS, never because a feed is down,
                    and said once rather than as five empty panels.

                    `data-stock-class` is the class a READER is told, which for a
                    liquid or arbitrage fund is Cash whatever wrapper its statement
                    typed it as — the family's instruction. */}
                <Card className="mt-5" title={`Company research — not applicable to ${cashFund ? "a cash-equivalent fund" : notACompanyLabel}`}>
                  <p className="text-[12.5px] leading-relaxed text-slate-400" data-stock-research-na={fundVehicle ? "fund" : "balance"}
                    data-stock-class={cashFund ? "Cash" : assetClass ?? ""}>
                    {fundVehicle
                      ? <>{cashFund
                          ? <>This holding is <span className="font-medium text-slate-300">Cash</span> — {arbitrage ? "an arbitrage" : "a liquid"} fund,
                            which the family counts as cash and nothing else; one line standing for a portfolio its manager
                            assembles, not a share in a company — so there is no PE, balance sheet, concall or insider filing for it.</>
                          : <>This is {notACompanyLabel} — one line standing for a portfolio its manager assembles, not a share
                            in a company — so there is no PE, balance sheet, concall or insider filing for it.</>}{" "}
                        {arbitrage
                          ? <>An arbitrage fund discloses its portfolio monthly like any mutual fund, and it is deliberately
                            not drawn here: that portfolio is long shares hedged by short futures, so reading it as the
                            family&rsquo;s exposure to those companies would print stock they do not carry. Its value is
                            counted whole, as cash.</>
                          : lookThroughHoldings
                          ? <>What the scheme holds is shown above, from the AMC&rsquo;s own monthly disclosure; the
                            fund&rsquo;s value stays whole in every total.</>
                          : <>An AIF publishes no monthly portfolio (SEBI requires one from a mutual fund, not from a
                            Category II or III alternative fund), so no statement names the companies inside it and the
                            fund&rsquo;s value stays whole.</>}</>
                      : <>This is a balance, not a share in a company, so there is no PE, balance sheet, concall or insider
                        filing for it.</>}
                  </p>
                </Card>
              </>
            )}
          </div>
        )}

        {tab === "targets" && (
          <div data-stock-section="targets">
            {/* The family's OWN judgements — a target price or a review date is as
                meaningful against a fund as against a company — so this tab is
                the same for every holding. */}
            <InvestmentTools
              securityKey={securityKey}
              name={name}
              price={rows[0]?.currentPrice ?? null}
              priceIsLive={live}
            />
          </div>
        )}
      </div>
    </div>
  );
}
