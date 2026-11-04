import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { CalendarClock, Coins, Landmark, LineChart as LineIcon, Percent, TrendingUp } from "lucide-react";
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Card } from "@/components/Card";
import { Kpi } from "@/components/Kpi";
import { Pill } from "@/components/Pill";
import { PageNav } from "@/components/PageNav";
import { ExportableTable } from "@/components/ExportableTable";
import { AbsentCell, AbsentSection, AbsentValue, absentTile } from "@/components/Absent";
import { OutOfScope } from "@/components/MemberScopeSelect";
import { SortHeader, Tr } from "@/components/SortHeader";
import { useViewParam } from "@/components/ViewToggle";
import { usePortfolio, useWholePortfolio } from "@/context/PortfolioContext";
import { BOOK_CORPORATE_ACTIONS } from "@/data/glowData";
import { privateBookFolios, type BookFolio } from "@/lib/privateBook";
import { ownerDisplayName } from "@/lib/owners";
import { useTableView, sortRows, type Accessor } from "@/lib/tableView";
import { TREE_ROW } from "@/components/TreeTable";
import { chartTooltipStyle, chartTooltipLabelStyle } from "@/lib/chartTheme";
import { fmtDate, fmtNum } from "@/lib/format";
import {
  PRIVATE_ROUNDS, PRIVATE_MARKET_NEWS, privateCompanyById, companyMetrics, roundValues, sortedRounds, valuationPoints, stakeTrail,
  roundDateLabel, dayOf, fmtValuation, vendorOnly, ENTRY_WINDOW_DAYS, type FundingRound, type Headline, type PrivateCompany as Company, type Figure,
} from "@/lib/privateRounds";

/**
 * ── A PRIVATE COMPANY'S OWN PAGE (Stage 10ko) ──────────────────────────────
 *
 * The listed holdings have had a page each since the start — `/stock/:key`,
 * five tabs under a fixed header and KPI strip. A private company had only its
 * row on Private Market. This is the same template for one: the header and the
 * tiles stay put, and the tabs answer one question each —
 *
 *   Position        who holds it, through which account, when and at what cost
 *   Funding rounds  every priced round the company has raised, with its source,
 *                   the family's entry round marked, and the family's stake
 *                   where its statement carries a share count
 *   Valuation       the company's valuation round by round, as a line, with the
 *                   date the family invested on it
 *   News            the headlines that name it (Stage 10kt)
 *
 * Since Stage 10kt the rounds also carry Inc42's weekly funding table — the
 * rows behind Glow Central Research's News → Private Market tab, matched to
 * the company by its exact name (`npm run import-private-market`): every
 * investor in a round, its round size and type as Inc42 prints them, and the
 * company's sector, subsector and business model in Inc42's own words. A row
 * that is a researched round adds to it; one that is not is its own row,
 * marked "Inc42".
 *
 * The rounds are public reporting, not the family's statements
 * (`src/lib/privateRounds.ts`), so each one links its source, and a figure no
 * source prints is a dash with that reason. The holding itself stays at the
 * cost its statement carries: a round's valuation is shown BESIDE it, never
 * used to value it.
 */
const PC_TABS = [
  { key: "position", label: "Position", title: "Who holds it, through which account, when and at what cost" },
  { key: "rounds", label: "Funding rounds", title: "Every priced round the company has raised, each with its source" },
  { key: "valuation", label: "Valuation", title: "The company's valuation round by round, and when the family invested" },
  { key: "news", label: "News", title: "Headlines that name the company, from Glow Central Research's news capture" },
] as const;

const POS_COLS = ["entity", "account", "invested", "units", "cost", "value", "asOf"] as const;
const ROUND_COLS = ["date", "round", "raised", "pre", "post", "price", "stake", "investors", "allInvestors", "source"] as const;
const NEWS_COLS = ["at", "headline", "publisher"] as const;

const GRID_COLOR = "var(--chart-grid, #2b2668)";
const AXIS_COLOR = "var(--chart-axis, #6b6880)";
const LINE_COLOR = "#d9c48f";

/** Investment spans print a month where the source gives only a month. */
const spanText = (f: BookFolio) => (f.invested
  ? f.invested.from === f.invested.to ? roundDateLabel(f.invested.from) : `${roundDateLabel(f.invested.from)} → ${roundDateLabel(f.invested.to)}`
  : null);

