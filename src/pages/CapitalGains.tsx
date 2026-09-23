import { useMemo, useState } from "react";
import { Receipt, Landmark, Timer, Percent } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { SearchInput } from "@/components/SearchInput";
import { BasisPill } from "@/components/BasisPill";
import { usePortfolio } from "@/context/PortfolioContext";
import { StockLink } from "@/components/StockLink";
import { sumOrNull, sum, isPriced, holdingBucket, bucketLabel, isMandateHeld, MANDATE_BUCKET } from "@/lib/analytics";
import { accountIndex, ownerOf } from "@/lib/accounts";
import { fmtPct, changeColor, fmtDate } from "@/lib/format";
import { Auditable } from "@/components/Auditable";
import { AbsentSection, AbsentCell, absentTile, DASH } from "@/components/Absent";
import { sumFormula } from "@/lib/auditFormulas";
import { BOOK_REALISED_BY_CLASS } from "@/data/glowData";
import { estimateRealisedTax, financialYearStart, STCG_RATE, LTCG_RATE } from "@/lib/taxEstimate";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { TreeSectionCell, TREE_ROW } from "@/components/TreeTable";
import { Pill } from "@/components/Pill";
import { useTableView, sortRows } from "@/lib/tableView";
import type { Position } from "@/lib/types";

// Capital Gains & Tax — honest about two holes.
//
// HOLE 1: TWO ACCOUNTS HAVE NO CAPITAL GAIN STATEMENT. Three of the five
// accounts publish one; the two Goldstandard accounts do not, in this drop.
// Those rows say so. They are neither dropped — which would let the totals read
// as the family's whole realised position — nor zeroed, which would claim those
// accounts realised nothing, a thing nobody measured.
//
// HOLE 2: NO LOT ACQUISITION DATES ANYWHERE. Every unrealised short/long-term
// figure, and the whole hold-to-LTCG planner, needs to know when each lot was
// bought. The CAPITAL REGISTER these managers issue is a capital-account ledger
// — contributions, withdrawals, TDS transfers — not a lot register, so the split
// cannot be made. The planner is disabled with its reason rather than shown as
// an empty table, and the code path is kept intact: `daysToLT` becomes non-null
// the moment a lot-level statement is ingested, and the planner revives here
// with no change.
//
// WHAT SURVIVES BOTH HOLES: loss harvesting. Unrealised P&L per position is
// real, so the underwater names and their size are real. What cannot be computed
// is the TAX effect of booking them, which turns on whether each lot is short or
// long term — so the table lists the losses and says the tax effect is
// unavailable, rather than quoting a saving it cannot support.

// Illustrative Indian equity rates: STCG u/s 111A = 20%; LTCG u/s 112A = 12.5%
// (beyond the ₹1.25L annual exemption, which is not applied here). ONE
// definition, in `taxEstimate.ts`, because the tax tile and the hold-to-LTCG
// planner both apply them and two copies would be two chances to disagree.

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const DAY_MS = 864e5;
const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);

/**
 * The four tables' columns in DECLARED order — the order their cells are
 * written in below, which is what `<Tr>` permutes from. The first of each is
 * the row's SUBJECT and never moves (see `src/lib/tableView.ts`).
 */
const BUCKET_COLS = ["bucket", "lots", "st", "lt", "total"] as const;
const CG_ACCT_COLS = ["account", "window", "lots", "realST", "realLT", "unrealST", "unrealLT"] as const;
const HOLD_COLS = ["security", "gain", "turns", "saved"] as const;
const HARVEST_COLS = ["security", "entity", "loss", "return", "marked", "term"] as const;

