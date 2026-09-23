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
import { securityLabel } from "./securityLabel";

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
  assetClass: string | null;
  quantity: number | null; unitPrice: number | null;
  gross: number | null; charges: number | null; net: number | null;
  /** The statement's OWN settlement figure. See `settledAmount`. */
  printed?: { settlementAmount?: number | null } | null;
};

/**
 * WHAT THIS TRADE SETTLED AT — the statement's own figure first.
 *
 * `net` is DERIVED: `unitPrice x quantity + brokerageRate x quantity ± STT`. The
 * formula is right and the parse is right, but on the SEBI PMS investor report
 * the inputs are PRINTED ROUNDED — price and brokerage rate to two decimals —
 * and the manager settled at full precision. So the reconstruction lands near
 * the printed settlement rather than on it.
 *
 * Measured across all 409 trades in this drop: 249 agree exactly, 112 within a
 * rupee, and 48 do not — every one of them on Green Lantern's or SVAN's investor
 * report, worst case ₹32.98 on 7,778 units of Vedanta Iron and Steel where the
 * rate prints as `0.04`. Every delta sits INSIDE the printing precision of its
 * own inputs (±0.005 x quantity on each of price and rate), which is what says
 * the extractor is sound and the rounding is the limit.
 *
 * None of that helps a reader holding the PDF. The statement says ₹1,63,526.54
 * and the tape said ₹1,63,493.56. The settlement amount is a PRINTED PRIMITIVE
 * in its own right, so it is what the tape shows; the derivation stays as the
 * cross-check it was built to be, and section (a3) of the reconciliation keeps
 * comparing them. Derive what the statement does not print — not what it does.
 */
/**
 * WHAT THE TRADE SETTLED FOR — and `null` where the statement says nothing.
 *
 * This used to end `?? 0`, and a zero here is not a measurement: a row whose
 * statement prints no settlement, no net and no gross reported the SAME figure
 * as a trade that genuinely settled for nothing. The tape got away with it by
 * testing `t.amount ? … : <AbsentCell>` at the point of render — which is the
 * absent-vs-zero rule being enforced by a falsy check in the presentation layer
 * rather than by the model. The moment those amounts are SUMMED, as the
 * rollup does, a `?? 0` blends an unreported trade into a total as if it had
 * cost nothing.
 */
const settledAmount = (t: ArchiveTxn): number | null =>
  t.printed?.settlementAmount ?? t.net ?? t.gross ?? null;
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

/**
 * Which report types are authoritative for which fact — the app-side mirror of
 * `scripts/ingest/precedence.mjs`. Reading every document that mentions a trade
 * would count the same trade several times over.
 *
 * EACH FACT NOW NAMES SEVERAL REPORT TYPES, and it has to. These were single
 * strings written when every account in the book was a PMS mandate on one
 * reporting system, and the moment other issuers got readers the ledger went
 * blind to them: `holdings: "appraisal"` sees the four PMS managers and misses
 * 360 ONE's client report (`holdings`), the SEBI investor report Green Lantern
 * and SVAN issue (`investor-report`), the AIF account statements (`unknown`) and
 * the broker's depository statement. Rs 207 Cr of AIF and every SVAN trade were
 * absent from Ledger Insights while the pages around them counted all of it.
 *
 * Order is precedence: the first type present for an account wins, so a manager
 * publishing both a dedicated transaction statement and an investor report is
 * read from the finer-grained one and never from both.
 */