/** A round's investors in one short line — the first names that fit, then how many more; the whole list is the hover. */
const INVESTORS_LINE = 90;
function investorsShort(list: readonly string[]): string {
  const shown: string[] = [];
  for (const name of list) {
    if (shown.length && [...shown, name].join(", ").length > INVESTORS_LINE) break;
    shown.push(name);
  }
  const more = list.length - shown.length;
  return more ? `${shown.join(", ")} +${more} more` : shown.join(", ");
}

/** Why a valuation is marked as a data vendor's (Stage 10kz). */
const VENDOR_WHY = "Only a data vendor's public page (Inc42 Datalabs, Tracxn, an IPO data site …) states this figure — no filing, offer document or press report of the round does. Shown for what it is, not as a filing.";

const noRoundsWhy = (n: number, note: string | null) => (n ? "no round prints what a stake needs" : note ?? "no credible source prints a priced round for this company");

export function PrivateCompany() {
  const { companyId = "" } = useParams();
  const company = privateCompanyById(companyId);
  if (!company) return <Navigate to="/private-market" replace />;
  return <CompanyPage company={company} />;
}

function CompanyPage({ company }: { company: Company }) {
  const { portfolio, fmtFromBase } = usePortfolio();
  const whole = useWholePortfolio();
  const [tab, setTab] = useViewParam(PC_TABS, {}, "tab");
  const posView = useTableView("pc-position", POS_COLS);
  const roundView = useTableView("pc-rounds", ROUND_COLS);
  const newsView = useTableView("pc-news", NEWS_COLS);

  const keys = useMemo(() => new Set(company.fundKeys), [company]);
  const folios = useMemo(() => (portfolio
    ? privateBookFolios(portfolio, BOOK_CORPORATE_ACTIONS, ownerDisplayName).folios.filter((f) => keys.has(f.fundKey) && !f.viewOf)
    : []), [portfolio, keys]);
  const wholeOwners = useMemo(() => (whole
    ? [...new Set(privateBookFolios(whole, BOOK_CORPORATE_ACTIONS, ownerDisplayName).folios
      .filter((f) => keys.has(f.fundKey)).map((f) => whole.accounts.find((a) => a.accountId === f.accountId)?.ownerId ?? null)
      .filter((x): x is string => !!x))]
    : []), [whole, keys]);

  // WHEN THE MONEY FIRST WENT IN — the earliest date any held line's own source prints.
  const investedFrom = folios.map((f) => f.invested?.from).filter((d): d is string => !!d).sort((a, b) => dayOf(a).localeCompare(dayOf(b)))[0] ?? null;
  const investedTo = folios.map((f) => f.invested?.to).filter((d): d is string => !!d).sort((a, b) => dayOf(a).localeCompare(dayOf(b))).at(-1) ?? null;
  const cost = folios.length && folios.every((f) => f.cost != null) ? folios.reduce((s, f) => s + (f.cost ?? 0), 0) : null;
  // A SHARE COUNT ONLY WHERE EVERY LINE CARRIES ONE — a part-count would strike a part-stake.
  const shares = folios.length && folios.every((f) => f.units != null) ? folios.reduce((s, f) => s + (f.units ?? 0), 0) : null;

  const m = useMemo(() => companyMetrics(company, investedFrom), [company, investedFrom]);
  const cur = m.currency;
  const money = (v: number | null | undefined) => fmtValuation(v, cur, fmtFromBase);
  // A FIGURE THE SOURCE PRINTS ONLY IN ANOTHER CURRENCY is shown as printed —
  // never converted at a rate no source gives — and the chart leaves it out.
  const printed = (x: { value: number; currency: string }, basis?: string) => (
    <span title={`As the source prints it, in ${x.currency}${basis ? ` (${basis})` : ""} — not in ${cur}, so not converted and not drawn on the chart`} data-pc-printed={x.currency}>
      {fmtValuation(x.value, x.currency, fmtFromBase)}<sup className="ml-0.5 text-[9px] text-slate-500">{x.currency}</sup>
    </span>);
  const figure = (f: Figure | null, why: string, data?: Record<string, string | number>) => (f
    ? <span title={f.derived ? `Derived: ${f.derived}.` : "As the round's source prints it."} {...data}>{money(f.value)}{f.derived && <sup className="ml-0.5 text-[9px] text-slate-500">d</sup>}</span>
    : <AbsentCell reason={why} />);

  const rounds = sortedRounds(company);
  const { points, leftOut } = valuationPoints(company, cur);
  const stakes = stakeTrail(company, shares, cost, investedFrom, cur);
  const latestStake = (() => {
    const r = [...rounds].reverse().find((x) => stakes.at.has(x));
    return r ? { round: r, stake: stakes.at.get(r)! } : null;
  })();
  // WHY THERE IS NO STAKE AT ALL — the reason the first round after entry carries.
  const stakeAbsent = [...stakes.why.values()].find((w) => !w.startsWith("before")) ?? (noRoundsWhy(rounds.length, company.searchNote));
  const noRounds = rounds.length === 0;
  const noRoundWhy = company.searchNote ?? "no credible source prints a priced round for this company";
  // A TILE CARRIES ONE SHORT LINE (Stage 10kz): the research's full note — what
  // was searched and what is missing — is the line's hover, not the tile's body.
  const NO_ROUND_LINE = "no credible source prints a priced round";
  const absentNoRound = (line: string) => ({
    value: <AbsentValue />,
    sub: <span className="text-slate-500" title={noRoundWhy} data-pc-search-note>{line} — hover for what was searched</span>,
  });
  const entryWords = m.entry
    ? m.entry.match === "at"
      ? `${m.entry.round.round}, dated ${roundDateLabel(m.entry.round.date)} — within ${ENTRY_WINDOW_DAYS} days of the family's first investment on ${roundDateLabel(investedFrom!)}`
      : `${m.entry.round.round}, dated ${roundDateLabel(m.entry.round.date)} — the last priced round before the family's first investment on ${roundDateLabel(investedFrom!)}`
    : null;
  const entryWhy = !investedFrom ? "no source dates the family's investment"
    : noRounds ? noRoundWhy
    : `no priced round is dated within ${ENTRY_WINDOW_DAYS} days of, or before, the family's first investment on ${roundDateLabel(investedFrom)}`;

  if (!portfolio) return null;
  if (!folios.length) {
    return (
      <div>
        <PageNav className="mb-2" trail={[{ label: "Private Market", to: "/private-market" }, { label: company.brand }]} />
        {wholeOwners.length
          ? <OutOfScope what={company.brand} ownerIds={wholeOwners} />
          : <AbsentSection what={`No statement in this book holds ${company.brand}`}
              needs="The funding record is kept for a company the family holds; no current statement reports a holding in it." />}
      </div>
    );
  }

  const posAcc: Record<string, Accessor<BookFolio>> = {
    entity: (f) => f.owner, account: (f) => `${f.provider} ${f.accountNo}`, invested: (f) => f.invested?.from ?? null,
    units: (f) => f.units, cost: (f) => f.cost, value: (f) => f.value, asOf: (f) => f.asOf,
  };
  const roundAcc: Record<string, Accessor<FundingRound>> = {
    date: (r) => dayOf(r.date), round: (r) => r.round,
    raised: (r) => roundValues(r, cur).raised, pre: (r) => roundValues(r, cur).pre?.value ?? null,
    post: (r) => roundValues(r, cur).headline?.value ?? null, price: (r) => roundValues(r, cur).price,
    stake: (r) => stakes.at.get(r)?.pct ?? null,
    investors: (r) => r.leadInvestors.join(", ") || null, allInvestors: (r) => r.investors?.length ?? null,
    source: (r) => r.sources[0]?.publisher ?? null,
  };
  const newsAcc: Record<string, Accessor<Headline>> = {
    at: (h) => h.at, headline: (h) => h.title, publisher: (h) => h.publisher,
  };
  const headlines = company.headlines ?? [];
  const funding = PRIVATE_MARKET_NEWS.funding;
  const inc42Covers = funding ? `Inc42's weekly funding tables from ${funding.from ? fmtDate(funding.from) : "—"} to ${funding.to ? fmtDate(funding.to) : "—"}${funding.archive.complete ? "" : ` (Glow Central Research has read ${funding.archive.pagesRead} of the archive's ${funding.archive.pages ?? "?"} pages; older roundups are still being read)`}` : null;
  const notInInc42 = inc42Covers ? `Inc42's funding table does not list this round — it covers ${inc42Covers}` : "Inc42's funding table has not been read";

  // THE FAMILY, WHERE A FILING NAMES IT — an offer document's allottee table, a
  // report of a round, or a registry's partner list (Stage 10kz). Shown with the
  // rounds, or alone where the company has none (a family LLP has no round).
  const mentions = company.familyMentions.length > 0 && (
    <div className="border-t border-ink-700 px-4 py-3 text-[12px]" data-pc-mentions={company.familyMentions.length}>
      <div className="mb-1 font-medium text-slate-300" title="Where a filing, a report of a round or a registry names a member of the family as an investor, allottee or partner">Named in the filings</div>
      <ul className="space-y-1 text-slate-400">
        {company.familyMentions.map((x, i) => (
          <li key={i}>
            {x.text}{" "}
            <a href={x.source.url} target="_blank" rel="noreferrer" className="text-champagne-400 hover:underline"
              title={`${x.source.publisher}${x.source.published ? `, ${fmtDate(x.source.published)}` : ""}${x.source.aggregator ? " (a data vendor's public page)" : ""}`}>{x.source.publisher}</a>
          </li>
        ))}
      </ul>
    </div>
  );

  const chartRows = points.map((p) => ({ t: Date.parse(dayOf(p.date)), ...p }));

  return (
    <div className="flex flex-col lg:h-full" data-private-company={company.id}>
      <div className="mb-3 shrink-0" data-stock-head>
        <PageNav className="mb-2" trail={[{ label: "Private Market", to: "/private-market" }, { label: company.brand }]} />
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2" data-stock-headline>
          <h1 className="font-display text-xl font-bold tracking-tight text-slate-100" title={company.legalName}>{company.brand}</h1>
          <div role="tablist" aria-label="Which part of this company to show" data-pc-tabs
            className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
            {PC_TABS.map((v) => (
              <button key={v.key} type="button" role="tab" aria-selected={tab === v.key}
                title={v.title} data-pc-tab-key={v.key} onClick={() => setTab(v.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === v.key ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill tone="core"><span title="Private company — held at the cost its statement carries; the valuations on this page are the company's, from public reporting">Private company</span></Pill>
          {company.legalName !== company.brand && <span className="text-[12px] text-slate-400" data-pc-legal>{company.legalName}</span>}
          {company.sector && <Pill><span title="The company's line of business, as its sources describe it">{company.sector}</span></Pill>}
          {company.classification && (
            <span className="inline-flex flex-wrap items-center gap-1" data-pc-classification
              title={`How Inc42's weekly funding table classifies ${company.brand}: sector, subsector and business model as it prints them${company.classification.date ? `, on its row of ${fmtDate(company.classification.date)}` : ""}`}>
              {[company.classification.sector, company.classification.subsector, company.classification.businessModel].filter(Boolean).map((x) => <Pill key={x}>{x}</Pill>)}
            </span>
          )}
          {company.listed && <Pill tone="info"><span title={`Listed${company.listed.date ? ` on ${fmtDate(company.listed.date)}` : ""} — its price since is a market quote, not a funding round`}>{company.listed.exchange}: {company.listed.symbol}</span></Pill>}
          {company.website && <a href={company.website} target="_blank" rel="noreferrer" className="text-[12px] text-champagne-400 hover:underline">{company.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>}
          <span className="text-[11px] text-slate-500" data-pc-checked={company.checkedOn}
            title={`${PRIVATE_ROUNDS.method} This company's record was last researched on ${fmtDate(company.checkedOn)}.`}>
            rounds checked {fmtDate(company.checkedOn)}
          </span>
          {funding && (
            <span className="text-[11px] text-slate-500" data-pc-inc42={funding.sourceCheckedOn ?? ""}
              title={`Inc42's weekly funding tables, read by Glow Central Research (its News → Private Market tab) and matched to ${company.brand} by its exact name: ${(company.reportedRows ?? []).length} row${(company.reportedRows ?? []).length === 1 ? "" : "s"}. Coverage: ${inc42Covers}.${funding.error ? ` Its latest walk reported: ${funding.error}.` : ""}`}>
              · Inc42 checked {funding.sourceCheckedOn ? fmtDate(funding.sourceCheckedOn) : "—"}
            </span>
          )}
        </div>
      </div>

      <div className="grid shrink-0 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-pc-strip>
        <Kpi label="Invested"
          value={cost != null ? fmtFromBase(cost, { compact: true }) : <AbsentValue />}
          sub={<span className="text-slate-500" title="What the family's statements record as paid — the holding is carried at this cost">{folios.length} {folios.length === 1 ? "folio" : "folios"} · held at cost</span>}
          icon={<Coins className="h-4 w-4" />} />
        <Kpi label="Date of investment"
          {...(investedFrom
            ? { value: <span data-pc-invested={investedFrom}>{roundDateLabel(investedFrom)}</span>,
                sub: <span className="text-slate-500">{investedTo && investedTo !== investedFrom ? `last ${roundDateLabel(investedTo)}` : "one date"}</span> }
            : absentTile("no source dates it"))}
          icon={<CalendarClock className="h-4 w-4" />} />
        <Kpi label="Valuation at entry"
          {...(m.entryValues?.headline
            ? { value: <span data-pc-entry-post={m.entryValues.headline.value} title={`${entryWords}. ${m.entryValues.headline.basis === "post-money" ? "Post-money" : "Valuation with no pre/post basis stated"}${m.entryValues.headline.derived ? ` — derived: ${m.entryValues.headline.derived}` : ""}.`}>{money(m.entryValues.headline.value)}</span>,
                second: <span data-pc-entry-pre={m.entryValues.pre?.value ?? ""} title={m.entryValues.pre ? (m.entryValues.pre.derived ? `Pre-money, derived: ${m.entryValues.pre.derived}.` : "Pre-money, as the source prints it.") : "No pre-money: the source prints neither it nor the amount raised beside a post-money."}>pre {m.entryValues.pre ? money(m.entryValues.pre.value) : "—"}</span>,
                sub: <span className="text-slate-500">{m.entryValues.headline.basis === "post-money" ? "post-money" : "basis not stated"} · {m.entry!.round.round}{vendorOnly(m.entry!.round) && <span data-pc-vendor title={VENDOR_WHY}> · data vendor's figure</span>}</span> }
            : noRounds && investedFrom ? absentNoRound(NO_ROUND_LINE) : absentTile(entryWhy))}
          icon={<Landmark className="h-4 w-4" />} />
        <Kpi label="Latest valuation"
          {...(m.latest
            ? { value: <span data-pc-latest={m.latest.value} title={`${m.latest.round}, ${m.latest.basis === "post-money" ? "post-money" : "valuation with no pre/post basis stated"}${m.latest.derived ? ` — derived: ${m.latest.derived}` : ""}.`}>{money(m.latest.value)}</span>,
                sub: <span className="text-slate-500" data-pc-latest-date={m.latest.date}>{roundDateLabel(m.latest.date)} · {m.latest.round}{m.latest.vendor && <span data-pc-vendor title={VENDOR_WHY}> · data vendor's figure</span>}</span> }
            : noRounds ? absentNoRound(NO_ROUND_LINE) : absentTile("no round prints a valuation in one currency"))}
          icon={<TrendingUp className="h-4 w-4" />} />
        <Kpi label="Change since entry"
          {...(m.change != null
            ? { value: <span data-pc-change={m.change} title="The latest valuation ÷ the valuation at the family's entry round, both on the same basis — the company's change, not a return on the family's holding.">{fmtNum(m.change, 2)}×</span>,
                sub: <span className="text-slate-500">{m.subsequent.length} {m.subsequent.length === 1 ? "round" : "rounds"} since entry</span> }
            : noRounds && investedFrom ? absentNoRound(NO_ROUND_LINE) : absentTile(!m.entryValues?.headline ? entryWhy : !m.latest ? "no later valuation" : "the entry and latest valuations are on different bases"))}
          icon={<LineIcon className="h-4 w-4" />} />
        <Kpi label="Your stake"
          {...(latestStake
            ? { value: <span data-pc-stake={latestStake.stake.pct} title={latestStake.stake.note}>{fmtNum(latestStake.stake.pct, 3)}%</span>,
                sub: <span className="text-slate-500">after {latestStake.round.round}</span> }
            : { value: <AbsentValue />, sub: <span className="text-slate-500" title={stakeAbsent} data-pc-stake-absent>{shares == null ? "no share count on the statement" : "not struck — hover for why"}</span> })}
          icon={<Percent className="h-4 w-4" />} />
      </div>

      <div className="mt-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto" data-pc-panel={tab}>
        {tab === "position" && (
          <Card className="mt-5" title="Position by account" pad={false}>
            <div className="overflow-x-auto">
              <ExportableTable exportName={`${company.brand} — position`} className="min-w-full whitespace-nowrap text-sm" data-pc-position>
                <thead className="border-b border-ink-700">
                  <Tr view={posView}>
                    <SortHeader col="entity" view={posView} align="left">Entity</SortHeader>
                    <SortHeader col="account" view={posView} align="left">Account</SortHeader>
                    <SortHeader col="invested" view={posView} align="left" title="When the money went in, as the line's own source prints it">Date of investment</SortHeader>
                    <SortHeader col="units" view={posView}>Shares</SortHeader>
                    <SortHeader col="cost" view={posView}>Cost</SortHeader>
                    <SortHeader col="value" view={posView} title="The statement's carrying value — the cost, for a holding no one has revalued">Value</SortHeader>
                    <SortHeader col="asOf" view={posView} align="left">As of</SortHeader>
                  </Tr>
                </thead>
                <tbody className="divide-y divide-ink-700/60">
                  {sortRows(folios, posView.sort, posAcc).map((f) => (
                    <Tr view={posView} key={f.key} className={TREE_ROW.parent} data-pc-folio={f.accountId}>
                      <td className="px-3 py-2 text-left text-slate-200">{f.owner}</td>
                      <td className="px-3 py-2 text-left text-slate-400">{f.provider} <span className="mono text-[11px]">{f.accountNo}</span></td>
                      <td className="px-3 py-2 text-left">{spanText(f) ?? <AbsentCell reason="no source dates this line" />}</td>
                      <td className="tabular px-3 py-2 text-right">{f.units != null ? fmtNum(f.units, 3) : <AbsentCell reason="the statement carries the amount paid and no share count" />}</td>
                      <td className="tabular px-3 py-2 text-right">{f.cost != null ? fmtFromBase(f.cost, { compact: true }) : <AbsentCell reason="no cost on the statement" />}</td>
                      <td className="tabular px-3 py-2 text-right">{f.value != null ? fmtFromBase(f.value, { compact: true }) : <AbsentCell reason={f.reason ?? "no value on the statement"} />}</td>
                      <td className="px-3 py-2 text-left text-slate-400">{f.asOf ? fmtDate(f.asOf) : <AbsentCell reason="undated statement" />}</td>
                    </Tr>
                  ))}
                </tbody>
              </ExportableTable>
            </div>
          </Card>
        )}

        {tab === "rounds" && (
          noRounds
            ? <div className="mt-5" data-pc-no-rounds>
                <AbsentSection what={`No priced funding round found for ${company.brand}`} needs={noRoundWhy} />
                {mentions && <Card className="mt-3" pad={false}>{mentions}</Card>}
              </div>
            : (
              <Card className="mt-5" title="Funding rounds" subtitle="Every round on record, oldest first — researched from filings and the press, and Inc42's weekly funding table; the family's entry round is marked" pad={false}>
                <div className="overflow-x-auto">
                  <ExportableTable exportName={`${company.brand} — funding rounds`} className="min-w-full text-sm" data-pc-rounds={rounds.length}>
                    <thead className="border-b border-ink-700">
                      <Tr view={roundView}>
                        <SortHeader col="date" view={roundView} align="left">Date</SortHeader>
                        <SortHeader col="round" view={roundView} align="left">Round</SortHeader>
                        <SortHeader col="raised" view={roundView}>Raised</SortHeader>
                        <SortHeader col="pre" view={roundView} title="Pre-money valuation — as the source prints it, or post-money − amount raised (marked d)">Pre-money</SortHeader>
                        <SortHeader col="post" view={roundView} title="Post-money valuation — as the source prints it, or pre-money + amount raised (marked d); a valuation the source gives no basis for is marked so">Post-money</SortHeader>
                        <SortHeader col="price" view={roundView}>Price / share</SortHeader>
                        <SortHeader col="stake" view={roundView} title="The family's shares × the round's price per share ÷ its post-money — only where the family's statement carries a share count">Your stake</SortHeader>
                        <SortHeader col="investors" view={roundView} align="left">Lead investors</SortHeader>
                        <SortHeader col="allInvestors" view={roundView} align="left" title="Every investor Inc42's weekly funding table lists for the round, as it prints them">Investors</SortHeader>
                        <SortHeader col="source" view={roundView} align="left">Source</SortHeader>
                      </Tr>
                    </thead>
                    <tbody className="divide-y divide-ink-700/60">
                      {sortRows(rounds, roundView.sort, roundAcc).map((r, i) => {
                        const v = roundValues(r, cur);
                        const isEntry = m.entry?.round === r;
                        const after = m.subsequent.includes(r);
                        const stake = stakes.at.get(r);
                        const otherCur = !v.headline && (r.postMoney || r.preMoney || r.valuation);
                        return (
                          <Tr view={roundView} key={`${r.date}-${r.round}-${i}`} className={TREE_ROW.parent}
                            data-pc-round={r.round} data-pc-round-date={r.date} data-pc-entry={isEntry ? "" : undefined} data-pc-after={after ? "" : undefined}>
                            <td className="whitespace-nowrap px-3 py-2 text-left" title={r.dateBasis ? `Dated by the ${r.dateBasis}` : undefined}>{roundDateLabel(r.date)}</td>
                            <td className="px-3 py-2 text-left">
                              <span className="text-slate-200">{r.round}</span>
                              {isEntry && <span className="ml-1.5 rounded bg-champagne-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-champagne-400" title={entryWords ?? undefined} data-pc-entry-badge>your entry</span>}
                              {r.kind === "reported" && <span className="ml-1.5 rounded bg-ink-700/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-400" data-pc-reported
                                title={`Known only from Inc42's weekly funding table (${r.reported?.dateText ?? roundDateLabel(r.date)}): the round type, size and investors as it prints them. It prints no valuation or price, and does not say whether the round issued shares.`}>Inc42</span>}
                              {r.note && <span className="ml-1 cursor-help text-[11px] text-slate-500" title={r.note}>ⓘ</span>}
                            </td>
                            <td className="tabular whitespace-nowrap px-3 py-2 text-right" title={r.reported?.amountText ? `Inc42's table prints ${r.reported.amountText}${r.reported.footnote ? ` — ${r.reported.footnote}` : ""}` : undefined}>{v.raised != null ? money(v.raised) : r.amountRaised ? printed(r.amountRaised) : <AbsentCell reason={r.reported ? "Inc42's table prints no amount for this round" : "the source prints no amount"} />}</td>
                            <td className="tabular whitespace-nowrap px-3 py-2 text-right">{figure(v.pre, "the source prints no pre-money, and not both a post-money and the amount to derive one")}</td>
                            <td className="tabular whitespace-nowrap px-3 py-2 text-right">
                              {vendorOnly(r) && (v.post || v.headline) && <sup className="mr-0.5 text-[9px] text-slate-500" title={VENDOR_WHY} data-pc-vendor>v</sup>}
                              {v.post ? figure(v.post, "")
                                : v.headline ? <span title="The source says the company was valued at this, without saying pre- or post-money">{money(v.headline.value)}<sup className="ml-0.5 text-[9px] text-slate-500">?</sup></span>
                                : otherCur ? printed((r.postMoney ?? r.valuation ?? r.preMoney)!, r.postMoney ? "post-money" : r.valuation ? "basis not stated" : "pre-money")
                                : <AbsentCell reason="the source prints no valuation" />}
                            </td>
                            <td className="tabular whitespace-nowrap px-3 py-2 text-right">{v.price != null ? money(v.price) : r.pricePerShare ? printed(r.pricePerShare) : <AbsentCell reason="the source prints no price per share" />}</td>
                            <td className="tabular whitespace-nowrap px-3 py-2 text-right">
                              {stake ? <span title={stake.note} data-pc-round-stake={stake.pct}>{fmtNum(stake.pct, 3)}%</span>
                                : <AbsentCell reason={stakes.why.get(r)} />}
                            </td>
                            <td className="max-w-[16rem] px-3 py-2 text-left text-slate-400">{r.leadInvestors.length ? r.leadInvestors.join(", ") : <AbsentCell reason="the source names no lead investor" />}</td>
                            <td className="min-w-[14rem] max-w-[22rem] px-3 py-2 text-left text-slate-400" data-pc-investors={r.investors?.length ?? 0}>
                              {r.investors?.length ? <span title={`Every investor Inc42's table lists: ${r.investors.join(", ")}`}>{investorsShort(r.investors)}</span>
                                : <AbsentCell reason={r.reported ? "Inc42's table names no investor for this round" : notInInc42} />}
                            </td>
                            <td className="px-3 py-2 text-left">
                              {r.sources.map((s, j) => (
                                <a key={j} href={s.url} target="_blank" rel="noreferrer" data-pc-source={s.url}
                                  title={`${s.publisher}${s.published ? `, ${fmtDate(s.published)}` : ""}: ${s.supports}${s.aggregator ? " (a data vendor's public page)" : ""}`}
                                  className="mr-2 whitespace-nowrap text-champagne-400 hover:underline">{s.publisher}</a>
                              ))}
                            </td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </ExportableTable>
                </div>
                {mentions}
              </Card>
            )
        )}

        {tab === "news" && (
          headlines.length === 0
            ? <div className="mt-5" data-pc-no-news><AbsentSection what={`No headline names ${company.brand}`}
                needs={PRIVATE_MARKET_NEWS.headlines
                  ? `Glow Central Research's news capture is matched to the family's private companies by reviewed name; no headline in its last ${PRIVATE_MARKET_NEWS.headlines.windowDays ?? "—"} days (read ${PRIVATE_MARKET_NEWS.headlines.capturedOn ? fmtDate(PRIVATE_MARKET_NEWS.headlines.capturedOn) : "—"}) names this company, and none held from earlier reads does.`
                  : "Glow Central Research's headline capture has not been read yet."} /></div>
            : (
              <Card className="mt-5" title="Headlines"
                subtitle="Headlines that name the company, newest first — a name in a headline, not a verified event" pad={false}>
                <div className="overflow-x-auto">
                  <ExportableTable exportName={`${company.brand} — headlines`} className="min-w-full text-sm" data-pc-news={headlines.length}>
                    <thead className="border-b border-ink-700">
                      <Tr view={newsView}>
                        <SortHeader col="at" view={newsView} align="left">Published</SortHeader>
                        <SortHeader col="headline" view={newsView} align="left" title="The headline as its publisher printed it; it opens the story">Headline</SortHeader>
                        <SortHeader col="publisher" view={newsView} align="left">Publisher</SortHeader>
                      </Tr>
                    </thead>
                    <tbody className="divide-y divide-ink-700/60">
                      {sortRows(headlines, newsView.sort, newsAcc).map((h) => (
                        <Tr view={newsView} key={h.url} className={TREE_ROW.parent} data-pc-headline={h.url}>
                          <td className="whitespace-nowrap px-3 py-2 text-left text-slate-400">{h.at ? fmtDate(h.at.slice(0, 10)) : <AbsentCell reason="the publisher prints no time for this story" />}</td>
                          <td className="px-3 py-2 text-left">
                            <a href={h.url} target="_blank" rel="noreferrer" className="text-slate-200 hover:text-champagne-400 hover:underline"
                              title={h.summary ?? `Headlines are matched to ${company.brand} by Glow Central Research, by its reviewed name in the headline`}>{h.title}</a>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-left text-slate-400">{h.publisher ?? <AbsentCell reason="the capture names no publisher" />}</td>
                        </Tr>
                      ))}
                    </tbody>
                  </ExportableTable>
                </div>
              </Card>
            )
        )}

        {tab === "valuation" && (
          points.length === 0
            ? <div className="mt-5" data-pc-no-chart><AbsentSection what={`No valuation to draw for ${company.brand}`} needs={noRounds ? noRoundWhy : `No round prints a valuation in ${cur}.`} /></div>
            : (
              <Card className="mt-5" title={`Valuation progression · ${cur}`}
                subtitle={`Each round's post-money valuation (or its stated valuation where the source gives no basis), from its source${leftOut.length ? `. ${leftOut.length} round${leftOut.length === 1 ? " is" : "s are"} printed only in another currency and not drawn: ${leftOut.map((r) => r.round).join(", ")}` : ""}`}>
                <div className="h-[22rem]" data-pc-chart={points.length} data-pc-chart-currency={cur}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartRows} margin={{ top: 16, right: 24, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                      <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} padding={{ left: 24, right: 24 }}
                        tickFormatter={(t: number) => new Date(t).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                        axisLine={false} tickLine={false} tick={{ fill: AXIS_COLOR }} tickMargin={8} fontSize={11} minTickGap={24} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: AXIS_COLOR }} fontSize={11} width={72} domain={[0, "auto"]}
                        tickFormatter={(v: number) => money(v) ?? ""} />
                      {investedFrom && (
                        <ReferenceLine x={Date.parse(dayOf(investedFrom))} stroke="#10b981" strokeDasharray="4 4"
                          label={{ value: "You invested", position: "insideTopLeft", fill: "#10b981", fontSize: 11 }} />
                      )}
                      <Tooltip cursor={{ stroke: AXIS_COLOR, strokeWidth: 1 }} content={({ active, payload }) => {
                        const row = active ? (payload?.[0]?.payload as (typeof chartRows)[number] | undefined) : undefined;
                        if (!row) return null;
                        return (
                          <div style={{ ...chartTooltipStyle, padding: "8px 10px" }}>
                            <div style={chartTooltipLabelStyle}>{roundDateLabel(row.date)} · {row.round}</div>
                            <div className="mt-1 tabular font-semibold">{money(row.value)}</div>
                            <div className="mt-0.5 opacity-70">{row.basis === "post-money" ? (row.derived ? "post-money, derived" : "post-money") : "valuation, basis not stated"}{row.vendor ? " · a data vendor's figure" : ""}</div>
                          </div>
                        );
                      }} />
                      <Line type="linear" dataKey="value" stroke={LINE_COLOR} strokeWidth={2}
                        dot={{ r: 4, fill: LINE_COLOR, stroke: "none" }} activeDot={{ r: 5 }} isAnimationActive={false} name="Valuation" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )
        )}
      </div>
    </div>
  );
}

export default PrivateCompany;
