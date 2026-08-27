import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Wallet, Coins, TrendingUp, Layers } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { BasisPill } from "@/components/BasisPill";
import { SearchInput } from "@/components/SearchInput";
import { AbsentValue, AbsentCell, AbsentSection } from "@/components/Absent";
import { Auditable } from "@/components/Auditable";
import { usePortfolio } from "@/context/PortfolioContext";
import { sum, sumOrNull, holdingRoute, holdingBucket, bucketLabel, ROUTE_LABEL, ROUTE_NOTE, MANDATE_BUCKET, DIRECT_EQUITY_BUCKET } from "@/lib/analytics";
import { accountIndex } from "@/lib/accounts";
import { ownerDisplayName } from "@/lib/owners";
import { auditHref, stockHref } from "@/lib/auditFormulas";
import { fmtCurrency, fmtNum, fmtPct, fmtDate, changeColor } from "@/lib/format";
import type { Account, Position } from "@/lib/types";

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
// `holdingHref` composes `<accountId>-<asOf>-appraisal`, which is right for the
// seven mandates whose manager issues a PORTFOLIO APPRAISAL and a STALE LINK for
// the three who do not: SVAN and Green Lantern publish the SEBI investor report,
// Molecule a CURRENT PORTFOLIO. A file key the manifest does not carry leaves
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

