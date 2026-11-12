/**
 * ── WHERE THE PERIOD'S RETURN CAME FROM (Stage 10gu) ────────────────────────
 *
 * One card above the attribution table: the value the measured accounts
 * started at, the money added and taken out, the gain, and the value they
 * ended at — each a figure off `capitalBridge`, which is struck over the
 * table's own total, so the two can never disagree. The gain is then shown in
 * its parts (realised, unrealised, income, fees and charges), and the gain of
 * any account no record splits is one named "Not split" part, never spread
 * across the others. Realised and unrealised are net, each with its gains and
 * its losses beneath it (Stage 10mc). Every explanation is a hover or the info card.
 *
 * ── ONE ROW ON THE PAGE, THE BREAKDOWN IN ITS (i) (Stage 10mk) ──────────────
 *
 * *"In returns if i have to view breakdown you can simply give an (i) view
 * which can make it completely and simply visible as a popup instead of taking
 * so much space."* The card is the headline alone: what it covers and the
 * return. Its (i) opens everything else in one popup, all of it open: start to
 * end, the gain's parts, the dates, by account, and how it is built.
 */
import { AbsentCell } from '@/components/Absent';
import { ExportableTable } from '@/components/ExportableTable';
import { ReturnCalculationInfo } from '@/components/ReturnCalculation';
import { HoldingAssumptionInfo } from './HoldingAssumptionInfo';
import { changeColor, fmtDate } from '@/lib/format';
import type { BridgeAccount, CapitalBridge as Bridge } from '@/lib/capitalBridge';
import { returnGapText, type SelectedLine } from '@/lib/selectedSegmentReturns';
import type { Account } from '@/lib/types';

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
/** Every signed realised figure behind the total, by the record that carries it (`capitalBridge`'s own rule). */
const realisedRecords = (rows: readonly BridgeAccount[]) => rows.flatMap((r) => !r.split ? []
  : r.split.realisedBy ? r.split.realisedBy.map((x) => ({ label: `${x.label} · ${r.label}`, value: x.value })) : [{ label: r.label, value: r.split.realised }]);
const RECORD = "Summed record by record: per lot where a statement's capital gain lots make its realised line, per scheme on a fund's unit record, per holding (or whole PMS mandate) on purchase cost, otherwise per account";
const SOURCE_WORDS = { statement: "Statement's own profit and loss", 'fund-record': "Fund's dated unit record", 'purchase-cost': 'Purchase cost, first-in first-out', 'assumed-holding': 'Holding carried forward' } as const;
/** Where a record prints no separate charges, they are already inside another part. */
const INSIDE = { statement: 'The statement prints no separate charges', 'fund-record': "A fund's costs are inside its NAV, so they are already in the unrealised change",
  'purchase-cost': 'Costs are inside the purchase prices and sale proceeds, so they are already in the realised and unrealised gain',
  'assumed-holding': 'Trading charges are unknown. Fund charges are inside NAV; dividend figures are gross entitlements, not confirmed receipts.' } as const;

/** One row's realised gains or losses, by the records behind it; null where its gain is not split. */
function signedSum(r: BridgeAccount, gains: boolean) {
  return r.split ? realisedRecords([r]).reduce((s, x) => s + (gains ? Math.max(x.value, 0) : Math.min(x.value, 0)), 0) : null;
}

/**
 * WHICH ACCOUNTS THE FIGURE COVERS, AND WHICH IT DOES NOT (Stage 10nc; held
 * accounts named since Stage 10nu).
 *
 * *"What are these 53 accounts covered? … they have over 100 accounts."* A bare
 * "53 accounts covered" named neither what an account is nor how many there
 * are. The face now says "53 of N" — N every account holding an investment
 * today, plus any account the figure measures that holds nothing now — and its
 * (i) names each account left out, each one partly in, and what an account is.
 */
