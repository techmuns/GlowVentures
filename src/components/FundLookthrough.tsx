import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { SearchInput } from "@/components/SearchInput";
import { AbsentSection, AbsentCell, DASH } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtDate, fmtNum, fmtPct, changeColor, displayFiledName } from "@/lib/format";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { useTableView, sortRows } from "@/lib/tableView";

/** The disclosed-holdings table's columns, in the order its rows write them. */
const FL_COLS = ["holding", "class", "sector", "pctAum", "lookthrough", "shares"] as const;
import {
  loadLookthrough, familyValue, disclosedWeight,
  type LookthroughState, type FundPortfolio,
} from "@/lib/lookthrough";

/**
 * ── THE SCHEME: ITS NAV, ITS RETURNS, AND WHAT IT HOLDS ─────────────────────
 *
 * *"We should also be able to see each holding of every mutual fund."* … *"For
 * all the mutual funds related data you can get that from our repo — amfibeas.
 * Mutual Fund NAV, direct scheme NAV, rolling return etc., daily NAV change."*
 *
 * These are the only figures on this site that are not the family's own. Every
 * line of this card is written to keep that visible:
 *
 *   • the heading names the AMC's disclosure and the scheme matched, and the
 *     holdings row says whether they came from the FUND HOUSE'S OWN filing or a
 *     third party's copy of it — one is the document, the other is a reading;
 *   • BOTH dates print, since a monthly portfolio and a statement mark almost
 *     never share one;
 *   • the PLAN is named, and it is the family's own plan because the ISIN
 *     resolved it — plans differ in expense ratio, and therefore NAV, not in
 *     what the fund owns;
 *   • every return carries THE WINDOW IT ACTUALLY SPANS, because the source's
 *     label and its dates do not always agree;
 *   • the weight is the AMC's own and the family's exposure beside it is
 *     DERIVED from it, labelled every time;
 *   • and nothing here is in any book total, because the fund's own value
 *     already is.
 */
/**
 * ── TWO HALVES, ON TWO TABS OF THE POSITION PAGE ────────────────────────────
 *
 * The position page is one template for every holding now — Position,
 * Transactions, Price & returns, Research, My targets — and a scheme answers two
 * of those questions: its NAV and returns ARE its price and returns, and what it
 * holds IS its research. So the card draws one half per tab rather than one card
 * standing under both. `part` picks which; the loading and absence states are
 * the same in both, so a reader on either tab learns the store did not answer.
 */
const PART_TITLE = {
  nav: "The scheme — NAV and returns",
  holdings: "What the scheme holds",
} as const;

