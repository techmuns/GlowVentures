// ── A PMS ACCOUNT'S VALUE ON 31 DECEMBER AND 31 MARCH, REBUILT FROM ITS OWN LEDGERS ──
//
// *"why do we need portfolio valuation for separate timelines? can't we
//  calculate it ourselves by finding out the market prices of the all the
//  holdings at that particular time?"* — the family, 12 Nov 2026.
//
// The return cards open the calendar year on 31 December and the financial
// year on 31 March. No statement of these accounts values them on either day,
// so the cards started them on their first later statement. Where the manager's
// own ledgers run from inception — every trade, a bank book with its running
// balance, and the capital register — the value on those days is arithmetic on
// records we hold:
//
//   units of each share on the day   — every trade from inception, carried
//                                      through the splits and bonuses in the
//                                      saved NSE capture and the cited demergers
//                                      (`shared/demergers.mjs`), as Stage 10ly's
//                                      `actionReplay` carries them;
//   × that day's exchange close      — `scripts/ingest/reference/opening-closes.json`,
//                                      the close as traded that day (not split-adjusted);
//   + the bank book's balance        — the last row settled by the day, plus the
//                                      rows dated by it that settle after it.
//
// A buyback or rights issue moves no units the trades do not print (a tender is
// a sale, a subscription a purchase), so it passes; the statements below catch
// any it did move.
//
// IT MUST REPRODUCE THE MANAGER'S OWN VALUES. The same rebuild is struck on
// every later holdings statement whose every unit it reproduces and every share
// it can price; at least two must exist and each must tie to the statement's
// printed total within `TIE_PCT`. An account that does not is left as it was.
//
// A DEMERGED SHARE NOT YET LISTED on the day has no exchange price: it joins on
// its first close as a value arriving that day — the cards' listing-day rule
// (docs/RETURN-COVERAGE-REVIEW.md rule 4). Any other share without a price
// refuses the opening.
//
// Nothing here enters a holding, a value or a total. The return cards read it,
// named, to open these accounts on the period's first day.
import { actionReplay } from "./holdingTrades.mjs";
import { DEMERGERS } from "../../shared/demergers.mjs";

export const TIE_PCT = 0.5;
/**
 * A statement that prints a company under its earlier name, keyed to the name
 * the trades print it under. Each is the same NSE listing: Cosmo Films renamed
 * itself Cosmo First (symbol COSMOFIRST); HEG renamed itself HEG Advanced
 * Materials (symbol HEGAM, which `src/data/nseSymbols.json` gives both keys).
 */
export const RENAMED = Object.freeze({ "cosmo-films": "cosmo-first", "heg": "heg-advanced-materials" });
const traded = (k) => RENAMED[k] ?? k;
const EPS = 1e-6;
const HOLDINGS = new Set(["holdings", "appraisal", "investor-report"]);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const usable = (d) => d && !d.excludedFromBook && d.status === "ok";
const latest = (docs, type) => docs.filter((d) => usable(d) && d.reportType === type).sort((x, y) => x.asOf.localeCompare(y.asOf) || x.docKey.localeCompare(y.docKey)).at(-1) ?? null;
const r2 = (n) => Math.round(n * 100) / 100;
const isCash = (h) => /^cash\b|cash rec/i.test(h.security ?? "") || h.securityKey === "cash";

/** The opening days the cards need: 31 December and 31 March before `asOf`. */
export function openingDays(asOf) {
  const y = Number(asOf.slice(0, 4)), m = Number(asOf.slice(5, 7));
  const fy = m >= 4 ? `${y}-03-31` : `${y - 1}-03-31`;
  return [...new Set([`${y - 1}-12-31`, fy])].sort();
}

/**
 * The account's from-inception ledgers, or why it has none: a transaction
 * statement, a bank book and a capital register that each start where its
 * money started.
 */
export function inceptionLedgers(docs) {
  const tx = latest(docs, "transaction-statement"), bank = latest(docs, "bank-book"), cap = latest(docs, "capital-register");
  if (!tx || !bank || !cap) return { reason: "no transaction statement, bank book and capital register together" };
  const deposits = (cap.cashFlows ?? []).filter((c) => isNum(c.amount) && c.amount > 0).map((c) => c.date).sort();
  const inception = deposits[0];
  if (!inception) return { reason: "its capital register prints no deposit" };
  for (const [what, d] of [["transaction statement", tx], ["bank book", bank], ["capital register", cap]]) {
    if (!d.periodFrom || d.periodFrom > inception) return { reason: `its ${what} starts ${d.periodFrom ?? "on no printed date"}, after the first deposit on ${inception}` };
  }
  const rows = bank.cashFlows ?? [];
  if (!rows.length || !rows.every((r) => isNum(r.balance))) return { reason: "its bank book prints no running balance" };
  // From nil: no carried-in opening balance, and the bank book's first row is
  // the first deposit itself.
  if ([...(cap.cashFlows ?? []), ...rows].some((r) => /opening balance/i.test(r.description ?? ""))) return { reason: "its ledgers open on a carried-in balance, not from nil" };
  if (Math.abs(rows[0].balance - (rows[0].depositWithdrawal ?? NaN)) > 0.005) return { reason: "its bank book's first row is not its first deposit" };
  if (!rows.every((r, i) => i === 0 || (rows[i - 1].settlementDate ?? rows[i - 1].date) <= (r.settlementDate ?? r.date))) {
    return { reason: "its bank book is not printed in settlement order" };
  }
  return { tx, bank, cap, inception };
}