export function accountCoverage(total: SelectedLine, accounts: readonly Account[]) {
  const label = (id: string) => { const a = accounts.find(x => x.accountId === id); return a ? `${a.owner} · ${a.provider} · ${a.accountNo}` : id; };
  const held = new Map<string, { value: number; holdings: number }>();
  for (const p of total.positions) if (p.marketValue > 0) {
    const h = held.get(p.accountId) ?? { value: 0, holdings: 0 };
    held.set(p.accountId, { value: h.value + p.marketValue, holdings: h.holdings + 1 });
  }
  const covered = new Set(total.units.map(u => u.accountId));
  const all = new Set([...held.keys(), ...covered]);
  const coveredKeys = new Set(total.units.flatMap(u => u.positions.map(p => `${p.accountId}|${p.securityKey}`)));
  const gapsOf = (id: string) => total.missing.filter(g => g.accountId === id);
  const outside = [...held].filter(([id]) => !covered.has(id)).map(([id, h]) => ({ id, label: label(id), ...h, reason: gapsOf(id)[0] }))
    .sort((x, y) => y.value - x.value);
  const partly = [...held].filter(([id]) => covered.has(id)).map(([id, h]) => {
    const left = total.positions.filter(p => p.accountId === id && p.marketValue > 0 && !coveredKeys.has(`${p.accountId}|${p.securityKey}`));
    return { id, label: label(id), holdings: left.length, of: h.holdings, value: left.reduce((s, p) => s + p.marketValue, 0) };
  }).filter(x => x.holdings > 0).sort((x, y) => y.value - x.value);
  // HELD AT THEIR LAST VALUE (Stage 10nu): an account whose every part is carried
  // flat — a private investment, or a holding with one value on record — is in
  // the figure at 0% until a new valuation arrives, and is named here.
  const heldOnly = [...covered].filter(id => total.units.filter(u => u.accountId === id).every(u => u.held)).map(id => {
    const us = total.units.filter(u => u.accountId === id), dates = [...new Set(us.map(u => u.held!.date))].sort();
    return { id, label: label(id), value: us.reduce((s, u) => s + u.close, 0), holdings: us.length, dates,
      private: us.every(u => u.positions.every(p => p.marketSide === 'private')) };
  }).sort((x, y) => y.value - x.value);
  return { covered: covered.size, of: all.size, inBook: accounts.length, outside, partly, heldOnly,
    holdingNothing: [...covered].filter(id => !held.has(id)).length };
}

function AccountCoverageInfo({ c, money, start }: { c: ReturnType<typeof accountCoverage>; money: (n: number) => string; start: string | null }) {
  return <ReturnCalculationInfo label="Accounts covered" value={`${c.covered} of ${c.of}`} intro="Which accounts this figure covers"
    triggerLabel="Which accounts does investment performance cover?">
    <div className="space-y-3 text-left" data-bridge-account-coverage>
      <p>An account here is one statement account: a demat account, a mutual fund folio, a PMS or AIF client account, or one owner’s block of the
        consolidated review (MOPWM), which carries that owner’s private investments as one account.</p>
      <p>The book has <strong>{c.inBook}</strong> such accounts. <strong>{c.of}</strong> of them count here — every one holding an investment today
        {c.holdingNothing > 0 ? `, plus ${c.holdingNothing} that held one during the period and hold nothing now` : ''}; the rest are closed or hold nothing.
        This figure covers <strong>{c.covered}</strong>{c.heldOnly.length > 0 && <>: {c.covered - c.heldOnly.length} measured on their own records and {c.heldOnly.length} held at their latest valuation</>}.</p>
      {c.heldOnly.length > 0 && <div data-bridge-accounts-held={c.heldOnly.length}>
        <p className="font-semibold text-slate-100">Held at latest valuation · {c.heldOnly.length} {c.heldOnly.length === 1 ? 'account' : 'accounts'} · {money(c.heldOnly.reduce((s, x) => s + x.value, 0))}</p>
        <p className="mt-1 text-xs text-slate-400">No second value is on record for these dates, so each is in the figure at its latest valuation, 0% this period. A new statement or valuation then counts the change.</p>
        <ul className="mt-2 space-y-2 text-xs">{c.heldOnly.map(x => <li key={x.id} data-bridge-account-held={x.id}>
          <strong className="text-slate-100">{x.label}</strong> · {money(x.value)} · {x.holdings} {x.holdings === 1 ? 'holding' : 'holdings'}
          <span className="block text-slate-400">{x.private ? 'Private: no published price. ' : ''}Valued {x.dates.map(d => fmtDate(d)).join(', ')}</span>
        </li>)}</ul>
      </div>}
      {c.outside.length > 0 && <div data-bridge-accounts-outside={c.outside.length}>
        <p className="font-semibold text-slate-100">Not included · {c.outside.length} {c.outside.length === 1 ? 'account' : 'accounts'} · {money(c.outside.reduce((s, x) => s + x.value, 0))}</p>
        <ul className="mt-2 space-y-2 text-xs">{c.outside.map(x => <li key={x.id} data-bridge-account-outside={x.id}>
          <strong className="text-slate-100">{x.label}</strong> · {money(x.value)} · {x.holdings} {x.holdings === 1 ? 'holding' : 'holdings'}
          {x.reason && <span className="block text-slate-400">{x.reason.plainReason ? x.reason.reason : returnGapText(x.reason.reason, start)}</span>}
        </li>)}</ul>
      </div>}
      {c.partly.length > 0 && <div data-bridge-accounts-partly={c.partly.length}>
        <p className="font-semibold text-slate-100">Partly included · {c.partly.length} {c.partly.length === 1 ? 'account' : 'accounts'}</p>
        <ul className="mt-2 space-y-1 text-xs">{c.partly.map(x => <li key={x.id} data-bridge-account-partly={x.id}>
          <strong className="text-slate-100">{x.label}</strong> · {x.holdings} of {x.of} holdings left out · {money(x.value)}</li>)}</ul>
        <p className="mt-1 text-xs text-slate-400">Each holding left out, and the record it needs, is in the Total row’s info card.</p>
      </div>}
    </div>
  </ReturnCalculationInfo>;
}

