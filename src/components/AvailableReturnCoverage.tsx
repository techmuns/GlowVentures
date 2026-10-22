import { fmtDate } from '@/lib/format';
import type { Account } from '@/lib/types';
import { holdingAssumptionText } from '@/lib/assumedHoldingReturns';
import { RETURN_TYPES } from '@/lib/periodReturns';
import { returnGapText, type ReturnSelection, type SelectedLine } from '@/lib/selectedSegmentReturns';

/** The same plain coverage explanation on attribution rows and headline cards. */
export function AvailableReturnCoverage({ line: l, selection, accounts, money, field, notes = [] }: {
  line: SelectedLine; selection: ReturnSelection; accounts: Account[];
  money: (n: number, sign?: boolean) => string; field: 'gain' | 'return';
  notes?: { label: string; reason: string }[];
}) {
  // The measure the figure IS: under a year, the absolute return in place of an XIRR or CAGR (Stage 10hk).
  const shownAs = l.measured?.shownAs ?? selection.type;
  const type = RETURN_TYPES.find(t => t.key === shownAs)!;
  const dates = selection.start && selection.end ? `${fmtDate(selection.start)} → ${fmtDate(selection.end)}` : 'available history';
  const coveredPositions = new Set(l.units.flatMap(u => u.positions.map(p => `${p.accountId}|${p.securityKey}`)));
  const coveredValue = l.positions.filter(p => coveredPositions.has(`${p.accountId}|${p.securityKey}`)).reduce((s, p) => s + p.marketValue, 0);
  const closing = l.units.reduce((s, u) => s + u.close, 0);
  const gainParts = selection.inception && selection.type === 'absolute' ? [
    ['Change in value of holdings still held', 'unrealised'],
    ['Recorded sale / managed-account gains', 'realised'],
    ['Recorded dividends and income', 'income'],
  ].flatMap(([label, key]) => {
    const amounts = l.units.map(u => u.gainParts?.[key as 'unrealised' | 'realised' | 'income']).filter((v): v is number => v != null);
    return amounts.length ? [[label, amounts.reduce((s, v) => s + v, 0)] as const] : [];
  }) : [];
  const gaps = [...l.missing].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const count = new Set(l.units.map(u => u.accountId)).size;
  const assumed = l.units.filter(u => u.assumption);
  const reason = (line: SelectedLine) => !line.measured?.reason && line.missing[0]?.plainReason ? line.missing[0].reason
    : returnGapText(line.measured?.reason ?? line.missing[0]?.reason ?? 'We need values and dated payments for these dates.', selection.start);
  return (
      <div data-attribution-coverage className="space-y-3 whitespace-normal font-normal text-left">
        {assumed.length > 0 && <div className="rounded-lg bg-ink-900 p-3" data-return-assumption-summary>
          <p>{holdingAssumptionText(new Set(assumed.map(u => u.assumption!.owner)).size === 1 ? assumed[0].assumption!.owner : 'each owner')}</p>
          <p className="mt-1 text-xs">{assumed.length} assumed holdings · published prices and gross dividend entitlements. No new purchase cost is assumed.</p>
        </div>}
        <p className="text-slate-100">{count ? <>Based on the available records for <strong>{count} {count === 1 ? 'account' : 'accounts'}</strong> only.</>
          : 'No account has enough information for this calculation on these dates.'}</p>
        {field === 'return' && l.returnPct == null && (l.units.length > 0 || !l.missing.length) && <p className="rounded-lg bg-ink-900 p-3">{reason(l)}</p>}
        {notes.length > 0 && <div><p className="font-semibold text-slate-100">Newer records still need checking</p>
          <p>These accounts still use their last checked statement.</p>
          <ul className="mt-2 space-y-2">{notes.map((n, i) => <li key={i}><strong>{n.label}</strong><p>{returnGapText(n.reason, selection.start)}</p><details><summary>Statement detail</summary>{n.reason}</details></li>)}</ul>
        </div>}
        <div data-attribution-missing>
          <p className="font-semibold text-slate-100">What is missing?</p>
          {l.missing.length ? <>
            <p className="mt-1">These items are left out. Here is what we need to include them.</p>
            <ul className="mt-3 space-y-3">{gaps.map((g, i) => <li key={`${g.label}|${i}`} data-return-gap={g.accountId} className="rounded-lg bg-ink-900 p-3">
              <p className="font-medium text-slate-100">{(() => {
                const source = accounts.find(a => a.accountId === g.accountId);
                const suffix = source ? ` · ${source.owner} · ${source.provider} · account ${source.accountNo}` : '';
                return suffix && g.label.endsWith(suffix) ? g.label.slice(0, -suffix.length) : g.label;
              })()}</p>
              <p className="mt-1" data-return-gap-reason>{g.plainReason ? g.reason : returnGapText(g.reason, selection.start)}</p>
              <details className="mt-2 text-xs text-slate-400"><summary className="cursor-pointer">Account and statement details</summary>
                <p className="mt-1">{(() => { const source = accounts.find(a => a.accountId === g.accountId); return source ? `${source.owner} · ${source.provider} · account ${source.accountNo} · statement ${fmtDate(source.asOf)}` : g.accountId; })()}{g.value != null ? ` · ${money(g.value)}` : ''}</p>
                <p className="mt-1">{g.detail ?? g.reason}</p>
              </details>
            </li>)}</ul>
          </> : <p className="mt-1">{l.units.length ? 'All available records for this row are included. Records missing elsewhere are listed in the total’s info card.' : reason(l)}</p>}
        </div>
        {l.units.length > 0 && <details data-attribution-method><summary className="ring-focus cursor-pointer rounded text-slate-200">How it’s calculated</summary>
          <div className="mt-3 space-y-3">
        <p>{selection.inception ? 'Since the first investment' : `Selected period: ${dates}`} · {type.label}{l.measured?.basis === 'annual' ? ' · per year' : ' · not annualised'}</p>
        {l.units.length > 0 && <>
          <p>{l.positions.length > 0 && <>The covered holdings are worth <strong>{money(coveredValue)}</strong> out of {money(l.value)} in total current holdings. </>}
            The closing values used total <strong>{money(closing)}</strong>. {assumed.length ? 'Labelled assumptions use recorded quantities and published prices; the rest use statements on their own dates.' : 'Each statement is used on its own date.'}</p>
          <p>{field === 'gain' ? 'Gain is the change in value after allowing for money added and taken out. For a purchase-cost record, it includes recorded sale gains and income.'
            : shownAs !== selection.type ? `The money was at work for under a year, so this is the absolute return, not ${selection.type === 'xirr' ? 'an XIRR' : 'a CAGR'}: a return under a year is never annualised (debt excepted). `
              + (selection.inception ? 'The gain is divided by the money paid in.' : 'The gain is divided by the money at work. Money added later counts only for the days it was invested.')
            : selection.type === 'xirr' ? `The return allows for when money went in and came back, and is stated per year.${l.measured?.working && l.measured.working.days < 365 && l.periodPct != null ? ` This period is ${l.measured.working.days} days and is annualised only because it is debt; over the period itself it is ${l.periodPct >= 0 ? '+' : ''}${l.periodPct.toFixed(2)}%.` : ''}`
            : selection.type === 'cagr' ? 'This is a yearly growth rate over a year or more of measured history; since investment it also needs one purchase.'
            : selection.inception ? 'The gain is divided by the purchase cost of the holdings and units sold, or the money paid into a whole managed account.'
            : 'The gain is divided by the money at work. Money added later counts only for the days it was invested.'}</p>
        </>}
        {gainParts.length > 0 && <details data-gain-parts>
          <summary className="ring-focus cursor-pointer rounded text-slate-200">See how the gain adds up</summary>
          <p className="mt-2">Add these recorded amounts to get the gain. Managed-account gains include money already paid back, which is outside the closing value.</p>
          <dl className="mt-2 grid grid-cols-2 gap-3">{gainParts.map(([label, amount]) => <div className="contents" key={label}>
            <dt>{label}</dt><dd className="text-right tabular">{money(amount, true)}</dd>
          </div>)}</dl>
        </details>}
        {l.units.length > 0 && <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm" data-attribution-amounts>
          {(l.measured?.working ? [
            ['Starting value', l.measured.working.opening], ['Money added', l.measured.working.capitalIn],
            ['Money taken out', l.measured.working.capitalOut], ['Closing value', l.measured.working.closing],
            ...(l.measured.working.base != null ? [['Money at work', l.measured.working.base]] : []),
          ] : [['Purchase cost / money paid in', l.invested], ['Closing value', closing]]).map(([label, amount]) =>
            <div className="contents" key={String(label)}><dt className="text-slate-400">{label}</dt><dd className="text-right tabular text-slate-100">{money(amount as number)}</dd></div>)}
          <dt className="text-slate-400">Gain / loss</dt><dd className="text-right tabular text-slate-100">{money(l.gain!, true)}</dd>
        </dl>}
          </div>
        </details>}
        {l.units.length > 0 && <details data-attribution-included><summary className="ring-focus cursor-pointer rounded text-slate-200">View included accounts and dates</summary>
          <ul className="mt-3 space-y-3 text-xs">{l.units.map(u => <li key={u.key}><p className="text-slate-100">{u.label}</p>
            <p>{u.from ? fmtDate(u.from) : 'Purchase-cost record'} → {u.to ? fmtDate(u.to) : 'Date unavailable'} · closing value {money(u.close)} · gain {money(u.gain, true)}{u.assumption ? ' · assumed holding' : ''}</p></li>)}</ul>
        </details>}
      </div>
  );
}
