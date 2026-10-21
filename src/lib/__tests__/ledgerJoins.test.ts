// THE DATED RECORD'S JOINS, ON THE COMMITTED ARCHIVE.  npm run test:family
//
// A-05, A-07 and A-08 in docs/FIGURE-AUDIT.md. The runtime ledger reads
// `public/audit/` in the browser; this suite serves that directory off disk and
// runs the REAL loaders over it, then holds what they return to evidence taken
// by a different path — the book's own capital-gain total (built by
// `build-book`'s `datedRowsAcross`, not by the ledger), the archive's documents
// read directly, and the dated capital record in `glowData.ts`.
//
//   A-05  a fund's own statement printing the family's purchase of its units is
//         the family's CAPITAL, not its manager's dealing;
//   A-08  every capital-gain lot settles the sale it belongs to, even where the
//         two statements spell the security differently;
//   A-07  a date window that cuts an account's record withholds its gain and
//         return rather than striking them over part of it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_CAPITAL_GAINS, BOOK_CAPITAL_MOVES, BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_POSITION_TRANCHES, BOOK_COMMITMENTS, BOOK_CAPITAL_FROM_INCEPTION } from "@/data/glowData";
import { capitalRollup, capitalReturn } from "@/lib/tranches";
import type { Position, CapitalMove } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const rupees = (n: number) => `${n < 0 ? "−" : ""}₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
const paise = (n: number) => Math.round(n * 100);

// ── the archive, served off disk ─────────────────────────────────────────────
const ROOT = path.join(process.env.GLOW_FIXTURES ?? "src/lib/__tests__/fixtures", "../../../..");
const PUB = path.join(ROOT, "public");
(globalThis as { fetch?: unknown }).fetch = async (u: unknown) => {
  const rel = String(u).replace(/^\/+/, "");
  try {
    const t = readFileSync(path.join(PUB, rel), "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(t) };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};
// `import.meta.env` is Vite's, and this runs in node.
(import.meta as { env?: Record<string, string> }).env ??= { BASE_URL: "/" };

const L = await import("./archiveLedger");
const txn = await L.loadTransactions();
const sales = await L.loadSales();
const lotsData = await L.loadRealisedLots();
const docs = await L.loadArchive();
ok("the committed archive loads through the real loaders", !!txn && !!sales && !!lotsData && !!docs);
if (!txn || !sales || !lotsData || !docs) process.exit(1);

// The archive read DIRECTLY — no ledger code — for the independent sides.
type Doc = { docKey: string; accountNo: string; provider: string; reportType: string };
const manifest = JSON.parse(readFileSync(path.join(PUB, "audit/manifest.json"), "utf8")) as Doc[];
const docOf = (k: string) => JSON.parse(readFileSync(path.join(PUB, "audit", k, "document.json"), "utf8"));

console.log("\n── A-08: every lot settles its sale ──");
{
  const book = (BOOK_CAPITAL_GAINS as { realisedST: number | null; realisedLT: number | null; lots: number }[]);
  const bookTotal = book.reduce((t, e) => t + (e.realisedST ?? 0) + (e.realisedLT ?? 0), 0);
  const bookLots = book.reduce((t, e) => t + (e.lots ?? 0), 0);
  const tape = txn.txns.reduce((t, x) => t + (x.realized ?? 0), 0);
  // THE LOTS NO TRADE CAN SETTLE: a lot group whose every lot sold for ₹0 is not
  // a sale — ASK prints the fractions a demerger or a bonus left that way — so
  // there is no row on any tape for it to meet. RE-EXPRESSED off the documents,
  // never through the ledger: per account, a lot repeated across two issues of
  // its statement counted once and a repeat inside one document kept (the rule
  // `datedRowsAcross` applies), then grouped per (security, sale date).
  const lotIds = new Map<string, { n: number; lot: Record<string, any> }>(); // account|identity → max count in one doc
  for (const d of manifest.filter((m) => m.reportType === "capital-gain")) {
    const count = new Map<string, { n: number; lot: Record<string, any> }>();
    for (const l of docOf(d.docKey).capitalGains ?? []) {
      const id = `${d.accountNo}|${JSON.stringify([l.securityKey, l.saleDate, l.purchaseDate, l.quantity, l.saleAmount, l.purchaseAmount, l.shortTerm, l.longTerm])}`;
      const c = count.get(id) ?? { n: 0, lot: l };
      c.n += 1;
      count.set(id, c);
    }
    for (const [id, c] of count) if ((lotIds.get(id)?.n ?? 0) < c.n) lotIds.set(id, c);
  }
  const groupsOff = new Map<string, { lots: Record<string, any>[]; n: number }>();
  for (const [id, { n, lot }] of lotIds) {
    if (!lot.saleDate) continue;
    const gk = `${id.slice(0, id.indexOf("|"))}|${lot.securityKey}@${lot.saleDate}`;
    const g = groupsOff.get(gk) ?? { lots: [], n: 0 };
    g.lots.push(lot); g.n += n;
    groupsOff.set(gk, g);
  }
  const notSales = [...groupsOff].filter(([, g]) => g.lots.every((l) => l.saleAmount === 0));
  const notSaleLots = notSales.reduce((t, [, g]) => t + g.n, 0);
  const notSaleRealised = notSales.reduce((t, [, g]) => t + g.lots.reduce((u, l) => u + (l.shortTerm ?? 0) + (l.longTerm ?? 0), 0), 0);
  ok("the tape's realised and the lots no trade can settle make the capital-gain statements' own total, to the paisa",
    paise(tape + notSaleRealised) === paise(bookTotal),
    `tape ${rupees(tape)} + ${notSaleLots} lot(s) that sold for ₹0 (${rupees(notSaleRealised)}) vs the book's ${rupees(bookTotal)} over ${bookLots} lots`);
  ok("the only lots the ledger leaves unattributed are the ones that sold for ₹0, and the three figures reconcile",
    sales.statementRealized !== null && sales.unattributedLots === notSaleLots
      && paise(sales.unattributedRealized ?? 0) === paise(notSaleRealised)
      && paise((sales.totalRealized ?? NaN) + (sales.unattributedRealized ?? 0)) === paise(sales.statementRealized),
    `${sales.unattributedLots} unattributed (${(sales.unattributedSecurities ?? []).join(", ") || "none"}); `
      + `sales ${rupees(sales.totalRealized ?? NaN)} + ${rupees(sales.unattributedRealized ?? 0)} vs statements ${rupees(sales.statementRealized ?? NaN)}`);
  ok("the realised-lots list sums to the same total",
    paise(lotsData.lots.reduce((t, l) => t + l.gain, 0)) === paise(bookTotal), `${lotsData.lots.length} lots`);

  // LOAD-BEARING: by identity alone, some lots reach no sale — so the amount
  // pass is doing real work on this archive, and a build that dropped it fails
  // the equality above rather than passing it by luck.
  const groups = L.lotGroups(docs);
  const saleKeys = new Set(L.daySales(docs).map((s) => `${s.accountNo}|${s.securityKey}@${s.date}`));
  const byIdentityOnly = [...groups.values()].filter((g) => !saleKeys.has(g.key));
  ok("identity alone leaves lots unsettled (the amount pass is load-bearing)", byIdentityOnly.length > 0,
    `${byIdentityOnly.length} lot groups, ${rupees(byIdentityOnly.reduce((t, g) => t + g.realised, 0))}`);

  const settled = L.settleSales(docs);
  ok("no two days disagree on which sale a lot key belongs to", settled.conflicts.length === 0, JSON.stringify(settled.conflicts));
  // LOAD-BEARING for the third basis in the RUNTIME ledger, not only in the
  // builder: some sale settles only on its consideration less brokerage (a
  // capital gain statement that strikes its sale before STT), or a ledger that
  // dropped that pass would leave those lots unattributed and the reconciliation
  // above would fail — which is the point, so the case must be on this book.
  const byConsideration = [...settled.bySale.values()].filter((v) => v.by === "consideration").length;
  ok("some sales settle only on the consideration less brokerage, in the runtime ledger too", byConsideration > 0,
    `${byConsideration} day-sale(s)`);
  // An alias joins two spellings inside ONE account, and its target is a key
  // that account's own statements print — never a key invented here.
  const printedKeys = new Map<string, Set<string>>();
  for (const d of manifest) {
    const doc = docOf(d.docKey);
    const set = printedKeys.get(d.accountNo) ?? new Set<string>();
    for (const arr of [doc.holdings, doc.transactions]) for (const x of arr ?? []) if (x?.securityKey) set.add(x.securityKey);
    printedKeys.set(d.accountNo, set);
  }
  const bad = [...settled.aliases].filter(([a, to]) => !printedKeys.get(a.slice(0, a.indexOf("|")))?.has(to));
  ok("every alias lands on a key its own account's statements print", bad.length === 0 && settled.aliases.size > 0,
    `${settled.aliases.size} aliases${bad.length ? `; unprinted: ${JSON.stringify(bad)}` : ""}`);

  // DL-1, runtime half: the stock page's realised for Axis Liquid. Summed here
  // off the raw documents — a lot repeated across two issues of one account's
  // statement counted once, a repeat inside one document kept (the rule
  // `datedRowsAcross` applies) — never through the ledger.
  const axisKeys = [...settled.aliases].filter(([, to]) => /axis-liquid/.test(to));
  if (!axisKeys.length) ok("the Axis Liquid alias is on this book", false, "the case this guards has left the archive; re-derive it");
  else {
    const target = axisKeys[0][1];
    const want = new Map<string, number>(); // account|identity → max count in one doc
    const gainOf = new Map<string, number>();
    for (const d of manifest.filter((m) => m.reportType === "capital-gain")) {
      const doc = docOf(d.docKey);
      const count = new Map<string, number>();
      for (const l of doc.capitalGains ?? []) {
        const alias = settled.aliases.get(`${d.accountNo}|${l.securityKey}`) ?? l.securityKey;
        if (alias !== target) continue;
        const id = `${d.accountNo}|${l.securityKey}|${l.saleDate}|${l.purchaseDate}|${l.quantity}|${l.saleAmount}`;
        count.set(id, (count.get(id) ?? 0) + 1);
        gainOf.set(id, (l.shortTerm ?? 0) + (l.longTerm ?? 0));
      }
      for (const [id, n] of count) want.set(id, Math.max(want.get(id) ?? 0, n));
    }
    const expect = [...want].reduce((t, [id, n]) => t + n * (gainOf.get(id) ?? 0), 0);
    const led = await L.loadStockLedger(target);
    ok("the Axis Liquid holding's realised reaches it through the settlement (DL-1)",
      !!led && led.realizedProfit !== null && paise(led.realizedProfit) === paise(expect) && expect > 0,
      `${rupees(led?.realizedProfit ?? 0)} vs ${rupees(expect)} off the documents`);
  }
}