/**
 * Units of every security the account traded, held at the close of `day`.
 * `symbolOf(key)` names the NSE symbol the saved capture is keyed by.
 */
function unitsOn({ trades, keys, from, day, saved, symbolOf }) {
  const units = new Map();
  for (const k of keys) {
    // A demerged share the account also traded is replayed with its entitlement below.
    if (DEMERGERS.some((d) => d.childKey === k && keys.includes(d.parentKey) && d.recordDate <= day)) continue;
    const actions = splitsAndBonuses(saved, symbolOf(k), from, day);
    if (actions.reason) return { reason: `${k}: ${actions.reason}` };
    const r = actionReplay({ rows: trades.filter((t) => t.securityKey === k), from, to: day, actions: actions.list });
    if (r.reason) return { reason: `${k}: ${r.reason}` };
    if (r.units > EPS) units.set(k, r.units);
  }
  for (const d of DEMERGERS) {
    if (d.recordDate > day || !keys.includes(d.parentKey)) continue;
    const actions = splitsAndBonuses(saved, d.parentSymbol, from, day);
    if (actions.reason) return { reason: `${d.parentKey}: ${actions.reason}` };
    const p = actionReplay({ rows: trades.filter((t) => t.securityKey === d.parentKey), from, to: day, actions: actions.list, at: d.recordDate });
    if (p.reason) return { reason: `${d.parentKey}: ${p.reason}` };
    const child = (p.at ?? []).reduce((n, l) => n + l.qty, 0) * d.ratio;
    if (!(child > EPS)) continue;
    const own = splitsAndBonuses(saved, d.childSymbol, d.recordDate, day);
    if (own.reason) return { reason: `${d.childKey}: ${own.reason}` };
    const sold = actionReplay({ rows: trades.filter((t) => t.securityKey === d.childKey), from, to: day, actions: own.list,
      inherited: { date: d.recordDate, lots: [{ date: d.recordDate, qty: child }] } });
    if (sold.reason) return { reason: `${d.childKey}: ${sold.reason}` };
    if (sold.units > EPS) units.set(d.childKey, sold.units); else units.delete(d.childKey);
  }
  return { units };
}

/** The split and bonus factors the saved capture prints for `symbol` in the span; a buyback or rights issue passes (see the head note). */
function splitsAndBonuses(saved, symbol, from, to) {
  if (!symbol) return { list: [] };
  if (from < saved.from || to > saved.through) return { reason: `the saved corporate actions cover ${saved.from} to ${saved.through}, not ${from} to ${to}` };
  const list = [];
  for (const r of saved.bySymbol.get(symbol) ?? []) {
    if (r.type === "dividend" || !r.exDate || r.exDate < from || r.exDate > to) continue;
    if ((r.type === "split" || r.type === "bonus") && !r.issue && isNum(r.factor) && r.factor > 1) { list.push({ kind: r.type, date: r.exDate, factor: r.factor }); continue; }
    // A buyback or rights issue moves units only through a sale or purchase the
    // trades print; a demerger leaves the parent's count alone (a child share the
    // account still holds without a cited entitlement fails the statement check).
    if (r.type === "buyback" || r.type === "rights" || r.type === "demerger") continue;
    return { reason: `${symbol}'s ${r.type} of ${r.exDate} (${r.purpose}) is not one this rebuild can carry units through` };
  }
  return { list };
}

/** Cash on `day`: the last row settled by it, plus the rows dated by it that settle after it. */
function cashOn(rows, day) {
  let balance = 0;
  for (const r of rows) if ((r.settlementDate ?? r.date) <= day) balance = r.balance;
  const pending = rows.filter((r) => r.date <= day && (r.settlementDate ?? r.date) > day)
    .reduce((s, r) => s + (r.buySellAmount ?? 0) + (r.income ?? 0) + (r.expenses ?? 0) + (r.depositWithdrawal ?? 0), 0);
  return balance + pending;
}

/**
 * `closes[key]` = { symbol, firstClose: { date, close }, closes: { [day]: { on, close } } }:
 * the close as traded on `on`, the last session on or before `day`.
 */
function valueOn({ units, day, closes }) {
  let equity = 0;
  const unpriced = [];
  for (const [k, q] of units) {
    const c = closes[k]?.closes?.[day];
    if (!c || !isNum(c.close)) { unpriced.push(k); continue; }
    equity += q * c.close;
  }
  return { equity, unpriced };
}

/**
 * Every account whose ledgers rebuild its opening values and reproduce the
 * manager's own: `{ [accountId]: TradeOpening }`, plus `refused` reasons.
 */
