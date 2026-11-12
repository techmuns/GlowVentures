import type { Portfolio, Position } from './types';
import { currentHoldings, dedupedPositions, mandateLabel } from './analytics';
import { exitedRows } from './drilldown';
import { nothingToMeasure } from './returns';
import { accountInputs, periodStart, windowReturns, type AccountInput, type AccountWindow } from './periodReturns';
import { selectedSegmentReturns, type ReturnGap, type ReturnSelection, type ReturnUnit } from './selectedSegmentReturns';
import { assumedHoldingReturns, type AssumedReturnBook } from './assumedHoldingReturns';
import { ytdBook, ytdSelection } from './ytdAvailable';
import { heldAtLastValue } from './periodRules';
import {
  BOOK_ACCOUNT_NAV_HISTORY, BOOK_ACCOUNT_CASH_FLOWS, BOOK_NAV_COVERAGE,
  BOOK_UNDATED_CAPITAL, BOOK_CAPITAL_FROM_INCEPTION, BOOK_UNIT_WINDOWS, BOOK_TRADE_OPENINGS,
} from '@/data/glowData';
import type { Account, TradeOpening, UnitWindow } from './types';

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** What a rebuilt opening rests on, for the card's info button. */
export function tradeOpeningNote(o: TradeOpening, opened: string): string {
  const entries = o.openings.find(x => x.date === opened)?.entries ?? [];
  return `Opening value on ${longDate(opened)} rebuilt from the manager's own records: every trade since inception, its bank book's cash balance and that day's exchange closes. `
    + `The same rebuild matches the manager's printed totals within ${Math.max(...o.checks.map(c => Math.abs(c.diffPct)))}% on ${o.checks.map(c => longDate(c.date)).join(', ')}.`
    + entries.map(e => ` ${e.securityKey.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')} was not yet listed on that day, so it joins on its first close (${longDate(e.date)}).`).join('');
}

/**
 * THE OPENING VALUES WE REBUILT OURSELVES (Stage 10ni; the family, 12 Nov 2026:
 * "can't we calculate it ourselves by finding out the market prices of all the
 * holdings at that particular time?"). An account the book carries a rebuilt
 * opening for (`BOOK_TRADE_OPENINGS`) opens on it: the opening days' values,
 * the manager's own later values, and the capital register's money in and out.
 */
export function withTradeOpening(i: AccountInput, o: TradeOpening | undefined, marks: readonly { date: string; nav: number }[] = []): AccountInput {
  if (!o || i.outside || !o.openings.length) return i;
  const first = o.openings[0].date;
  if (i.knownFrom != null && i.knownFrom <= first && !i.flowsUnknown) return i;
  const vals = new Map<string, number>();
  for (const v of i.flowsUnknown ? [] : i.valuations) vals.set(v.date, v.value);
  for (const m of marks) if (m.date > first && m.date <= o.capitalTo) vals.set(m.date, m.nav);
  for (const x of o.openings) vals.set(x.date, x.value);
  // The ledger's money up to where the account's own record starts; the record's own after it.
  const own = i.flowsUnknown ? [] : i.flows.filter(f => i.knownFrom == null || f.date > i.knownFrom);
  const ledger = o.flows.filter(f => i.flowsUnknown || i.knownFrom == null || f.date <= i.knownFrom);
  return { ...i, valuations: [...vals].map(([date, value]) => ({ date, value })).sort((x, y) => x.date.localeCompare(y.date)),
    flows: [...ledger, ...own].sort((x, y) => x.date.localeCompare(y.date)), knownFrom: first,
    knownTo: i.flowsUnknown ? o.capitalTo : i.knownTo, flowsUnknown: null, undated: [], tradeOpening: true };
}