export function CapitalBridge({ bridge: b, total, typeLabel, caption, money, accounts, start }: {
  bridge: Bridge | null; total: SelectedLine; typeLabel: string; caption: string;
  money: (n: number, sign?: boolean) => string; accounts: readonly Account[]; start: string | null;
}) {
  const coverage = accountCoverage(total, accounts);
  if (!b) return <div className="card min-w-0 px-5 py-3.5" data-capital-bridge data-bridge-mode="">
    <div className="text-sm font-semibold text-slate-100">Investment performance</div>
    <div className="mt-1 text-[13px]"><AbsentCell reason={total.missing.length ? 'No account has a verified opening value and dated money record for these dates; the info button on the Total row lists what each one needs.' : 'No account holds anything to measure over these dates.'} /></div>
  </div>;
  const dated = (d: string | null) => (d ? fmtDate(d) : '—');
  const assumed = total.units.some(u => u.assumption);
  const accountCount = new Set(total.units.map(u => u.accountId)).size;
  const steps: { key: string; label: string; value: number; sign?: boolean; sub: string; title: string }[] = b.mode === 'window' ? [
    { key: 'opening', label: 'Opening value', value: b.opening, sub: dated(b.from), title: "Statement values, plus published prices for holdings carried forward, on their measured starting dates" },
    // A computed zero says why on its face: the dated record shows no movement.
    { key: 'added', label: '+ Money added', value: b.added, sub: b.added === 0 ? 'none in this period' : 'new capital', title: 'Money put into these accounts during the period, on its dates' },
    { key: 'taken', label: assumed ? '− Payouts / taken out' : '− Money taken out', value: b.takenOut, sub: assumed ? 'includes dividend entitlements' : b.takenOut === 0 ? 'none in this period' : 'withdrawals', title: 'Recorded withdrawals and payouts, plus gross dividend entitlements on holdings carried forward' },
    { key: 'gain', label: '+ Gain this period', value: b.gain, sign: true, sub: 'see the gain breakdown', title: 'Value at end − value at start − money added + money taken out' },
    { key: 'closing', label: 'Closing value', value: b.closing, sub: dated(b.to), title: "Statement values, plus published prices for holdings carried forward, on their measured closing dates" },
  ] : b.mode === 'inception' ? [
    { key: 'added', label: 'Money paid in', value: b.added, sub: `since ${dated(b.from)}`, title: 'Every dated purchase or contribution since the first investment' },
    { key: 'taken', label: '− Money taken out', value: b.takenOut, sub: 'redemptions and payouts', title: 'Every dated redemption, withdrawal and payout since the first investment' },
    { key: 'gain', label: '+ Gain', value: b.gain, sign: true, sub: 'see the split below', title: 'Value now + money taken out − money paid in' },
    { key: 'closing', label: '= Value now', value: b.closing, sub: dated(b.to), title: "Each account's latest verified statement value" },
  ] : [
    { key: 'added', label: 'Invested', value: b.added, sub: 'purchase cost', title: 'Purchase cost of units held and units already sold; a whole PMS mandate enters at the capital paid in' },
    { key: 'taken', label: '− Received back', value: b.takenOut, sub: 'sales, income, withdrawals', title: 'What came back out of these investments: sale proceeds, income and withdrawals — invested + gain − value now' },
    { key: 'gain', label: '+ Gain', value: b.gain, sign: true, sub: 'see the split below', title: 'Realised + unrealised + income, on purchase cost' },
    { key: 'closing', label: '= Value now', value: b.closing, sub: 'statement values', title: "Each holding's value on its own latest statement" },
  ];
  const named = (rows: BridgeAccount[]) => rows.map((r) => r.label).join('; ');
  const noSplit = 'No statement or fund record splits the gain of these accounts over these dates';
  const noCharges = b.splitCount ? 'No record here prints charges separately: fund costs are inside the NAV, and purchase-cost records carry them in the prices paid and received' : noSplit;
  const parts: { key: string; label: string; value: number | null; title: string; sub?: boolean }[] = [
    { key: 'realised', label: 'Realised · net', value: b.realised, title: 'Gain booked on units sold, against their purchase cost (first-in, first-out): realised gains less realised losses' },
    { key: 'realised-gains', label: 'Gains', value: b.realisedGains, sub: true, title: `Realised results that are gains. ${RECORD}.` },
    { key: 'realised-losses', label: 'Losses', value: b.realisedLosses, sub: true, title: `Realised results that are losses. ${RECORD}.` },
    { key: 'unrealised', label: 'Unrealised · net', value: b.unrealised, title: 'Change in the paper gain on what is still held: unrealised gains less unrealised losses' },
    { key: 'unrealised-gains', label: 'Gains', value: b.unrealisedGains, sub: true, title: `Unrealised changes that are gains. ${b.mode === 'cost' ? 'Per holding, or whole PMS mandate' : 'Per account, or per holding where one is measured on its own'}.` },
    { key: 'unrealised-losses', label: 'Losses', value: b.unrealisedLosses, sub: true, title: `Unrealised changes that are losses. ${b.mode === 'cost' ? 'Per holding, or whole PMS mandate' : 'Per account, or per holding where one is measured on its own'}.` },
    { key: 'income', label: 'Income', value: b.income, title: 'Dividends, interest and distributions received' },
    { key: 'charges', label: '− Fees & charges', value: b.charges == null ? null : -b.charges, title: 'Management fees, expenses and other charges the statements print separately. A fund folio’s costs are inside its NAV, so they are in its unrealised change.' },
  ];
  const ret = total.returnPct, period = total.periodPct;
  const annual = total.measured?.basis === 'annual';
  const figure = ret != null
    ? <strong className={`text-2xl font-semibold tabular ${changeColor(ret)}`}>{pct(ret)}{annual && <span className="ml-1 text-xs font-normal text-slate-400">p.a.</span>}</strong>
    : <AbsentCell reason={total.measured?.reason ?? 'not measured on these dates'} />;
  return <div className="card min-w-0 px-5 py-3.5" data-capital-bridge data-bridge-mode={b.mode} data-bridge-opening={b.opening} data-bridge-added={b.added}
    data-bridge-taken={b.takenOut} data-bridge-gain={b.gain} data-bridge-closing={b.closing} data-bridge-realised={b.realised ?? ''}
    data-bridge-unrealised={b.unrealised ?? ''} data-bridge-realised-gains={b.realisedGains ?? ''} data-bridge-realised-losses={b.realisedLosses ?? ''}
    data-bridge-unrealised-gains={b.unrealisedGains ?? ''} data-bridge-unrealised-losses={b.unrealisedLosses ?? ''} data-bridge-income={b.income ?? ''} data-bridge-charges={b.charges ?? ''} data-bridge-unsplit={b.unsplit}
    data-bridge-accounts={b.rows.length} data-bridge-split-accounts={b.splitCount}>
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-100">Investment performance</h3>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400" title={caption} data-bridge-caption
          data-bridge-accounts-covered={coverage.covered} data-bridge-accounts-of={coverage.of}>
          <span>{coverage.covered} of {coverage.of} accounts covered</span>
          <AccountCoverageInfo c={coverage} money={(n) => money(n)} start={start} />
          <HoldingAssumptionInfo units={total.units} showLabel={false} />
        </div>
      </div>
      <div className="flex items-center gap-3" data-bridge-return={ret ?? ''} data-bridge-period-return={period ?? ''}>
        <div className="text-right">
          <p className="text-xs text-slate-400" data-bridge-return-label>{typeLabel}{ret != null && (annual ? ' · annualised' : ' · period')}</p>
          <div className="mt-0.5 leading-none" aria-live="polite">{figure}</div>
        </div>
        <ReturnCalculationInfo label="Investment performance" value={figure} intro="Breakdown" wide
          triggerLabel="Show the investment performance breakdown">
          <div className="space-y-5" data-bridge-breakdown>
            <p className="text-xs text-slate-400" data-bridge-dates>{typeLabel}{ret != null && (annual ? ' · annualised' : ' · period')} · {accountCount} {accountCount === 1 ? 'account' : 'accounts'} · Valuations: {b.from && `${dated(b.from)} → `}{dated(b.to)}</p>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <dl data-bridge-steps>{steps.map((s) => <div key={s.key}
                className={`flex items-baseline justify-between gap-4 py-2 text-[13px] ${s.key === 'closing' ? 'font-semibold text-slate-100' : 'border-b border-ink-700'}`}
                data-bridge-step={s.key} title={`${s.title} · ${s.sub}`}>
                <dt className={s.key === 'closing' ? '' : 'text-slate-400'}>{s.label}</dt>
                <dd className={`shrink-0 tabular ${s.sign ? changeColor(s.value) : 'text-slate-100'}`}>{money(s.value)}</dd>
              </div>)}</dl>
              <section data-bridge-split>
                <h3 className="label-xs">Gain breakdown</h3>
                <dl className="mt-1 divide-y divide-ink-700 text-xs">
                  {parts.map((p) => <div key={p.key} className={`flex justify-between gap-4 ${p.sub ? 'py-1 pl-4 text-[11px]' : 'py-1.5'}`} data-bridge-part={p.key} title={p.title}>
                    <dt className={p.sub ? 'text-slate-500' : 'text-slate-400'}>{p.label}</dt><dd className="shrink-0 tabular">{p.value != null ? <span className={changeColor(p.value)}>{money(p.value, true)}</span> : <AbsentCell reason={p.key === 'charges' ? noCharges : noSplit} />}</dd>
                  </div>)}
                  {b.unsplitCount > 0 && <div className="flex justify-between gap-4 py-1.5" data-bridge-part="unsplit"
                    title={`Gain of ${b.unsplitCount} accounts whose records do not split it: ${named(b.rows.filter((r) => !r.split))}`}>
                    <dt className="text-slate-400">Not split · {b.unsplitCount} {b.unsplitCount === 1 ? 'account' : 'accounts'}</dt><dd className={`shrink-0 tabular ${changeColor(b.unsplit)}`}>{money(b.unsplit, true)}</dd>
                  </div>}
                </dl>
              </section>
            </div>
            <details data-bridge-accounts-table>
              <summary className="ring-focus w-fit cursor-pointer rounded text-[12px] text-slate-300">By account</summary>
              <div className="mt-2 overflow-x-auto">
                <ExportableTable className="min-w-full whitespace-nowrap text-[12px]" exportName="capital-bridge"
                  data-table-static="A bridge reads left to right: start, money in and out, the gain's parts, end">
                  <thead className="border-b border-ink-700 bg-ink-800"><tr className="text-slate-400">
                    {['Account', b.mode === 'window' ? 'Start' : null, b.mode === 'cost' ? 'Invested' : 'Added', b.mode === 'cost' ? 'Received back' : 'Taken out',
                      'Realised gains', 'Realised losses', 'Realised', 'Unrealised', 'Income', 'Fees & charges', 'Gain', 'End', 'Split from'].filter(Boolean).map((h, i) =>
                      <th key={h} className={`px-3 py-2 font-medium ${i === 0 ? 'min-w-[13rem] text-left' : 'text-right'}`}>{h}</th>)}
                  </tr></thead>
                  <tbody>{b.rows.map((r) => <tr key={r.key} data-bridge-row={r.accountId}>
                    <td className="min-w-[13rem] whitespace-normal px-3 py-1.5 text-left text-slate-100">{r.label}<span className="block text-[11px] text-slate-500">{r.from ? `${fmtDate(r.from)} → ` : ''}{r.to ? fmtDate(r.to) : ''}</span></td>
                    {b.mode === 'window' && <td className="px-3 py-1.5 text-right mono">{money(r.opening)}</td>}
                    <td className="px-3 py-1.5 text-right mono">{money(r.added)}</td>
                    <td className="px-3 py-1.5 text-right mono">{money(r.takenOut)}</td>
                    {([true, false] as const).map((gains) => { const v = signedSum(r, gains); return <td key={String(gains)} className={`px-3 py-1.5 text-right mono ${changeColor(v)}`}>
                      {v != null ? money(v, true) : <AbsentCell reason={r.unsplitReason ?? noSplit} />}</td>; })}
                    {(['realised', 'unrealised', 'income'] as const).map((k) => <td key={k} className={`px-3 py-1.5 text-right mono ${changeColor(r.split?.[k] ?? null)}`}>
                      {r.split ? money(r.split[k], true) : <AbsentCell reason={r.unsplitReason ?? noSplit} />}</td>)}
                    <td className="px-3 py-1.5 text-right mono">{r.split?.charges != null ? money(-r.split.charges, true)
                      : <AbsentCell reason={r.split ? INSIDE[r.split.source] : r.unsplitReason ?? noSplit} />}</td>
                    <td className={`px-3 py-1.5 text-right mono ${changeColor(r.gain)}`}>{money(r.gain, true)}</td>
                    <td className="px-3 py-1.5 text-right mono text-slate-100">{money(r.closing)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-400" title={r.split?.note ?? r.unsplitReason ?? ''}>{r.split ? SOURCE_WORDS[r.split.source] : 'Not split'}</td>
                  </tr>)}</tbody>
                  <tfoot className="border-t-2 border-ink-600"><tr className="font-semibold" data-bridge-total>
                    <td className="px-3 py-2 text-left text-slate-100">Total</td>
                    {b.mode === 'window' && <td className="px-3 py-2 text-right mono">{money(b.opening)}</td>}
                    <td className="px-3 py-2 text-right mono">{money(b.added)}</td>
                    <td className="px-3 py-2 text-right mono">{money(b.takenOut)}</td>
                    {([b.realisedGains, b.realisedLosses, b.realised, b.unrealised, b.income] as const).map((v, i) => <td key={i} className={`px-3 py-2 text-right mono ${changeColor(v)}`}>{v != null ? money(v, true) : <AbsentCell reason={noSplit} />}</td>)}
                    <td className="px-3 py-2 text-right mono">{b.charges != null ? money(-b.charges, true) : <AbsentCell reason={noCharges} />}</td>
                    <td className={`px-3 py-2 text-right mono ${changeColor(b.gain)}`}>{money(b.gain, true)}</td>
                    <td className="px-3 py-2 text-right mono text-slate-100">{money(b.closing)}</td>
                    <td className="px-3 py-2 text-right font-normal text-slate-400">{b.splitCount} of {b.rows.length} split</td>
                  </tr></tfoot>
                </ExportableTable>
              </div>
            </details>
            <details data-bridge-how>
              <summary className="ring-focus w-fit cursor-pointer rounded text-[12px] text-slate-300">How it is built</summary>
              <div className="mt-2"><BridgeWorking b={b} money={money} /></div>
            </details>
          </div>
        </ReturnCalculationInfo>
      </div>
    </div>
  </div>;
}

function BridgeWorking({ b, money }: { b: Bridge; money: (n: number, sign?: boolean) => string }) {
  const by = (source: string) => b.rows.filter((r) => r.split?.source === source);
  const unsplit = b.rows.filter((r) => !r.split);
  const losses = realisedRecords(b.rows).filter((x) => x.value < 0).sort((x, y) => x.value - y.value);
  // A statement's realised line no lots break down: its own losses are inside its net.
  const oneLine = b.rows.filter((r) => r.split?.source === 'statement' && !r.split.realisedBy && r.split.realised !== 0);
  return <div className="space-y-3" data-bridge-working>
      <p>{b.mode === 'window' ? 'Value at start + money added − money taken out + gain = value at end, for each account and in total.'
        : b.mode === 'inception' ? 'Money paid in − money taken out + gain = value now, for each account and in total.'
        : 'Invested − received back + gain = value now. Invested is the purchase cost of units held and sold; received back is what the cost and gain do not leave in the value — sale proceeds, income and withdrawals.'}</p>
      <p>It covers the same {b.rows.length} {b.rows.length === 1 ? 'account' : 'accounts'} as the table's total, so its gain is the total's recorded gain. Holdings with no usable record for these dates are listed in the Total row's info card.</p>
      <p>The gain is split only where a record splits it. Nothing is apportioned: an account whose records do not split its gain over these dates is shown whole, as Not split.</p>
      {b.realised != null && <div data-bridge-realised-working>
        <p className="font-semibold text-slate-100">Realised · net {money(b.realised, true)} = gains {money(b.realisedGains ?? 0)} − losses {money(Math.abs(b.realisedLosses ?? 0))}</p>
        <p className="mt-1 text-xs">{RECORD}. A record's figure is already net of its own losses: a holding's first-in, first-out result over all its sales, or the statement's realised line.</p>
        {losses.length > 0 && <ul className="mt-1 space-y-1 text-xs">{losses.map((x, i) => <li key={i} data-bridge-realised-loss><strong>{x.label}</strong> · {money(x.value, true)}</li>)}</ul>}
        {oneLine.length > 0 && <p className="mt-1 text-xs" data-bridge-realised-one-line>One realised line, with no lots that make it: {oneLine.map((r) => `${r.label} (${money(r.split!.realised, true)})`).join('; ')}.</p>}
      </div>}
      {(['statement', 'fund-record', 'purchase-cost'] as const).map((s) => by(s).length > 0 && <div key={s}>
        <p className="font-semibold text-slate-100">{SOURCE_WORDS[s]} · {by(s).length} {s === 'purchase-cost' ? (by(s).length === 1 ? 'holding or mandate' : 'holdings and mandates') : by(s).length === 1 ? 'account' : 'accounts'}</p>
        {s !== 'purchase-cost' ? <ul className="mt-1 space-y-1 text-xs">{by(s).map((r) => <li key={r.key}><strong>{r.label}</strong> · {r.split!.note}</li>)}</ul>
          : <p className="mt-1 text-xs">{by(s)[0].split!.note}.</p>}
      </div>)}
      {unsplit.length > 0 && <div data-bridge-unsplit-list>
        <p className="font-semibold text-slate-100">Not split · {money(b.unsplit, true)}</p>
        <ul className="mt-1 space-y-1 text-xs">{unsplit.map((r) => <li key={r.key}><strong>{r.label}</strong> · gain {money(r.gain, true)} · {r.unsplitReason}</li>)}</ul>
      </div>}
    </div>;
}