export function tradeOpenings({ byAccount, accounts, saved, closes, asOf, days = openingDays(asOf) }) {
  const out = {}, refused = [];
  if (!saved || !closes) return { openings: out, refused };
  const accountOf = new Map(accounts.map((a) => [`${a.provider}::${a.accountNo}`, a]));
  for (const [key, docs] of [...byAccount].sort(([x], [y]) => x.localeCompare(y))) {
    const a = accountOf.get(key);
    if (!a || a.engagement !== "PMS") continue;
    const L = inceptionLedgers(docs);
    if (L.reason) continue;
    const no = (reason) => refused.push(`${a.accountId}: ${reason}`);
    const trades = (L.tx.transactions ?? []).filter((t) => (t.side === "buy" || t.side === "sell") && t.securityKey && !/liquid|fund/i.test(t.assetClass ?? ""));
    const funds = (L.tx.transactions ?? []).filter((t) => /fund/i.test(`${t.assetClass ?? ""} ${t.security ?? ""}`));
    const keys = [...new Set(trades.map((t) => t.securityKey))].sort();
    const symbolOf = (k) => closes[k]?.symbol ?? null;
    const from = L.inception;

    // The rebuild on every later holdings statement it can strike in full.
    const checks = [];
    for (const d of docs.filter((d) => usable(d) && HOLDINGS.has(d.reportType) && Array.isArray(d.holdings) && isNum(d.totals?.totalMarketValue)
      && d.asOf > days[0] && d.asOf <= L.tx.periodTo).sort((x, y) => x.asOf.localeCompare(y.asOf) || x.docKey.localeCompare(y.docKey))) {
      if (funds.some((t) => t.date <= d.asOf) && d.holdings.some((h) => /fund/i.test(h.security ?? "") && h.quantity > 0)) continue;
      const u = unitsOn({ trades, keys, from, day: d.asOf, saved, symbolOf });
      if (u.reason) continue;
      const held = d.holdings.filter((h) => !isCash(h) && isNum(h.quantity) && h.quantity > 0);
      const same = held.length === u.units.size && held.every((h) => Math.abs((u.units.get(traded(h.securityKey)) ?? 0) - h.quantity) <= EPS);
      if (!same) continue;
      const v = valueOn({ units: u.units, day: d.asOf, closes });
      if (v.unpriced.length) continue;
      const rebuilt = v.equity + cashOn(L.bank.cashFlows, d.asOf), printed = d.totals.totalMarketValue;
      checks.push({ date: d.asOf, docKey: d.docKey, rebuilt: r2(rebuilt), printed: r2(printed), diffPct: Math.round((rebuilt / printed - 1) * 1e4) / 100 });
    }
    if (checks.length < 2) { no(`only ${checks.length} later holdings statement(s) it reproduces in full, two are needed`); continue; }
    const off = checks.filter((c) => Math.abs(c.diffPct) > TIE_PCT);
    if (off.length) { no(`the rebuild misses the manager's value by ${off.map((c) => `${c.diffPct}% on ${c.date}`).join(", ")}`); continue; }

    const openings = [];
    for (const day of days) {
      if (day <= from) continue;
      const u = unitsOn({ trades, keys, from, day, saved, symbolOf });
      if (u.reason) { no(`${day}: ${u.reason}`); continue; }
      const v = valueOn({ units: u.units, day, closes });
      // A demerged share not listed by the day joins on its first close.
      const entries = [];
      let refuse = null;
      for (const k of v.unpriced) {
        const dm = DEMERGERS.find((d) => d.childKey === k);
        const first = closes[k]?.firstClose;
        if (!dm || !first || !(first.date > day)) { refuse = `${k} has no exchange close on ${day}`; break; }
        const at = unitsOn({ trades, keys, from, day: first.date, saved, symbolOf });
        const q = at.units?.get(k);
        if (!q) { refuse = `${k}: its units on its first close (${first.date}) are not known`; break; }
        entries.push({ date: first.date, securityKey: k, units: q, close: first.close, value: r2(q * first.close) });
      }
      if (refuse) { no(`${day}: ${refuse}`); continue; }
      const cash = cashOn(L.bank.cashFlows, day);
      openings.push({ date: day, value: r2(v.equity + cash), equity: r2(v.equity), cash: r2(cash), names: u.units.size - v.unpriced.length, entries });
    }
    if (!openings.length) continue;
    // The money in and out after the first opening, investor's view: into the
    // account negative. A listing-day entry is money arriving on its day.
    const first = openings[0].date;
    const flows = [
      ...(L.cap.cashFlows ?? []).filter((c) => isNum(c.amount) && c.amount !== 0 && c.date > first)
        .map((c) => ({ date: c.date, amount: -c.amount, description: c.description ?? "Capital register" })),
      ...openings[0].entries.map((e) => ({ date: e.date, amount: -e.value, description: `${e.securityKey}: first exchange close after its demerger, joins at ${e.close}` })),
    ].sort((x, y) => x.date.localeCompare(y.date) || x.description.localeCompare(y.description));
    out[a.accountId] = { openings, flows, capitalTo: L.cap.periodTo, checks,
      sources: [L.tx.docKey, L.bank.docKey, L.cap.docKey] };
  }
  return { openings: out, refused };
}