/** Shared selected records, including the same fallback gates as attribution. */
export function statementReturnInputs(statement: Portfolio, unitWindows: Readonly<Record<string, UnitWindow>> = BOOK_UNIT_WINDOWS): AccountInput[] {
  return accountInputs({ accounts: statement.accounts, positions: statement.positions,
    returnRecords: statement.accountReturnRecords, navHistory: BOOK_ACCOUNT_NAV_HISTORY,
    cashFlows: BOOK_ACCOUNT_CASH_FLOWS, groups: [], coverage: BOOK_NAV_COVERAGE.covered,
    undated: BOOK_UNDATED_CAPITAL, fromInception: BOOK_CAPITAL_FROM_INCEPTION,
    labelOf: a => mandateLabel(a) || a.provider,
  }).map(i => ({ ...i, outside: nothingToMeasure(statement, statement.accounts.find(a => a.accountId === i.accountId)!) }))
    .map(i => {
      /**
       * NO MONEY MOVED BETWEEN THESE STATEMENTS (Stage 10la). An account whose
       * verified record is refused, but whose consecutive statements hold
       * exactly the same units (`BOOK_UNIT_WINDOWS`), is measured from the
       * first of them: its value moved by the market alone, with no dated flow.
       */
      const rebuilt = withTradeOpening(i, BOOK_TRADE_OPENINGS[i.accountId], BOOK_ACCOUNT_NAV_HISTORY[i.accountId]);
      if (rebuilt !== i) return rebuilt;
      const w = unitWindows[i.accountId];
      if (!w || !i.flowsUnknown || i.outside) return i;
      const dates = w.valuations.map(v => v.date);
      return { ...i, valuations: w.valuations.map(({ date, value }) => ({ date, value })), flows: [], undated: [],
        knownFrom: dates[0], knownTo: dates.at(-1)!, flowsUnknown: null, unitWindow: w.evidence };
    });
}

/** Why a private investment is held flat: it has no published price, only the valuations its company or fund sends. */
export const PRIVATE_HELD = 'A private investment: it has no published price, so it is held at its latest valuation from the company or fund until a new one arrives.';

/**
 * THE THREE RETURN CARDS, ONE RULE (Stage 10la; the family, 4 Nov 2026): each
 * account and holding from its first value on record in the period — the
 * Monitor's own `ytdBook` with the period's open — and every public holding no
 * record measures held at its last value. Financial year from 31 March, the
 * calendar year from 31 December (`open` left out), available history (`null`)
 * from each first record. Morning CIO's cards and the Returns tab read this one
 * selection, so a card and its table never disagree.
 */
export function periodSelection({ inputs, current, accounts, end, assumptions, open }: {
  inputs: readonly AccountInput[]; current: readonly Position[]; accounts: readonly Account[]; end: string;
  assumptions: AssumedReturnBook | null; open?: string | null;
}): ReturnSelection {
  const book = ytdBook({ inputs, held: current, accounts, end, assumptions, money: String, open });
  const picked = ytdSelection(book, inputs, current);
  const first = [...picked.windows.map(w => w.openDate), ...(picked.assumedUnits ?? []).flatMap(u => u.from ? [u.from] : [])].sort()[0] ?? null;
  const start = book.open ?? first;
  /**
   * HELD AT ITS LAST VALUE (the family, 4 Nov 2026). A holding no record
   * measures this period is carried flat from its latest valuation to the
   * end: in the base at 0%, and named. One still waiting on its price
   * history is not held — it is loading, and says so. Private investments are
   * held the same way (Stage 10nu, the family, 12 Nov 2026), so every account
   * holding value is in the figure; a new valuation then counts the change.
   */
  const accountOf = new Map(accounts.map(a => [a.accountId, a]));
  const whole = new Set(picked.windows.map(w => w.accountId));
  const keyOf = (x: { accountId: string; securityKey?: string }) => `${x.accountId}|${x.securityKey}`;
  const measured = new Set((picked.assumedUnits ?? []).flatMap(u => u.positions.map(keyOf)));
  // Prices still loading, or a price service that did not answer, wait for prices: never held.
  const pending = new Set((picked.assumptionGaps ?? []).filter(g => /still loading|could not load/i.test(g.reason)).map(keyOf));
  const held = assumptions ? current.filter(p => !whole.has(p.accountId) && !measured.has(keyOf(p)) && !pending.has(keyOf(p)))
    .flatMap(p => {
      const a = accountOf.get(p.accountId);
      const g = picked.assumptionGaps?.find(x => keyOf(x) === keyOf(p)) ?? picked.excluded.find(x => x.accountId === p.accountId);
      const u = a ? heldAtLastValue(p, a, start, end, p.marketSide === 'private' ? PRIVATE_HELD
        : g?.reason ?? 'No second value on record this period.') : null;
      return u ? [u] : [];
    }) : [];
  const heldKeys = new Set(held.flatMap(u => u.positions.map(keyOf)));
  // EVERY PART IS CARRIED AT ITS LATEST VALUE TO THE END (the family, 4 Nov 2026):
  // a record that closes on 30 Sep is still invested, never money taken out that
  // day. Each keeps the date it measures; only the pooled weights run on.
  const carry = (w: AccountWindow): AccountWindow => (w.closeDate < end ? { ...w, carriedTo: end } : w);
  return { inception: false, type: 'xirr', start, end, inceptionRows: [], ...picked,
    windows: picked.windows.map(carry),
    assumedUnits: [...(picked.assumedUnits ?? []), ...held].map(u => (u.window ? { ...u, window: carry(u.window) } : u)),
    assumptionGaps: (picked.assumptionGaps ?? []).filter(g => !heldKeys.has(keyOf(g))) };
}