const AUTHORITATIVE = {
  transactions: ["transaction-statement", "investor-report"],
  capitalGains: ["capital-gain"],
  cashIncome: ["dividend-statement"],
  nonCashIncome: ["corporate-benefits", "statement-of-earnings"],
  // A holdings statement, by whatever name its issuer gives it. `unknown` is
  // last and is real: the AIF account statements carry no report title this
  // pipeline recognises, and they are still where those units are valued.
  holdings: ["appraisal", "investor-report", "holdings", "unknown"],
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

/**
 * Documents authoritative for one fact, PER ACCOUNT.
 *
 * `types` is in precedence order. For each account the FIRST type present wins,
 * so an account that publishes both a transaction statement and an investor
 * report is read from one of them — not both, which would double every trade the
 * two have in common.
 */
function of(docs: ArchiveDoc[], types: readonly string[]): ArchiveDoc[] {
  const byAccount = new Map<string, ArchiveDoc[]>();
  for (const d of docs) {
    const k = `${d.provider}\u0000${d.accountNo ?? ""}`;
    byAccount.set(k, [...(byAccount.get(k) ?? []), d]);
  }
  const out: ArchiveDoc[] = [];
  for (const group of byAccount.values()) {
    const winner = types.find((t) => group.some((d) => d.reportType === t));
    if (winner) out.push(...group.filter((d) => d.reportType === winner));
  }
  return out;
}

/**
 * A SNAPSHOT SUPERSEDES; A DATED ROW DOES NOT — and this file honoured neither
 * half. `of()` returns EVERY issue of the winning report type, which is right for
 * a trade and wrong for a holding, and nothing downstream deduped the rows.
 *
 * Use `newestOf` for a fact that RESTATES (holdings, quantities, market value)
 * and `datedRows` for one that ACCUMULATES (trades, lots, income). `scripts/
 * build-book.mjs` has made this distinction since the first drop that needed it;
 * the runtime ledger had not, so the two disagreed about the same archive.
 *
 * Per account, the newest issue of the winning type. Both 360 ONE CRNs publish
 * their client report for May AND June, and `loadSales` summed the two into its
 * held-quantity index: ₹1.46 Cr of AIF units counted as ₹2.90 Cr, and every one
 * of SVAN's 45 securities counted at twice its quantity. Avalon Technologies is
 * on SVAN's May holdings and gone from June — a genuine EXIT, reported as still
 * held because May's quantity was still being added in.
 */
function newestOf(docs: ArchiveDoc[], types: readonly string[]): ArchiveDoc[] {
  const out: ArchiveDoc[] = [];
  for (const group of byAccount(of(docs, types)).values()) {
    const newest = group.reduce((a, d) => (d.asOf > a.asOf ? d : a), group[0]);
    out.push(...group.filter((d) => d.asOf === newest.asOf));
  }
  return out;
}

function byAccount(docs: ArchiveDoc[]): Map<string, ArchiveDoc[]> {
  const m = new Map<string, ArchiveDoc[]>();
  for (const d of docs) {
    const k = `${d.provider} ${d.accountNo ?? ""}`;
    m.set(k, [...(m.get(k) ?? []), d]);
  }
  return m;
}

/**
 * Every dated row of one kind, across every issue an account published, each
 * counted ONCE — the read-side mirror of `datedRowsAcross` in build-book.
 *
 * Green Lantern 510861 issues a capital gain statement to 25 June (28 lots) and
 * another to 30 June (31 lots), and the first is a strict SUBSET of the second.
 * Reading both put 118 lots and −₹43,69,132.88 on the Capital Gains page against
 * the book's own 90 lots and −₹41,29,763.63, and split the term wrongly by
 * ₹4.44 L short and ₹6.84 L long. The independent figure that says the 28 rows
 * should not be there twice is the wider statement's own printed total,
 * −₹49,893.94 for that account, which the deduped set reproduces exactly.
 *
 * A REPEAT WITHIN ONE DOCUMENT IS DATA; A REPEAT ACROSS TWO IS A DUPLICATE. Green
 * Lantern's transaction statement prints the same Anup Engineering buy twice
 * consecutively because it happened twice, so each row carries its ORDINAL among
 * identical rows on its own document. And the ACCOUNT is in the key: the same
 * name bought on the same day in two accounts is two trades, not one.
 */
const ROW_FIELDS = [
  "date", "saleDate", "purchaseDate", "exDate", "receivedDate", "settlementDate",
  "securityKey", "side", "kind", "exchange", "entitlement", "quantity",
  "unitPrice", "ratePerUnit", "gross", "charges", "net", "netAmount",
  "saleRate", "saleAmount", "purchaseRate", "purchaseAmount",
  "daysHeld", "shortTerm", "longTerm", "receivable", "received", "tds",
] as const;

function datedRows<K extends "transactions" | "capitalGains" | "income">(
  docs: ArchiveDoc[], types: readonly string[], kind: K,
): { doc: ArchiveDoc; row: NonNullable<ArchiveDoc[K]>[number] }[] {
  const out: { doc: ArchiveDoc; row: NonNullable<ArchiveDoc[K]>[number] }[] = [];
  for (const group of byAccount(of(docs, types)).values()) {
    const seen = new Set<string>();
    // Newest first, so a row printed on two issues keeps the newest statement's
    // copy and its `source` back-reference.
    for (const doc of [...group].sort((a, b) => b.asOf.localeCompare(a.asOf))) {
      const ordinal = new Map<string, number>();
      for (const row of (doc[kind] ?? []) as NonNullable<ArchiveDoc[K]>) {
        const r = row as unknown as Record<string, unknown>;
        const base = [kind, doc.accountNo, ...ROW_FIELDS.map((f) => String(r[f] ?? ""))].join("");
        const n = (ordinal.get(base) ?? 0) + 1;
        ordinal.set(base, n);
        const k = `${base}#${n}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ doc, row });
      }
    }
  }
  return out;
}

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
  /** The manager's own name for the account, and the number it prints. Carried
   *  so a rollup can join to `BOOK_ACCOUNTS` on two fields the statement itself
   *  states — never by re-deriving an accountId slug from the label, which is
   *  the identity-in-the-presentation-layer trap this file already refuses once
   *  for `securityKey`. */
  provider: string; accountNo: string;
  /** What the STATEMENT called this instrument, where it said. Null is "not
   *  stated" and never a guess — a Direct Equity view narrows on it and must
   *  not silently drop a row whose statement classified nothing. */
  assetClass: string | null;
  side: "Buy" | "Sell"; qty: number; price: number | null; amount: number | null; realized: number | null;
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
  for (const { doc, row: l } of datedRows(docs, AUTHORITATIVE.capitalGains, "capitalGains")) {
    if (!l.saleDate) continue;
    const k = `${doc.accountNo}|${l.securityKey}@${l.saleDate}`;
    m.set(k, (m.get(k) ?? 0) + (l.shortTerm ?? 0) + (l.longTerm ?? 0));
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
    if (d.periodFrom && (!periodFrom || d.periodFrom < periodFrom)) periodFrom = d.periodFrom;
    if (d.periodTo && (!periodTo || d.periodTo > periodTo)) periodTo = d.periodTo;
  }
  for (const { doc: d, row: t } of datedRows(docs, AUTHORITATIVE.transactions, "transactions")) {
    const account = accountLabel(d);
    if (!t.date) continue;
    const side = t.side === "sell" ? "Sell" : "Buy";
    const qty = t.quantity ?? 0;
    const amount = settledAmount(t);
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
      date: t.date, security: securityLabel(t.securityKey, t.security), securityKey: t.securityKey,
      account, provider: d.provider, accountNo: d.accountNo, ownerId: d.ownerId,
      assetClass: t.assetClass ?? null, side, qty,
      // Derived only where both halves exist. `amount` is now null where the
      // statement reported none, and dividing that by a quantity would put a
      // ₹0 unit price on a trade nobody priced.
      price: t.unitPrice ?? (amount != null && qty > 0 ? amount / qty : null),
      amount, realized, realizedNote,
    });
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
  /** Joined from this security's rows elsewhere in the drop; null when no
   *  appraisal or transaction statement carries it. Never inferred from name. */
  assetClass: string | null;
  purchaseDate: string | null; saleDate: string | null;
  quantity: number | null; purchaseAmount: number | null; saleAmount: number | null;
  daysHeld: number | null; shortTerm: number | null; longTerm: number | null;
  gain: number; term: "Short" | "Long" | null; source: string;
};
export type LotData = {
  asOf: string; lots: Lot[];
  totalShort: number | null; totalLong: number | null;
  accounts: string[]; accountsWithout: string[];
  /**
   * The canonical total, split by ASSET CLASS.
   *
   * −₹1.93 Cr is one number covering two unlike things: an equity book that lost
   * −₹2.02 Cr and a liquid-fund cash sweep that made +₹8.66 L. Netted, the sweep
   * flatters the equity result by nearly nine lakh with nothing on screen to say
   * so. The split needs no model change — the class comes from the same
   * securities' rows on the appraisals and transaction statements.
   *
   * The capital gain statement prints no asset class of its own, so the two
   * sweep instruments — which appear on no appraisal and no transaction
   * statement — resolve to `null` and are NAMED rather than guessed at from
   * their titles. "MUTUAL FUND" in a printed name is not a classification any
   * statement made.
   */
  byClass: { assetClass: string | null; lots: number; short: number; long: number; total: number; securities: string[] }[];
};

export async function loadRealisedLots(): Promise<LotData | null> {
  const docs = await loadArchive();
  if (!docs) return null;
  const src = of(docs, AUTHORITATIVE.capitalGains);
  // Asset class per security, from the reports that DO print one. The capital
  // gain statement never does, so the class is joined from the same security's
  // rows on an appraisal or a transaction statement — this drop's own paperwork,
  // the same kind of join the account number and owner already use.
  const classOf = new Map<string, string>();
  for (const d of docs) {
    for (const arr of [d.holdings, d.transactions]) {
      for (const x of arr ?? []) {
        if (x?.securityKey && x.assetClass && !classOf.has(x.securityKey)) classOf.set(x.securityKey, x.assetClass);
      }
    }
  }
  const lots: Lot[] = [];
  for (const { doc: d, row: l } of datedRows(docs, AUTHORITATIVE.capitalGains, "capitalGains")) {
    const account = accountLabel(d);
    const st = l.shortTerm ?? 0, lt = l.longTerm ?? 0;
    lots.push({
      securityKey: l.securityKey, security: securityLabel(l.securityKey, l.security), account,
      assetClass: classOf.get(l.securityKey) ?? null,
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
  lots.sort((a, b) => (b.saleDate ?? "").localeCompare(a.saleDate ?? ""));

  const withCg = new Set(src.map((d) => d.accountNo));
  const allAccounts = new Map<string, string>();
  for (const d of docs) allAccounts.set(d.accountNo, accountLabel(d));
  const sumShort = lots.filter((l) => l.shortTerm !== null);
  const sumLong = lots.filter((l) => l.longTerm !== null);
  const classes = new Map<string | null, { lots: number; short: number; long: number; securities: Set<string> }>();
  for (const l of lots) {
    const e = classes.get(l.assetClass) ?? { lots: 0, short: 0, long: 0, securities: new Set<string>() };
    e.lots++; e.short += l.shortTerm ?? 0; e.long += l.longTerm ?? 0; e.securities.add(l.security);
    classes.set(l.assetClass, e);
  }
  const byClass = [...classes.entries()]
    .map(([assetClass, v]) => ({
      assetClass, lots: v.lots, short: v.short, long: v.long, total: v.short + v.long,
      securities: [...v.securities].sort(),
    }))
    // Classified first, biggest book first; the unclassified remainder last.
    .sort((a, b) => (a.assetClass === null ? 1 : b.assetClass === null ? -1 : b.lots - a.lots));
  return {
    asOf: newestAsOf(docs), lots, byClass,
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

  // Each issuer's own repeated issues are deduped first (`datedRows`), then the
  // cross-REPORT rule below removes a cash event the corporate benefits report
  // reprints from the dividend statement. Two different rules for two different
  // duplications: identical rows on two issues of ONE report are the same event
  // printed twice, while the same event on two DIFFERENT reports is matched on
  // (date, security, amount) because the two layouts carry different columns.
  const events = [
    ...datedRows(docs, AUTHORITATIVE.cashIncome, "income"),
    ...datedRows(docs, AUTHORITATIVE.nonCashIncome, "income"),
  ];
  for (const { doc: d, row: ev } of events) {
    const account = accountLabel(d);
    const row: IncomeRow = {
      security: securityLabel(ev.securityKey, ev.security), securityKey: ev.securityKey, account,
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
  // A HOLDING RESTATES; ONLY THE NEWEST ISSUE COUNTS. Both 360 ONE CRNs and both
  // SVAN accounts publish a May report and a June one, and summing across them
  // counted 89 securities at twice their quantity. Avalon Technologies is on
  // SVAN's May holdings and gone from June — an EXIT, which the doubled index
  // reported as still held and this page therefore counted as a trim.
  const held = new Map<string, number>();
  for (const d of newestOf(docs, AUTHORITATIVE.holdings)) {
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
  }
  for (const { doc: d, row: t } of datedRows(docs, AUTHORITATIVE.transactions, "transactions")) {
    if (t.side !== "sell" || !t.date) continue;
    let e = m.get(t.securityKey);
    if (!e) {
      e = {
        securityKey: t.securityKey, security: securityLabel(t.securityKey, t.security),
        soldQty: 0, proceeds: 0, realized: null, heldQty: held.get(t.securityKey) ?? 0,
        exited: false, hasRealised: false,
      };
      m.set(t.securityKey, e);
    }
    e.soldQty += t.quantity ?? 0;
    e.proceeds += settledAmount(t) ?? 0;
    const key = `${d.accountNo}|${t.securityKey}@${t.date}`;
    if (claimed.has(key)) continue;
    const r = realised.get(key);
    if (r !== undefined) { claimed.add(key); e.realized = (e.realized ?? 0) + r; e.hasRealised = true; }
  }

  const rows = [...m.values()];
  for (const e of rows) e.exited = e.heldQty <= 0;
  rows.sort((a, b) => b.proceeds - a.proceeds);
  const withRealised = rows.filter((e) => e.hasRealised);
  const exits = rows.filter((e) => e.exited).length;
  // Which statement lots the tape never carried, so the gap between the two
  // totals is a named set of securities rather than a residual.
  const unattributed = [];
  const lotRows = datedRows(docs, AUTHORITATIVE.capitalGains, "capitalGains");
  for (const { doc: d, row: l } of lotRows) {
    if (!l.saleDate) continue;
    if (claimed.has(`${d.accountNo}|${l.securityKey}@${l.saleDate}`)) continue;
    unattributed.push(l);
  }
  const allLots = lotRows.map(({ row }) => row);
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
    unattributedSecurities: [...new Set(unattributed.map((l) => securityLabel(l.securityKey, l.security)))].sort(),
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

  for (const { doc: d, row: t } of datedRows(docs, AUTHORITATIVE.transactions, "transactions")) {
    const account = accountLabel(d);
    if (t.securityKey !== securityKey || !t.date) continue;
    name = securityLabel(t.securityKey, t.security);
    if (d.periodFrom && (!periodFrom || d.periodFrom < periodFrom)) periodFrom = d.periodFrom;
    if (d.periodTo && (!periodTo || d.periodTo > periodTo)) periodTo = d.periodTo;
    const qty = t.quantity ?? 0, amount = settledAmount(t) ?? 0;
    txns.push({
      date: t.date, side: t.side === "sell" ? "Sell" : "Buy", account, qty,
      rate: t.unitPrice ?? (qty > 0 ? amount / qty : 0), amount,
    });
  }
  txns.sort((a, b) => b.date.localeCompare(a.date));

  let realized: number | null = null;
  const lotDates: string[] = [];
  for (const { row: l } of datedRows(docs, AUTHORITATIVE.capitalGains, "capitalGains")) {
    if (l.securityKey !== securityKey) continue;
    if (name === securityKey) name = securityLabel(l.securityKey, l.security);
    realized = (realized ?? 0) + (l.shortTerm ?? 0) + (l.longTerm ?? 0);
    if (l.purchaseDate) lotDates.push(l.purchaseDate);
  }
  return { securityKey, name, txns, realizedProfit: realized, periodFrom, periodTo, lotDates: lotDates.sort() };
}
