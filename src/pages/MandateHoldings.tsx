import { useNavigationState } from "@/lib/useNavigationState";
import { useTableExportFilter, useTableExportExpansion } from "@/lib/tableExportSnapshot";
import { ExportableTable } from "@/components/ExportableTable";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Wallet, Coins, TrendingUp, Layers, Percent } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { investedReconciliation } from "@/lib/mandateCapital";
import { SearchInput } from "@/components/SearchInput";
import { AbsentValue, AbsentCell, AbsentSection } from "@/components/Absent";
import { PageNav } from "@/components/PageNav";
import { usePortfolio } from "@/context/PortfolioContext";
import { OutOfScope } from "@/components/MemberScopeSelect";
import { sum, sumOrNull, holdingRoute, holdingBucket, bucketLabel, ROUTE_LABEL, ROUTE_NOTE, MANDATE_BUCKET, DIRECT_EQUITY_BUCKET, readerClassOf, isCompanyShare, NO_UNIT_COUNT, currentHoldings, mandateLabel } from "@/lib/analytics";
import { splitFundClass } from "../../shared/securityKey.mjs";
import { companySectorIndex } from "@/lib/lookthrough";
import { useStockExposure } from "@/lib/useStockExposure";
import { UNCLASSIFIED as UNCLASSIFIED_SECTOR } from "@/lib/sectors";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { stockHref } from "@/lib/auditFormulas";
import { loadTransactions, type Txn } from "@/lib/ledger";
import { rollup, acctKey, realisedAbsence, realisedCoverageNote, STAGGERED_MIN } from "@/lib/txnRollup";
import { capitalRollup, capitalMovesWithCalls, capitalReturn } from "@/lib/tranches";
import { fifoTotals, fifoBasisNote } from "@/lib/fifo";
import { BOOK_CAPITAL_MOVES, BOOK_POSITION_TRANCHES, BOOK_COMMITMENTS, BOOK_CAPITAL_FROM_INCEPTION, BOOK_ACCOUNTS, BOOK_REVIEW_FLOWS } from "@/data/glowData";
/** How many accounts publish a dated capital record — COUNTED, never typed (it read "Eleven" for a book carrying more). */
const DATED_ACCOUNTS = new Set(BOOK_CAPITAL_MOVES.map((m) => m.accountId)).size;
import { fmtCurrency, fmtNum, fmtPct, fmtDate, changeColor } from "@/lib/format";
import type { Account, Position } from "@/lib/types";
import { investedOnOf, lineUndatedReason, accountInvestedOn } from "@/lib/investedOn";
import { InvestedOnCell } from "@/components/InvestedOnCell";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";
import { withReviewAccessors } from "@/lib/reviewColumns";

/**
 * ONE DISCRETIONARY MANDATE, AND EVERY SHARE THE MANAGER HOLDS INSIDE IT.
 *
 * This is the page the family asked for, three times. They opened Jammu Kashmir
 * Bank, read that it was equity, saw two lines down that Carnelian manages it,
 * and said what they had meant all along: *a stock held through a PMS should be
 * shown inside that mandate's drill-down, and Direct Equity should mean shares
 * held directly.* The first two rounds answered with a better WORD. This is the
 * GROUPING they were asking for — and it is the reason the word "Direct Equity"
 * can go back on the holdings table without lying: the mandate-held shares are
 * no longer under it, they are here.
 *
 * §5 does not move. A PMS is an ENGAGEMENT, not an asset class; every row below
 * is still `assetClass: "Equity"` in the model, still carries its GICS sector,
 * still has an NSE symbol and a concall, and Sector Composition, Exposure & IPS,
 * Compare and the market-cap bands still count it (`isCompanyShare`). A
 * look-through into a mandate is a GAIN for exposure analysis; what changes is
 * only where a HOLDINGS TABLE files the row.
 *
 * THE CASH SLEEVE IS ON THIS PAGE ON PURPOSE. The Carnelian mandate is worth
 * what its statement says it is worth — shares AND the cash the manager is
 * holding back — so bucketing the cash somewhere else would make this page
 * disagree with the document it came from. Carrying it is what gives the footer
 * a figure that ties to an account total, which is the check that keeps the
 * whole regrouping honest: if the rows below do not add to what the manager
 * printed, something has been moved that should not have been.
 */

// ── Which document sourced these holdings ────────────────────────────────────
// A docKey of `<accountId>-<asOf>-appraisal` is right for the seven mandates
// whose manager issues a PORTFOLIO APPRAISAL and WRONG for the three who do not:
// SVAN and Green Lantern publish the SEBI investor report, Molecule a CURRENT
// PORTFOLIO. (The deep-links that used this are gone — see Auditable.tsx — but
// the resolution below still names the right document, which is what the printed
// total beneath the table is read from.) A file key the manifest does not carry leaves
// Data Audit showing whichever statement was already open, which is exactly how
// a reader ends up reading another account's document believing it is the one
// they clicked. So the key is RESOLVED against the archive's own manifest, in
// the same precedence order `src/lib/ledger.ts` reads holdings in, and a
// manifest that does not answer falls back to the archive index with this
// account's number pre-filled — never to a guess.
const HOLDINGS_REPORTS = ["appraisal", "investor-report", "holdings", "unknown"] as const;

type ManifestRow = { docKey: string; provider: string; accountNo: string; asOf: string; reportType: string };

/**
 * AND THE DOCUMENT'S OWN TWO TOTALS COME BACK WITH THE KEY, BECAUSE THIS PAGE
 * INVITES A READER TO GO AND CHECK.
 *
 * The tie-out sentence under the table used to call the book's sum "this
 * account's own statement total, as <manager> printed it" — and that is not
 * what it is. Every one of these managers prints an INCOME-INCLUSIVE portfolio
 * total (§4b), so the printed figure is HIGHER than the sum of the rows on all
 * ten mandates: Goldstandard 100023 prints ₹18,83,21,031.19 where the book
 * carries ₹18,79,95,881.19. A reader who does exactly what the sentence invites
 * — click through to the appraisal — finds a different number and nothing on
 * screen explaining it, which is rule 4 run backwards: a printed value re-
 * asserted as this book's source.
 *
 * So both figures are read off the winning document and BOTH are printed. The
 * difference is NAMED as accrued income only where that document's own accrued
 * column reproduces it, which is the reconciler's discipline rather than a
 * plausible-sounding cause typed in here — on Molecule's CURRENT PORTFOLIO it
 * does NOT reproduce it (the ₹21,451.35 is that statement's outstanding
 * dividend), and the page says the difference is not attributed here instead of
 * asserting the wrong reason.
 */
type DocTotals = {
  /** What the MANAGER printed as this account's portfolio total. `null` where the document prints none. */
  printedTotal: number | null;
  /** The same document's derived total — price × quantity — which is the basis the book carries. */
  derivedTotal: number | null;
  /** That document's own accrued-income column, summed over the rows both totals are struck on. */
  accruedIncome: number | null;
};

type HoldingsSource = DocTotals & {
  /** `undefined` = still loading · `null` = the archive did not respond · `""` = no holdings document. */
  docKey: string | null | undefined;
  /** The key resolved and its `document.json` did not — an absence with its own cause. */
  docUnreadable: boolean;
  /** The document has been asked for and has not answered yet. Not an absence. */
  docLoading: boolean;
};

const fin = (n: unknown): number | null => (typeof n === "number" && Number.isFinite(n) ? n : null);

/**
 * The FIRST CLAUSE of a reason — what stays on screen under the capital table,
 * with the whole sentence as its hover. These reasons are written clause-first
 * ("the fund's statement prints no distribution line, so what has come back…"),
 * so cutting at the first "; ", ", so " or " — " keeps the cause and drops the
 * consequence. Display only: the reason itself is never shortened.
 */
const firstClause = (s: string) => s.split(/; |, so | — /)[0];

/**
 * EACH ACCOUNT'S HOLDINGS DOCUMENT AND ITS OWN TOTALS — one account on its own
 * page, or every account of a strategy run for several members on the
 * strategy's page, each resolved and read exactly as the one was.
 */
function useHoldingsSources(accounts: readonly Account[]): Map<string, HoldingsSource> {
  const [rows, setRows] = useState<ManifestRow[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}audit/manifest.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((m: ManifestRow[]) => { if (alive) setRows(Array.isArray(m) ? m : null); })
      .catch(() => { if (alive) setRows(null); });
    return () => { alive = false; };
  }, []);

  const ids = accounts.map((a) => `${a.accountId}\u0000${a.provider}\u0000${a.accountNo}`).join("\u0001");
  const docKeys = useMemo(() => {
    const out = new Map<string, string | null | undefined>();
    for (const account of accounts) {
      if (rows === undefined || rows === null) { out.set(account.accountId, rows === undefined ? undefined : null); continue; }
      const mine = rows.filter((d) => d.provider === account.provider && d.accountNo === account.accountNo);
      const type = HOLDINGS_REPORTS.find((t) => mine.some((d) => d.reportType === t));
      if (!type) { out.set(account.accountId, ""); continue; }
      // A SNAPSHOT SUPERSEDES: the newest issue of the winning type is the one the
      // book was built from, so it is the one to link at.
      const best = mine.filter((d) => d.reportType === type).reduce((a, d) => (d.asOf > a.asOf ? d : a));
      out.set(account.accountId, best.docKey);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ids]);

  const wanted = [...new Set([...docKeys.values()].filter((k): k is string => !!k))].sort().join("\u0001");
  const [docs, setDocs] = useState<Map<string, DocTotals | null>>(() => new Map());
  useEffect(() => {
    const keys = wanted ? wanted.split("\u0001") : [];
    if (!keys.length) return;
    let alive = true;
    for (const docKey of keys) {
      fetch(`${import.meta.env.BASE_URL}audit/${docKey}/document.json`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d: { totals?: { totalMarketValue?: number | null } | null;
                    derivedPortfolioTotal?: number | null;
                    holdings?: { accruedIncome?: number | null }[] | null }) => {
          if (!alive) return;
          setDocs((prev) => new Map(prev).set(docKey, {
            printedTotal: fin(d?.totals?.totalMarketValue),
            derivedTotal: fin(d?.derivedPortfolioTotal),
            // sumOrNull, never sum: a document whose rows report no accrued income
            // must leave this `null`, so the difference below stays unattributed
            // rather than being explained by a zero nobody measured.
            accruedIncome: sumOrNull((d?.holdings ?? []).map((h) => fin(h?.accruedIncome))),
          }));
        })
        .catch(() => { if (alive) setDocs((prev) => new Map(prev).set(docKey, null)); });
    }
    return () => { alive = false; };
  }, [wanted]);

  return useMemo(() => {
    const out = new Map<string, HoldingsSource>();
    for (const [accountId, docKey] of docKeys) {
      const doc = docKey ? docs.get(docKey) : undefined;
      out.set(accountId, {
        docKey,
        printedTotal: doc?.printedTotal ?? null,
        derivedTotal: doc?.derivedTotal ?? null,
        accruedIncome: doc?.accruedIncome ?? null,
        docUnreadable: doc === null,
        docLoading: !!docKey && doc === undefined,
      });
    }
    return out;
  }, [docKeys, docs]);
}

const NO_SOURCE: HoldingsSource = {
  docKey: undefined, printedTotal: null, derivedTotal: null, accruedIncome: null, docUnreadable: false, docLoading: false,
};

function useHoldingsSource(account: Account | undefined): HoldingsSource {
  const one = useMemo(() => (account ? [account] : []), [account]);
  const all = useHoldingsSources(one);
  return (account && all.get(account.accountId)) || NO_SOURCE;
}

/**
 * THE MANAGER'S OWN PRINTED TOTAL BESIDE THE BOOK'S SUM, in words — the hover
 * on a Statement total. One account's sentences, so a strategy's page can name
 * each of its accounts' in turn.
 */
function printedTotalNotes(source: HoldingsSource, stmtMV: number | null, full: (n: number | null | undefined) => string, who = "this account"): string[] {
  const printedTotal = source.printedTotal;
  const printedGap = printedTotal !== null && stmtMV !== null ? printedTotal - stmtMV : null;
  const gapIsAccrual = printedGap !== null && source.accruedIncome !== null
    && Math.abs(printedGap - source.accruedIncome) <= 1;
  return [
    printedGap !== null
      ? Math.abs(printedGap) < 1
        ? `That document prints ${full(printedTotal)} as ${who}'s portfolio total, which is the same figure to the rupee.`
        : `That document prints ${full(printedTotal)} as ${who}'s portfolio total — ${full(Math.abs(printedGap))} ${printedGap > 0 ? "higher" : "lower"}${gapIsAccrual
          ? ", because the manager totals an income-inclusive basis: the accrued income that document's rows carry in a column of their own is folded into that figure and not into this one. Reproduced from that same accrued column to the rupee, not assumed."
          : ". What separates the two bases is not derivable from that document here, so this page does not name it — the extraction reconciliation is where that difference is classified."}`
      : "",
    source.docLoading ? "The manager's own printed total is still being read from the archive." : "",
    source.docUnreadable ? "The archive answered with the manifest but not with that document, so the manager's own printed total is not shown here — the figure is the book's sum of the rows above either way." : "",
    !source.docLoading && !source.docUnreadable && !!source.docKey && printedTotal === null
      ? "That document prints no portfolio total of its own, so there is nothing on it to check this sum against but the rows, which are the rows above." : "",
    source.docKey === null ? "The archive did not respond, so the manager's own printed total could not be read." : "",
    source.docKey === "" ? `No holdings document for ${who} is in the archive manifest.` : "",
  ].filter(Boolean);
}

/**
 * ONE ACCOUNT'S ROWS, BUCKETED THE WAY THE HOLDINGS TABLES BUCKET THEM.
 *
 * `holdingBucket` is the one place that decides which heading a row sits under,
 * and the engagement it reads comes from the ACCOUNT — never from the position,
 * which is what would let two rows of one account land in two buckets. Sorted
 * by value so the largest thing the account holds is named first.
 */
