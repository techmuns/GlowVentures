// Insights derived from the REAL multi-year transaction ledgers in the Data Audit
// archive (public/audit/*, served at /audit/* in dev, preview and production). On
// the hosted site every /audit/* request is gated by the edge password check in
// functions/_middleware.js, so a fetch only succeeds once the user has signed in.
import { xirr, type DatedFlow } from "./xirr";
import { displaySecurity } from "./format";
import { securityKeyOf } from "./securityKey";
import type { StartupSchedule } from "./bucketXirr";

const BASE = import.meta.env.BASE_URL;
// As-of date of the extracted ledger: the date of the terminal market-value
// inflow when annualising money-weighted returns. Empty until the ingest
// pipeline writes the archive; the loaders below all return null before then,
// and every dependent figure renders "\u2014".
export const LEDGER_AS_OF = "";

type Cell = string | number | null;
type Sheet = { name: string; rows: Cell[][] };

async function fetchSheet(path: string): Promise<Sheet | null> {
  try {
    const r = await fetch(`${BASE}audit/${path}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as Sheet;
  } catch {
    return null;
  }
}

// Map header labels (matched by case-insensitive prefix) to column indices.
function resolveCols(header: Cell[], names: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  header.forEach((h, i) => {
    if (h == null) return;
    const s = String(h).trim().toLowerCase();
    for (const n of names) if (!(n in out) && s.startsWith(n)) out[n] = i;
  });
  return out;
}
const num = (v: Cell): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const isoDate = (v: Cell): string | null => {
  if (typeof v !== "string") return null;
  const s = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const str = (v: Cell): string => (v == null ? "" : String(v).trim());

// ─────────────────────────────────────────────────────────────────────────────
// Annualised returns (money-weighted XIRR) from dated buys / sells + current MV.
// ─────────────────────────────────────────────────────────────────────────────
export type Grouped = {
  key: string; label: string; sub?: string;
  cost: number; currentMV: number; unrealized: number;
  realizedProfit: number; xirrPct: number | null; lots: number; since: string | null;
  // The raw dated buys and sells behind the group. `xirrPct` above closes them
  // against the LEDGER's market value; callers holding a live valuation can
  // re-run the XIRR against today's price instead of the workbook's mark.
  flows: DatedFlow[];
};
export type ReturnsData = {
  asOf: string; entities: Grouped[]; names: Grouped[];
  /**
   * The same flows grouped by the ledger's own account string. Callers map those
   * to a provider or owner through `Portfolio.accounts` — the archive carries no
   * registry of its own, and inferring a manager from the account text is exactly
   * the guess this model removed.
   */
  accounts: Grouped[];
  totalCost: number; totalMV: number; totalUnrealized: number; overallXirrPct: number | null;
};

type Acc = {
  key: string; label: string; sub?: string;
  cost: number; currentMV: number; unrealized: number; realizedProfit: number;
  flows: DatedFlow[]; lots: number; since: string | null;
};

function pctFromFlows(flows: DatedFlow[], termMV: number, asOf: string): number | null {
  if (termMV <= 0) return null;
  const all = [...flows, { date: new Date(asOf), amount: termMV }];
  const r = xirr(all);
  return r == null ? null : r * 100;
}
function minDate(a: string | null, b: string | null): string | null {
  if (!a) return b; if (!b) return a; return a < b ? a : b;
}

export async function loadReturns(): Promise<ReturnsData | null> {
  const sheet = await fetchSheet("current/holdings.json");
  if (!sheet || sheet.rows.length < 3) return null;
  const header = sheet.rows[1] ?? [];
  const c = resolveCols(header, [
    "particulars", "account", "pur date", "pur amount", "sale date",
    "sales amount", "cl. stk. amount", "mkt value", "unrealised profit", "realised book",
  ]);
  const col = (r: Cell[], k: string): Cell => (c[k] != null && c[k] < r.length ? r[c[k]] : null);

  const byEntity = new Map<string, Acc>();
  const byName = new Map<string, Acc>();
  const byAccount = new Map<string, Acc>();
  const bump = (m: Map<string, Acc>, key: string, label: string, sub: string | undefined, r: Cell[]) => {
    let a = m.get(key);
    if (!a) { a = { key, label, sub, cost: 0, currentMV: 0, unrealized: 0, realizedProfit: 0, flows: [], lots: 0, since: null }; m.set(key, a); }
    const purAmt = num(col(r, "pur amount")), purDate = isoDate(col(r, "pur date"));
    const saleAmt = num(col(r, "sales amount")), saleDate = isoDate(col(r, "sale date"));
    const heldCost = num(col(r, "cl. stk. amount")) ?? 0;
    const mv = num(col(r, "mkt value")) ?? 0;
    const unreal = num(col(r, "unrealised profit")) ?? 0;
    const realized = num(col(r, "realised book")) ?? 0;
    if (purAmt && purDate) { a.flows.push({ date: new Date(purDate), amount: -purAmt }); a.since = minDate(a.since, purDate); }
    if (saleAmt && saleDate) a.flows.push({ date: new Date(saleDate), amount: saleAmt });
    a.cost += heldCost; a.currentMV += mv; a.unrealized += unreal; a.realizedProfit += realized; a.lots += 1;
  };

  const asOf = LEDGER_AS_OF;
  for (const r of sheet.rows.slice(2)) {
    const account = col(r, "account"), name = col(r, "particulars");
    // Keyed by security NAME, not ISIN: the archive mirrors the statements, and
    // most of them print no ISIN. A row with no name has nothing to group under.
    if (!account || !name) continue;
    const key = securityKeyOf(String(name));
    bump(byEntity, String(account), String(account), undefined, r);
    bump(byName, key, displaySecurity(String(name)), key, r);
    bump(byAccount, String(account), String(account), undefined, r);
  }

  const finish = (m: Map<string, Acc>): Grouped[] =>
    [...m.values()].map((a) => ({
      key: a.key, label: a.label, sub: a.sub, cost: a.cost, currentMV: a.currentMV,
      unrealized: a.unrealized, realizedProfit: a.realizedProfit, lots: a.lots, since: a.since,
      xirrPct: pctFromFlows(a.flows, a.currentMV, asOf), flows: a.flows,
    })).sort((x, y) => y.currentMV - x.currentMV);

  const entities = finish(byEntity);
  const names = finish(byName).filter((n) => n.currentMV > 0);
  const accounts = finish(byAccount);
  const totalCost = entities.reduce((s, e) => s + e.cost, 0);
  const totalMV = entities.reduce((s, e) => s + e.currentMV, 0);
  const totalUnrealized = entities.reduce((s, e) => s + e.unrealized, 0);
  const allFlows = [...byEntity.values()].flatMap((a) => a.flows);
  return { asOf, entities, names, accounts, totalCost, totalMV, totalUnrealized, overallXirrPct: pctFromFlows(allFlows, totalMV, asOf) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup cash-flow schedule: the dated cheques behind the startup book.
//
// The baked-in model carries one investment date and a total cost per company,
// but the private workbook dates each follow-on round too ("Follow On Round
// Month" + "Follow-on Participation", three rounds wide). Reading those turns the
// startup XIRR from a two-point estimate into a real multi-flow one.
// ─────────────────────────────────────────────────────────────────────────────

// Round months are usually ISO, but a few are typed as "Dec'23". Both are dates;
// only one of them parses on its own.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function looseDate(v: Cell): string | null {
  const iso = isoDate(v);
  if (iso) return iso;
  if (typeof v !== "string") return null;
  const m = v.trim().toLowerCase().match(/^([a-z]{3})[a-z]*[’'`\s-]*(\d{2}|\d{4})$/);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1]);
  if (mi < 0) return null;
  const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return `${y}-${String(mi + 1).padStart(2, "0")}-01`;
}

