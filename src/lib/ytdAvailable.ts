/**
 * ── YEAR TO DATE, FROM THE FIRST DATE WE HAVE (Stage 10jg) ─────────────────
 *
 *   *"for YTD atleast for this year lets show from the date we have"* — the
 *   family, 30 Oct 2026.
 *
 * No statement in this book values a holding on 1 January, so a strict YTD
 * stands only on a holding opened during the year (`holdingYtd`). For the rest
 * this is the return from the FIRST dated value this year to the latest one,
 * struck on the records the Returns tab already reads — never a second set:
 *
 *   • a WHOLE ACCOUNT on its verified return record: its opening valuation and
 *     dated money (`statementReturnInputs` → `windowReturns`), Modified Dietz;
 *   • a listed share or growth fund on its dated statement balance, carried
 *     forward at published closes (`assumedHolding`, the family's 22 Oct rule),
 *     and said to be assumed.
 *
 * Not annualised, and the start date rides on the cell ("from 31 Mar") so it
 * never reads as a full year to date. A cost is never an opening value and a
 * live quote never dates one; what neither record covers stays a dash naming why.
 */
import type { Account, Position } from './types';
import { ytdTagDay } from './analytics';
import { OPENING_MARK_TOLERANCE_DAYS, measureWindow, windowReturns, type AccountInput, type AccountWindow } from './periodReturns';
import { assumedHoldingReturns, holdingAssumptionAnchor, holdingAssumptionText, type AssumedReturnBook } from './assumedHoldingReturns';

export type YtdFrom =
  | {
      shown: true; pct: number;
      /** The first day the money is measured from, and the last valuation. */
      from: string; to: string;
      /** True only where the start is 1 January's own opening — a full year to date. */
      fullYear: boolean;
      /** True where a holding's units are carried forward at published prices. */
      assumed: boolean;
      /** The whole accounts whose verified record is pooled here. */
      accounts: string[];
      note: string;
    }
  | { shown: false; reason: string; pending?: boolean };

export type YtdBook = { yearOpen: string; end: string; of: (ps: readonly Position[]) => YtdFrom };

const longDay = (d: string) => `${ytdTagDay(d)} ${d.slice(0, 4)}`;
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
/** How far apart a row's parts may be last valued and still be pooled — `OPENING_MARK_TOLERANCE_DAYS`' week. */
const CLOSE_SPAN_DAYS = OPENING_MARK_TOLERANCE_DAYS;
const sentence = (s: string) => { const t = s.trim(); return t ? `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}` : t; };

type Found = { window: AccountWindow; owner?: string } | { reason: string; pending?: boolean };