console.log("\n── A-05: a fund's own allotment is capital, not dealing ──");
{
  const accountId = new Map(BOOK_ACCOUNTS.map((a) => [`${a.provider}|${a.accountNo}`, a.accountId]));
  const moves = (BOOK_CAPITAL_MOVES as CapitalMove[]).filter((m) => m.securityKey);
  // The statement's own settlement figure first — the order the ledger reads it in.
  const settledOf = (t: { printed?: { settlementAmount?: number | null } | null; net?: number | null; gross?: number | null }) =>
    t.printed?.settlementAmount ?? t.net ?? t.gross ?? null;
  const expected = new Set<string>();
  for (const d of manifest.filter((m) => m.reportType === "transaction-statement")) {
    const id = accountId.get(`${d.provider}|${d.accountNo}`);
    if (!id) continue;
    for (const t of docOf(d.docKey).transactions ?? []) {
      const a = settledOf(t);
      if (a === null || !t.date) continue;
      const dir = t.side === "sell" ? "out" : "in";
      if (moves.some((m) => m.accountId === id && m.securityKey === t.securityKey && m.date === t.date
        && m.direction === dir && Math.abs((m.invested ?? m.amount ?? NaN) - a) <= 1)) {
        expected.add(`${d.accountNo}|${t.securityKey}@${t.date}`);
      }
    }
  }
  const got = new Set(txn.ownAllotments.map((t) => `${t.accountNo}|${t.securityKey}@${t.date}`));
  ok("the ledger names exactly the rows the capital record already carries", expected.size > 0
    && expected.size === got.size && [...expected].every((k) => got.has(k)),
    `${expected.size} expected (load-bearing: must be > 0), ${got.size} named`);
  const leaked = txn.txns.filter((t) => expected.has(`${t.accountNo}|${t.securityKey}@${t.date}`));
  ok("none of them is counted as the manager's dealing", leaked.length === 0,
    leaked.map((t) => `${t.accountNo} ${t.date} ${t.amount}`).join("; "));
  const own = txn.ownAllotments.reduce((t, x) => t + (x.amount ?? 0), 0);
  const bought = txn.txns.filter((t) => t.side === "Buy").reduce((t, x) => t + (x.amount ?? 0), 0);
  ok("the managers' Bought no longer carries the family's own subscriptions", own > 0,
    `Bought ${rupees(bought)}; the family's own ${rupees(own)} is in the capital record`);
}