function bucketsOf(rows: Position[], engagement: string | null | undefined) {
  const m = new Map<string, { key: string; count: number; mv: number }>();
  for (const r of rows) {
    const key = holdingBucket(r, engagement);
    const e = m.get(key) ?? { key, count: 0, mv: 0 };
    e.count += 1;
    e.mv += r.marketValue;
    m.set(key, e);
  }
  return [...m.values()].sort((a, b) => b.mv - a.mv);
}

/**
 * Each table's columns in DECLARED order — the order their cells are written
 * in below, which is what `<Tr>` permutes from. The first is the row's SUBJECT
 * and never moves (see `src/lib/tableView.ts`).
 */
const MANDATE_COLS = ["security", "sector", "qty", "avgCost", "invested", "investedOn", "cmp", "mv", "weight", "pnl"] as const;
const CAPITAL_COLS = ["date", "type", "in", "out", "units", "security"] as const;
/**
 * The family's own dated record AND the drawdown funds' own dated calls — the
 * same list the Transactions table reads, so a fund's page and that table
 * cannot disagree about what was paid in and when. See `capitalMovesWithCalls`.
 */
const CAPITAL_RECORD = capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, BOOK_ACCOUNTS, BOOK_REVIEW_FLOWS);
const TRADE_COLS = ["security", "trades", "bought", "sold", "realized", "period"] as const;

