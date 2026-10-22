/**
 * ── SECTOR ATTRIBUTION, AS SECTOR COMPOSITION DRAWS THE SECTORS (Stage 10gs) ──
 *
 *   *"why are AIF and mutual funds showing up as sectors? … we need to show
 *    sector return attribution in the same way as we are showing in the sector
 *    composition tab. A consolidated view and a direct equity view and the
 *    sectors and the returns … and also a drop down list of the contributors
 *    and holdings in each sector and their returns."*
 *
 * The generic attribution filed every fund, private line and cash row under its
 * class on the Sector axis, because a wrapper has no sector — so AIF, Mutual
 * Fund and Cash stood among the sectors. This panel reads Sector Composition's
 * own sets (`sectorSets`): Consolidated is every company the family reaches,
 * the funds looked through to what they disclose; Direct Equity is their own
 * demat and broking shares. Only GICS sectors (and the named Unclassified) are
 * rows.
 *
 * WHAT EACH COLUMN IS STRUCK OVER. Value and Weight are the set's, exactly as
 * Sector Composition prints them. Gain, Return and Contribution are since
 * investment, FIFO over the holdings whose statement reports a purchase cost
 * (`rollSectors`); the cell names that set ("N of M") and a fund's derived
 * half — which carries no cost — is named in its details, never blended in.
 * Contribution is a row's gain over the whole set's capital, so the rows add
 * to the total return. Market return is the only figure that follows the
 * Returns toolbar's dates, over the row's own priced holdings.
 */
import { Fragment, useState, type ReactNode } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { ExportableTable } from '@/components/ExportableTable';
import { EditColumns } from '@/components/EditColumns';
import { AbsentCell } from '@/components/Absent';
import { SectorReturnDetails } from '@/components/SectorReturnDetails';
import { SortHeader, Tr, TrFoot } from '@/components/SortHeader';
import { TREE_ROW, TREE_CELL, TreeNameCell, rowToggle, useExpanded, ExpandAllButton } from '@/components/TreeTable';
import { useViewParam, type ViewDef } from '@/components/ViewToggle';
import { useTableView, sortRows } from '@/lib/tableView';
import { accountIndex, engagementOf, ownerOf } from '@/lib/accounts';
import { holdingRoute, ROUTE_LABEL } from '@/lib/analytics';
import { changeColor } from '@/lib/format';
import { fifoTotals } from '@/lib/fifo';
import { hasSectorReturnCost } from '@/lib/sectorReturnCoverage';
import { sectorSets } from '@/lib/sectorRollup';
import { UNCLASSIFIED } from '@/lib/sectors';
import type { StockExposureState } from '@/lib/lookthrough';
import type { Position } from '@/lib/types';

type SectorSet = 'consolidated' | 'direct';
const SETS: readonly ViewDef<SectorSet>[] = [
  { key: 'consolidated', label: 'Consolidated',
    title: "Every company this family is exposed to — the shares their statements report, plus their share of what their funds disclose — by sector, as Sector Composition draws it." },
  { key: 'direct', label: 'Direct Equity',
    title: "Shares bought in the family's own demat and broking accounts only — nothing a discretionary manager chose, and no fund." },
];

const COLS = ['sector', 'holdings', 'value', 'weight', 'market', 'gain', 'ret', 'contrib'] as const;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const FUNDS_ONLY = "The family holds this only inside their funds, and a fund's disclosure carries no purchase cost — there is nothing to strike a return against.";
const NO_COST = "This holding's statement reports no purchase cost — a depository holds the shares, it did not buy them.";

/** The market return of a set of current holdings over the toolbar's dates (`SegmentReturns`' own). */
export type MarketOf = (ps: readonly Position[]) => { pct: number | null; annual: boolean; pending: number; gaps: readonly { reason: string }[] };

/** One row: a sector, or a contributor under it. */
type Line = {
  key: string; label: string; sub?: string; hint?: string;
  /** The statement holdings behind the row. Empty for a company reached only through a fund. */
  positions: Position[];
  /** The set's value — total exposure on Consolidated, the measured half on Direct Equity. */
  value: number;
  /** Of `value`, what a fund's disclosure derives (Consolidated only). */
  derived: number;
  gain: number | null; deployed: number | null; returnPct: number | null; returnWhy: string | null;
  children: Line[];
};