/**
 * GAIN SINCE INVESTMENT, OVER EVERY INVESTMENT (Stage 10le; the family, 4 Nov
 * 2026: "make coverage 100%"). A purchase record measures what it can; a holding
 * it cannot is measured from its first value on record — the available-history
 * selection's own unit for it, that value treated as money arriving that day —
 * and what neither measures is held at its value: no gain, in the base, and
 * named. The Gain / Loss card and the Returns tab's Since investment read this.
 */
export function sinceInvestmentSelection({ current, accounts, end, base, history }: {
  current: readonly Position[]; accounts: readonly Account[]; end: string;
  /** The purchase-record measure (`selectedSegmentReturns` over the inception selection). */
  base: { units: readonly ReturnUnit[]; missing: readonly ReturnGap[] };
  /** The available-history pool's units. */
  history: readonly ReturnUnit[];
}) {
  const accountOf = new Map(accounts.map(a => [a.accountId, a]));
  const keyOf = (p: Position) => `${p.accountId}|${p.securityKey}`;
  const byCost = new Set(base.units.flatMap(u => u.positions.map(keyOf)));
  const fromFirst = history.filter(u => !u.held && u.positions.length > 0 && u.positions.every(p => !byCost.has(keyOf(p))))
    .map((u): ReturnUnit => ({ ...u, sinceFirst: true }));
  const firstKeys = new Set(fromFirst.flatMap(u => u.positions.map(keyOf)));
  const reasonOf = (p: Position) => base.missing.find(g => g.accountId === p.accountId && (!g.securityKey || g.securityKey === p.securityKey))?.reason
    ?? 'No purchase cost or second value is on record.';
  const heldAtValue = current.filter(p => p.marketValue > 0 && !byCost.has(keyOf(p)) && !firstKeys.has(keyOf(p))).map((p): ReturnUnit => {
    const a = accountOf.get(p.accountId), on = p.navDate ?? a?.asOf ?? end;
    const label = `${p.security} · ${a?.owner ?? ''} · ${a?.provider ?? ''} · account ${a?.accountNo ?? ''}`;
    return { key: keyOf(p), accountId: p.accountId, label, positions: [p], gain: 0, invested: p.marketValue, close: p.marketValue,
      from: on, to: on, held: { date: on, reason: reasonOf(p) } };
  });
  const selection: ReturnSelection = { inception: true, type: 'absolute', start: null, end: null, windows: [], inceptionRows: [], excluded: [],
    assumedUnits: [...fromFirst, ...heldAtValue], assumptionGaps: [] };
  const valueOfKeys = (keys: Set<string>) => current.filter(p => p.marketValue > 0 && keys.has(keyOf(p))).reduce((t, p) => t + p.marketValue, 0);
  const coverage = { totalValue: current.filter(p => p.marketValue > 0).reduce((t, p) => t + p.marketValue, 0),
    sinceInvestmentValue: valueOfKeys(byCost), sinceFirstValue: valueOfKeys(firstKeys),
    heldValue: valueOfKeys(new Set(heldAtValue.map(u => u.key))), sinceFirstCount: fromFirst.length, heldCount: heldAtValue.length };
  return { selection, coverage };
}

