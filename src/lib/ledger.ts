// The dated record, read from the audit archive that this pipeline actually
// writes (`public/audit/*`, served at `/audit/*` in dev, preview and production).
// On the hosted site every `/audit/*` request is gated by the edge password check
// in `functions/_middleware.js`, so a fetch only succeeds once the user is signed in.
//
// WHAT THIS FILE USED TO READ, AND WHY IT READ NOTHING. Every loader here fetched
// `audit/current/holdings.json` — one wide workbook sheet with "Pur Date / Sale
// Date / Realised Book" columns, the shape of a book assembled from a
// spreadsheet. This book is assembled from PDF statements, and the extractor
// writes one folder PER DOCUMENT keyed by `docKey`, with the normalised facts in
// `document.json`. That path has never existed here, so every loader returned
// null on every load — and the pages built on them told the reader their SESSION
// had expired and to sign in again. Nothing was wrong with the session; the
// fetch was aimed at another book's archive layout. A false diagnosis is worse
// than a blank panel, because the reader acts on it.
//
// So the loaders below read the manifest and the per-document facts. What the
// archive cannot support is returned as null and named at the call site, rather
// than approximated:
//
//   • A per-security XIRR would need every lot from first purchase. The
//     transaction statements cover the CURRENT PERIOD only — running XIRR over a
//     partial history returns a real-looking rate for a window that isn't the
//     holding period. The money-weighted returns this book does support are
//     per-ACCOUNT, over external capital movements, and live on /performance.
//
//   • Realised gain is only where a manager issued a capital gain statement.
//     Two of the five accounts have none, so their sells carry no realised
//     figure — absent, not zero.
import { displaySecurity } from "./format";

const BASE = import.meta.env.BASE_URL;

// ─────────────────────────────────────────────────────────────────────────────
// The archive: manifest + one normalised document per statement.
// ─────────────────────────────────────────────────────────────────────────────

export type ManifestEntry = {
  docKey: string; provider: string; accountNo: string;
  owner: string | null; ownerId: string | null;
  asOf: string; reportType: string; sourcePath: string;
  pages: number; sections: string[]; status: string;
};

type ArchiveTxn = {
  date: string | null; settlementDate: string | null; side: "buy" | "sell" | string;
  security: string; securityKey: string; exchange: string | null;
  quantity: number | null; unitPrice: number | null;
  gross: number | null; charges: number | null; net: number | null;
};
type ArchiveLot = {
  security: string; securityKey: string;
  saleDate: string | null; purchaseDate: string | null;
  quantity: number | null; saleRate: number | null; saleAmount: number | null;
  purchaseRate: number | null; purchaseAmount: number | null;
  daysHeld: number | null; shortTerm: number | null; longTerm: number | null;
};
type ArchiveIncome = {
  security: string; securityKey: string; kind: string;
  exDate: string | null; receivedDate: string | null;
  quantity: number | null; ratePerUnit: number | null;
  receivable: number | null; received: number | null; tds: number | null;
  netAmount: number | null; entitlement: string | null;
};
type ArchiveHolding = {
  security: string; securityKey: string; assetClass: string;
  quantity: number | null; costBasis: number | null; marketValue: number | null;
};
type ArchiveDoc = ManifestEntry & {
  periodFrom: string | null; periodTo: string | null;
  transactions?: ArchiveTxn[]; capitalGains?: ArchiveLot[];
  income?: ArchiveIncome[]; holdings?: ArchiveHolding[];
};

/** Which report type is authoritative for which fact — the app-side mirror of
 *  `scripts/ingest/precedence.mjs`. Reading every document that mentions a trade
 *  would count the same trade several times over. */
const AUTHORITATIVE = {
  transactions: "transaction-statement",
  capitalGains: "capital-gain",
  cashIncome: "dividend-statement",
  nonCashIncome: "corporate-benefits",
  holdings: "appraisal",
} as const;

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}audit/${path}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

// The archive is 51 documents; loading it once per session and sharing the
// promise keeps four pages from re-fetching the same 51 files each.
let archivePromise: Promise<ArchiveDoc[] | null> | null = null;