console.log("\n── A-07: a window that cuts a record withholds its gain ──");
{
  const moves = BOOK_CAPITAL_MOVES as CapitalMove[];
  const positions = BOOK_POSITIONS as Position[];
  const accounts = BOOK_ACCOUNTS;
  const opts = { commitments: BOOK_COMMITMENTS, fromInception: BOOK_CAPITAL_FROM_INCEPTION };
  const roll = (ms: CapitalMove[], windowed: boolean) =>
    capitalRollup(ms, accounts, positions, BOOK_POSITION_TRANCHES, "all", "recent", { ...opts, windowed });
  const hpr = (g: ReturnType<typeof roll>[number] | undefined) => (g ? capitalReturn(g, "absolute") : null);
  const whole = roll(moves, false);
  const byAcct = new Map<string, CapitalMove[]>();
  for (const m of moves) byAcct.set(m.accountId, [...(byAcct.get(m.accountId) ?? []), m]);
  // THE CASE THE DEFECT BIT, chosen off the book, never typed: an account and a
  // window holding some but not all of its dated movements, where the page —
  // if it forgot to say a window is on — would still print a return, and a
  // different one from the record's (Sanshi 9069671554 once read HPR 194.20%
  // against its record's 33.73%). An account whose record the window cuts
  // below its own inception loses its return either way, so the search skips it.
  let pickId = "", from = "", to = "", n = 0;
  let inView: CapitalMove[] = [];
  search: for (const [id, ms] of [...byAcct].sort((a, b) => b[1].length - a[1].length)) {
    const ds = [...new Set(ms.map((m) => m.date))].sort();
    const full = hpr(whole.find((g) => g.accountId === id));
    if (ds.length < 2 || !full?.shown) continue;
    for (let i = 1; i < ds.length; i++) {
      const view = moves.filter((m) => m.date >= ds[i]);
      const u = hpr(roll(view, false).find((g) => g.accountId === id));
      if (u?.shown && Math.abs(u.pct - full.pct) > 1) {
        pickId = id; from = ds[i]; to = ds[ds.length - 1]; n = ds.length; inView = view; break search;
      }
    }
  }
  if (!pickId) {
    // Main's completeness test (Stage 10cd: the record must reach inception)
    // may refuse every such window on its own; then the flag is belt and
    // braces, and this says so rather than passing over nothing.
    console.log("  NOT CHECKED  no window on this book prints a different return unflagged — completeness alone refuses them");
  } else {
    const w = roll(inView, true).find((g) => g.accountId === pickId);
    const u = hpr(roll(inView, false).find((g) => g.accountId === pickId));
    const full = hpr(whole.find((g) => g.accountId === pickId));
    ok("the whole record prints a return (the case is measurable)", !!full?.shown, `${pickId}: ${n} dated movements`);
    const wr = hpr(w);
    ok("under a window that cuts it, the row is marked windowed and withholds its return, saying why",
      !!w && w.windowed && w.appreciation === null && !!wr && !wr.shown
        && /dates are filtered to part of this account's record/i.test(wr.shown ? "" : wr.reason), `${from} → ${to}`);
    ok("…where, unflagged, the same window would print a different return (load-bearing)",
      !!u?.shown && !!full?.shown && Math.abs(u.pct - full.pct) > 1,
      `${u?.shown ? u.pct.toFixed(2) : "—"}% against the record's ${full?.shown ? full.pct.toFixed(2) : "—"}%`);
  }
  ok("with no window, no row is windowed", whole.every((g) => !g.windowed));
}

console.log("\n── MT-10: a sale borrows the ISIN its own lot prints, and files where the holding does ──");
{
  const { sectionsFor } = await import("@/lib/txnAxis");
  const { groupKeyFor, GROUP_AXES } = await import("@/lib/groupAxis");
  const { accountIndex } = await import("@/lib/accounts");
  const idx = accountIndex(BOOK_ACCOUNTS);
  // RE-EXPRESSED OFF THE DOCUMENTS: every capital-gain lot's (account, key,
  // sale date) and the ISIN it prints — never through the ledger.
  const lotIsin = new Map<string, Set<string>>();
  for (const d of manifest.filter((m) => m.reportType === "capital-gain")) {
    for (const l of docOf(d.docKey).capitalGains ?? []) {
      if (!l.isin || !l.saleDate) continue;
      const k = `${d.accountNo}|${l.securityKey}@${l.saleDate}`;
      (lotIsin.get(k) ?? lotIsin.set(k, new Set()).get(k)!).add(l.isin);
    }
  }
  const lent = txn.txns.filter((t) => t.isinFrom === "lot");
  ok("some sales borrow an ISIN from their own lot (the rule has work to do)", lent.length > 0, `${lent.length} sales`);
  ok("only a SALE borrows one — a buy has no lot to borrow from",
    txn.txns.every((t) => t.isinFrom !== "lot" || t.side === "Sell"));
  ok("every borrowed ISIN is the one its lot prints, for that account, key and date, and the lot prints only one",
    lent.every((t) => { const is = lotIsin.get(`${t.accountNo}|${t.securityKey}@${t.date}`); return !!is && is.size === 1 && is.has(t.isin ?? ""); }));
  // THE CASE ITSELF: a sale whose own key has NO book position and whose
  // borrowed ISIN names exactly one book security, re-found off the book.
  const bookKeys = new Map<string, Set<string>>();
  for (const p of BOOK_POSITIONS) if (p.isin) (bookKeys.get(p.isin) ?? bookKeys.set(p.isin, new Set()).get(p.isin)!).add(p.securityKey);
  const held = new Set(BOOK_POSITIONS.map((p) => p.securityKey));
  const joined = lent.filter((t) => !held.has(t.securityKey) && bookKeys.get(t.isin ?? "")?.size === 1);
  ok("the book carries a sale the ISIN re-files (Liquid BeES on LKP, on this drop)", joined.length > 0,
    joined.map((t) => `${t.security} ${t.date}`).join("; "));
  const sec = sectionsFor(BOOK_ACCOUNTS, BOOK_POSITIONS);
  for (const t of joined) {
    const key = [...bookKeys.get(t.isin!)!][0];
    const acc = BOOK_ACCOUNTS.find((a) => a.provider === t.provider && a.accountNo === t.accountNo);
    const holding = BOOK_POSITIONS.find((p) => p.securityKey === key && p.accountId === acc?.accountId)
      ?? BOOK_POSITIONS.find((p) => p.securityKey === key)!;
    for (const axis of GROUP_AXES) {
      const want = groupKeyFor(axis, idx, { ...holding, accountId: acc?.accountId ?? holding.accountId });
      ok(`${t.security}'s sale files where its holding does — ${axis}`, sec.forTxn(axis, t) === want, `${sec.forTxn(axis, t)} vs ${want}`);
    }
    ok(`…and on the category axis that is Cash, as the Holdings table puts it`, sec.forTxn("category", t) === "Cash", sec.forTxn("category", t));
    ok("…while its own key is untouched", t.securityKey !== key, `${t.securityKey} stays; the book's is ${key}`);
  }
}

console.log("\n── MT-12: a sale with no realised figure says WHY, off the account's own statement ──");
{
  // RE-EXPRESSED: each account's capital-gain window and absence, off the
  // book's own `BOOK_CAPITAL_GAINS`, joined on provider + account number.
  const acctOf = new Map(BOOK_ACCOUNTS.map((a) => [`${a.provider}|${a.accountNo}`, a.accountId]));
  const cgOf = new Map((BOOK_CAPITAL_GAINS as { accountId?: string; absent?: string | null; periodFrom?: string | null; periodTo?: string | null }[])
    .filter((e) => e.accountId).map((e) => [e.accountId!, e]));
  const sells = txn.txns.filter((t) => t.side === "Sell");
  const missing = sells.filter((t) => t.realized == null);
  const expectBasis = (t: typeof sells[number]) => {
    const e = cgOf.get(acctOf.get(`${t.provider}|${t.accountNo}`) ?? "");
    if (e?.absent) return "no-statement";
    if (e && ((e.periodTo && t.date > e.periodTo) || (e.periodFrom && t.date < e.periodFrom))) return "outside-window";
    return null;
  };
  const wrong = missing.filter((t) => {
    const want = expectBasis(t);
    if (t.realizedBasis === "sibling") return false;
    return want ? t.realizedBasis !== want : t.realizedBasis !== "no-lot";
  });
  ok("every unrealised sale's cause is the one its account's statement supports", wrong.length === 0,
    wrong.slice(0, 5).map((t) => `${t.security} ${t.date}: ${t.realizedBasis}`).join("; ") || `${missing.length} sales checked`);
  ok("…and no sale in an account that issues one is told the account issues none",
    missing.every((t) => !/no capital gain statement is issued/.test(t.realizedNote ?? "") || expectBasis(t) === "no-statement"));
  const after = missing.filter((t) => t.realizedBasis === "outside-window");
  ok("the sales after their account's statement window are named as such (LKP's Ather and Pricol, on this drop)",
    after.length > 0 && after.every((t) => /falls (after|before) it/.test(t.realizedNote ?? "")),
    after.map((t) => `${t.security} ${t.date}`).join("; "));
  // A SIBLING IS COVERED: its day's sale carries the figure on exactly one row.
  const day = (t: typeof sells[number]) => `${t.accountNo}|${t.securityKey}@${t.date}`;
  const sib = sells.filter((t) => t.realizedBasis === "sibling");
  ok("every sibling's day-sale carries its figure on exactly one other row", sib.length > 0 && sib.every((t) =>
    sells.filter((x) => day(x) === day(t) && x.realized != null).length === 1), `${sib.length} siblings`);
  const { rollup, rollupTotals } = await import("@/lib/txnRollup");
  const totals = rollupTotals(rollup(txn.txns, BOOK_ACCOUNTS, "auto"));
  const counted = sells.filter((t) => t.realized != null).length + sib.length;
  ok("the coverage count counts a sibling as covered — k of n is the sales whose gain IS in the figure",
    totals.realizedOf === counted && totals.sells === sells.length && counted > sells.filter((t) => t.realized != null).length,
    `${totals.realizedOf}/${totals.sells}`);
}

console.log("\n── DSM-D9: a trade whose statement prints no price and no amount is absent, never ₹0 ──");
{
  // The subject: a security the tape carries on exactly ONE dated row, with a
  // printed price and a settled amount — so stripping those two figures is the
  // only change, and the row cannot vanish into or out of the dedupe. Every copy
  // of the row, on every issue, is stripped alike for the same reason.
  const count = new Map<string, number>();
  for (const t of txn.txns) count.set(t.securityKey, (count.get(t.securityKey) ?? 0) + 1);
  const key = [...count].find(([k, n]) => n === 1
    && txn.txns.some((t) => t.securityKey === k && t.amount != null && t.price != null && t.qty > 0))?.[0];
  if (!key) ok("the tape carries a single priced trade to strip", false, "no subject on this archive; re-derive it");
  else {
    type Row = { securityKey?: string; unitPrice?: number | null; net?: number | null; gross?: number | null;
      printed?: { settlementAmount?: number | null } | null };
    const rows = (docs as unknown as { transactions?: Row[] }[]).flatMap((d) => d.transactions ?? []).filter((r) => r.securityKey === key);
    const saved = rows.map((r) => ({ r, unitPrice: r.unitPrice, net: r.net, gross: r.gross,
      settle: r.printed ? r.printed.settlementAmount : undefined }));
    const before = await L.loadStockLedger(key);
    for (const r of rows) { r.unitPrice = null; r.net = null; r.gross = null; if (r.printed) r.printed.settlementAmount = null; }
    const bare = await L.loadStockLedger(key);
    for (const x of saved) {
      x.r.unitPrice = x.unitPrice; x.r.net = x.net; x.r.gross = x.gross;
      if (x.r.printed) x.r.printed.settlementAmount = x.settle;
    }
    const after = await L.loadStockLedger(key);
    const one = bare?.txns ?? [];
    ok("a trade with no printed price and no settled amount carries NULL for both — never a ₹0 that reads as a trade struck at nothing",
      rows.length > 0 && one.length === 1 && one[0].rate === null && one[0].amount === null && one[0].qty > 0,
      `${key}: ${JSON.stringify(one.map((t) => ({ rate: t.rate, amount: t.amount, qty: t.qty })))}`);
    ok("…and the same row with its figures back carries them again, so the null came from the statement and nothing else",
      !!before && !!after && before.txns.length === 1 && after.txns.length === 1
        && after.txns[0].amount !== null && after.txns[0].amount === before.txns[0].amount
        && after.txns[0].rate !== null && after.txns[0].rate === before.txns[0].rate,
      `${key}: ${before?.txns[0]?.amount} → ${after?.txns[0]?.amount}`);
  }
}

console.log(fails ? `\n${fails} failed` : "\nall ledger-join checks passed");
process.exit(fails ? 1 : 0);