export function ytdBook({ inputs, held, accounts, end, assumptions, money }: {
  inputs: readonly AccountInput[];
  /** The current holdings an account's rows are struck over — what makes a row the WHOLE account. */
  held: readonly Position[];
  accounts: readonly Account[];
  end: string;
  assumptions: AssumedReturnBook | null;
  money: (n: number) => string;
}): YtdBook {
  const yearOpen = `${Number(end.slice(0, 4)) - 1}-12-31`;
  const inputOf = new Map(inputs.map((i) => [i.accountId, i]));
  const keysOf = new Map<string, Set<string>>();
  for (const p of held) (keysOf.get(p.accountId) ?? keysOf.set(p.accountId, new Set()).get(p.accountId)!).add(p.securityKey);

  const accountMemo = new Map<string, Found>();
  /** The account's window from its first verified value this year — the Returns tab's own record. */
  const accountWindow = (accountId: string): Found => {
    const hit = accountMemo.get(accountId);
    if (hit) return hit;
    const input = inputOf.get(accountId);
    let found: Found;
    if (!input) found = { reason: 'no verified return record is kept for this account' };
    else if (input.outside) found = { reason: input.outside };
    else {
      const first = [...input.valuations.map((v) => v.date), ...input.flows.filter((f) => f.amount < 0).map((f) => f.date)].sort()[0];
      const start = [input.knownFrom ?? (first ? dayBefore(first) : end), yearOpen].sort().at(-1)!;
      // A window opens on a mark: where the first date fails, the next value
      // this year is the next date we have.
      const tries = [start, ...input.valuations.map((v) => v.date).filter((d) => d > start && d < end).sort()];
      let reason: string | null = null;
      found = { reason: '' };
      for (const s of new Set(tries)) {
        const w = windowReturns([input], s, end);
        if (w.included.length) { found = { window: w.included[0] }; break; }
        if (w.outside.length) { found = { reason: w.outside[0].reason }; break; }
        reason ??= w.excluded[0]?.reason ?? null;
        found = { reason: reason ?? 'no statement values it this year' };
      }
    }
    accountMemo.set(accountId, found);
    return found;
  };

  const holdingMemo = new Map<Position, Found>();
  /** One holding's units carried forward from its dated balance at published closes. */
  const holdingWindow = (p: Position): Found => {
    const hit = holdingMemo.get(p);
    if (hit) return hit;
    let found: Found;
    if (!assumptions) found = { reason: 'published prices are not loaded on this page' };
    else {
      const a = accounts.find((x) => x.accountId === p.accountId);
      const anchor = a ? holdingAssumptionAnchor(p, a, assumptions) : null;
      // A balance dated before the year opens is carried from 1 January itself.
      const start = anchor && anchor.date <= yearOpen ? yearOpen : null;
      const r = assumedHoldingReturns([p], accounts as Account[], start, end, assumptions);
      const u = r.units[0];
      found = u?.window ? { window: u.window, owner: u.assumption?.owner } : { reason: r.gaps[0]?.reason ?? 'no dated balance of this holding is on record', pending: r.pending > 0 };
    }
    holdingMemo.set(p, found);
    return found;
  };

  const rowMemo = new WeakMap<readonly Position[], YtdFrom>();
  const of = (ps: readonly Position[]): YtdFrom => {
    const hit = rowMemo.get(ps);
    if (hit) return hit;
    const windows: AccountWindow[] = [], pooled: string[] = [], owners = new Set<string>();
    let refused: YtdFrom | null = null;
    const byAccount = new Map<string, Position[]>();
    for (const p of ps) (byAccount.get(p.accountId) ?? byAccount.set(p.accountId, []).get(p.accountId)!).push(p);
    for (const [accountId, list] of byAccount) {
      // THE WHOLE ACCOUNT, OR ITS HOLDINGS ONE BY ONE — never both, so no
      // account's money is counted twice.
      const all = keysOf.get(accountId);
      const keys = new Set(list.map((p) => p.securityKey));
      const whole = !!all?.size && [...all].every((k) => keys.has(k));
      const aw = whole ? accountWindow(accountId) : null;
      if (aw && 'window' in aw) { windows.push(aw.window); pooled.push(accountId); continue; }
      for (const p of list) {
        // A line that holds nothing adds nothing to the money measured.
        if (!(p.marketValue > 0) && !((p.quantity ?? 0) > 0)) continue;
        const hw = holdingWindow(p);
        if ('window' in hw) { windows.push(hw.window); if (hw.owner) owners.add(hw.owner); continue; }
        const lead = ps.length > 1 ? `${p.security}: ` : '';
        refused = { shown: false, pending: hw.pending,
          reason: `${lead}${aw && 'reason' in aw && aw.reason ? `${sentence(`the account's own return record cannot start it this year: ${aw.reason}`)} ` : ''}${sentence(hw.reason)}` };
        break;
      }
      if (refused) break;
    }
    /**
     * ONE CLOSING DATE PER ROW. Pooled, a part valued weeks before the rest
     * closes as money taken out, and the row's return is struck on capital
     * that left nothing did: V.E.C's two accounts (+38.2% to 13 Aug, +42.1% to
     * 7 Oct) pooled to +53.1%. So parts valued more than a week apart are not
     * pooled; each line under the row carries its own.
     */
    const closes = [...new Set(windows.map((w) => w.closeDate))].sort();
    let out: YtdFrom;
    if (refused) out = refused;
    else if (!windows.length) out = { shown: false, reason: 'Nothing is held on this row to measure.' };
    else if (closes.length > 1 && Date.parse(closes.at(-1)!) - Date.parse(closes[0]) > CLOSE_SPAN_DAYS * 864e5) {
      out = { shown: false, reason: `Its parts are last valued on different dates (${closes.map(longDay).join(', ')}), so one return across them would count the earlier value as money taken out. Each line under this row carries its own.` };
    }
    else {
      const m = measureWindow(windows, 'absolute', money);
      if (!m.shown || m.pct == null || !m.working) out = { shown: false, reason: sentence(m.reason ?? 'these values do not give a return') };
      else {
        const { from, to } = m.working;
        const fullYear = from <= yearOpen;
        const assumed = owners.size > 0;
        out = { shown: true, pct: m.pct, from, to, fullYear, assumed, accounts: pooled,
          note: `${fullYear ? 'Year to date' : `From ${longDay(from)}, the first date this year with a dated value,`} to ${longDay(to)} — not annualised${fullYear ? '' : ', and not a full year to date: no statement here values it on 1 January'}. ${m.worked ?? ''}`.trim()
            + (assumed ? ` ${holdingAssumptionText([...owners].join(' and '))} Its units are valued at published closing prices from the statement's own date.` : '') };
      }
    }
    rowMemo.set(ps, out);
    return out;
  };
  return { yearOpen, end, of };
}