export function loadArchive(): Promise<ArchiveDoc[] | null> {
  if (!archivePromise) {
    archivePromise = (async () => {
      const manifest = await fetchJson<ManifestEntry[]>("manifest.json");
      if (!manifest || !Array.isArray(manifest) || !manifest.length) return null;
      const docs = await Promise.all(
        manifest.map((e) => fetchJson<ArchiveDoc>(`${e.docKey}/document.json`)),
      );
      const ok = docs.filter((d): d is ArchiveDoc => !!d);
      return ok.length ? ok : null;
    })();
  }
  return archivePromise;
}

const of = (docs: ArchiveDoc[], reportType: string) => docs.filter((d) => d.reportType === reportType);

/** How an account is named on screen: whose money, whose platform, which number. */
const accountLabel = (d: { owner: string | null; provider: string; accountNo: string }) =>
  `${d.owner ?? d.accountNo} · ${d.provider.split(" ")[0]} ${d.accountNo}`;

/** Newest report date across the archive — what "as of" means for a dated view. */
const newestAsOf = (docs: ArchiveDoc[]) =>
  docs.reduce((a, d) => (d.asOf && d.asOf > a ? d.asOf : a), "");

// ─────────────────────────────────────────────────────────────────────────────
// Transactions: every dated buy and sell the transaction statements carry.
// ─────────────────────────────────────────────────────────────────────────────
export type Txn = {
  date: string; security: string; securityKey: string; account: string;
  /** The CANONICAL owner id, for filtering. The account label prints the owner's
   *  name as that statement spelled it, and the same person is printed three
   *  ways across these providers — matching a filter on the label would silently
   *  empty the tape. */
  ownerId: string | null;
  side: "Buy" | "Sell"; qty: number; price: number; amount: number; realized: number | null;
  /** Why `realized` is absent on this row, when it is. */
  realizedNote?: string;
};
export type TxnData = {
  asOf: string; txns: Txn[]; buys: number; sells: number;
  /** The window the statements cover — NOT the holding period. */
  periodFrom: string | null; periodTo: string | null;
  /** Accounts that issued a transaction statement, and how many did not. */
  accounts: string[]; accountsWithout: string[];
};

// THE ISIN USED TO BE GLUED TO THE NAME, AND THE JOIN USED TO BE PATCHED HERE.
//
// Carnelian's capital gain statement prints `CRIZAC LIMITED-INE0S4R01014` in one
// column. That keyed the lot `crizac-limited-ine0s4r01014` while the same
// manager's transaction statement keyed the same company `crizac`, so the two
// never joined and the realised column showed "—" against every Carnelian sell.
// A `joinKey()` here used to unpick the suffix at read time.
//
// The extractor now splits the two apart at the seam (`splitSecurityName` in
// shared/securityKey.mjs), so the archive's own keys join natively — 58 of 77
// lots, the same figure the patch reached — and the ISIN is kept rather than
// discarded. Nothing re-derives a key on this side any more.
//
// If a lot ever stops joining, the fix is in the extractor. Do not reinstate a
// key rewrite here: a presentation layer that repairs identity hides the defect
// from the reconciler, which is the one thing that would have caught it.

/** Realised gain per (account, securityKey, saleDate), from the capital gain
 *  statements. Keyed by ACCOUNT too: the same name sold on the same day in two
 *  accounts is two separate determinations, and pooling them would credit one
 *  account's sell with the other's gain. */
function realisedIndex(docs: ArchiveDoc[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of of(docs, AUTHORITATIVE.capitalGains)) {
    for (const l of d.capitalGains ?? []) {
      if (!l.saleDate) continue;
      const k = `${d.accountNo}|${l.securityKey}@${l.saleDate}`;
      m.set(k, (m.get(k) ?? 0) + (l.shortTerm ?? 0) + (l.longTerm ?? 0));
    }
  }
  return m;
}