/** FIFO over the holdings that report a cost — `rollSectors`' rule, for one contributor. */
function strike(ps: Position[]): Pick<Line, 'gain' | 'deployed' | 'returnPct' | 'returnWhy'> {
  const costed = ps.filter(hasSectorReturnCost);
  if (!costed.length) return { gain: null, deployed: null, returnPct: null, returnWhy: ps.length ? NO_COST : FUNDS_ONLY };
  const f = fifoTotals(costed);
  return { gain: f.gain, deployed: f.deployed, returnPct: f.returnPct,
    returnWhy: f.returnPct === null ? 'The holdings that report a cost carry no capital deployed to strike a return against.' : null };
}

export default function SectorAttribution({ consolidated, exposure, marketOf, marketInfo }: {
  consolidated: Position[]; exposure: StockExposureState;
  marketOf: MarketOf; marketInfo: (label: string, ps: readonly Position[]) => ReactNode;
}) {
  const { portfolio, fmtFromBase } = usePortfolio();
  const [set, setSet] = useViewParam(SETS, {}, 'sset');
  // Edit Columns and Export Excel share the set toggle's row, not rows of their own (Stage 10gy).
  const view = useTableView('cio-sector-attribution', COLS, { manualEditor: true }), exp = useExpanded();
  const [tools, setTools] = useState<HTMLSpanElement | null>(null);
  if (!portfolio) return null;
  const money = (n: number | null | undefined, sign = false) => fmtFromBase(n, { compact: true, sign });
  const accIdx = accountIndex(portfolio.accounts);
  const consolidatedView = set === 'consolidated';
  const sets = sectorSets(consolidated, accIdx, exposure);
  const entries = consolidatedView ? sets.consEntries : sets.directEntries;
  const sectors = consolidatedView ? sets.consSectors : sets.directSectors;

  const lines: Line[] = sectors.map((s) => {
    const inSector = entries.filter((e) => (e.sector || UNCLASSIFIED) === s.key);
    const children: Line[] = consolidatedView
      ? inSector.map((e) => {
        const routes = [...new Set(e.positions.map((p) => ROUTE_LABEL[holdingRoute(engagementOf(accIdx, p) || null)]))];
        return { key: e.key, label: e.name, positions: e.positions, value: e.total, derived: e.derived, children: [],
          sub: [routes.join(' + '), e.derived > 0 ? 'via funds' : ''].filter(Boolean).join(' · '), ...strike(e.positions) };
      })
      : inSector.flatMap((e) => e.positions).map((h) => ({
        key: `${h.accountId}|${h.securityKey}`, label: h.security, positions: [h], value: h.marketValue, derived: 0, children: [],
        sub: `${ownerOf(accIdx, h)} · ${ROUTE_LABEL[holdingRoute(engagementOf(accIdx, h) || null)]}`, ...strike([h]) }));
    return {
      key: s.key, label: s.key, positions: s.positions, value: s.mv, derived: s.derived,
      gain: s.gain, deployed: s.gain === null ? null : s.deployed, returnPct: s.returnPct, returnWhy: s.returnWhy,
      sub: consolidatedView ? `${s.count} ${s.count === 1 ? 'issuer' : 'issuers'}` : undefined,
      hint: s.key === UNCLASSIFIED ? 'No source placed these in a sector — not the family’s own statement, not a fund’s filing, not screener.in — so they are left unclassified rather than guessed.' : undefined,
      children: children.sort((a, b) => b.value - a.value),
    };
  });

  // The total is the rows' own sum, so it ties to its columns.
  const struckRows = lines.filter((l) => l.gain !== null);
  const totalGain = struckRows.length ? struckRows.reduce((a, l) => a + l.gain!, 0) : null;
  const totalDeployed = struckRows.length ? struckRows.reduce((a, l) => a + (l.deployed ?? 0), 0) : null;
  const total: Line = {
    key: 'total', label: 'Total', positions: lines.flatMap((l) => l.positions), value: lines.reduce((a, l) => a + l.value, 0),
    derived: lines.reduce((a, l) => a + l.derived, 0), gain: totalGain, deployed: totalDeployed,
    returnPct: totalGain !== null && totalDeployed ? (totalGain / totalDeployed) * 100 : null,
    returnWhy: 'No holding in this set reports a purchase cost.', children: [],
  };
  const contribOf = (l: Line) => (l.gain !== null && total.deployed ? (l.gain / total.deployed) * 100 : null);
  const costedCount = total.positions.filter(hasSectorReturnCost).length;

  const accessors = {
    sector: (l: Line) => l.label, holdings: (l: Line) => l.positions.length, value: (l: Line) => l.value, weight: (l: Line) => l.value,
    market: (l: Line) => (l.positions.length ? marketOf(l.positions).pct : null), gain: (l: Line) => l.gain, ret: (l: Line) => l.returnPct, contrib: (l: Line) => contribOf(l),
  };
  const rows = sortRows(lines, view.sort, accessors);
  const openable = lines.filter((l) => l.children.length > 0);
  const allOpen = openable.length > 0 && openable.every((l) => exp.isOpen(l.key));

  const cells = (l: Line, kind: 'parent' | 'child') => {
    const pad = TREE_CELL[kind], c = contribOf(l);
    const m = l.positions.length ? marketOf(l.positions) : null;
    return [
      <td key="holdings" className={`${pad} text-right mono text-slate-400`}
        title={l.positions.length ? undefined : 'Held only inside the family’s funds — no statement reports it as a holding.'}>{l.positions.length}</td>,
      <td key="value" className={`${pad} text-right mono text-slate-100`}
        title={l.derived >= 1 ? `${money(l.value - l.derived)} reported by the statements · ${money(l.derived)} the family's share of what their funds disclose` : undefined}>{money(l.value)}</td>,
      <td key="weight" className={`${pad} text-right mono text-slate-400`}>{total.value > 0 ? `${(l.value / total.value * 100).toFixed(1)}%` : <AbsentCell reason="Nothing in this set carries a value" />}</td>,
      <td key="market" data-sa-cell="market" data-market-return={m?.pct ?? ''} className={`${pad} text-right mono ${changeColor(m?.pct ?? null)}`}><span className="inline-flex items-center justify-end gap-1">
        {!m ? <AbsentCell reason="Held only inside the family’s funds, so there is no holding of theirs to price. The funds’ own returns are on the Category view." />
          : m.pct != null ? <>{pct(m.pct)}{m.annual && <span className="text-[10px]">p.a.</span>}</>
          : m.pending ? <span className="text-slate-400">Loading…</span>
          : <AbsentCell reason={m.gaps[0]?.reason ?? 'No price history is available for these holdings.'} />}
        {m && marketInfo(l.label, l.positions)}</span></td>,
      <td key="gain" data-sa-cell="gain" className={`${pad} text-right mono ${changeColor(l.gain)}`}>
        {l.gain !== null ? money(l.gain, true) : <AbsentCell reason={l.returnWhy ?? FUNDS_ONLY} />}</td>,
      <td key="ret" data-sa-cell="ret" className={`${pad} text-right mono whitespace-nowrap ${changeColor(l.returnPct)}`}>
        {l.positions.length === 0 ? <AbsentCell reason={l.returnWhy ?? FUNDS_ONLY} />
          : <SectorReturnDetails sector={l.label} positions={l.positions} accounts={accIdx} returnPct={l.returnPct} reason={l.returnWhy}
              fundValue={consolidatedView ? l.derived : 0} live={l.positions.some((p) => p.live)} money={money} />}</td>,
      <td key="contrib" data-sa-cell="contrib" className={`${pad} text-right mono ${changeColor(c)}`}>
        {c !== null ? `${c >= 0 ? '+' : ''}${c.toFixed(2)} pp` : <AbsentCell reason={l.returnWhy ?? FUNDS_ONLY} />}</td>,
    ];
  };
  const handles = (l: Line) => ({ 'data-sa-value': l.value, 'data-sa-gain': l.gain ?? '', 'data-sa-deployed': l.deployed ?? '',
    'data-sa-ret': l.returnPct ?? '', 'data-sa-contrib': contribOf(l) ?? '', 'data-sa-holdings': l.positions.length });
  const totalCells = cells(total, 'parent');
  const btn = (on: boolean) => `rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${on ? 'bg-champagne-500 text-ink-950' : 'text-slate-400 hover:bg-ink-700/60 hover:text-slate-200'}`;
  const caption = consolidatedView
    ? `${entries.length} issuers · ${costedCount} of ${total.positions.length} holdings report a cost · ${money(total.value - total.derived)} reported, ${money(total.derived)} via funds`
    : `${total.positions.length} own-account holdings · ${costedCount} report a cost`;

  return <div data-sector-attribution data-sector-set={set} data-sa-total-value={total.value} data-sa-total-gain={total.gain ?? ''}
    data-sa-total-deployed={total.deployed ?? ''} data-sa-total-ret={total.returnPct ?? ''} data-sa-total-holdings={total.positions.length}
    data-status={consolidatedView && exposure.status === 'loading' ? 'loading' : 'ready'}>
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-1">
      <div role="tablist" aria-label="Which shares" className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5">
        {SETS.map((v) => <button key={v.key} type="button" role="tab" aria-selected={set === v.key} title={v.title} data-sector-set-option={v.key}
          onClick={() => setSet(v.key)} className={btn(set === v.key)}>{v.label}</button>)}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {openable.length > 0 && <ExpandAllButton allOpen={allOpen} onClick={() => exp.setMany(openable.map((l) => l.key), !allOpen)} />}
        <EditColumns view={view} />
        <span ref={setTools} className="inline-flex" data-table-tools />
      </div>
    </div>
    <div className="overflow-x-auto"><ExportableTable className="min-w-full whitespace-nowrap text-[12.5px]" data-sa-table controlsHost={tools}>
      <thead className="border-b border-ink-700 bg-ink-800"><Tr view={view}>
        <SortHeader col="sector" view={view} align="left" pad="px-4 py-2">Sector</SortHeader>
        <SortHeader col="holdings" view={view} pad="px-4 py-2" title="Statement holdings behind the row. One stock held in two accounts is two holdings.">Holdings</SortHeader>
        <SortHeader col="value" view={view} pad="px-4 py-2" title={consolidatedView ? 'Total exposure: the shares the statements report plus the family’s share of what their funds disclose — Sector Composition’s figure.' : 'The family’s own shares, at the value their statements and live prices give.'}>Value now</SortHeader>
        <SortHeader col="weight" view={view} pad="px-4 py-2" title="Share of this set’s total value.">Weight</SortHeader>
        <SortHeader col="market" view={view} pad="px-4 py-2" title="Historical price performance over the selected dates, weighted by current holding values. Only the row’s own priced holdings; what a fund holds is not priced here.">Market return</SortHeader>
        <SortHeader col="gain" view={view} pad="px-4 py-2" title="Since investment, FIFO: gain on shares held, recorded gains on shares sold, and dividends — over the holdings that report a purchase cost.">Gain · since investment</SortHeader>
        <SortHeader col="ret" view={view} pad="px-4 py-2" title="Since investment, FIFO: gain ÷ money invested, over the holdings that report a purchase cost — Sector Composition’s Return. “N of M” names the set.">Return on cost</SortHeader>
        <SortHeader col="contrib" view={view} pad="px-4 py-2" title="The row’s gain ÷ the money invested across the whole set, so the rows add to the total return on cost.">Contribution</SortHeader>
      </Tr></thead>
      <tbody className="divide-y divide-ink-700/60">{rows.map((r) => {
        const open = exp.isOpen(r.key), kids = sortRows(r.children, view.sort, accessors);
        return <Fragment key={r.key}>
          <Tr view={view} className={r.children.length ? TREE_ROW.parent : ''} {...(r.children.length ? rowToggle(() => exp.toggle(r.key)) : {})}
            data-sa-row={r.key} data-sa-open={open ? '1' : '0'} {...handles(r)}>
            <TreeNameCell depth={0} title={r.label} sub={r.sub} hint={r.hint} open={r.children.length ? open : undefined}
              onToggle={r.children.length ? () => exp.toggle(r.key) : undefined} toggleData={{ 'data-sa-toggle': r.key }} />
            {cells(r, 'parent')}
          </Tr>
          {open && kids.map((c, i) => <Tr key={c.key} view={view} className={TREE_ROW.child} data-sa-child={r.key} data-sa-key={c.key} {...handles(c)}>
            <TreeNameCell depth={1} title={c.label} sub={c.sub} last={i === kids.length - 1} />{cells(c, 'child')}
          </Tr>)}
        </Fragment>;
      })}</tbody>
      <tfoot className="border-t-2 border-ink-600"><TrFoot view={view} className={`${TREE_ROW.total} px-4 py-2.5 font-semibold`} data-sa-total
        labelTitle="Funds, cash and private holdings have no sector of their own. On Consolidated, what the funds disclose is counted as derived exposure in each sector’s value and carries no return here; every holding’s return is on the Category view."
        label={<span className="text-slate-100">Total · {consolidatedView ? 'Consolidated' : 'Direct Equity'}<span data-sa-total-coverage className="mt-1 block text-[11px] font-normal text-slate-400">{caption}</span></span>}
        cells={Object.fromEntries(COLS.slice(1).map((key, i) => [key, totalCells[i]]))} />
      </tfoot>
    </ExportableTable></div>
  </div>;
}
