// One statement-basis projection of the canonical book and reconciled ledger.
// Built with every deployment, never maintained as a second portfolio register.
import template from "../data/consolidatedTemplate.json";
import {
  BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_AS_OF, BOOK_UNVALUED_HOLDINGS,
  BOOK_COMMITMENTS, BOOK_CAPITAL_MOVES, BOOK_POSITION_TRANCHES,
  BOOK_CAPITAL_FROM_INCEPTION, BOOK_REVIEW_FLOWS, BOOK_REVIEW_WRITTEN_OFF,
} from "../data/glowData";
import { dedupedPositions, holdingBucket, bucketLabel, isMandateHeld } from "./analytics";
import { basketKeyOf, familyClassKeyOf, BASKET_ORDER, FAMILY_CLASS_ORDER } from "./familyTaxonomy";
import { ownerDisplayName, ownerById } from "./owners";
import { securityLabel } from "./securityLabel";
import { buildDatedCapital } from "./datedCapital";
import { capitalMovesWithCalls } from "./tranches";
import { deriveTransactions, deriveRealisedLots, deriveIncome, type ArchiveDoc } from "./ledgerModel";
import type { Account, Position } from "./types";

export type ConsolidatedCell = string | number | null;
export type ConsolidatedColumn = { key: string; label: string; format: string; width: number };
export type ConsolidatedLink = { sheet?: string; find?: string; where?: Record<string, string>; row?: number; file?: string };
export type ConsolidatedRow = { values: ConsolidatedCell[]; kind?: "group" | "total"; links?: Record<string, ConsolidatedLink> };
export type ConsolidatedTab = { name: string; note: string; columns: ConsolidatedColumn[]; rows: ConsolidatedRow[] };
export type ConsolidatedBook = { client: string; asOf: string; totalValue: number; documents: number; tabs: ConsolidatedTab[] };
type RecordRow = Record<string, ConsolidatedCell>;
type TaxEvidence = { priceOn31Jan2018?: number | null; effectiveCost?: number | null; effectiveLongTerm?: number | null };
const MONEY = "#,##0.00", PCT = "0.0%";
const col = (key: string, label: string, format = "", width = 20): ConsolidatedColumn => ({ key, label, format, width });
const pct = (key: string, label: string) => col(key, label, PCT);
const money = (key: string, label: string) => col(key, label, MONEY);
const sum = (xs: (number | null | undefined)[]) => {
  const present = xs.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
};
const completeSum = (xs: (number | null | undefined)[]) => xs.length && xs.every(n => typeof n === "number") ? sum(xs) : null;
const ratio = (n: number | null, d: number | null) => n != null && d != null && d > 0 ? n / d : null;
const dates = (xs: (string | null | undefined)[]) => xs.filter((d): d is string => !!d).sort();
const fiscalYear = (date: string | null) => {
  if (!date) return null;
  const y = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 4 ? 1 : 0);
  return `${y}-${String(y + 1).slice(-2)}`;
};
const mask = (v: string) => v.length > 4 ? `XXXX${v.slice(-4)}` : v;
const reviewNote = "Family consolidated review (MOPWM), 30-Jun-2026";
const defaultNote = "Registers use full INR. — means not reported or not supported by the available record. Dates and sources remain attached to each row.";
const tabNames = ["Start Here", "Portfolio Allocation", "Basket Allocation", "Basket Detail", "Investor Summary", "Period Change", "Tax Summary", "Checks", "Holdings", "Tax Lots", "Transactions", "Commitments", "Entities", "Accounts", "Securities", "Lists", "Column Mapping"];