export async function loadTransactions(): Promise<TxnData | null> {
  const docs = await loadArchive();
  if (!docs) return null;
  const src = of(docs, AUTHORITATIVE.transactions);
  const realised = realisedIndex(docs);
  const txns: Txn[] = [];
  let periodFrom: string | null = null, periodTo: string | null = null;
  // A DAY'S SALE, NOT A ROW'S.
  //
  // The capital gain statement settles a day's sale of a name against however
  // many purchase lots it consumed, and prints one figure per lot. The
  // transaction statement prints the same sale as one row — or, three times in
  // this drop, as two (Syngene 1 Apr, Glaxosmithkline 11 and 12 Jun). Handing
  // the day's whole realised figure to each row counted Syngene's −₹1.4 Cr
  // twice and made the tape's realised total −₹3.62 Cr against the statements'
  // own −₹1.93 Cr. So each (account, security, date) is attributed ONCE, to the
  // first row of that sale; the rest say where their figure went.
  const claimed = new Set<string>();

  for (const d of src) {
    const account = accountLabel(d);
    if (d.periodFrom && (!periodFrom || d.periodFrom < periodFrom)) periodFrom = d.periodFrom;
    if (d.periodTo && (!periodTo || d.periodTo > periodTo)) periodTo = d.periodTo;
    for (const t of d.transactions ?? []) {
      if (!t.date) continue;
      const side = t.side === "sell" ? "Sell" : "Buy";
      const qty = t.quantity ?? 0;
      const amount = t.net ?? t.gross ?? 0;
      const key = `${d.accountNo}|${t.securityKey}@${t.date}`;
      // A sell's realised gain exists only where that account's manager issued
      // a capital gain statement. Null renders "—", never 0.
      let realized: number | null = null;
      let realizedNote: string | undefined;
      if (side === "Sell") {
        const v = realised.get(key);
        if (v === undefined) {
          realizedNote = "no capital gain lot in the statements matches this sale";
        } else if (claimed.has(key)) {
          realizedNote = "this sale's realised gain is shown on its first row for the day — the capital gain statement settles the day's sale, not each printed row";
        } else {
          claimed.add(key);
          realized = v;
        }
      }
      txns.push({
        date: t.date, security: displaySecurity(t.security), securityKey: t.securityKey,
        account, ownerId: d.ownerId, side, qty,
        price: t.unitPrice ?? (qty > 0 ? amount / qty : 0),
        amount, realized, realizedNote,
      });
    }
  }
  txns.sort((a, b) => b.date.localeCompare(a.date));   // newest first

  const withTxns = new Set(src.map((d) => d.accountNo));
  const allAccounts = new Map<string, string>();
  for (const d of docs) allAccounts.set(d.accountNo, accountLabel(d));
  return {
    asOf: newestAsOf(docs), txns,
    buys: txns.filter((t) => t.side === "Buy").length,
    sells: txns.filter((t) => t.side === "Sell").length,
    periodFrom, periodTo,
    accounts: [...withTxns].map((n) => allAccounts.get(n) ?? n).sort(),
    accountsWithout: [...allAccounts.entries()].filter(([n]) => !withTxns.has(n)).map(([, l]) => l).sort(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Realised gains: the lots the capital gain statements settle, each with its own
// purchase and sale date. This is the ONLY place in the book that carries a lot
// acquisition date, and it carries them for SOLD lots only — which is why the
// hold-to-LTCG planner on /capital-gains has nothing to work with.
// ─────────────────────────────────────────────────────────────────────────────
export type Lot = {
  securityKey: string; security: string; account: string;
  purchaseDate: string | null; saleDate: string | null;
  quantity: number | null; purchaseAmount: number | null; saleAmount: number | null;
  daysHeld: number | null; shortTerm: number | null; longTerm: number | null;
  gain: number; term: "Short" | "Long" | null; source: string;
};
export type LotData = {
  asOf: string; lots: Lot[];
  totalShort: number | null; totalLong: number | null;
  accounts: string[]; accountsWithout: string[];
};

export async function loadRealisedLots(): Promise<LotData | null> {
  const docs = await loadArchive();
  if (!docs) return null;
  const src = of(docs, AUTHORITATIVE.capitalGains);
  const lots: Lot[] = [];
  for (const d of src) {
    const account = accountLabel(d);
    for (const l of d.capitalGains ?? []) {
      const st = l.shortTerm ?? 0, lt = l.longTerm ?? 0;
      lots.push({
        securityKey: l.securityKey, security: displaySecurity(l.security), account,
        purchaseDate: l.purchaseDate, saleDate: l.saleDate, quantity: l.quantity,
        purchaseAmount: l.purchaseAmount, saleAmount: l.saleAmount, daysHeld: l.daysHeld,
        shortTerm: l.shortTerm, longTerm: l.longTerm, gain: st + lt,
        // The MANAGER made this determination on the statement; it is read, not
        // re-derived from daysHeld — the holding-period rule differs by asset.
        term: l.shortTerm !== null && l.shortTerm !== 0 ? "Short"
          : l.longTerm !== null && l.longTerm !== 0 ? "Long" : null,
        source: d.docKey,
      });
    }
  }
  lots.sort((a, b) => (b.saleDate ?? "").localeCompare(a.saleDate ?? ""));

  const withCg = new Set(src.map((d) => d.accountNo));
  const allAccounts = new Map<string, string>();
  for (const d of docs) allAccounts.set(d.accountNo, accountLabel(d));
  const sumShort = lots.filter((l) => l.shortTerm !== null);
  const sumLong = lots.filter((l) => l.longTerm !== null);
  return {
    asOf: newestAsOf(docs), lots,
    totalShort: sumShort.length ? sumShort.reduce((s, l) => s + (l.shortTerm ?? 0), 0) : null,
    totalLong: sumLong.length ? sumLong.reduce((s, l) => s + (l.longTerm ?? 0), 0) : null,
    accounts: [...withCg].map((n) => allAccounts.get(n) ?? n).sort(),
    accountsWithout: [...allAccounts.entries()].filter(([n]) => !withCg.has(n)).map(([, l]) => l).sort(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Income: cash dividends from the dividend statements, non-cash corporate
// actions (bonus, split, rights) from the corporate benefits reports.
//
// SPLIT BY EVENT TYPE, NOT BY PREFERRED DOCUMENT. Preferring the dividend
// statement wholesale silently drops every bonus and split, because that report
// cannot carry them. Where both list the same CASH event, the dividend statement
// wins — matched on (date, security, amount).
// ─────────────────────────────────────────────────────────────────────────────
export type IncomeRow = {
  security: string; securityKey: string; account: string; kind: string;
  date: string | null; quantity: number | null; ratePerUnit: number | null;
  net: number | null; tds: number | null; entitlement: string | null; source: string;
};
export type IncomeData = {
  asOf: string;
  cash: IncomeRow[];        // dividends, with an amount
  corporate: IncomeRow[];   // bonus / split / rights — an entitlement, not cash
  totalCash: number | null; totalTds: number | null;
  accounts: string[]; accountsWithout: string[];
};

const CASH_KIND = /^dividend$/i;

export async function loadIncome(): Promise<IncomeData | null> {
  const docs = await loadArchive();
  if (!docs) return null;
  // Dividend statements first, so a cash event listed on both wins from there.
  const src = [...of(docs, AUTHORITATIVE.cashIncome), ...of(docs, AUTHORITATIVE.nonCashIncome)];
  const cash: IncomeRow[] = [], corporate: IncomeRow[] = [];
  const seen = new Set<string>();

  for (const d of src) {
    const account = accountLabel(d);
    for (const ev of d.income ?? []) {
      const row: IncomeRow = {
        security: displaySecurity(ev.security), securityKey: ev.securityKey, account,
        kind: ev.kind, date: ev.exDate ?? ev.receivedDate, quantity: ev.quantity,
        ratePerUnit: ev.ratePerUnit, net: ev.netAmount, tds: ev.tds,
        entitlement: ev.entitlement, source: d.docKey,
      };
      if (CASH_KIND.test(ev.kind)) {
        const k = `${d.accountNo}|${row.date}|${ev.securityKey}|${ev.netAmount}`;
        if (seen.has(k)) continue;
        seen.add(k);
        cash.push(row);
      } else {
        corporate.push(row);
      }
    }
  }
  cash.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  corporate.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const withIncome = new Set(src.map((d) => d.accountNo));
  const allAccounts = new Map<string, string>();
  for (const d of docs) allAccounts.set(d.accountNo, accountLabel(d));
  const netted = cash.filter((r) => r.net !== null);
  const tdsed = cash.filter((r) => r.tds !== null);
  return {
    asOf: newestAsOf(docs), cash, corporate,
    totalCash: netted.length ? netted.reduce((s, r) => s + (r.net ?? 0), 0) : null,
    totalTds: tdsed.length ? tdsed.reduce((s, r) => s + (r.tds ?? 0), 0) : null,
    accounts: [...withIncome].map((n) => allAccounts.get(n) ?? n).sort(),
    accountsWithout: [...allAccounts.entries()].filter(([n]) => !withIncome.has(n)).map(([, l]) => l).sort(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sales & exits: what was sold over the statements' window, per security.
// `heldQty` comes from the appraisals, so a name sold down to nothing reads as
// exited rather than merely trimmed.
// ─────────────────────────────────────────────────────────────────────────────
export type SaleRow = {
  securityKey: string; security: string;
  soldQty: number; proceeds: number; realized: number | null; heldQty: number; exited: boolean;
};
export type SalesData = {
  asOf: string; rows: SaleRow[];
  totalProceeds: number; totalRealized: number | null; exits: number; trims: number;
  periodFrom: string | null; periodTo: string | null;
  /**
   * ONE CANONICAL FIGURE, ONE CROSS-CHECK, AND THE GAP EXPLAINED TO THE RUPEE.
   *
   * `statementRealized` is the PRIMITIVE — the capital gain statements' own
   * total across every lot they settle. It is canonical and it is what the
   * headline shows.
   *
   * `totalRealized` is a roll-up we DERIVE by attributing each statement lot to
   * the sale that produced it on the transaction tape. It is a cross-check, and
   * it is more negative, which looked alarming until it was traced:
   *
   *   statement (77 lots)  −₹1,93,11,003
   *   attributed (58 lots) −₹2,01,76,689
   *   unattributed (19)          +₹8,65,686
   *
   * The 19 lots the tape never carries are LIQUID MUTUAL FUND redemptions — 18
   * Axis Liquid Fund across the two Green Lantern accounts, 1 DSP — the cash
   * sweep these managers run alongside the equity mandate. The equity
   * transaction statement does not print them. They are net GAINS, so leaving
   * them out of a loss-making total makes the remainder look worse than the
   * book actually did. Nothing is lost or double-counted: the three figures
   * reconcile exactly, which is why all three are carried here.
   */
  statementRealized: number | null; statementLots: number; matchedSales: number;
  /** Lots the tape never carries, and what they sum to. Signed as the statement
   *  reports them — positive means the unattributed set is a net gain. */
  unattributedRealized: number | null; unattributedLots: number;
  /** The securities behind those lots, so the page can name them rather than
   *  describing them in the abstract. */
  unattributedSecurities: string[];
};

export async function loadSales(): Promise<SalesData | null> {
  const docs = await loadArchive();
  if (!docs) return null;
  const held = new Map<string, number>();
  for (const d of of(docs, AUTHORITATIVE.holdings)) {
    for (const h of d.holdings ?? []) held.set(h.securityKey, (held.get(h.securityKey) ?? 0) + (h.quantity ?? 0));
  }
  const realised = realisedIndex(docs);

  const m = new Map<string, SaleRow & { hasRealised: boolean }>();
  let periodFrom: string | null = null, periodTo: string | null = null;
  // Same rule as the tape: one (account, security, date) contributes its
  // realised figure ONCE, however many rows the statement printed it across.
  const claimed = new Set<string>();
  for (const d of of(docs, AUTHORITATIVE.transactions)) {
    if (d.periodFrom && (!periodFrom || d.periodFrom < periodFrom)) periodFrom = d.periodFrom;
    if (d.periodTo && (!periodTo || d.periodTo > periodTo)) periodTo = d.periodTo;
    for (const t of d.transactions ?? []) {
      if (t.side !== "sell" || !t.date) continue;
      let e = m.get(t.securityKey);
      if (!e) {
        e = {
          securityKey: t.securityKey, security: displaySecurity(t.security),
          soldQty: 0, proceeds: 0, realized: null, heldQty: held.get(t.securityKey) ?? 0,
          exited: false, hasRealised: false,
        };
        m.set(t.securityKey, e);
      }
      e.soldQty += t.quantity ?? 0;
      e.proceeds += t.net ?? t.gross ?? 0;
      const key = `${d.accountNo}|${t.securityKey}@${t.date}`;
      if (claimed.has(key)) continue;
      const r = realised.get(key);
      if (r !== undefined) { claimed.add(key); e.realized = (e.realized ?? 0) + r; e.hasRealised = true; }
    }
  }

  const rows = [...m.values()];
  for (const e of rows) e.exited = e.heldQty <= 0;
  rows.sort((a, b) => b.proceeds - a.proceeds);
  const withRealised = rows.filter((e) => e.hasRealised);
  const exits = rows.filter((e) => e.exited).length;
  // Which statement lots the tape never carried, so the gap between the two
  // totals is a named set of securities rather than a residual.
  const unattributed = [];
  for (const d of of(docs, AUTHORITATIVE.capitalGains)) {
    for (const l of d.capitalGains ?? []) {
      if (!l.saleDate) continue;
      if (claimed.has(`${d.accountNo}|${l.securityKey}@${l.saleDate}`)) continue;
      unattributed.push(l);
    }
  }
  const allLots = of(docs, AUTHORITATIVE.capitalGains).flatMap((d) => d.capitalGains ?? []);
  const realisedOf = (ls: typeof allLots) => ls.reduce((s, l) => s + (l.shortTerm ?? 0) + (l.longTerm ?? 0), 0);
  return {
    asOf: newestAsOf(docs),
    rows: rows.map(({ hasRealised: _drop, ...r }) => r),
    totalProceeds: rows.reduce((s, e) => s + e.proceeds, 0),
    // Absent, not zero, when no account in the sale set issued a capital gain
    // statement — the sells happened; what they realised was never reported.
    totalRealized: withRealised.length ? withRealised.reduce((s, e) => s + (e.realized ?? 0), 0) : null,
    exits, trims: rows.length - exits, periodFrom, periodTo,
    statementRealized: allLots.length ? realisedOf(allLots) : null,
    statementLots: allLots.length,
    matchedSales: claimed.size,
    unattributedRealized: unattributed.length ? realisedOf(unattributed) : null,
    unattributedLots: unattributed.length,
    unattributedSecurities: [...new Set(unattributed.map((l) => displaySecurity(l.security)))].sort(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-stock ledger: every dated buy / sell for one security, for Stock Info.
// Matched on securityKey — the archive rows carry a name, not an ISIN.
// ─────────────────────────────────────────────────────────────────────────────
export type StockTxn = { date: string; side: "Buy" | "Sell"; account: string; qty: number; rate: number; amount: number };
export type StockLedger = {
  securityKey: string; name: string; txns: StockTxn[];
  /** Null when no capital gain statement covers this name's sells. */
  realizedProfit: number | null;
  /** The window the transaction statements cover — not the holding period. */
  periodFrom: string | null; periodTo: string | null;
  /** Purchase dates the capital gain statements carry for this name's SOLD lots. */
  lotDates: string[];
};

export async function loadStockLedger(securityKey: string): Promise<StockLedger | null> {
  const docs = await loadArchive();
  if (!docs) return null;
  const txns: StockTxn[] = [];
  let name = securityKey;
  let periodFrom: string | null = null, periodTo: string | null = null;

  for (const d of of(docs, AUTHORITATIVE.transactions)) {
    const account = accountLabel(d);
    for (const t of d.transactions ?? []) {
      if (t.securityKey !== securityKey || !t.date) continue;
      name = displaySecurity(t.security);
      if (d.periodFrom && (!periodFrom || d.periodFrom < periodFrom)) periodFrom = d.periodFrom;
      if (d.periodTo && (!periodTo || d.periodTo > periodTo)) periodTo = d.periodTo;
      const qty = t.quantity ?? 0, amount = t.net ?? t.gross ?? 0;
      txns.push({
        date: t.date, side: t.side === "sell" ? "Sell" : "Buy", account, qty,
        rate: t.unitPrice ?? (qty > 0 ? amount / qty : 0), amount,
      });
    }
  }
  txns.sort((a, b) => b.date.localeCompare(a.date));

  let realized: number | null = null;
  const lotDates: string[] = [];
  for (const d of of(docs, AUTHORITATIVE.capitalGains)) {
    for (const l of d.capitalGains ?? []) {
      if (l.securityKey !== securityKey) continue;
      if (name === securityKey) name = displaySecurity(l.security);
      realized = (realized ?? 0) + (l.shortTerm ?? 0) + (l.longTerm ?? 0);
      if (l.purchaseDate) lotDates.push(l.purchaseDate);
    }
  }
  return { securityKey, name, txns, realizedProfit: realized, periodFrom, periodTo, lotDates: lotDates.sort() };
}