function useHoldingsSource(account: Account | undefined): HoldingsSource {
  const [rows, setRows] = useState<ManifestRow[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}audit/manifest.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((m: ManifestRow[]) => { if (alive) setRows(Array.isArray(m) ? m : null); })
      .catch(() => { if (alive) setRows(null); });
    return () => { alive = false; };
  }, []);

  const docKey = useMemo(() => {
    if (rows === undefined || rows === null || !account) return rows === undefined ? undefined : null;
    const mine = rows.filter((d) => d.provider === account.provider && d.accountNo === account.accountNo);
    const type = HOLDINGS_REPORTS.find((t) => mine.some((d) => d.reportType === t));
    if (!type) return "";
    // A SNAPSHOT SUPERSEDES: the newest issue of the winning type is the one the
    // book was built from, so it is the one to link at.
    const best = mine.filter((d) => d.reportType === type).reduce((a, d) => (d.asOf > a.asOf ? d : a));
    return best.docKey;
  }, [rows, account]);

  const [doc, setDoc] = useState<DocTotals | null | undefined>(undefined);
  useEffect(() => {
    if (!docKey) { setDoc(undefined); return; }
    let alive = true;
    setDoc(undefined);
    fetch(`${import.meta.env.BASE_URL}audit/${docKey}/document.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { totals?: { totalMarketValue?: number | null } | null;
                  derivedPortfolioTotal?: number | null;
                  holdings?: { accruedIncome?: number | null }[] | null }) => {
        if (!alive) return;
        setDoc({
          printedTotal: fin(d?.totals?.totalMarketValue),
          derivedTotal: fin(d?.derivedPortfolioTotal),
          // sumOrNull, never sum: a document whose rows report no accrued income
          // must leave this `null`, so the difference below stays unattributed
          // rather than being explained by a zero nobody measured.
          accruedIncome: sumOrNull((d?.holdings ?? []).map((h) => fin(h?.accruedIncome))),
        });
      })
      .catch(() => { if (alive) setDoc(null); });
    return () => { alive = false; };
  }, [docKey]);

  return {
    docKey,
    printedTotal: doc?.printedTotal ?? null,
    derivedTotal: doc?.derivedTotal ?? null,
    accruedIncome: doc?.accruedIncome ?? null,
    docUnreadable: doc === null,
    docLoading: !!docKey && doc === undefined,
  };
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

export function MandateHoldings() {
  const { accountId = "" } = useParams();
  const { portfolio, statementPortfolio, basis, fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  const [q, setQ] = useState("");

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
  const sourceHref = source.docKey
    ? auditHref({ file: source.docKey })
    : auditHref({ find: account?.accountNo ?? accountId });

  const mv = sum(rows.map((r) => r.marketValue));
  // sumOrNull, not sum: a mandate whose statement reports no cost on some row
  // must render `—`, never a total that silently treats the gap as zero and
  // drags the return towards a number nobody measured.
  const cost = sumOrNull(rows.map((r) => r.costBasis));
  const pnl = sumOrNull(rows.map((r) => r.unrealizedPnL));
  const ret = cost !== null && pnl !== null && cost > 0 ? (pnl / cost) * 100 : null;
  const noCost = rows.filter((r) => r.costBasis === null).length;
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

  if (!portfolio) return null;

  // ── The address does not name an account in this book ──────────────────────
  if (!account) {
    const mandates = portfolio.accounts.filter((a) => holdingRoute(a.engagement) === "mandate");
    return (
      <div>
        <Crumb />
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-slate-100">Mandate not found</h1>
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

  const route = holdingRoute(account.engagement);
  const ownerName = account.ownerId ? ownerDisplayName(account.ownerId) : account.owner;
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
        <Crumb />
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-100">
          {account.strategy || `${account.provider} ${account.accountNo}`}
        </h1>
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
              <p className="text-[12.5px] leading-relaxed text-slate-400">
                <span className="font-medium text-slate-300">{account.provider} {account.accountNo}</span> is a fund
                folio, not a discretionary mandate. Buying into it is ONE purchase of a manager's portfolio — the family
                owns units of the fund, not the companies the fund owns — so there is no constituent list to show here.
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
                The companies inside it are the manager's holdings and are <span className="font-medium text-slate-300">not
                reported to this book</span>. Showing them would need the scheme's own portfolio disclosure joined to
                this folio, and no statement in this drop carries one for it. So the folio's value stays whole, in its
                own row, rather than being spread across sectors it was never reported against.
              </p>
              {account.noPositionsReason && (
                <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                  This account also contributes no valued position: {account.noPositionsReason}.
                </p>
              )}
              {rows.length > 0 && (
                <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">
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
              <p className="text-[12.5px] leading-relaxed text-slate-400">
                <span className="font-medium text-slate-300">{account.provider} {account.accountNo}</span> is the
                family's own account — nothing in it is chosen by a discretionary manager, so there is no mandate to
                open here. What it holds is filed on the holdings tables by what each row IS:
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
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
                  {account.noPositionsReason
                    ? <>This account carries no valued position in the book: {account.noPositionsReason}.</>
                    : <>This account carries no valued position in the book, so there is no bucket to name for it.</>}
                </p>
              )}
              {ownDirectEquity ? (
                <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">
                  The {DIRECT_EQUITY_BUCKET} rows are shares the family bought in this account, which is exactly what
                  that heading means on the holdings tables. Any fund unit or ETF listed beside them stays under its
                  own class: buying one is a single purchase of a manager's portfolio, not of the companies inside it.
                </p>
              ) : rows.length > 0 ? (
                <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">
                  None of it is {DIRECT_EQUITY_BUCKET}: not one row on this statement is a share in a company, so that
                  heading does not cover this account at all. Each row is filed under its own class above.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-slate-400">
              No statement for <span className="font-medium text-slate-300">{account.provider} {account.accountNo}</span>{" "}
              states how the account is run, so this book cannot say whether a manager chooses its holdings. An
              engagement is read off each statement's own wording and is never defaulted — guessing one here would
              assert a relationship nobody documented.
            </p>
          )}
          <p className="mt-4 text-[12px] text-slate-500">
            <Link to="/monitor" className="text-champagne-400 hover:underline">Portfolio Monitor</Link> carries this
            account in full.
          </p>
        </Card>
      </div>
    );
  }

  // ── The mandate itself ─────────────────────────────────────────────────────
  const shares = rows.filter((r) => r.assetClass === "Equity");
  const sleeve = rows.filter((r) => r.assetClass === "Cash");
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

  const term = q.trim().toLowerCase();
  const shown = term
    ? rows.filter((r) => r.security.toLowerCase().includes(term) || (r.isin ?? "").toLowerCase().includes(term))
    : rows;
  const sorted = [...shown].sort((a, b) => b.marketValue - a.marketValue);
  const hidden = rows.length - shown.length;

  return (
    <div>
      <Crumb />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/monitor" className="mb-1 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-300">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to holdings
          </Link>
          {/* The mandate's own name, as the manager prints it. Null on a
              provider that names no strategy — the account then identifies
              itself by manager and number rather than by an invented label. */}
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            {account.strategy || `${account.provider} ${account.accountNo}`}
          </h1>
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
            <Pill>
              <span title={`Every figure on this page is as ${account.provider} printed it on ${account.asOf}. The book's newest statement is ${portfolio.asOf}; this account's own is what dates this page.`}>
                statement as of {fmtDate(account.asOf)}
              </span>
            </Pill>
            {account.engagement && <Pill>{account.providerEngagement || account.engagement}</Pill>}
            <BasisPill liveText={`marked now · statement ${fmtDate(account.asOf)}`} />
          </div>
        </div>
        <div className="text-right">
          <div className="mono text-2xl font-semibold text-slate-100">{money(mv)}</div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">
            {rows.length} holdings the manager runs — shares and the cash sleeve
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Market value"
          value={<Auditable to={sourceHref} title="Market value — trace to this account's own statement">{money(mv)}</Auditable>}
          sub={`${shares.length} company shares · ${sleeve.length} cash ${sleeve.length === 1 ? "line" : "lines"}${other ? ` · ${other} other` : ""}`}
          icon={<Wallet className="h-4 w-4" />} />
        <Kpi label="Invested"
          value={cost === null ? <AbsentValue /> : <Auditable to={sourceHref} title="Cost — trace to this account's own statement">{money(cost)}</Auditable>}
          sub={cost === null
            ? <span className="text-slate-500">no row on this statement reports a cost</span>
            : noCost
              ? <span className="text-slate-500">cost in · {noCost} of {rows.length} rows report none and are skipped</span>
              : "cost in, whole mandate"}
          icon={<Coins className="h-4 w-4" />} />
        <Kpi label="Unrealised P&L"
          value={pnl === null ? <AbsentValue /> : <span className={changeColor(pnl)}>{money(pnl, true)}</span>}
          delta={ret}
          sub={pnl === null ? <span className="text-slate-500">needs a cost this statement does not print</span> : "on cost"}
          icon={<TrendingUp className="h-4 w-4" />} />
        <Kpi label="Holdings" value={fmtNum(rows.length)}
          sub={`in one mandate · ${MANDATE_BUCKET.toLowerCase()}`}
          icon={<Layers className="h-4 w-4" />} />
      </div>

      <Card className="mt-5" pad={false}
        title="What the manager holds"
        subtitle={`Every constituent of this mandate as ${account.provider} printed it on ${fmtDate(account.asOf)} — the shares the manager chose and the cash it is holding back. Weight is within this mandate, not within the book.`}
        right={<SearchInput value={q} onChange={setQ} placeholder="Filter by name or ISIN…" className="w-56"
          suggestions={rows.map((r) => r.security)} />}>
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-sm">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Sector</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Qty</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Avg cost</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Invested</th>
                <th className="label-xs px-4 py-2 text-right font-medium">CMP</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Market value</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Weight</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Unreal. P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {sorted.map((r) => {
                const isCash = r.assetClass === "Cash";
                return (
                  <tr key={`${r.securityKey}-${r.assetClass}`} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2.5">
                      <Link to={stockHref(r.securityKey)} className="font-medium text-slate-100 hover:text-champagne-400">
                        {r.security}
                      </Link>
                      {isCash && (
                        <span className="ml-2 text-[10.5px] text-slate-500"
                          title="The manager's cash sleeve. It is part of what this mandate is worth, which is why the total below ties to the statement.">
                          cash sleeve
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-400">
                      {isCash
                        ? <span className="text-slate-500" title="A balance, not a share in a company — no sector applies.">—</span>
                        : r.sector}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{fmtNum(r.quantity)}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {price(r.avgCost) ?? <AbsentCell reason="this statement prints no per-unit cost for the holding" />}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {r.costBasis === null ? <AbsentCell reason="this statement reports no cost for the holding" /> : money(r.costBasis)}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {price(r.currentPrice) ?? <AbsentCell reason="this holding is marked at a total value, with no per-unit price anywhere on the statement" />}
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-200">
                      <Auditable to={sourceHref} title="Market value — trace to this account's own statement">{money(r.marketValue)}</Auditable>
                    </td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">
                      {mv > 0 ? fmtPct((r.marketValue / mv) * 100, { decimals: 1 })
                        : <AbsentCell reason="this mandate reports no market value, so a share of it cannot be struck" />}
                    </td>
                    <td className={`px-4 py-2.5 text-right mono ${changeColor(r.unrealizedPnL)}`}>
                      {r.unrealizedPnL === null ? <AbsentCell reason="needs a cost this statement does not print" /> : money(r.unrealizedPnL, true)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* THE FOOTER IS THE WHOLE MANDATE, ALWAYS — filtered or not. It is
                the figure that has to tie to the manager's own statement, and a
                total that shrinks with the search box is a total a reader cannot
                check against the document. The line under the table says how
                many rows the filter is hiding. */}
            <tfoot className="border-t-2 border-ink-600 font-semibold">
              <tr>
                <td className="px-4 py-2.5 text-left text-slate-200">Total{hidden ? " (whole mandate)" : ""}</td>
                <td />
                <td />
                <td />
                <td className="px-4 py-2.5 text-right mono text-slate-300">{cost === null ? <AbsentValue /> : money(cost)}</td>
                <td />
                <td className="px-4 py-2.5 text-right mono text-slate-100">{money(mv)}</td>
                <td className="px-4 py-2.5 text-right mono text-slate-300">{mv > 0 ? fmtPct(100, { decimals: 1 }) : <AbsentValue />}</td>
                <td className={`px-4 py-2.5 text-right mono ${changeColor(pnl)}`}>{pnl === null ? <AbsentValue /> : money(pnl, true)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="border-t border-ink-700/60 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
          {hidden > 0 && (
            <>Showing {shown.length} of {rows.length} rows — {hidden} hidden by the filter. The Total is the whole
              mandate either way, because it is the figure that must tie to the statement.{" "}</>
          )}
          {stmtMV !== null && (
            <>
              {money(stmtMV)} is <span className="text-slate-400">this account's own statement total</span>, as{" "}
              {account.provider} printed it on {fmtDate(account.asOf)}: the shares the manager chose plus the cash
              sleeve it runs beside them. That is why the rows above add to the account, and it is what makes this page
              checkable against{" "}
              <Link to={sourceHref} className="text-champagne-400 hover:underline">the source document</Link>.
              {basis === "LIVE" && Math.abs(mv - stmtMV) >= 1 && (
                <> The Total shown is {money(mv)} because live prices are applied; the statement figure is unchanged.</>
              )}
              {docKey === null && (
                <> The archive did not respond, so that link opens the archive index with this account's number already
                  in the search box rather than naming a document it could not confirm.</>
              )}
              {docKey === "" && (
                <> No holdings document for this account is in the archive manifest, so that link opens the archive
                  index with this account's number already in the search box.</>
              )}
            </>
          )}
          {(zeroValue.length > 0 || zeroPnl.length > 0) && (
            <>
              {" "}Every ₹0 above is a measured figure and keeps its zero:{" "}
              {zeroPnl.length > 0 && (
                <>{zeroPnl.length} {zeroPnl.length === 1 ? "row carries" : "rows carry"} no unrealised P&amp;L because a
                  cash balance has none — the arithmetic, not a missing number</>
              )}
              {zeroValue.length > 0 && (
                <>{zeroPnl.length > 0 ? ", and " : ""}{zeroValue.length}{" "}
                  {zeroValue.length === 1 ? "row is" : "rows are"} worth nothing on the statement
                  ({zeroValue.map((r) => r.security).join(", ")}), so {zeroValue.length === 1 ? "its" : "their"} weight
                  is a true 0.0%</>
              )}
              . A figure this book does not carry renders as an em dash instead, never as a zero.
            </>
          )}
        </div>
      </Card>

      {/* WHY THESE SHARES ARE NOT UNDER "DIRECT EQUITY", said once, on the page
          where the question arises. The family read the old label as a claim
          that they had chosen the position; the shares are ordinary listed
          equity and the DECISION was the manager's, and both halves belong on
          screen together. */}
      <Card className="mt-5" title="How to read this page">
        <p className="text-[12.5px] leading-relaxed text-slate-400">
          Every share above is ordinary listed equity — the family owns the shares, and{" "}
          <span className="font-medium text-slate-300">{account.provider}</span> decides them under a discretionary
          mandate. That is why they are grouped here under {MANDATE_BUCKET.toLowerCase()} rather than under{" "}
          {DIRECT_EQUITY_BUCKET}, which on the holdings tables now means what the words say: shares the family bought
          in its own demat or broking account.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
          The grouping is a holdings-table decision and nothing else moved with it. These positions still carry their
          GICS sector, their market cap and their NSE symbol, and Sector Composition, Exposure &amp; IPS and Compare
          still count every one of them — a look-through into a mandate is a gain for exposure analysis, not something
          to undo. Each name's own page is one click away from the Security column.
        </p>
      </Card>
    </div>
  );
}

function Crumb() {
  return (
    <div className="mb-2 text-[12px] text-slate-500">
      <Link to="/monitor" className="text-champagne-400 hover:underline">Portfolio Monitor</Link>
      <span className="mx-1.5">›</span>Mandate
    </div>
  );
}