/** The available subset, plus explicit user-authorised holding assumptions where supplied. */
export function availableCardReturns(statement: Portfolio, display: readonly Position[], inputs: AccountInput[], today: Date, assumptions?: AssumedReturnBook) {
  const current = currentHoldings(display), recorded = dedupedPositions(statement.positions);
  const calculationCurrent = currentHoldings(recorded), exited = exitedRows(recorded);
  const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const isPublic = (p: Position) => p.marketSide !== 'private';
  const accountOf = new Map(statement.accounts.map(a => [a.accountId, a]));
  const make = (selection: ReturnSelection, availableHistory = false) => {
    // A selection that brings its own holding records (YTD's) keeps them.
    if (!selection.inception && assumptions && !selection.assumedUnits) {
      const extra = assumedHoldingReturns(current, statement.accounts, availableHistory ? null : selection.start, end, assumptions);
      selection = { ...selection, assumedUnits: extra.units, assumptionGaps: extra.gaps };
    }
    const result = selectedSegmentReturns(current, exited, statement.accounts, 'category', selection, () => null, calculationCurrent);
    const coveredAccounts = new Set(result.total.units.map(u => u.accountId)).size;
    const totalAccounts = new Set([...result.total.units, ...result.total.missing].map(u => u.accountId)).size;
    // The card's dates are what its records MEASURE: a value held flat sets neither.
    const measuredUnits = result.total.units.filter(u => !u.held);
    const dates = measuredUnits.flatMap(u => u.from ? [u.from] : []).sort();
    const closes = measuredUnits.map(u => u.to).filter(Boolean).sort();
    const included = new Set(result.total.units.map(u => u.accountId));
    const notes = statement.accounts.flatMap(a => {
      const c = statement.accountReturnRecords?.[a.accountId];
      return !selection.inception && included.has(a.accountId) && c?.record && c.gap ? [{ label: `${a.owner} · ${a.provider} · account ${a.accountNo}`,
        reason: `${c.latestValuationDate ?? a.asOf}: ${c.gap}` }] : [];
    });
    // A window opened on a value we rebuilt says so (Stage 10ni).
    for (const u of result.total.units) {
      const o = BOOK_TRADE_OPENINGS[u.accountId], a = statement.accounts.find(x => x.accountId === u.accountId);
      if (!o || !a || !u.window || !o.openings.some(x => x.date === u.window!.openDate)) continue;
      notes.push({ label: `${a.owner} · ${a.provider} · account ${a.accountNo}`, reason: tradeOpeningNote(o, u.window.openDate) });
    }
    // Where each part of the money starts, by the value it closes at. Money
    // first put in during the period (it opens at nil) covers the whole of it;
    // the period is full only where every part does.
    const opens = new Map<string, { close: number; opened: boolean }>();
    for (const u of result.total.units) {
      const opened = !!u.window?.openedInWindow && u.window.openValue === 0, key = opened ? 'opened' : u.from;
      if (!key) continue;
      const s = opens.get(key) ?? { close: 0, opened };
      s.close += u.close; opens.set(key, s);
    }
    const starts = [...opens].map(([key, s]) => ({ date: s.opened ? null : key, close: s.close }))
      .sort((x, y) => (x.date ?? '').localeCompare(y.date ?? ''));
    const fullPeriod = !!selection.start && starts.length > 0 && starts.every(s => s.date == null || s.date <= selection.start!);
    /**
     * COVERAGE BY VALUE, OF THE PUBLIC INVESTMENTS (the family, 4 Nov 2026):
     * a holding count read as broken. What is held at its last value is said
     * apart from what is measured, so the caption never widens the figure it
     * describes. An overdrawn balance is not an investment, so the public
     * total is of holdings with value. Private investments are in the figure
     * since Stage 10nu, held at their latest valuation: counted on their own
     * line (`private*`), so the public split above still reads as before.
     */
    const coveredKeys = new Set(result.total.units.flatMap(u => u.positions.map(p => `${p.accountId}|${p.securityKey}`)));
    const heldKeys = new Set(result.total.units.filter(u => u.held).flatMap(u => u.positions.map(p => `${p.accountId}|${p.securityKey}`)));
    const publicRows = current.filter(p => isPublic(p) && p.marketValue > 0), valueOf = (ps: Position[]) => ps.reduce((t, p) => t + p.marketValue, 0);
    const privateRows = current.filter(p => !isPublic(p) && p.marketValue > 0);
    const rowKey = (p: Position) => `${p.accountId}|${p.securityKey}`;
    const coverage = { publicValue: valueOf(publicRows),
      // The same public holdings by count (the family, 5 Nov 2026: "number of records covered over total records").
      publicHoldings: publicRows.length,
      measuredPublicHoldings: publicRows.filter(p => coveredKeys.has(rowKey(p)) && !heldKeys.has(rowKey(p))).length,
      heldPublicHoldings: publicRows.filter(p => heldKeys.has(rowKey(p))).length,
      measuredValue: valueOf(publicRows.filter(p => coveredKeys.has(`${p.accountId}|${p.securityKey}`) && !heldKeys.has(`${p.accountId}|${p.securityKey}`))),
      heldValue: valueOf(publicRows.filter(p => heldKeys.has(`${p.accountId}|${p.securityKey}`))),
      // What no record covers yet, as a positive amount: an overdrawn balance is not "waiting".
      waitingValue: valueOf(publicRows.filter(p => !coveredKeys.has(`${p.accountId}|${p.securityKey}`))),
      heldUnits: result.total.units.filter(u => u.held),
      // What the figure MEASURES, apart from what it holds flat: holdings and accounts.
      measuredHoldings: new Set(result.total.units.filter(u => !u.held).flatMap(u => u.positions.map(p => `${p.accountId}|${p.securityKey}`))).size,
      measuredAccounts: new Set(result.total.units.filter(u => !u.held).map(u => u.accountId)).size,
      privateValue: valueOf(current.filter(p => !isPublic(p))),
      // Private investments in the figure: held at their latest valuation unless a record measures them.
      privateHoldings: privateRows.length,
      privateCoveredHoldings: privateRows.filter(p => coveredKeys.has(rowKey(p))).length,
      privateTotalValue: valueOf(privateRows),
      privateCoveredValue: valueOf(privateRows.filter(p => coveredKeys.has(rowKey(p)))),
      privateHeldValue: valueOf(privateRows.filter(p => heldKeys.has(rowKey(p)))) };
    return { ...result, selection, coveredAccounts, totalAccounts, totalHoldings: current.length,
      from: dates[0] ?? null, to: closes.at(-1) ?? null, notes, starts, fullPeriod, coverage };
  };
  const sinceInvestment = make({ inception: true, type: 'absolute', start: null, end: null, windows: [], inceptionRows: [], excluded: [] });
  // The three return cards: financial year, calendar year, available history (`periodSelection`).
  const period = (open: string | null | undefined) =>
    make(periodSelection({ inputs, current, accounts: statement.accounts, end, assumptions: assumptions ?? null, open }));
  const fytd = period(periodStart('fytd', end)!);
  const ytd = period(undefined);
  // XIRR from a year; under a year the absolute return, never a rate per year (Stage 10hk).
  const history = period(null);
  const since = sinceInvestmentSelection({ current, accounts: statement.accounts, end,
    base: sinceInvestment.total, history: history.total.units });
  const gain = make(since.selection);
  const gainCoverage = since.coverage;
  return { gain: { ...gain, gainCoverage }, history, fytd, ytd };
}

export type AvailableCardReturn = ReturnType<typeof availableCardReturns>['fytd'];
export type GainCardReturn = ReturnType<typeof availableCardReturns>['gain'];
