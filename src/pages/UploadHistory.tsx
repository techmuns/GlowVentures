import { History, ArrowUp, ArrowDown } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { usePortfolio } from "@/context/PortfolioContext";
import { AbsentSection, DASH } from "@/components/Absent";
import { fmtDate, fmtPct } from "@/lib/format";
import { dedupedPositions, marketSides } from "@/lib/analytics";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";

/** The columns, in the order this table's rows write their cells. */
const HISTORY_COLS = ["asOf", "nav", "change", "flowIn", "marked"] as const;
import { BOOK_NAV_COVERAGE } from "@/data/glowData";

export function UploadHistory() {
  const view = useTableView("upload-history", HISTORY_COLS);
  const { portfolio, fmtFromBase } = usePortfolio();
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
  const sides = marketSides(dedupedPositions(portfolio.positions));
  const rows = nav.map((n, i) => {
    const prev = i > 0 ? nav[i - 1].nav : null;
    const growth = prev ? (n.nav / prev - 1) * 100 : null;
    return { ...n, growth, flowIn: n.flowIn ?? 0, latest: i === nav.length - 1 };
  }).reverse();
  // Newest first is this page's own order and stays the default; a third click
  // on any heading hands it back.
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
          ? <span title="One point per date on which a covered account restated. Every other account is held at its latest mark, and Morning CIO names the ones that cannot supply a series at all.">
              Dated valuations over the {covered} of {accounts} accounts that publish more than one</span>
          : "Dated portfolio valuations from the accounts that publish more than one."}
        right={<Pill tone="info">{nav.length} dated points</Pill>} />
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
              <SortHeader col="change" view={view} pad="px-5 py-3">Change</SortHeader>
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
                    <span className={`mono inline-flex items-center gap-1 ${r.growth >= 0 ? "text-gain" : "text-loss"}`}>
                      {r.growth >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {fmtPct(r.growth, { decimals: 2 })}
                    </span>
                  ) : <span className="text-slate-600" title="the first point has nothing before it to change from">{DASH}</span>}
                </td>
                <td className="px-5 py-3.5 text-right mono">
                  {/* A ZERO HERE IS MEASURED — no capital moved — and a dash is
                      the first point, which has no interval behind it. */}
                  {r.growth == null
                    ? <span className="text-slate-600" title="the first point has no interval before it, so no capital can have entered one">{DASH}</span>
                    : <span className={r.flowIn ? "text-amber-400" : "text-slate-500"}
                        title={r.flowIn
                          ? "External capital the covered accounts took in since the previous point. This much of the change beside it is money added rather than value earned."
                          : "No external capital entered or left the covered accounts in this interval, so the whole change beside it is a change in value."}>
                        {r.flowIn ? fmtFromBase(r.flowIn, { compact: true, sign: true }) : fmtFromBase(0, { compact: true })}
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
        <p className="mt-3 text-[11.5px] text-slate-500"
          title="No subscription or withdrawal reached a covered account in that interval, so the whole change beside it is a change in value. Where capital did move, that much of the change is money added rather than earned, and Morning CIO's NAV chart nets it out before comparing the book against the Nifty 500. Four covered accounts publish no dated capital record at all; they are named there too.">
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
              Total {fmtFromBase(portfolio.totalValue, { compact: true })} · as of {fmtDate(portfolio.asOf)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