export async function loadStartupSchedule(): Promise<StartupSchedule | null> {
  const sheet = await fetchSheet("private/startup.json");
  if (!sheet || sheet.rows.length < 2) return null;
  const header = (sheet.rows[0] ?? []).map((h) => (h == null ? "" : String(h).trim()));
  const find = (re: RegExp, from = 0) => { for (let i = from; i < header.length; i++) if (re.test(header[i])) return i; return -1; };
  const iDate = find(/^Investment Date/i), iCost = find(/^Investments Cost/i), iTotal = find(/^Total Investment Cost/i);
  if (iDate < 0 || iCost < 0 || iTotal < 0) return null;
  // This sheet states its amounts in crore ("Investments Cost (INR Cr.)") while
  // the model is in rupees throughout. Closing a schedule in crore against a
  // fair value in rupees is a factor of 10^7 and turns a 14% XIRR into 670%, so
  // the unit is read off the header rather than assumed.
  const SCALE = /\bcr\b|crore/i.test(header[iCost]) ? 1e7 : 1;
  // Each follow-on round is a "month" column followed by its participation column.
  const rounds: [number, number][] = [];
  for (let i = 0; i < header.length; i++) {
    if (!/^Follow On Round Month/i.test(header[i])) continue;
    const amt = find(/^Follow-on Participation/i, i);
    if (amt > i) rounds.push([i, amt]);
  }

  const outflows: DatedFlow[] = [];
  let companies = 0, followOns = 0, undatedCapital = 0;
  for (const r of sheet.rows.slice(1)) {
    const first = isoDate(r[iDate]);
    const statedRaw = num(r[iTotal]);
    if (!first || !(statedRaw && statedRaw > 0)) continue;
    const stated = statedRaw * SCALE;
    const cheques: DatedFlow[] = [];
    const initial = num(r[iCost]);
    if (initial && initial > 0) cheques.push({ date: new Date(first), amount: -initial * SCALE });
    for (const [dCol, aCol] of rounds) {
      const d = looseDate(r[dCol]), a = num(r[aCol]);
      if (d && a && a > 0) { cheques.push({ date: new Date(d), amount: -a * SCALE }); followOns++; }
    }
    const scheduled = cheques.reduce((s, f) => s - f.amount, 0);
    const EPS = 0.01 * SCALE;  // ₹1 lakh — rounding in the sheet, not a real gap
    companies++;
    if (scheduled > stated + EPS) {
      // The dated rounds add up to more than the workbook says was invested (one
      // row lists a round it hasn't funded). The stated total is authoritative,
      // so that row falls back to a single dated cheque rather than inventing
      // capital the book doesn't recognise.
      followOns -= cheques.length - 1;
      outflows.push({ date: new Date(first), amount: -stated });
      continue;
    }
    outflows.push(...cheques);
    // Capital the sheet records but never dates goes in at the first-investment
    // date — the earliest it could have — which lengthens its time invested and
    // so lowers the resulting rate instead of flattering it.
    const residual = stated - scheduled;
    if (residual > EPS) { outflows.push({ date: new Date(first), amount: -residual }); undatedCapital += residual; }
  }
  return outflows.length ? { outflows, companies, followOns, undatedCapital } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation: internal realised book profit vs Moneycontrol, per security.
// ─────────────────────────────────────────────────────────────────────────────
export type ReconRow = { security: string; internal: number; moneycontrol: number; diff: number };
export type ReconData = { fy: string; rows: ReconRow[]; matched: number; mismatched: number; totalInternal: number; totalMC: number };

export async function loadReconciliation(): Promise<ReconData | null> {
  const sheet = await fetchSheet("recon/internal-vs-external.json");
  if (!sheet) return null;
  const hi = sheet.rows.findIndex((r) => r.some((cl) => String(cl).trim().toLowerCase() === "row labels"));
  if (hi < 0) return null;
  const rows: ReconRow[] = [];
  for (const r of sheet.rows.slice(hi + 1)) {
    const security = r[0] == null ? "" : String(r[0]).trim();
    if (!security || /grand total|^total$/i.test(security)) continue;
    const internal = num(r[1]) ?? 0;
    const moneycontrol = num(r[2]) ?? 0;
    const diff = moneycontrol - internal; // matches the sheet's "Difference" column
    rows.push({ security: displaySecurity(security), internal, moneycontrol, diff });
  }
  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const TOL = 1; // ₹1 tolerance
  const mismatched = rows.filter((r) => Math.abs(r.diff) > TOL).length;
  return {
    fy: "FY 2023-24", rows, matched: rows.length - mismatched, mismatched,
    totalInternal: rows.reduce((s, r) => s + r.internal, 0),
    totalMC: rows.reduce((s, r) => s + r.moneycontrol, 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-stock ledger: every dated buy / sell for one security, for the Stock Info
// page. Matched on securityKey — the archive rows carry a name, not an ISIN.
// ─────────────────────────────────────────────────────────────────────────────
export type StockTxn = { date: string; side: "Buy" | "Sell"; account: string; qty: number; rate: number; amount: number };
export type StockLedger = { securityKey: string; name: string; txns: StockTxn[]; realizedProfit: number };

export async function loadStockLedger(securityKey: string): Promise<StockLedger | null> {
  const sheet = await fetchSheet("current/holdings.json");
  if (!sheet || sheet.rows.length < 3) return null;
  const header = sheet.rows[1] ?? [];
  const c = resolveCols(header, [
    "particulars", "account", "pur date", "pur qty", "pur rate", "pur amount",
    "sale date", "sale qty", "sale rate", "sales amount", "realised book",
  ]);
  const col = (r: Cell[], k: string): Cell => (c[k] != null && c[k] < r.length ? r[c[k]] : null);
  const txns: StockTxn[] = [];
  let realizedProfit = 0;
  let name = securityKey;
  for (const r of sheet.rows.slice(2)) {
    const nm = col(r, "particulars");
    if (!nm || securityKeyOf(String(nm)) !== securityKey) continue;
    name = displaySecurity(String(nm));
    const account = str(col(r, "account"));
    const purDate = isoDate(col(r, "pur date")), purQty = num(col(r, "pur qty"));
    const saleDate = isoDate(col(r, "sale date")), saleQty = num(col(r, "sale qty"));
    realizedProfit += num(col(r, "realised book")) ?? 0;
    if (purDate && purQty) txns.push({ date: purDate, side: "Buy", account, qty: purQty, rate: num(col(r, "pur rate")) ?? 0, amount: num(col(r, "pur amount")) ?? 0 });
    if (saleDate && saleQty) txns.push({ date: saleDate, side: "Sell", account, qty: saleQty, rate: num(col(r, "sale rate")) ?? 0, amount: num(col(r, "sales amount")) ?? 0 });
  }
  txns.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { securityKey, name, txns, realizedProfit };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dividends: what the source records (per-share / date), by security. The source
// tracking is sparse, so we surface it honestly rather than inventing totals.
// ─────────────────────────────────────────────────────────────────────────────
export type DivRow = { security: string; date: string | null; perShare: number | null };
export type DivData = { fy: string; tracked: number; withValues: number; rows: DivRow[] };

export async function loadDividends(): Promise<DivData | null> {
  const sheet = await fetchSheet("current/dividends.json");
  if (!sheet) return null;
  const hi = sheet.rows.findIndex((r) => String(r[0]).trim().toLowerCase() === "particulars");
  const start = hi < 0 ? 0 : hi + 1;
  const rows: DivRow[] = [];
  for (const r of sheet.rows.slice(start)) {
    const security = r[0] == null ? "" : String(r[0]).trim();
    if (!security) continue;
    rows.push({ security: displaySecurity(security), date: isoDate(r[1]), perShare: num(r[2]) });
  }
  return { fy: "FY 2023-24", tracked: rows.length, withValues: rows.filter((r) => r.perShare != null).length, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sales & exits: what was SOLD to arrive at today's net holdings. Aggregates the
// dated sell rows per security (proceeds, shares sold, realized profit) and flags
// whether the name is fully exited (nothing held) or just trimmed. The current
// positions shown across the dashboard are already net of all this.
// ─────────────────────────────────────────────────────────────────────────────
export type SaleRow = {
  securityKey: string; security: string;
  soldQty: number; proceeds: number; realized: number; heldMV: number; exited: boolean;
};
export type SalesData = {
  asOf: string; rows: SaleRow[];
  totalProceeds: number; totalRealized: number; exits: number; trims: number;
};

export async function loadSales(): Promise<SalesData | null> {
  const sheet = await fetchSheet("current/holdings.json");
  if (!sheet || sheet.rows.length < 3) return null;
  const header = sheet.rows[1] ?? [];
  const c = resolveCols(header, ["particulars", "sale qty", "sales amount", "realised book", "mkt value"]);
  const col = (r: Cell[], k: string): Cell => (c[k] != null && c[k] < r.length ? r[c[k]] : null);

  const m = new Map<string, SaleRow>();
  for (const r of sheet.rows.slice(2)) {
    const name = str(col(r, "particulars"));
    if (!name) continue;
    const key = securityKeyOf(name);
    let e = m.get(key);
    if (!e) { e = { securityKey: key, security: displaySecurity(name), soldQty: 0, proceeds: 0, realized: 0, heldMV: 0, exited: false }; m.set(key, e); }
    e.proceeds += num(col(r, "sales amount")) ?? 0;
    e.soldQty += num(col(r, "sale qty")) ?? 0;
    e.realized += num(col(r, "realised book")) ?? 0;
    e.heldMV += num(col(r, "mkt value")) ?? 0;
  }

  const rows = [...m.values()].filter((e) => e.proceeds > 0 || e.soldQty > 0);
  for (const e of rows) e.exited = e.heldMV < 1; // essentially nothing left held
  rows.sort((a, b) => b.proceeds - a.proceeds);
  const exits = rows.filter((e) => e.exited).length;
  return {
    asOf: LEDGER_AS_OF, rows,
    totalProceeds: rows.reduce((s, e) => s + e.proceeds, 0),
    totalRealized: rows.reduce((s, e) => s + e.realized, 0),
    exits, trims: rows.length - exits,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trade statistics: win rate, profit factor & average gain/loss across every
// closed lot in the ledger. Each ledger row is a purchase lot; a row that carries
// a sale is a realised trade, and its "realised book" is the profit on that exit.
// We aggregate over those exits for the Return & Drawdown page's trade panel.
// ─────────────────────────────────────────────────────────────────────────────
export type TradeStats = {
  sold: number; wins: number; losses: number; flat: number; winRatePct: number;
  grossProfit: number; grossLoss: number; profitFactor: number | null;
  avgGain: number; avgLoss: number;
};

export async function loadTradeStats(): Promise<TradeStats | null> {
  const sheet = await fetchSheet("current/holdings.json");
  if (!sheet || sheet.rows.length < 3) return null;
  const header = sheet.rows[1] ?? [];
  const c = resolveCols(header, ["particulars", "sale date", "sale qty", "realised book"]);
  const col = (r: Cell[], k: string): Cell => (c[k] != null && c[k] < r.length ? r[c[k]] : null);

  let sold = 0, wins = 0, losses = 0, flat = 0, grossProfit = 0, grossLoss = 0;
  for (const r of sheet.rows.slice(2)) {
    if (!col(r, "particulars")) continue;
    const saleDate = isoDate(col(r, "sale date")), saleQty = num(col(r, "sale qty"));
    if (!(saleDate && saleQty)) continue; // count only realised exits
    const realized = num(col(r, "realised book")) ?? 0;
    sold += 1;
    if (realized > 0) { wins += 1; grossProfit += realized; }
    else if (realized < 0) { losses += 1; grossLoss += -realized; }
    else flat += 1;
  }
  return {
    sold, wins, losses, flat,
    winRatePct: sold > 0 ? (wins / sold) * 100 : 0,
    grossProfit, grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgGain: wins > 0 ? grossProfit / wins : 0,
    avgLoss: losses > 0 ? grossLoss / losses : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactions: the full dated buy/sell history. Each ledger row is a purchase
// lot (bought once, optionally sold as a whole lot later), so we emit one BUY per
// row and one SELL for rows that carry a sale — a flat, newest-first transaction
// tape behind the Portfolio Monitor's Transactions view.
// ─────────────────────────────────────────────────────────────────────────────
export type Txn = {
  date: string; security: string; securityKey: string; account: string;
  side: "Buy" | "Sell"; qty: number; price: number; amount: number; realized: number | null;
};
export type TxnData = { asOf: string; txns: Txn[]; buys: number; sells: number };

export async function loadTransactions(): Promise<TxnData | null> {
  const sheet = await fetchSheet("current/holdings.json");
  if (!sheet || sheet.rows.length < 3) return null;
  const header = sheet.rows[1] ?? [];
  const c = resolveCols(header, [
    "particulars", "account",
    "pur date", "pur qty", "pur rate", "pur amount",
    "sale date", "sale qty", "sale rate", "sales amount", "realised book",
  ]);
  const col = (r: Cell[], k: string): Cell => (c[k] != null && c[k] < r.length ? r[c[k]] : null);
  const rate = (amt: number, qty: number, given: number | null) => (given && given > 0 ? given : qty > 0 ? amt / qty : 0);

  const txns: Txn[] = [];
  for (const r of sheet.rows.slice(2)) {
    const raw = str(col(r, "particulars"));
    if (!raw) continue;
    const security = displaySecurity(raw);
    const account = str(col(r, "account"));
    const base = { security, securityKey: securityKeyOf(raw), account };

    const purDate = isoDate(col(r, "pur date"));
    if (purDate) {
      const qty = num(col(r, "pur qty")) ?? 0, amount = num(col(r, "pur amount")) ?? 0;
      txns.push({ ...base, date: purDate, side: "Buy", qty, amount, price: rate(amount, qty, num(col(r, "pur rate"))), realized: null });
    }
    const saleDate = isoDate(col(r, "sale date"));
    if (saleDate) {
      const qty = num(col(r, "sale qty")) ?? 0, amount = num(col(r, "sales amount")) ?? 0;
      txns.push({ ...base, date: saleDate, side: "Sell", qty, amount, price: rate(amount, qty, num(col(r, "sale rate"))), realized: num(col(r, "realised book")) ?? 0 });
    }
  }
  txns.sort((a, b) => b.date.localeCompare(a.date)); // newest first
  return { asOf: LEDGER_AS_OF, txns, buys: txns.filter((t) => t.side === "Buy").length, sells: txns.filter((t) => t.side === "Sell").length };
}