export function MandateHoldings() {
  const { accountId = "" } = useParams();
  const { portfolio, consolidated, statementPortfolio, basis, fmtFromBase, convertFromBase, displayCurrency, quotesStatus, scope } = usePortfolio();
  const [qFilter, setQ] = useNavigationState<string>("strategy-search", "");
  const q = useTableExportFilter(qFilter, "");

  const accIdx = useMemo(() => accountIndex(portfolio?.accounts ?? []), [portfolio]);
  const account = accIdx.get(accountId);
  /**
   * PER-ACCOUNT, SO NEVER DEDUPED. `usePortfolio().consolidated` counts each
   * `dedupeGroup` once, which is right for a book-wide total and wrong here:
   * this page answers "what does THIS statement carry", and collapsing a row
   * reported under two members would empty an account of a holding it prints.
   * No mandate in this drop carries a duplicate, which is precisely when the
   * mistake is invisible — see `dedupedPositions`, correct and uncalled for a
   * drop and a half.
   */
  const rows = useMemo<Position[]>(
    () => (portfolio ? portfolio.positions.filter((p) => p.accountId === accountId) : []),
    [portfolio, accountId],
  );
  const source = useHoldingsSource(account);
  // ABOVE THE EARLY RETURNS — this page has three (no account, not a mandate,
  // no rows), and a hook that runs on some of them and not others is a
  // hooks-order error rather than a conditional table.
  const holdingsView = useTableView("mandate-holdings", MANDATE_COLS, { reviewKind: "holding" });
  /**
   * ONE SECTOR PER COMPANY, THE ONE SECTOR COMPOSITION GIVES IT (DSM-C9).
   *
   * The Sector column read `r.sector` — the statement's own, and nothing else.
   * A manager's appraisal prints one for most of its shares, and every name it
   * does not print one for read "Unclassified" here while Sector Composition,
   * the Portfolio Monitor, Family & Entities and the company page placed the
   * same company through the shared three tiers: the statement, then a fund's
   * SEBI filing joined on the ISIN, then screener.in joined on the NSE symbol.
   * `companySectorIndex` is that classification, built over every company share
   * exactly as those pages build it — a company's sector does not depend on
   * which account a reader opened.
   *
   * THE FUND TIER IS NOT LOADED HERE, and that costs nothing: for every company
   * share this book holds, the filings place no sector the statement and
   * screener.in do not already place, which `monitorSectors.test.ts` measures
   * and fails on the day a drop brings one. This page asks no fund question, so
   * it does not pay for 21 fetches to be told nothing new.
   */
  const exposure = useStockExposure(consolidated, false);
  const companySectors = useMemo(
    () => companySectorIndex(consolidated.filter(isCompanyShare), exposure),
    [consolidated, exposure],
  );
  const sectorOf = (r: Position) =>
    isCompanyShare(r) ? companySectors.get(r.securityKey)?.sector || UNCLASSIFIED_SECTOR : r.sector;

  const mv = sum(rows.map((r) => r.marketValue));
  // sumOrNull, not sum: a mandate whose statement reports no cost on some row
  // must render `—`, never a total that silently treats the gap as zero and
  // drags the return towards a number nobody measured.
  const cost = sumOrNull(rows.map((r) => r.costBasis));
  const pnl = sumOrNull(rows.map((r) => r.unrealizedPnL));
  const noCost = rows.filter((r) => r.costBasis === null).length;
  /**
   * THE MANDATE'S RETURN, FIFO — and on the WHOLE mandate that is its capital.
   *
   * This read `unrealised ÷ cost of the shares held`, which leaves out every
   * gain the manager has already taken: V.E.C 128004 read 8.42% on its
   * surviving shares where its own since-inception record — ₹1.05 Cr realised,
   * ₹50.5 L unrealised, income less fees, on ₹5 Cr paid in — says 30.10%.
   * `fifoTotals` over every holding of the account, measured against the same
   * account's own rows, strikes it on the capital the statement states.
   */
  const fifo = useMemo(
    () => fifoTotals(rows, { accounts: portfolio?.accounts ?? [], universe: rows }),
    [rows, portfolio],
  );
  const ret = fifo.returnPct;
  /** The cost held, tied to paid in − taken out + realised — or null. */
  const reconcile = investedReconciliation({
    costHeld: cost, uncostedRows: noCost, capital: account?.capital ?? null,
    realised: fifo.realised ?? null, wholeMandate: fifo.wholeMandates.length > 0,
  });
  /**
   * THE ACCOUNT'S OWN ROWS, SUMMED ON THE BOOK'S DERIVED BASIS — and that is the
   * whole of what this figure is. It is NOT the manager's printed total, which
   * is a separate number read off the document itself (`source.printedTotal`)
   * and is higher on every mandate in this drop because these reports total an
   * income-inclusive basis their own market-value column excludes (§4b).
   *
   * It is taken from `statementPortfolio` — the book the live feed never
   * touches. On STATEMENT basis it is the same figure as `mv` above; on LIVE
   * basis `mv` has moved and this has not, and the caption below says so rather
   * than letting a marked-to-market number sit under a sentence claiming it ties
   * to a document.
   */
  const stmtMV = useMemo(
    () => (statementPortfolio
      ? sum(statementPortfolio.positions.filter((p) => p.accountId === accountId).map((p) => p.marketValue))
      : null),
    [statementPortfolio, accountId],
  );

  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  /**
   * TO THE RUPEE, for the tie-out sentence alone. A compact ₹18.80 Cr cannot
   * show a ₹3,25,150 basis difference at all — both figures round to the same
   * label — so the one place this page asks a reader to compare two totals
   * prints them at the precision the comparison needs.
   */
  const full = (n: number | null | undefined) => fmtFromBase(n, { compact: false });
  const price = (n: number | null | undefined) =>
    (typeof n === "number" && Number.isFinite(n) ? fmtCurrency(convertFromBase(n), displayCurrency) : null);
  /**
   * ONE STRATEGY, ONE PAGE, WHOEVER HOLDS IT.
   *
   *   *"VEC main heading needs to have hyperlink that will open a single drill
   *    down page for all the transactions and different family entities as
   *    well, we do not need to make separate drill down page for separate
   *    entities."*
   *
   * The accounts the Portfolio Monitor draws as this strategy's one row (Stage
   * 10dn): the same manager and the same strategy, each holding something
   * today. Two or more of them and the address of any one opens the page for
   * all of them; an account alone keeps the page below.
   */
  const strategy = useMemo<Account[]>(() => {
    if (!portfolio || !account || holdingRoute(account.engagement) !== "mandate") return [];
    const held = new Set(currentHoldings(portfolio.positions).map((p) => p.accountId));
    if (!held.has(account.accountId)) return [];
    return portfolio.accounts.filter((a) => held.has(a.accountId) && holdingRoute(a.engagement) === "mandate"
      && a.provider === account.provider && mandateLabel(a) === mandateLabel(account));
  }, [portfolio, account]);

  if (!portfolio) return null;

  // ── The account is in the book, and the member scope leaves it out ──────────
  // "No account in this book" would be false: the book carries it. What is true
  // is that the members chosen at the top of the page do not include its owner.
  const outOfScope = !account && scope.selected ? BOOK_ACCOUNTS.find((a) => a.accountId === accountId) : undefined;
  if (outOfScope) {
    const name = outOfScope.strategy || `${outOfScope.provider} ${outOfScope.accountNo}`;
    return (
      <div>
        <PageNav className="mb-2" trail={[{ label: "Portfolio Monitor", to: "/monitor" }, { label: name }]} />
        <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-slate-100">{name}</h1>
        <Card>
          <OutOfScope what={`${outOfScope.provider} ${outOfScope.accountNo}`} ownerIds={outOfScope.ownerId ? [outOfScope.ownerId] : []} />
        </Card>
      </div>
    );
  }

  // ── The address does not name an account in this book ──────────────────────
  if (!account) {
    const mandates = portfolio.accounts.filter((a) => holdingRoute(a.engagement) === "mandate");
    return (
      <div>
        <PageNav className="mb-2" trail={[{ label: "Portfolio Monitor", to: "/monitor" }, { label: "Mandate not found" }]} />
        <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-slate-100">Mandate not found</h1>
        <Card>
          <AbsentSection
            what={`No account "${accountId}" in this book`}
            needs="This address names an account the current book does not carry. It may belong to a statement that has not been ingested, or to a drop this book was rebuilt without. The mandates it does carry are listed below."
          />
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {mandates.map((a) => (
              <li key={a.accountId} className="text-[12.5px]">
                <Link to={`/mandate/${encodeURIComponent(a.accountId)}`} className="text-champagne-400 hover:underline">
                  {a.strategy || `${a.provider} ${a.accountNo}`}
                </Link>
                <span className="text-slate-500"> · {a.provider} {a.accountNo}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  if (strategy.length > 1) return <HeldByMany kind="mandate" name={mandateLabel(account)} provider={account.provider} accounts={strategy} />;

  const route = holdingRoute(account.engagement);
  const ownerName = account.ownerId ? ownerDisplayName(account.ownerId) : account.owner;
  // WHAT THIS ACCOUNT IS CALLED, once: the heading and the crumb both print it,
  // and two copies of the fallback would be two chances for one screen to name
  // the same account two ways.
  const mandateName = account.strategy || `${account.provider} ${account.accountNo}`;
  /**
   * The account's own rows grouped exactly as a holdings table groups them, for
   * the non-mandate branches below. Plain arithmetic rather than `useMemo`,
   * because this sits after the page's early returns and a conditional hook is
   * a different bug from the one being fixed.
   */
  const ownBuckets = bucketsOf(rows, account.engagement);
  const ownDirectEquity = ownBuckets.some((b) => b.key === DIRECT_EQUITY_BUCKET);

  // ── The account exists and is not a discretionary mandate ──────────────────
  if (route !== "mandate") {
    return (
      <div>
        <PageNav className="mb-2" trail={[{ label: "Portfolio Monitor", to: "/monitor" }, { label: mandateName }]} />
        <h1 className="mb-1 font-display text-2xl font-bold tracking-tight text-slate-100">{mandateName}</h1>
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-400">
          <span>{account.provider} · {account.accountNo}</span>
          <span className="text-slate-600">·</span>
          <span>{ownerName}</span>
          <Pill tone="core"><span title={ROUTE_NOTE[route]}>{ROUTE_LABEL[route]}</span></Pill>
        </div>
        <Card title={`This account is not a ${MANDATE_BUCKET.slice(0, -1)}`}>
          {route === "fund" ? (
            <>
              {/* THE LOOK-THROUGH DOES NOT EXIST AND MUST NOT BE FAKED. A PMS
                  reports every underlying share, so rolling one up is a real,
                  data-backed rollup. A fund folio reports ONE line. Drawing an
                  empty holdings table here would read as a feed that failed. */}
              {/* TWO SHORT LINES, the reasoning in their hovers — the family
                  asked for the notes around the tables to go (Stage 10ci), and
                  then for every explainer line (Stage 10cp), so each is a few
                  words now. The account is in the line above the card. */}
              <p className="text-[12.5px] leading-relaxed text-slate-400"
                title={`${account.provider} ${account.accountNo} is a fund folio, not a discretionary mandate. Buying into it is one purchase of a manager's portfolio — the family owns units of the fund, not the companies the fund owns.`}>
                A fund folio — no constituent list to show here
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400"
                title="Showing them would need the scheme's own portfolio disclosure joined to this folio, and no statement in this drop carries one for it. So the folio's value stays whole, in its own row, rather than being spread across sectors it was never reported against.">
                Its companies are <span className="font-medium text-slate-300">not reported to this book</span>
              </p>
              {account.noPositionsReason && (
                <p className="mt-2 text-[12px] leading-relaxed text-slate-500" title={account.noPositionsReason}>
                  No valued position in the book
                </p>
              )}
              {/* A LIST OF HOLDINGS, NOT AN EXPLANATION — the one line here the
                  no-explainer sweep excuses, because it is the folio's content. */}
              {rows.length > 0 && (
                <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400" data-prose-ok="holdings">
                  What the statement does carry — {rows.length === 1 ? "one line" : `${rows.length} lines`}, {money(mv)} in
                  all:{" "}
                  {rows.map((r, i) => (
                    <span key={r.securityKey}>
                      {i > 0 && ", "}
                      <Link to={stockHref(r.securityKey)} className="text-champagne-400 hover:underline">{r.security}</Link>
                    </span>
                  ))}.
                </p>
              )}
            </>
          ) : route === "own" ? (
            <>
              {/* WHAT THE ACCOUNT HOLDS, READ OFF ITS OWN ROWS — never asserted
                  from the route. This branch used to say "the shares in it were
                  bought by the family … so they are Direct Equity" for ANY
                  own-route account, without testing a single row's asset class.
                  Three of them hold no share at all — Helios 10355977, Motilal
                  Oswal's Active Momentum 904168868444 and HDFC 16180583 are one
                  or two MUTUAL FUND lines each — so the page told a reader their
                  fund units were Direct Equity, which is the fund-shown-as-
                  equity mislabel the family has now reported three times,
                  reappearing on the page built to answer it. The buckets below
                  are `holdingBucket` on this account's own engagement, which is
                  the same call the holdings tables group by. */}
              <p className="text-[12.5px] leading-relaxed text-slate-400"
                title={`${account.provider} ${account.accountNo} is the family's own account — nothing in it is chosen by a discretionary manager, so there is no mandate to open here.${ownBuckets.length > 0 ? " What it holds is filed on the holdings tables by what each row IS, below." : ""}`}>
                The family&rsquo;s own account — no mandate to open
              </p>
              {ownBuckets.length > 0 ? (
                <ul className="mt-2 grid gap-1 text-[12.5px] text-slate-400">
                  {ownBuckets.map((b) => (
                    <li key={b.key}>
                      <span className="font-medium text-slate-300">{bucketLabel(b.key)}</span> — {b.count}{" "}
                      {b.count === 1 ? "row" : "rows"}, {money(b.mv)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400"
                  title={account.noPositionsReason ?? "So there is no bucket to name for it."}>
                  No valued position in the book
                </p>
              )}
              {ownDirectEquity ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400"
                  title="That is exactly what the heading means on the holdings tables. Any fund unit or ETF listed beside them stays under its own class: buying one is a single purchase of a manager's portfolio, not of the companies inside it.">
                  The {DIRECT_EQUITY_BUCKET} rows are shares the family bought in this account.
                </p>
              ) : rows.length > 0 ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400"
                  title="Each row sits under its own class above, which is where the holdings tables carry it.">
                  None of it is {DIRECT_EQUITY_BUCKET}: no row on this statement is a company share.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-slate-400"
              title={`No statement for ${account.provider} ${account.accountNo} states how the account is run, so this book cannot say whether a manager chooses its holdings. An engagement is read off each statement's own wording and is never defaulted — guessing one here would assert a relationship nobody documented.`}>
              No statement says how this account is run
            </p>
          )}
          <p className="mt-4 text-[12px] text-slate-500">
            {/* `?group=category`, because "carries … in full" is true of the Category view, where every holding is a row — not of All Securities, the Monitor's default since Stage 10cm, where a fund is not. */}
            <Link to="/monitor?group=category" data-monitor-in-full className="text-champagne-400 hover:underline">Portfolio Monitor</Link> carries this
            account in full.
          </p>
        </Card>
        {/*
          NO DEALING CARD ON THIS BRANCH ANY MORE, AND THE REASON IT WAS HERE IS
          WHY IT COULD GO.

          It was added so Buoyant Capital 103473 — an AIF folio, so this branch,
          and the ONE non-mandate account in this book that issues a transaction
          statement — would not have its dealing record hidden behind a routing
          decision about what the account is called. What reached this branch was
          the Transactions card's own link, and that link is gone: seven of its
          ten rows are fund folios, and it invited a reader into a page with
          nothing on it.

          MEASURED BEFORE REMOVING IT: Buoyant is not a row on that card at all
          (it publishes no dated capital record), so this card was never the way
          into its dealing; the Transactions card's Trades table is, and it covers every account
          whose statements the tape reads. The other six fund folios reaching
          this branch report no dealing whatsoever, so the card was an empty box
          for every one of them — which is what the family pointed at.

          The card stays on the MANDATE branch below, where it is reached from
          the holdings tables and where nine accounts actually fill it.
        */}

        {/*
          WHAT THE FAMILY PUT IN *IS* ON THIS BRANCH, AND THE DISTINCTION IS THE
          POINT OF THE PARAGRAPH ABOVE.

          *"Show contribution-wise transactions inside every PMS and AIF
          mandate."* The dealing card came off this branch because a fund folio
          reports no dealing — one purchase of a manager's portfolio is not a
          trading record, and drawing an empty table for it is what the family
          pointed at. The CONTRIBUTION record is the opposite case and is exactly
          what a fund folio does report: measured, EIGHT of this book's eleven
          dated capital records belong to accounts that reach this branch — the
          five Sanshi folios, both Transition Venture trusts and 3P — against
          three on the mandate branch. Leaving it off here would have answered
          the smaller half of the ask.
        */}
        <CapitalIn account={account} />
      </div>
    );
  }

  // ── The mandate itself ─────────────────────────────────────────────────────
  /**
   * ── WHEN, BESIDE HOW MUCH ───────────────────────────────────────────────────
   *
   *   "here, you've given me the amount, but you've not given me the date. Date
   *    is equally important… But invested when? When? Okay. Becomes very
   *    important."
   *
   * TWO SOURCES, STRONGEST FIRST, AND NEITHER IS DERIVED FROM THE OTHER:
   *
   *   • the account's own DATED CONTRIBUTION RECORD — the first payment the
   *     statements put a date against (13 of 51 accounts);
   *   • failing that, the statement's own printed INCEPTION DATE (12 of 51).
   *
   * They are different facts and the label says which, because they can differ:
   * an inception date is when the account opened, a first contribution is when
   * money arrived in it. Printing either under a bare "since" would let a reader
   * take one for the other.
   *
   * AND IT IS NOT THE DATE THE COST WAS INCURRED. The tile above it is the
   * mandate's COST BASIS — what the manager paid for the shares it holds now —
   * and the manager has been trading inside the account since. So the sub-line
   * names what the date IS (funded from / opened) rather than attaching it to
   * the cost figure as though the two were one measurement. The full record is
   * the card below.
   */
  const firstContribution = CAPITAL_RECORD
    .filter((m) => m.accountId === account.accountId && m.direction === "in")
    .map((m) => m.date).sort()[0] ?? null;
  const fundedNote = firstContribution
    ? `funded from ${fmtDate(firstContribution)}`
    : account.inceptionDate ? `account opened ${fmtDate(account.inceptionDate)}`
    : null;
  const fundedWhy = firstContribution
    ? `${account.provider} dates the first payment into this account to ${fmtDate(firstContribution)}. Every contribution it reports is listed in full below — this is the earliest of them, not the date the manager bought what it holds today.`
    : account.inceptionDate
      ? `${account.provider} prints ${fmtDate(account.inceptionDate)} as this account's inception. It does not date the individual payments into it, so this is when the account opened rather than when money arrived in it.`
      : `No statement in this drop dates what was paid into this account, or when it opened.`;

  const shares = rows.filter((r) => r.assetClass === "Equity");
  /**
   * THE CASH SLEEVE IS CASH BY THE FAMILY'S DEFINITION, not by the wrapper a
   * statement typed. A liquid or arbitrage fund a manager parks the sleeve in is
   * cash — "arbitrage funds need not be classified into any other category
   * except for cash" — so it counts here as a cash line, exactly as the
   * holdings tables' Cash section counts one held outside a mandate. On this
   * book every such row inside a mandate is already typed `Cash` by its own
   * statement, so nothing on screen moves; the rule is what keeps the next
   * manager's arbitrage sleeve from being counted as "other".
   */
  const sleeve = rows.filter((r) => readerClassOf(r) === "Cash");
  const other = rows.length - shares.length - sleeve.length;
  /**
   * MEASURED ZEROS, NAMED ON SCREEN RATHER THAN IN A TOOLTIP.
   *
   * A ₹0 in this table is real: a cash sleeve has no gain, and Molecule's
   * `Tax Deducted at Source` line is a nil balance the manager prints. Those are
   * arithmetic, not absences — they keep their zero, and the rule is that the
   * reason goes where a reader scanning the column can see it. Every count is
   * DERIVED from the rows, so a drop where nothing is zero says nothing.
   *
   * AND THE REASON IS DERIVED TOO, WHICH IS WHY THE ZERO-P&L SET IS SPLIT.
   * It was one filter on `unrealizedPnL === 0` under one sentence asserting the
   * cause — "because a cash balance has none". All 14 zero-P&L rows across the
   * ten mandates happen to be `Cash` in this drop, so the sentence is true
   * today and would silently become a fabrication the first time a SHARE closed
   * exactly at cost: a named company's row described to the reader as a cash
   * balance, which is the index-cycled valuation method in miniature. A share
   * at cost is a different measurement and gets its own words.
   */
  const zeroValue = rows.filter((r) => r.marketValue === 0);
  const zeroPnlCash = rows.filter((r) => r.unrealizedPnL === 0 && r.assetClass === "Cash");
  const zeroPnlHeld = rows.filter((r) => r.unrealizedPnL === 0 && r.assetClass !== "Cash");

  /**
   * THE TIE-OUT, AS TWO FIGURES ON TWO BASES RATHER THAN ONE FIGURE WITH TWO
   * CLAIMS ON IT.
   *
   * `stmtMV` is the sum of the rows above. `printedTotal` is what the manager
   * printed on the document those rows came from. They differ on all ten
   * mandates here, and the gap is NAMED as accrued income only where the same
   * document's own accrued column reproduces it — the reconciler's rule, which
   * is to reproduce a basis difference and never to widen a tolerance until it
   * fits. The ₹1 band is the printing precision the reconciliation already
   * classifies as `rounding`, not a licence: V.E.C 128005 lands ₹0.15 out on a
   * ₹20.29 Cr total and Molecule's ₹21,451.35 misses its accrued column by
   * ₹75,968, so the first is named and the second explicitly is not.
   */
  /**
   * AND THE DOCUMENT'S OWN DERIVED TOTAL IS THE CHECK ON THE ROWS THEMSELVES.
   * The book is built from this document, so the two must agree; if they ever
   * stop, the rows above are not that document's rows and the page has to say
   * so rather than print a tie-out that does not hold.
   */
  const derivedGap = source.derivedTotal !== null && stmtMV !== null ? source.derivedTotal - stmtMV : null;

  const term = q.trim().toLowerCase();
  const shown = term
    ? rows.filter((r) => r.security.toLowerCase().includes(term) || (r.isin ?? "").toLowerCase().includes(term))
    : rows;
  // THE DEFAULT IS LARGEST FIRST, and a reader's own ranking replaces it. An
  // absent cost or price sorts LAST either way rather than as a zero, which
  // would rank a holding whose statement prints no cost among the cheapest.
  const sorted = sortRows([...shown].sort((a, b) => b.marketValue - a.marketValue), holdingsView.sort, withReviewAccessors<typeof shown[number]>({
    security: (r) => r.security,
    sector: (r) => (readerClassOf(r) === "Cash" ? null : sectorOf(r)),
    qty: (r) => r.quantity,
    avgCost: (r) => r.avgCost,
    invested: (r) => r.costBasis,
    investedOn: (r) => investedOnOf([r])?.first ?? null,
    cmp: (r) => r.currentPrice,
    mv: (r) => r.marketValue,
    weight: (r) => (mv > 0 ? r.marketValue : null),
    pnl: (r) => r.unrealizedPnL,
  }, (r) => ({ positions: [r] }), scope.owners !== null));
  const hidden = rows.length - shown.length;
  /**
   * A MANDATE WITH NO HOLDING STATEMENT IS NOT A MANDATE HOLDING NOTHING
   * (Stage 10df). Marathon's two accounts sent a capital-gain statement, a
   * dividend statement, a transaction statement and an income-and-expense
   * account — and no holding statement — so nothing in the drop says what they
   * hold or what they are worth. This page summed their no rows and printed ₹0
   * as the value, "0 holdings", and a Statement total of ₹0: a measurement of
   * nothing, which reads as "this mandate is empty". The account's own
   * `noPositionsReason` says why there are no rows, and every figure that would
   * be struck over them is absent with it. A redeemed mandate is the opposite
   * case — it HAS rows, at a measured ₹0 — and keeps its zero.
   */
  const noHoldingStatement = rows.length === 0 && !!account.noPositionsReason;
  const NO_HOLDING_STATEMENT = "no holding statement in this drop";

  return (
    <div>
      {/* THE CRUMB NAMES THE MANDATE, and the three buttons replace "Back to
          holdings" — a hardcoded parent that sent every reader to the Portfolio
          Monitor whether or not that is where they came from. Holdings
          drill-downs, Family & Entities and a company page all link here. */}
      <PageNav className="mb-2" trail={[{ label: "Portfolio Monitor", to: "/monitor" }, { label: mandateName }]} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          {/* The mandate's own name, as the manager prints it. Null on a
              provider that names no strategy — the account then identifies
              itself by manager and number rather than by an invented label. */}
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-100">{mandateName}</h1>
          <div className="mt-1 text-[13px] text-slate-400">
            Run by <span className="font-medium text-slate-300">{account.provider}</span> for{" "}
            <span className="font-medium text-slate-300">{ownerName}</span> · account {account.accountNo}
            {!account.strategy && <span className="text-slate-500"> · this manager's statement names no strategy</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone="core"><span title={ROUTE_NOTE.mandate}>{ROUTE_LABEL.mandate}</span></Pill>
            {/* THE ACCOUNT'S OWN REPORT DATE, not the book's newest. Statements
                arrive per account on their own schedule and `portfolio.asOf` is
                only the latest of them; a mandate page dated by the book would
                claim a currency this document does not have. */}
            {(() => {
              const liveN = rows.filter((r) => r.live).length;
              const other = portfolio.asOf && portfolio.asOf !== account.asOf
                ? ` The book's newest statement, ${fmtDate(portfolio.asOf)}, is another account's; this page is dated by its own.` : "";
              const tip = liveN
                ? `LIVE basis: ${liveN} of ${rows.length} holdings are marked to a live quote now and the rest keep ${account.provider}'s statement mark of ${fmtDate(account.asOf)}. Quantity, cost, realised gains, dividends and cash flows stay exactly as that statement prints them.${other}`
                : `Every figure on this page is as ${account.provider} printed it on ${fmtDate(account.asOf)}${rows.length === 0 ? "" : quotesStatus === "loading" ? " — live prices are still being fetched" : " — no live price reached any of these holdings"}.${other}`;
              return (
                <Pill tone="info">
                  <span title={tip} data-mandate-asof={account.asOf} data-mandate-basis={liveN ? "live" : "statement"}>
                    {liveN ? `LIVE · ${liveN} of ${rows.length} marked now · statement ${fmtDate(account.asOf)}` : `STATEMENT · as of ${fmtDate(account.asOf)}`}
                  </span>
                </Pill>
              );
            })()}
            {account.engagement && <Pill>{account.providerEngagement || account.engagement}</Pill>}
          </div>
        </div>
        <div className="text-right" data-mandate-headline={noHoldingStatement ? "absent" : String(mv)}>
          <div className="font-display text-2xl font-bold tabular text-slate-100">
            {noHoldingStatement ? <AbsentValue /> : money(mv)}
          </div>
          {noHoldingStatement ? (
            <div className="mt-0.5 text-[10.5px] text-slate-500" title={account.noPositionsReason ?? undefined}
              data-mandate-no-holdings>
              No holding statement in this drop
            </div>
          ) : (
            <div className="mt-0.5 text-[10.5px] text-slate-500">
              {rows.length} holdings the manager runs — shares and the cash sleeve
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Market value"
          value={noHoldingStatement ? <AbsentValue /> : money(mv)}
          sub={noHoldingStatement
            ? <span className="text-slate-500" title={account.noPositionsReason ?? undefined}>{NO_HOLDING_STATEMENT}</span>
            : `${shares.length} company shares · ${sleeve.length} cash ${sleeve.length === 1 ? "line" : "lines"}${other ? ` · ${other} other` : ""}`}
          icon={<Wallet className="h-4 w-4" />} />
        <Kpi label="Invested"
          value={cost === null ? <AbsentValue /> : money(cost)}
          sub={<span title={noHoldingStatement ? account.noPositionsReason ?? undefined : fundedWhy}>
            {noHoldingStatement
              ? <span className="text-slate-500">{NO_HOLDING_STATEMENT}</span>
              : cost === null
              ? <span className="text-slate-500">no row on this statement reports a cost</span>
              : noCost
                ? <span className="text-slate-500">cost in · {noCost} of {rows.length} rows report none and are skipped</span>
                : <span>cost of holdings</span>}
            {/* THE DATE, AND ITS ABSENCE IS NAMED RATHER THAN LEFT BLANK — a
                tile that simply stops mentioning when tells a reader nothing
                about whether to go and find the document. */}
            {!noHoldingStatement && (
              <span className="text-slate-500">
                {" · "}{fundedNote ?? "no statement dates what was paid in"}
              </span>
            )}
            {reconcile && (
              <span className="block text-slate-500" data-mandate-invested-reconcile
                data-paid-in={reconcile.paidIn} data-taken-out={reconcile.takenOut} data-realised={reconcile.realised}
                title={`What ${account.provider} holds now cost ${money(reconcile.costHeld)}: the ${money(reconcile.paidIn)} paid in, less the ${money(reconcile.takenOut)} taken out, plus the ${money(reconcile.realised, true)} the manager realised and kept invested — gains on shares sold, and income less fees. The capital card below dates every payment; the Return · FIFO tile is struck on what was paid in.`}>
                = {money(reconcile.paidIn)} paid in{reconcile.takenOut ? <> − {money(reconcile.takenOut)} out</> : null} {reconcile.realised < 0 ? "−" : "+"} {money(Math.abs(reconcile.realised))} realised
              </span>
            )}
          </span>}
          icon={<Coins className="h-4 w-4" />} />
        <Kpi label="Unrealised P&L"
          value={pnl === null ? <AbsentValue /> : <span className={changeColor(pnl)}>{money(pnl, true)}</span>}
          sub={noHoldingStatement
            ? <span className="text-slate-500" title={account.noPositionsReason ?? undefined}>{NO_HOLDING_STATEMENT}</span>
            : pnl === null ? <span className="text-slate-500">needs a cost this statement does not print</span> : "on the shares held now"}
          icon={<TrendingUp className="h-4 w-4" />} />
        {/* FIFO'S RETURN, IN A TILE OF ITS OWN — never as the P&L tile's
            delta, where it read as unrealised ÷ cost and left out every gain
            the manager had already taken. */}
        <Kpi label="Return · FIFO"
          value={ret === null ? <AbsentValue /> : <span className={changeColor(ret)} data-mandate-fifo-return={ret}>{fmtPct(ret, { sign: true })}</span>}
          sub={ret === null
            ? noHoldingStatement
              ? <span className="text-slate-500" title={`${account.noPositionsReason ?? ""} A return needs what the account is worth now, and no statement in this drop says.`.trim()}>{NO_HOLDING_STATEMENT}</span>
              : <span className="text-slate-500">no cost or capital on this statement to measure against</span>
            : <span title={fifoBasisNote(fifo, (n) => money(n))}>
                {fifo.wholeMandates.length && account?.capital
                  ? <>realised {money(fifo.realised, true)} · on {money(account.capital.contributed)} paid in since {fmtDate(account.capital.from)}</>
                  : <>realised {money(fifo.realised ?? 0, true)} · on {money(fifo.deployed)} deployed</>}
              </span>}
          icon={<Percent className="h-4 w-4" />} />
        <Kpi label="Holdings" value={noHoldingStatement ? <AbsentValue /> : fmtNum(rows.length)}
          sub={noHoldingStatement
            ? <span className="text-slate-500" title={account.noPositionsReason ?? undefined}>{NO_HOLDING_STATEMENT}</span>
            : `in one mandate · ${MANDATE_BUCKET}`}
          icon={<Layers className="h-4 w-4" />} />
      </div>

      {noHoldingStatement ? (
        /* NO TABLE, AND NO STATEMENT TOTAL: there is no statement to total.
           An empty table under a "Total ₹0" footer is the measured-zero look
           this account must not have. */
        <Card className="mt-5" title="What the manager holds">
          <div data-mandate-no-holdings-card>
            <AbsentSection
              what={`${account.provider} sent no holding statement for account ${account.accountNo}`}
              needs={account.noPositionsReason ?? ""}
            />
          </div>
        </Card>
      ) : (
      <Card className="mt-5" pad={false}
        title="What the manager holds"
        subtitle={`As ${account.provider} printed it on ${fmtDate(account.asOf)}. Every constituent of this mandate — the shares the manager chose and the cash it is holding back. Weight is within this mandate, not within the book.`}
        right={<SearchInput value={q} onChange={setQ} placeholder="Filter by name or ISIN…" className="w-56"
          suggestions={rows.map((r) => r.security)} />}>
        <div className="overflow-x-auto" data-navigation-scroll="mandateholdings-1">
          <ExportableTable className="min-w-full whitespace-nowrap text-sm">
            <thead className="border-b border-ink-700">
              <Tr view={holdingsView}>
                <SortHeader col="security" view={holdingsView} align="left">Security</SortHeader>
                <SortHeader col="sector" view={holdingsView} align="left">Sector</SortHeader>
                <SortHeader col="qty" view={holdingsView}>Qty</SortHeader>
                <SortHeader col="avgCost" view={holdingsView}>Avg cost</SortHeader>
                <SortHeader col="invested" view={holdingsView}>Invested</SortHeader>
                <SortHeader col="investedOn" view={holdingsView} align="left"
                  title="When the units this share holds were bought: the account's own dated trades where they account for every unit held, matched first-in, first-out, or a lot register's acquisition dates. The Portfolio Monitor's holdings open each share into its dated trades.">Invested on</SortHeader>
                <SortHeader col="cmp" view={holdingsView}>CMP</SortHeader>
                <SortHeader col="mv" view={holdingsView}>Market value</SortHeader>
                <SortHeader col="weight" view={holdingsView}>Weight</SortHeader>
                <SortHeader col="pnl" view={holdingsView}>Unreal. P&L</SortHeader>
              </Tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {sorted.map((r) => {
                const isCash = readerClassOf(r) === "Cash";
                // A BALANCE and a cash-equivalent FUND are both cash and are not
                // the same thing: the fund carries units, a NAV and a gain.
                const isBalance = r.assetClass === "Cash";
                return (
                  <Tr view={holdingsView} reviewScope={{ positions: [r] }} key={`${r.securityKey}-${r.assetClass}`} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2.5">
                      <Link to={stockHref(r.securityKey)} className="font-medium text-slate-100 hover:text-champagne-400">
                        {r.security}
                      </Link>
                      {isCash && (
                        <span className="ml-2 text-[10.5px] text-slate-500"
                          title={isBalance
                            ? "The manager's cash sleeve. It is part of what this mandate is worth, which is why the total below ties to the statement."
                            : "The manager's cash sleeve, parked in a liquid or arbitrage fund — which the family counts as cash and nothing else. It is part of what this mandate is worth, which is why the total below ties to the statement."}>
                          cash sleeve
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-400">
                      {isCash
                        ? <span className="text-slate-500" title={isBalance
                            ? "A balance, not a share in a company — no sector applies."
                            : "A cash-equivalent fund, not a share in a company — no sector applies."}>—</span>
                        : <span data-mandate-sector={sectorOf(r)} data-mandate-sector-key={r.securityKey}>{sectorOf(r)}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{r.quantity === null ? <AbsentCell reason={NO_UNIT_COUNT} /> : fmtNum(r.quantity)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {price(r.avgCost) ?? <AbsentCell reason="this statement prints no per-unit cost for the holding" />}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {r.costBasis === null ? <AbsentCell reason="this statement reports no cost for the holding" /> : money(r.costBasis)}
                    </td>
                    <td className="px-4 py-2.5 text-left mono text-[12px] text-slate-400" data-mandate-invested-on={investedOnOf([r])?.first ?? ""}>
                      <InvestedOnCell d={investedOnOf([r])} why={isBalance
                        ? "a cash balance is not bought on a date — it is money the account holds"
                        : lineUndatedReason(r) ?? "no transaction statement or lot register in this drop dates the purchase of these units"} />
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {price(r.currentPrice) ?? <AbsentCell reason="the book carries this holding's value as a total, with no price per unit" />}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-200">
                      {money(r.marketValue)}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {mv > 0 ? fmtPct((r.marketValue / mv) * 100, { decimals: 1 })
                        : <AbsentCell reason="this mandate reports no market value, so a share of it cannot be struck" />}
                    </td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(r.unrealizedPnL)}`}>
                      {r.unrealizedPnL === null ? <AbsentCell reason="needs a cost this statement does not print" /> : money(r.unrealizedPnL, true)}
                    </td>
                  </Tr>
                );
              })}
            </tbody>
            {/* THE FOOTER IS THE WHOLE MANDATE, ALWAYS — filtered or not. It is
                the figure that has to tie to the manager's own statement, and a
                total that shrinks with the search box is a total a reader cannot
                check against the document. The line under the table says how
                many rows the filter is hiding. */}
            <tfoot className="border-t-2 border-ink-600 font-semibold">
              <TrFoot view={holdingsView} className="px-4 py-2.5 text-left text-slate-200"
                label={<>Total{hidden ? " (whole mandate)" : ""}</>}
                cells={{
                  invested: <td key="invested" className="px-4 py-2.5 text-right mono text-slate-300">{cost === null ? <AbsentValue /> : money(cost)}</td>,
                  mv: <td key="mv" className="px-4 py-2.5 text-right mono text-slate-100">{money(mv)}</td>,
                  weight: <td key="weight" className="px-4 py-2.5 text-right mono text-slate-300">{mv > 0 ? fmtPct(100, { decimals: 1 }) : <AbsentValue />}</td>,
                  pnl: <td key="pnl" className={`px-4 py-2.5 text-right mono ${changeColor(pnl)}`}>{pnl === null ? <AbsentValue /> : money(pnl, true)}</td>,
                }} />
            </tfoot>
          </ExportableTable>
        </div>
        {/* ONE LINE UNDER THE TABLE, and the paragraph that stood here is its
            hover. *"no one is reading these kind of … notes that you have put in
            across tables."* What stays on screen is the tie-out a reader can
            check — the statement total, and why the Total differs from it on
            live basis — and a derived total that does NOT match, because that is
            a defect rather than a basis. The rest (the manager's own printed
            total and the basis between them, the archive's state, why every ₹0
            is measured) is the hover on the figure it explains. */}
        <div className="border-t border-ink-700/60 px-4 py-2 text-[11px] text-slate-500">
          {hidden > 0 && (
            <span title="The Total is the whole mandate either way, because it is the figure that must tie to the statement.">
              Showing {shown.length} of {rows.length} rows · {hidden} hidden by the filter{stmtMV !== null ? " · " : ""}
            </span>
          )}
          {stmtMV !== null && (
            <span title={[
              `This is the sum of every row above${basis === "LIVE" ? " at its statement mark" : ""}, on the basis this book derives, and not a figure copied from the statement's own total line — which is why the rows add to it, and what makes this page checkable against the source document.`,
              basis === "LIVE" && Math.abs(mv - stmtMV) >= 1
                ? `The Total shown is ${money(mv)} because live prices are applied; the statement figure is unchanged.` : "",
              // THE MANAGER'S OWN PRINTED TOTAL, BESIDE IT AND NOT INSTEAD OF
              // IT. This sentence used to attribute the figure above to the
              // manager, and a reader who followed the link to check found a
              // larger number with nothing explaining it.
              ...printedTotalNotes(source, stmtMV, full),
              (zeroValue.length > 0 || zeroPnlCash.length > 0 || zeroPnlHeld.length > 0)
                ? `Every ₹0 above is a measured figure and keeps its zero: ${[
                    zeroPnlCash.length > 0 ? `${zeroPnlCash.length} ${zeroPnlCash.length === 1 ? "row carries" : "rows carry"} no unrealised P&L because a cash balance has none — the arithmetic, not a missing number` : "",
                    zeroPnlHeld.length > 0 ? `${zeroPnlHeld.length} ${zeroPnlHeld.length === 1 ? "holding is" : "holdings are"} marked exactly at cost (${zeroPnlHeld.map((r) => r.security).join(", ")}), so ${zeroPnlHeld.length === 1 ? "its gain is" : "their gains are"} a computed zero — not a cash line and not a missing cost` : "",
                    zeroValue.length > 0 ? `${zeroValue.length} ${zeroValue.length === 1 ? "row is" : "rows are"} worth nothing on the statement (${zeroValue.map((r) => r.security).join(", ")}), so ${zeroValue.length === 1 ? "its" : "their"} weight is a true 0.0%` : "",
                  ].filter(Boolean).join(", ")}. A figure this book does not carry renders as an em dash instead, never as a zero.`
                : "",
            ].filter(Boolean).join(" ")}>
              {/* THE FIGURES, NOT THE SENTENCES (Stage 10cp): the statement total
                  and the live Total are on the face; what each is and why they
                  differ is this line's hover. */}
              Statement total {money(stmtMV)}
              {(zeroValue.length > 0 || zeroPnlCash.length > 0 || zeroPnlHeld.length > 0) && <> · every ₹0 above is measured</>}
              {basis === "LIVE" && Math.abs(mv - stmtMV) >= 1 && (
                <> · Total at live prices {money(mv)}</>
              )}
            </span>
          )}
          {stmtMV !== null && derivedGap !== null && Math.abs(derivedGap) >= 1 && (
            <div className="mt-1 text-amber-400/90">
              That document&rsquo;s own derived total is {full(source.derivedTotal)}, which this sum does not match — the book
              carries {full(stmtMV)} for this account, {full(Math.abs(derivedGap))} apart, and that difference is a defect
              rather than a basis.
            </div>
          )}
        </div>
      </Card>
      )}

      {/* THE TWO RECORDS, SIDE BY SIDE AND NEVER CONFLATED: what the family
          paid in, then what the manager did with it. */}
      <CapitalIn account={account} />

      <ManagerTrades account={account} />
    </div>
  );
}

/**
 * ── ONE CLUBBED FUND, EVERY CLASS AND EVERY MEMBER WHO HOLDS IT ─────────────
 *
 * The Portfolio Monitor draws a fund whose units sit under several classes as
 * one row (Sanshi's A2 and E; 3P's B1, B2 and B3). `/stock/:securityKey` serves
 * ONE class, so that row's name had no page to open and each class line under
 * it opened its own. This is the row's page: every class, in every member's
 * folio, on one screen. Keyed by the fund's name as `splitFundClass` reads it —
 * the same key the row is clubbed on.
 */
export function FundHoldings() {
  const { fund = "" } = useParams();
  const { portfolio } = usePortfolio();
  // THE NAME AS THE ROW PRINTS IT, matched without regard to case: a label
  // may set "CAT-III" as "Cat-III", and it is the same fund.
  const name = useMemo(() => {
    const want = fund.trim().toLowerCase();
    return (portfolio?.positions ?? []).map((p) => splitFundClass(p.security)?.fund)
      .find((f) => !!f && f.toLowerCase() === want) ?? null;
  }, [portfolio, fund]);
  const accounts = useMemo<Account[]>(() => {
    if (!portfolio || !name) return [];
    const ids = new Set(portfolio.positions.filter((p) => splitFundClass(p.security)?.fund === name).map((p) => p.accountId));
    return portfolio.accounts.filter((a) => ids.has(a.accountId));
  }, [portfolio, name]);
  if (!portfolio) return null;
  if (!name || !accounts.length) {
    return (
      <div>
        <PageNav className="mb-2" trail={[{ label: "Portfolio Monitor", to: "/monitor" }, { label: "Fund not found" }]} />
        <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-slate-100">Fund not found</h1>
        <Card>
          <AbsentSection what={`No fund "${fund}" is held in the members in view`}
            needs="This address names a fund by the name its statements print before the unit class. No holding in the current book, under the members chosen at the top of the page, carries that name." />
        </Card>
      </div>
    );
  }
  const providers = [...new Set(accounts.map((a) => a.provider))];
  return <HeldByMany kind="fund" name={name} provider={providers.length === 1 ? providers[0] : null} accounts={accounts} fund={name} />;
}

/** The two tables of a page run for several accounts — whose each account is, and what is in them. */
const HOLDER_COLS = ["entity", "account", "asOf", "holdings", "invested", "mv", "share", "pnl", "realised", "ret"] as const;
const GROUP_COLS = [...MANDATE_COLS, "heldBy"] as const;

/** "A", "A and B", "A, B and C". */
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * ── ONE STRATEGY OR ONE FUND, HELD BY SEVERAL OF THE FAMILY'S ACCOUNTS ──────
 *
 *   *"Inside the main VEC drill down page show the different entities who hold
 *    them and at what value at what price and all of that information needs to
 *    be in the same drill down page. There will be no need to keep separate
 *    drill down pages for separate entities."*
 *
 * Three things, top to bottom:
 *
 *  - WHO HOLDS IT — one line per account, each struck over its own rows and
 *    nothing else (two members' accounts are two investments, so nothing is
 *    deduped), and a total that is the column sums; the return beneath it is
 *    FIFO over every account at once, never an average of the lines.
 *  - WHAT IS IN IT — every holding of every account, the member's name on the
 *    line, each one's own quantity, cost and price. One company in two
 *    accounts is two lines, kept next to each other.
 *  - EACH ACCOUNT'S OWN RECORD — what the family put in, and on a mandate what
 *    the manager traded, card by card, each naming whose account it is.
 *
 * The tiles are the strategy's — the same figures as the Portfolio Monitor row
 * that links here.
 */
function HeldByMany({ kind, name, provider, accounts, fund }: {
  kind: "mandate" | "fund"; name: string; provider: string | null; accounts: Account[]; fund?: string;
}) {
  const { portfolio, consolidated, statementPortfolio, basis, fmtFromBase, convertFromBase, displayCurrency, quotesStatus, scope } = usePortfolio();
  const [qFilter, setQ] = useNavigationState<string>("strategy-search", "");
  const q = useTableExportFilter(qFilter, "");
  const holdersView = useTableView("strategy-holders", HOLDER_COLS, { investmentDates: true });
  const holdingsView = useTableView("strategy-holdings", GROUP_COLS, { reviewKind: "holding" });
  const sources = useHoldingsSources(kind === "mandate" ? accounts : []);
  const exposure = useStockExposure(consolidated, false);
  const companySectors = useMemo(
    () => companySectorIndex(consolidated.filter(isCompanyShare), exposure),
    [consolidated, exposure],
  );
  const sectorOf = (r: Position) =>
    isCompanyShare(r) ? companySectors.get(r.securityKey)?.sector || UNCLASSIFIED_SECTOR : r.sector;

  const idKey = accounts.map((a) => a.accountId).join(" ");
  const inSet = useMemo(() => {
    const ids = new Set(idKey.split(" "));
    return (p: Position) => ids.has(p.accountId) && (!fund || splitFundClass(p.security)?.fund === fund);
  }, [idKey, fund]);
  // PER ACCOUNT, NEVER DEDUPED — the single account's page's rule, for the
  // same reason: each line answers what ITS statement carries.
  const rows = useMemo(() => (portfolio ? portfolio.positions.filter(inSet) : []), [portfolio, inSet]);
  const stmtRows = useMemo(() => (statementPortfolio ? statementPortfolio.positions.filter(inSet) : null), [statementPortfolio, inSet]);
  const fifoOpts = useMemo(() => ({ accounts: portfolio?.accounts ?? [], universe: rows }), [portfolio, rows]);
  const fifo = useMemo(() => fifoTotals(rows, fifoOpts), [rows, fifoOpts]);
  const lines = useMemo(() => accounts.map((a) => {
    const rs = rows.filter((p) => p.accountId === a.accountId);
    const f = fifoTotals(rs, fifoOpts);
    return {
      account: a,
      owner: a.ownerId ? ownerDisplayName(a.ownerId) : a.owner,
      rows: rs,
      mv: sum(rs.map((p) => p.marketValue)),
      stmtMV: stmtRows ? sum(stmtRows.filter((p) => p.accountId === a.accountId).map((p) => p.marketValue)) : null,
      pnl: sumOrNull(rs.map((p) => p.unrealizedPnL)),
      fifo: f,
    };
  }).sort((x, y) => y.mv - x.mv), [accounts, rows, stmtRows, fifoOpts]);

  if (!portfolio) return null;

  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const full = (n: number | null | undefined) => fmtFromBase(n, { compact: false });
  const price = (n: number | null | undefined) =>
    (typeof n === "number" && Number.isFinite(n) ? fmtCurrency(convertFromBase(n), displayCurrency) : null);
  const lineOf = new Map(lines.map((l) => [l.account.accountId, l]));
  const owners = [...new Set(lines.map((l) => l.owner))];
  const n = lines.length;

  const mv = sum(rows.map((r) => r.marketValue));
  const cost = sumOrNull(rows.map((r) => r.costBasis));
  const pnl = sumOrNull(rows.map((r) => r.unrealizedPnL));
  const noCost = rows.filter((r) => r.costBasis === null).length;
  const ret = fifo.returnPct;
  const stmtMV = stmtRows ? sum(stmtRows.map((p) => p.marketValue)) : null;
  // THE CAPITAL OF EVERY ACCOUNT OR NONE: a strategy whose one account
  // publishes no capital record has no "paid in" to name for the whole.
  const capitals = accounts.map((a) => a.capital);
  const capital = capitals.every((c) => !!c)
    ? {
      contributed: sum(capitals.map((c) => c!.contributed)),
      withdrawn: sum(capitals.map((c) => c!.withdrawn)),
      from: capitals.map((c) => c!.from).filter(Boolean).sort()[0] ?? null,
    }
    : null;
  const reconcile = investedReconciliation({
    costHeld: cost, uncostedRows: noCost, capital,
    realised: fifo.realised ?? null, wholeMandate: fifo.wholeMandates.length > 0,
  });
  const ids = new Set(accounts.map((a) => a.accountId));
  const firstContribution = CAPITAL_RECORD
    .filter((m) => ids.has(m.accountId) && m.direction === "in")
    .map((m) => m.date).sort()[0] ?? null;
  const firstOpened = accounts.map((a) => a.inceptionDate).filter((d): d is string => !!d).sort()[0] ?? null;
  const fundedNote = firstContribution ? `funded from ${fmtDate(firstContribution)}`
    : firstOpened ? `account opened ${fmtDate(firstOpened)}` : null;
  const fundedWhy = firstContribution
    ? `The earliest payment any of the ${n} accounts' statements date. Each account's own payments are listed in full below.`
    : firstOpened
      ? `The earliest inception date the ${n} accounts' statements print. They do not date the individual payments, so this is when the first account opened rather than when money arrived in it.`
      : `No statement in this drop dates what was paid into these accounts, or when they opened.`;

  const dates = [...new Set(accounts.map((a) => a.asOf))].sort();
  const liveN = rows.filter((r) => r.live).length;
  const datesText = dates.length === 1 ? fmtDate(dates[0]) : `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`;
  const datesTip = lines.map((l) => `${l.owner} (a/c ${l.account.accountNo}) as of ${fmtDate(l.account.asOf)}`).join("; ");
  const shares = rows.filter((r) => r.assetClass === "Equity");
  const sleeve = rows.filter((r) => readerClassOf(r) === "Cash");
  const other = rows.length - shares.length - sleeve.length;
  const classes = fund ? [...new Set(rows.map((r) => splitFundClass(r.security)?.cls).filter((c): c is string => !!c))].sort() : [];
  const whole = kind === "mandate" ? "whole mandate" : "whole fund";

  // ONE COMPANY'S LINES SIT TOGETHER: largest holding first, and within it the
  // largest account's line first. A reader's own ranking replaces it.
  const secMV = new Map<string, number>();
  for (const r of rows) secMV.set(r.securityKey, (secMV.get(r.securityKey) ?? 0) + r.marketValue);
  const term = q.trim().toLowerCase();
  const shown = term
    ? rows.filter((r) => r.security.toLowerCase().includes(term) || (r.isin ?? "").toLowerCase().includes(term)
      || (lineOf.get(r.accountId)?.owner ?? "").toLowerCase().includes(term))
    : rows;
  const sorted = sortRows([...shown].sort((a, b) => ((secMV.get(b.securityKey) ?? 0) - (secMV.get(a.securityKey) ?? 0))
    || a.securityKey.localeCompare(b.securityKey) || b.marketValue - a.marketValue), holdingsView.sort, withReviewAccessors<Position>({
    security: (r) => r.security,
    sector: (r) => (readerClassOf(r) === "Cash" ? null : sectorOf(r)),
    qty: (r) => r.quantity,
    avgCost: (r) => r.avgCost,
    invested: (r) => r.costBasis,
    investedOn: (r) => investedOnOf([r])?.first ?? null,
    cmp: (r) => r.currentPrice,
    mv: (r) => r.marketValue,
    weight: (r) => (mv > 0 ? r.marketValue : null),
    pnl: (r) => r.unrealizedPnL,
    heldBy: (r) => lineOf.get(r.accountId)?.owner ?? null,
  }, (r) => ({ positions: [r] }), scope.owners !== null));
  const hidden = rows.length - shown.length;
  const holderRows = sortRows(lines, holdersView.sort, {
    investedOn: (l) => (kind === "mandate" ? accountInvestedOn([l.account.accountId]) : investedOnOf(l.rows))?.first ?? null,
    entity: (l) => l.owner,
    account: (l) => l.account.accountNo,
    asOf: (l) => l.account.asOf,
    holdings: (l) => l.rows.length,
    invested: (l) => l.fifo.invested,
    mv: (l) => l.mv,
    share: (l) => (mv > 0 ? l.mv : null),
    pnl: (l) => l.pnl,
    realised: (l) => l.fifo.realised,
    ret: (l) => l.fifo.returnPct,
  });
  const investedSum = sumOrNull(lines.map((l) => l.fifo.invested));
  const pnlSum = sumOrNull(lines.map((l) => l.pnl));
  const realisedSum = sumOrNull(lines.map((l) => l.fifo.realised));
  const defects = kind === "mandate" ? lines.filter((l) => {
    const d = sources.get(l.account.accountId)?.derivedTotal ?? null;
    return d !== null && l.stmtMV !== null && Math.abs(d - l.stmtMV) >= 1;
  }) : [];

  return (
    <div data-strategy-page={kind} data-strategy-accounts={lines.map((l) => l.account.accountId).join(" ")}>
      <PageNav className="mb-2" trail={[{ label: "Portfolio Monitor", to: "/monitor" }, { label: name }]} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-100">{name}</h1>
          <div className="mt-1 text-[13px] text-slate-400">
            {kind === "mandate"
              ? <>Run by <span className="font-medium text-slate-300">{provider}</span> for{" "}</>
              : <>Held by{" "}</>}
            <span className="font-medium text-slate-300">{andList(owners)}</span> · accounts {lines.map((l) => l.account.accountNo).join(", ")}
            {kind === "fund" && provider && <span className="text-slate-500"> · {provider}</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {kind === "mandate"
              ? <Pill tone="core"><span title={ROUTE_NOTE.mandate}>{ROUTE_LABEL.mandate}</span></Pill>
              : <Pill>{classes.length} unit class{classes.length === 1 ? "" : "es"}{classes.length ? ` · ${classes.join(", ")}` : ""}</Pill>}
            <Pill tone="info">
              <span data-mandate-asof={dates.join(" ")} data-mandate-basis={liveN ? "live" : "statement"}
                title={liveN
                  ? `LIVE basis: ${liveN} of ${rows.length} holdings are marked to a live quote now and the rest keep their statement's mark. Each account is dated by its own statement — ${datesTip}.`
                  : `Every figure on this page is as each statement printed it — ${datesTip}${quotesStatus === "loading" ? " — live prices are still being fetched" : ""}.`}>
                {liveN ? `LIVE · ${liveN} of ${rows.length} marked now · statements ${datesText}` : `${dates.length === 1 ? "STATEMENT" : "STATEMENTS"} · as of ${datesText}`}
              </span>
            </Pill>
            <Pill>{n} accounts</Pill>
          </div>
        </div>
        <div className="text-right" data-mandate-headline={String(mv)}>
          <div className="font-display text-2xl font-bold tabular text-slate-100">{money(mv)}</div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">
            {rows.length} holdings {kind === "mandate" ? "the manager runs" : "of the fund"} across {n} accounts
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Market value" value={money(mv)}
          sub={kind === "mandate"
            ? `${shares.length} company shares · ${sleeve.length} cash ${sleeve.length === 1 ? "line" : "lines"}${other ? ` · ${other} other` : ""}`
            : `${rows.length} ${rows.length === 1 ? "line" : "lines"} · ${n} accounts`}
          icon={<Wallet className="h-4 w-4" />} />
        <Kpi label="Invested"
          value={cost === null ? <AbsentValue /> : money(cost)}
          sub={<span>
            {cost === null
              ? <span className="text-slate-500">no row on these statements reports a cost</span>
              : noCost
                ? <span className="text-slate-500">cost in · {noCost} of {rows.length} rows report none and are skipped</span>
                : <span>cost of holdings</span>}
            <span className="text-slate-500" title={fundedWhy}>{" · "}{fundedNote ?? "no statement dates what was paid in"}</span>
            {reconcile && (
              <span className="block text-slate-500" data-mandate-invested-reconcile
                data-paid-in={reconcile.paidIn} data-taken-out={reconcile.takenOut} data-realised={reconcile.realised}
                title={`What the ${n} accounts hold now cost ${money(reconcile.costHeld)}: the ${money(reconcile.paidIn)} paid in, less the ${money(reconcile.takenOut)} taken out, plus the ${money(reconcile.realised, true)} realised and kept invested.`}>
                = {money(reconcile.paidIn)} paid in{reconcile.takenOut ? <> − {money(reconcile.takenOut)} out</> : null} {reconcile.realised < 0 ? "−" : "+"} {money(Math.abs(reconcile.realised))} realised
              </span>
            )}
          </span>}
          icon={<Coins className="h-4 w-4" />} />
        <Kpi label="Unrealised P&L"
          value={pnl === null ? <AbsentValue /> : <span className={changeColor(pnl)}>{money(pnl, true)}</span>}
          sub={pnl === null ? <span className="text-slate-500">needs a cost these statements do not print</span> : "on the holdings held now"}
          icon={<TrendingUp className="h-4 w-4" />} />
        <Kpi label="Return · FIFO"
          value={ret === null ? <AbsentValue /> : <span className={changeColor(ret)} data-mandate-fifo-return={ret}>{fmtPct(ret, { sign: true })}</span>}
          sub={ret === null
            ? <span className="text-slate-500">no cost or capital on these statements to measure against</span>
            : <span title={`${fifoBasisNote(fifo, (v) => money(v))} Struck over all ${n} accounts at once — never an average of their own returns.`}>
                {/* NOTHING REALISED ON RECORD IS NOT A REALISED ₹0. */}
                {fifo.realised === null ? <>no sale on record</> : <>realised {money(fifo.realised, true)}</>}
                {fifo.wholeMandates.length === n && capital?.from
                  ? <> · on {money(capital.contributed)} paid in since {fmtDate(capital.from)}</>
                  : <> · on {money(fifo.deployed)} deployed</>}
              </span>}
          icon={<Percent className="h-4 w-4" />} />
        <Kpi label="Holdings" value={fmtNum(rows.length)}
          sub={`across ${n} accounts · ${kind === "mandate" ? MANDATE_BUCKET : "one fund"}`}
          icon={<Layers className="h-4 w-4" />} />
      </div>

      <Card className="mt-5" pad={false} title="Who holds it"
        subtitle="One line per family account, each struck over its own statement. The Total is the sum of the lines; its return is FIFO over every account at once.">
        <div className="overflow-x-auto" data-navigation-scroll="mandateholdings-2">
          <ExportableTable className="min-w-full whitespace-nowrap text-sm" data-strategy-holders>
            <thead className="border-b border-ink-700">
              <Tr view={holdersView}>
                <SortHeader col="entity" view={holdersView} align="left">Entity</SortHeader>
                <SortHeader col="account" view={holdersView} align="left">Account</SortHeader>
                <SortHeader col="asOf" view={holdersView} align="left">As of</SortHeader>
                <SortHeader col="holdings" view={holdersView}>Holdings</SortHeader>
                <SortHeader col="invested" view={holdersView}
                  title="What FIFO divides by: a whole mandate's capital paid in, otherwise the cost of what is held.">Invested</SortHeader>
                <SortHeader col="mv" view={holdersView}>Market value</SortHeader>
                <SortHeader col="share" view={holdersView}>Share</SortHeader>
                <SortHeader col="pnl" view={holdersView}>Unreal. P&L</SortHeader>
                <SortHeader col="realised" view={holdersView}>Realised</SortHeader>
                <SortHeader col="ret" view={holdersView}>Return · FIFO</SortHeader>
              </Tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {holderRows.map((l) => (
                <Tr view={holdersView} sourcePositions={l.rows} reviewScope={kind === "mandate" ? { accountId: l.account.accountId, isMandate: true } : { positions: l.rows }} key={l.account.accountId} className="hover:bg-ink-700/40"
                  data-holder-line={l.account.accountId} data-holder-owner={l.owner} data-holder-mv={l.mv}
                  data-holder-holdings={l.rows.length} data-holder-return={l.fifo.returnPct ?? undefined}>
                  <td className="px-4 py-2.5 font-medium text-slate-100">{l.owner}</td>
                  <td className="px-4 py-2.5 mono text-slate-400">{l.account.accountNo}</td>
                  <td className="px-4 py-2.5 mono text-slate-400">{fmtDate(l.account.asOf)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-300">{fmtNum(l.rows.length)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">
                    {l.fifo.invested === null ? <AbsentCell reason={`no statement for account ${l.account.accountNo} reports a cost or the capital paid in`} /> : money(l.fifo.invested)}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{money(l.mv)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">
                    {mv > 0 ? fmtPct((l.mv / mv) * 100, { decimals: 1 }) : <AbsentCell reason="these accounts report no market value, so a share of it cannot be struck" />}
                  </td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(l.pnl)}`}>
                    {l.pnl === null ? <AbsentCell reason={`needs a cost account ${l.account.accountNo}'s statement does not print`} /> : money(l.pnl, true)}
                  </td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(l.fifo.realised)}`}>
                    {l.fifo.realised === null ? <AbsentCell reason={`no capital gain statement or dated unit record covers account ${l.account.accountNo}, so what its sales realised is not reported`} /> : money(l.fifo.realised, true)}
                  </td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(l.fifo.returnPct)}`}>
                    {l.fifo.returnPct === null ? <AbsentCell reason={`no cost or capital on account ${l.account.accountNo}'s statement to measure against`} />
                      : <span title={fifoBasisNote(l.fifo, (v) => money(v))}>{fmtPct(l.fifo.returnPct, { sign: true })}</span>}
                  </td>
                </Tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-ink-600 font-semibold">
              <TrFoot view={holdersView} className="px-4 py-2.5 text-left text-slate-200" data-holder-total
                label={<>Total · {n} accounts</>}
                cells={{
                  holdings: <td key="holdings" className="px-4 py-2.5 text-right mono text-slate-300">{fmtNum(rows.length)}</td>,
                  invested: <td key="invested" className="px-4 py-2.5 text-right mono text-slate-300">{investedSum === null ? <AbsentCell reason="an account on this page reports neither a cost nor its capital paid in, so the column cannot be summed" /> : money(investedSum)}</td>,
                  mv: <td key="mv" className="px-4 py-2.5 text-right mono text-slate-100">{money(mv)}</td>,
                  share: <td key="share" className="px-4 py-2.5 text-right mono text-slate-300">{mv > 0 ? fmtPct(100, { decimals: 1 }) : <AbsentValue />}</td>,
                  pnl: <td key="pnl" className={`px-4 py-2.5 text-right mono ${changeColor(pnlSum)}`}>{pnlSum === null ? <AbsentCell reason="an account on this page prints no cost, so its gain cannot be added in" /> : money(pnlSum, true)}</td>,
                  realised: <td key="realised" className={`px-4 py-2.5 text-right mono ${changeColor(realisedSum)}`}>{realisedSum === null ? <AbsentCell reason="no account on this page reports what its sales realised" /> : money(realisedSum, true)}</td>,
                  ret: <td key="ret" className={`px-4 py-2.5 text-right mono ${changeColor(ret)}`}>{ret === null ? <AbsentValue /> : <span title="FIFO over every account at once — (value + withdrawn − paid in) ÷ paid in for the whole — never an average of the lines.">{fmtPct(ret, { sign: true })}</span>}</td>,
                }} />
            </tfoot>
          </ExportableTable>
        </div>
      </Card>

      <Card className="mt-5" pad={false}
        title={kind === "mandate" ? "What the manager holds" : "What the family holds"}
        subtitle={`Every holding of all ${n} accounts, each on its own member's line with its own quantity, cost and price. Weight is within this ${kind === "mandate" ? "mandate" : "fund"}, not within the book.`}
        right={<SearchInput value={q} onChange={setQ} placeholder="Filter by name, ISIN or member…" className="w-56"
          suggestions={[...new Set(rows.map((r) => r.security))]} />}>
        <div className="overflow-x-auto" data-navigation-scroll="mandateholdings-3">
          <ExportableTable className="min-w-full whitespace-nowrap text-sm" data-strategy-holdings>
            <thead className="border-b border-ink-700">
              <Tr view={holdingsView}>
                <SortHeader col="security" view={holdingsView} align="left">Security</SortHeader>
                <SortHeader col="sector" view={holdingsView} align="left">Sector</SortHeader>
                <SortHeader col="qty" view={holdingsView}>Qty</SortHeader>
                <SortHeader col="avgCost" view={holdingsView}>Avg cost</SortHeader>
                <SortHeader col="invested" view={holdingsView}>Invested</SortHeader>
                <SortHeader col="investedOn" view={holdingsView} align="left"
                  title="When the units this line holds were bought: its account's own dated trades where they account for every unit held, matched first-in, first-out, a lot register's acquisition dates, or a fund's own dated allotments. The Portfolio Monitor's holdings open each line into its dated trades.">Invested on</SortHeader>
                <SortHeader col="cmp" view={holdingsView}>CMP</SortHeader>
                <SortHeader col="mv" view={holdingsView}>Market value</SortHeader>
                <SortHeader col="weight" view={holdingsView}>Weight</SortHeader>
                <SortHeader col="pnl" view={holdingsView}>Unreal. P&L</SortHeader>
                <SortHeader col="heldBy" view={holdingsView} align="left">Held by</SortHeader>
              </Tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {sorted.map((r) => {
                const isCash = readerClassOf(r) === "Cash";
                const isBalance = r.assetClass === "Cash";
                const l = lineOf.get(r.accountId);
                return (
                  <Tr view={holdingsView} reviewScope={{ positions: [r] }} key={`${r.accountId}-${r.securityKey}-${r.assetClass}`} className="hover:bg-ink-700/40"
                    data-strategy-holding={r.securityKey} data-strategy-holding-account={r.accountId}>
                    <td className="px-4 py-2.5">
                      <Link to={stockHref(r.securityKey)} className="font-medium text-slate-100 hover:text-champagne-400">
                        {r.security}
                      </Link>
                      {isCash && kind === "mandate" && (
                        <span className="ml-2 text-[10.5px] text-slate-500"
                          title={isBalance
                            ? "The manager's cash sleeve. It is part of what this account is worth, which is why the total below ties to the statements."
                            : "The manager's cash sleeve, parked in a liquid or arbitrage fund — which the family counts as cash and nothing else."}>
                          cash sleeve
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-400">
                      {isCash
                        ? <span className="text-slate-500" title={isBalance
                            ? "A balance, not a share in a company — no sector applies."
                            : "A cash-equivalent fund, not a share in a company — no sector applies."}>—</span>
                        : !isCompanyShare(r)
                        ? <AbsentCell reason="units of a fund, not a share in a company — the fund spreads them across sectors, so no one sector applies" />
                        : <span data-mandate-sector={sectorOf(r)} data-mandate-sector-key={r.securityKey}>{sectorOf(r)}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{r.quantity === null ? <AbsentCell reason={NO_UNIT_COUNT} /> : fmtNum(r.quantity)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {price(r.avgCost) ?? <AbsentCell reason="this statement prints no per-unit cost for the holding" />}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {r.costBasis === null ? <AbsentCell reason="this statement reports no cost for the holding" /> : money(r.costBasis)}
                    </td>
                    <td className="px-4 py-2.5 text-left mono text-[12px] text-slate-400" data-mandate-invested-on={investedOnOf([r])?.first ?? ""}>
                      <InvestedOnCell d={investedOnOf([r])} why={isBalance
                        ? "a cash balance is not bought on a date — it is money the account holds"
                        : lineUndatedReason(r) ?? "no transaction statement, lot register or dated allotment in this drop dates the purchase of these units"} />
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400"
                      title={r.live || !l ? undefined : `${l.owner}'s statement mark of ${fmtDate(l.account.asOf)}`}>
                      {price(r.currentPrice) ?? <AbsentCell reason="the book carries this holding's value as a total, with no price per unit" />}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-200">{money(r.marketValue)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {mv > 0 ? fmtPct((r.marketValue / mv) * 100, { decimals: 1 })
                        : <AbsentCell reason="these accounts report no market value, so a share of it cannot be struck" />}
                    </td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(r.unrealizedPnL)}`}>
                      {r.unrealizedPnL === null ? <AbsentCell reason="needs a cost this statement does not print" /> : money(r.unrealizedPnL, true)}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-300" data-strategy-held-by={l?.owner}>
                      {l?.owner ?? <AbsentCell reason="this account is not in the registry" />}{" "}
                      <span className="ml-1 text-[10.5px] text-slate-500">a/c {l?.account.accountNo}</span>
                    </td>
                  </Tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-ink-600 font-semibold">
              <TrFoot view={holdingsView} className="px-4 py-2.5 text-left text-slate-200"
                label={<>Total{hidden ? ` (${whole})` : ""}</>}
                cells={{
                  invested: <td key="invested" className="px-4 py-2.5 text-right mono text-slate-300">{cost === null ? <AbsentValue /> : money(cost)}</td>,
                  mv: <td key="mv" className="px-4 py-2.5 text-right mono text-slate-100">{money(mv)}</td>,
                  weight: <td key="weight" className="px-4 py-2.5 text-right mono text-slate-300">{mv > 0 ? fmtPct(100, { decimals: 1 }) : <AbsentValue />}</td>,
                  pnl: <td key="pnl" className={`px-4 py-2.5 text-right mono ${changeColor(pnl)}`}>{pnl === null ? <AbsentValue /> : money(pnl, true)}</td>,
                  heldBy: <td key="heldBy" className="px-4 py-2.5 text-[12px] text-slate-300">{n} accounts</td>,
                }} />
            </tfoot>
          </ExportableTable>
        </div>
        <div className="border-t border-ink-700/60 px-4 py-2 text-[11px] text-slate-500">
          {hidden > 0 && (
            <span title={`The Total is the ${whole} either way, because it is the figure that must tie to the statements.`}>
              Showing {shown.length} of {rows.length} rows · {hidden} hidden by the filter{stmtMV !== null ? " · " : ""}
            </span>
          )}
          {stmtMV !== null && (
            <span title={[
              `This is the sum of every row above${basis === "LIVE" ? " at its statement mark" : ""}, on the basis this book derives — each account's rows add to its own statement's figure, and those add to this.`,
              ...lines.flatMap((l) => [
                `${l.owner}, account ${l.account.accountNo}: ${full(l.stmtMV)}.`,
                ...(kind === "mandate" ? printedTotalNotes(sources.get(l.account.accountId) ?? NO_SOURCE, l.stmtMV, full, `account ${l.account.accountNo}`) : []),
              ]),
              basis === "LIVE" && Math.abs(mv - stmtMV) >= 1
                ? `The Total shown is ${money(mv)} because live prices are applied; the statement figures are unchanged.` : "",
            ].filter(Boolean).join(" ")}>
              Statement total {money(stmtMV)}
              {basis === "LIVE" && Math.abs(mv - stmtMV) >= 1 && <> · Total at live prices {money(mv)}</>}
            </span>
          )}
          {defects.map((l) => (
            <div key={l.account.accountId} className="mt-1 text-amber-400/90">
              Account {l.account.accountNo}&rsquo;s document derives {full(sources.get(l.account.accountId)?.derivedTotal)}, which its rows here
              ({full(l.stmtMV)}) do not match — that difference is a defect rather than a basis.
            </div>
          ))}
        </div>
      </Card>

      {lines.map((l) => <CapitalIn key={l.account.accountId} account={l.account} owner={l.owner} />)}
      {kind === "mandate" && lines.map((l) => <ManagerTrades key={l.account.accountId} account={l.account} owner={l.owner} />)}
    </div>
  );
}

/**
 * ── WHAT THE FAMILY PUT IN, CONTRIBUTION BY CONTRIBUTION ────────────────────
 *
 *   "Twice — I have the two tranches I've entered here. How do I see that? I
 *    can't see that. Where will I get to see that there were two contributions?
 *    … amount invested is fine. But if I further want to see — because XIRR will
 *    change depending on the investment amount and the time, XIRR will change.
 *    It is not showing that. So need to show transaction wise."
 *
 * THE RECORD EXISTED AND THIS PAGE DID NOT READ IT. `BOOK_CAPITAL_MOVES` carries
 * every dated contribution and redemption the statements type as one, and the
 * Transactions card has shown them per account since Stage 10ag — but a reader
 * who opens a mandate from Holdings, from Family & Entities or from a company
 * page never passes through that card. This page showed an Invested figure and
 * nothing behind it, which is the half of the ask the family are pointing at.
 *
 * AND THE SECOND SENTENCE IS THE REASON IT IS A TABLE RATHER THAN A COUNT.
 * ₹10 Cr in March and ₹10 Cr in October are the same ₹20 Cr invested and not the
 * same return, because the March rupee has been at work seven months longer.
 * That is exactly what a money-weighted return is FOR, and a reader cannot check
 * one they cannot see the flows behind.
 *
 * ── IT REUSES `capitalRollup`, WHICH IS THE WHOLE POINT ─────────────────────
 *
 * The Transactions card's own table calls the same function with the same
 * arguments, differing only in scope — every funded account there, this one
 * here. A second implementation would be a second answer to "what did the family
 * put into this mandate", and the tile above it and the tab one click away are
 * precisely the pair where that disagreement is guaranteed to be visible. Same
 * reason `holdingBucket`, `costCoversSet` and `companyExposure` are each one
 * function rather than a per-page reflex.
 *
 * `side` is fixed at `"all"`: the Transactions card's side filter narrows what a
 * reader asked to see, and there is no such control here — passing anything else
 * would withhold half of a record this card exists to show in full.
 *
 * ── AN ACCOUNT WITH NO DATED RECORD SAYS SO, AND NAMES THE DOCUMENT ─────────
 *
 * ELEVEN of this book's 51 accounts publish one. The other 40 were funded too,
 * and no statement in this drop says when: a managed mandate issues a
 * capital-account ledger rather than dated allotments, and a depository records
 * what is held and never what was paid for it. A card that rendered nothing
 * there would read as a feed that failed, which is this book's founding rule —
 * so it states which of the two it is and what would fill it.
 */
function CapitalIn({ account, owner }: { account: Account; owner?: string }) {
  const capitalView = useTableView("mandate-capital", CAPITAL_COLS);
  const { fmtFromBase, statementPortfolio: portfolio } = usePortfolio();
  const money = (n: number | null | undefined) => fmtFromBase(n, { compact: true });

  const group = useMemo(() => {
    const mine = CAPITAL_RECORD.filter((m) => m.accountId === account.accountId);
    if (!mine.length) return null;
    return capitalRollup(mine, [account], portfolio?.positions ?? [], BOOK_POSITION_TRANCHES, "all", "recent", {
      commitments: BOOK_COMMITMENTS, fromInception: BOOK_CAPITAL_FROM_INCEPTION,
    })[0] ?? null;
  }, [account, portfolio?.positions]);

  // ON A PAGE OF SEVERAL ACCOUNTS each card names whose money it is.
  const title = owner ? `What the family put in · ${owner} · a/c ${account.accountNo}` : "What the family put in";
  // NEWEST FIRST IS THE DEFAULT AND A READER'S RANKING REPLACES IT — the order
  // `capitalRollup` returns, which is the record's own rather than a ranking
  // this card chose. A movement whose statement prints only a running balance
  // has no amount, so it sorts LAST rather than as a zero payment.
  const capitalRows = sortRows(group?.moves ?? [], capitalView.sort, {
    date: (m) => m.date,
    type: (m) => m.label,
    in: (m) => (m.direction === "in" ? m.amount : null),
    out: (m) => (m.direction === "out" ? m.amount : null),
    units: (m) => m.units,
    security: (m) => m.security,
  });

  if (!group) {
    return (
      <Card className="mt-5" title={title}>
        <AbsentSection
          what={`${account.provider} does not date what was paid into account ${account.accountNo}`}
          needs={`The account was funded — it holds ${account.strategy ? "this mandate" : "a position"} — and no statement in this drop says on which dates or in how many payments. A managed mandate issues a capital-account ledger (contributions, withdrawals, TDS) rather than dated unit allotments, and a depository records what is held and never what was paid for it. What would fill this is a contribution or capital-account statement from ${account.provider} carrying a date against each payment. ${DATED_ACCOUNTS} of this book's accounts publish one; this is not among them.`}
        />
      </Card>
    );
  }

  return (
    <Card className="mt-5" pad={false}
      title={title}
      subtitle={`The family's own payments in and out, as the statement types them. Every dated movement ${account.provider} reports on account ${account.accountNo}; what the manager then bought with the money is a different record.`}
      right={
        <span className="pill" data-capital-how={group.staggered ? "staggered" : "lumpsum"}>
          {group.staggered
            ? `staggered · ${group.contributions} payments`
            : group.contributions === 1 ? "one payment" : `${group.contributions} payments`}
        </span>
      }>
      <div className="overflow-x-auto" data-navigation-scroll="mandateholdings-4">
        <ExportableTable className="min-w-full whitespace-nowrap text-sm" data-capital-table={account.accountId}>
          <thead className="border-b border-ink-700">
            <Tr view={capitalView}>
              <SortHeader col="date" view={capitalView} align="left">Invested on</SortHeader>
              <SortHeader col="type" view={capitalView} align="left"
                title="The statement's own word for the movement — Subscription, Drawdown, Top Up, Full Units Redemption. Printed as it arrived rather than mapped to a vocabulary of ours.">Type</SortHeader>
              <SortHeader col="in" view={capitalView}
                title="What the family paid, gross, as the statement prints it — the fund's own charges came out of it before units were bought, and where the statement prints what bought units it is in this cell's hover.">Purchase</SortHeader>
              <SortHeader col="out" view={capitalView}
                title="What came back out to the family — principal and appreciation together, which is why it is never subtracted from Purchase.">Redemption</SortHeader>
              <SortHeader col="units" view={capitalView}>Units</SortHeader>
              <SortHeader col="security" view={capitalView} align="left">Security bought</SortHeader>
            </Tr>
          </thead>
          <tbody className="divide-y divide-ink-700/70">
            {capitalRows.map((m, i) => (
              <Tr view={capitalView} key={`${m.date}-${i}`} data-capital-move={account.accountId} className="hover:bg-ink-700/40">
                <td className="px-4 py-2 mono text-slate-200">{fmtDate(m.date)}</td>
                <td className="px-4 py-2 text-slate-400">{m.label}</td>
                {/* THE GROSS PURCHASE, SO THE ROWS ADD TO THE FOOTER. This cell
                    printed `invested` — net of the fund's stamp duty — while the
                    footer beneath it summed the gross, so the column never added
                    to its own total. The net rides in the hover. */}
                <td className="px-4 py-2 text-right mono text-emerald-400/90"
                  title={m.direction === "in" && m.invested != null && m.amount != null && m.invested !== m.amount
                    ? `${money(m.invested)} bought units after the fund's own charges on the day.` : undefined}>
                  {m.direction === "in"
                    ? (m.amount === null
                      ? <AbsentCell reason="this statement prints only a running balance for that date, so what moved on the day is not stated" />
                      : money(m.amount))
                    : ""}
                </td>
                <td className="px-4 py-2 text-right mono text-rose-400/90">
                  {m.direction === "out" ? (m.amount === null
                    ? <AbsentCell reason="this statement prints no amount for that redemption" />
                    : money(m.amount)) : ""}
                </td>
                <td className="px-4 py-2 text-right mono text-slate-400">
                  {m.units === null ? <span className="text-slate-600">—</span> : fmtNum(m.units)}
                </td>
                <td className="px-4 py-2 text-slate-400">{m.security ?? <span className="text-slate-600">—</span>}</td>
              </Tr>
            ))}
          </tbody>
          {/*
            SUMMED FROM THE ROWS ABOVE, never computed beside them. A footer
            struck independently of its own rows is the Private Market page's
            PM-1: both figures correct on their own terms, and no check able to
            see that one of the rows had been dropped.
          */}
          <tfoot className="border-t border-ink-700 bg-ink-800/60">
            <TrFoot view={capitalView} data-capital-total={account.accountId}
              className="px-4 py-2 font-medium text-slate-200"
              label={<>Total · {group.contributions} in{group.withdrawals ? ` · ${group.withdrawals} out` : ""}</>}
              cells={{
                in: <td key="in" className="px-4 py-2 text-right mono font-medium text-slate-100">{money(group.paidIn)}</td>,
                out: (
                  <td key="out" className="px-4 py-2 text-right mono font-medium text-slate-300">
                    {group.redemption === null
                      ? <AbsentCell reason="the fund's statement prints no distribution line, so what has come back to the family is not stated" />
                      : group.redemption === 0
                        ? <span title="Nothing has come back out of this account — a computed zero, not a missing figure.">{money(0)}</span>
                        : money(group.redemption)}
                  </td>
                ),
              }} />
          </tfoot>
        </ExportableTable>
      </div>
      {/*
        WHAT IT MADE, AND ON WHAT — never on "net invested".

        This line used to read "Net invested X against Y today", and net invested
        was purchase less redemption: a redemption is principal PLUS appreciation,
        so every rupee of gain that came back was subtracted from the principal
        and the return struck on it grew by the same amount. It also said a
        money-weighted rate "needs a valuation on each of those dates", which is
        false — an XIRR needs each dated flow and ONE closing value, and this
        record is exactly that. So it states the identity the Transactions table
        states, and both returns, each labelled, from the one `capitalReturn`.
      */}
      {/* TWO SHORT LINES — the money, then the returns. It was one run-on line
          of up to 206 characters with every reason spelt out in it, the wall of
          text the family asked to be rid of (Stage 10ci). A reason keeps its
          first clause on screen, because an absent figure names its cause, and
          the whole sentence is that clause's hover. */}
      <div className="border-t border-ink-700 px-4 py-2.5 text-[12px] leading-relaxed text-slate-400" data-capital-summary={account.accountId}>
        <div>Purchase <span className="mono text-slate-200">{money(group.paidIn)}</span>
          {group.redemption != null && group.redemption > 0 && <>, redemption <span className="mono text-slate-200">{money(group.redemption)}</span></>}
          {group.value != null && <>, worth <span className="mono text-slate-200">{money(group.value)}</span> today</>}
          {group.appreciation != null
            ? <> — appreciation <span className={`mono ${changeColor(group.appreciation)}`}>{fmtFromBase(group.appreciation, { compact: true, sign: true })}</span>
                {group.realised != null && group.unrealised != null && <>{" "}(<span className="mono">{fmtFromBase(group.realised, { compact: true, sign: true })}</span> realised,{" "}
                  <span className="mono">{fmtFromBase(group.unrealised, { compact: true, sign: true })}</span> unrealised)</>}.</>
            : <> — <span className="cursor-help underline decoration-dotted decoration-slate-500/40 underline-offset-[3px]" data-capital-no-return
                title={`Why: ${group.appreciationReason ?? "this account's reported capital does not support one"}`}>no appreciation or return is struck</span>.</>}
        </div>
        {group.appreciation != null
          ? (() => {
              const hpr = capitalReturn(group, "absolute");
              const xirr = capitalReturn(group, "xirr");
              return (
                <div>
                  {hpr.shown && <><span className={`mono ${changeColor(hpr.pct)}`}>{fmtPct(hpr.pct, { sign: true })}</span> <span className="ret-tag">HPR</span> on what was paid</>}
                  {xirr.shown && xirr.tag === "XIRR" && <>, <span className={`mono ${changeColor(xirr.pct)}`}>{fmtPct(xirr.pct, { sign: true })}</span> <span className="ret-tag">XIRR</span> money-weighted over every dated flow</>}
                  {/* The guard stays ON THE FACE (Stage 10g(ii)) — a sub-year
                      return read as a rate is the +99% error — in four words;
                      the sentence is its hover (Stage 10cp). */}
                  {xirr.shown && xirr.tag !== "XIRR" && <span className="text-slate-500" data-capital-not-annualised
                    title={`In under a year, so no annual rate is struck. ${xirr.note ?? ""}`.trim()}> · under a year, not annualised</span>}
                  {!xirr.shown && <span className="text-slate-500" title={xirr.reason}> · no XIRR: {firstClause(xirr.reason)}</span>}.
                </div>
              );
            })()
          // THE REASON IS THE HOVER ON THE WORDS ABOVE, which already say no
          // return is struck — a second line spelling it out was the run-on
          // note the family asked to be rid of (Stage 10cp).
          : null}
      </div>
    </Card>
  );
}

/**
 * WHAT THE MANAGER TRADED — the second half of the family's ask.
 *
 * *"first we need to see what transactions we have made and then if we click
 * and open the drill down page of one AIF/PMS then inside that we should see
 * what all transactions the portfolio manager of that fund has made."*
 *
 * The Transactions card draws the family's own capital and their managers'
 * trading as two tables under one set of controls (Stage 10bg);
 * this is where the manager's own dealing went. Grouped per SECURITY rather
 * than left as a tape, because that is the decision — Green Lantern bought The
 * Anup Engineering on fifty separate days, and fifty rows hide what one row
 * says. `rollup` is reused rather than reimplemented, so this table and the
 * Transactions card cannot disagree about what a manager did.
 *
 * ── A MANDATE ONLY, NOW, AND THE DEAD BRANCH WENT WITH THE CALLER ───────────
 *
 * This carried a second set of words for a FUND folio, because it was rendered
 * on that branch too. It is not any more (see the note where that call used to
 * be), so `holdingRoute(...) === "mandate"` was true at the one remaining call
 * site every time it was asked — a branch that cannot be reached, wearing a
 * confident explanation, which is exactly how a future session "fixes" a rule
 * that was never broken. The words for the fund case are recorded in that note
 * rather than left standing here as code nothing runs.
 */
function ManagerTrades({ account, owner }: { account: Account; owner?: string }) {
  const tradeView = useTableView("mandate-trades", TRADE_COLS);
  const { fmtFromBase } = usePortfolio();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [txns, setTxns] = useState<Txn[]>([]);
  const [openState, setOpen] = useNavigationState(`strategy-transactions-expanded:${account.accountId}`, () => new Set<string>());
  const open = useTableExportExpansion(openState);
  const money = (v: number | null) => (v === null ? null : fmtFromBase(v, { compact: true }));

  useEffect(() => {
    let alive = true;
    loadTransactions().then((d) => {
      if (!alive) return;
      if (!d) { setStatus("error"); return; }
      setTxns(d.txns); setStatus("ready");
    });
    return () => { alive = false; };
  }, []);

  // Joined on the two identifiers the STATEMENT itself prints, never on a
  // re-derived accountId slug — `txnRollup`'s own rule.
  const mine = useMemo(
    () => txns.filter((t) => acctKey(t.provider, t.accountNo) === acctKey(account.provider, account.accountNo)),
    [txns, account.provider, account.accountNo],
  );
  const groups = useMemo(() => rollup(mine, [account], "manager"), [mine, account]);
  const instruments = groups[0]?.instruments ?? [];
  // A side with no rows has nothing to rank, so it sorts LAST rather than as a
  // zero — an instrument the manager never sold is not one it sold nothing of.
  const tradeRows = sortRows(instruments, tradeView.sort, {
    security: (ins) => ins.security,
    trades: (ins) => ins.buys + ins.sells,
    bought: (ins) => (ins.buys === 0 ? null : ins.bought),
    sold: (ins) => (ins.sells === 0 ? null : ins.sold),
    realized: (ins) => ins.realized,
    period: (ins) => ins.first,
  });

  return (
    <Card className={owner ? "mt-5" : undefined} title={owner ? `What the manager traded · ${owner}` : "What the manager traded"}
      subtitle={`${account.provider} · account ${account.accountNo}`}>
      {status === "loading" ? (
        <p className="text-sm text-slate-500">Loading the manager&rsquo;s dated trades…</p>
      ) : status === "error" ? (
        <AbsentSection what="The audit archive didn't respond"
          needs="This table reads the extracted transaction statements from /audit. That request didn't come back — refresh to retry. The archive is served alongside the app, so this is the archive being unreachable rather than your session being stale." />
      ) : !instruments.length ? (
        <AbsentSection what="No dealing is reported for this account"
          needs={`${account.provider} issues no transaction statement for this account in this drop, so what it bought and sold over the period was never reported here. Its HOLDINGS above are what the statement does carry.`} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-ink-700" data-navigation-scroll="mandateholdings-5" data-navigation-key={account.accountId}>
            <ExportableTable className="min-w-full text-[13px]" data-manager-trades>
              <thead className="bg-ink-800">
                <Tr view={tradeView} className="border-b border-ink-700">
                  <SortHeader col="security" view={tradeView} align="left" pad="px-3 py-2">Security</SortHeader>
                  <SortHeader col="trades" view={tradeView} pad="px-3 py-2">Trades</SortHeader>
                  <SortHeader col="bought" view={tradeView} pad="px-3 py-2">Bought</SortHeader>
                  <SortHeader col="sold" view={tradeView} pad="px-3 py-2">Sold</SortHeader>
                  <SortHeader col="realized" view={tradeView} pad="px-3 py-2">Realized P&L</SortHeader>
                  <SortHeader col="period" view={tradeView} align="left" pad="px-3 py-2">Period</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {tradeRows.map((ins) => {
                  const isOpen = open.has(ins.key);
                  return (
                    <Fragment key={ins.key}>
                      <Tr view={tradeView} data-navigation-expanded aria-expanded={isOpen} data-manager-row={ins.key} data-buys={ins.buys} data-sells={ins.sells} className="cursor-pointer hover:bg-ink-700/30"
                        onClick={() => setOpen((prev) => { const n = new Set(prev); if (n.has(ins.key)) n.delete(ins.key); else n.add(ins.key); return n; })}>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <ChevronRight className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            <span className="text-slate-200">{ins.security}</span>
                            {ins.staggered && <Pill><span data-staggered-title title={ins.buys >= STAGGERED_MIN && ins.sells >= STAGGERED_MIN
                              ? `Bought over ${ins.buyDays} trading days and sold over ${ins.sellDays} rather than in one go.`
                              : ins.buys >= STAGGERED_MIN ? `Built up over ${ins.buyDays} trading days rather than in one go.`
                              : `Sold down over ${ins.sellDays} trading days rather than in one go.`}>staggered · {ins.days} days</span></Pill>}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right mono text-slate-400 whitespace-nowrap">
                          {ins.buys + ins.sells}<span className="ml-1 text-[10px] text-slate-500">{ins.buys}B/{ins.sells}S</span>
                        </td>
                        {/* A SIDE THE MANAGER NEVER TRADED SAYS SO (DSM-D8) — a bare
                            dash read exactly like a figure the statement failed to
                            print. It is a count of nothing, and its reason says that. */}
                        <td className="px-3 py-1.5 text-right mono text-slate-300 whitespace-nowrap" data-trade-cell="bought">
                          {ins.buys === 0 ? <AbsentCell reason="nothing of this security was bought over the period — there is no buy row, rather than a missing figure" />
                            : money(ins.bought) ?? <AbsentCell reason="no row on this side reports a settled amount" />}
                        </td>
                        <td className="px-3 py-1.5 text-right mono text-slate-300 whitespace-nowrap" data-trade-cell="sold">
                          {ins.sells === 0 ? <AbsentCell reason="nothing of this security was sold over the period — there is no sell row, rather than a missing figure" />
                            : money(ins.sold) ?? <AbsentCell reason="no row on this side reports a settled amount" />}
                        </td>
                        {/* THE REASON IS EACH SALE'S OWN (DSM-C10). "No capital gain
                            statement covers this account" was printed on 67 lines
                            that sold nothing and on three whose account DOES issue
                            one; each sale now says which of its causes it is. */}
                        <td className="px-3 py-1.5 text-right mono whitespace-nowrap" data-trade-cell="realised">
                          {ins.realized === null
                            ? <AbsentCell reason={ins.sells === 0 ? "nothing of this security was sold over the period, so nothing was realised" : realisedAbsence(ins.tranches)} />
                            : <><span className={changeColor(ins.realized)}>{money(ins.realized)}</span>{ins.realizedOf < ins.sells && <span className="ml-1 text-[10px] text-slate-500" data-realised-of={`${ins.realizedOf}/${ins.sells}`} title={realisedCoverageNote(ins.tranches)}>{ins.realizedOf}/{ins.sells}</span>}</>}
                        </td>
                        <td className="px-3 py-1.5 text-[12px] mono text-slate-500 whitespace-nowrap">
                          {ins.first === ins.last ? fmtDate(ins.first) : `${fmtDate(ins.first)} → ${fmtDate(ins.last)}`}
                        </td>
                      </Tr>
                      {isOpen && ins.tranches.map((t, i) => (
                        <Tr view={tradeView} key={`${ins.key}::${i}`} data-manager-tranche={ins.key} data-tranche-date={t.date} data-table-depth="1" className="text-[12px]">
                          <td className="px-3 py-1 pl-8 text-slate-400">
                            {fmtDate(t.date)}
                            <span className={`ml-2 rounded px-1 py-0.5 text-[10px] ${t.side === "Buy" ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300"}`}>{t.side}</span>
                            <span className="ml-2 mono text-slate-500">{fmtNum(t.qty)}{t.price !== null && <> @ {fmtFromBase(t.price)}</>}</span>
                          </td>
                          <td />
                          <td className="px-3 py-1 text-right mono text-slate-400 whitespace-nowrap">{t.side === "Buy" ? (money(t.amount) ?? <AbsentCell reason="this trade row reports neither a net nor a gross amount on its statement" />) : ""}</td>
                          <td className="px-3 py-1 text-right mono text-slate-400 whitespace-nowrap">{t.side === "Sell" ? (money(t.amount) ?? <AbsentCell reason="this trade row reports neither a net nor a gross amount on its statement" />) : ""}</td>
                          {/* A PURCHASE REALISES NOTHING — blank, like the other
                              side's money cell on this row, never a dash that names
                              "this sale" on a buy. */}
                          <td className="px-3 py-1 text-right mono whitespace-nowrap" data-tranche-realised={t.side}>
                            {t.side !== "Sell" ? ""
                              : t.realized === null
                              ? <AbsentCell reason={t.realizedNote ?? "no capital gain lot in the statements matches this sale"} />
                              : <span className={changeColor(t.realized)}>{money(t.realized)}</span>}
                          </td>
                          <td />
                        </Tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </ExportableTable>
          </div>
          <p className="mt-2 text-[11px] text-slate-500"
            title="Over the period this account's statements cover. These are the manager's decisions inside a mandate the family funded; the family's own capital into it is on the Transactions card.">
            {instruments.length} {instruments.length === 1 ? "line" : "lines"} from {mine.length} dated rows — open one for its days
          </p>
        </>
      )}
    </Card>
  );
}