export function FundLookthrough({ securityKey, name, holdingValue, asOfHolding, part }: {
  securityKey: string;
  name: string;
  /** What the family's units are worth, for the derived exposure column. */
  holdingValue: number;
  /** The account's own report date — not the book's newest. */
  asOfHolding: string;
  /** Which half of the scheme to draw — see `PART_TITLE`. */
  part: keyof typeof PART_TITLE;
}) {
  const { fmtFromBase } = usePortfolio();
  const [state, setState] = useState<LookthroughState>({ status: "loading" });
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    loadLookthrough(securityKey).then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [securityKey]);

  const money = (n: number) => fmtFromBase(n, { compact: true });
  const pf: FundPortfolio | null = state.status === "ok" ? state.portfolio : null;
  const view = useTableView("fund-lookthrough", FL_COLS);

  // THE AMC'S OWN SPELLING, CASED FOR DISPLAY. HDFC files some lines entirely in
  // capitals (`KAYNES TECHNOLOGY INDIA LIMITED`); a name the filer cased is kept
  // as filed and only an all-capitals one is title-cased — see
  // `displayFiledName`. Nothing is re-keyed from it: this table joins nothing.
  const rows = useMemo(() => (pf?.holdings ?? []).map((h) => ({ ...h, name: displayFiledName(h.name) })), [pf]);
  const term = q.trim().toLowerCase();
  // A DEBT ROW IS FOUND BY ITS RATING AND ITS CLASS, not only by a sector it
  // does not have — the two columns a bond actually fills.
  const shown = sortRows(
    term
      ? rows.filter((r) => [r.name, r.sector, r.rating, r.assetClass, r.isin]
          .some((v) => (v ?? "").toLowerCase().includes(term)))
      : rows,
    view.sort,
    {
      holding: (h) => h.name,
      class: (h) => h.assetClass ?? null,
      sector: (h) => h.sector ?? h.rating ?? null,
      pctAum: (h) => h.pctAum,
      // The look-through is this family's value times the weight beside it, so
      // it orders exactly as the weight does — sorted on the weight rather than
      // re-derived, which would be a second expression of one figure.
      lookthrough: (h) => h.pctAum,
      shares: (h) => h.shares,
    },
  );

  if (state.status === "loading") {
    return (
      <div data-fund-lookthrough={part}>
        <Card className="mt-5" title={PART_TITLE[part]}>
          <p className="text-[12.5px] text-slate-500">Reading the scheme's NAV, returns and disclosed portfolio…</p>
        </Card>
      </div>
    );
  }

  // A STORE THAT DID NOT ANSWER IS A FACT ABOUT THE FETCH, worded as one — the
  // company page has been fixed once for telling a reader their session expired
  // over an unreachable archive.
  if (state.status === "unreachable") {
    return (
      <div data-fund-lookthrough={part}>
        <Card className="mt-5" title={PART_TITLE[part]}>
          <AbsentSection
            what="The fund store did not respond"
            needs="This scheme's NAV, returns and disclosed portfolio are committed under public/lookthrough/ and read when the page opens. The request did not come back, so nothing is shown rather than a partial answer — reload, and if it persists the store may not have been built for this deployment (npm run build-lookthrough)." />
        </Card>
      </div>
    );
  }

  if (state.status === "none") {
    return (
      <div data-fund-lookthrough={part}>
        <Card className="mt-5" title={PART_TITLE[part]}>
        <AbsentSection
          what={`No scheme resolves for ${name}`}
          needs={state.unseen
            /* A HOLDING THE STORE WAS NEVER GIVEN is not one it failed to match,
               and saying its report "names every one" would send a reader to a
               document that does not mention it. The depository's arbitrage
               units reach the book only at runtime, off an account that sent no
               holding statement, which is why the store was built without them. */
            ? "The fund store has no entry for this holding — it is neither matched to a scheme nor named among the ones that could not be — so it was not among the holdings the store was built from. Nothing is shown rather than another fund's NAV or holdings."
            : `${state.reason ?? "This holding is not matched to a scheme in the fund store."} A scheme is matched on its ISIN, and only failing that on a normalised name; anything matching nothing — or more than one — is left unresolved rather than shown against a nearest guess, because the NAV and the companies listed would then be some other fund's. docs/FUND-LOOKTHROUGH.md names every one.`} />
        </Card>
      </div>
    );
  }

  const { match } = state;
  const p = pf!;
  const weight = disclosedWeight(p);
  const periods = Object.entries(p.returns);

  return (
    <div data-fund-lookthrough={part}>
    <Card className="mt-5"
      title={PART_TITLE[part]}
      /* ONE SHORT LINE (main's Stage 10ci): the scheme, and that none of this
         is the family's own statement — the fence a reader must not miss. Each
         half's own document — AMFI's daily NAV for the first, the AMC's monthly
         disclosure for the second — is the hover. */
      subtitle={<span title={`${part === "nav" ? "AMFI's daily NAV and the scheme's own returns" : `${p.amc ? `${p.amc}'s` : "The AMC's"} own monthly disclosure`} — published figures about the scheme, not a statement issued to this family.`}>
        {p.amfiSchemeName ?? p.scheme ?? name} — not a statement issued to this family</span>}
      right={<Pill tone="info"><span title="Matched from this holding's own ISIN, so the NAV and returns are the plan the family actually holds.">{match.matchedVia === "isin" ? "matched on ISIN" : `matched on ${match.matchedVia}`}</span></Pill>}>

      {part === "nav" && (<>
      {/* ── NAV, its daily change, and the plan ──────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3.5">
          <div className="label-xs">NAV</div>
          <div className="mono mt-1.5 text-[19px] font-semibold text-slate-100">
            {p.nav.value == null ? DASH : fmtNum(p.nav.value, 4)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {p.nav.date ? fmtDate(p.nav.date) : "no NAV date"}
          </div>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3.5">
          <div className="label-xs">NAV change</div>
          <div className={`mono mt-1.5 text-[19px] font-semibold ${p.nav.changePct == null ? "text-slate-500" : changeColor(p.nav.changePct)}`}>
            {p.nav.changePct == null ? DASH : fmtPct(p.nav.changePct, { sign: true, decimals: 2 })}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {/* THE PREVIOUS PUBLISHED NAV, NAMED WITH ITS DATE. A fund does not
                publish on a non-business day, so "since yesterday" would be
                wrong across a weekend — the date says which day it is against. */}
            {p.nav.prev == null || p.nav.prevDate == null
              ? <span title="A change needs two published NAVs; this scheme's series carries only one.">no previous NAV in the series</span>
              : <>since {fmtNum(p.nav.prev, 4)} on {fmtDate(p.nav.prevDate)}</>}
          </div>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3.5">
          <div className="label-xs">Plan</div>
          <div className="mt-1.5 text-[15px] font-semibold capitalize text-slate-100">
            {p.plan ?? DASH}{p.option ? <span className="text-slate-400"> · {p.option}</span> : null}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            <span title="Resolved from this holding's own ISIN, so the NAV above is this plan's. Plans differ in expense ratio, and therefore NAV — not in what the fund owns.">
              from this holding's ISIN
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3.5">
          <div className="label-xs">Scheme AUM</div>
          <div className="mono mt-1.5 text-[19px] font-semibold text-slate-100">
            {p.fundAumCr == null ? DASH : `₹${fmtNum(p.fundAumCr, 1)} Cr`}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            <span title="The whole scheme's assets across every investor in it — not this family's holding.">
              {p.classification ?? "the whole scheme"}
            </span>
          </div>
        </div>
      </div>

      {/* ── returns, each with the window it really spans ─────────────────── */}
      {periods.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="label-xs">Scheme returns</span>
            <span className="text-[11px] text-slate-500">
              the scheme's own, on this plan{p.returnsAsOf ? ` · to ${fmtDate(p.returnsAsOf)}` : ""} — not this family's return, which depends on when they bought
            </span>
          </div>
          <div className="overflow-x-auto">
            {/* Exempt, declared — the same class as `ReturnsTable`: one row,
                so there is nothing to sort, and the columns are the source's
                own period sequence, so moving one would break it. */}
            <table className="min-w-full whitespace-nowrap text-sm"
              data-table-static="one row of a source's own period sequence — there is nothing to sort and moving a period would break its order">
              <thead className="border-b border-ink-700">
                <tr>
                  {periods.map(([k]) => <th key={k} className="label-xs px-3 py-2 text-right font-medium">{k}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {periods.map(([k, r]) => (
                    <td key={k} className={`px-3 py-2 text-right mono ${changeColor(r.value)}`}>
                      {fmtPct(r.value, { sign: true, decimals: 1 })}
                      {r.kind === "CAGR" && <span className="ml-1 text-[10px] text-slate-500">p.a.</span>}
                    </td>
                  ))}
                </tr>
                {/* THE WINDOW EACH FIGURE ACTUALLY COVERS. The label above is
                    the source's; these dates are the measurement, and on this
                    data they do not always agree — a "1M" here can span ten
                    weeks. Printed rather than trusted. */}
                <tr>
                  {periods.map(([k, r]) => (
                    <td key={k} className="px-3 pb-2 text-right text-[10.5px] text-slate-500">
                      {r.startDate && r.endDate
                        ? <span title={`${r.kind === "CAGR" ? "Annualised" : "Simple"} return from NAV ${r.startNav ?? "—"} on ${r.startDate} to ${r.endNav ?? "—"} on ${r.endDate}.`}>
                            {fmtDate(r.startDate)} → {fmtDate(r.endDate)}
                          </span>
                        : <AbsentCell reason="The source states no window for this period." />}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      </>)}

      {part === "holdings" && (<>
      {/* ── the holdings ─────────────────────────────────────────────────── */}
      {/* THE PILLS DATE AND SOURCE THE HOLDINGS, so a scheme that discloses none
          draws none — "portfolio —" over an absence says nothing the absence
          box below does not (main's Stage 10ci). */}
      {rows.length > 0 && (
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11.5px]">
        <Pill>
          <span title="A scheme discloses its portfolio monthly; the family's units are valued on their own statement's date. The two rarely coincide, so both are shown rather than one standing for the other.">
            portfolio {p.holdingsAsOf ? fmtDate(p.holdingsAsOf) : DASH} · holding {fmtDate(asOfHolding)}
          </span>
        </Pill>
        {p.holdingsSource && (
          <Pill tone={p.holdingsSource.kind === "amc" ? "core" : undefined}>
            <span title={p.holdingsSource.kind === "amc"
              ? `Read from the fund house's own monthly disclosure${p.holdingsSource.url ? ` (${p.holdingsSource.url})` : ""} — the document the AMC published.`
              : "Read from a third-party aggregation of the AMC's disclosure, because the fund house's own file was not available for this scheme. One is the filing; the other is somebody's reading of it."}>
              holdings from {p.holdingsSource.kind === "amc" ? "the AMC's own disclosure" : "an aggregator's copy"}
            </span>
          </Pill>
        )}
        {rows.length > 30 && (
          <SearchInput value={q} onChange={setQ} placeholder="Filter by name, sector, rating or class…" className="ml-auto w-64"
            suggestions={[...new Set(rows.flatMap((r) => [r.name, r.sector, r.rating, r.assetClass].filter(Boolean) as string[]))].sort()} />
        )}
      </div>
      )}

      {rows.length === 0 ? (
        /* NOT AN EMPTY TABLE, AND NOT A FAILURE. Two of this book's schemes are
           metal ETFs the AMC files no portfolio for at all; the reason names
           that rather than implying a fund that holds nothing. The NAV is on
           the Price & returns tab, not "above" — this half is its own tab. */
        <AbsentSection
          what={`${p.scheme ?? name} discloses no portfolio this store could read`}
          needs="No monthly portfolio disclosure for this scheme is in the store; its NAV, change and returns are complete on the Price & returns tab." />
      ) : shown.length === 0 ? (
        <AbsentSection what="Nothing matches that filter"
          needs={`The scheme discloses ${rows.length} holdings; none of their names, sectors, ratings, classes or ISINs contains "${q.trim()}".`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-sm">
            <thead className="border-b border-ink-700">
              <Tr view={view}>
                <SortHeader col="holding" view={view} align="left" pad="px-3 py-2">Holding</SortHeader>
                <SortHeader col="class" view={view} align="left" pad="px-3 py-2"
                  title="What the AMC filed the instrument as — Equity, Debt, Gold, Silver, Cash. The store used to carry the equity section alone, so a liquid fund had no rows and a hybrid's bonds were absent.">Class</SortHeader>
                <SortHeader col="sector" view={view} align="left" pad="px-3 py-2"
                  title="The AMC files one column for both, and they are different facts: a SECTOR on a share (Finance, Banks) and a CREDIT RATING on a bond (CRISIL - AAA). Each is shown under its own name and never under the other's.">Sector / rating</SortHeader>
                <SortHeader col="pctAum" view={view} pad="px-3 py-2"
                  title="The scheme's own disclosed weight — a share of the FUND, across every investor in it.">% of fund</SortHeader>
                <SortHeader col="lookthrough" view={view} pad="px-3 py-2"
                  title="DERIVED, not disclosed: this family's holding value times the weight beside it. Nobody published a figure about this family here, and it is in no total on this site.">Your look-through</SortHeader>
                <SortHeader col="shares" view={view} pad="px-3 py-2"
                  title="Shares the FUND holds across every investor in it — not this family's.">Shares (fund)</SortHeader>
              </Tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {shown.map((h, i) => (
                <Tr view={view} key={`${h.name}-${i}`} className="hover:bg-ink-700/40">
                  <td className="px-3 py-2 text-slate-200">
                    {h.name}
                    {h.isin && <span className="mono ml-2 text-[10px] text-slate-600"> {h.isin}</span>}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-slate-400">
                    {h.assetClass ?? <AbsentCell reason="This source does not state what class the instrument is." />}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-slate-400">
                    {h.sector ?? h.rating ?? <AbsentCell reason="The filing prints no sector for this share and no rating for this instrument — an aggregator's copy carries neither, only the AMC's own does." />}
                  </td>
                  <td className="px-3 py-2 text-right mono text-slate-300">{h.pctAum.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right mono text-slate-400">{money(familyValue(holdingValue, h.pctAum))}</td>
                  <td className="px-3 py-2 text-right mono text-slate-500">
                    {h.shares == null
                      ? <AbsentCell reason="The disclosure reports no share count for this row." />
                      : fmtNum(h.shares)}
                  </td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <TrFoot view={view} className="border-t-2 border-ink-600 px-3 py-2 font-semibold text-slate-200"
                label={<>{fmtNum(shown.length)} of {fmtNum(rows.length)} disclosed holdings shown</>}
                cells={{
                  pctAum: <td key="pctAum" className="border-t-2 border-ink-600 px-3 py-2 text-right mono font-semibold text-slate-300">{shown.reduce((a, h) => a + h.pctAum, 0).toFixed(2)}%</td>,
                  lookthrough: <td key="lookthrough" className="border-t-2 border-ink-600 px-3 py-2 text-right mono font-semibold text-slate-300">{money(shown.reduce((a, h) => a + familyValue(holdingValue, h.pctAum), 0))}</td>,
                  shares: <td key="shares" className="border-t-2 border-ink-600 px-3 py-2" />,
                }} />
            </tfoot>
          </table>
        </div>
      )}

      {/* ONE LINE, the rest in its hover (main's Stage 10ci). What must stay
          on screen is that none of this is in any total: a derived exposure
          beside a measured one is exactly where this book has been bitten. */}
      {rows.length > 0 && (
      <p className="mt-3 text-[11.5px] text-slate-500"
        title={`The fund's own value — ${money(holdingValue)} — is what the book carries, and it already stands for everything above; counting both would count the same money twice. The look-through column is this holding's value times the scheme's published weight, so it is an estimate of exposure rather than a position the family can sell. The disclosed weights add to ${weight.toFixed(1)}% of the scheme${p.coveragePct != null ? ` — the AMC states its own coverage at ${p.coveragePct.toFixed(1)}%` : ""}; the rest is what a monthly filing rounds and the cash it does not itemise.`}>
        <span className="font-medium text-slate-400">None of this is in any total on this site</span> — the fund&rsquo;s
        own value already stands for it.
      </p>
      )}
      </>)}
    </Card>
    </div>
  );
}