export function CapitalGains() {
  // STATEMENT BASIS, ALWAYS. This page has to tie to the capital gain statements
  // — a reader checks a figure here by opening the PDF. Reading the live-overlaid
  // book would drift its unrealised figures with the market while the realised
  // ones stayed printed, so two halves of the same table would be on two
  // different measurements with nothing on screen to say which.
  const { statementPortfolio: portfolio, portfolio: livePortfolio, fmtFromBase } = usePortfolio();
  const [harvestQ, setHarvestQ] = useState("");
  // The "no capital gain statement" band opens here; above the early return,
  // as every hook must be.
  const [missingOpen, setMissingOpen] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const p = portfolio?.positions ?? [];
  const asOf = portfolio?.asOf ?? today;

  /**
   * `daysToLT` IS COUNTED FROM ITS OWN ACCOUNT'S REPORT DATE, NOT THE BOOK'S.
   *
   * `build-book` derives it as `365 − (days held at THAT DOCUMENT's as-of)`, so
   * the date a lot turns long-term is `account.asOf + daysToLT`. This anchored
   * every candidate to `portfolio.asOf` — the NEWEST date in the book — and the
   * only account that publishes a lot register is LKP, which reports on
   * 2026-03-31 against a book as-of of 2026-07-10.
   *
   * A hundred and one days of drift, and it was on screen: the planner's one
   * live candidate, Belrise Industries with ₹5.51 L of unrealised gain, was
   * shown crossing to long-term on 2026-12-20 when its lots actually cross on
   * 2026-09-10. That is not a presentation detail — it is the whole output of
   * the card. A family reading "hold until December" defers a sale three months
   * longer than the ₹41,353 of tax saving requires.
   *
   * `elapsed` had the same fault: measured from the book's as-of it read 27 days
   * where the LKP lots have actually aged 128.
   */
  const accountAsOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of portfolio?.accounts ?? []) m.set(a.accountId, a.asOf);
    return m;
  }, [portfolio]);

  const { holdCandidates, crossed } = useMemo(() => {
    const all = p.filter((x) => x.daysToLT != null && isPriced(x) && x.unrealizedPnL > 0)
      .map((x) => {
        const from = accountAsOf.get(x.accountId) ?? asOf;
        return {
          ...x,
          // `isPriced` above narrows unrealizedPnL to a number, so this is a real
          // saving on a real gain rather than a rate applied to nothing.
          saving: (x.unrealizedPnL as number) * (STCG_RATE - LTCG_RATE),
          ltDate: addDays(from, x.daysToLT!),
          daysLeft: x.daysToLT! - daysBetween(from, today),
        };
      });
    const done = all.filter((x) => x.daysLeft <= 0);
    return {
      holdCandidates: all.filter((x) => x.daysLeft > 0).sort((a, b) => a.daysLeft - b.daysLeft),
      crossed: done.length,
    };
  }, [p, asOf, today, accountAsOf]);

  const harvest = useMemo(() =>
    p.filter((x) => isPriced(x) && x.unrealizedPnL < 0)
      .sort((a, b) => (a.unrealizedPnL ?? 0) - (b.unrealizedPnL ?? 0)), [p]);

  // Which positions the planner can see at all, and whose. Stated on the card,
  // because a planner covering 7 of 301 positions that does not say so reads as
  // a planner covering the book.
  const datedLots = useMemo(() => p.filter((x) => x.daysToLT != null), [p]);
  const datedAtLoss = useMemo(() => datedLots.filter((x) => isPriced(x) && x.unrealizedPnL < 0), [datedLots]);
  const datedAccounts = useMemo(() => {
    const byId = new Map((portfolio?.accounts ?? []).map((a) => [a.accountId, a]));
    return [...new Set(datedLots.map((x) => x.accountId))]
      .map((id) => {
        const a = byId.get(id);
        return a ? `${a.provider.split(" ")[0]} ${a.accountNo} (as of ${a.asOf})` : id;
      })
      .sort();
  }, [datedLots, portfolio]);

  // ABOVE THE EARLY RETURN, because a hook that runs on some renders and not
  // others is a hooks-order error rather than a conditional table.
  const bucketView = useTableView("cg-bucket", BUCKET_COLS);
  const acctView = useTableView("cg-accounts", CG_ACCT_COLS);
  const holdView = useTableView("cg-hold", HOLD_COLS);
  const harvestView = useTableView("cg-harvest", HARVEST_COLS);

  if (!portfolio) return null;
  const money = (n: number | null | undefined, sign?: boolean) => fmtFromBase(n, { compact: true, sign });
  const accIdx = accountIndex(portfolio.accounts);
  const cg = portfolio.capitalGains;

  // Only accounts that HAVE a statement contribute to a total. The others are
  // listed with their reason — never averaged in, never counted as zero.
  const reported = cg.filter((c) => c.realisedST !== null || c.realisedLT !== null);
  const unreported = cg.filter((c) => c.realisedST === null && c.realisedLT === null);
  const totRealST = sumOrNull(reported.map((c) => c.realisedST));
  const totRealLT = sumOrNull(reported.map((c) => c.realisedLT));
  const realisedTotal = totRealST === null && totRealLT === null
    ? null : (totRealST ?? 0) + (totRealLT ?? 0);
  const totUnrealST = sumOrNull(cg.map((c) => c.unrealisedST));
  const totUnrealLT = sumOrNull(cg.map((c) => c.unrealisedLT));
  const unrealisedTotal = totUnrealST === null && totUnrealLT === null
    ? null : (totUnrealST ?? 0) + (totUnrealLT ?? 0);
  /**
   * PER TAXPAYER, NEVER POOLED, WITH THE ACT'S OWN SET-OFF. Tax is assessed per
   * person, and this pooled every member's heads first — so one member's
   * short-term loss erased the others' short-term gains and the tile printed
   * ₹18.2 L. Per person, a short-term loss then sets off against that person's
   * own long-term gain within one financial year (s.70(2)): ₹24.2 L on this
   * book. See `estimateRealisedTax`.
   */
  const taxEst = estimateRealisedTax(cg);
  const estTaxRealised = realisedTotal === null ? null : taxEst.total;
  // WHICH WINDOWS REACH INTO AN EARLIER FINANCIAL YEAR. Derived from the
  // statements' own windows: the financial year is the one the newest window
  // closes in (1 April to 31 March), and a window that opens before it mixes
  // two years' sales into one "current" estimate.
  const fyStart = financialYearStart(reported);
  const priorYear = fyStart ? reported.filter((c) => c.periodFrom && c.periodFrom < fyStart).map((c) => c.entity) : [];

  const totalSaving = sum(holdCandidates.map((x) => x.saving));
  const harvestRows = harvestQ.trim()
    ? harvest.filter((h) => h.security.toLowerCase().includes(harvestQ.trim().toLowerCase()))
    : harvest;
  // THE CAP IS APPLIED AFTER THE SORT, so a reader who ranks by a column sees
  // the top 30 OF THAT RANKING rather than the first 30 of the default one
  // re-ordered among themselves — the rule the transactions tape already
  // follows for its own cap.
  const holdShown = sortRows(holdCandidates, holdView.sort, {
    security: (h) => h.security,
    gain: (h) => h.unrealizedPnL,
    turns: (h) => h.daysLeft,
    saved: (h) => h.saving,
  }).slice(0, 30);
  const harvestShown = sortRows(harvestRows, harvestView.sort, {
    security: (h) => h.security,
    entity: (h) => ownerOf(accIdx, h),
    loss: (h) => h.unrealizedPnL,
    return: (h) => h.returnPct,
    marked: (h) => accountAsOf.get(h.accountId) ?? null,
  }).slice(0, 30);
  const harvestTotal = sumOrNull(harvest.map((x) => x.unrealizedPnL));
  /**
   * ── A LOSS IS ONLY AS CURRENT AS THE MARK IT IS STRUCK ON (XA-22) ────────
   *
   * This list is on the statements' own marks, by design — it has to tie to
   * the PDFs — and those marks are up to five months old. A mutual fund AMFI
   * has since priced can have turned: Motilal Oswal Active Momentum reads
   * −₹10,709 on its 6 Aug statement and is a gain of ₹92 L at the NAV of
   * 22 Sep. So each row names the date its loss is marked at, and a row the
   * published NAV has turned into a gain says so — kept, because it is the
   * statement's figure, and never counted as a loss available to book.
   */
  const navNow = new Map<string, { pnl: number; date: string }>();
  for (const x of livePortfolio?.positions ?? []) {
    if (x.navPriced && typeof x.unrealizedPnL === "number" && x.navDate) {
      navNow.set(`${x.accountId}|${x.securityKey}`, { pnl: x.unrealizedPnL, date: x.navDate });
    }
  }
  const navTurned = (h: Position) => {
    const n = navNow.get(`${h.accountId}|${h.securityKey}`);
    return n && n.pnl >= 0 ? n : null;
  };
  const turnedRows = harvest.filter((h) => navTurned(h));
  /**
   * ── A DATED LOT HAS A TERM (XA-16) ─────────────────────────────────────────
   *
   * The ST/LT cell was an absence on every row — "no lot acquisition date" —
   * including the three LKP holdings whose broker publishes a lot register
   * (Transrail −₹8.5 L among them). Those carry each side's cost and the days
   * their first short-term lot needs to turn long-term, counted from THEIR
   * account's report date. That is a term, and it is shown; a row with no
   * dated lot keeps its reason.
   */
  const termOf = (h: Position) => {
    if (h.stCostBasis == null && h.ltCostBasis == null) return null;
    const hasST = (h.stCostBasis ?? 0) > 0, hasLT = (h.ltCostBasis ?? 0) > 0;
    const from = accountAsOf.get(h.accountId) ?? asOf;
    const turns = hasST && h.daysToLT != null ? addDays(from, h.daysToLT) : null;
    return { hasST, hasLT, from, turns };
  };
  /**
   * REALISED GAINS, SPLIT BY HOW THE HOLDING WAS RUN — not by what it WAS.
   *
   * This card grouped on `assetClass` and rendered `assetClassLabel`, and SIX of
   * the seven accounts that publish a capital gain statement in this book are
   * PMS mandates. So a loss Carnelian booked on Jammu Kashmir Bank printed under
   * the one word the family has now objected to three times — the same claim the
   * holdings tables are being regrouped to remove, made on the page a reader
   * checks against the PDF.
   *
   * The split is `holdingBucket` now — the ONE place that decision is made
   * (src/lib/analytics.ts) — with the engagement read off the ACCOUNT, never off
   * the row. NO FIGURE MOVES: the same lots, the same short/long split, the same
   * canonical total in the footer. Only which line each account's lots land on.
   *
   * A ROW WHOSE ASSET CLASS NO STATEMENT CARRIES KEEPS ITS OWN LINE rather than
   * being folded into the bucket above it. Merging it into the mandate's
   * subtotal would put an absence inside a labelled group and lose both the
   * figure and the reason, while the mandate's own classified lots stay whole,
   * which is the account-level tie.
   *
   * WHAT THAT LINE IS NOT IS THE ACCOUNT'S CASH SWEEP, and an earlier draft of
   * the caption below said it was. `build-book` joins each lot's asset class
   * from the same security's rows elsewhere in the drop, and the liquid-fund
   * instruments these mandates sweep into ARE carried on other reports here —
   * so those lots come back classified `Equity`, land in the bucket above and
   * are netted there. Only the one security no report in this drop classifies
   * reaches this line. The row is therefore "the lots nothing classifies";
   * claiming it separates what the sweep realised from what the equity book
   * realised would be a caption narrowing a figure it does not cover, and a
   * reader would take the figure beside it for the sweep's realised total.
   */
  const byBucket = (() => {
    type Row = {
      key: string; label: string; heldNote: string | null; unclassified: boolean;
      lots: number; st: number; lt: number;
      securities: Set<string>; accounts: Set<string>; unresolved: Set<string>;
    };
    const m = new Map<string, Row>();
    for (const r of BOOK_REALISED_BY_CLASS) {
      // `engagementOf`'s own lookup, kept as the ACCOUNT itself: an accountId
      // that resolves to nothing has to be CAUGHT here rather than read as an
      // empty engagement, which would label an unroutable row as confidently as
      // a routed one.
      const acc = accIdx.get(r.accountId);
      // A mandate takes its whole account — including the sleeve whose class no
      // statement carries. How an account is run is a fact about the ACCOUNT,
      // and it is knowable even where the security's class is not.
      // NO `securityKey` HERE, AND IT IS NOT AN OVERSIGHT — `LedgerInsights`
      // passes one from the same helper and this deliberately cannot. A
      // `RealisedByClass` row is an AGGREGATE over several securities
      // (`r.securities` is a list), so there is no single key to test for a
      // cash equivalent and inventing one would file a whole row on one of its
      // members. Measured, it costs nothing: seven of this book's eight rows
      // are mandates and short-circuit above, and the eighth is LKP's Equity
      // aggregate, which carries no cash equivalent to be misfiled.
      const held = acc && isMandateHeld(acc.engagement) ? MANDATE_BUCKET
        : r.assetClass ? holdingBucket({ assetClass: r.assetClass }, acc?.engagement)
        : null;
      const key = `${held ?? "unbucketed"}::${r.assetClass === null ? "no-class" : "class"}`;
      const e = m.get(key) ?? {
        key,
        // Never `assetClassLabel` on a row that has an account: the bucket is
        // what the account supports and the class label is what it does not.
        label: held ? bucketLabel(held) : "",
        heldNote: held ? bucketLabel(held) : null,
        unclassified: r.assetClass === null,
        lots: 0, st: 0, lt: 0,
        securities: new Set<string>(), accounts: new Set<string>(), unresolved: new Set<string>(),
      };
      e.lots += r.lots; e.st += r.realisedST ?? 0; e.lt += r.realisedLT ?? 0;
      for (const n of r.securities) e.securities.add(n);
      e.accounts.add(r.entity);
      if (!acc) e.unresolved.add(r.entity);
      m.set(key, e);
    }
    return [...m.values()]
      .map((e) => ({
        ...e,
        securities: [...e.securities].sort(),
        accounts: [...e.accounts].sort(),
        unresolved: [...e.unresolved].sort(),
      }))
      .sort((a, b) => Number(a.unclassified) - Number(b.unclassified) || b.lots - a.lots);
  })();

  const byEnt = [...cg].sort((a, b) =>
    ((b.realisedST ?? -Infinity) + (b.realisedLT ?? 0)) - ((a.realisedST ?? -Infinity) + (a.realisedLT ?? 0)));

  const bucketRows = sortRows(byBucket, bucketView.sort, {
    bucket: (c) => (c.unclassified ? null : c.label),
    lots: (c) => c.lots,
    st: (c) => c.st,
    lt: (c) => c.lt,
    total: (c) => (c.st ?? 0) + (c.lt ?? 0),
  });
  // AN ACCOUNT THAT REPORTS NOTHING HAS NO FIGURE TO RANK, so every accessor
  // here returns null for it and it sorts LAST in both directions — never as a
  // zero, which would rank it among the accounts that genuinely realised
  // nothing.
  const acctRowsShown = sortRows(byEnt, acctView.sort, {
    account: (c) => c.entity,
    window: (c) => (c.absent ? null : c.periodFrom),
    lots: (c) => (c.absent ? null : c.lots),
    realST: (c) => (c.absent ? null : c.realisedST),
    realLT: (c) => (c.absent ? null : c.realisedLT),
  });
  // THE ACCOUNTS WITH NO STATEMENT ARE ONE CLOSED BAND, NOT A ROW EACH (Stage
  // 10cp). Forty-four rows each read "— no capital gain statement issued for
  // this account in this drop" under seven that carry a figure; the family's
  // own standard for missing data is "a hidden drop down clearly marked"
  // (Stage 10bx), so they are named — one click in — and never mixed into the
  // rows a reader is scanning for figures.
  const acctReported = acctRowsShown.filter((c) => !c.absent);
  const acctMissing = acctRowsShown.filter((c) => c.absent);

  return (
    <div>
      <PageHeader eyebrow="Tax &amp; Income" title="Capital Gains &amp; Tax"
        right={<BasisPill statement liveText="Statement marks"
          hint="Realised gains come from each account's capital gain statement, each over its own window; unrealised figures are on the same statement marks so both halves of this page are one measurement." />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {realisedTotal === null ? (
          <StatTile label="Realised gains (period)"
            {...absentTile("no capital gain statement in this book",
              "Realised gains come from the manager's capital gain statement. No account in this book has one.")}
            icon={<Receipt className="h-4 w-4" />} />
        ) : (
          <StatTile label="Realised gains (period)"
            value={<Auditable formula={sumFormula("Realised gains (period)",
              "The short- and long-term gains booked over each account's own window, added together.",
              [{ label: "Realised ST", value: totRealST ?? 0 }, { label: "Realised LT", value: totRealLT ?? 0 }],
              realisedTotal, money)}>
              <span className={changeColor(realisedTotal)}>{fmtFromBase(realisedTotal, { compact: true, sign: true })}</span>
            </Auditable>}
            sub={<>ST {fmtFromBase(totRealST ?? 0, { compact: true, sign: true })} · LT {fmtFromBase(totRealLT ?? 0, { compact: true, sign: true })}</>}
            hint={unreported.length
              ? `From ${reported.length} of ${cg.length} accounts. The other ${unreported.length} publish no capital gain statement and are excluded, not counted as zero.`
              : `All ${cg.length} accounts.`}
            icon={<Receipt className="h-4 w-4" />} />
        )}

        <StatTile label="Embedded (unrealised) gains"
          {...(unrealisedTotal === null
            ? absentTile(datedLots.length ? "needs every lot's purchase date" : "needs lot acquisition dates",
              datedLots.length
                ? `The short/long-term split needs when each lot still held was bought. Only ${datedLots.length} holding${datedLots.length === 1 ? " carries" : "s carry"} dated lots — ${datedAccounts.join(", ")}, from a broker's lot register — and a split over ${datedLots.length === 1 ? "it" : "those"} alone would read as the book's. No other statement here dates the lots still held.`
                : "The short/long-term split needs to know when each lot was bought. No statement in this drop carries lot dates.")
            : {
              value: fmtFromBase(unrealisedTotal, { compact: true }),
              sub: <>ST {fmtFromBase(totUnrealST ?? 0, { compact: true })} · LT {fmtFromBase(totUnrealLT ?? 0, { compact: true })}</>,
            })}
          icon={<Landmark className="h-4 w-4" />} />

        {estTaxRealised === null ? (
          <StatTile label="Est. tax on realised"
            {...absentTile(realisedTotal === null ? "no realised gains to tax" : "no realised gain carries a canonical owner",
              realisedTotal === null ? "Needs a capital gain statement."
                : "Tax is assessed per person, and none of these accounts resolves to one, so no per-taxpayer figure can be struck.")}
            icon={<Percent className="h-4 w-4" />} />
        ) : (
          // A COMPUTED zero, and the reason belongs in the tile rather than on
          // hover: a reader scanning "₹0" next to a realised loss must be able
          // to see it is the arithmetic, not a gap.
          <StatTile label="Est. tax on realised"
            value={<span data-xa="cg-tax" data-value={estTaxRealised} data-pooled={taxEst.pooled ?? ""}
                data-taxpayers={taxEst.byTaxpayer.length}>
              <Auditable formula={{
                title: "Est. tax on realised",
                excel: "= Σ over each taxpayer of ( max(0, their Realised ST + set-off) × 20% + max(0, their Realised LT − set-off) × 12.5% ), set-off = the short-term loss that absorbs their own long-term gain",
                plain: "Illustrative tax on the gains actually booked, struck PER TAXPAYER — tax is assessed per person, so one member's loss never reduces another member's tax. Within one person the accounts net inside a head, and a short-term loss is then set off against that person's own long-term gain within one financial year (s.70(2)); a long-term loss is never set off against a short-term gain (s.70(3)).",
                worked: [
                  ...taxEst.byTaxpayer.map((t) => t.setOff > 0
                    ? `${t.owner}: ST ${money(t.st ?? 0, true)} sets off ${money(t.setOff)} of LT ${money(t.lt ?? 0, true)} → max(0, ${money((t.st ?? 0) + t.setOff, true)}) × 20% + max(0, ${money((t.lt ?? 0) - t.setOff, true)}) × 12.5% = ${money(t.tax)}`
                    : `${t.owner}: max(0, ${money(t.st ?? 0, true)}) × 20% + max(0, ${money(t.lt ?? 0, true)}) × 12.5% = ${money(t.tax)}${t.setOffWithheld ? " (no set-off struck: their windows span financial years)" : ""}`),
                  `Σ = ${money(estTaxRealised)}`,
                ].join("  ·  "),
              }}>{fmtFromBase(estTaxRealised, { compact: true })}</Auditable>
            </span>}
            sub={estTaxRealised === 0
              ? <span className="text-slate-400">nothing to tax · every taxpayer's heads are at a net loss</span>
              : "per taxpayer · STCG 20% · LTCG 12.5% · illustrative"}
            hint={[
              taxEst.byTaxpayer.map((t) => `${t.owner} ${money(t.tax)}`).join(" · "),
              taxEst.unattributed.length
                ? `${taxEst.unattributed.map((c) => c.entity).join(", ")} ${taxEst.unattributed.length === 1 ? "carries" : "carry"} no canonical owner and ${taxEst.unattributed.length === 1 ? "is" : "are"} not in this figure.`
                : "",
            ].filter(Boolean).join(" — ")}
            title="Each person's realised gains are the sum over their own accounts' capital gain statements, and a short-term loss is set off against that person's own long-term gain within one financial year. Illustrative only: equity rates, no ₹1.25 L exemption, no surcharge or cess."
            icon={<Percent className="h-4 w-4" />} />
        )}

        <StatTile label="Hold-to-LTCG saving"
          {...(holdCandidates.length
            ? {
              value: fmtFromBase(totalSaving, { compact: true }),
              sub: `${holdCandidates.length} still short-term${crossed ? ` · ${crossed} already crossed` : ""}`,
            }
            : datedLots.length
              ? absentTile("no short-term winner to defer",
                `${datedLots.length} holding${datedLots.length === 1 ? " carries" : "s carry"} a purchase date (${datedAccounts.join(", ")}); ${datedAtLoss.length === datedLots.length
                  ? (datedLots.length === 1 ? "it is at a loss" : `all ${datedLots.length} are at a loss`)
                  : `${datedAtLoss.length} at a loss${crossed ? `, ${crossed} already past one year` : ""}`} — so there is no short-term gain to carry past its one-year mark.`)
              : absentTile("needs lot acquisition dates",
                "The planner defers short-term winners past their one-year mark. Without a lot date there is no mark to count to."))}
          icon={<Timer className="h-4 w-4" />} />
      </div>

      {/* ── Realised, per account ── */}
      {/* THE HEADLINE NETS UNLIKE BOOKS: shares a discretionary manager chose,
          shares the family bought itself, and lots whose asset class no report
          in this drop carries. No figure changes here; the split just stops one
          silently flattering another, and it is cut on HOW each account is run
          rather than on what was sold — see `byBucket` above. */}
      {byBucket.length > 1 && (
        <Card className="mt-5" title="Realised, by how the holding was run"
          subtitle="The same canonical total, split — the headline above nets these together" pad={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-ink-700">
                <Tr view={bucketView}>
                  <SortHeader col="bucket" view={bucketView} align="left">Held as</SortHeader>
                  <SortHeader col="lots" view={bucketView}>Lots</SortHeader>
                  <SortHeader col="st" view={bucketView}>Realised ST</SortHeader>
                  <SortHeader col="lt" view={bucketView}>Realised LT</SortHeader>
                  <SortHeader col="total" view={bucketView}>Total</SortHeader>
                </Tr>
              </thead>
              <tbody className="divide-y divide-ink-700/70">
                {bucketRows.map((c) => {
                  const tot = (c.st ?? 0) + (c.lt ?? 0);
                  return (
                    <Tr view={bucketView} key={c.key} className="hover:bg-ink-700/40">
                      <td className="px-4 py-2.5">
                        {!c.unclassified ? (
                          <>
                            <span className="font-medium text-slate-100">{c.label}</span>
                          </>
                        ) : (
                            <>
                              {/* ONE LINE, the explanation in its hover — it was a
                                  paragraph inside this cell, and the family asked
                                  for the notes inside the tables to go. */}
                              <span className="text-slate-400"
                                title={`${c.securities.join(", ")} — no appraisal, fact sheet or transaction statement in this drop carries an asset class for ${c.securities.length === 1 ? "it" : "them"}, so none is asserted; "Mutual Fund" in a printed name is not a classification a statement made. It keeps its own line rather than being added into the bucket above, so the absence is not buried inside a labelled group. This line is not the account's cash sweep: a lot's class is joined from the same security's rows elsewhere in this drop, and the other liquid-fund instruments these mandates sweep into are carried on other reports here — so those lots come back classified and are netted inside the bucket above. What this line separates is the lots nothing classifies, which is a smaller set than the sweep and does not measure it.`}>
                                {DASH} no asset class on any statement
                                {c.heldNote ? <> · inside {c.heldNote}</> : null}
                                {" "}· {c.securities.length} {c.securities.length === 1 ? "security" : "securities"}
                              </span>
                            </>
                          )}
                      </td>
                      <td className="px-4 py-2.5 text-right mono text-slate-400">{c.lots}</td>
                      <td className={`px-4 py-2.5 text-right mono ${changeColor(c.st ?? 0)}`}>{fmtFromBase(c.st ?? 0, { compact: true, sign: true })}</td>
                      <td className={`px-4 py-2.5 text-right mono ${changeColor(c.lt ?? 0)}`}>{fmtFromBase(c.lt ?? 0, { compact: true, sign: true })}</td>
                      <td className={`px-4 py-2.5 text-right mono font-semibold ${changeColor(tot)}`}>{fmtFromBase(tot, { compact: true, sign: true })}</td>
                    </Tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-ink-600 font-semibold">
                <TrFoot view={bucketView} className="px-4 py-2.5 text-slate-200"
                  label={<>Total — the canonical figure</>}
                  cells={{
                    lots: <td key="lots" className="px-4 py-2.5 text-right mono text-slate-400">{byBucket.reduce((s, c) => s + c.lots, 0)}</td>,
                    st: <td key="st" className={`px-4 py-2.5 text-right mono ${changeColor(totRealST ?? 0)}`}>{fmtFromBase(totRealST ?? 0, { compact: true, sign: true })}</td>,
                    lt: <td key="lt" className={`px-4 py-2.5 text-right mono ${changeColor(totRealLT ?? 0)}`}>{fmtFromBase(totRealLT ?? 0, { compact: true, sign: true })}</td>,
                    total: <td key="total" className={`px-4 py-2.5 text-right mono ${changeColor(realisedTotal ?? 0)}`}>{fmtFromBase(realisedTotal ?? 0, { compact: true, sign: true })}</td>,
                  }} />
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <Card className="mt-5" title="Realised gains by account"
        subtitle="Short- and long-term as the MANAGER split them — a tax determination taken from the statement, not re-derived here"
        pad={false}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-ink-700">
              <Tr view={acctView}>
                <SortHeader col="account" view={acctView} align="left">Account</SortHeader>
                <SortHeader col="window" view={acctView} align="left">Window</SortHeader>
                <SortHeader col="lots" view={acctView}>Lots</SortHeader>
                <SortHeader col="realST" view={acctView}>Realised ST</SortHeader>
                <SortHeader col="realLT" view={acctView}>Realised LT</SortHeader>
                <SortHeader col="unrealST" view={acctView} sortable={false}>Unrealised ST</SortHeader>
                <SortHeader col="unrealLT" view={acctView} sortable={false}>Unrealised LT</SortHeader>
              </Tr>
            </thead>
            <tbody className="divide-y divide-ink-700/70">
              {acctReported.map((c) => (
                <Tr view={acctView} key={c.entity} className="hover:bg-ink-700/40" data-cg-account={c.entity}>
                  <td className="px-4 py-2.5 font-medium text-slate-100">{c.entity}</td>
                  <td className="px-4 py-2.5 text-[11px] text-slate-400">{c.periodFrom} → {c.periodTo}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">{c.lots ?? DASH}</td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(c.realisedST ?? 0)}`}>
                    {fmtFromBase(c.realisedST ?? 0, { compact: true, sign: true })}
                  </td>
                  <td className={`px-4 py-2.5 text-right mono ${changeColor(c.realisedLT ?? 0)}`}>
                    {fmtFromBase(c.realisedLT ?? 0, { compact: true, sign: true })}
                  </td>
                  <td className="px-4 py-2.5 text-right mono"><AbsentCell reason="needs lot acquisition dates" /></td>
                  <td className="px-4 py-2.5 text-right mono"><AbsentCell reason="needs lot acquisition dates" /></td>
                </Tr>
              ))}
              {acctMissing.length > 0 && (
                <tr className={TREE_ROW.section} data-cg-missing={acctMissing.length}>
                  <TreeSectionCell colSpan={acctView.order.length}
                    title={`No capital gain statement · ${acctMissing.length} ${acctMissing.length === 1 ? "account" : "accounts"}`}
                    marker={<Pill tone="warn" className="whitespace-nowrap">missing data</Pill>}
                    hint={`${acctMissing.length === 1 ? "This account publishes" : `These ${acctMissing.length} accounts publish`} no capital gain statement in this drop, so ${acctMissing.length === 1 ? "it carries" : "they carry"} no realised figure — excluded from the total, never counted as zero.`}
                    open={missingOpen} onToggle={() => setMissingOpen((o) => !o)}
                    toggleData={{ "data-cg-missing-toggle": missingOpen ? "open" : "closed" }} />
                </tr>
              )}
              {/* AN ACCOUNT THAT REPORTS NOTHING IS ONE CELL, NOT SIX, so that
                  row cannot be permuted like the others — `<Tr>` refuses a cell
                  count that does not match the columns, deliberately. Its span
                  is `order.length - 1`, which is order-independent because the
                  first column never moves; the reason is the dash's hover. */}
              {missingOpen && acctMissing.map((c) => (
                <tr key={c.entity} className={TREE_ROW.child} data-cg-missing-row={c.entity}>
                  <td className="px-4 py-1.5 pl-11 text-slate-300">{c.entity}</td>
                  <td className="px-4 py-1.5 text-slate-500" colSpan={acctView.order.length - 1}><AbsentCell reason={c.absent ?? undefined} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-ink-700 font-semibold">
              <TrFoot view={acctView} className="px-4 py-2.5 text-slate-200"
                label={<>Total</>}
                cells={{
                  lots: <td key="lots" className="px-4 py-2.5 text-[11px] text-slate-500">{reported.length} of {cg.length} accounts</td>,
                  realST: (
                    <td key="realST" className={`px-4 py-2.5 text-right mono ${changeColor(totRealST ?? 0)}`}>
                      {totRealST === null ? <AbsentCell /> : fmtFromBase(totRealST, { compact: true, sign: true })}
                    </td>
                  ),
                  realLT: (
                    <td key="realLT" className={`px-4 py-2.5 text-right mono ${changeColor(totRealLT ?? 0)}`}>
                      {totRealLT === null ? <AbsentCell /> : fmtFromBase(totRealLT, { compact: true, sign: true })}
                    </td>
                  ),
                  unrealST: <td key="unrealST" className="px-4 py-2.5 text-right mono"><AbsentCell reason="needs lot acquisition dates" /></td>,
                  unrealLT: <td key="unrealLT" className="px-4 py-2.5 text-right mono"><AbsentCell reason="needs lot acquisition dates" /></td>,
                }} />
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
        {/* ── Hold-to-LTCG planner: dormant, with its reason ── */}
        <Card title="Hold-to-LTCG planner"
          subtitle={holdCandidates.length
            ? `Short-term winners nearing their 1-year mark. Counted to today, ${fmtDate(today)}.`
            : "Deferring a short-term winner past one year moves its gain from 20% to 12.5%"}>
          {holdCandidates.length === 0 ? (
            <AbsentSection
              what={datedLots.length ? "No short-term winner to defer" : "No lot acquisition dates in this book"}
              needs={datedLots.length
                ? `Nothing left to defer on the ${datedAccounts.length === 1 ? "one account" : `${datedAccounts.length} accounts`} that publish lot dates. The planner covers ${datedLots.length} position(s) on ${datedAccounts.join(", ")} — the only
                  account(s) here whose broker publishes a LOT REGISTER with dated acquisitions. None of them is
                  currently a short-term holding at a gain, so there is nothing to defer. No other account's
                  statements date the lots still held: a managed account's capital register is a capital-account
                  ledger — contributions, withdrawals, TDS transfers — and a depository, fund or folio statement
                  reports what is held, not when each unit was bought, so those lots cannot be aged at all.`
                : `The planner works out how long each lot has left before its gain becomes long-term, which
                  needs the date that lot was bought. The CAPITAL REGISTER these managers issue is a
                  capital-account ledger — contributions, withdrawals, TDS transfers — not a lot register, and no
                  other statement in the drop carries acquisition dates. A lot-level holding statement switches
                  this on; the calculation is already wired and dormant.`} />
          ) : (
            <div className="max-h-[440px] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                  <Tr view={holdView}>
                    <SortHeader col="security" view={holdView} align="left">Security</SortHeader>
                    <SortHeader col="gain" view={holdView}>Unreal. gain</SortHeader>
                    <SortHeader col="turns" view={holdView}>Turns LT</SortHeader>
                    <SortHeader col="saved" view={holdView}>Tax saved</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/70">
                  {holdShown.map((h) => (
                    <Tr view={holdView} key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/40">
                      <td className="px-4 py-2.5 text-slate-100"><StockLink securityKey={h.securityKey} name={h.security} /></td>
                      <td className="px-4 py-2.5 text-right mono text-gain">{money(h.unrealizedPnL)}</td>
                      <td className="px-4 py-2.5 text-right text-[11px] text-slate-400">{fmtDate(h.ltDate)} · {h.daysLeft}d</td>
                      <td className="px-4 py-2.5 text-right mono text-champagne-400">{money(h.saving)}</td>
                    </Tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Loss harvesting: real, minus the part that isn't ── */}
        <Card title="Tax-loss harvesting" subtitle="Positions underwater — booking a loss can offset realised gains"
          right={<SearchInput value={harvestQ} onChange={setHarvestQ} placeholder="Search security…" className="w-44"
            suggestions={harvest.map((x) => x.security)} />}>
          {harvest.length === 0 ? (
            <AbsentSection what="No position is in unrealised loss"
              needs="Every priced holding in the book is above its cost, so there is nothing to harvest." />
          ) : (
            <>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className="text-[11.5px] text-slate-400" data-xa="cg-harvest-caption"
                  data-rows={harvest.length} data-nav-turned={turnedRows.length}
                  title={turnedRows.length
                    ? `On their statements' marks. At AMFI's published NAV ${turnedRows.map((h) => `${h.security} is a gain of ${money(navTurned(h)!.pnl, true)}`).join("; ")} — so ${turnedRows.length === 1 ? "that loss is" : "those losses are"} not there to book now.`
                    : "On their statements' marks; each row names the date its loss is marked at."}>
                  {/* A COUNT, NOT A SENTENCE (Stage 10cp): which marks the loss is
                      struck on is the first line of this caption's own hover. */}
                  {harvest.length} position{harvest.length === 1 ? "" : "s"} underwater
                  {turnedRows.length > 0 && <> · <span className="text-amber-400">{turnedRows.length} no longer at a loss at AMFI&rsquo;s NAV</span></>}
                </span>
                <span className="mono text-[13px] text-loss">{money(harvestTotal, true)}</span>
              </div>
              <div className="max-h-[380px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-ink-800 border-b border-ink-700">
                    <Tr view={harvestView}>
                      <SortHeader col="security" view={harvestView} align="left">Security</SortHeader>
                      <SortHeader col="entity" view={harvestView} align="left">Entity</SortHeader>
                      <SortHeader col="loss" view={harvestView}>Unreal. loss</SortHeader>
                      <SortHeader col="return" view={harvestView}>Return</SortHeader>
                      <SortHeader col="marked" view={harvestView}>Marked</SortHeader>
                      <SortHeader col="term" view={harvestView} sortable={false}>ST / LT</SortHeader>
                    </Tr>
                  </thead>
                  <tbody className="divide-y divide-ink-700/70">
                    {harvestShown.map((h) => (
                      <Tr view={harvestView} key={h.securityKey + "@" + h.accountId} className="hover:bg-ink-700/40">
                        <td className="px-4 py-2.5 text-slate-100" data-xa="cg-harvest-row" data-key={h.securityKey}
                          data-account={h.accountId} data-marked={accountAsOf.get(h.accountId) ?? ""}
                          data-nav-turned={navTurned(h) ? "1" : "0"}>
                          <StockLink securityKey={h.securityKey} name={h.security} />
                          {h.assetClass === "AIF" && (
                            <span className="ml-1.5 text-[10.5px] text-slate-500"
                              title="An AIF unit is exited by redeeming it with the fund or transferring it. No statement here reports whether this fund permits either before it winds up, so whether this loss can be booked is a question for the fund — not a figure this page can settle.">
                              AIF unit · exit terms not reported
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">{ownerOf(accIdx, h)}</td>
                        <td className="px-4 py-2.5 text-right mono text-loss">
                          {money(h.unrealizedPnL, true)}
                        </td>
                        <td className={`px-4 py-2.5 text-right mono ${changeColor(h.returnPct)}`}>
                          {fmtPct(h.returnPct, { sign: true, decimals: 1 })}
                        </td>
                        <td className="px-4 py-2.5 text-right mono text-slate-400 whitespace-nowrap">
                          {fmtDate(accountAsOf.get(h.accountId) ?? asOf)}
                          {navTurned(h) && (
                            <span className="text-amber-400"
                              title={`AMFI's published NAV of ${fmtDate(navTurned(h)!.date)} values this holding at a gain of ${money(navTurned(h)!.pnl, true)} — the loss beside it is its statement's, and is not there to book now.`}>
                              {" "}· NAV {money(navTurned(h)!.pnl, true)}
                            </span>
                          )}
                        </td>
                        {(() => {
                          const term = termOf(h);
                          if (!term) {
                            return (
                              <td className="px-4 py-2.5 text-right mono">
                                <AbsentCell reason="this account's statements carry no lot acquisition date, so the holding period is unknown" />
                              </td>
                            );
                          }
                          const label = term.hasST && term.hasLT ? "ST + LT" : term.hasST ? "ST" : term.hasLT ? "LT" : DASH;
                          const turnsNote = term.turns
                            ? term.turns <= today
                              ? ` Its first short-term lot turned long-term on ${fmtDate(term.turns)}, so some or all of it is long-term now.`
                              : ` Its first short-term lot turns long-term on ${fmtDate(term.turns)}.`
                            : "";
                          return (
                            <td className="px-4 py-2.5 text-right mono whitespace-nowrap" data-xa="cg-term" data-key={h.securityKey}
                              data-account={h.accountId} data-st={h.stCostBasis ?? ""} data-lt={h.ltCostBasis ?? ""}
                              data-turns={term.turns ?? ""}
                              title={`From the broker's lot register, at the statement date (${fmtDate(term.from)}): short-term cost ${money(h.stCostBasis ?? 0)}, long-term cost ${money(h.ltCostBasis ?? 0)}.${turnsNote}`}>
                              {label}
                              {term.turns && (
                                <span className="text-[10.5px] text-slate-500">
                                  {term.turns <= today ? ` → LT ${fmtDate(term.turns)}` : ` until ${fmtDate(term.turns)}`}
                                </span>
                              )}
                            </td>
                          );
                        })()}
                      </Tr>
                    ))}
                    {harvestRows.length === 0 && (
                      <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                        No security matches "{harvestQ}".
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ONE LINE, the detail in its hover — the family asked for the notes
          around the tables to go. "Illustrative", "per taxpayer" and "not tax
          advice" stay on screen: a tax figure read without them is read as
          advice, and a per-person estimate read as a pooled one (XA-1). */}
      {/* `data-prose-ok`: the one caveat kept on screen for the harm its
          absence could do — a tax figure read without it is read as advice
          (Stage 10ci) — and so the one line the no-explainer sweep excuses. */}
      <p className="mt-4 text-[11px] text-slate-500" data-prose-ok="tax caveat"
        title={`Current Indian equity rates (STCG 20% u/s 111A, LTCG 12.5% u/s 112A), struck per taxpayer — each person over their own accounts, so one member's loss never reduces another member's tax. A short-term loss is set off against the same person's long-term gain within one financial year (s.70(2)) and a long-term loss against a long-term gain only (s.70(3)); they do not apply the ₹1.25L LTCG exemption, carry a loss across years, or add surcharge and cess. The realised figure also includes the managers' liquid-fund redemptions (Ledger Insights' Realised tab names them), which s.50AA taxes at the holder's slab rate rather than these equity rates${priorYear.length > 0
          ? `, and ${priorYear.join(", ")} ${priorYear.length === 1 ? "reports a window" : "report windows"} reaching back before ${fmtDate(fyStart)}, into an earlier financial year`
          : ""} — this estimate separates neither. This page is on a statement basis so every figure ties to the source PDF: realised figures are as each manager's capital gain statement reports them, each over its own window, and unrealised figures are at the statement mark — the live feed does not move them here.`}>
        Tax figures are <span className="font-medium text-slate-400">illustrative</span> · per taxpayer · statement basis · not tax advice
      </p>
    </div>
  );
}