export function buildConsolidatedSheet(docs: ArchiveDoc[], input: { accounts: Account[]; positions: Position[]; asOf: string } = {
  accounts: BOOK_ACCOUNTS, positions: BOOK_POSITIONS, asOf: BOOK_AS_OF,
}): ConsolidatedBook {
  const { accounts, positions, asOf } = input;
  const accountById = new Map(accounts.map(a => [a.accountId, a]));
  const accountBySource = new Map(accounts.map(a => [`${a.provider}|${a.accountNo}`, a]));
  const docById = new Map(docs.map(d => [d.docKey, d]));
  const sourceAccount = (source: string) => {
    const d = docById.get(source);
    return d ? accountBySource.get(`${d.provider}|${d.accountNo}`) : undefined;
  };
  const sourcesFor = (a: Account | undefined) => a ? docs.filter(d => d.provider === a.provider && d.accountNo === a.accountNo) : [];
  const rows = dedupedPositions(positions);
  const totalValue = rows.reduce((s, p) => s + p.marketValue, 0);
  const classify = (p: Pick<Position, "accountId" | "securityKey" | "assetClass"> & Partial<Position>) => {
    const a = accountById.get(p.accountId), mandate = isMandateHeld(a?.engagement);
    return { ac: familyClassKeyOf(p, mandate), cat: bucketLabel(holdingBucket(p, a?.engagement)), basket: basketKeyOf(p, mandate) };
  };
  const basketCodes: Record<string, string> = { "Stable Growth": "SG", "Entrepreneurial Growth": "EG", "Liquidity": "LQ", "Thematic & Tactical": "TT" };
  const txns = deriveTransactions(docs), realised = deriveRealisedLots(docs), income = deriveIncome(docs);
  const dated = buildDatedCapital({ moves: BOOK_CAPITAL_MOVES, commitments: BOOK_COMMITMENTS, accounts, positions,
    tranches: BOOK_POSITION_TRANCHES, fromInception: BOOK_CAPITAL_FROM_INCEPTION, reviewFlows: BOOK_REVIEW_FLOWS });
  const movements = capitalMovesWithCalls(BOOK_CAPITAL_MOVES, BOOK_COMMITMENTS, accounts, BOOK_REVIEW_FLOWS);
  const tabs = new Map<string, ConsolidatedTab>();
  function add(name: string, columns: ConsolidatedColumn[], records: RecordRow[], note = defaultNote, links?: (r: RecordRow) => Record<string, ConsolidatedLink>) {
    const t: ConsolidatedTab = { name, note, columns, rows: records.map(r => ({
      values: columns.map(c => r[c.key] ?? null),
      kind: r._kind === "group" || r._kind === "total" ? r._kind : undefined,
      links: links?.(r),
    })) };
    tabs.set(name, t);
    return t;
  }
  function register(name: keyof typeof template, records: RecordRow[], note?: string, links?: (r: RecordRow) => Record<string, ConsolidatedLink>) {
    return add(name, template[name], records, note, links);
  }
  const entityLinks = (r: RecordRow) => ({ ent: { sheet: "Entities", find: String(r.ent) }, entname: { sheet: "Entities", find: String(r.entname) } });
  const registerLinks = (r: RecordRow): Record<string, ConsolidatedLink> => ({ ...entityLinks(r),
    acct: { sheet: "Accounts", find: String(r.acct) }, sec: { sheet: "Securities", find: String(r.sec) },
    name: { sheet: "Securities", find: String(r.sec) }, fund: { sheet: "Holdings", find: String(r.sec ?? r.acct) },
    src: r._source ? { file: String(r._source) } : { sheet: "Column Mapping" },
    notes: r._source ? { file: String(r._source) } : { sheet: "Column Mapping" },
  });
  const holdings: RecordRow[] = positions.map((p, i) => {
    const a = accountById.get(p.accountId), c = classify(p);
    const tranche = BOOK_POSITION_TRANCHES[`${p.accountId}|${p.securityKey}`];
    const purchaseDates = dates(tranche?.moves.map(m => m.date) ?? []);
    const capital = dated.behind([p], positions);
    const xirr = capital?.dated && capital.days >= 365 && capital.annualPct != null ? capital.annualPct / 100 : null;
    const source = sourcesFor(a).filter(d => d.holdings?.some(h => h.securityKey === p.securityKey && h.marketValue === p.marketValue))
      .sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""))[0];
    const counted = rows.includes(p);
    const check = !counted ? "Duplicate reporting: excluded from consolidated totals" : p.valuedAtCost ? "Held at cost; no measured gain"
      : p.costBasis == null ? "Cost not reported" : "OK";
    const notes = [p.review ? `${reviewNote}; ${p.reviewNote ?? ""}` : source?.docKey ?? `${a?.provider ?? "Unknown account"} · ${a?.accountNo ?? p.accountId}`,
      !purchaseDates.length && !p.heldSince ? "Purchase dates not reported" : "",
      xirr == null ? capital?.dated ? "History under one year: annualised XIRR withheld" : capital?.reason ?? "No complete dated capital record for this holding" : "",
      p.valuedAtCost ? "Value is recorded cost, not a market valuation" : "",
      !counted ? `Also reported under ${p.alsoReportedUnder?.join(", ") ?? p.dedupeGroup}` : ""].filter(Boolean).join("; ");
    return { hid: `H${String(i + 1).padStart(4, "0")}`, acct: p.accountId, sec: p.securityKey, ent: a ? ownerDisplayName(a.ownerId) : null,
      adv: a?.provider ?? null, name: securityLabel(p.securityKey, p.security), ...c, basket: basketCodes[c.basket] ?? c.basket,
      first: p.heldSince ?? purchaseDates[0] ?? null, last: purchaseDates.at(-1) ?? null,
      qty: p.quantity, cost: p.costBasis, avg: p.avgCost, price: p.currentPrice,
      basis: p.valuedAtCost ? "At cost" : p.review ? "Review value" : "Statement value", mvov: null, mv: p.marketValue,
      ugain: p.valuedAtCost ? null : p.unrealizedPnL, absret: p.valuedAtCost ? null : ratio(p.unrealizedPnL, p.costBasis),
      income: p.dividendReceived, rgain: p.realizedPnL ?? null, xirr, bench: null, babs: null, bxirr: null, alpha: null,
      shown: xirr != null ? "XIRR" : p.unrealizedPnL != null && p.costBasis != null && p.costBasis > 0 ? "Absolute" : null,
      alloc: counted ? ratio(p.marketValue, totalValue) : null, prevmv: null, stmt: p.priceAsOf ?? a?.asOf ?? null,
      src: notes, lotqty: tranche?.units ?? null, check, _source: source?.docKey ?? null, _counted: counted ? "Y" : "N" };
  });
  // Keep all reported unvalued units, including quantities that live NAV/quotes
  // can price elsewhere. Audit never substitutes today's price for a statement.
  for (const u of BOOK_UNVALUED_HOLDINGS) {
    if (positions.some(p => p.accountId === u.accountId && p.securityKey === u.securityKey)) continue;
    const a = accountById.get(u.accountId);
    holdings.push({ hid: `U${holdings.length + 1}`, acct: u.accountId, sec: u.securityKey, ent: ownerDisplayName(u.ownerId),
      adv: a?.provider ?? null, name: securityLabel(u.securityKey, u.security), qty: u.quantity, stmt: u.asOf,
      src: u.reason, check: "Quantity only; no usable statement valuation", _counted: "N" });
  }
  for (const w of BOOK_REVIEW_WRITTEN_OFF) holdings.push({ hid: `W${w.reviewRow}`, name: w.security,
    src: `${reviewNote}, Private Investments row ${w.reviewRow}: ${w.remark}`, check: "Written off in review; amounts not reported", _counted: "N" });
  register("Holdings", holdings, `${defaultNote} Every account row is retained. Duplicate reporting and unvalued units are named; only counted, valued rows enter the summaries.`, registerLinks);

  const entities = [...new Set(accounts.map(a => a.ownerId ?? "unattributed"))].map(id => {
    const owner = ownerById(id);
    return { id, name: ownerDisplayName(id), short: ownerDisplayName(id),
      type: owner?.kind ?? null, rel: null, pan: owner?.pans?.[0] ? mask(owner.pans[0]) : null, res: null,
      notes: "Source-verified owner registry; relationship and residency not inferred.", check: id === "unattributed" ? "Owner not resolved" : "OK" };
  });
  register("Entities", entities, defaultNote, r => ({ name: { sheet: "Accounts", find: String(r.id) } }));
  register("Accounts", accounts.map(a => ({ id: a.accountId, ent: a.ownerId ?? "unattributed", entname: ownerDisplayName(a.ownerId),
    type: a.reviewHolder ? "Review holder" : a.engagement, provider: a.custodian ?? a.provider, adv: a.provider, strategy: a.strategy,
    acno: mask(a.accountNo), asof: a.asOf, ccy: "INR", notes: a.noPositionsReason ?? null, check: a.engagement === "unknown" ? "Engagement not stated" : "OK" })),
    defaultNote, r => ({ ...entityLinks(r), id: { sheet: "Holdings", find: String(r.id) }, ent: { sheet: "Entities", find: String(r.ent) } }));
  const allSecurities = new Map<string, { name: string; isin: string | null }>();
  for (const p of positions) allSecurities.set(p.securityKey, { name: p.security, isin: p.isin ?? null });
  for (const u of BOOK_UNVALUED_HOLDINGS) if (!allSecurities.has(u.securityKey)) allSecurities.set(u.securityKey, { name: u.security, isin: u.isin });
  for (const t of [...txns.txns, ...txns.ownAllotments]) if (!allSecurities.has(t.securityKey)) allSecurities.set(t.securityKey, { name: t.security, isin: t.isin });
  for (const l of realised.lots) if (!allSecurities.has(l.securityKey)) allSecurities.set(l.securityKey, { name: l.security, isin: null });
  for (const m of movements) if (m.securityKey && !allSecurities.has(m.securityKey)) allSecurities.set(m.securityKey, { name: m.security ?? m.securityKey, isin: null });
  register("Securities", [...allSecurities].map(([id, s]) => {
    const ps = positions.filter(p => p.securityKey === id), p = ps[0];
    const one = (xs: ConsolidatedCell[]) => xs.length && xs.every(x => x === xs[0]) ? xs[0] : null;
    const cs = ps.map(classify);
    const evidence = docs.flatMap(d => d.capitalGains ?? []).filter(l => l.securityKey === id);
    const fmvs = [...new Set(evidence.map(l => (l as typeof l & TaxEvidence).priceOn31Jan2018).filter((n): n is number => n != null))];
    const isins = [...new Set(evidence.map(l => l.isin).filter((v): v is string => !!v))];
    return { id, name: securityLabel(id, s.name), isin: s.isin ?? (isins.length === 1 ? isins[0] : null), code: p?.symbol ?? null,
      cat: one(cs.map(c => c.cat)), ac: one(cs.map(c => c.ac)), basket: one(cs.map(c => basketCodes[c.basket] ?? c.basket)),
      bov: null, sector: p?.sector ?? null, mcap: null, benov: null, bench: null, listed: p?.symbol ? "Y" : null,
      basis: one(ps.map(p => p.valuedAtCost ? "At cost" : p.review ? "Review value" : "Statement value")),
      price: one(ps.map(p => p.currentPrice)), pdate: one(ps.map(p => p.priceAsOf ?? accountById.get(p.accountId)?.asOf ?? null)),
      gf: fmvs.length === 1 ? fmvs[0] : null, notes: "Account-specific marks and classifications remain on Holdings. FMV is retained only where source lots agree; benchmark returns are not supplied.", check: p ? "OK" : "No valued position" };
  }), defaultNote, r => ({ id: { sheet: "Holdings", find: String(r.id) }, name: { sheet: "Holdings", find: String(r.id) } }));

  const lots: RecordRow[] = realised.lots.map((l, i) => {
    const a = sourceAccount(l.source), c = a && l.assetClass ? classify({ accountId: a.accountId, securityKey: l.securityKey, assetClass: l.assetClass as Position["assetClass"] }) : null;
    const candidates = (docById.get(l.source)?.capitalGains ?? []).filter(r => r.purchaseDate === l.purchaseDate && r.saleDate === l.saleDate
      && r.quantity === l.quantity && r.purchaseAmount === l.purchaseAmount && r.saleAmount === l.saleAmount
      && r.shortTerm === l.shortTerm && r.longTerm === l.longTerm);
    const exact = candidates.filter(r => r.securityKey === l.securityKey);
    const matched = exact.length ? exact : candidates;
    const original = matched.length === 1 ? matched[0] : null;
    const tax = original as (NonNullable<ArchiveDoc["capitalGains"]>[number] & TaxEvidence) | null;
    const taxable = tax?.effectiveLongTerm != null && l.shortTerm != null ? tax.effectiveLongTerm + l.shortTerm : null;
    return { lid: `R${i + 1}`, acct: a?.accountId ?? null, sec: l.securityKey, ent: a ? ownerDisplayName(a.ownerId) : null,
      name: l.security, isin: original?.isin ?? null, cat: c?.cat ?? l.assetClass, pdate: l.purchaseDate, pqty: l.quantity,
      prate: original?.purchaseRate ?? ratio(l.purchaseAmount, l.quantity), pamt: l.purchaseAmount, sdate: l.saleDate, sqty: l.quantity,
      srate: original?.saleRate ?? ratio(l.saleAmount, l.quantity), samt: l.saleAmount, cqty: null, ccost: null,
      rdays: l.daysHeld, rterm: l.term, rbook: l.shortTerm != null || l.longTerm != null ? l.gain : null, fy: fiscalYear(l.saleDate),
      gf: tax?.priceOn31Jan2018 ?? null, rtcost: ratio(tax?.effectiveCost ?? null, l.quantity), rtax: taxable,
      notes: `${l.source}; realised FIFO match. Tax-effective cost and long-term gain are retained only where the statement reports them; closing lots are not implied by a sold lot.`,
      check: a ? "Reported realised lot" : "Account join missing", _source: l.source, _st: l.shortTerm, _lt: l.longTerm,
      _tst: taxable != null ? l.shortTerm : null, _tlt: tax?.effectiveLongTerm ?? null };
  });
  type OpenLot = { securityKey: string; security: string; isin?: string; purchaseDate: string | null; quantity: number | null; unitCost: number | null; totalCost: number | null };
  const latestOpen = new Map<string, ArchiveDoc & { openLots: OpenLot[] }>();
  for (const d of docs as (ArchiveDoc & { openLots?: OpenLot[] })[]) {
    if (!d.openLots?.length) continue;
    const k = `${d.provider}|${d.accountNo}`, old = latestOpen.get(k);
    if (!old || d.asOf > old.asOf) latestOpen.set(k, d as ArchiveDoc & { openLots: OpenLot[] });
  }
  for (const d of latestOpen.values()) for (const l of d.openLots) {
    const a = sourceAccount(d.docKey), p = positions.find(p => p.accountId === a?.accountId && p.securityKey === l.securityKey);
    // The book only licenses current lot measures when its own quantity gate
    // accepted this register. Unmatched historical lots stay visible with no mark.
    const supported = !!p && p.stCostBasis != null && p.ltCostBasis != null;
    const value = supported && l.quantity != null && p.currentPrice != null ? l.quantity * p.currentPrice : null;
    lots.push({ lid: `O${lots.length + 1}`, acct: a?.accountId ?? null, sec: l.securityKey, ent: a ? ownerDisplayName(a.ownerId) : null,
      name: securityLabel(l.securityKey, l.security), isin: l.isin ?? null, cat: p ? classify(p).cat : null,
      pdate: l.purchaseDate, pqty: l.quantity, prate: l.unitCost, pamt: l.totalCost,
      cqty: supported ? l.quantity : null, ccost: supported ? l.totalCost : null, mrate: supported ? p.currentPrice : null,
      mval: value, ubook: value != null && l.totalCost != null ? value - l.totalCost : null,
      notes: `${d.docKey}; open register at ${d.asOf}. ${supported ? "Units reconcile to the holding; tax-adjusted cost not reported." : "Register does not support the current holding's lot breakdown; closing quantities and gains withheld."}`,
      check: supported ? "Quantity reconciles" : "Historical lot; current breakdown unavailable", _source: d.docKey });
  }
  register("Tax Lots", lots, "Reported realised FIFO lots and latest open-lot registers. Source-stated grandfathering FMV, effective cost and taxable long-term gain are retained. Unreported tax fields and long-term dates remain blank; book gains are kept separate.", registerLinks);

  const transactions: RecordRow[] = [];
  const transaction = (r: RecordRow) => transactions.push({ tid: `T${transactions.length + 1}`, ...r });
  for (const t of txns.txns) {
    const a = accountBySource.get(`${t.provider}|${t.accountNo}`), p = positions.find(p => p.accountId === a?.accountId && p.securityKey === t.securityKey);
    const raw = docs.filter(d => d.provider === t.provider && d.accountNo === t.accountNo)
      .sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""))
      .flatMap(d => (d.transactions ?? []).map(row => ({ d, row })))
      .find(({ row }) => row.securityKey === t.securityKey && row.date === t.date && row.quantity === t.qty && row.side === t.side.toLowerCase()
        && (row.printed?.settlementAmount ?? row.net ?? row.gross ?? null) === t.amount);
    transaction({ date: t.date, acct: a?.accountId ?? null, sec: t.securityKey, ent: a ? ownerDisplayName(a.ownerId) : null,
      name: t.security, cat: p ? classify(p).cat : t.assetClass, ac: p ? classify(p).ac : null, type: t.side,
      qty: raw ? raw.row.quantity : t.qty || null, price: t.price, gross: raw?.row.gross ?? null, chg: raw?.row.charges ?? null,
      net: t.amount == null ? null : t.amount * (t.side === "Buy" ? -1 : 1), counts: "Internal trade",
      notes: `${raw?.d.docKey ?? "Canonical trade ledger"}; manager dealing, separate from external family capital. Net is the source settlement amount.`,
      check: a ? "OK" : "Account join missing", _source: raw?.d.docKey ?? null });
  }
  for (const m of movements) {
    const a = accountById.get(m.accountId), p = positions.find(p => p.accountId === m.accountId && p.securityKey === m.securityKey);
    transaction({ date: m.date, acct: m.accountId, sec: m.securityKey, ent: a ? ownerDisplayName(a.ownerId) : null,
      name: m.security ?? a?.strategy ?? a?.provider ?? null, cat: p ? classify(p).cat : a?.engagement ?? null, ac: p ? classify(p).ac : null,
      type: m.label, qty: m.units, gross: m.amount, chg: m.charges ?? null, net: m.amount == null ? null : m.amount * (m.direction === "in" ? -1 : 1),
      counts: m.payoutKind === "income" || m.payoutKind === "equalisation" ? "Income" : m.direction === "in" ? "Investment" : "Divestment",
      notes: m.fromReview ? reviewNote : m.fromCall ? "Reconciled call schedule; this is a call, not proof of payment" : "External capital record",
      check: m.amount == null ? "Amount not reported" : "OK" });
  }
  for (const e of [...income.cash, ...income.corporate]) {
    const a = sourceAccount(e.source), p = positions.find(p => p.accountId === a?.accountId && p.securityKey === e.securityKey);
    transaction({ date: e.date, acct: a?.accountId ?? null, sec: e.securityKey, ent: a ? ownerDisplayName(a.ownerId) : null, name: e.security,
      cat: p ? classify(p).cat : null, ac: p ? classify(p).ac : null, type: e.kind, qty: e.quantity, price: e.ratePerUnit,
      gross: e.net != null && e.tds != null ? e.net + e.tds : null, chg: e.tds, net: e.net, counts: income.cash.includes(e) ? "Income" : "Non-cash",
      notes: `${e.source}; ${e.entitlement ?? ""}`, check: "Reported event", _source: e.source });
  }
  transactions.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  register("Transactions", transactions, "All reconciled manager trades, external capital, review flows and income. Internal trades are not added to external capital. A capital call is not evidence of payment. Date windows differ by source.", registerLinks);
  register("Commitments", BOOK_COMMITMENTS.map((c, i) => {
    const a = accountById.get(c.accountId), ps = rows.filter(p => p.accountId === c.accountId);
    // A review-held value has a different date and basis from a fund statement's
    // commitment. Keep the value, but never combine it into an invented multiple.
    const value = ps.length ? sum(ps.map(p => p.marketValue)) : null;
    const sameBasis = ps.length > 0 && ps.every(p => !p.review && (p.priceAsOf ?? a?.asOf) === c.asOf);
    return { cid: `C${i + 1}`, acct: c.accountId, sec: ps.length === 1 ? ps[0].securityKey : null,
      ent: ownerDisplayName(c.ownerId), fund: c.name, cdate: null, comm: c.committed, called: c.called, paid: c.paid,
      dist: c.distributed, uncalled: c.undrawn, unpaid: c.pending, pct: ratio(c.called, c.committed), value,
      tvpi: sameBasis && value != null && c.distributed != null ? ratio(value + c.distributed, c.paid) : null,
      dpi: ratio(c.distributed, c.paid), ncdate: null, ncamt: null,
      notes: `Commitment statement ${c.asOf ?? "undated"}; ${sameBasis ? "value on the same basis" : "current book value has a different basis or date; TVPI withheld"}. Next call not confirmed.`,
      check: c.arithmeticHolds === false ? "Statement commitment arithmetic differs" : "OK" };
  }), defaultNote, registerLinks);

  const counted = holdings.filter(h => h._counted === "Y");
  const holdingByPosition = new Map(positions.map((p, i) => [p, holdings[i]]));
  const groups: { label: string; ps: Position[]; kind?: "group" | "total"; parent?: Position[] }[] = [];
  for (const ac of [...FAMILY_CLASS_ORDER, ...new Set(rows.map(p => classify(p).ac).filter(ac => !(FAMILY_CLASS_ORDER as readonly string[]).includes(ac)))]) {
    const ps = rows.filter(p => classify(p).ac === ac);
    if (!ps.length) continue;
    groups.push({ label: ac, ps, kind: "group" });
    for (const cat of [...new Set(ps.map(p => classify(p).cat))].sort()) groups.push({ label: cat, ps: ps.filter(p => classify(p).cat === cat), parent: ps });
  }
  groups.push({ label: "Total", ps: rows, kind: "total" });
  function figures(ps: Position[]) {
    const hs = ps.map(p => holdingByPosition.get(p)!);
    const cost = sum(ps.map(p => p.costBasis)), value = completeSum(ps.map(p => p.marketValue));
    const costed = ps.filter(p => !p.valuedAtCost && p.costBasis != null && p.unrealizedPnL != null);
    const unrealised = sum(costed.map(p => p.unrealizedPnL));
    const irrRows = hs.filter(h => h.xirr != null && typeof h.mv === "number");
    const covered = sum(irrRows.map(h => h.mv as number));
    const xirr = covered != null && covered > 0 ? irrRows.reduce((s, h) => s + (h.mv as number) * (h.xirr as number), 0) / covered : null;
    const ds = dates(hs.flatMap(h => [h.first as string | null, h.last as string | null]));
    const realisedGain = completeSum(ps.map(p => p.realizedPnL));
    return { range: ds.length ? `${ds[0]} – ${ds.at(-1)}` : null, cost, value, unrealised,
      fullGain: realisedGain != null && unrealised != null && costed.length === ps.length ? realisedGain + unrealised : null,
      absolute: ratio(unrealised, sum(costed.map(p => p.costBasis))), income: sum(ps.map(p => p.dividendReceived)),
      xirr, coverage: ratio(covered, value) };
  }
  const overviewNote = "Figures in ₹ Crore; statement and review marks on each account's own date. Costs and gains name their coverage: absolute return uses costed, valued rows only. XIRR is the template's value-weighted blend of supported holding XIRRs, not a pooled portfolio XIRR. Benchmark returns are not available.";
  add("Portfolio Allocation", [col("category", "Category"), col("range", "Investment date range"), money("cost", "Investment at cost"), money("value", "Market value"),
    pct("weight", "Allocation (% of portfolio)"), pct("classWeight", "Allocation (% of asset class)"), money("income", "Dividend / interest"), money("fullGain", "Gain / (loss) including redeemed"),
    money("unrealised", "Gain / (loss) on what is held"), pct("absolute", "Absolute return — Portfolio (%)"), pct("babs", "Absolute return — Blended index (%)"),
    pct("xirr", "Annualised return — XIRR (%)"), pct("bxirr", "XIRR — Blended index (%)"), pct("coverage", "Share of value covered"), col("notes", "Coverage / notes", "", 48)],
    groups.map(g => {
      const f = figures(g.ps);
      return { category: g.label, ...f, cost: f.cost == null ? null : f.cost / 1e7, value: f.value == null ? null : f.value / 1e7,
        income: f.income == null ? null : f.income / 1e7, unrealised: f.unrealised == null ? null : f.unrealised / 1e7,
        fullGain: f.fullGain == null ? null : f.fullGain / 1e7, weight: ratio(f.value, totalValue),
        classWeight: g.parent ? ratio(f.value, sum(g.parent.map(p => p.marketValue))) : null,
        notes: `${g.ps.filter(p => p.costBasis != null).length}/${g.ps.length} rows with cost; ${g.ps.filter(p => p.dividendReceived != null).length}/${g.ps.length} with income; gains exclude ${g.ps.filter(p => p.costBasis == null || p.valuedAtCost).length} uncosted / at-cost rows`,
        _kind: g.kind ?? null, _ac: g.ps[0] ? classify(g.ps[0]).ac : null };
    }), overviewNote, (r): Record<string, ConsolidatedLink> => ({ category: { sheet: "Holdings", where: r.category === "Total" ? undefined
      : r._kind === "group" ? { ac: String(r.category) } : { ac: String(r._ac), cat: String(r.category) } } }));
  const basketGroups = [...BASKET_ORDER, ...new Set(rows.map(p => classify(p).basket).filter(b => !(BASKET_ORDER as readonly string[]).includes(b)))];
  add("Basket Allocation", [col("basket", "Basket"), col("code", "Code"), ...FAMILY_CLASS_ORDER.map(ac => money(ac, `${ac} market value`)), money("value", "Basket total"),
    pct("weight", "Actual allocation (%)"), pct("target", "Target allocation (%)"), pct("gap", "Gap: actual − target (% points)"), money("cost", "Investment at cost"),
    money("unrealised", "Gain / (loss) on what is held"), pct("absolute", "Absolute return (%)"), pct("xirr", "XIRR (%)"), pct("coverage", "Share of value with an XIRR")],
    [...basketGroups, "Total"].map(b => {
      const ps = b === "Total" ? rows : rows.filter(p => classify(p).basket === b), f = figures(ps);
      return { basket: b, code: basketCodes[b] ?? null, ...f, value: f.value == null ? null : f.value / 1e7, cost: f.cost == null ? null : f.cost / 1e7,
        unrealised: f.unrealised == null ? null : f.unrealised / 1e7, weight: ratio(f.value, totalValue),
        ...Object.fromEntries(FAMILY_CLASS_ORDER.map(ac => [ac, ps.length ? ps.filter(p => classify(p).ac === ac).reduce((s, p) => s + p.marketValue, 0) / 1e7 : null])),
        _kind: b === "Total" ? "total" : null };
    }), `${overviewNote} Basket targets are not supplied; target and gap remain blank.`, r => ({ basket: { sheet: "Basket Detail", where: r.basket === "Total" ? undefined : { basket: String(r.code ?? r.basket) } } }));
  add("Basket Detail", [col("basket", "Basket"), col("name", "Security / product"), col("ent", "Entity"), col("adv", "Advisor / manager"), col("cat", "Category"), col("first", "First investment", "dd-mmm-yyyy"),
    money("cost", "Investment at cost"), money("mv", "Market value"), pct("weight", "% of basket"), money("ugain", "Gain / (loss) on what is held"), col("shown", "Return shown"),
    pct("return", "Return (%)"), pct("breturn", "Benchmark return (%)"), pct("alpha", "Alpha (% points)"), col("bench", "Benchmark")],
    counted.map(h => ({ ...h, cost: h.cost == null ? null : (h.cost as number) / 1e7, mv: (h.mv as number) / 1e7, ugain: h.ugain == null ? null : (h.ugain as number) / 1e7,
      weight: ratio(h.mv as number, sum(counted.filter(r => r.basket === h.basket).map(r => r.mv as number))), return: h.xirr ?? h.absret })), overviewNote,
    r => ({ name: { sheet: "Holdings", find: String(r.hid) }, ent: { sheet: "Entities", find: String(r.ent) } }));
  const investorColumns = [col("category", "Category"), ...entities.flatMap(e => [money(`${e.id}:value`, `${e.name} — Value`), pct(`${e.id}:weight`, `${e.name} — Allocation`)]), money("family", "Family")];
  add("Investor Summary", investorColumns, groups.map(g => ({ category: g.label, family: g.ps.reduce((s, p) => s + p.marketValue, 0) / 1e7, _kind: g.kind ?? null, _ac: g.ps[0] ? classify(g.ps[0]).ac : null,
    ...Object.fromEntries(entities.flatMap(e => {
      const own = positions.filter(p => (accountById.get(p.accountId)?.ownerId ?? "unattributed") === e.id);
      const ownGroup = own.filter(p => g.kind === "total" || (g.kind === "group" ? classify(p).ac === g.label : classify(p).cat === g.label && classify(p).ac === classify(g.ps[0]).ac));
      const value = ownGroup.reduce((s, p) => s + p.marketValue, 0);
      return [[`${e.id}:value`, value / 1e7], [`${e.id}:weight`, ratio(value, sum(own.map(p => p.marketValue)))]];
    })) })), "Figures in ₹ Crore. Each investor column retains its own statement rows. Family counts shared dedupe groups once, so investor columns may exceed Family when the same holding is reported twice.",
    (r): Record<string, ConsolidatedLink> => ({ category: { sheet: "Holdings", where: r.category === "Total" ? undefined
      : r._kind === "group" ? { ac: String(r.category) } : { ac: String(r._ac), cat: String(r.category) } } }));
  add("Period Change", [col("category", "Category"), money("opening", "Value on previous date"), money("invested", "Invested"), money("redeemed", "Redeemed / distributed"),
    money("marketGain", "Gain in value (market)"), money("closing", "Value on current date"), money("income", "Dividend / interest received (gross)"), money("fees", "Fees paid from outside"),
    money("netGain", "Net gain"), pct("return", "Return for the period (%)"), col("count", "Transactions in the period", "#,##0"), col("notes", "Missing inputs", "", 55)],
    groups.map(g => ({ category: g.label, closing: g.ps.reduce((s, p) => s + p.marketValue, 0) / 1e7, _kind: g.kind ?? null,
      notes: "No complete common previous-date holding snapshot and matching cash-flow window. Period gain and return withheld." })),
    "Figures in ₹ Crore. Current account marks span multiple dates; a partial earlier panel is not a whole-family opening value.", r => ({ category: { sheet: "Transactions", find: r.category === "Total" ? undefined : String(r.category) } }));
  add("Tax Summary", [col("taxpayer", "Taxpayer"), col("lots", "Lots on file", "#,##0"), money("rst", "Realised — book profit: Short term"), money("rlt", "Realised — book profit: Long term"),
    money("tst", "Realised — taxable gain: Short term"), money("tlt", "Realised — taxable gain: Long term"), money("ust", "Unrealised — book profit: Short term"), money("ult", "Unrealised — book profit: Long term"),
    money("utst", "Unrealised — taxable gain: Short term"), money("utlt", "Unrealised — taxable gain: Long term"), money("div", "Dividend on lots (DPS × closing qty)"),
    col("soon", "Turning long-term soon: Lots", "#,##0"), money("soonGain", "Turning long-term soon: Unrealised taxable gain"), col("notes", "Coverage / notes", "", 48)], [...entities, { name: "Total" }].map(e => {
      const ls = e.name === "Total" ? lots : lots.filter(l => l.ent === e.name);
      const amount = (key: string) => { const n = sum(ls.map(l => l[key] as number | null)); return n == null ? null : n / 1e7; };
      return { taxpayer: e.name, lots: ls.length, rst: amount("_st"), rlt: amount("_lt"), tst: amount("_tst"), tlt: amount("_tlt"),
        notes: `${ls.filter(l => l.rbook != null).length} realised lots; ${ls.filter(l => l.rtax != null).length} with tax-effective figures. Current tax-lot coverage is incomplete.`, _kind: e.name === "Total" ? "total" : null };
    }), "Figures in ₹ Crore; every financial year on file. Book gains retain source short/long splits. Taxable columns cover only statements reporting tax-effective figures. A complete current tax-lot schedule is unavailable.",
    r => ({ taxpayer: { sheet: "Tax Lots", find: r.taxpayer === "Total" ? undefined : String(r.taxpayer) } }));

  const delta = (tabs.get("Portfolio Allocation")!.rows.at(-1)!.values[3] as number) * 1e7 - totalValue;
  add("Checks", [col("check", "Check"), col("result", "Result"), col("detail", "Details", "", 70)], [
    { check: "Portfolio Allocation to canonical book", result: Math.abs(delta) < 0.01 ? "PASS" : "FAIL", detail: `Difference ₹${delta.toFixed(2)}; ${rows.length} counted positions` },
    { check: "Holdings and accounts", result: positions.every(p => accountById.has(p.accountId)) ? "PASS" : "FAIL", detail: `${positions.length} valued account rows; ${holdings.length - positions.length} unvalued / written-off rows` },
    { check: "Duplicate reporting", result: "NOTE", detail: `${positions.length - rows.length} duplicate rows retained in Holdings, excluded from Family summaries` },
    { check: "Statement dates", result: "NOTE", detail: `${accounts.filter(a => a.asOf < asOf).length} accounts earlier than ${asOf}; summaries blend their own dates` },
    { check: "Cost coverage", result: counted.every(h => h.cost != null) ? "PASS" : "MISSING", detail: `${counted.filter(h => h.cost == null).length} counted rows without cost. At-cost rows have no measured gain.` },
    { check: "Benchmark, target and tax inputs", result: "MISSING", detail: "Benchmark history, basket targets and complete current tax-lot coverage are unavailable. Tax-effective figures and FMV are retained on reported realised lots." },
    { check: "Period Change inputs", result: "MISSING", detail: "Complete common-date opening positions and matching cash-flow window are unavailable." },
    { check: "Unvalued units", result: "NOTE", detail: `${holdings.filter(h => String(h.hid).startsWith("U")).length} quantity-only holdings preserved without a statement value` },
    { check: "Transaction account joins", result: transactions.every(t => !!t.acct) ? "PASS" : "MISSING", detail: `${transactions.filter(t => !t.acct).length} records could not join to a canonical account` },
  ], "Reconciliation checks and explicit missing inputs. PASS on arithmetic does not imply complete source coverage.", r => ({ check: { sheet: r.check === "Period Change inputs" ? "Period Change" : r.check === "Transaction account joins" ? "Transactions" : "Holdings" } }));
  add("Lists", [col("type", "List"), col("value", "Value"), col("code", "Code"), col("description", "Description", "", 50)], [
    ...FAMILY_CLASS_ORDER.map(value => ({ type: "Asset class", value })),
    ...basketGroups.map(value => ({ type: "Basket", value, code: basketCodes[value] ?? null })),
    ...[...new Set(rows.map(p => classify(p).cat))].map(value => ({ type: "Category", value })),
    ...[...new Set(accounts.map(a => a.engagement))].map(value => ({ type: "Account type", value })),
    ...["Statement value", "Review value", "At cost"].map(value => ({ type: "Valuation basis", value })),
    ...["Internal trade", "Investment", "Divestment", "Income", "Non-cash"].map(value => ({ type: "Transaction counts as", value })),
    { type: "Units", value: "₹ Crore", description: "Views divide by 1,00,00,000. Registers retain full INR." },
  ], "Classification uses the dashboard's family taxonomy and source-stated categories. Demo benchmark defaults and tax rules are not imported.");
  add("Column Mapping", [col("sheet", "Standard sheet"), col("column", "Standard column"), col("source", "Glow source", "", 55), col("method", "How populated", "", 65)], [
    { sheet: "Holdings", column: "Value, cost, quantities, gains", source: "Canonical dashboard book", method: "Latest authoritative statement rows; private markets use the family's review according to the existing book policy." },
    { sheet: "Holdings", column: "Unvalued / written-off rows", source: "Unvalued holdings and review write-offs", method: "Preserve identities, quantities and remarks; leave unreported amounts blank." },
    { sheet: "Portfolio Allocation", column: "Class, category, basket", source: "Family taxonomy and account engagement", method: "Summaries count each dedupe group once. Investor columns retain their own statement rows." },
    { sheet: "Holdings", column: "Scheme XIRR", source: "Complete dated capital record", method: "Same whole-account / review-line coverage gate as dashboard returns; annualised only with at least one year of history." },
    { sheet: "Tax Lots", column: "Realised lots", source: "Canonical capital-gain ledger", method: "Precedence and repeated-statement dedupe are applied before projecting rows." },
    { sheet: "Tax Lots", column: "Open lots", source: "Latest source open-lot register", method: "Current lot marks only where the book's quantity gate accepted the register. Historical unmatched lots stay visible." },
    { sheet: "Transactions", column: "Trades, capital, income", source: "Canonical transaction/income ledger, capital moves and review flows", method: "Manager dealing is labelled Internal trade. Own allotments represented by capital moves are not repeated as trades." },
    { sheet: "Commitments", column: "Called, paid, pending, uncalled", source: "Fund commitment statements", method: "Retain each printed field and statement date; never substitute called for paid. TVPI requires matching valuation basis and date." },
    { sheet: "Period Change", column: "Opening value and period return", source: "Required common-date snapshot is absent", method: "Withheld until complete opening and closing holdings and matching flow windows are wired." },
    { sheet: "Tax Lots", column: "FMV, effective cost, tax-adjusted gain", source: "Capital-gain statement's original lot row", method: "Source-stated tax inputs remain on their own lots. Security-level FMV requires source agreement. Missing inputs remain blank." },
    { sheet: "Securities", column: "Benchmark returns", source: "Not supplied by the canonical book", method: "Demo values and taxonomy defaults are not evidence about Glow Ventures. Leave blank." },
  ], "This mapping documents the actual dashboard sources used to populate the supplied template.", r => ({ sheet: { sheet: String(r.sheet) } }));
  add("Start Here", [col("setting", "Setting / sheet", "", 30), col("value", "Value", "", 42), col("notes", "Notes", "", 75)], [
    { setting: "Client / family name", value: "Glow Ventures", notes: "Consolidated Sheet" },
    { setting: "Valuation date", value: asOf, notes: "Newest book date. Each account retains its own statement date; this is a blend of dates." },
    { setting: "Previous valuation date", value: null, notes: "No complete common-date opening holding snapshot." },
    { setting: "Show figures in", value: "₹ Crore", notes: "Summary views in crore; registers in full INR." },
    { setting: "Sources", value: docs.length, notes: "Authoritative book and reconciled ledger from the complete wired archive. Original tables are in Sources below." },
    { setting: "Refresh", value: "Automatic with every dashboard build", notes: "Newly wired statements regenerate the same consolidated projection. Reopen the dashboard after a deployment to load the new revision." },
    ...tabNames.filter(n => n !== "Start Here").map(setting => ({ setting, value: "Open sheet", notes: "Linked summary, register or supporting detail." })),
    ...docs.map(d => ({ setting: `Source · ${d.provider} ${d.accountNo ?? ""}`, value: d.docKey,
      notes: `${d.reportType} · ${d.asOf ?? "undated"} · ${d.sourcePath}`, _source: d.docKey })),
  ], "Glow Ventures consolidated data in the supplied 17-tab format. No fictional demo data is carried over. Summary and register links open the relevant detail sheet.",
    r => ({ setting: r._source ? { file: String(r._source) } : r.setting === "Sources" ? { file: "" } : { sheet: tabNames.includes(String(r.setting)) ? String(r.setting) : "Start Here" },
      value: r._source ? { file: String(r._source) } : { sheet: tabNames.includes(String(r.setting)) ? String(r.setting) : "Start Here" } }));
  return { client: "Glow Ventures", asOf, totalValue, documents: docs.length, tabs: tabNames.map(n => tabs.get(n)!) };
}
