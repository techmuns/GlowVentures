import { History, ArrowUp, ArrowDown } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { AbsentSection, AbsentCell, DASH } from "@/components/Absent";
import { fmtDate, fmtPct } from "@/lib/format";
import { dedupedPositions, marketSides } from "@/lib/analytics";
import { navIndexSeries } from "@/lib/navSeries";
import { valuationBasis, valuationBasisLine, valuationBasisNote } from "@/lib/valuationBasis";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";

/** The columns, in the order this table's rows write their cells. */
const HISTORY_COLS = ["asOf", "nav", "change", "flowIn", "marked"] as const;
import { BOOK_NAV_COVERAGE } from "@/data/glowData";

export function UploadHistory() {
  const view = useTableView("upload-history", HISTORY_COLS);
  const { portfolio, statementPortfolio, fmtFromBase } = usePortfolio();
  if (!portfolio) return null;
  /**
   * WHAT THIS SERIES IS CHANGED UNDER THIS PAGE, AND THE CAPTIONS HAD TO MOVE.
   *
   * `navHistory` was empty for several drops and this page said so, in words
   * written for the series it EXPECTED: "year-end listed-book snapshots, as
   * reported by the ingested performance-history statements". None of those
   * three claims is true of the series that now exists — the points are
   * STATEMENT DATES inside a five-week window, they span every asset class the
   * covered accounts hold, and they come from each account's authoritative
   * HOLDINGS issue rather than from a performance-history report.
   *
   * An absence's wording surviving the arrival of the data is the same defect
   * as an absence recorded against an unchecked premise: three sentences that
   * were correct while there was nothing to describe, and wrong the moment
   * there was. Every caption below now describes the series in `navHistory`,
   * and the coverage — 13 of 49 accounts — is on the page rather than implied.
   */
  const nav = portfolio.navHistory;
  const cov = BOOK_NAV_COVERAGE;
  const covered = cov.covered.length;
  const accounts = covered + cov.single.length + cov.unvalued.length;
  /**
   * EVERY SIDE THE BOOK HAS, for the snapshot line below.
   *
   * AND IT REPLACES A GATE THAT WAS READING THE WRONG MODEL. The line used to
   * print the private half only when `portfolio.privateMarkets` held something
   * — six arrays that are EMPTY in this book (Stage 10m) — so it rendered
   * `Private —` with the hover "No private-market holding in this book" over a
   * book with a ₹352 Cr private half. That is the exact failure
   * `publicPrivateSplit`'s own note records on the Family Dashboard, alive on a
   * second page: a card gated on the fund-of-funds model rather than on the
   * holdings, and wrong in the direction that DENIES a figure.
   */
  const book = dedupedPositions(portfolio.positions);
  const sides = marketSides(book);
  // THE TOTAL'S OWN BASIS, NOT THE BOOK'S NEWEST DATE. "as of 29 Aug 2026" is
  // the two trusts' quantity-only NSDL statements; the total beside it is
  // struck on marks dated 31 Mar → 13 Aug and, for every fund AMFI prices, on
  // a NAV published weeks later. `valuationBasis` names both, and what the
  // statements marked the NAV part at, so this line ties back to the PDFs.
  const vb = valuationBasis(book, portfolio.accounts,
    statementPortfolio ? dedupedPositions(statementPortfolio.positions) : undefined);
  /**
   * THE CHANGE IS THE LINK, NEVER THE LEVEL.
   *
   * This read `nav / previous nav − 1` on the raw level — and the level is a
   * GROWING panel: accounts join the series on the date they first publish, so
   * 25 Jun read +68.18%, 6 Jul +33.92% and 10 Jul +105.63% with ₹0 of capital
   * beside each and a footnote calling the whole step a change in value. Every
   * one of those was accounts ARRIVING (Green Lantern, V.E.C, Carnelian and the
   * two Goldstandards), and like for like each interval moved 0.00%.
   *
   * Each point already carries the interval ending at it, struck over the
   * accounts valued at BOTH its ends (`linkOpen`, `linkClose`) — the link the NAV
   * chart chains. `navIndexSeries` is the one place that chains it, so this
   * column and that chart cannot state two returns for one interval. An interval
   * with nothing to strike it over is a dash with its reason, never 0.00%.
   */
  const index = navIndexSeries(nav);
  const rows = nav.map((n, i) => {
    const open = i > 0 ? (n.linkOpen ?? nav[i - 1].nav) : null;
    // An account in the link that was NOT re-marked on this date is carried at
    // its earlier mark, so its contribution to the link is 1 by construction.
    // Where every account in the link is carried, the interval measured nothing
    // — a dash with its reason, never a 0.00% that reads as "the value held".
    const remarked = (n.linkAccounts ?? 0) - (n.accountsCarried ?? 0);
    const growth = i > 0 && open != null && open > 0 && remarked > 0 && index[i] && index[i - 1]
      ? (index[i].index / index[i - 1].index - 1) * 100 : null;
    const why = i === 0 ? "the first point has nothing before it to change from"
      : !(open != null && open > 0) ? "no account is valued on both this date and the one before, so there is nothing to strike a change over"
      : remarked <= 0 ? `no account valued on both this date and the one before was re-marked on this one — the ${n.accountsCarried ?? 0} in the link are held at their earlier marks, so this interval measured no change at all`
      : null;
    const levelChange = i > 0 && nav[i - 1].nav > 0 ? (n.nav / nav[i - 1].nav - 1) * 100 : null;
    // How many accounts the level carries that the link does not: the ones that
    // published for the first time on this date.
    const joined = i > 0 ? Math.max(0, (n.accountsOnDate ?? 0) + (n.accountsCarried ?? 0) - (n.linkAccounts ?? 0)) : 0;
    // Value that restated on this date in accounts that publish NO dated
    // capital record: capital into them is not measured, so a ₹0 beside it is
    // a sum over the accounts that do publish one, not a measurement of all.
    const unreported = n.unreportedFlowValue ?? 0;
    return { ...n, growth, why, levelChange, joined, unreported, flowIn: n.flowIn ?? 0, latest: i === nav.length - 1, first: i === 0 };
  }).reverse();
  // Newest first is this page's own order and stays the default; a third click
  // on any heading hands it back.
  /**
   * ── WHERE A ₹0 UNDER CAPITAL IN IS MEASURED, AND WHERE IT IS NOT (XA-19) ───
   *
   * The footnote said every ₹0 in this column is measured. On 30 Jun and 31 Jul
   * accounts that publish no dated capital record restated — ₹26.4 Cr and
   * ₹28.3 Cr of value — so capital into them is unknown, and the ₹0 there was a
   * sum over the other accounts wearing the word "measured". Those cells are a
   * dash with the reason now, and the footnote names the dates.
   */
  const unmeasured = rows.filter((r) => r.growth != null && r.unreported > 0);
  const unreportedAccounts = cov.covered.filter((c) => c.flowBasis === "unreported").length;
  // The panel GROWS until every covered account has published once; before
  // then an account that has not yet published is absent, not carried.
  const completeFrom = cov.panelCompleteFrom ?? null;
  const growing = !!completeFrom && nav.length > 0 && nav[0].date < completeFrom;
  const shown = sortRows(rows, view.sort, {
    asOf: (r) => r.date,
    nav: (r) => r.nav,
    change: (r) => r.growth,
    flowIn: (r) => r.flowIn,
    marked: (r) => r.accountsOnDate ?? null,
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Admin" title="Snapshot History"
        subtitle={nav.length
          ? `Dated valuations over the ${covered} of ${accounts} accounts that publish more than one. One point per date on which a covered account restated. ${growing
              ? `Until ${fmtDate(completeFrom!)} a covered account that has not yet published is not in the point at all; from then on every one is, and one that did not restate is held at its latest mark.`
              : "An account that did not restate on a date is held at its latest mark."} Morning CIO names the ones that cannot supply a series at all.`
          : "Dated portfolio valuations from the accounts that publish more than one."}
        right={<div className="flex items-center gap-2">
          {/* THE COVERAGE IS A FIGURE, SO IT IS ON SCREEN (Stage 10p) — the
              sentence around it is the headline's hover since Stage 10cp. */}
          {nav.length > 0 && <Pill>{covered} of {accounts} accounts</Pill>}
          <Pill tone="info">{nav.length} dated points</Pill>
        </div>} />
      {/* An empty table is still a table: header row, column names, and nothing
          under them reads as "we looked and there were no snapshots". There are
          none because no performance-history statement in this drop prints a
          dated portfolio value series — say that instead of drawing the frame. */}
      {nav.length === 0 ? (
        <Card>
          <AbsentSection
            what="No account in this book publishes more than one dated valuation"
            needs="A series needs the same account valued at two or more dates. Every account here publishes exactly
              one, or none, so there is no set over which a series could hold its composition constant — the next
              monthly reissue of any statement already in the archive starts one." />
        </Card>
      ) : (
      <Card pad={false}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-ink-700">
            <Tr view={view}>
              <SortHeader col="asOf" view={view} align="left" pad="px-5 py-3">As of</SortHeader>
              {/* NOT "LISTED NAV". This series runs over every asset class the
                  covered accounts hold — AIF folios, mutual funds and cash
                  sleeves included — and the old heading narrowed a figure it
                  does not narrow, which is the same failure as one that widens
                  it (see Morning CIO's Capital invested tile). */}
              <SortHeader col="nav" view={view} pad="px-5 py-3">Covered NAV</SortHeader>
              <SortHeader col="change" view={view} pad="px-5 py-3"
                title="Like for like: the change in value over the accounts valued at BOTH this date and the one before, net of the capital they took in — the link the NAV chart chains. An account publishing for the first time adds to the Covered NAV and to none of this.">Change · like for like</SortHeader>
              {/* AND A STEP IS NOT ALL PERFORMANCE. `flowIn` is the external
                  capital the covered accounts took in since the previous point;
                  a +8% step with ₹11.2 Cr of deposits behind it is money added,
                  not money earned, and the column says so beside the change. */}
              <SortHeader col="flowIn" view={view} pad="px-5 py-3">Capital in</SortHeader>
              {/* NOT "STATUS · Archived / Active". Nothing here is archived —
                  these are statement dates, and every one of them still stands.
                  The composition is the fact worth carrying: how many of the
                  covered accounts are marked ON this date and how many are held
                  at an earlier one, which is the "N accounts behind" the
                  headline NAV already states. */}
              <SortHeader col="marked" view={view} align="left" pad="px-5 py-3">Marked on this date</SortHeader>
            </Tr>
          </thead>
          <tbody className="divide-y divide-ink-700/70">
            {shown.map((r) => (
              <Tr view={view} key={r.period} className="hover:bg-ink-700/40">
                <td className="px-5 py-3.5 font-medium text-slate-100">{fmtDate(r.date)}</td>
                <td className="px-5 py-3.5 text-right mono text-slate-200">{fmtFromBase(r.nav, { compact: true })}</td>
                <td className="px-5 py-3.5 text-right">
                  {/* Signed both ways: a green up-arrow on a fall is a lie the
                      reader has no way to catch from the number beside it. */}
                  {r.growth != null ? (
                    <span className={`mono inline-flex items-center gap-1 ${r.growth >= 0 ? "text-gain" : "text-loss"}`}
                      data-xa="history-change" data-date={r.date} data-link={r.growth}
                      data-level={r.levelChange ?? ""} data-joined={r.joined}
                      title={r.joined > 0
                        ? `${r.joined} account${r.joined === 1 ? "" : "s"} published for the first time on this date, so the Covered NAV beside this steps by ${r.levelChange == null ? "their value" : `${fmtPct(r.levelChange, { decimals: 2 })} with them in it`} — an arrival, not a return. This figure is struck over the ${r.linkAccounts ?? 0} accounts valued on both dates.`
                        : `Struck over the ${r.linkAccounts ?? 0} accounts valued on both dates, net of the capital they took in.`}>
                      {r.growth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {fmtPct(r.growth, { decimals: 2 })}
                    </span>
                  ) : <span data-xa="history-change" data-date={r.date} data-link="" data-joined={r.joined}>
                      <AbsentCell reason={`${r.why ?? "no change can be struck over this interval"}${r.joined > 0
                        ? `. ${r.joined} account${r.joined === 1 ? "" : "s"} published for the first time on this date — the Covered NAV beside this steps with ${r.joined === 1 ? "it" : "them"} in it, an arrival rather than a return`
                        : ""}.`} />
                    </span>}
                </td>
                <td className="px-5 py-3.5 text-right mono" data-xa="history-capital" data-date={r.date}
                  data-kind={r.first ? "first" : r.growth == null ? "unlinked" : r.unreported > 0 ? "unmeasured" : "measured"}
                  data-flow={r.flowIn} data-unreported={r.unreported}>
                  {/* A ZERO HERE IS MEASURED ONLY WHERE EVERY ACCOUNT THAT
                      RESTATED PUBLISHES A DATED CAPITAL RECORD. A dash is the
                      first point, an interval that measured nothing, or one
                      where part of the restated value has no capital record. */}
                  {r.growth == null
                    ? <AbsentCell reason={r.first
                        ? "the first point has no interval before it, so no capital can have entered one"
                        : `${r.why ?? "no change can be struck over this interval"}, so no capital is attributed to it`} />
                    : r.unreported > 0 && !r.flowIn
                      ? <AbsentCell reason={`₹0 on the accounts that publish a dated capital record — but ${fmtFromBase(r.unreported, { compact: true })} of the value that restated on this date is in accounts that publish none, so what capital entered them is not measured, and the change beside it is not proven to be performance`} />
                      : <span className={r.flowIn ? "text-amber-400" : "text-slate-500"}
                          title={r.flowIn
                            ? `External capital the covered accounts took in since the previous point. This much of the change beside it is money added rather than value earned.${r.unreported > 0 ? ` ${fmtFromBase(r.unreported, { compact: true })} of the value that restated sits in accounts that publish no capital record, so the true figure may be larger.` : ""}`
                            : "No external capital entered or left the covered accounts in this interval, so the whole change beside it is a change in value."}>
                          {r.flowIn ? fmtFromBase(r.flowIn, { compact: true, sign: true }) : fmtFromBase(0, { compact: true })}{r.flowIn && r.unreported > 0 ? "*" : ""}
                        </span>}
                </td>
                <td className="px-5 py-3.5 text-slate-400">
                  {r.accountsOnDate != null
                    ? <span title={`${r.accountsCarried} of the ${covered} covered accounts are held at an earlier mark on this date.`}>
                        {r.accountsOnDate} of {covered}
                      </span>
                    : <span className="text-slate-600" title="this point carries no composition breakdown">{DASH}</span>}
                </td>
              </Tr>
            ))}
          </tbody>
        </table>
      </Card>
      )}
      {nav.length > 0 && (
        /* THE REASON FOR A ₹0 IS UNDER THE TABLE, NOT ONLY IN A HOVER. §2 keeps
           a computed zero and requires its cause on screen; seven per-row
           sentences would be unreadable, so the column's rule is stated once. */
        // `data-prose-ok`: A MEASURED ZERO'S REASON GOES ON THE FACE, never in a
        // tooltip (Convention 2) — so the no-explainer sweep excuses this line.
        <p className="mt-3 text-[11.5px] text-slate-500" data-prose-ok="measured zero"
          title={`No subscription or withdrawal reached a covered account in that interval, so the whole change beside it is a change in value.${unmeasured.length
            ? ` On ${unmeasured.map((r) => fmtDate(r.date)).join(" and ")} some of the value that restated — ${unmeasured.map((r) => fmtFromBase(r.unreported, { compact: true })).join(" and ")} — sits in accounts that publish no dated capital record, so Capital in there is a dash rather than ₹0 and the change beside it is not proven to be performance.`
            : ""} Where capital did move, that much of the change is money added rather than earned, and Morning CIO's NAV chart nets it out before comparing the book against the Nifty 500. ${unreportedAccounts} covered account${unreportedAccounts === 1 ? " publishes" : "s publish"} no dated capital record at all; they are named there too.`}>
          <strong className="text-slate-400">₹0 under Capital in is measured</strong> — no money came in or went out in that interval.
        </p>
      )}
      <Card className="mt-5" title="Current consolidated snapshot">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md border border-champagne-500/30 bg-champagne-500/10 text-champagne-400"><History className="h-5 w-5" /></div>
          <div>
            <div className="text-sm text-slate-200">{portfolio.fileName}</div>
            {/* EVERY SIDE THE BOOK HAS, from `marketSides`, so these terms
                and the Total beside them always add up. It read a fixed
                `Listed X · Private Y`, which stopped tying to its own Total the
                moment a third side existed — and a side with no rows is left
                out of the list rather than printed as ₹0, which is the same
                guard the old `hasPrivate` branch was doing by hand. */}
            <div className="text-xs text-slate-500">
              {sides.length === 0
                ? <span title="No holding in this book carries a value.">{DASH}</span>
                : sides.map((x) => (
                    <span key={x.key} title={x.why}>
                      {x.label} {fmtFromBase(x.value, { compact: true })} ·{" "}
                    </span>
                  ))}
              Total {fmtFromBase(portfolio.totalValue, { compact: true })}
            </div>
            <div className="mt-0.5 text-[11.5px] text-slate-500" data-xa="history-total-basis"
              data-stmt-from={vb.statement.from ?? ""} data-stmt-to={vb.statement.to ?? ""}
              data-nav-value={vb.nav.value} data-nav-from={vb.nav.from ?? ""} data-nav-to={vb.nav.to ?? ""}
              data-nav-printed={vb.nav.statementValue ?? ""} data-nav-marked={vb.nav.markedValue}
              data-units-value={vb.units.value} data-units-rows={vb.units.rows}
              data-units-from={vb.units.from ?? ""} data-units-to={vb.units.to ?? ""}
              // THE FACE IS A LINE OF FIGURES, THE SENTENCE ITS HOVER (Stage 10cp):
              // which price each part is struck at and when stays on screen, because
              // a total dated by the wrong statement is the defect (XA-13); the
              // tie-back to the PDFs and the units no statement marks are the
              // hover on this same line.
              title={`${valuationBasisNote(vb, (n) => fmtFromBase(n, { compact: true }), fmtDate)}.${
                portfolio.asOf && vb.accountsTo && portfolio.asOf > vb.accountsTo
                  ? ` The book's newest statement is dated ${fmtDate(portfolio.asOf)}, and no holding it reports carries a value — so that date dates none of this total.`
                  : ""}`}>
              {valuationBasisLine(vb, (n) => fmtFromBase(n, { compact: true }), fmtDate)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
