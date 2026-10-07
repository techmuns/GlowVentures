#!/usr/bin/env node
// Build src/data/glowData.ts from the audit archive.
//
//   npm run build-book        (after `npm run inventory && npm run extract`)
//
// The book is GENERATED, never hand-edited. It regenerates byte-identically from
// source/ alone: every figure here traces to one document in public/audit/, and
// there is no state in this script that the statements did not supply — no
// timestamps, no ordering by hash-map insertion, no defaults standing in for a
// figure a report did not print.
//
// WHAT THIS SCRIPT WILL NOT DO. It will not fill a gap. Where the corpus does
// not support a figure the field is null or the array is empty, and the reason
// is printed at the end of the run and written into the build report. An
// unrealised short/long-term split, for instance, needs per-lot purchase dates;
// the capital REGISTER in this drop is a capital-account ledger, not a lot
// register, so that split stays null and the UI renders "—". Estimating it from
// the average holding period would produce a number nobody could check.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OWNERS, ownerById } from "../shared/owners.mjs";
import { resolveSector, UNCLASSIFIED } from "../shared/sectors.mjs";
import { securityKeyOf } from "../shared/securityKey.mjs";
import { marketSideOf, readAifCategory, readsAsPrivateEquity, fundMarketSideBasis } from "../shared/aifCategory.mjs";
import { fifoForClass, fifoReturnPct, fifoFromCashFlows } from "../shared/fifo.mjs";
import { lotGroupsOf, daySalesOf, settleSales, settledSecurityOf } from "../shared/lotSettlement.mjs";
import { sourceFor } from "./ingest/precedence.mjs";
import { AIF_UNITS, PROVIDER as CDSL_DEMAT_PROVIDER } from "./ingest/providers/motilalDemat.mjs";
import { reclassificationsFrom, carryLotsThroughSwitches, carryCostThroughSwitches, UNIT_TIE } from "./lib/classSwitch.mjs";
import { PROVIDER as NSDL_DEMAT_PROVIDER } from "./ingest/providers/nsdlDemat.mjs";
import { PROVIDER as HDFC_NSDL_PROVIDER } from "./ingest/providers/hdfcNsdl.mjs";
import { SEPARATE_INVESTMENTS } from "../shared/separateInvestments.mjs";
import { KEPT_UNVALUED, keptUnvaluedFor, keptUnvaluedReason } from "../shared/keptUnvalued.mjs";

/**
 * THE DEPOSITORY ACCOUNTS, BOTH OF THEM.
 *
 * `dropDepositoryDuplicates` was written against the one CDSL provider and was
 * keyed on it by name. The NSDL account at ICICI Bank carries four of the same
 * fund ISINs — Sanshi Class A2 and Class E, India SME Class A2, Sky Capital's
 * Oncare A3 — so keyed on one provider it would have counted every one of them
 * a second time, at the face value the depository prints. A set, not a string,
 * so a third depository is one entry rather than a second code path.
 */
const DEPOSITORY_PROVIDERS = new Set([CDSL_DEMAT_PROVIDER, NSDL_DEMAT_PROVIDER]);

/**
 * CUSTODY ACCOUNTS — every depository whose statement this book reads, the two
 * above and the trusts' HDFC Bank NSDL account. Used ONLY to word why a
 * quantity-only row carries no value (a custodian records units, and a face
 * value where it has no price; a fund's own statement that prints no NAV is a
 * different fact with a different remedy). Deliberately NOT folded into
 * `DEPOSITORY_PROVIDERS`, which decides what `dropDepositoryDuplicates` drops.
 */
const CUSTODY_PROVIDERS = new Set([...DEPOSITORY_PROVIDERS, HDFC_NSDL_PROVIDER]);

import { reviewBookLayer } from "./lib/reviewBook.mjs";
import { NOT_ATTRIBUTED, NOT_ATTRIBUTED_NAME } from "../shared/reviewHolders.mjs";
import { REVIEW_AS_OF } from "./lib/reviewPrivateRead.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_DIR = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public", "audit");
const OUT = process.env.GLOW_BOOK_OUT ?? path.join(ROOT, "src", "data", "glowData.ts");
// AND THE REPORT TAKES ONE TOO, beside `GLOW_BOOK_OUT`. A branch of this
// report that no archived document reaches — the bank section, until the
// delivery lands — can only be checked by RENDERING it against a synthetic
// archive, and a suite that did that wrote over the committed book on every
// run. `extract.mjs` has carried `GLOW_SOURCE_DIR`/`GLOW_AUDIT_DIR`/
// `GLOW_DOCS_DIR` for the same reason since it was written.
const REPORT = process.env.GLOW_BOOK_REPORT ?? path.join(ROOT, "docs", "BOOK-REPORT.md");

const r2 = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);
// UNITS, not rupees — the depository statements print quantities to three
// decimals and their own arithmetic is exact at that precision, so rounding one
// to paise breaks the identity a share-movement table is published on.
const r3 = (n) => (n === null || n === undefined ? null : Math.round(n * 1000) / 1000);
/** Four places, for a PERCENTAGE — two would round a 0.4 bp contribution to zero. */
const r4 = (n) => (n === null || n === undefined ? null : Math.round(n * 10000) / 10000);
/**
 * RING-FENCED SECURITIES — carried in the archive, kept OUT of every book total.
 *
 * Polycab India is the family's PROMOTER stock: the ICICI NSDL statement marks
 * 1.39 Cr shares at ₹8,885 each — ₹12,351 Cr, about seventeen times the rest of the
 * book put together, and absent from the family's OWN consolidated review, which is the
 * evidence they do not track it as a portfolio position. It is still INGESTED,
 * because the statement says the account holds it and refusing a measured holding
 * for being inconveniently large is the fabrication rule run backwards. What the
 * family asked for is that it not be summed into the consolidated NAV, the
 * listed/private split, any allocation / sector / entity / concentration figure or
 * the holdings tables — it lives on ONE page of its own. So it is split off here,
 * emitted as `BOOK_POLYCAB`, and the `/polycab` route is its only reader. This is
 * the §4c judgement — a decision about the family's affairs, not a parsing rule —
 * and it reverses in one line: remove the key and the holding folds back into every
 * total. Keyed on `securityKey` (the canonical join key), so it holds wherever the
 * security is reported, not just this one account.
 *
 * THE KEY MOVED WITH THE DEPOSITORY STRIP, and it is the most expensive literal
 * in this file to get wrong: the statement prints `POLYCAB INDIA LIMITED - EQ`,
 * which keyed `polycab-india-limited-eq` until `securityKeyOf` began removing
 * the depository's own furniture (see `shared/securityKey.mjs`). Left on the old
 * spelling the fence matches nothing and ₹12,351 Cr of promoter stock walks back
 * into every total on the dashboard, silently, on pages computing correctly.
 * `check:pages` asserts the absence on nine routes and is what catches it.
 */
const RINGFENCED_SECURITY_KEYS = new Set(["polycab-india"]);

/**
 * THE FAMILY'S CONSOLIDATED REVIEW (MOPWM) IS THE SOURCE FOR PRIVATE-MARKET
 * HOLDINGS — Stage 10dh, at the family's instruction. Every private-market line
 * of the review becomes a position here, and the statement rows it replaces go
 * (named in `BOOK_REVIEW_SUPERSEDED`). `scripts/lib/reviewBook.mjs` builds the
 * rows and refuses anything it cannot tie to the review's own totals. Setting
 * this false puts the statements back, in one line, like the ring-fence above.
 */
const PRIVATE_MARKET_FROM_REVIEW = true;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/**
 * ── WHICH FINANCIAL YEAR EACH LOT'S GAIN BELONGS TO ─────────────────────────
 *
 * Tax is assessed per financial year (1 April to 31 March), on the sales made
 * in it. A capital gain statement's window is the MANAGER's choice, and ASK's
 * and Marathon's run from inception — 2019 and 2024 — so an account's realised
 * total can span seven years, and an estimate struck on it taxes a past year's
 * sales as this year's. Measured on the September 2026 delivery: not one of
 * those four accounts' 2,389 lots was sold on or after 1 April 2026, and the
 * tax estimate read ₹2.00 Cr on gains a past year's return already covers.
 *
 * Every lot carries its own sale date, so the split is exact rather than an
 * allocation: summed by the year that date falls in, Σ over the years is the
 * account's realised total. A lot with no sale date is counted in no year and
 * carried as its own entry (`fy: null`), so the identity still holds and the
 * page can name what it could not place.
 */
function realisedByYearOf(lots) {
  const by = new Map();
  for (const l of lots) {
    const d = typeof l.saleDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.saleDate) ? l.saleDate : null;
    const fy = d ? `${Number(d.slice(5, 7)) >= 4 ? Number(d.slice(0, 4)) : Number(d.slice(0, 4)) - 1}-04-01` : null;
    const e = by.get(fy) ?? { fy, st: 0, lt: 0, lots: 0 };
    e.st += isNum(l.shortTerm) ? l.shortTerm : 0;
    e.lt += isNum(l.longTerm) ? l.longTerm : 0;
    e.lots += 1;
    by.set(fy, e);
  }
  return [...by.values()]
    .sort((a, b) => (a.fy ?? "").localeCompare(b.fy ?? ""))
    .map((e) => ({ fy: e.fy, st: r2(e.st), lt: r2(e.lt), lots: e.lots }));
}

// ── Load ─────────────────────────────────────────────────────────────────────

function loadArchive() {
  if (!fs.existsSync(AUDIT_DIR)) return [];
  return fs.readdirSync(AUDIT_DIR).sort()
    .map((dir) => path.join(AUDIT_DIR, dir, "document.json"))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8")))
    .filter((d) => d.status !== "failed");
}

/** account key — provider + account number is the identity, as in the archive. */
const acctKey = (d) => (d.accountNo ? `${d.provider}::${d.accountNo}` : null);
const accountIdOf = (provider, accountNo) =>
  `${provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${accountNo}`;

/**
 * The document precedence names as authoritative for a fact, among those for
 * one account. Falls back to nothing rather than to "whichever we saw last" —
 * that fallback is what precedence.mjs exists to prevent.
 */
function authoritative(docs, provider, fact) {
  const rule = sourceFor(provider, fact);
  if (!rule) return null;
  // A rule marked `newestWins` names report types that are each a SNAPSHOT of
  // the same fact (Buoyant's PMS appraisal and the fund's own portfolio snap),
  // so the NEWEST issue among them is authoritative and the order only breaks a
  // tie on one date. Every other rule keeps "the first report type present".
  if (rule.newestWins) {
    const rank = (d) => rule.reportTypes.indexOf(d.reportType);
    const candidates = docs.filter((d) => rank(d) >= 0);
    candidates.sort((a, b) => ((b.asOf ?? "") < (a.asOf ?? "") ? -1 : (b.asOf ?? "") > (a.asOf ?? "") ? 1 : 0)
      || rank(a) - rank(b)
      || (a.docKey < b.docKey ? -1 : a.docKey > b.docKey ? 1 : 0));
    return candidates[0] ?? null;
  }
  for (const rt of rule.reportTypes) {
    const hit = docs.find((d) => d.reportType === rt);
    if (hit) return hit;
  }
  return null;
}

/**
 * One account, one report type, SEVERAL DATES — keep the newest.
 *
 * The book is a position SNAPSHOT, and this drop is the first to carry the same
 * report for one account at two as-of dates: 360 ONE bundles CRN37702 and
 * CRN60117 at both 31 May 2026 and 30 Jun 2026. Precedence answers "which REPORT
 * is authoritative"; it says nothing about which ISSUE of that report, so both
 * matched and `find` returned whichever sorted first — the MAY one, quietly
 * showing a month-old market value while a newer statement sat in the archive.
 *
 * Superseded documents stay in the archive (they are provenance, and the Data
 * Audit browser lists them); they simply do not feed the book, and each one is
 * named in the build report so the choice is visible rather than implied.
 */
function newestPerReportType(group, notes, label) {
  const best = new Map();
  for (const d of group) {
    const cur = best.get(d.reportType);
    // Ties break on docKey so the book stays byte-identical across runs.
    const newer = !cur
      || (d.asOf ?? "") > (cur.asOf ?? "")
      || ((d.asOf ?? "") === (cur.asOf ?? "") && d.docKey < cur.docKey);
    if (newer) best.set(d.reportType, d);
  }
  const kept = new Set([...best.values()].map((d) => d.docKey));
  for (const d of group) {
    if (kept.has(d.docKey)) continue;
    notes.push(`${label}: ${d.reportType} ${d.asOf ?? "(no date)"} superseded for SNAPSHOT facts by ${best.get(d.reportType).asOf}`
      + ` — \`${d.docKey}\`; its dated rows are still counted`);
  }
  return group.filter((d) => kept.has(d.docKey));
}

/**
 * Collections a superseded document must STILL contribute.
 *
 * `newestPerReportType` is right about a SNAPSHOT: a June holding statement
 * restates what a May one said, and counting both would double the account. It
 * is WRONG about a dated record, and this drop is the first where that matters.
 *
 *   SVAN 8710067   May and June investor reports. June's holdings supersede
 *                  May's — but May's five TRADES happened, and dropping the
 *                  document dropped them.
 *   360 ONE 37702  the bundle carries a corporate-action statement inside the
 *                  holdings document. Superseding May discarded May's corporate
 *                  actions — the same ₹8,53,660 an earlier bug in this pipeline
 *                  had already lost once.
 *   GL 510861      two capital gain statements over DIFFERENT WINDOWS (the house
 *                  set's, and the bundle's quarter). Neither restates the other.
 *
 * A trade on 18 June and a trade on 12 May are two events, not two readings of
 * one. So dated rows are UNIONED across every issue and deduped on their own
 * identity — the same row printed on two statements is counted once, and two
 * different rows that happen to share a date are both kept.
 */
const DATED_COLLECTIONS = ["transactions", "capitalGains", "income", "cashFlows", "expenses"];

/**
 * The identity of one dated row, for deduping across overlapping statements.
 *
 * Every field that distinguishes two real events, and nothing that does not:
 * `source` is deliberately absent, because the whole point is to recognise the
 * same event printed on two documents.
 *
 * THE AMOUNT IS WHICHEVER AMOUNT THIS ROW SHAPE CARRIES. This read `r.amount ??
 * r.netAmount ?? …` against a fixed list, and a BANK-BOOK row carries none of
 * them — its figures are `buySellAmount`, `income`, `expenses`,
 * `depositWithdrawal`, `balance`. So every bank-book row for one security on one
 * date collapsed to a single key: six real GlaxoSmithKline settlement rows on
 * 2026-05-29 would have become one. Nothing on screen reads that collection
 * today, which is the only reason it did no damage — a latent trap is still a
 * trap. Every numeric field the row actually has now enters the key.
 */
const AMOUNT_FIELDS = [
  "amount", "netAmount", "saleAmount", "settlementAmount", "gross", "net",
  "buySellAmount", "depositWithdrawal", "income", "expenses", "balance",
  "shortTerm", "longTerm", "purchaseAmount", "units", "unitPrice", "ratePerUnit",
];

const datedKey = (kind, r) => [
  kind,
  r.date ?? r.saleDate ?? r.exDate ?? r.receivedDate ?? "",
  r.securityKey ?? r.security ?? "",
  r.side ?? r.kind ?? r.detail ?? r.description ?? "",
  r.quantity ?? "",
  r.purchaseDate ?? "",
  ...AMOUNT_FIELDS.map((f) => (r[f] ?? r.printed?.[f] ?? "")),
].join("\u0001");

/**
 * Every dated row for one account, across ALL its statements — superseded or not.
 * Returns `{ transactions, capitalGains, income, cashFlows, expenses }`.
 */
function datedRowsAcross(allIssues, kept, notes, label) {
  const out = Object.fromEntries(DATED_COLLECTIONS.map((k) => [k, []]));
  const seen = new Set();
  let recovered = 0;
  // Kept documents first, so a row present on both keeps the authoritative
  // document's copy and its `source` back-reference.
  const ordered = [...allIssues.filter((d) => kept.has(d.docKey)), ...allIssues.filter((d) => !kept.has(d.docKey))];
  for (const d of ordered) {
    /**
     * A REPEAT WITHIN ONE DOCUMENT IS DATA. A REPEAT ACROSS TWO IS A DUPLICATE.
     *
     * Green Lantern's transaction statement prints `The Anup Engineering Ltd
     * 02/04/2026 Buy 77.00 1,732.68 1,735.80 133,656.63` TWICE, consecutively.
     * Those are two purchases of the same size at the same average on one day —
     * the statement said so twice because it happened twice. A global key
     * deleted the second, silently, and the only figure that would have caught
     * it is a quantity nobody was checking.
     *
     * So each row is keyed with its ORDINAL among identical rows on its own
     * document. The second Anup buy on statement A keys `…#2`; if statement B
     * also prints two, B's `#1` and `#2` both dedupe against A's and the count
     * stays at two. If B prints only one, A's `#2` still stands. The rule the
     * count enforces is exactly "a document's own repetition is evidence".
     */
    const ordinal = new Map();
    for (const kind of DATED_COLLECTIONS) {
      for (const r of d[kind] ?? []) {
        const base = datedKey(kind, r);
        const n = (ordinal.get(base) ?? 0) + 1;
        ordinal.set(base, n);
        const k = `${base}\u0001#${n}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out[kind].push(r);
        if (!kept.has(d.docKey)) recovered++;
      }
    }
  }
  if (recovered) {
    notes.push(`${label}: ${recovered} dated row(s) come from statements superseded for their snapshot figures — `
      + "a trade on an earlier statement still happened, and is counted once here.");
  }
  return out;
}


/**
 * ── DATED NAV HISTORY, AND THE PREMISE THAT STOPPED BEING TRUE ──────────────
 *
 * This function's predecessor was three lines: `const navHistory = []` and a
 * note reading "the corpus carries an opening and a closing portfolio value per
 * account and nothing between them. Two points are not a series." That was TRUE
 * when it was written, against a nine-account corpus, and it has been FALSE
 * since `august-2026-b` — the drop that first reissued a statement an account
 * had already filed. Five deliveries later the archive carries THREE month-ends
 * for both SVAN accounts and for 360 ONE CRN37702, and TWO for fourteen more.
 *
 * That is the fourth absence in this repo recorded against a premise nobody
 * rechecked, after FRED, the RBI and the ISIN tier — and it is the same cost
 * every time: a reader is told to stop looking for something that is already in
 * the archive. So the series is MEASURED here, and what cannot supply one is
 * named rather than folded in.
 *
 * FOUR RULES, each of which is a wrong series avoided:
 *
 * 1. THE COMPOSITION NEVER CHANGES INSIDE THE SERIES. Only accounts publishing
 *    at least TWO dated valuations can carry one, and the series starts at the
 *    date the LAST of them first published (2026-07-10 on this archive, when
 *    Goldstandard and Carnelian join the ten already reporting). Starting
 *    earlier would draw a line that climbs from ₹27 Cr to ₹142 Cr because
 *    accounts ARRIVED, and a reader would take that for performance.
 *
 * 2. EACH POINT IS THE BOOK AS THE STATEMENTS STOOD, WHICH MEANS CARRY-FORWARD.
 *    An account is held at its most recent valuation at or before the date —
 *    exactly the construction of the headline consolidated NAV, evaluated at
 *    earlier dates rather than only today. Every point therefore states how many
 *    of its accounts are marked ON that date and how many are carried.
 *
 * 3. EACH `dedupeGroup` IS COUNTED ONCE, at every date. Both of this book's
 *    duplicated holdings are private, and ONE of them — 360 ONE Special
 *    Opportunities under CRN37702 and CRN60117 — sits inside the covered set
 *    with both CRNs publishing three and two dated valuations. Summing the
 *    accounts naively would put ₹1.46 Cr into every point twice.
 *
 * 4. AND EXTERNAL CAPITAL IS NETTED OUT OF THE INDEX, ON THE ACCOUNT'S OWN
 *    CLOCK. V.E.C 128005 took ₹11.24 Cr of Fund Deposits on 28 and 29 July —
 *    182% of its own opening value — and its next valuation is 13 August. Left
 *    in, that one deposit is a +8% step in a ₹142 Cr book with no market
 *    movement behind it, which is precisely the comparison-against-an-index
 *    failure `accountXirr.test.ts` already gates for. The flow is attributed to
 *    the interval in which THAT ACCOUNT's mark moves — not the interval the
 *    money arrived in — because a carried-forward account's flows and its marks
 *    run on different clocks. Same reasoning as `pooledXirr`: each account
 *    closes on its own as-of.
 *
 * WHAT THIS STILL CANNOT DO, stated rather than papered over: a step between
 * two marks that no statement settles — no printed capital total at both ends,
 * no identical unit counts, no dated record — would carry a subscription or
 * redemption as performance. Such a step is `unreported`, and what it cannot
 * prove is the account's MOVE over it, named on screen; see `proveLink`. On
 * this archive every step is settled by the statements themselves.
 */
function navHistoryFrom(byAccount, keptAccountIds, dedupeByAcctSec, accountCashFlows, positions, notes) {
  /**
   * EVERY ACCOUNT'S VALUE COMES FROM THE BOOK, NOT FROM THE ARCHIVE ROW SUM.
   *
   * The two are not the same and the gap is real: the ICICI NSDL account's own
   * statement values 14 rows at ₹119.26 Cr, and the BOOK carries it at ₹63.78 Cr
   * because `dropDepositoryDuplicates` removes two Sanshi Fund rows the fund
   * itself already reports (₹55.5 Cr) and the ring-fence removes Polycab. A
   * coverage block quoting the archive would put ₹55 Cr of double-counted value
   * into the figure that tells a reader how much of the book the series misses.
   * One source, and it is the book — the same reason `check:pages` resolves its
   * addresses from the page rather than typing them.
   */
  const bookValueOf = new Map();
  for (const p of positions) {
    if (!isNum(p.marketValue)) continue;
    bookValueOf.set(p.accountId, (bookValueOf.get(p.accountId) ?? 0) + p.marketValue);
  }
  /** Every dated, VALUED snapshot of one account: date → {mv, holdings}. */
  const snapshotsByAccount = new Map();
  const single = [];
  const unvalued = [];

  for (const [key, allIssues] of [...byAccount.entries()].sort()) {
    const sample = allIssues.find((d) => d.reportType === "appraisal") ?? allIssues[0];
    const provider = sample.provider;
    const accountId = accountIdOf(provider, sample.accountNo);
    if (!keptAccountIds.has(accountId)) continue;   // excluded from the book entirely

    const rule = sourceFor(provider, "holdings");
    const rts = rule ? rule.reportTypes : [];
    // One document per as-of: the first report type precedence names, so the
    // series is struck on the SAME basis the book's own positions are. Ties
    // break on docKey, so the emitted file stays byte-identical across runs.
    const pick = new Map();
    for (const d of allIssues) {
      if (!d.asOf || d.asOf === "unknown") continue;
      const rank = rts.indexOf(d.reportType);
      if (rank < 0) continue;
      const cur = pick.get(d.asOf);
      if (!cur || rank < cur.rank || (rank === cur.rank && d.docKey < cur.d.docKey)) pick.set(d.asOf, { rank, d });
    }

    const snaps = [];
    for (const [asOf, { d }] of [...pick.entries()].sort()) {
      // THE RING-FENCE APPLIES HERE TOO. Polycab is out of every book total by
      // the family's decision, and a NAV SERIES is a book total per date. Reading
      // the holdings straight off the archive is exactly where that fence would
      // be missed, because the splice that enforces it elsewhere happens on
      // `positions` and this does not go through them.
      const hs = (d.holdings ?? []).filter((h) => h.securityKey && !RINGFENCED_SECURITY_KEYS.has(h.securityKey));
      const valued = hs.filter((h) => isNum(h.marketValue));
      if (!valued.length) continue;
      snaps.push({
        date: asOf,
        docKey: d.docKey,
        reportType: d.reportType,
        marketValue: sum(valued.map((h) => h.marketValue)),
        // Kept for the dedupe: a group counted under one account must not be
        // counted again under the other at the same date.
        rows: valued.map((h) => ({
          securityKey: h.securityKey,
          security: h.security ?? h.securityKey,
          quantity: isNum(h.quantity) ? h.quantity : null,
          // The PRICE is what makes an attribution possible: market value is
          // quantity x price on every priced row in this archive (measured:
          // 765 of 765 to the paisa), so the split below has no residual.
          marketPrice: isNum(h.marketPrice) ? h.marketPrice : null,
          marketValue: h.marketValue,
          // Only so the units-unchanged proof below can refuse a cash line: a
          // deposit into a mandate lands in its cash, not in any unit count.
          assetClass: h.assetClass ?? null,
          dedupeGroup: h.dedupeGroup ?? dedupeByAcctSec.get(`${key}|${h.securityKey}`)?.dedupeGroup ?? null,
        })),
      });
    }

    // The capital a statement PRINTS as having moved over a window — see
    // `proveLink` below. Read off every issue, superseded or not: a window's
    // total is a dated fact about that window, not a snapshot another issue
    // restates.
    const anchors = [];
    for (const d of allIssues) {
      const f = d.flows;
      if (!f?.periodFrom || !f?.periodTo) continue;
      if (isNum(f.netCapitalInOut)) {
        anchors.push({ reportType: d.reportType, kind: "net", from: f.periodFrom, to: f.periodTo, net: f.netCapitalInOut });
      }
      if (isNum(f.contribution) && isNum(f.withdrawal)) {
        anchors.push({ reportType: d.reportType, kind: "cw", from: f.periodFrom, to: f.periodTo, net: f.contribution - f.withdrawal });
      }
    }

    if (snaps.length >= 2) snapshotsByAccount.set(accountId, { provider, accountNo: sample.accountNo, snaps, anchors });
    else if (snaps.length === 1) single.push({ accountId, provider, accountNo: sample.accountNo, date: snaps[0].date });
    else unvalued.push({ accountId, provider, accountNo: sample.accountNo });
  }

  /** Per-account series, emitted whole — a page can chart one account alone. */
  const accountNavHistory = {};
  for (const [accountId, { snaps }] of snapshotsByAccount) {
    accountNavHistory[accountId] = snaps.map((s) => ({ period: s.date, date: s.date, nav: r2(s.marketValue) }));
  }

  const covered = [...snapshotsByAccount.keys()].sort();
  if (covered.length < 2) {
    notes.push("navHistory is EMPTY: fewer than two accounts in this archive publish more than one dated valuation, "
      + "so there is no set over which a consolidated series holds its composition constant.");
    return {
      navHistory: [], accountNavHistory, undatedCapital: [],
      coverage: {
        covered: [],
        single: single.map((x) => ({ ...x, bookValue: r2(bookValueOf.get(x.accountId) ?? 0) })),
        unvalued: unvalued.map((u) => ({ ...u, bookValue: r2(bookValueOf.get(u.accountId) ?? 0) })),
        from: null, to: null, panelCompleteFrom: null,
      },
      snapshotsByAccount,
    };
  }

  /**
   * RULE 1, RESTATED — THE LINK HOLDS THE PANEL CONSTANT, NOT THE SERIES.
   *
   * This used to read `const start = covered.map(firstOf).sort().at(-1)` — the
   * series began where every covered account had published at least once, so
   * that no arrival could look like performance. The rule was right about the
   * LEVEL and it cost 40 of the archive's 74 measured days, which is exactly
   * what the family reported about this card.
   *
   * A chain-linked index needs a constant panel across each LINK, not across
   * the whole series. So the series now starts at the EARLIEST covered date and
   * every link is struck over the accounts valued at both of its ends; an
   * account joining on a date is in neither end of the link ending there and
   * contributes 0.00% rather than a step. `panelCompleteFrom` is the old start
   * and still governs the RAW NAV line, which genuinely cannot be rebased
   * across a changing panel.
   */
  const firstOf = (id) => snapshotsByAccount.get(id).snaps[0].date;
  const panelCompleteFrom = covered.map(firstOf).sort().at(-1);
  const dates = [...new Set(covered.flatMap((id) => snapshotsByAccount.get(id).snaps.map((s) => s.date)))].sort();

  /** The account's latest snapshot at or before `d`. */
  const at = (id, d) => {
    const snaps = snapshotsByAccount.get(id).snaps;
    let hit = null;
    for (const s of snaps) if (s.date <= d) hit = s; else break;
    return hit;
  };

  /**
   * RULE 3 IN ONE PLACE — the deduped consolidated value of a SET of accounts
   * at a date. The whole-panel NAV and each link's two ends all go through it,
   * so a link cannot count a `dedupeGroup` on a basis the level does not.
   *
   * The tie-break is NOT alphabetical: 360 ONE Special Opportunities is
   * reported under CRN37702 and CRN60117 and both are covered, so taking
   * whichever accountId sorted first would hold the group at 60117's 30 June
   * mark on every date after 37702 restated — counted once (right) at a stale
   * figure (wrong). The group is held at its LATEST-DATED row; the accountId
   * breaks a genuine tie so the emitted file stays byte-identical.
   */
  const navAt = (ids, d) => {
    let total = 0;
    const best = new Map();
    for (const id of ids) {
      const snap = at(id, d);
      if (!snap) continue;
      for (const row of snap.rows) {
        if (!row.dedupeGroup) { total += row.marketValue; continue; }
        const cur = best.get(row.dedupeGroup);
        if (!cur || snap.date > cur.date || (snap.date === cur.date && id < cur.id)) {
          best.set(row.dedupeGroup, { date: snap.date, id, marketValue: row.marketValue });
        }
      }
    }
    for (const g of best.values()) total += g.marketValue;
    return total;
  };

  /**
   * RULE 4'S EVIDENCE — WHAT THE STATEMENTS THEMSELVES SAY MOVED BETWEEN TWO OF
   * AN ACCOUNT'S MARKS. A step is proven by one of three things, strongest first:
   *
   *  · PRINTED TOTALS. A statement prints the capital that moved over a window —
   *    a fact sheet's contribution and withdrawal since inception, a
   *    performance summary's or history's net capital in/out, a SEBI investor
   *    report's inflow and outflow for its month. Either ONE statement's window
   *    is exactly the step, or TWO statements of one kind open on the same date
   *    and close at the step's two ends, and their difference is what moved in
   *    between. No date is needed and none is assumed: Carnelian's totals move
   *    by ₹30,690 between 10 July and 10 August and no dated row carries it, so
   *    it is netted here and NAMED where a rate needs a date (`undatedCapital`).
   *  · UNITS UNCHANGED. The same securities at both marks with the same unit
   *    counts, none of them cash: nothing was bought or redeemed, so no capital
   *    moved. (It used to require a single security held unchanged at EVERY
   *    snapshot, which left HDFC MF 16180583 — two schemes, nil at both ends —
   *    "unproven" over a move of ₹0.)
   *  · THE DATED RECORD the XIRR reads, where no printed total covers the step.
   *
   * Every printed total a step has must AGREE, ±₹1; two statements that
   * disagree prove nothing. A step with none of the three is unproven, and what
   * it cannot prove is the account's MOVE over the step — never its value.
   *
   * THIS USED TO READ `accountCashFlows` ALONE, which covers 8 accounts, and
   * booked the whole MARKET VALUE of every other multi-security account as "not
   * proven": ₹28.3 Cr on the NAV card, ten times the ₹2.78 Cr those four
   * accounts actually moved, about accounts whose own statements settle it —
   * SVAN's investor reports print ₹0 in and ₹23,931 out, Molecule's fact sheets
   * the same contribution and withdrawal at both marks, HDFC MF nil at both
   * ends (A-10, MNT-1). And SVAN's ₹23,931 went un-netted (MNT-22).
   */
  const dayAfter = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const datedIn = (id, a, b) => {
    const flows = (accountCashFlows[id] ?? []).filter((f) =>
      !/^Opening portfolio value/i.test(f.description ?? "") && f.date > a && f.date <= b);
    // `CashFlow.amount` is NEGATIVE for capital in (see types.ts), so capital in
    // is the negated sum.
    return -sum(flows.map((f) => f.amount));
  };
  const proveLink = (id, was, snap) => {
    const { anchors } = snapshotsByAccount.get(id);
    const a = was.date, b = snap.date;
    const found = [];
    for (const x of anchors) {
      if (x.to !== b) continue;
      if (x.from === dayAfter(a)) { found.push({ net: x.net, reportType: x.reportType }); continue; }
      if (x.from > a) continue;
      for (const y of anchors) {
        if (y.reportType === x.reportType && y.kind === x.kind && y.from === x.from && y.to === a) {
          found.push({ net: x.net - y.net, reportType: x.reportType });
        }
      }
    }
    if (found.length) {
      const nets = found.map((f) => f.net);
      if (Math.max(...nets) - Math.min(...nets) <= 1) {
        return { basis: "printed-totals", net: r2(found[0].net), evidence: [...new Set(found.map((f) => f.reportType))].sort() };
      }
      return { basis: "unproven", why: `its printed capital totals over ${a} → ${b} disagree (${[...new Set(nets.map(r2))].join(" vs ")})` };
    }
    const keyed = (s) => new Map(s.rows.map((r) => [r.securityKey, r]));
    const w = keyed(was), n = keyed(snap);
    const unchanged = n.size > 0 && w.size === n.size && [...n].every(([k, r]) => {
      const o = w.get(k);
      return !!o && isNum(o.quantity) && isNum(r.quantity) && r.assetClass !== "Cash" && o.assetClass !== "Cash"
        && Math.abs(o.quantity - r.quantity) < 1e-6;
    });
    if (unchanged) return { basis: "units-unchanged", net: 0, evidence: [] };
    if ((accountCashFlows[id] ?? []).length) return { basis: "dated-record", net: r2(datedIn(id, a, b)), evidence: [] };
    return { basis: "unproven", why: "no statement prints the capital that moved between these two marks" };
  };

  // Per account, over each of its own consecutive marks — exactly the steps the
  // chain below nets, because every covered account's every mark is a series date.
  const flowBasis = {};
  const undatedCapital = [];
  for (const id of covered) {
    const snaps = snapshotsByAccount.get(id).snaps;
    const proofs = [];
    for (let i = 1; i < snaps.length; i++) {
      const proof = proveLink(id, snaps[i - 1], snaps[i]);
      proofs.push({ from: snaps[i - 1].date, to: snaps[i].date, ...proof });
      // A PRINTED TOTAL THE DATED RECORD DOES NOT CARRY is named, never dated:
      // the series nets it inside the step, and a rate that needs every flow on
      // a day cannot, so it says what it is missing (VD-25).
      if (proof.basis === "printed-totals" && (accountCashFlows[id] ?? []).length) {
        const dated = r2(datedIn(id, snaps[i - 1].date, snaps[i].date));
        if (Math.abs(dated - proof.net) > 1) {
          undatedCapital.push({
            accountId: id, from: snaps[i - 1].date, to: snaps[i].date,
            printedNet: proof.net, datedNet: dated, undated: r2(proof.net - dated), evidence: proof.evidence,
          });
        }
      }
    }
    const bases = new Set(proofs.map((p) => p.basis));
    flowBasis[id] = {
      basis: bases.has("unproven") ? "unreported"
        : bases.size === 1 && bases.has("units-unchanged") ? "units-unchanged" : "reported",
      proofs,
    };
  }

  const navHistory = [];
  let prevDate = null;
  for (const d of dates) {
    /** The whole marked panel — climbs while accounts are still arriving. */
    const nav = navAt(covered, d);
    const present = covered.filter((id) => at(id, d));
    const onDate = present.filter((id) => at(id, d).date === d).length;

    /**
     * THE LINK — struck over the accounts valued at BOTH ends of this interval.
     *
     * Before the panel is complete this is a strict subset of `present`, and
     * that subsetting is the whole of why the series can now start 40 days
     * earlier: an account that first publishes on `d` is not in `common`, so
     * its arrival moves `linkClose` and `linkOpen` by nothing at all. From
     * `panelCompleteFrom` onwards `common` IS the whole panel and `linkClose`
     * equals `nav` to the rupee — asserted in `navSeries.test.ts`, because two
     * constructions of one figure that are meant to coincide are exactly where
     * a silent divergence lives.
     */
    const common = prevDate ? present.filter((id) => at(id, prevDate)) : [];
    const linkOpen = prevDate ? navAt(common, prevDate) : null;
    const linkClose = prevDate ? navAt(common, d) : null;

    /** Rule 4 — net external capital IN, attributed on each account's own clock. */
    let flowIn = 0;
    let flowUnknownValue = 0;
    for (const id of common) {
      const snap = at(id, d);
      const was = at(id, prevDate);
      // This account's mark MOVED in this interval — so the capital its own
      // statements show moving since that earlier mark is what this interval's
      // change contains.
      if (was.date === snap.date) continue;
      const proof = flowBasis[id].proofs.find((x) => x.from === was.date && x.to === snap.date);
      if (proof && proof.basis !== "unproven") flowIn += proof.net;
      // What an unproven step cannot show to be performance is its MOVE.
      else flowUnknownValue += Math.abs(snap.marketValue - was.marketValue);
    }

    const point = {
      period: d,
      date: d,
      nav: r2(nav),
      accountsOnDate: onDate,
      accountsCarried: present.length - onDate,
      /** Net external capital in since the previous point, on each account's own clock. */
      flowIn: prevDate ? r2(flowIn) : 0,
      /** The move, in this interval, of accounts whose capital movement no statement establishes. */
      unreportedFlowValue: prevDate ? r2(flowUnknownValue) : 0,
      linkOpen: linkOpen === null ? null : r2(linkOpen),
      linkClose: linkClose === null ? null : r2(linkClose),
      linkAccounts: common.length,
      panelComplete: d >= panelCompleteFrom,
    };
    navHistory.push(point);
    prevDate = d;
  }

  const spanDays = Math.round((Date.parse(dates.at(-1)) - Date.parse(dates[0])) / 86400000);
  notes.push(`navHistory: ${navHistory.length} dated point(s) from ${dates[0]} to ${dates.at(-1)} (${spanDays} days), `
    + `over the ${covered.length} account(s) that publish MORE THAN ONE dated valuation `
    + `(₹${(navHistory.at(-1).nav / 1e7).toFixed(2)} Cr at the last point, each dedupeGroup counted once). `
    + `${single.length} account(s) publish exactly one dated valuation and ${unvalued.length} publish none — `
    + "both are named in the coverage block rather than carried into the series as a flat line, "
    + "which would drag its return towards a figure nothing measured. "
    + `The panel is complete from ${panelCompleteFrom}; before that each link is struck over the accounts valued at `
    + "BOTH its ends, so an account ARRIVING contributes 0.00% instead of a step. The raw NAV level is only a book "
    + "NAV from the date the panel completes, and is flagged per point.");
  // HOW EACH ACCOUNT'S STEPS ARE PROVEN — printed even when every one is, so a
  // run where the proof quietly stopped reaching an account says so.
  const byProof = new Map();
  for (const id of covered) {
    for (const x of flowBasis[id].proofs) {
      const k = x.basis === "printed-totals" ? `printed totals (${x.evidence.join(", ")})` : x.basis;
      (byProof.get(k) ?? byProof.set(k, new Set()).get(k)).add(id);
    }
  }
  notes.push(`navHistory: the capital moving between each covered account's marks is established by the statements `
    + "themselves — "
    + [...byProof.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([k, ids]) => `${k}: ${[...ids].sort().join(", ")}`).join("; ")
    + ". A step no statement settles is netted at nothing and its MOVE is carried as `unreportedFlowValue`.");
  const unreported = covered.filter((id) => flowBasis[id].basis === "unreported");
  if (unreported.length) {
    for (const id of unreported) {
      for (const x of flowBasis[id].proofs.filter((y) => y.basis === "unproven")) {
        notes.push(`navHistory: ${id} ${x.from} → ${x.to} is NOT PROVEN to be performance — ${x.why}. `
          + "Its move over the step is named on screen as the part of the return that might be capital.");
      }
    }
  }
  for (const u of undatedCapital) {
    notes.push(`account ${u.accountId}: its printed capital totals (${u.evidence.join(", ")}) move by ${u.printedNet} `
      + `between ${u.from} and ${u.to} and its dated record carries ${u.datedNet} over the same days — `
      + `${u.undated} moved on a day no statement in this drop prints. The NAV series nets it inside that step, which `
      + "needs no date; the money-weighted return cannot, and names it rather than assuming a day.");
  }

  return {
    navHistory,
    accountNavHistory,
    undatedCapital,
    coverage: {
      covered: covered.map((id) => ({
        accountId: id,
        points: snapshotsByAccount.get(id).snaps.length,
        first: snapshotsByAccount.get(id).snaps[0].date,
        last: snapshotsByAccount.get(id).snaps.at(-1).date,
        latestValue: r2(snapshotsByAccount.get(id).snaps.at(-1).marketValue),
        bookValue: r2(bookValueOf.get(id) ?? 0),
        flowBasis: flowBasis[id].basis,
      })),
      single: single.map((s) => ({ ...s, bookValue: r2(bookValueOf.get(s.accountId) ?? 0) })),
      unvalued: unvalued.map((u) => ({ ...u, bookValue: r2(bookValueOf.get(u.accountId) ?? 0) })),
      from: dates[0],
      to: dates.at(-1),
      panelCompleteFrom,
    },
    // Handed on so `attributionFrom` reads the SAME authoritative document per
    // account per date that the series does. Two selections of "which statement
    // is the mark at this date" would be two chances for the bridge to
    // reconcile to a NAV point the chart never drew.
    snapshotsByAccount,
  };
}


/**
 * ── RETURN ATTRIBUTION OVER A DATED WINDOW ──────────────────────────────────
 *
 * *"What was the attribution to those returns? So what did the benchmark do?
 * What did I do? … which were the biggest detractors of returns?"*
 *
 * The archive has carried the answer for five deliveries and nothing read it.
 * SIXTEEN accounts publish a VALUED holdings statement at two or more dates, and
 * those statements are PER HOLDING — Goldstandard prints 32 rows at 10 July and
 * 32 again at 11 August, SVAN 46 rows at three month-ends, Green Lantern 34 at
 * two. Measured: 273 holdings are priced at BOTH ends of a window, over
 * ₹128.05 Cr → ₹141.96 Cr. That is the seventh absence in this book recorded
 * against a premise nobody rechecked, after FRED, the RBI, the release calendar,
 * the ISIN tier, the NAV series itself and 3P's redemption on page 2.
 *
 * ── THE SPLIT IS EXACT, AND THAT IS THE WHOLE LICENCE FOR PUBLISHING IT ─────
 *
 * A statement's market value is quantity × price wherever it prints a price —
 * rule 3, and MEASURED here rather than assumed: of 794 valued rows across the
 * archive's holdings documents, 765 carry both and every one satisfies the
 * identity to the paisa, 0 do not, and the other 29 carry no price at all. So
 * for a holding priced at both ends
 *
 *   v₁ − v₀  =  q₀·(p₁ − p₀)  +  (q₁ − q₀)·p₁
 *               └─ PRICE ──┘      └── TRADING ──┘
 *
 * with NO RESIDUAL. Nothing is apportioned, smoothed or fitted; both terms are
 * arithmetic on four printed primitives. `priceEffect` is what the units held at
 * the start earned, which is the only term that is performance — and it is the
 * term the detractor ranking is struck on.
 *
 * ── FOUR TERMS, BECAUSE TWO WOULD HIDE THE LARGEST MOVEMENT IN THIS BOOK ────
 *
 * A holding that ENTERED the window contributes its whole closing value and one
 * that EXITED its whole opening value. Folding either into `tradeEffect` would
 * be defensible arithmetic and a bad answer: V.E.C 128005 runs ₹9.24 Cr →
 * ₹20.29 Cr over its window, +119%, and essentially all of it is the ₹11.24 Cr
 * of Fund Deposits `accountXirr.test.ts` already gates that account for. Split
 * out, the bridge SHOWS that as capital rather than letting it sit inside a
 * performance term. Same failure the flow adjustment already avoids one card up,
 * arriving through a decomposition instead of an index.
 *
 * ── AND A ROW WITHOUT A PRICE IS ITS OWN TERM, NEVER ZERO ───────────────────
 *
 * Cash sleeves and AIF units marked at a total value carry no per-unit price, so
 * no price/trading split exists for them. Their change lands in
 * `undecomposedValue` and is NAMED. Assigning it to `priceEffect` would put
 * money nobody measured into the one figure a reader acts on.
 *
 * ── WHAT IT COVERS, AND WHY EACH ACCOUNT KEEPS ITS OWN WINDOW ───────────────
 *
 * The statements do not share report dates — Green Lantern's pair is 25 June to
 * 27 July, Carnelian's 10 July to 10 August, SVAN's 31 May to 31 July. Forcing
 * one window would either discard accounts or credit an account with weeks of
 * standing still, which is `pooledXirr`'s own finding (5.44 pp on a quarter).
 * So each account is decomposed over ITS OWN first and last valued statement,
 * the span of all of them is reported, and every per-holding row carries the two
 * dates it was struck between.
 *
 * RULE 3 APPLIES HERE TOO. 360 ONE Special Opportunities is reported under both
 * CRNs and both are covered, so one `dedupeGroup` is counted once — at its
 * LATEST-DATED row, the same tie-break `navAt` uses. Counting both would put
 * ₹1.46 Cr of one holding into the bridge twice and would rank a phantom
 * contributor.
 */
function attributionFrom(snapshotsByAccount, positions, notes) {
  /**
   * THE COVERAGE FRACTION IS ON THE BOOK'S OWN BASIS, WHICH IS DEDUPED.
   *
   * A raw sum over `positions` reads ₹713.56 Cr against the ₹710.39 Cr the
   * reader sees at the top of the page, because the 360 ONE holding is reported
   * under two CRNs. Both are covered here, so the same ₹1.46 Cr would inflate
   * the numerator AND the denominator of "how much of the book does this
   * window cover" — a figure whose only job is to be checked against the
   * headline. First member wins, exactly as `dedupedPositions` does in the app
   * and `totalValue` does 1,400 lines below.
   */
  const seen = new Set();
  let bookValue = 0;
  const bookValueByAccount = new Map();
  for (const p of positions) {
    if (!isNum(p.marketValue)) continue;
    if (p.dedupeGroup) { if (seen.has(p.dedupeGroup)) continue; seen.add(p.dedupeGroup); }
    bookValue += p.marketValue;
    bookValueByAccount.set(p.accountId, (bookValueByAccount.get(p.accountId) ?? 0) + p.marketValue);
  }
  const accounts = [];
  const rows = [];
  /** Rule 3 — a dedupeGroup contributes to the bridge once, at its later row. */
  const groupOwner = new Map();
  for (const [accountId, { snaps }] of [...snapshotsByAccount.entries()].sort()) {
    const last = snaps.at(-1);
    for (const row of last.rows) {
      if (!row.dedupeGroup) continue;
      const cur = groupOwner.get(row.dedupeGroup);
      if (!cur || last.date > cur.date || (last.date === cur.date && accountId < cur.accountId)) {
        groupOwner.set(row.dedupeGroup, { date: last.date, accountId });
      }
    }
  }
  const counts = (accountId, row) =>
    !row.dedupeGroup || groupOwner.get(row.dedupeGroup)?.accountId === accountId;

  for (const [accountId, { snaps }] of [...snapshotsByAccount.entries()].sort()) {
    if (snaps.length < 2) continue;
    const a = snaps[0];
    const b = snaps.at(-1);
    const A = new Map(a.rows.filter((r) => counts(accountId, r)).map((r) => [r.securityKey, r]));
    const B = new Map(b.rows.filter((r) => counts(accountId, r)).map((r) => [r.securityKey, r]));

    let priceEffect = 0, tradeEffect = 0, enteredValue = 0, exitedValue = 0, undecomposedValue = 0;
    let rowsHeld = 0, rowsEntered = 0, rowsExited = 0, rowsUnpriced = 0;

    for (const [key, r1] of B) {
      const r0 = A.get(key);
      const base = {
        securityKey: key,
        security: r1.security,
        accountId,
        from: a.date,
        to: b.date,
        openValue: r0 ? r2(r0.marketValue) : null,
        closeValue: r2(r1.marketValue),
        openPrice: r0 && r0.marketPrice !== null ? r0.marketPrice : null,
        closePrice: r1.marketPrice,
        openQty: r0 && r0.quantity !== null ? r0.quantity : null,
        closeQty: r1.quantity,
      };
      if (!r0) {
        enteredValue += r1.marketValue;
        rowsEntered++;
        rows.push({ ...base, kind: "entered", priceEffect: null, tradeEffect: null, returnPct: null });
        continue;
      }
      const priced = r0.marketPrice !== null && r1.marketPrice !== null
        && r0.quantity !== null && r1.quantity !== null;
      if (!priced) {
        undecomposedValue += r1.marketValue - r0.marketValue;
        rowsUnpriced++;
        rows.push({ ...base, kind: "unpriced", priceEffect: null, tradeEffect: null, returnPct: null });
        continue;
      }
      const pe = r0.quantity * (r1.marketPrice - r0.marketPrice);
      const te = (r1.quantity - r0.quantity) * r1.marketPrice;
      priceEffect += pe;
      tradeEffect += te;
      rowsHeld++;
      rows.push({
        ...base,
        kind: "held",
        priceEffect: r2(pe),
        tradeEffect: r2(te),
        returnPct: r0.marketValue > 0 ? r4((pe / r0.marketValue) * 100) : null,
      });
    }
    for (const [key, r0] of A) {
      if (B.has(key)) continue;
      exitedValue += r0.marketValue;
      rowsExited++;
      rows.push({
        securityKey: key,
        security: r0.security,
        accountId,
        from: a.date,
        to: b.date,
        openValue: r2(r0.marketValue),
        closeValue: null,
        openPrice: r0.marketPrice,
        closePrice: null,
        openQty: r0.quantity,
        closeQty: null,
        kind: "exited",
        priceEffect: null,
        tradeEffect: null,
        returnPct: null,
      });
    }

    const openValue = sum([...A.values()].map((r) => r.marketValue));
    const closeValue = sum([...B.values()].map((r) => r.marketValue));
    /**
     * THE BRIDGE MUST TIE, AND IT IS CHECKED HERE RATHER THAN HOPED FOR.
     *
     * open + price + trading + entered − exited + undecomposed = close, exactly,
     * because every term is arithmetic on the same printed primitives. A gap
     * above a rupee means a row was classified into two terms or none, so the
     * ACCOUNT is dropped and NAMED rather than published with a bridge that
     * does not add up — `hdfcNsdl.mjs`'s licence, applied to a decomposition.
     */
    const bridged = openValue + priceEffect + tradeEffect + enteredValue - exitedValue + undecomposedValue;
    if (Math.abs(bridged - closeValue) > 1) {
      notes.push(`attribution: ${accountId} is NOT published — its bridge misses by `
        + `${(bridged - closeValue).toFixed(2)} over ${a.date} → ${b.date}, so a row landed in two terms or in `
        + "none. Every term is arithmetic on printed primitives, so a gap is a defect and not a rounding.");
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].accountId === accountId) rows.splice(i, 1);
      continue;
    }
    accounts.push({
      accountId,
      from: a.date,
      to: b.date,
      days: Math.round((Date.parse(b.date) - Date.parse(a.date)) / 86400000),
      openValue: r2(openValue),
      closeValue: r2(closeValue),
      priceEffect: r2(priceEffect),
      tradeEffect: r2(tradeEffect),
      enteredValue: r2(enteredValue),
      exitedValue: r2(exitedValue),
      undecomposedValue: r2(undecomposedValue),
      rowsHeld, rowsEntered, rowsExited, rowsUnpriced,
    });
  }

  if (!accounts.length) {
    notes.push("attribution is EMPTY: no account in this archive publishes a valued holdings statement at two "
      + "dates, so no holding is priced at both ends of a window and no contribution is measurable.");
    return {
      from: null, to: null, openValue: 0, closeValue: 0, priceEffect: 0, tradeEffect: 0,
      enteredValue: 0, exitedValue: 0, undecomposedValue: 0,
      bookValue: r2(bookValue), coveredBookValue: 0, accounts: [], rows: [],
    };
  }

  const t = (f) => r2(sum(accounts.map((x) => x[f])));
  const out = {
    from: accounts.map((x) => x.from).sort()[0],
    to: accounts.map((x) => x.to).sort().at(-1),
    openValue: t("openValue"),
    closeValue: t("closeValue"),
    priceEffect: t("priceEffect"),
    tradeEffect: t("tradeEffect"),
    enteredValue: t("enteredValue"),
    exitedValue: t("exitedValue"),
    undecomposedValue: t("undecomposedValue"),
    bookValue: r2(bookValue),
    coveredBookValue: r2(sum(accounts.map((x) => bookValueByAccount.get(x.accountId) ?? 0))),
    accounts,
    // Sorted by the term the ranking is struck on, so the emitted file is stable
    // and a page can take the head and the tail without re-sorting the book.
    rows: rows.sort((x, y) =>
      (y.priceEffect ?? -Infinity) - (x.priceEffect ?? -Infinity)
      || x.accountId.localeCompare(y.accountId)
      || x.securityKey.localeCompare(y.securityKey)),
  };
  const worst = out.rows.filter((r) => r.kind === "held").at(-1);
  notes.push(`attribution: ${accounts.length} account(s) publish a valued holdings statement at two or more dates, `
    + `so ${out.rows.filter((r) => r.kind === "held").length} holding(s) are priced at both ends of a window. `
    + `Over ${out.from} → ${out.to} the covered set runs ₹${(out.openValue / 1e7).toFixed(2)} Cr → `
    + `₹${(out.closeValue / 1e7).toFixed(2)} Cr, of which price ₹${(out.priceEffect / 1e7).toFixed(2)} Cr, `
    + `trading ₹${(out.tradeEffect / 1e7).toFixed(2)} Cr, bought in ₹${(out.enteredValue / 1e7).toFixed(2)} Cr, `
    + `sold out ₹${(out.exitedValue / 1e7).toFixed(2)} Cr. `
    + (worst ? `Largest detractor ${worst.security} ₹${(worst.priceEffect / 1e5).toFixed(2)} L. ` : "")
    + `It covers ₹${(out.coveredBookValue / 1e7).toFixed(2)} Cr of the book's ₹${(out.bookValue / 1e7).toFixed(2)} Cr; `
    + "every other account publishes one statement, and one statement is a level rather than a change.");
  return out;
}

// ── The family's own dated investments ───────────────────────────────────────
//
// *"in transactions we need to see the transactions we have done, not what the
// transactions the portfolio manager has done."*
//
// The archive carries both, in two different collections, and only one of them
// was ever read. `transactions` is the manager working a mandate — Green Lantern
// buying The Anup Engineering on fifty days. `cashFlows` typed `contribution` or
// `withdrawal` is the family putting money IN and taking it OUT, which is the
// decision they actually made. Measured over the archive: 20 contributions
// across 9 accounts and 94 withdrawals across 3.
//
// ── THE AMOUNT COLUMN IS A RUNNING BALANCE ON THE ROW THAT CARRIES THE UNITS ──
//
// Sanshi prints a contribution as THREE rows on one date, and the third is a
// cumulative total rather than a movement:
//
//   17-06-2025  Drawdown                                       1,00,00,000.00
//   17-06-2025  Stamp Duty @ 0.005%                                  (499.98)
//   17-06-2025  Units Allotment  109.4462  91,364.524  1,91,359.524  1,99,98,999.97
//
// That last figure is the statement's own `Balance Amount` column — ₹1 Cr paid
// in June on top of ₹1 Cr paid in March. Summing the rows typed `contribution`
// would report ₹22 Cr of investment into an account that received ₹11 Cr, and
// the row LOOKS like the others: same kind, same date, a plausible rupee figure.
//
// So a move's `amount` is taken from the GROSS row the statement prints on that
// date, which is a primitive and needs no arithmetic, and `invested` is that
// less the same date's printed charges. The balance is then the INDEPENDENT
// CHECK rather than the source: the running total of `invested` must reproduce
// the last printed balance. Three things agree on this corpus and each was
// measured before a line of this was written —
//
//   Σ invested            = the position's own costBasis, TO THE PAISA
//   Σ invested            = the last printed Balance Amount, within ₹0.04
//   invested ÷ units      = the Allotment NAV the statement prints to 4dp
//
// Where a date carries an allotment row and NO gross row the amount is
// unambiguous only if the account has exactly ONE such row, because a balance
// after a single contribution IS that contribution. With several and no gross
// figure to check against, `amount` is null and says so — differencing a
// sequence that might not be cumulative is how the ₹22 Cr above gets invented.
const CAPITAL_KINDS = new Set(["contribution", "withdrawal"]);

/**
 * ── DOES THIS ACCOUNT'S CAPITAL RECORD START AT INCEPTION? ──────────────────
 *
 *   *"how can net invested be negative?"* — 3P, whose record could not carry a
 *   return at all, because nothing said its list of purchases was the whole of
 *   them.
 *
 * A fund statement that prints a RUNNING UNIT BALANCE beside each allotment
 * answers the question itself: where a class's EARLIEST row allots exactly the
 * units its printed balance then stands at, the balance was ZERO before it — the
 * record begins where the holding does. 3P prints it on every row of every class
 * (its reader refuses the table unless the running total reproduces every printed
 * balance), and so does Sanshi.
 *
 * A SERIES NAMED FOR THE DAY IT WAS ISSUED ANSWERS IT ANOTHER WAY. ASK's
 * statement prints no running balance; it names each series for its issue date
 * (`Class A6 Series 31/01/2025`, carried as `seriesIssued`). A class's earliest
 * row that is a contribution dated ON that day is the first allotment the series
 * can have had — nothing of it existed the day before — so its balance was zero
 * before it, which is the same fact 3P's printed balance states. Both folios
 * the September 2026 delivery brings start that way, each allotting its first
 * units at ₹1,000.00 apiece, and the reader will not publish the table unless
 * its units run to the Account Summary's own printed balance.
 *
 * STRUCK PER CLASS AND REQUIRED OF EVERY ONE. A single class that begins
 * mid-stream would leave some purchase unrecorded, so every contribution row must
 * carry a security, units and one of the two pieces of evidence, and every
 * class's first row must start from zero: within half the last printed decimal
 * of its printed balance, or on its series' own issue date. Anything less is not
 * evidence and the account is not listed — the caller then falls back to the
 * other two tests, and failing those, withholds the return with the reason.
 */
function capitalRecordFromInception(cashFlows) {
  const rows = (cashFlows ?? []).filter((c) => c.date && CAPITAL_KINDS.has(c.kind));
  const ins = rows.filter((c) => c.kind === "contribution");
  if (!ins.length) return false;
  const evidenced = (c) => isNum(c.balance) || !!c.seriesIssued;
  if (!ins.every((c) => c.securityKey && isNum(c.units) && evidenced(c))) return false;
  const first = new Map();
  for (const c of [...rows].filter((r) => r.securityKey && isNum(r.units) && evidenced(r)).sort((a, b) => a.date.localeCompare(b.date))) {
    if (!first.has(c.securityKey)) first.set(c.securityKey, c);
  }
  return [...first.values()].every((c) => c.kind === "contribution" && (isNum(c.balance)
    ? Math.abs(Math.abs(c.balance) - Math.abs(c.units)) <= UNIT_TIE
    : c.date === c.seriesIssued));
}

function capitalMovesFrom(cashFlows, accountId, notes, label) {
  const all = cashFlows ?? [];
  const rows = all.filter((c) => c.date && CAPITAL_KINDS.has(c.kind));
  if (!rows.length) return [];

  // Charges the SAME statement levies on the SAME date. Read from its own
  // collection — never a rate applied to the gross, which would be our
  // arithmetic standing in for the fund's.
  const chargeOn = new Map();
  for (const c of all) {
    if (c.kind !== "expense" || !c.date || !isNum(c.amount)) continue;
    chargeOn.set(c.date, (chargeOn.get(c.date) ?? 0) + Math.abs(c.amount));
  }

  // A SELF-CONTAINED ROW PRINTS ITS OWN NET AND THEREFORE CANNOT BE A RUNNING
  // BALANCE — a cumulative figure has no per-row charge to be net of. Sanshi
  // prints the gross, the stamp duty and the allotment on THREE lines and its
  // allotment row's amount IS the running total; 3P prints Contribution Amount,
  // Stamp Duty and Amount Invested on ONE line, and its reader will not publish
  // the table unless the three tie to the paisa. So the ambiguity below is a
  // fact about a LAYOUT, and the layout declares which it is (`netAmount`)
  // instead of this function inferring it from whether a row happens to carry
  // units — which would have made every 3P subscription an unusable balance.
  const selfContained = (r) => isNum(r.netAmount);
  const allotments = rows.filter((r) => r.kind === "contribution" && isNum(r.units) && !selfContained(r));
  const soleAllotment = allotments.length === 1;

  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }

  const moves = [];
  for (const date of [...byDate.keys()].sort()) {
    const day = byDate.get(date);
    const contribs = day.filter((r) => r.kind === "contribution");
    const self = contribs.filter(selfContained);
    const allot = contribs.filter((r) => isNum(r.units) && !selfContained(r));
    const gross = contribs.filter((r) => !isNum(r.units) && !selfContained(r));
    const out = day.filter((r) => r.kind === "withdrawal");

    if (contribs.length) {
      // A self-contained row carries both halves itself. Otherwise the gross row
      // first, because it is a MOVEMENT; the allotment row's amount is only
      // usable where it cannot be a running balance.
      let amount = self.length ? sum(self.map((r) => r.amount ?? 0))
        : gross.length ? sum(gross.map((r) => r.amount ?? 0))
        : null;
      if (amount === null && allot.length && soleAllotment && isNum(allot[0].amount)) {
        amount = allot[0].amount;
      }
      const withUnits = [...self, ...allot].filter((r) => isNum(r.units));
      const units = withUnits.length ? sum(withUnits.map((r) => r.units)) : null;
      const charge = chargeOn.get(date) ?? 0;
      if (amount === null && allot.length) {
        notes.push(`${label}: the ${date} contribution prints a running balance and no gross `
          + `figure, so what moved on that date is not stated — units are carried and the amount is not`);
      }
      const named = withUnits.find((r) => r.securityKey) ?? contribs.find((r) => r.securityKey) ?? null;
      moves.push({
        accountId, date, direction: "in",
        label: (self[0] ?? gross[0] ?? allot[0]).description ?? "Contribution",
        amount: r2(amount),
        // The gross row is what left the bank; the charge is what the fund took
        // out of it before buying units. A self-contained row prints that net
        // itself, so it is TAKEN rather than derived — the statement's own
        // figure beats our subtraction, and its reader has already checked the
        // two agree.
        invested: self.length ? r2(sum(self.map((r) => r.netAmount)))
          : amount === null ? null
          : r2(amount - (gross.length ? charge : 0)),
        /**
         * THE CHARGES THE STATEMENT PRINTS AGAINST THIS CONTRIBUTION (VD-24) —
         * Sanshi's stamp-duty rows on the same date, or the setup expense and
         * stamp duty a self-contained row prints beside its own net (3P). What
         * the family PAID is `invested + charges`; `invested` stays what bought
         * units, which is what the Transactions card's hover names. NULL where
         * the row prints a net and no charge line (Buoyant's reinvested
         * distribution), and for a running-balance day with no gross row, where
         * no charge can be tied to what moved.
         */
        charges: self.length
          ? (self.some((r) => isNum(r.expenses)) ? r2(sum(self.map((r) => (isNum(r.expenses) ? r.expenses : 0)))) : null)
          : amount === null || !gross.length ? null
          : r2(charge),
        units: units === null ? null : units,
        security: named?.security ?? null,
        securityKey: named?.securityKey ?? null,
      });
    }
    if (out.length) {
      const amount = Math.abs(sum(out.map((r) => r.amount ?? 0)));
      // WHICH HOLDING THE MONEY CAME OUT OF, where the statement says. A capital
      // register names no security and keeps its null; a fund redemption names
      // the class it redeemed, and the family's transactions table is the one
      // surface where "3P, Full Units Redemption" answers the question they
      // actually asked.
      const namedOut = out.find((r) => r.securityKey) ?? null;
      const unitsOut = out.filter((r) => isNum(r.units));
      moves.push({
        accountId, date, direction: "out",
        label: out[0].description ?? "Withdrawal",
        amount: r2(amount), invested: null,
        units: unitsOut.length ? -Math.abs(sum(unitsOut.map((r) => r.units))) : null,
        security: namedOut?.security ?? null,
        securityKey: namedOut?.securityKey ?? null,
      });
    }
  }

  // THE BALANCE IS THE WITNESS, AND A FAILED WITNESS WITHHOLDS THE WHOLE
  // ACCOUNT. Reproducing the statement's own last Balance Amount is the only
  // independent evidence that the gross rows were paired to the right dates and
  // that none was missed. ±₹1 is this book's own settlement tolerance; the
  // observed residual is ₹0.04, and a dropped or double-counted contribution
  // moves the figure by crores.
  const lastBalance = allotments.length && !soleAllotment ? allotments.at(-1).amount : null;
  if (isNum(lastBalance)) {
    const running = sum(moves.filter((m) => m.direction === "in" && isNum(m.invested)).map((m) => m.invested));
    if (Math.abs(running - lastBalance) > 1) {
      notes.push(`${label}: dated contributions sum to ${r2(running)} against the statement's own `
        + `closing balance of ${r2(lastBalance)} — the per-contribution breakdown is withheld rather `
        + `than published against a figure it does not reproduce`);
      return moves.map((m) => ({ ...m, units: null, securityKey: null, security: null }));
    }
  }
  return moves;
}


/**
 * ── THE FAMILY'S DATED CAPITAL IS PRINTED IN THREE PLACES, AND THIS READ ONE ──
 *
 * `capitalMovesFrom` reads the rows a statement TYPES as a contribution or a
 * withdrawal. Two more records carry the family's dated capital:
 *
 *   · the DATED CAPITAL CALLS a drawdown fund prints (Stage 10ay) — India SME
 *     ×3, Sky Capital ×4, Baring, Carnelian Bharat Amritkaal, Delphi and both
 *     Founders folios. THESE ARE DELIBERATELY NOT MERGED HERE. They reach the
 *     Transactions card at display time through `capitalMovesWithCalls` in
 *     `src/lib/tranches.ts` (Stage 10cd), which adds them ONLY for an account
 *     with no record of its own, marks them `fromCall`, and leaves `invested`
 *     null because what bought units after the fund's charges is not printed
 *     per call. Merged here they would turn every drawdown fund into a
 *     "record" account — so `recordShortfall` would refuse its return against a
 *     record-end no capital document states, its payouts would be treated as a
 *     recorded fund's, and each call would carry an `invested` no statement
 *     prints. One place joins the calls, and it is that one.
 *   · a CAPITAL REGISTER's movements — V.E.C 128005's ₹10.65 Cr and ₹59 L Fund
 *     Deposits of 28 and 29 July, which the XIRR has always netted and this
 *     record never listed, and Green Lantern 510861's July TDS (₹6,350), which
 *     is exactly the gap Stage 10cf found between its quarterly record and its
 *     27 July value. Those are merged here.
 *
 * FOUR RULES, each a wrong record avoided:
 *
 * 1. A PAYMENT TWO DOCUMENTS BOTH PRINT IS ONE PAYMENT. A register is
 *    aggregated per date and direction FIRST, because `capitalMovesFrom` is:
 *    Green Lantern 510861's register prints two TDS rows on 2 April (₹1,339 and
 *    ₹2,708) that its investor report prints as one ₹4,047 outflow. A register
 *    movement on the same account, date and direction as a typed row, within
 *    ₹1, is that payment printed again and is not added.
 * 2. A REGISTER IS MERGED ONLY WHERE ITS OWN PRINTED BALANCES WITNESS IT: its
 *    movements must carry its own Opening Balance to its own last printed
 *    balance, to the rupee. A register that does not reproduce its balance is
 *    withheld whole and named — a partial list reads exactly like a complete
 *    one.
 * 3. A CLASS SWITCH IS NOT CAPITAL. Buoyant 103473's register prints its 1 June
 *    switch as "Security in" and "Security out" of ₹22.53 Cr. The fund's own
 *    reclassification record witnesses it — same account, same date, same
 *    rupees — so neither leg is money moving and neither is listed.
 * 4. A REGISTER WHOSE ONLY MOVEMENTS ARE WITHDRAWALS, FOR AN ACCOUNT WITH NO
 *    OTHER DATED CAPITAL, IS NOT LISTED. Goldstandard's, V.E.C 128004's and
 *    Green Lantern 510854's registers carry nothing but TDS transfers out of
 *    accounts funded before the register's window opened. Listed alone they
 *    would present an account the family put crores into as one nothing was
 *    paid into. They stay in `BOOK_ACCOUNT_CASH_FLOWS`, where the XIRR and the
 *    NAV chain net them, and each is named in the notes. (A bank book's
 *    Dep/With column is not merged HERE: its running balance moves with every
 *    trade, so nothing on the page witnesses that column alone — Carnelian's is
 *    a single TDS row, which rule 4 would hold back anyway. A bank book is
 *    merged only where a SECOND document of the same account witnesses it, its
 *    profit-and-loss account's capital lines — see `bankBookCapitalWitnessed`.)
 *
 * Returns the moves to add and `witnessedTo` — the latest date a register whose
 * balances tie reaches, where the account's record includes it. That is how far
 * the combined record provably runs (`Account.capitalRecordTo`): a register that
 * walks its own opening balance to its closing one says nothing else moved
 * through its date, whether or not its rows were already on the typed record.
 * A held-back register (rule 4) reaches nothing, because the account then has no
 * record for it to extend — and a register that OPENS after the typed record
 * ends reaches nothing either, because the days between the two are covered by
 * neither and a reach claimed across them would hide exactly the gap
 * `recordShortfall` exists to name. `existing` is this account's typed record
 * and `typedReach` how far it runs on its own (the `capitalRecordTo` main's
 * Stage 10cf computes from the documents carrying a typed payment row).
 */
function datedCapitalElsewhere({ accountId, allIssues, existing, typedReach, valueDate = null, reclassificationsHere, notes, label }) {
  const out = [];
  const same = (m, date, direction, amount) => m.date === date && m.direction === direction
    && isNum(m.amount) && Math.abs(m.amount - amount) <= 1;
  const already = (date, direction, amount) =>
    existing.some((m) => same(m, date, direction, amount)) || out.some((m) => same(m, date, direction, amount));
  const clash = (date, direction) => existing.find((m) => m.date === date && m.direction === direction) ?? null;

  // ── the capital register, witnessed by its own opening and closing balance ──
  const rows = [];
  const seenRow = new Set();
  const witnessed = [];
  for (const d of allIssues.filter((x) => x.reportType === "capital-register")) {
    const reg = (d.cashFlows ?? []).filter((c) => c.kind === "capital-register" && c.date);
    const printedOpen = reg.find((c) => /^opening balance/i.test(c.description ?? "") && isNum(c.balance));
    /**
     * A REGISTER FROM INCEPTION PRINTS NO OPENING BALANCE ROW — it opens from nil.
     * Green Lantern 510861's since-inception register (the `october-2026`
     * delivery) starts on its ₹10 Cr Corpus Deposit with a balance of exactly
     * that deposit. Where the first row's balance IS its own amount, the register
     * opened at nil on that row's date, and the walk below holds every row to it.
     */
    const first = printedOpen ? null : reg.find((c) => isNum(c.balance) && isNum(c.amount));
    const fromNil = first && Math.abs(first.balance - first.amount) <= 1 ? first : null;
    const open = printedOpen ?? (fromNil ? { date: fromNil.date, balance: 0 } : null);
    const last = [...reg].reverse().find((c) => isNum(c.balance));
    const moves = reg.filter((c) => c !== printedOpen && isNum(c.amount) && c.amount !== 0);
    if (!moves.length) continue;
    if (!open || !last) {
      notes.push(`${label}: the ${d.asOf} capital register prints no opening balance and does not open from nil, so `
        + "nothing witnesses its movements and they are not listed as dated capital");
      continue;
    }
    const gap = last.balance - open.balance - sum(moves.map((c) => c.amount));
    if (Math.abs(gap) > 1) {
      notes.push(`${label}: the ${d.asOf} capital register's movements do not carry its opening balance `
        + `(${open.balance}) to its closing one (${last.balance}) — ${r2(gap)} unaccounted — so they are withheld`);
      continue;
    }
    // CONTIGUOUS WITH THE TYPED RECORD, OR THE REACH IS NOT CLAIMED: the register's
    // own Opening Balance date is where its window starts, and the typed record
    // must run at least to the day before it.
    const opens = open.date;
    const dayBefore = opens ? new Date(Date.parse(`${opens}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) : null;
    const contiguous = !existing.length || (!!typedReach && !!dayBefore && typedReach >= dayBefore);
    /**
     * …AND ONLY UP TO THE DATE THE ACCOUNT'S VALUE IS STRUCK. A dated capital
     * record is set against the account's value on its own statement date
     * (`capitalRollup`), so a movement after that date is not yet in the value it
     * would be set against, and listing it books it against the wrong figure.
     * 510861's since-inception register runs to 22 September while its holdings
     * are struck on 27 July: the eleven TDS rows between are named, not listed,
     * and the record is said to reach 27 July — which the register's unbroken
     * walk witnesses, since it passes through that date.
     */
    const reach = valueDate && d.asOf && d.asOf > valueDate ? valueDate : d.asOf;
    if (reach && contiguous) witnessed.push(reach);
    const late = valueDate ? moves.filter((c) => c.date > valueDate) : [];
    if (late.length) {
      notes.push(`${label}: the ${d.asOf} capital register's ${late.length} movement(s) after ${valueDate}, the date the `
        + `account's value is struck (${r2(sum(late.filter((c) => c.amount > 0).map((c) => c.amount)))} in, `
        + `${r2(sum(late.filter((c) => c.amount < 0).map((c) => -c.amount)))} out), are not listed as dated capital: `
        + "they are not yet in that value");
    }
    for (const c of moves) {
      if (valueDate && c.date > valueDate) continue;
      const k = `${c.date}|${c.description ?? ""}|${c.amount}|${c.balance ?? ""}`;
      if (seenRow.has(k)) continue;
      seenRow.add(k);
      rows.push(c);
    }
  }
  const switchLeg = (c) => reclassificationsHere.some((r) => r.date === c.date && Math.abs(r.amount - Math.abs(c.amount)) <= 1);
  const legs = rows.filter(switchLeg);
  const money = rows.filter((c) => !switchLeg(c));
  if (legs.length) {
    notes.push(`${label}: ${legs.length} capital-register row(s) (${[...new Set(legs.map((c) => c.description))].join(", ")}) `
      + "are the legs of a class switch the fund's own reclassification record prints on the same date for the same "
      + "rupees — not money moving, so not listed");
  }
  const byDay = new Map();
  for (const c of money) {
    const direction = c.amount > 0 ? "in" : "out";
    const k = `${c.date}|${direction}`;
    const cur = byDay.get(k) ?? { date: c.date, direction, amount: 0, label: c.description || (direction === "in" ? "Deposit" : "Withdrawal") };
    cur.amount += Math.abs(c.amount);
    byDay.set(k, cur);
  }
  const regMoves = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date) || a.direction.localeCompare(b.direction));
  let heldBack = false;
  if (regMoves.length) {
    if (!existing.length && !regMoves.some((m) => m.direction === "in")) {
      heldBack = true;
      notes.push(`${label}: its capital register's only movements are ${regMoves.length} withdrawal(s) `
        + `(${[...new Set(regMoves.map((m) => m.label))].join(", ")}, ${r2(sum(regMoves.map((m) => m.amount)))} in all) and it `
        + "publishes no other dated capital, so they are not listed as the family's own: on their own they would present an "
        + "account funded before the register's window as one nothing was paid into. The XIRR and the NAV chain still net them.");
    } else {
      for (const m of regMoves) {
        if (already(m.date, m.direction, m.amount)) continue;
        const other = clash(m.date, m.direction);
        if (other) {
          notes.push(`${label}: the register's ${m.date} ${m.direction === "in" ? "deposit" : "withdrawal"} of ${r2(m.amount)} `
            + `and the ${r2(other.amount)} another statement prints that day disagree — the typed row is kept and the register's `
            + "is not added a second time");
          continue;
        }
        out.push({
          accountId, date: m.date, direction: m.direction,
          label: m.label,
          amount: r2(m.amount),
          // A register deposit is cash into the account; no charge is printed against it.
          invested: m.direction === "in" ? r2(m.amount) : null,
          units: null, security: null, securityKey: null,
        });
      }
    }
  }
  const reaches = !heldBack && (existing.length > 0 || out.length > 0);
  return { register: out, witnessedTo: reaches ? (witnessed.sort().at(-1) ?? null) : null };
}

/**
 * …AND A BANK BOOK, WHERE THE SAME ACCOUNT'S PROFIT AND LOSS ACCOUNT WITNESSES IT.
 *
 * ASK's two mandates (the `september-2026` delivery) issue no capital register
 * and no row typed as a contribution: the family's money in and out is on the
 * BANK BOOK's Dep/With column, beside every trade, and the tax deducted at
 * source on each dividend leaves the bank through "Trf to TDS A/c" rows in its
 * Buy/Sell column. `datedCapitalElsewhere` keeps a bank book out, because
 * nothing on its page witnesses that column alone. This one has a witness: the
 * same account's PROFIT AND LOSS ACCOUNT prints, on its balance sheet, the
 * capital the account received and the capital it paid back over a window that
 * closes on the bank book's own closing date — and the bank book's rows
 * reproduce both lines EXACTLY:
 *
 *     Σ deposits                                       = Capital Contribution
 *     Σ withdrawals + Σ "Trf to TDS A/c" (net, signed) = Withdrawals
 *
 * Measured on both ASK accounts to the paisa (₹4.60 Cr in / ₹8.54 Cr out, and
 * ₹8.50 Cr in / ₹15.12 Cr out). Only then is a row merged; otherwise nothing is,
 * and the note says which line did not reproduce. Four rules keep it from
 * inventing a payment:
 *
 * 1. THE TWO DOCUMENTS MUST COVER ONE WINDOW: they close on one date, and the
 *    profit-and-loss account's window opens on or before the bank book's. Two
 *    totals over different windows are not about the same money however
 *    closely they agree.
 * 2. ONE PAYMENT IS ONE MOVE PER DATE AND DIRECTION, the register's own rule: a
 *    TDS transfer printed beside a redemption on one date is one outflow.
 * 3. A DATE IS NETTED BEFORE IT IS LISTED. In 2020 the manager rebooked several
 *    TDS transfers as cash withdrawals — a "Being TDS deducted on" withdrawal and
 *    a reversal of the transfer on one date — so on 6 November both accounts
 *    print a withdrawal and a reversal that net to nil, and nothing is listed
 *    for it. A date netting INTO the account (a reversal with no withdrawal
 *    beside it) is not a contribution anybody made: the whole merge is refused
 *    rather than one guessed at.
 * 4. A MOVE ALREADY ON THE ACCOUNT'S RECORD IS NOT ADDED AGAIN, and a record
 *    that disagrees with the bank book is not overwritten: the bank book is
 *    merged only where every move already on the record is one of its own. And
 *    a bank book whose only moves are withdrawals, on an account with no other
 *    dated capital, is held back exactly as the register's rule 4 holds one.
 *
 * Returns the moves to add, `witnessedTo` — the date both documents close on,
 * which is how far the account's dated record then provably runs — and the
 * figures for the run's note.
 */
function bankBookCapitalWitnessed({ accountId, allIssues, existing, notes, label }) {
  const none = { moves: [], witnessedTo: null, merged: null };
  const isTds = (c) => /^trf to tds a\/c$/i.test((c.description ?? "").trim());
  const capitalRow = (c) => c.kind === "bank-book" && !!c.date
    && ((isNum(c.depositWithdrawal) && c.depositWithdrawal !== 0)
      || (isTds(c) && isNum(c.buySellAmount) && c.buySellAmount !== 0));
  const books = allIssues
    .filter((d) => d.reportType === "bank-book" && (d.cashFlows ?? []).some(capitalRow))
    .sort((a, b) => (a.docKey < b.docKey ? -1 : a.docKey > b.docKey ? 1 : 0));
  if (!books.length) return none;
  const pls = allIssues.filter((d) => d.reportType === "profit-and-loss"
    && isNum(d.flows?.contribution) && isNum(d.flows?.withdrawal));
  if (!pls.length) {
    /**
     * SAID ONLY WHERE SOMETHING IS LEFT OFF THE RECORD. Measured on the earlier
     * deliveries, seven accounts print a bank book with no profit-and-loss
     * account, and not one of them loses a payment by it: six carry nothing in
     * the Dep/With column but TDS (a "Trf to TDS A/c" in the Buy/Sell column, or
     * a "TDS on Payout" withdrawal), and V.E.C 128005's two Fund Deposits are on
     * its record already, from the register its balances witness. A note on each
     * would name a gap that is not there. What it names instead is a Dep/With
     * row the record does not carry and that the record would list if it were
     * witnessed: a deposit, or a withdrawal on an account with other dated
     * capital — a lone withdrawal is held back by the rule below in any case.
     */
    // Compared as the record lists them — ONE MOVE PER DATE AND DIRECTION, so two
    // TDS rows on one day (Green Lantern 510861's 2 April, ₹2,708 and ₹1,339) are
    // the one ₹4,047 the record carries, not two moves it lacks. A row a second
    // issue of the bank book prints again is counted once.
    const seen = new Set();
    const byDay = new Map();
    for (const c of books.flatMap((d) => d.cashFlows ?? [])) {
      if (c.kind !== "bank-book" || !c.date || !isNum(c.depositWithdrawal) || c.depositWithdrawal === 0) continue;
      const k = `${c.date}|${(c.description ?? "").trim()}|${c.depositWithdrawal}|${c.balance ?? ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const direction = c.depositWithdrawal > 0 ? "in" : "out";
      const e = byDay.get(`${c.date}|${direction}`) ?? { date: c.date, direction, amount: 0 };
      e.amount += Math.abs(c.depositWithdrawal);
      byDay.set(`${c.date}|${direction}`, e);
    }
    const fresh = [...byDay.values()].filter((x) => !existing.some((m) => m.date === x.date
      && m.direction === x.direction && isNum(m.amount) && Math.abs(m.amount - x.amount) <= 1));
    const freshIn = fresh.filter((x) => x.direction === "in");
    const freshOut = fresh.filter((x) => x.direction === "out");
    if (freshIn.length || (freshOut.length && existing.length)) {
      notes.push(`${label}: its bank book prints ${fresh.length} dated deposit or withdrawal move(s) its dated capital record `
        + `does not carry (${r2(sum(freshIn.map((x) => x.amount)))} in, ${r2(sum(freshOut.map((x) => x.amount)))} out), but no `
        + "profit-and-loss account states the capital the account received and paid back, so nothing witnesses those "
        + "rows and none is listed as dated capital");
    }
    return none;
  }
  const closeOf = (d) => d.flows?.periodTo ?? d.periodTo ?? d.asOf ?? null;
  const pl = [...pls].sort((a, b) => ((closeOf(b) ?? "") < (closeOf(a) ?? "") ? -1 : (closeOf(b) ?? "") > (closeOf(a) ?? "") ? 1 : 0))[0];
  const to = closeOf(pl);
  const from = pl.flows?.periodFrom ?? pl.periodFrom ?? null;
  // ONE WINDOW: the same closing date, and a profit-and-loss window that opens
  // on or before the bank book's — or the two lines are not about the rows.
  const sameWindow = books.filter((d) => (d.periodTo ?? d.asOf) === to && !!from && !!d.periodFrom && from <= d.periodFrom);
  if (!to || !sameWindow.length) {
    notes.push(`${label}: its bank book covers ${[...new Set(books.map((d) => `${d.periodFrom ?? "?"} → ${d.periodTo ?? d.asOf}`))].join(", ")} `
      + `and its profit-and-loss account ${from ?? "?"} → ${to ?? "no stated date"}, so the two are not about the same money and `
      + "the bank book's capital rows are not listed as dated capital");
    return none;
  }
  // The FIRST issue of that window whose rows reproduce both lines — one
  // document's rows, never a union of two issues of it, which would print every
  // payment twice.
  const contribution = r2(pl.flows.contribution);
  const withdrawal = r2(pl.flows.withdrawal);
  let chosen = null;
  let rows = null;
  let measured = null;
  for (const d of sameWindow) {
    const rs = (d.cashFlows ?? []).filter(capitalRow);
    const dep = r2(sum(rs.filter((c) => isNum(c.depositWithdrawal) && c.depositWithdrawal > 0).map((c) => c.depositWithdrawal)));
    const wd = r2(-(sum(rs.filter((c) => isNum(c.depositWithdrawal) && c.depositWithdrawal < 0).map((c) => c.depositWithdrawal))
      + sum(rs.filter((c) => isTds(c) && isNum(c.buySellAmount)).map((c) => c.buySellAmount))));
    measured ??= { dep, wd, doc: d };
    if (Math.abs(dep - contribution) < 0.005 && Math.abs(wd - withdrawal) < 0.005) { chosen = d; rows = rs; break; }
  }
  if (!chosen) {
    notes.push(`${label}: its bank book's deposits (${measured.dep}) and its withdrawals with its TDS transfers (${measured.wd}) `
      + `do not reproduce the ${pl.asOf} profit-and-loss account's Capital Contribution (${contribution}) and Withdrawals `
      + `(${withdrawal}) — ${r2(measured.dep - contribution)} and ${r2(measured.wd - withdrawal)} apart — so none of its rows `
      + "is listed as dated capital: a list that does not add to the account's own figures reads exactly like one that does");
    return none;
  }

  const byDate = new Map();
  for (const c of rows) {
    const e = byDate.get(c.date) ?? { date: c.date, ins: 0, outs: 0, inLabels: new Set(), outLabels: new Set() };
    if (isNum(c.depositWithdrawal) && c.depositWithdrawal > 0) {
      e.ins += c.depositWithdrawal;
      e.inLabels.add(c.description || "Deposit");
    }
    if (isNum(c.depositWithdrawal) && c.depositWithdrawal < 0) {
      e.outs += c.depositWithdrawal;
      e.outLabels.add(c.description || "Withdrawal");
    }
    if (isTds(c) && isNum(c.buySellAmount)) {
      e.outs += c.buySellAmount;
      e.outLabels.add(c.description.trim());
    }
    byDate.set(c.date, e);
  }
  const moves = [];
  const nilDates = [];
  const intoDates = [];
  for (const e of [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    if (r2(e.ins) > 0) moves.push({ date: e.date, direction: "in", amount: r2(e.ins), label: [...e.inLabels].join(" · ") });
    const out = r2(e.outs);
    if (out < 0) moves.push({ date: e.date, direction: "out", amount: -out, label: [...e.outLabels].join(" · ") });
    else if (out === 0 && e.outLabels.size) nilDates.push(e.date);
    else if (out > 0) intoDates.push(`${e.date} (${out})`);
  }
  if (intoDates.length) {
    notes.push(`${label}: on ${intoDates.join(", ")} its bank book's withdrawals and TDS transfers net INTO the account — a `
      + "reversal with no withdrawal beside it, which is not a contribution anybody made — so none of its rows is listed as "
      + "dated capital, although its totals reproduce the profit-and-loss account's");
    return none;
  }

  // The register's rule 4, for the same reason: withdrawals alone, on an account
  // with no other dated capital, would present it as one nothing was paid into.
  if (!existing.length && !moves.some((m) => m.direction === "in")) {
    notes.push(`${label}: its bank book's only capital moves are ${moves.length} withdrawal(s), and the account publishes no `
      + "other dated capital, so they are not listed as the family's own");
    return none;
  }
  const same = (m, x) => m.date === x.date && m.direction === x.direction && isNum(m.amount) && Math.abs(m.amount - x.amount) <= 1;
  const foreign = existing.filter((m) => !moves.some((x) => same(m, x)));
  if (foreign.length) {
    notes.push(`${label}: its dated capital record already carries ${foreign.length} move(s) its bank book does not `
      + `(${foreign.slice(0, 3).map((m) => `${m.date} ${m.direction} ${r2(m.amount)}`).join(", ")}${foreign.length > 3 ? ", …" : ""}), `
      + "so two records of the account's capital disagree and the bank book is not merged onto it");
    return none;
  }
  const add = moves.filter((x) => !existing.some((m) => same(m, x))).map((x) => ({
    accountId, date: x.date, direction: x.direction,
    label: x.label,
    amount: x.amount,
    // A bank-book deposit is cash into the account; no charge is printed against it.
    invested: x.direction === "in" ? x.amount : null,
    units: null, security: null, securityKey: null,
  }));
  return {
    moves: add,
    witnessedTo: to,
    merged: {
      doc: chosen.docKey, pl: pl.docKey, contribution, withdrawal, nilDates,
      ins: add.filter((m) => m.direction === "in").length,
      outs: add.filter((m) => m.direction === "out").length,
    },
  };
}


/** Half of the last decimal a printed unit count carries — the tie a FIFO balance is held to. */
function printedUnitTie(q) {
  if (!isNum(q)) return UNIT_TIE;
  const s = String(q);
  const dp = s.includes(".") ? s.split(".")[1].length : 0;
  return Math.max(UNIT_TIE, 0.5 * 10 ** -dp);
}

/** The economic gain on one capital-gain lot: proceeds less what those units cost. */
/**
 * WHICH DOCUMENT A DAY'S SALE IS READ FROM, for settling capital-gain lots
 * against it — the runtime ledger's own `AUTHORITATIVE.transactions` list
 * (`src/lib/ledger.ts`), restated here because that module is the browser's.
 * The first type an account publishes wins and the other is never read: a
 * manager issuing both prints the same sale twice, and a day's sale summed
 * across two documents would match no lot group at all.
 */
const SALE_AUTHORITY = ["transaction-statement", "investor-report"];
/** The statement's own settlement figure, else its net, else its gross — the ledger's `settledAmount`. */
const settledOf = (t) => t.printed?.settlementAmount ?? t.net ?? t.gross ?? null;

function lotGain(l) {
  if (isNum(l.saleAmount) && isNum(l.purchaseAmount)) return { gain: l.saleAmount - l.purchaseAmount, cost: l.purchaseAmount };
  const g = (isNum(l.shortTerm) ? l.shortTerm : 0) + (isNum(l.longTerm) ? l.longTerm : 0);
  if (!isNum(l.shortTerm) && !isNum(l.longTerm)) return null;
  if (isNum(l.purchaseAmount)) return { gain: g, cost: l.purchaseAmount };
  if (isNum(l.saleAmount)) return { gain: g, cost: l.saleAmount - g };
  return null;
}

/**
 * OPENING, PLUS, MINUS, CLOSING — per holding, per statement window.
 *
 * *"beginning of the year, this was my quantity, sold so much in the year, this
 * is the quantity remaining … more like an opening balance, plus minus,
 * closing balance. In a simple table format."*
 *
 * THE DEMAT STATEMENTS PRINT THIS TABLE AND NOTHING READ IT. Each prints, per
 * ISIN, an `Opening Balance`, every dated movement with its own running
 * balance, and a `Closing Balance` — 362 movement rows across six statements,
 * of which the reader took 14, because it required a `CREDIT`/`DEBIT` token
 * that is printed on a wrapped continuation line or not at all. The direction
 * is the SIGN OF THE RUNNING BALANCE'S OWN CHANGE, and `motilalDemat.mjs`
 * refuses any block whose rows do not walk its printed opening to its printed
 * closing. Measured: 90 of 90 walk.
 *
 * FOUR TERMS, BECAUSE TWO WOULD BE WRONG.
 *
 *   opening + unitsIn − unitsOut + corporateAction = closing
 *
 * A corporate action is the security itself changing — a dividend reinvested
 * into more units, an AIF redeemed, a rearrangement — never a decision anybody
 * made, and folding it into "bought" would report the family as having bought
 * 72 lots they never ordered. An ENCUMBRANCE is the term that must never be
 * counted at all: a pledge moves units between free and pledged WITHOUT
 * changing the balance, so summing pledges as purchases would report a holding
 * at twice its size. It is carried as a COUNT so the page can say the movements
 * happened without putting them in a total.
 *
 * AND NONE OF THIS IS A TRADE. A depository movement carries no price, no
 * counterparty and no consideration (§"a depository movement is not a trade"),
 * so every figure here is a QUANTITY and the page says units, never bought or
 * sold in the money sense.
 *
 * Keyed `accountId|securityKey` because that is what a holdings row is, and
 * joined on the ISIN the statement prints — falling back to the name's own key
 * only where the statement printed no ISIN, which on these six is never.
 *
 * ── AND JOINED ON THE ISIN ACROSS THE BOOK, NOT ONLY INSIDE THE ACCOUNT ──────
 *
 *   "According to the client, Kaynes Technologies Limited is … also a holding
 *    of the family entity Ajay's account."
 *
 * Ajay's main demat (1201090012539150) prints a Kaynes block: 16,300 shares on
 * 1 April, sold on 10 April, bought back on 5 May, sold again on 12–13 May,
 * nil at 31 July. The join above was scoped to the ACCOUNT, and that account
 * holds no Kaynes position at 31 July — so the block fell through to its own
 * printed name, `KAYNES TECHNOLOGY INDIA LIMITED # EQUITY SHARES`, whose key
 * (`kaynes-technology-india-limited-equity-shares`) matches NO row anywhere in
 * the book. The window was generated, correct, and filed where no page could
 * ever read it: the Kaynes page showed Ankita's demat alone, and the one record
 * in this book that answers the client's question was invisible.
 *
 * The ISIN IS the security, and the book already carries a key for it. So a
 * block the account no longer holds takes the key the rest of the book files
 * that ISIN under — where exactly ONE key carries it. An ISIN the book files
 * under two keys (Helios Flexi Cap's, the extractor join `docs/BOOK-REPORT.md`
 * names) is ambiguous and keeps the statement's own name rather than picking
 * one. Measured: 14 windows were stranded this way, all on securities the book
 * does carry — Kaynes, Onesource and Insolation among Ajay's shares.
 *
 * AN AIF UNIT IS NOT BRIDGED, and that is the book's own rule rather than a new
 * one. A depository holding a fund's units is printing its copy of what the
 * FUND's own statement reports — which is why `dropDepositoryDuplicates` drops
 * those rows from the holdings and why a depository AIF row carries its units
 * and no price. Filing that window on the fund's page would put the same units
 * there twice, once as the fund's own figure and once as a demat's; so a window
 * whose ISIN the book carries as an AIF keeps the statement's own name. Four
 * of the fourteen are that (3P B3 in two demats, Baring 6 A1, Blue Ashva) — the
 * other ten are shares and mutual-fund units no second statement reports.
 */
function shareMovementsFrom(docs, positions, accounts, notes, unvalued = []) {
  const out = {};
  /**
   * WHAT A WINDOW JOINS: every holding the book carries, valued or not.
   *
   * Until Stage 10cz every Motilal Oswal demat row was a POSITION, valued at the
   * rate its statement prints — which turned out to be the price of the
   * holding's last depository movement, not a valuation, so those rows are
   * quantities now (`BOOK_UNVALUED_HOLDINGS`). Joined on positions alone, all 23
   * windows on those three demats lost the holding they describe, and the
   * Kaynes window on Ajay's main demat lost the only key that bridges it to a
   * company page (Stage 10cc). A window is about the UNITS, and the units are
   * still held whether or not anything values them, so the join reads both.
   *
   * EXCEPT A DEPOSITORY'S COPY OF AIF UNITS, which stays out of the join exactly
   * as it stays out of the bridge below: the reader names those rows by the
   * FUND's own name, so joining one would file the depository's window on the
   * fund's page, beside the fund's own figure for the same units. A position
   * outranks a quantity in the same account, which never happens on this book.
   */
  const holders = [
    ...unvalued.filter((u) => u.isin && u.securityKey && u.assetClass !== "AIF"),
    ...positions,
  ];
  const byAcctIsin = new Map();
  const fromPosition = new Set();
  for (const p of holders) {
    if (!p.isin) continue;
    byAcctIsin.set(`${p.accountId}|${p.isin}`, p.securityKey);
    if (positions.includes(p)) fromPosition.add(`${p.accountId}|${p.isin}`);
  }
  const keysByIsin = new Map();
  const aifIsins = new Set();
  for (const p of [...positions, ...unvalued]) {
    if (!p.isin || !p.securityKey) continue;
    (keysByIsin.get(p.isin) ?? keysByIsin.set(p.isin, new Set()).get(p.isin)).add(p.securityKey);
    if (p.assetClass === "AIF") aifIsins.add(p.isin);
  }
  // THE REGISTRY DECIDES WHICH ACCOUNTS EXIST. An account excluded with a
  // reason (`excludedFromBook`) still issues a transaction statement like every
  // other demat, so a window keyed on its own accountId would walk that account
  // back into the book through a side door, attributed to a holder this book
  // has said it cannot establish. Demat 32387399 was that account until Stage
  // 10db: its three identifiers gave three answers, and it is in the registry
  // now because the family's own register and review name its holder — the
  // Bharat Jaisinghani Family Trust (`BENEFICIAL_OWNER_BY_CLIENT_ID` in
  // `providers/motilalDemat.mjs`).
  const known = new Set(accounts.map((a) => a.accountId));
  /**
   * WHICH ACCOUNTS SENT A HOLDING STATEMENT. A window the book carries no
   * position for means three different things, and the note below used to
   * call all of them "securities the account no longer holds" — true of a
   * zero close and FALSE of the rest. Measured: 19 windows on Ajay's main demat
   * close with units still held, on an account that sent only this
   * transaction statement, so the tape's closing balance is the only record of
   * the holding. Told those were exits, a reader stops looking for them.
   */
  const withHoldingsDoc = new Set(docs
    .filter((d) => d.reportType === "holdings" && d.accountNo && d.provider)
    .map((d) => accountIdOf(d.provider, d.accountNo)));

  let blocks = 0, split = 0, joined = 0, joinedQty = 0, unclassified = 0, offRegistry = 0, bridged = 0, ambiguous = 0, collided = 0, overwritten = 0, fundCopy = 0;
  let exited = 0, heldNoHoldings = 0, notCarried = 0, bridgedHeld = 0;
  for (const d of docs) {
    if (d.reportType !== "demat-transactions") continue;
    // The SLUG a position carries, never `acctKey`'s grouping key — those are
    // two different strings for one account, and keying on the wrong one joins
    // nothing while looking exactly like a book that holds none of these.
    if (!d.accountNo || !d.provider) continue;
    const accountId = accountIdOf(d.provider, d.accountNo);
    if (!known.has(accountId)) { offRegistry += 1; continue; }
    for (const row of d.positionsAsOf ?? []) {
      if (row.opening == null && row.quantity == null) continue;
      blocks += 1;
      if (row.movements) split += 1;
      // The ISIN the statement prints, joined to the holding the book carries.
      // A block whose security this book holds no position in is still emitted
      // — the family sold out of it during the window, which is exactly the
      // row a reader asking "what happened to my quantity" is looking for.
      const own = securityKeyOf(row.security ?? "");
      let key = byAcctIsin.get(`${accountId}|${row.isin}`);
      if (key) {
        if (fromPosition.has(`${accountId}|${row.isin}`)) joined += 1;
        else joinedQty += 1;
      } else {
        // WHAT A WINDOW WITH NO POSITION IN ITS OWN ACCOUNT IS — counted apart,
        // because "the account no longer holds it" is true of a nil close and
        // false of a balance on an account that sent no holding statement.
        if (!(row.quantity > 0)) exited += 1;
        else if (withHoldingsDoc.has(accountId)) notCarried += 1;
        else heldNoHoldings += 1;
        const across = row.isin ? keysByIsin.get(row.isin) : undefined;
        if (row.isin && aifIsins.has(row.isin)) fundCopy += 1;
        else if (across?.size === 1) {
          const bookKey = [...across][0];
          // NEVER OVERWRITE A WINDOW THIS ACCOUNT ALREADY FILED UNDER THAT KEY.
          // Two ISIN blocks landing on one key in one account would be two
          // instruments printed as one — the older issue of a split share, say —
          // so the second keeps its own name rather than replacing the first.
          if (out[`${accountId}|${bookKey}`]) collided += 1;
          else { key = bookKey; bridged += 1; if (row.quantity > 0) bridgedHeld += 1; }
        } else if ((across?.size ?? 0) > 1) ambiguous += 1;
      }
      key ??= own;
      // A key this account already filed a window under would be OVERWRITTEN by
      // the assignment below, which is a window silently lost — counted, so a
      // drop that does it says so. None does on this corpus.
      if (out[`${accountId}|${key}`]) overwritten += 1;
      const m = row.movements;
      if (m?.unclassified) unclassified += m.unclassified;
      out[`${accountId}|${key}`] = {
        accountId, securityKey: key, security: row.security ?? null, isin: row.isin ?? null,
        periodFrom: d.periodFrom ?? null, periodTo: d.periodTo ?? null,
        opening: row.opening ?? null, closing: row.quantity ?? null,
        // `r3`, NEVER `r2`. These are UNITS and the statement prints them to
        // three decimals; the money rounder beside it moved three windows by up
        // to 0.003 of a unit, which is nothing to a reader and is the whole of
        // whether the four printed figures add across. Bandhan Arbitrage read
        // 4011814.06 in less 640238.36 out against a printed closing of
        // 3371575.697 — a table whose own columns do not reconcile.
        unitsIn: m ? r3(m.unitsIn) : null,
        unitsOut: m ? r3(m.unitsOut) : null,
        corporateAction: m ? r3(m.corporateActionIn - m.corporateActionOut) : null,
        encumbranceMoves: m ? m.encumbrance : null,
        rows: m ? m.rows : null,
        unclassified: m ? m.unclassified : null,
        // Null where the block did not walk — never a zero, which would read as
        // a window in which nothing moved.
        reason: row.movementsReason ?? null,
        source: d.docKey ?? null,
      };
    }
  }
  if (blocks) {
    notes.push(`share movements: ${blocks} holding-window(s) from the demat statements, ${split} of which walk their own printed opening balance to their own printed closing balance and carry an opening-to-closing split. ${joined} join a position this book carries and ${joinedQty} a holding it carries as a quantity with no value; ${exited} close at nil, securities the account sold out of during the window; ${heldNoHoldings} close with units still held on an account that sent no holding statement, so the tape's closing balance is the only record of them; ${notCarried} sit on an account whose own holding statement is in the drop and are deliberately not carried as positions — a fund reporting its own units, or a row with no mark. ${unclassified} movement row(s) matched no known particular and are counted in the in/out totals by their own balance change.${offRegistry ? ` ${offRegistry} demat statement(s) were skipped entirely because their account is not in the registry — an account excluded by decision stays excluded here too.` : ""}`);
    // PRINTED EVEN AT ZERO: a join that only speaks when it fires is
    // indistinguishable, on a quiet drop, from one that was deleted.
    notes.push(`share movements: ${bridged} window(s) in an account that carries no position for the security are filed under the key the rest of the book carries for the same ISIN, so the company's page shows them (${bridged - bridgedHeld} close at nil; ${bridgedHeld} close with units still held on an account that sent no holding statement); ${ambiguous} ISIN(s) the book files under two keys keep the statement's own name rather than picking one; ${fundCopy} window(s) are the depository's copy of AIF units a fund's own statement reports and stay off the fund's page; ${collided} block(s) would have landed on a key their account already filed and keep their own name instead; ${overwritten} window(s) were overwritten by a second block under one key.`);
  }
  return out;
}

/**
 * WHEN A DEPOSITORY'S "RATE" WAS STRUCK — read off the same account's own tape.
 *
 * A CDSL holding statement prints, against each holding, the price of its LAST
 * DEPOSITORY MOVEMENT and that price times the movement's own quantity (Stage
 * 10cz; `motilalDemat.mjs`'s header). It is a transaction price, and a reader
 * shown it needs to know WHICH transaction and WHEN, or it reads as a mark.
 *
 * The same account's transaction statement prints every receipt and delivery
 * since the day it starts, in order, with its quantity. So the movement a rate
 * belongs to can be FOUND rather than assumed: the last receipt or delivery of
 * that ISIN, where its quantity times the rate reproduces the printed value to
 * the printed precision — the value to the paisa and the rate to its third
 * decimal, never a tolerance widened until it fits. Three answers, each said:
 *
 *   • the last movement reproduces the value — the price is DATED;
 *   • the ISIN does not move on the tape — its last movement is older than the
 *     tape, so the price predates the day the tape starts and no date is given;
 *   • it moves and the last movement does not reproduce the value — the price
 *     belongs to some movement the tape does not show, and no date is given.
 *
 * A pledge moves no units and carries no price, so only a receipt or a delivery
 * can be the movement. Measured on this book: 43 rows carry such a rate, 23 are
 * dated, 20 predate the tape, and none moves without reproducing its value.
 */
function lastMovementOf(h, tape) {
  const rate = isNum(h.lastMovementRate) && h.lastMovementRate > 0 ? h.lastMovementRate : null;
  if (rate === null) return null;
  const value = isNum(h.lastMovementValue) ? h.lastMovementValue : null;
  const moves = (tape?.transactions ?? []).filter((t) => t.isin && t.isin === h.isin
    && (t.side === "receipt" || t.side === "delivery") && isNum(t.quantity));
  const last = moves.at(-1) ?? null;
  const units = last ? Math.abs(last.quantity) : null;
  const ties = last !== null && value !== null && Math.abs(units * rate - value) <= 0.005 + units * 0.0005;
  return {
    rate,
    value,
    date: ties ? last.date ?? null : null,
    side: ties ? last.side : null,
    units: ties ? units : null,
    onTape: moves.length > 0,
    tapeFrom: tape?.periodFrom ?? null,
  };
}

/**
 * The dated investments behind each position, WHERE THEY ACCOUNT FOR ALL OF IT.
 *
 * A tranche's value today is its own units at today's NAV, so the units are what
 * make a per-tranche return a measurement rather than an allocation. If the
 * allotted units fall short of the units held, some of the position was bought
 * by something this book cannot see, and splitting the rest across it would
 * report a return on a holding that is partly missing — the same failure the
 * ST/LT split already refuses on Pricol and Belrise.
 */
function positionTranchesFrom(capitalMoves, reclassifications, positions, notes, fifoLots = new Map()) {
  const out = {};
  /**
   * WHERE FIFO RAN, THE TRANCHES ARE THE LOTS STILL HELD. A switch carries a
   * lot into the new class with its own date and cost, and a sale takes the
   * oldest first — so a contribution partly redeemed shows what is LEFT of it,
   * and a contribution made into a class the family then switched out of shows
   * up in the class that holds its units now. The allotment table alone could
   * say neither: Neo's first drawdown is 25,000 units of which 10,837.2
   * survive. (A record with a class SWITCH and no sale — Buoyant — is carried
   * by `carryLotsThroughSwitches` below; FIFO lots stand only where units LEFT.)
   */
  for (const [k, lots] of [...fifoLots.entries()].sort()) {
    if (!lots.length) continue;
    const [accountId, securityKey] = k.split("|");
    const pos = positions.find((p) => p.accountId === accountId && p.securityKey === securityKey);
    const moves = lots.map((l) => ({
      accountId, date: l.date, direction: "in",
      label: [l.label ?? "Allotment",
        l.carriedFromName ? `switched in from ${l.carriedFromName.replace(/^.*?\b(Class \S+)$/, "$1")}` : null,
        l.unitsBought - l.units > UNIT_TIE ? `${r3((l.units / l.unitsBought) * 100)}% of it still held` : null,
      ].filter(Boolean).join(" · "),
      // What THESE units cost — the lot's own cost, carried unchanged through a
      // switch and reduced in proportion by a sale. Never the contribution's
      // full amount where part of it has already gone.
      amount: r2(l.cost),
      invested: r2(l.cost),
      units: Math.round(l.units * 1e4) / 1e4,
      security: pos?.security ?? null,
      securityKey,
    }));
    out[k] = { accountId, securityKey, moves, units: Math.round(sum(moves.map((m) => m.units)) * 1e3) / 1e3, basis: "fifo" };
  }

  const byKey = new Map();
  for (const m of capitalMoves) {
    // MONEY IN ONLY. A redemption now carries the units it took OUT, and folding
    // those into the allotted total would net the gate to something that is not
    // what any tranche bought — and would draw a disposal as a tranche row in a
    // panel whose whole claim is "what each investment earned".
    if (m.direction !== "in" || !m.securityKey || !isNum(m.units)) continue;
    const k = `${m.accountId}|${m.securityKey}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(m);
  }

  // THROUGH A CLASS SWITCH THE MONEY KEEPS ITS DATE AND ITS COST — see
  // `carryLotsThroughSwitches` in `lib/classSwitch.mjs`.
  carryLotsThroughSwitches(byKey, reclassifications, capitalMoves, notes);

  for (const [k, moves] of [...byKey.entries()].sort()) {
    // FIFO's lots already stand for this position.
    if (out[k]) continue;
    // Every lot moved out of this class by a switch: nothing is left to tie.
    if (!moves.length) continue;
    const [accountId, securityKey] = k.split("|");
    const held = positions.filter((p) => p.accountId === accountId && p.securityKey === securityKey);
    if (held.length !== 1) {
      notes.push(`no per-contribution breakdown for ${securityKey} in ${accountId}: `
        + `${held.length} matching position(s) in the book, so the allotted units cannot be tied to one holding`);
      continue;
    }
    const allotted = sum(moves.map((m) => m.units));
    if (Math.abs(allotted - held[0].quantity) > UNIT_TIE) {
      // A REDEEMED POSITION IS NOT AN UNEXPLAINED SHORTFALL, and saying it is
      // sends the next reader to look for a missing allotment. The units were
      // allotted, held and then paid out; there is nothing left to strike a
      // per-tranche return on, which is a different fact from a breakdown that
      // covers part of a live holding.
      // Rounded to the 3 decimals a unit count is PRINTED to — an unrounded
      // float residue in a committed report reads as a figure nobody struck.
      const u = Math.round(allotted * 1e3) / 1e3;
      const paidOut = capitalMoves.some((m) => m.direction === "out" && m.accountId === accountId
        && m.securityKey === securityKey);
      notes.push(held[0].quantity === 0
        ? `no per-contribution breakdown for ${securityKey} in ${accountId}: the ${u} unit(s) allotted `
          + `are no longer held and the position stands at zero, so there is nothing left to value a `
          + `tranche at. `
          + (paidOut
            ? "The contributions and the redemption that closed it are both carried."
            : "Where the units went is on the statement's own dated table, in the archive.")
        : `no per-contribution breakdown for ${securityKey} in ${accountId}: the statement allots `
          + `${u} unit(s) against ${held[0].quantity} held, so the dated contributions do not account `
          + `for the position and a per-contribution return would be struck on part of it`);
      continue;
    }
    // Rounded to the 3 decimals a unit count is PRINTED to, so the emitted file
    // carries no float residue and regenerates byte-identically. It stays an
    // independently-summed figure rather than a copy of `quantity`, which would
    // make any check comparing the two a tautology.
    /**
     * EVERY RUPEE PAID, WITH THE CHARGE INSIDE IT NAMED (VD-24). A tranche's
     * `invested` is what the family paid for it — the net that bought units plus
     * the charges the statement prints against it — so the tranche panel, the
     * position's cost and the Transactions card's Purchase column all read one
     * figure. `navAtEntry` takes the charge back out (`tranches.ts`), so the
     * unit price a contribution shows is still the one the statement prints.
     * A copy, never the capital move itself: `BOOK_CAPITAL_MOVES` keeps
     * `invested` as the net its own hover names.
     */
    const paid = moves.map((m) => (isNum(m.charges) && m.charges > 0 && isNum(m.invested)
      ? { ...m, invested: r2(m.invested + m.charges) } : m));
    out[k] = { accountId, securityKey, moves: paid, units: Math.round(allotted * 1e3) / 1e3 };
  }
  return out;
}

/**
 * ── A COST IS EVERY RUPEE PAID IN (VD-24) ────────────────────────────────────
 *
 * Stamp duty was treated two ways: netted out of Sanshi's cost, carried inside
 * Helios's, Active Momentum's, Founders' and Delphi's. A holding whose tranches
 * name a printed charge is costed at what was PAID — Σ the tranches' `invested`
 * — and keeps the statement's own net beside it as `printedCostBasis`, a CHECK
 * and never a source.
 *
 * ONE GATE, AND IT IS THE STATEMENT'S: the net the tranches bought units with
 * (paid less the printed charges) must be the holding's printed cost TO THE
 * PAISA. That is what says the two figures describe the same money; without it
 * a restated cost would be a figure nothing on the page reconciles, and the
 * holding keeps the statement's cost with the reason named.
 */
function grossPaidCost(positions, positionTranches, notes) {
  for (const tr of Object.values(positionTranches)) {
    if (tr.basis === "fifo" || tr.moves.some((m) => m.carriedFrom)) continue;
    const charges = sum(tr.moves.map((m) => (isNum(m.charges) ? m.charges : 0)));
    if (!(charges > 0)) continue;
    const p = positions.find((x) => x.accountId === tr.accountId && x.securityKey === tr.securityKey);
    if (!p || !isNum(p.costBasis) || p.costBasisSource) continue;
    const label = `${p.security} in ${p.accountId}`;
    const paid = r2(sum(tr.moves.map((m) => (isNum(m.invested) ? m.invested : NaN))));
    if (!Number.isFinite(paid)) {
      notes.push(`cost not restated to what was paid for ${label}: a contribution behind it prints no amount`);
      continue;
    }
    const net = r2(paid - charges);
    const inr = (n) => r2(n).toLocaleString("en-IN");
    // AN AMC FOLIO'S OWN COST COLUMN ALREADY COUNTS THE STAMP DUTY (Helios,
    // Active Momentum): the statement's cost is every rupee paid, so there is
    // nothing to restate and no second figure to keep beside it as a check.
    if (Math.abs(paid - p.costBasis) <= 0.01) {
      notes.push(`cost of ${label} is what was paid in, ${inr(paid)}, as the statement itself prints it: its own cost `
        + `column counts the ${inr(charges)} of stamp duty it levied, so nothing is restated`);
      continue;
    }
    if (Math.abs(net - p.costBasis) > 0.01) {
      notes.push(`cost not restated to what was paid for ${label}: its contributions bought units with ${inr(net)} after `
        + `${inr(charges)} of printed charges, against the ${inr(p.costBasis)} the statement prints as its cost — the two do not `
        + "describe the same money to the paisa, so the statement's cost stands");
      continue;
    }
    p.printedCostBasis = r2(p.costBasis);
    p.costBasis = paid;
    p.costBasisSource = "gross-paid";
    if (isNum(p.avgCost) && p.quantity > 0) p.avgCost = Math.round((paid / p.quantity) * 1e4) / 1e4;
    if (isNum(p.marketValue)) {
      p.unrealizedPnL = r2(p.marketValue - paid);
      p.returnPct = r2(fifoReturnPct(p.marketValue, paid, p.realizedPnL, p.costOfUnitsSold));
    }
    notes.push(`cost of ${label} is what was paid in, ${inr(paid)}: the statement prints ${inr(p.printedCostBasis)} — what `
      + `bought units after ${inr(charges)} of the stamp duty and charges it prints against the same contributions — and `
      + "that figure is kept beside it as the check");
  }
}

// ── The value bridge: it adds up, or it is withheld (A-12) ───────────────────

/**
 * THE LINES A VALUE BRIDGE ADDS, WITH THEIR SIGNS — one identity for every
 * report, because a report prints only the lines it prints and a line it does
 * not print adds nothing. A fact sheet prints capital in and out and one
 * Profit / loss; a performance summary or appraisal prints the net capital, the
 * gains, income, fees, expenses and accrued income; the SEBI investor report
 * prints gross capital, the gains, income, the change in accruals and three
 * expense lines. Nothing here knows which report prints what: a line is counted
 * where the book carries a figure for it, so a report that gains a line is
 * tied on it the day its reader reads it.
 *
 * Capital is the net line where the report prints one and contributions less
 * withdrawals otherwise, so no rupee of it is counted twice.
 */
const BRIDGE_TERMS = [
  { key: "realized", sign: 1, words: "realised gain" },
  { key: "unrealized", sign: 1, words: "unrealised gain" },
  { key: "gainPriorToTakeover", sign: 1, words: "gain prior to takeover" },
  { key: "income", sign: 1, words: "income" },
  { key: "profit", sign: 1, words: "profit / loss" },
  { key: "fees", sign: -1, words: "fees" },
  { key: "expenses", sign: -1, words: "expenses" },
  { key: "otherExpenses", sign: -1, words: "other expenses" },
  { key: "accruedIncome", sign: 1, words: "accrued income" },
  { key: "changeInAccruals", sign: 1, words: "change in accruals" },
];
/**
 * The flow lines a reader sets ONLY where it reads them: absent means no reader
 * looked, `null` means it looked and the report prints none. The distinction is
 * what lets a column that does not tie say which of its lines were never read.
 */
const OPTIONAL_BRIDGE_FLOWS = ["accruedIncome", "changeInAccruals", "otherExpenses", "gainPriorToTakeover"];
const joinWords = (xs, and = "and") => (xs.length <= 1 ? xs.join("")
  : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);

/**
 * THE WINDOW A COLUMN IS ON, BY ITS OWN DATES (XA-21). Since inception where it
 * starts on or before the account's own inception date; a financial year to
 * date only where it starts on 1 April and ends inside that year; anything else
 * is a window and is called one — a month, or the span a fund's account
 * statement covers from its first contribution, is not a financial year.
 *
 * ON OR BEFORE, NOT ONLY ON. ASK's profit and loss account runs from 1 April
 * 2019, the start of the financial year the mandates opened in (26 July and
 * 6 September 2019): a window that opens before the account existed covers its
 * whole life, because nothing happened in it before inception. Measured on the
 * archive before this widened, no other bridge starts before its account's
 * inception, so no other column changes basis.
 */
function bridgeBasisOf(from, to, inception) {
  if (inception && from <= inception) return "since-inception";
  const fy = /^(\d{4})-04-01$/.exec(from);
  if (fy && to >= from && to <= `${Number(fy[1]) + 1}-03-31`) return "financial-year-to-date";
  return "window";
}

/**
 * DOES THE COLUMN ADD UP? Opening + capital + every line it prints = closing,
 * within the statement's own rounding — each printed figure is rounded to its
 * last printed unit, so N figures and a closing can be (N + 1) half-units apart
 * and no further. A column that does not add up is WITHHELD: the book keeps its
 * figures as read, and the page shows none of them as a bridge, because a
 * column whose parts do not make its total teaches a reader the wrong
 * arithmetic however carefully it is labelled.
 *
 * A since-inception opening the report does not print is NIL by definition —
 * nothing was held before inception — and is added as a computed zero. Any
 * other opening the report does not print cannot be assumed, so that column
 * cannot be tied and says so.
 */
function bridgeTieOf(b) {
  const openingNil = b.basis === "since-inception" && b.opening == null;
  const opening = openingNil ? 0 : b.opening;
  const unread = b.unread ?? [];
  const unreadWords = BRIDGE_TERMS.filter((t) => unread.includes(t.key)).map((t) => t.words);
  const unreadClause = unreadWords.length
    ? ` Not read from this report: ${joinWords(unreadWords)}.` : "";
  /**
   * LINES ONLY — A COLUMN WITH NO TOTAL TO CONTRADICT (Stage 10df). Marathon's
   * DETAILS OF INCOME AND EXPENSES prints every gain and charge since 1 April
   * 2018 and no portfolio value at either end. Withholding it hid twelve
   * figures the family's statement prints, on the grounds that they cannot be
   * added up — but a column is withheld so that parts which do NOT make their
   * total are never drawn as a bridge, and this column has no total for them
   * to miss. So its lines are shown AS PRINTED and never added: no sum, no
   * residual, no closing, and the page says so. A column with a closing value
   * and no opening is different, and stays withheld below — its lines and its
   * closing would then sit together with nothing to say whether they agree.
   */
  if (!isNum(b.closing) && !isNum(b.opening)) {
    return { ties: false, linesOnly: true, openingNil, residual: null, linesTotal: null, withheldReason: null,
      linesOnlyReason: `The report prints no opening or closing value, so its lines are shown as printed and not added up.${unreadClause}` };
  }
  if (!isNum(b.closing)) {
    return { ties: false, openingNil, residual: null, linesTotal: null,
      withheldReason: `The report prints no closing value, so its lines cannot be added up.${unreadClause}` };
  }
  if (!isNum(opening)) {
    const printed = BRIDGE_TERMS.filter((t) => b[t.key] === null && !unread.includes(t.key)).map((t) => t.words);
    return { ties: false, openingNil, residual: null, linesTotal: null,
      withheldReason: "The report prints no opening value for this window, so its lines cannot be added up to its "
        + `closing value.${printed.length ? ` It prints no ${joinWords(printed, "or")} line.` : ""}${unreadClause}` };
  }
  const capital = isNum(b.netCapitalInOut) ? b.netCapitalInOut
    : isNum(b.contribution) || isNum(b.withdrawal) ? (b.contribution ?? 0) - (b.withdrawal ?? 0) : null;
  const signed = [opening, capital, ...BRIDGE_TERMS.map((t) => (isNum(b[t.key]) ? t.sign * b[t.key] : null))]
    .filter(isNum);
  const linesTotal = signed.reduce((s, v) => s + v, 0);
  const residual = r2(b.closing - linesTotal);
  const figures = [...signed, b.closing];
  const unit = figures.some((v) => Math.abs(v - Math.round(v)) > 0.004) ? 0.01 : 1;
  const ties = Math.abs(residual) <= ((figures.length) * unit) / 2 + 1e-9;
  if (ties) return { ties: true, openingNil, residual, linesTotal: r2(linesTotal), withheldReason: null };
  const sameEnds = !openingNil && b.basis === "since-inception" && Math.abs(b.opening - b.closing) < 0.005;
  return { ties: false, openingNil, residual, linesTotal: r2(linesTotal),
    withheldReason: (sameEnds
      ? "Its opening value is read as its closing value, though nothing is held before inception."
      : "Its lines do not add to its closing value.") + unreadClause };
}

// ── Build ────────────────────────────────────────────────────────────────────

function build(archived) {
  const notes = [];
  // AN EXPORT IS A WITNESS, NEVER A DOCUMENT OF THE BOOK. A spreadsheet that
  // sits beside its PDF (`askimpms_…_BankBook178CT.xlsx`, Marathon's `.csv`) is
  // archived with its rows and NO facts, `twinOf` naming the PDF it witnesses;
  // every figure in it was checked against that PDF at extraction. Left in the
  // load it shares its PDF's account, report type and date, so
  // `newestPerReportType` kept the PDF only because its docKey sorts first, and
  // the report then said each export was "superseded … its dated rows are still
  // counted" — about a document with no rows to count. It is set aside here,
  // where the archive is read, and said once.
  const witnesses = archived.filter((d) => d.twinOf);
  const docs = archived.filter((d) => !d.twinOf);
  if (witnesses.length) {
    const byProvider = new Map();
    for (const w of witnesses) byProvider.set(w.provider, (byProvider.get(w.provider) ?? 0) + 1);
    notes.push(`${witnesses.length} spreadsheet export(s) are witnesses of the PDF beside each (\`twinOf\`) and are not documents of this book — `
      + [...byProvider].map(([p, n]) => `${p} ${n}`).join(", ")
      + `. Each carries no facts; every figure in it was checked against its PDF at extraction (docs/EXTRACTION-REPORT.md).`);
  }
  const byAccount = new Map();
  for (const d of docs) {
    const k = acctKey(d);
    if (!k) continue;
    (byAccount.get(k) ?? byAccount.set(k, []).get(k)).push(d);
  }

  const symbols = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/nseSymbols.json"), "utf8")); }
    catch { return {}; }
  })();

  // ── ISIN, joined across the drop's own documents ─────────────────────────
  //
  // Only some reports print an ISIN, and in this drop only one does — glued to
  // the security name, which the extractor now splits apart. The appraisal that
  // supplies the holdings prints none, so a position's ISIN comes from another
  // report ABOUT THE SAME SECURITY in the same drop. That is the same kind of
  // join the account number and owner already use: this book's own paperwork,
  // applied only where it is unambiguous.
  //
  // A securityKey that two documents give DIFFERENT ISINs for is left with none
  // and reported — two identifiers for one key means the key is wrong, and
  // guessing which is right would bake that error in.
  //
  // THAT SECOND HALF WAS A CLAIM THIS FILE DID NOT HONOUR. `isinConflicts` was
  // built, used to delete from `isinByKey`, and printed nowhere — a comment
  // asserting an enforcement that never happened, which is worse than no
  // enforcement because the next session reads it and stops looking. It is
  // reported below, AND ON A CLEAN RUN TOO: a guard that only speaks when it
  // fires is indistinguishable, on a book with no conflicts, from one that was
  // quietly deleted.
  //
  // It also stopped being decorative. `securityKeyOf` now removes the
  // depository's series and face-value furniture before taking the key, which
  // is exactly the operation that could land two DIFFERENT securities on one
  // key — and this is the test that tells a merge of two NAMES from a merge of
  // two SECURITIES, because the ISIN is evidence neither name controls.
  const isinByKey = new Map();
  const isinConflicts = new Map();
  for (const d of docs) {
    for (const arr of [d.holdings, d.transactions, d.capitalGains, d.income]) {
      for (const x of arr ?? []) {
        if (!x?.isin || !x.securityKey) continue;
        const seen = isinByKey.get(x.securityKey);
        if (seen && seen !== x.isin) {
          isinConflicts.set(x.securityKey, [...new Set([...(isinConflicts.get(x.securityKey) ?? [seen]), x.isin])]);
          continue;
        }
        isinByKey.set(x.securityKey, x.isin);
      }
    }
  }
  for (const k of isinConflicts.keys()) isinByKey.delete(k);
  // ── THE OTHER HALF OF THE SAME QUESTION ──────────────────────────────────
  //
  // The check above asks "does one KEY carry two ISINs" — a key naming two
  // securities. This asks the reverse: does one ISIN carry two KEYS — one
  // security keyed twice, so its rows never add up. An ISIN is evidence neither
  // NAME controls, which is what makes it a witness rather than a guess.
  //
  // IT WOULD NOT HAVE CAUGHT THE ICICI SPLIT, and that is worth stating rather
  // than implying: the depository row carried INE090A01021 and the PMS row
  // carried no ISIN at all, so there was nothing to compare. The two guards are
  // complementary — this one names what an identifier can prove, and the
  // depository strip in `securityKeyOf` closes what only the name can show.
  const keysByIsin = new Map();
  for (const d of docs) {
    for (const h of d.holdings ?? []) {
      if (!h?.isin || !h.securityKey) continue;
      (keysByIsin.get(h.isin) ?? keysByIsin.set(h.isin, new Map()).get(h.isin)).set(h.securityKey, h.security);
    }
  }
  const splitByIsin = [...keysByIsin].filter(([, v]) => v.size > 1);
  notes.push(splitByIsin.length === 0
    ? "identity: 0 ISIN(s) are held under two securityKeys — no security in this archive is keyed twice."
    : `identity: ${splitByIsin.length} ISIN(s) are held under TWO OR MORE securityKeys — one security keyed `
      + `twice, so its rows never add up. Each is a name one issuer CLIPS and another spells out, which no `
      + `rule here bridges: the depository strip only ever REMOVES furniture and never supplies a name the `
      + `statement did not print. Closing them needs a hand-checked alias, not another statement: `
      + splitByIsin.map(([i, v]) => `${i} (${[...v.keys()].join(" / ")})`).join("; "));

  notes.push(isinConflicts.size === 0
    ? "identity: 0 securityKey(s) carry two different ISINs — no key in this archive names two securities."
    : `identity: ${isinConflicts.size} securityKey(s) carry TWO DIFFERENT ISINs and are left with none — `
      + `two identifiers for one key means the key names two securities: `
      + [...isinConflicts].map(([k, v]) => `${k} (${v.join(", ")})`).join("; "));

  /**
   * THE DEDUPE TAG MUST SURVIVE THE SUPERSEDE RULE.
   *
   * `duplicateHoldings` (check (c) in reconcile.mjs) matches on the security
   * plus the FIGURES that would have to coincide by chance for the match to be
   * innocent, and `applyDedupePolicy` writes `dedupeGroup` onto the holdings of
   * the documents it matched. That is right for detection and it is the wrong
   * granularity for the book, because those two things happen at different
   * layers: the reconciler tags a DOCUMENT, and this file then picks ONE ISSUE
   * per account per report type. When the two accounts' statements are drawn at
   * the same date the picked issue is the tagged one and nobody notices.
   *
   * 360 ONE Special Opportunities Fund Series 8 Class A3 is the case where they
   * came apart, and it cost this book a rupee figure:
   *
   *   CRN 37702 (Ajay)   2026-06-30   990,429.684 units   Rs 1,45,80,412.51  tagged
   *   CRN 60117 (Bharat) 2026-06-30   990,429.684 units   Rs 1,45,80,412.51  tagged
   *   CRN 37702 (Ajay)   2026-07-31   990,429.684 units   Rs 1,46,68,362.66  UNTAGGED
   *
   * 37702's July issue supersedes its June one — correctly, it is a snapshot —
   * and carries no tag, because at 31 July the mark had moved and the pair no
   * longer matched on figures. So the group kept ONE member in the book,
   * `dedupedPositions` had nothing to collapse, and the SAME 990,429.684 units
   * were counted under both CRNs: Rs 1.47 Cr of double-count in the consolidated
   * total and in the AIF section that shows it.
   *
   * The duplication is a fact about the ACCOUNTS — two CRNs of one wealth
   * platform reporting one AIF holding — not about one month's mark. Once the
   * reconciler has established it on any issue, it holds for every issue of that
   * account carrying that security, which is what this map applies. Same join as
   * the ISIN and asset-class ones above: this drop's own paperwork, applied where
   * it is unambiguous, never inferred.
   *
   * The tag is taken from the NEWEST issue that carries one, so a group id that
   * changed shape between months resolves to the current answer rather than to
   * whichever document happened to be read first.
   */
  const dedupeByAcctSec = new Map();
  for (const d of [...docs].sort((a, b) => String(a.asOf ?? "").localeCompare(String(b.asOf ?? "")))) {
    const k = acctKey(d);
    if (!k) continue;
    for (const h of d.holdings ?? []) {
      if (!h?.securityKey || !h.dedupeGroup) continue;
      dedupeByAcctSec.set(`${k}|${h.securityKey}`, {
        dedupeGroup: h.dedupeGroup,
        alsoReportedUnder: h.alsoReportedUnder?.length ? [...h.alsoReportedUnder] : [],
      });
    }
  }

  // Asset class per security, from the reports that DO print one. Same kind of
  // join as the ISIN above: this drop's own paperwork, never inferred from text.
  const classByKey = new Map();
  for (const d of docs) {
    for (const arr of [d.holdings, d.transactions]) {
      for (const x of arr ?? []) {
        if (x?.securityKey && x.assetClass && !classByKey.has(x.securityKey)) classByKey.set(x.securityKey, x.assetClass);
      }
    }
  }

  const accounts = [];
  const positions = [];
  const capitalGains = [];
  const accountCashFlows = {};
  /** The family's OWN dated investments — see `capitalMovesFrom`. */
  const capitalMoves = [];
  /** Accounts whose own printed running balance proves the record starts at inception. */
  const capitalFromInception = new Set();
  /** A fund moving a holding between its own unit classes — see `reclassificationsFrom`. */
  const reclassifications = [];
  const accountReturns = {};
  const corporateActionsAll = [];
  const realisedByClass = new Map();
  const accountBridges = {};
  const unclassified = new Map();
  /** Accounts read in full and deliberately left OUT — see excludedFromBook. */
  const excludedAccounts = [];
  /**
   * THE FAMILY'S OWN BANK ACCOUNTS — read in full, in no total, and reported
   * with the four figures their statements print.
   *
   * They are in `excludedAccounts` too, which is what keeps them out of the
   * book; this carries what that table cannot. Its value column is headed
   * "Value on its own statement" and is summed into one figure across every
   * excluded account, which for a portfolio is a market value. A bank balance
   * is not one, and adding the two under that heading would be a total over two
   * different kinds of thing — §"a total must tie to its own columns". So the
   * balance is reported here, under its own heading, beside the debits and
   * credits that produced it.
   *
   * IT REACHES THE REPORT AND NOT THE BOOK, and that was measured rather than
   * reasoned: neither this nor `excludedAccounts` is emitted to `glowData.ts`,
   * so a savings statement in the archive changes NOT ONE BYTE of it. Run with
   * one synthetic HDFC statement added to a scratch copy of the archive, every
   * export of the emitted book — `BOOK_SUMMARY` included, `accountsCount` with
   * it — is byte-identical to the committed one. That is the whole safety
   * argument for landing this delivery, so it is a measurement here rather than
   * a claim in a stage note.
   */
  const bankAccounts = [];
  /** Positions whose lot register does not account for the units held — no split. */
  const splitUnreconciled = [];
  /** Positions whose statement cost FIFO over the fund's own unit record restates — named in the report. */
  const fifoRestated = [];
  /** The FIFO lots still held, per `${accountId}|${securityKey}` — the per-contribution breakdown's source. */
  const fifoLotsByPosition = new Map();
  /** FIFO's cost for a holding a class SWITCH alone moved — checked against the switch carry, never applied. */
  const fifoSwitchOnly = [];
  /** Holdings on an account with a capital gain statement whose realised half no window of it reaches — null, named. */
  const realisedWithheld = [];
  /**
   * UNDRAWN CAPITAL — money the family OWES a fund on demand.
   *
   * Carried as its own collection and NOT as a holding, because it is not one:
   * `undrawn` is a liability the fund can call, and adding it to NAV would count
   * money that has not been invested as if it had been. The fund's CURRENT VALUE
   * is already a position; putting it here too would count it twice.
   *
   * The Morning CIO's dry-powder tile read `privateMarkets` and, finding it
   * empty, printed "no fund commitments in this book" while two Transition
   * Venture statements reporting Rs 75 L undrawn each sat unread in `source/`.
   * Denying a figure is worse than omitting it: a reader plans around it.
   */
  const commitments = [];
  /**
   * HELD, AND VALUED BY NO STATEMENT — one row per holding the authoritative
   * holdings document reports with a quantity and no market value. Emitted as
   * `BOOK_UNVALUED_HOLDINGS`; see the push below and the post-loop pass.
   */
  const unvaluedHoldings = [];
  /** Every row the family's keep-unvalued table reached — checked for dead entries below. */
  const keptUnvaluedHits = [];

  for (const [key, allIssues] of [...byAccount.entries()].sort()) {
    const group = newestPerReportType(allIssues, notes, `account ${key}`);
    /**
     * DATED ROWS SURVIVE SUPERSESSION. `group` holds the newest issue of each
     * report type — the right basis for a snapshot. `dated` holds every dated row
     * across ALL issues, deduped, because a trade on a superseded statement still
     * happened. See `datedRowsAcross`.
     */
    const dated = datedRowsAcross(
      allIssues, new Set(group.map((d) => d.docKey)), notes, `account ${key}`,
    );
    const sample = group.find((d) => d.reportType === "appraisal") ?? group[0];
    const provider = sample.provider;
    const accountNo = sample.accountNo;
    const accountId = accountIdOf(provider, accountNo);

    // ── the account ──
    // as-of is the APPRAISAL's date: the holdings are what the account view
    // shows, and a later transaction statement does not restate them.
    const holdingsDoc = authoritative(group, provider, "holdings");
    const asOf = holdingsDoc?.asOf ?? sample.asOf ?? null;
    const inception = group.map((d) => d.inceptionDate).find(Boolean) ?? null;
    /**
     * HOW FAR THE DATED CAPITAL RECORD REACHES — the other end of the question
     * `contributionsAreComplete` asks about inception.
     *
     * A record of the family's payments is complete only if it covers the whole
     * life of the account: back to inception, AND forward to the date its value
     * is struck. The first half was checked; nothing checked the second. Green
     * Lantern 510861's payments come from its QUARTERLY SEBI investor report,
     * which ends 30 Jun, while its holdings are struck on 27 Jul — so its dated
     * net stood ₹6,350 above the fact sheet's for that date, every rupee of it a
     * withdrawal the record had not reached. Small here; a contribution missed
     * the same way would be any size at all.
     *
     * The latest window end of the documents that CARRY a payment row. A
     * statement listing every payment since inception has no window and is
     * complete to its own date, so it answers with its as-of.
     */
    const capitalRecordTo = allIssues
      .filter((d) => (d.cashFlows ?? []).some((c) => c.date && CAPITAL_KINDS.has(c.kind)))
      .map((d) => d.periodTo ?? d.asOf)
      .filter(Boolean).sort().at(-1) ?? null;
    const ownerId = group.map((d) => d.ownerId).find(Boolean) ?? null;

    /**
     * AN ACCOUNT ITS OWN STATEMENT SAYS IS SOMEBODY ELSE'S.
     *
     * The mutual-fund folio reader reads the holder's TAX STATUS off the page.
     * Three of those folios are held by `HOPE INDIA TRUST` — a separate taxpayer
     * — and the scheme disclosure has no holder at all. Reading them was right;
     * ADDING them to a family total would put ₹2.50 Cr of somebody else's money
     * into this family's net worth.
     *
     * `excludedFromBook` carries the reason, and it is honoured HERE rather than
     * by a filter somewhere further downstream, so the exclusion happens once and
     * the reason travels with it into the build report. Three properties matter:
     *
     *   • the account is NOT in `accounts`, so no page can sum it by accident;
     *   • the reason is printed, so a reader can see the money exists and why it
     *     is not counted — the opposite of a figure quietly going missing;
     *   • it is REVERSIBLE by one entry in shared/owners.mjs, because whether the
     *     family consolidates its trust is the family's decision, not a parser's.
     */
    const excluded = group.map((d) => d.excludedFromBook).find(Boolean) ?? null;
    if (excluded) {
      const value = group.map((d) => d.totals?.totalMarketValue).find(isNum) ?? null;
      /**
       * AND AN ACCOUNT WHOSE STATEMENT VALUES NOTHING SAYS SO, rather than
       * leaving a dash to be read as "the pipeline lost it". Motilal Oswal demat
       * 32387399 was reported here at ₹8.23 Cr until Stage 10cz — the sum of its
       * statement's value column, which is the price of each holding's last
       * depository movement times that movement's quantity, not a valuation —
       * and was here at all until Stage 10db, when its holder was established
       * and it entered the registry. No account takes this branch on this book;
       * it is kept for the next one a drop cannot attribute.
       */
      const heldRows = group.flatMap((d) => d.holdings ?? []);
      /**
       * A BANK ACCOUNT STATES A BALANCE AND NOT A VALUE, and the two must not
       * share a column. `value` stays null — it is the market value of what an
       * account HOLDS, and a savings account holds nothing — and the balance is
       * reported in `bankAccounts` below. Without this the excluded table would
       * read "—" for an account whose statement prints its balance four times,
       * which is a dash standing where a figure exists.
       */
      /**
       * AND EVERY ISSUE IS REPORTED, NOT ONLY THE NEWEST — because a bank tape
       * is nothing BUT dated rows.
       *
       * `group` is `newestPerReportType`'s set, which is right about a snapshot
       * and wrong here, and `DATED_COLLECTIONS` already unions `cashFlows` across
       * every issue for exactly that reason. Read off `group`, an account that
       * sent four quarterly statements PUBLISHED four quarters of rows and
       * REPORTED one quarter's balances and one quarter's tie-out — so the
       * section claimed "every check reconciles" while showing the evidence for
       * a quarter of what it had published. Each statement is its own row, which
       * the Period column already implies, and the closing-balance total takes
       * the NEWEST per account below, because an account holds one balance.
       */
      const bankDocs = allIssues.filter((d) => d.reportType === "bank-statement")
        .sort((a, b) => String(a.docKey).localeCompare(String(b.docKey)));
      for (const d of bankDocs) {
        bankAccounts.push({
          accountId, provider, accountNo,
          owner: d.owner ?? null,
          /**
           * `asOf` IS THE LAST RESORT, because a REFUSED statement publishes no
           * `flows` at all — and the refused list below names each one by its
           * period, which would be a dash on every one of them, so two refused
           * statements of one account could not be told apart. The reader's own
           * figure still wins wherever it published one.
           */
          periodFrom: d.flows?.periodFrom ?? d.periodFrom ?? null,
          periodTo: d.flows?.periodTo ?? d.periodTo ?? d.asOf ?? null,
          openingBalance: isNum(d.flows?.openingBalance) ? d.flows.openingBalance : null,
          closingBalance: isNum(d.flows?.closingBalance) ? d.flows.closingBalance : null,
          debits: isNum(d.flows?.debits) ? d.flows.debits : null,
          credits: isNum(d.flows?.credits) ? d.flows.credits : null,
          rows: (d.cashFlows ?? []).filter((c) => c.kind === "bank-statement").length,
          /**
           * WHICH CHECKS THIS STATEMENT ITSELF SUPPLIED A FIGURE FOR. The two
           * banks supply different sets, so the report names them per account
           * rather than asserting a list that is false of half the drop.
           */
          checks: d.checks ?? null,
          status: d.status ?? null,
        });
      }
      const valueWhy = value === null && bankDocs.length
        ? "it is a bank account rather than a holding, so its statement states no market value; its balance is in the bank-account section below"
        : value === null && heldRows.some((h) => isNum(h.lastMovementRate) && h.lastMovementRate > 0)
          ? `its statement prints ${heldRows.length} holding(s) as quantities, with the price of each one's last depository movement rather than a valuation, so it states no value`
          : null;
      /**
       * WHICH KIND OF EXCLUSION THIS IS, because the report's own prose cannot
       * be true of both. An account held by another taxpayer belongs to somebody
       * else and ENTERS THE BOOK with one entry in `shared/owners.mjs`; the
       * family's own savings account belongs to them, is excluded for what it IS
       * rather than for whose it is, and no owner entry would ever bring it in —
       * that is their decision about what Cash means, taken against the balance
       * in the bank-account section below. Said of every row at once, each
       * sentence is false of half the table.
       */
      const kind = bankDocs.length ? "own-bank-account" : "other-holder";
      excludedAccounts.push({ accountId, provider, accountNo, owner: group.map((d) => d.owner).find(Boolean) ?? null, value, valueWhy, reason: excluded, kind });
      notes.push(`account ${accountNo} (${provider}) is NOT in the book: ${excluded}`
        + (value !== null ? ` Value on its own statement: ${value.toLocaleString("en-IN")}.` : "")
        + (valueWhy ? ` Value: none stated — ${valueWhy}.` : ""));
      continue;
    }
    /**
     * AN ACCOUNT NOBODY CAN BE SHOWN TO OWN DOES NOT ENTER THE BOOK.
     *
     * `Account.owner` is a string, not `string | null`, and that is the model
     * saying every account in this book belongs to a named family member. An
     * account that resolves to no canonical owner has to go somewhere, and the
     * two wrong answers are both available: widen the type — which weakens it
     * for all 23 accounts to accommodate one — or emit `owner: null` and let a
     * page render an account attributed to nobody.
     *
     * It is excluded instead, by the same mechanism and for the same reason as
     * the HOPE INDIA TRUST folios: the account is not summed, the reason is
     * printed so a reader can see it exists and why it is not counted, and it
     * returns the moment the identity can be read.
     *
     * THE CASE THAT PRODUCED THIS: 360 ONE Alternates folio 1000633 is named
     * only on two ENCRYPTED statements. Extracted with the password they read
     * and the folio is Bharat Jaisinghani's; extracted without it they fail,
     * and the one other document mentioning the folio prints the holder as the
     * literal word "Investor". So the owner is genuinely unreadable, and
     * guessing it from a filename would be exactly the fabrication this book
     * refuses everywhere else.
     */
    if (!ownerId) {
      const failed = group.filter((d) => d.status === "failed");
      const encrypted = failed.some((d) => (d.warnings ?? []).some((w) => String(w.code ?? "").includes("encrypt")));
      const reason = failed.length
        ? `no readable statement names its holder — ${failed.length} of its ${group.length} document(s) failed to extract`
          + (encrypted ? ", being encrypted with a password this run was not given" : "")
        : "no statement for it resolves to a canonical owner";
      excludedAccounts.push({
        accountId, provider, accountNo,
        owner: group.map((d) => d.owner).find(Boolean) ?? null,
        value: group.map((d) => d.totals?.totalMarketValue).find(isNum) ?? null,
        reason,
        kind: "unresolved-holder",
      });
      notes.push(`account ${accountNo} (${provider}) is NOT in the book: ${reason}. `
        + "It is excluded rather than carried with an empty owner, because an account attributed to nobody is a worse figure than a named absence.");
      continue;
    }

    accounts.push({
      accountId,
      provider,
      accountNo,
      ownerId,
      owner: ownerById(ownerId)?.displayName ?? null,
      strategy: group.map((d) => d.strategy).find(Boolean) ?? null,
      engagement: group.map((d) => d.engagement).find((e) => e && e !== "unknown") ?? "unknown",
      providerEngagement: group.map((d) => d.providerEngagement).find(Boolean) ?? null,
      members: sample.members ?? [],
      asOf,
      inceptionDate: inception,
      capitalRecordTo,
      custodian: provider,
      /**
       * WHY THIS ACCOUNT HAS NO POSITIONS, when it has none.
       *
       * Filled in below, once the positions for this account are known. Some
       * accounts genuinely hold nothing (an MF folio redeemed to zero units);
       * others hold plenty and simply publish no VALUATION — 360 ONE's alternates
       * arm sends income statements for a folio the wealth arm values under a
       * different account number. Both render `₹0` without this, and only one of
       * them means "empty".
       */
      noPositionsReason: null,
    });
    /**
     * The account this group just produced, for the positions built below: the
     * SEBI category an AIF's holding is placed by is read from the security
     * name AND from this account's own `providerEngagement`, and only one of
     * the two is on the holding. Captured rather than re-found, because
     * `accounts[accounts.length - 1]` at the push site reads correctly and
     * would go on reading correctly if a second push ever landed between them.
     */
    const acctForPositions = accounts[accounts.length - 1];

    // ── commitments ──
    // Only where a statement PRINTS a commitment block. A fully-funded mandate
    // has no undrawn capital, and inventing a zero for it would put every PMS
    // account into a dry-powder table it does not belong in.
    for (const d of group) {
      const c = d.commitment;
      if (!c || !isNum(c.total)) continue;
      commitments.push({
        accountId,
        name: d.strategy ?? provider,
        provider,
        ownerId,
        asOf: d.asOf ?? null,
        committed: r2(c.total),
        drawn: r2(c.contributed),
        // The statement prints BOTH the contributed and the undrawn figure. The
        // undrawn one is taken as printed rather than derived, and the two are
        // checked against the commitment: a fund that says 1.5 Cr committed,
        // 75 L drawn and 75 L undrawn is stating the same fact three ways, and
        // any drift between them is the fund's, not ours to smooth.
        undrawn: r2(c.undrawn),
        distributed: r2(c.distributed),
        /**
         * COMMITTED, CALLED AND PAID ARE THREE FIGURES — see the header note in
         * `providers/altFundStatements.mjs`. `drawn` above is whichever of the
         * last two its own layout matched and is kept exactly as it was; these
         * are read from the line each statement LABELS, and stay null where it
         * labels neither rather than borrowing from the other.
         *
         * `pending` is called-and-not-yet-paid: the only figure in this corpus
         * that answers "what is due now", and a MEASURED zero on the two
         * statements that print it.
         */
        called: r2(c.called),
        paid: r2(c.paid),
        pending: r2(c.pending),
        /**
         * The dated calls, each already reconciled against its own statement's
         * printed total by the reader — a set that did not tie is EMPTY here
         * rather than partial, so a timeline built on this can never be one
         * call short of what the family actually paid.
         */
        calls: (c.calls ?? []).map((k) => ({ date: k.date, label: k.label ?? null, amount: r2(k.amount) })),
        /**
         * WHAT THE FUND PAID BACK, dated, each already reconciled by the reader
         * against the totals its own statement prints. NULL where the book
         * carries no payout record for the fund and `[]` only where the
         * statement prints a measured nil — the two are different claims, and a
         * money-weighted return may lean on the second and never on the first.
         */
        payouts: c.payouts == null ? null : c.payouts.map((k) => ({
          date: k.date, kind: k.kind, label: k.label ?? null,
          gross: r2(k.gross), tds: r2(k.tds), net: r2(k.net),
          inPrintedTotal: k.inPrintedTotal !== false,
        })),
        arithmeticHolds: isNum(c.total) && isNum(c.contributed) && isNum(c.undrawn)
          ? Math.abs(c.total - c.contributed - c.undrawn) <= 1
          : null,
      });
    }

    // ── positions ──
    // Primitives come from the appraisal; the sector from the fact sheet and the
    // accrued income / IRR from CURRENT PORTFOLIO, each per precedence.
    const sectorDoc = authoritative(group, provider, "providerSector");
    const incomeDoc = authoritative(group, provider, "accruedIncome");
    const sectorByKey = new Map((sectorDoc?.holdings ?? []).map((h) => [h.securityKey, h.providerSector]));
    const incomeByKey = new Map((incomeDoc?.holdings ?? []).map((h) => [h.securityKey, h]));

    /**
     * COST BASIS FROM THE BROKER'S OPENING POSITIONS — checked on quantity.
     *
     * A depository holding statement prints ISIN, quantity, rate and value and
     * NO COST: the depository holds shares, it did not buy them. So the one
     * account in this book with ISINs was also the one with no cost basis, no
     * unrealised P&L and no return — ten positions rendering `—` for figures the
     * same broker prints two files away.
     *
     * The broker's Global Details ledger opens each security with the position
     * carried forward and its total cost. That is the cost of the SAME shares,
     * as long as it is the same shares — so the join requires the quantities to
     * MATCH EXACTLY. Belrise carries 12,500 into the year and the depository
     * statement shows 12,500 on 31/03; it sold 6,000 on 25/06, and if the
     * valuation had been dated after that the quantities would disagree and this
     * would supply nothing rather than pricing 12,500 shares at the cost of
     * 6,500.
     *
     * Every position that takes a cost this way records `costBasisSource:
     * "opening-position"`, so a reader can see that the figure came from another
     * document and which check let it.
     */
    const openingCost = new Map();
    /** Dated acquisition lots for this account, by security. See openLots below. */
    const lotsByKey = new Map();
    for (const d of group) {
      for (const p of d.positionsAsOf?.positions ?? []) {
        if (p.securityKey && p.opening) openingCost.set(p.securityKey, p.opening);
      }
      for (const l of d.openLots ?? []) {
        if (!l.securityKey) continue;
        lotsByKey.set(l.securityKey, [...(lotsByKey.get(l.securityKey) ?? []), l]);
      }
    }
    /**
     * WHAT EACH HOLDING HAS ALREADY REALISED, matched FIFO by the statement that
     * sold it.
     *
     * The capital gain statements ARE a FIFO match: every lot names the units
     * sold, the date they were bought and what they cost, and the managers'
     * appraisals carry the cost of the units LEFT on the same basis (measured
     * against these lots before this was written). So a holding's realised
     * gain is the sum of its own lots — the proceeds less what those units
     * cost — and the cost of the units sold is what joins it to the return.
     *
     * ONLY LOTS SOLD ON OR BEFORE THE HOLDING'S OWN DATE. LKP's holding
     * statement is struck 31 March; its capital gain statement sells 6,000
     * Belrise on 25 June. The 31 March position still HOLDS those 6,000 units
     * at their 31 March mark, so adding the June gain to it counts the same
     * units twice — once as value, once as profit. A later sale belongs to a
     * later snapshot, and until one arrives it is named rather than added.
     */
    /**
     * A LOT BELONGS TO THE HOLDING WHOSE SALE IT SETTLED, however each document
     * spells the security (DL-1).
     *
     * Green Lantern's capital gain statements print `Axis Liquid Fund - Direct
     * Plan - Growth` where the same account's transaction statement and
     * appraisal print `… - Growth Option`. Keyed on the lot's own spelling, 18
     * lots and ₹8,62,231.63 of realised gain reached no holding, and the holding
     * — seeing a capital gain statement for its account — wrote a MEASURED ₹0.
     * `shared/lotSettlement.mjs` is the ONE rule, read by the runtime ledger
     * too: a lot group settles a day's sale by identity, else by the same
     * account and date with its summed proceeds equal to the sale to the printed
     * precision, else — where a capital gain statement strikes its sale value
     * before STT, as ASK's and Marathon's do — equal to the consideration less
     * brokerage within its four-decimal rates; and where that happens under a
     * different key the account gains an alias. Nothing is inferred from a name,
     * and the archive keeps both spellings.
     *
     * A fund's own allotment or redemption already on the dated capital record
     * is not a sale (same account, security and date, amount within ₹1 of the
     * move's invested-or-amount) — the ledger's own exclusion.
     */
    const saleType = SALE_AUTHORITY.find((rt) => allIssues.some((d) => d.reportType === rt && (d.transactions ?? []).length)) ?? null;
    const typeOfDoc = new Map(allIssues.map((d) => [d.docKey, d.reportType]));
    const ownFundMoves = capitalMovesFrom(dated.cashFlows, accountId, [], `account ${accountNo}`);
    const isOwnFundMove = (sale) => ownFundMoves.some((m) => m.securityKey === sale.securityKey && m.date === sale.date
      && isNum(sale.amount) && isNum(m.invested ?? m.amount) && Math.abs((m.invested ?? m.amount) - sale.amount) <= 1);
    const daySales = saleType ? daySalesOf(dated.transactions
      .filter((t) => t.side === "sell" && t.date && t.securityKey && typeOfDoc.get(t.source) === saleType)
      .map((t) => ({ accountNo, securityKey: t.securityKey, date: t.date, amount: settledOf(t),
        // What a capital gain is struck on: the consideration less brokerage
        // (see pass 3 in shared/lotSettlement.mjs). Null where either is unprinted.
        consideration: isNum(t.gross) && isNum(t.brokerage) ? t.gross - t.brokerage : null,
        quantity: isNum(t.quantity) ? t.quantity : null }))
      .filter((x) => !isOwnFundMove(x))) : [];
    const settlement = settleSales(lotGroupsOf(dated.capitalGains.filter((l) => l.securityKey).map((l) => ({
      accountNo, securityKey: l.securityKey, saleDate: l.saleDate ?? null,
      saleAmount: isNum(l.saleAmount) ? l.saleAmount : null, realised: lotGain(l)?.gain ?? null,
    }))), daySales);
    /**
     * …AND WHERE THE SALE'S SPELLING IS STILL NOT THE HOLDING'S, THE ISIN IS.
     *
     * LKP prints its Liquid BeES lot and sale as `NIPPON INDIA ETF LIQUID BEES`
     * and its depository holding as the clipped `NIP ETNF1D RTLIQBEES`, so the
     * settlement joins lot to sale by identity and neither to the holding. The
     * lot and the holding carry the SAME ISIN (INF732E01037) on the SAME account,
     * which is an identifier, not a name: a lot whose settled key names no
     * holding goes to the one holding of this account printing its ISIN, and to
     * none if two do.
     */
    const heldByKey = new Set((holdingsDoc?.holdings ?? []).map((h) => h.securityKey).filter(Boolean));
    const lotByIsin = [];
    const lotHoldingKey = (l) => {
      const k = settledSecurityOf(settlement.aliases, accountNo, l.securityKey);
      if (heldByKey.has(k) || !l.isin) return k;
      const byIsin = [...new Set((holdingsDoc?.holdings ?? []).filter((h) => h.isin === l.isin && h.securityKey).map((h) => h.securityKey))];
      if (byIsin.length !== 1) return k;
      if (!lotByIsin.some((x) => x.from === k)) lotByIsin.push({ from: k, to: byIsin[0], isin: l.isin });
      return byIsin[0];
    };
    // Which figure each alias was matched on, said in the note: a lot group that
    // met its sale on the settled amount (pass 2) and one that met it on the
    // consideration less brokerage (pass 3) are different evidence.
    const basisOf = (lotKey) => {
      const by = new Set([...settlement.bySale.values()].filter((v) => v.lotSecurityKey === lotKey.slice(lotKey.indexOf("|") + 1)
        && v.by !== "key").map((v) => v.by));
      const words = [];
      if (by.has("amount")) words.push("each day's settled sale to the printed precision");
      if (by.has("consideration")) words.push("each day's consideration less brokerage to the precision of its four-decimal rates");
      return words.join(", or ");
    };
    for (const [lot, saleKey] of [...settlement.aliases].sort()) {
      notes.push(`account ${accountNo}: capital-gain lots printed as \`${lot.slice(lot.indexOf("|") + 1)}\` settle this account's `
        + `sales of \`${saleKey}\` — same account and date, lot proceeds equal to ${basisOf(lot)} — so their realised `
        + "gain is that holding's");
    }
    for (const c of settlement.conflicts) {
      notes.push(`account ${accountNo}: lots printed as \`${c.lot.slice(c.lot.indexOf("|") + 1)}\` settle sales under `
        + `${c.sales.length} different securities (${c.sales.join(", ")}), so they are aliased to none`);
    }
    // A lot group that settles no sale on the authoritative trade record AND
    // names no holding this account carries reaches no figure at all — NAMED,
    // because a realised gain that silently joins nothing looks exactly like a
    // holding that sold nothing.
    {
      const heldKeys = new Set((holdingsDoc?.holdings ?? []).map((h) => h.securityKey).filter(Boolean));
      const stray = settlement.unsettled.filter((g) => !heldKeys.has(settledSecurityOf(settlement.aliases, accountNo, g.securityKey)));
      if (stray.length) {
        notes.push(`account ${accountNo}: ${stray.length} capital-gain lot group(s) settle no sale on this account's `
          + `${saleType ?? "(no)"} trade record and name no holding it carries — ${stray.map((g) => `${g.securityKey} sold ${g.date}`).join("; ")}`);
      }
    }

    const realisedByKey = new Map();
    let lotsAfterSnapshot = 0;
    let lotsUnreadable = 0;
    const hasCgStatement = dated.capitalGains.length > 0;
    for (const l of dated.capitalGains) {
      if (!l.securityKey) continue;
      const k = lotHoldingKey(l);
      if (asOf && l.saleDate && l.saleDate > asOf) {
        lotsAfterSnapshot += 1;
        const e = realisedByKey.get(k) ?? { gain: 0, cost: 0, lots: 0, after: 0 };
        e.after += 1;
        realisedByKey.set(k, e);
        continue;
      }
      const g = lotGain(l);
      if (!g) { lotsUnreadable += 1; continue; }
      const e = realisedByKey.get(k) ?? { gain: 0, cost: 0, lots: 0, after: 0 };
      e.gain += g.gain;
      e.cost += g.cost;
      e.lots += 1;
      realisedByKey.set(k, e);
    }
    /**
     * A ZERO IS A MEASUREMENT ONLY OVER A WINDOW THAT REACHES THE HOLDING (DL-2).
     *
     * LKP's holdings are dated 31 March and every lot on its capital gain
     * statement for Belrise, Capri, Electronics Mart, Jyothy and Varun was sold
     * after it — so the realised gain those holdings carry up to their own date
     * was struck over no sale of theirs at all, and ₹0 there read as "sold
     * nothing" beside a Capital Gains page showing +₹7 L. Where every lot for
     * the name falls after the holding's date, or the record's window opens
     * after it, the realised half is NULL — and `realisedReason` says which
     * sales came later — never a zero.
     */
    for (const x of lotByIsin) {
      notes.push(`account ${accountNo}: capital-gain lots of \`${x.from}\` belong to its holding \`${x.to}\` — the same `
        + `ISIN (${x.isin}) on the same account, where the depository clips the name the lot and the sale print in full`);
    }
    const cgOpens = allIssues.filter((d) => (d.capitalGains ?? []).length).map((d) => d.periodFrom).filter(Boolean).sort()[0] ?? null;
    const cgReachesHolding = hasCgStatement && !!asOf && !!cgOpens && cgOpens <= asOf;
    if (lotsAfterSnapshot) {
      notes.push(`account ${accountNo}: ${lotsAfterSnapshot} capital-gain lot(s) were sold after this account's holding statement of ${asOf}, `
        + "so the units they sold are still IN that statement's positions at its own mark. Their gain is on the capital gain "
        + "statement and is not added to any position's return — doing so would count the same units once as value and once as profit.");
    }
    if (lotsUnreadable) notes.push(`account ${accountNo}: ${lotsUnreadable} capital-gain lot(s) print neither proceeds and cost nor a gain, and carry no realised figure`);

    /** FIFO over the fund's own unit record, where anything was sold or switched. */
    const fundFifo = fifoFromCashFlows(dated.cashFlows);
    const unitRecord = dated.cashFlows;
    if (fundFifo?.reason) notes.push(`account ${accountNo}: FIFO not run over the fund's unit record — ${fundFifo.reason}; the statement's own cost stands`);

    const costFor = (key, quantity) => {
      const o = openingCost.get(key);
      if (!o || !isNum(o.quantity) || !isNum(quantity) || !isNum(o.totalCost)) return null;
      if (Math.abs(o.quantity - quantity) > 1e-6) return null;   // not the same shares
      return r2(o.totalCost);
    };

    // ── income, by EVENT TYPE rather than by report ──
    //
    // The two statements overlap but neither contains the other. The DIVIDEND
    // STATEMENT is authoritative for cash dividends — it alone carries the ex
    // and received dates, the per-unit rate and the TDS. CORPORATE BENEFITS is
    // authoritative for NON-CASH actions — a bonus issue, a split, a rights
    // entitlement — which the dividend statement has no row shape for.
    //
    // Preferring one report wholesale, as this did, silently dropped every bonus
    // and split in the book. So each event goes to the reader that owns its
    // KIND, and a cash event listed by both is deduped on (date, security,
    // amount) with the dividend statement winning.
    const CASH_KIND = /^dividend$/i;
    const cashSeen = new Set();
    const dividendByKey = new Map();
    const corporateActions = [];
    // The DIVIDEND STATEMENT wins a cash event listed by both reports, so its
    // rows come first — `datedRowsAcross` has already deduped identical rows
    // across issues, and this orders what remains.
    const ordered = [
      { income: dated.income.filter((e) => /dividend-statement/.test(e.source ?? "")) },
      { income: dated.income.filter((e) => !/dividend-statement/.test(e.source ?? "")) },
    ];
    for (const d of ordered) {
      for (const ev of d.income ?? []) {
        if (!ev.securityKey) continue;
        const isCash = CASH_KIND.test(ev.kind ?? "");
        if (isCash) {
          if (!isNum(ev.netAmount)) continue;
          const k = `${ev.exDate ?? ""}|${ev.securityKey}|${ev.netAmount}`;
          if (cashSeen.has(k)) continue;         // same event, both reports
          cashSeen.add(k);
          dividendByKey.set(ev.securityKey, r2((dividendByKey.get(ev.securityKey) ?? 0) + ev.netAmount));
        } else {
          // Non-cash: a bonus prints Amount 0.00, and that zero is REAL — the
          // entitlement is the substance. Carried as an action, never summed
          // into dividend income.
          corporateActions.push({
            security: ev.security,
            securityKey: ev.securityKey,
            accountId,
            kind: ev.kind,
            exDate: ev.exDate,
            quantity: ev.quantity,
            entitlement: ev.entitlement,
            amount: ev.netAmount,
            source: ev.source,
          });
        }
      }
    }

    /**
     * A HOLDING ITS FUND HAS NOT VALUED DOES NOT BECOME A POSITION.
     *
     * `Position.marketValue` is `number`, not `number | null`, and that is the
     * model saying every position in this book is worth something measurable.
     * India SME Investments Fund II sends three folios — one per member — that
     * print a commitment, the capital drawn against it and the units it bought,
     * and NO NAV and NO valuation anywhere on the page.
     *
     * The three wrong answers were all available: carry the drawn capital as if
     * it were the value (publishing a valuation the fund never struck), carry
     * zero (a fabricated figure, and the worse one because it is plausible), or
     * widen the type for all 300-odd positions to accommodate three.
     *
     * The account is kept, its units and cost are kept in the archive, and the
     * account carries the REASON — the same mechanism 360 ONE Alternates
     * already uses for a folio whose documents report income and no valuation.
     * The commitment goes to the commitment register, which is where a drawdown
     * fund's called and uncalled capital belongs.
     */
    const allHoldings = holdingsDoc?.holdings ?? [];
    const unvalued = allHoldings.filter((h) => !isNum(h.marketValue));
    /**
     * AND EVERY ONE OF THEM IS EMITTED, not only named in the report.
     *
     * The two notes below NAME these rows in docs/BOOK-REPORT.md and nothing on
     * screen could read them: `Position` is the valued set, so an account holding
     * some unvalued rows beside valued ones showed only the valued ones, and an
     * account holding nothing BUT unvalued rows showed an empty account. So each
     * row is carried as a quantity — never as a value, and never summed into any
     * total — with the reason IT carries none. The reason is the ROW's, because
     * the two causes send a reader to different documents: a custodian records
     * units, and the face value they were allotted at where it holds no price; a
     * fund's own statement that prints no NAV is a fact about the fund.
     */
    /**
     * THE TAPE THAT DATES A DEPOSITORY'S RATE — this account's own transaction
     * statement, where the drop carries one. See `lastMovementOf`.
     */
    const tape = group.find((d) => d.reportType === "demat-transactions") ?? null;
    for (const h of unvalued) {
      if (!h.securityKey) continue;
      const custody = CUSTODY_PROVIDERS.has(provider);
      const qty = isNum(h.quantity) ? h.quantity : null;
      const fv = isNum(h.faceValue) ? h.faceValue : null;
      /**
       * A RATE THAT IS THE PRICE OF THE LAST MOVEMENT SAYS SO, AND SAYS WHEN.
       *
       * This branch used to say "prints no rate for this holding" about every
       * custody row without a face value — and 43 Motilal Oswal rows DO print a
       * rate, which until Stage 10cz this book used as their market price. A
       * reason that denies what the page prints sends a reader to look for a
       * document they are holding; one that shows the rate without its date
       * reads as a mark. So a row carrying a last-movement rate names it, the
       * movement it belongs to where the tape shows it, and why it values
       * nothing either way.
       */
      const moved = custody ? lastMovementOf(h, tape) : null;
      const units = (v) => v.toLocaleString("en-IN", { maximumFractionDigits: 3 });
      const unitsHeld = qty !== null ? units(qty) : "these";
      const money = (v) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 3 })}`;
      // THE FAMILY'S DECISION OUTRANKS THE STATEMENT'S OWN REASON, AND KEEPS ITS
      // FACTS. Where the family have decided a row stays unvalued (Ankita's
      // locked-in Clean Max shares, 28 Sep 2026) the reason says so, so the
      // absence reads as chosen rather than missed. It never values the row —
      // and the live layer reads the same table (`src/lib/depositoryShares.ts`),
      // so no quote values it either.
      const kept = keptUnvaluedFor({ provider, accountNo, isin: h.isin });
      if (kept) keptUnvaluedHits.push(kept);
      const reason = kept ? keptUnvaluedReason(kept, holdingsDoc.asOf)
        : !custody
        ? `the fund's own statement of ${holdingsDoc.asOf} reports ${qty ?? "these"} unit(s) and no NAV and no valuation — `
          + "there is nothing to value them at, and the capital drawn against them is what was paid, not what the stake is worth"
        : fv !== null
        ? `the ${provider} statement of ${holdingsDoc.asOf} records ${qty ?? "these"} unit(s) at their face value of ${fv}, `
          + "the value they were allotted at — not a mark anybody struck, so they carry a quantity and no value"
        : moved?.date
        ? `the ${provider} statement of ${holdingsDoc.asOf} prints the price of this holding's last depository movement — `
          + `${money(moved.rate)} a unit, on a ${moved.side} of ${units(moved.units)} unit(s) on ${moved.date} — `
          + `not a valuation of the ${unitsHeld} unit(s) held, so it carries a quantity and no value`
        : moved && !moved.onTape
        ? `the ${provider} statement of ${holdingsDoc.asOf} prints the price of this holding's last depository movement, `
          + `${money(moved.rate)} a unit — not a valuation of the ${unitsHeld} unit(s) held. This account's transaction statement, `
          + `from ${moved.tapeFrom ?? "its first day"}, does not move it, so that price is older still. It carries a quantity and no value`
        : moved
        ? `the ${provider} statement of ${holdingsDoc.asOf} prints the price of a depository movement, ${money(moved.rate)} a unit, `
          + "that this account's transaction statement does not reproduce, so when it was struck is not known — it is not a valuation "
          + `of the ${unitsHeld} unit(s) held, so they carry a quantity and no value`
        : `the ${provider} statement of ${holdingsDoc.asOf} prints no rate for this holding, so it carries a quantity and no value`;
      unvaluedHoldings.push({
        accountId, ownerId, securityKey: h.securityKey, security: h.security, isin: h.isin || null,
        assetClass: h.assetClass ?? null, quantity: qty, faceValue: fv,
        lastMovementRate: moved?.rate ?? null, lastMovementValue: moved?.value ?? null,
        lastMovementDate: moved?.date ?? null, lastMovementSide: moved?.side ?? null,
        asOf: holdingsDoc.asOf ?? null,
        sameUnitsReportedBy: null, reason,
      });
    }
    /**
     * WHAT EACH UNVALUED ROW PRINTS INSTEAD OF A VALUE, counted — a face value,
     * the price of the last depository movement, or nothing at all. Three
     * different things, and the note used to call every one of them "no NAV".
     */
    const unvaluedKinds = (() => {
      const face = unvalued.filter((h) => isNum(h.faceValue)).length;
      const moved = unvalued.filter((h) => !isNum(h.faceValue) && isNum(h.lastMovementRate) && h.lastMovementRate > 0);
      const dated = moved.filter((h) => lastMovementOf(h, tape)?.date).length;
      const bare = unvalued.length - face - moved.length;
      return [
        moved.length ? `${moved.length} with the price of their last depository movement (${dated} dated on this account's transaction statement, `
          + `${moved.length - dated} older than it)` : null,
        face ? `${face} at the face value they were allotted at` : null,
        bare ? `${bare} with no rate at all` : null,
      ].filter(Boolean).join(", ");
    })();
    if (unvalued.length && unvalued.length === allHoldings.length && CUSTODY_PROVIDERS.has(provider)) {
      /**
       * THE LIVE LAYER IS NAMED ONLY WHERE IT HAS SOMETHING TO VALUE. A row
       * held at its face value alone (an unlisted preference share) or an AIF
       * unit (the fund values its own units) is reached by no current price, so
       * an account holding nothing else is told only that it values nothing.
       */
      const priceable = unvalued.some((h) => h.assetClass !== "AIF" && !isNum(h.faceValue));
      notes.push(`account ${accountNo} (${provider}) contributes no market value on the statement basis: its statement of ${holdingsDoc.asOf} `
        + `carries ${unvalued.length} holding(s) as quantities — ${unvaluedKinds}. None of those is a valuation of the balance, `
        + "so the units are in the archive and out of every statement-basis total"
        + (priceable ? "; the live layer values the ones a current price reaches — a fund at its published NAV, a listed share at its quote." : "."));
    } else if (unvalued.length && unvalued.length === allHoldings.length) {
      notes.push(`account ${accountNo} (${provider}) contributes no market value: its statement of ${holdingsDoc.asOf} `
        + `carries ${unvalued.length} holding(s) with units and cost and NO NAV, so there is nothing to value them at. `
        + `Units and cost are in the archive; the consolidated total does not include them.`);
    } else if (unvalued.length) {
      /**
       * AND THE PARTIAL CASE IS THE ONE THAT WENT UNREPORTED.
       *
       * The note above fires only when EVERY row in an account is unvalued. An
       * account whose statement values some rows and not others passed it
       * silently, and the unvalued rows were dropped by the filter below with
       * nothing said anywhere — which is the "shown for those and the rest are
       * NAMED" rule failing inside an account instead of across accounts.
       *
       * ICICI Bank's NSDL statement is 38 holdings of which the depository marks
       * 14 and records the other 24 at the face value they were allotted at:
       * National Stock Exchange of India Ltd at Re 1 a share, sixteen private
       * companies at Rs 10. Those 24 are real holdings the family owns and this
       * book cannot value, and a reader has to be told which they are — not left
       * to notice that 38 rows became 12 positions.
       */
      notes.push(`account ${accountNo} (${provider}) carries ${unvalued.length} of ${allHoldings.length} holding(s) `
        + `with NO market value, so they are in the archive and out of every total: `
        + `${unvalued.map((h) => `${h.security}${isNum(h.quantity) ? ` (${h.quantity} unit(s)` : " ("}`
          + `${isNum(h.faceValue) ? `, recorded at a face value of ${h.faceValue}`
            : isNum(h.lastMovementRate) && h.lastMovementRate > 0 ? `, last moved at ${h.lastMovementRate}`
            : ", no price published"})`).join("; ")}. `
        + "A depository prints the value a security was allotted at, or the price its last movement went through at, "
        + "where it holds no mark for it, and neither is a valuation: carried, either would state one nobody struck. The remaining "
        + `${allHoldings.length - unvalued.length} row(s) on the same statement ARE marked and are in the book.`);
    }

    for (const h of (holdingsDoc?.holdings ?? []).filter((x) => isNum(x.marketValue))) {
      const providerSector = sectorByKey.get(h.securityKey) ?? h.providerSector ?? null;
      const { sector, matchedBy } = resolveSector(providerSector);
      if (providerSector && matchedBy === null) {
        unclassified.set(providerSector, (unclassified.get(providerSector) ?? 0) + 1);
      }
      const cp = incomeByKey.get(h.securityKey);
      const carriedDedupe = dedupeByAcctSec.get(`${key}|${h.securityKey}`) ?? null;
      // Where the holdings statement prints no cost, the broker's opening
      // position supplies it — but only when the quantities agree exactly.
      const joinedCost = isNum(h.totalCost) ? null : costFor(h.securityKey, h.quantity);
      let costBasis = isNum(h.totalCost) ? h.totalCost : joinedCost;
      let costBasisSource = joinedCost !== null ? "opening-position" : undefined;
      let printedCostBasis = undefined;
      const marketValue = h.marketValue;
      /**
       * REALISED, AND THE COST OF THE UNITS IT WAS REALISED ON — the half of a
       * FIFO return the book used to leave out. A holding that sold part of
       * itself kept only the cost of what was LEFT, so its return was struck on
       * the survivors alone and the gain already banked on the rest fell out of
       * it.
       *
       * NULL where no record could carry it: an account with no capital gain
       * statement and no unit record reports what it holds, not what it sold.
       * ZERO where a record exists and this holding sold nothing in it — a
       * measurement over that record's window, not an absence.
       */
      let realizedPnL = null;
      let costOfUnitsSold = null;
      const rz = realisedByKey.get(h.securityKey);
      if (hasCgStatement) {
        if (rz?.lots) {
          realizedPnL = r2(rz.gain);
          costOfUnitsSold = r2(rz.cost);
        } else if (cgReachesHolding && !rz?.after) {
          realizedPnL = 0;
          costOfUnitsSold = 0;
        } else {
          realisedWithheld.push({ accountId, security: h.security, after: rz?.after ?? 0, opens: cgOpens });
        }
      }
      const realizedLotsAfter = rz?.after ?? 0;
      /**
       * THE FUND'S OWN UNIT RECORD OUTRANKS ITS COST COLUMN, BUT ONLY WHERE IT
       * ACCOUNTS FOR EVERY UNIT HELD. A FIFO balance that does not reproduce the
       * statement's own unit count means some units came from something the
       * record does not contain, and a cost struck on part of a holding would be
       * the Pricol failure again. So the lots must tie to the printed quantity,
       * to the precision it is printed to, with no sale left unmatched.
       */
      const fifoCls = fundFifo?.ledger ? fifoForClass(fundFifo.ledger, h.securityKey) : null;
      if (fifoCls && (fifoCls.lots.length || fifoCls.realised.length)) {
        const short = fundFifo.ledger.shortfalls.filter((x) => x.cls === h.securityKey);
        const ties = isNum(h.quantity) && Math.abs(fifoCls.unitsHeld - h.quantity) <= printedUnitTie(h.quantity);
        if (!short.length && ties && !fifoCls.realised.length) {
          /**
           * NO UNIT LEFT THIS HOLDING — only a class switch moved it. Nothing was
           * sold, so the realised half is a MEASURED zero over a record that runs
           * from the first purchase. The COST is left to `carryCostThroughSwitches`,
           * which carries each contribution through the switch at the fund's own
           * ratio; FIFO's own figure is kept to check that carry against, because
           * two implementations writing one cost is how two screens come to
           * disagree about it.
           */
          realizedPnL = 0;
          costOfUnitsSold = 0;
          fifoSwitchOnly.push({ accountId, securityKey: h.securityKey, fifoCost: r2(fifoCls.costHeld) });
        } else if (!short.length && ties) {
          const fifoCost = r2(fifoCls.costHeld);
          if (!isNum(costBasis) || Math.abs(fifoCost - costBasis) > 1) {
            fifoRestated.push({ accountId, security: h.security, printed: isNum(costBasis) ? r2(costBasis) : null, fifo: fifoCost,
              realised: r2(fifoCls.realisedGain), costSold: r2(fifoCls.costSold) });
            printedCostBasis = isNum(costBasis) ? r2(costBasis) : undefined;
          }
          costBasis = fifoCost;
          costBasisSource = "fifo";
          realizedPnL = r2(fifoCls.realisedGain);
          costOfUnitsSold = r2(fifoCls.costSold);
          // The class a lot was switched OUT of, by the name the record printed
          // for it — the key alone reads as a slug on screen.
          const nameOf = (k) => unitRecord.find((c) => c.securityKey === k)?.security ?? k;
          fifoLotsByPosition.set(`${accountId}|${h.securityKey}`,
            fifoCls.lots.map((l) => ({ ...l, carriedFromName: l.carriedFrom ? nameOf(l.carriedFrom) : null })));
        } else {
          notes.push(`account ${accountNo}: FIFO over the unit record does not account for ${h.security} — `
            + (short.length ? `a sale takes ${r3(sum(short.map((x) => x.units)))} unit(s) no recorded purchase holds`
              : `the lots hold ${r3(fifoCls.unitsHeld)} unit(s) against ${h.quantity} printed`)
            + "; the statement's own cost stands");
        }
      }
      /**
       * THE SHORT/LONG-TERM SPLIT, WHERE — AND ONLY WHERE — LOT DATES EXIST.
       *
       * India's threshold for listed equity is 12 months. A lot bought more than
       * 12 months before the valuation date is long-term; anything else is short.
       * This is a statutory rule applied to a dated fact, not an estimate.
       *
       * It is computed for exactly one account, because exactly one broker in
       * this drop publishes a lot register. Every other position keeps `null` on
       * all three fields and renders `—`, which is the truth: nobody knows, and
       * a split assumed from an average holding period would be a tax figure
       * somebody might act on.
       */
      const lots = lotsByKey.get(h.securityKey) ?? [];
      const dated = lots.filter((l) => l.purchaseDate && isNum(l.totalCost));
      let stCostBasis = null;
      let ltCostBasis = null;
      let daysToLT = null;
      /**
       * WHEN THE OLDEST UNIT STILL HELD WAS BOUGHT — the only thing in this book
       * that can say how long a holding has been held, and therefore the only
       * thing that can decide whether a return may be ANNUALISED.
       *
       * Emitted under the SAME gate as the ST/LT split: the lots must account for
       * the units held exactly. A register that carries units the family no
       * longer owns would date the holding from a lot that is gone, which is the
       * Pricol failure one field over — and a holding period is worse than a tax
       * basis to get wrong, because it is the DENOMINATOR of an annualised rate.
       *
       * Null on every position whose statements report no purchase date, which
       * is most of them. `null` means NOT REPORTED and must never be defaulted:
       * a missing date read as "today" makes every return infinite, and read as
       * "long ago" makes every return vanish.
       */
      let heldSince = null;
      /**
       * THE LOTS MUST ACCOUNT FOR THE UNITS ACTUALLY HELD, OR THERE IS NO SPLIT.
       *
       * This summed every dated lot the register carried, whether or not those
       * units are still in the position, and the two ways that fails were both
       * live:
       *
       *   PRICOL — register carries 650 units bought 05/02 and 2,225 bought
       *   05/05; the holding statement says 650. Summing both put a short-term
       *   cost of ₹16,71,343.29 on a position whose ENTIRE cost is ₹3,78,730.63
       *   — a tax basis 4.4x the money in the holding, on 2,225 units the family
       *   no longer owns.
       *
       *   BELRISE — register carries one lot of 6,500; the holding is 12,500. The
       *   split covered 52% of the position and the other ₹8,51,340 of cost
       *   silently became "long-term ₹0", which reads as a measurement and is
       *   not one.
       *
       * The register and the holdings statement are also drawn at different
       * dates, which is how the two drift apart in the first place. So the split
       * is produced only when the lots reconcile to the held quantity exactly —
       * the same discipline `costFor` already applies to the cost join, and for
       * the same reason. Where they do not, all three fields stay null and the
       * position is NAMED in the book report rather than carrying a partial
       * basis nobody can act on.
       */
      const lotQty = dated.reduce((s, l) => s + (isNum(l.quantity) ? l.quantity : NaN), 0);
      const lotsCoverPosition = dated.length && isNum(h.quantity)
        && Number.isFinite(lotQty) && Math.abs(lotQty - h.quantity) < 1e-6;
      if (dated.length && !lotsCoverPosition) {
        splitUnreconciled.push({
          security: h.security, accountId, held: h.quantity, lotQty: Number.isFinite(lotQty) ? lotQty : null,
        });
      }
      if (lotsCoverPosition && asOf) {
        const asOfMs = Date.parse(asOf);
        const LT_DAYS = 365;
        stCostBasis = 0;
        ltCostBasis = 0;
        let soonest = null;
        for (const l of dated) {
          const held = Math.round((asOfMs - Date.parse(l.purchaseDate)) / 86400000);
          if (held >= LT_DAYS) ltCostBasis = r2(ltCostBasis + l.totalCost);
          else {
            stCostBasis = r2(stCostBasis + l.totalCost);
            const toGo = LT_DAYS - held;
            if (soonest === null || toGo < soonest) soonest = toGo;
          }
        }
        daysToLT = soonest;
        // The OLDEST lot, not the newest: the holding has existed since its
        // first surviving unit was bought.
        for (const l of dated) if (heldSince === null || l.purchaseDate < heldSince) heldSince = l.purchaseDate;
      }
      positions.push({
        securityKey: h.securityKey,
        security: h.security,
        symbol: symbols[h.securityKey] ?? null,
        // Enrichment, never identity — undefined where no statement gives one.
        isin: h.isin ?? isinByKey.get(h.securityKey) ?? undefined,
        accountId,
        memberId: h.memberId ?? null,
        sector: h.assetClass === "Cash" ? "Cash" : sector,
        providerSector,
        assetClass: h.assetClass,
        /**
         * LISTED OR PRIVATE — `null` where no statement places it.
         *
         * Read from the SEBI category the fund's own name and this account's
         * `providerEngagement` print (`shared/aifCategory.mjs`). Generated here
         * rather than derived per page so there is ONE decision and every
         * total, facet and caption reads the same answer; the browser's
         * `marketSideOf` is the same function on the same inputs, for a caller
         * that already holds the account index.
         *
         * Emitted on EVERY position, not only the AIFs. A partial field is
         * where a fallback rule hides, and a fallback rule is a second
         * definition of the split.
         */
        marketSide: marketSideOf({ assetClass: h.assetClass, security: h.security, securityKey: h.securityKey }, acctForPositions),
        quantity: h.quantity,
        avgCost: h.unitCost,
        currentPrice: h.marketPrice,
        // A MEASURED nil on a statement that prints no NAV (Avendus, Stage 10dl):
        // 0 units, 0.00 value, and the statement's own "redeemed-to-nil" note.
        ...(h.quantity === 0 && h.marketValue === 0 && h.marketPrice == null
          && (holdingsDoc?.warnings ?? []).some((w) => w.code === "redeemed-to-nil") ? { redeemedToNil: true } : {}),
        costBasis,
        /**
         * "opening-position" where the cost came from the broker's ledger, not
         * this statement; "carried-through-switch" where a fund's class switch
         * restated it and `carryCostThroughSwitches` carried the family's own
         * cost through — set there, after the tranches, never here; "fifo"
         * where units LEFT the holding and its cost is that of the units still
         * held after the fund's own unit record was matched first-in, first-out;
         * "gross-paid" where the tranches name a printed charge and the cost is
         * what was PAID, charge included (`grossPaidCost`, set after the
         * tranches, VD-24).
         */
        costBasisSource,
        /** The statement's own cost, kept beside a cost this book carried — a CHECK, never a source. */
        printedCostBasis,
        marketValue,
        // Derived from whatever cost we ended up with, so a joined cost yields a
        // gain on the same basis. Both stay null when there is no cost at all —
        // a market value with no basis under it is not a profit of its own size.
        unrealizedPnL: isNum(marketValue) && isNum(costBasis) ? r2(marketValue - costBasis) : h.gainLoss,
        realizedPnL,
        costOfUnitsSold,
        realizedLotsAfter: realizedLotsAfter || undefined,
        /**
         * THE ONE RETURN FORMULA (`shared/fifo.mjs`): everything the holding
         * produced — unrealised on what is held, realised on what was sold —
         * over every rupee that bought a unit of it. Where nothing was sold it
         * is the familiar unrealised ÷ cost, to the paisa.
         */
        returnPct: isNum(marketValue) && isNum(costBasis)
          ? r2(fifoReturnPct(marketValue, costBasis, realizedPnL, costOfUnitsSold))
          : h.pctGainLoss,
        stCostBasis,
        ltCostBasis,
        daysToLT,
        heldSince,
        // The date the statement PRINTS its price or value as struck at, which
        // need not be the account's as-of: ICICI's NSDL balance is at 31 Mar and
        // its values "Prices as on 30-Mar-2026". Only where printed; never the as-of.
        priceAsOf: h.priceAsOn ?? undefined,
        accruedIncome: h.accruedIncome ?? cp?.accruedIncome ?? null,
        dividendReceived: dividendByKey.get(h.securityKey) ?? null,
        positionIrrPct: cp?.positionIrrPct ?? null,
        // Falls back to the tag any OTHER issue of this account carried for this
        // security — see `dedupeByAcctSec`. A snapshot supersedes; the fact that
        // two accounts report one holding does not.
        dedupeGroup: h.dedupeGroup ?? carriedDedupe?.dedupeGroup ?? undefined,
        alsoReportedUnder: h.alsoReportedUnder?.length
          ? h.alsoReportedUnder
          : carriedDedupe?.alsoReportedUnder.length ? carriedDedupe.alsoReportedUnder : undefined,
      });
    }

    // ── time-weighted returns, per account ──
    //
    // Each manager publishes its OWN period vocabulary and its OWN benchmark:
    // Goldstandard prints MTD / QTD / YTD against N50TRI, Green Lantern and
    // Carnelian print trailing 1m / 3m / 1y against S&P BSE 500 Total Return.
    // Those are different measurements over different windows against different
    // indices, so every series is carried with its own vocabulary intact and the
    // page renders the columns each account actually has. Folding them together
    // would put a trailing one-month return under a month-to-date heading.
    const returnDocs = group
      .filter((d) => (d.returns ?? []).length)
      // fact sheet first: it is the one the provider publishes to the client.
      .sort((a, b) => (a.reportType === "fact-sheet" ? -1 : 0) - (b.reportType === "fact-sheet" ? -1 : 0));
    const seriesByReport = returnDocs.map((d) => ({
      reportType: d.reportType,
      source: d.docKey,
      series: d.returns.map((r) => ({
        series: r.series,
        isBenchmark: r.isBenchmark,
        mtd: r.mtd, qtd: r.qtd, fytd: r.fytd,
        m1: r.m1, m3: r.m3, m6: r.m6, y1: r.y1,
        si: r.si, siAnnualised: r.siAnnualised, feeBasis: r.feeBasis,
      })),
    }));
    if (seriesByReport.length) accountReturns[accountId] = seriesByReport;
    else notes.push(`account ${accountNo}: no time-weighted return series in any statement`);

    // ── the value bridge ──
    //
    // opening → contributions → withdrawals → realised → unrealised → income →
    // fees → closing, over ONE window. Two windows are available per account and
    // they are not interchangeable: the performance summary runs the financial
    // year to date, the fact sheet and performance appraisal run since
    // inception. Both are carried, each labelled with its own window; nothing is
    // added across them.
    const bridges = [];
    for (const d of group) {
      const f = d.flows;
      if (!f || !f.periodFrom || !f.periodTo) continue;
      const has = ["openingCorpus", "contribution", "withdrawal", "netCapitalInOut",
        "realized", "unrealized", "income", "fees", "expenses", "corpus"]
        .filter((k) => isNum(f[k]));
      if (!has.length) continue;
      const bridge = {
        reportType: d.reportType,
        source: d.docKey,
        periodFrom: f.periodFrom,
        periodTo: f.periodTo,
        basis: bridgeBasisOf(f.periodFrom, f.periodTo, inception),
        opening: f.openingCorpus,
        contribution: f.contribution,
        withdrawal: f.withdrawal,
        netCapitalInOut: f.netCapitalInOut,
        realized: f.realized,
        unrealized: f.unrealized,
        income: f.income,
        fees: f.fees,
        expenses: f.expenses,
        closing: f.corpus,
        profit: f.profit,
        // The lines a reader sets only where it reads them (A-12): a figure,
        // `null` where it looked and the report prints none, and named in
        // `unread` where no reader looked at all.
        accruedIncome: f.accruedIncome ?? null,
        changeInAccruals: f.changeInAccruals ?? null,
        otherExpenses: f.otherExpenses ?? null,
        gainPriorToTakeover: f.gainPriorToTakeover ?? null,
        unread: OPTIONAL_BRIDGE_FLOWS.filter((k) => f[k] === undefined),
        // The printed lines behind a flow that sums several (Stage 10df): only
        // the two whole-life reports carry them, and a column without them
        // keeps the key out rather than growing an empty array.
        ...(Array.isArray(f.lines) && f.lines.length ? { lines: f.lines.map((l) => ({ label: l.label, flow: l.flow, value: l.value })) } : {}),
      };
      const tie = bridgeTieOf(bridge);
      Object.assign(bridge, tie);
      if (tie.linesOnly) {
        notes.push(`account ${accountNo}: the ${d.reportType} column ${f.periodFrom} → ${f.periodTo} is shown as its printed lines only — ${tie.linesOnlyReason}`);
      } else if (!tie.ties) {
        notes.push(`account ${accountNo}: the ${d.reportType} value bridge ${f.periodFrom} → ${f.periodTo} is WITHHELD — `
          + (tie.residual === null ? tie.withheldReason
            : `its lines add to ${r2(tie.linesTotal).toLocaleString("en-IN")} against a closing value of `
              + `${r2(bridge.closing).toLocaleString("en-IN")}, ${Math.abs(tie.residual).toLocaleString("en-IN")} apart. `
              + tie.withheldReason));
      }
      bridges.push(bridge);
    }
    if (bridges.length) {
      // Widest window first, so the since-inception view leads.
      bridges.sort((a, b) => a.periodFrom.localeCompare(b.periodFrom));
      accountBridges[accountId] = bridges;
    } else {
      notes.push(`account ${accountNo}: no flow block in any statement, so no value bridge`);
    }

    /**
     * An account with no positions says which kind of nothing it is.
     *
     * `holdingsDoc` is the document precedence names authoritative for holdings.
     * When there is none, no statement for this account VALUES anything — the
     * documents are income letters or advices — and the market value is absent,
     * not zero. When there IS one and it yielded no rows, the account really is
     * empty and that is a measurement.
     */
    {
      const mine = positions.filter((x) => x.accountId === accountId);
      const acct = accounts[accounts.length - 1];
      if (acct && acct.accountId === accountId && !mine.length) {
        const unvaluedHere = (holdingsDoc?.holdings ?? []).filter((x) => !isNum(x.marketValue));
        /**
         * WHY THE HOLDINGS ARE UNVALUED IS READ OFF THE HOLDINGS, not assumed.
         *
         * This branch used to tell one story for every unvalued account — "this
         * fund publishes no NAV … the capital drawn against a commitment" — which
         * is true of India SME and Sky Capital, drawdown funds that report units
         * and contributions and no mark. It is FALSE of a DEPOSITORY account,
         * where the row carries a face value the depository recorded because it
         * had no price. Printing the fund story over a demat account is the
         * confidently-wrong-diagnosis failure this file names elsewhere: it sends
         * the next reader to ask a fund manager for a NAV that no fund owes.
         *
         * A face-valued row is the tell, and it is on the holding itself.
         */
        const facePriced = unvaluedHere.filter((x) => isNum(x.faceValue));
        /**
         * A DEPOSITORY ACCOUNT AND A MANAGER'S ACCOUNT ARE DIFFERENT KINDS OF
         * NOTHING. The engagement the account's own statements state decides it:
         * an account the family runs itself (`Direct`) or through a broker
         * (`Execution`) is a demat whose tape carries quantities; a PMS mandate or
         * a fund is a manager's, whose statements do not.
         */
        const dematAccount = acct.engagement === "Direct" || acct.engagement === "Execution";
        const hasTape = allIssues.some((d) => /transaction/i.test(d.reportType ?? ""));
        const lastTrade = allIssues.flatMap((d) => (d.transactions ?? []).map((t) => t.date)).filter(Boolean).sort().at(-1) ?? null;
        // A statement of the account's own, at the account's own date, stating a
        // closing corpus of exactly nil — a measurement, read only when no
        // holding statement is in the drop to say it row by row.
        const closedCorpus = holdingsDoc ? null : (allIssues.find((d) => d.flows && d.flows.corpus === 0
          && (d.flows.periodTo ?? d.periodTo ?? d.asOf) === asOf) ?? null);
        /**
         * AND A CUSTODY ACCOUNT WHOSE RATES ARE LAST-MOVEMENT PRICES IS A THIRD
         * STORY (Stage 10cz). Its rows carry a rate that is real — the price its
         * last movement went through at — and is not a valuation of the balance.
         * Told the fund story ("this fund publishes no NAV"), a reader asks a fund
         * manager about a demat account; told nothing, they read the rate as a
         * mark. What would value the balance on the statement's date is a
         * statement that marks it, which a custodian does issue.
         */
        const lastMoved = unvaluedHere.filter((x) => !isNum(x.faceValue) && isNum(x.lastMovementRate) && x.lastMovementRate > 0);
        const bare = unvaluedHere.length - facePriced.length - lastMoved.length;
        acct.noPositionsReason = facePriced.length === unvaluedHere.length && unvaluedHere.length
          ? `this custody account values nothing: its statement of ${holdingsDoc.asOf} carries ${unvaluedHere.length} holding(s) whose only price is the FACE VALUE the security was allotted at, which is not a mark anybody struck. The units are in the archive; multiplying by a face value would put a valuation nobody made into the book`
          : lastMoved.length && CUSTODY_PROVIDERS.has(provider)
          ? `this custody account's statement of ${holdingsDoc.asOf} values nothing: it prints ${unvaluedHere.length} holding(s) as quantities, ${lastMoved.length} of them with the price of their last depository movement — a transaction price, not a valuation of the balance`
            + `${facePriced.length ? `; ${facePriced.length} at the face value they were allotted at` : ""}${bare ? `; ${bare} with no rate at all` : ""}. `
            + "The units are in the archive. What values them on that date is a statement that marks the balance, such as CDSL's monthly Consolidated Account Statement"
          : unvaluedHere.length
          ? `this fund publishes no NAV: its statement of ${holdingsDoc.asOf} carries ${unvaluedHere.length} holding(s) with units and the capital drawn against a commitment, and no valuation. The units and the cost are in the archive; there is nothing to mark them at, and the contributions are what was paid rather than what the stake is worth`
          : holdingsDoc
          ? `every holding on this account's ${holdingsDoc.reportType} statement of ${holdingsDoc.asOf} has been redeemed — the balance is nil, and that is a measurement`
          /**
           * A MANAGER'S ACCOUNT IS NOT A DEMAT. The demat sentence further down
           * was written for a depository's transaction tape, whose closing balances
           * are quantities at a date; a portfolio manager's statements with no
           * holding statement among them carry no such balances, and "its
           * custodian" names the wrong institution to ask. Marathon's two
           * mandates (the `september-2026` delivery) send a capital gain,
           * dividend, income-and-expense and transaction statement and no
           * holding statement — so nothing states what the account holds today,
           * and that is all this says. NOT "redeemed": no statement here prints
           * a nil balance, and a measured nil nobody measured is the founding
           * failure run backwards.
           */
          : !dematAccount && closedCorpus
          ? `every holding on this mandate has been redeemed — the balance is nil, and that is a measurement: its ${closedCorpus.reportType} of ${closedCorpus.asOf} states a closing corpus of nil, and no holding statement for it is in the drop`
          : !dematAccount && hasTape
          ? `this manager's statements in the drop — its ${[...new Set(allIssues.map((d) => d.reportType))].sort().join(", ")} statement(s) — include no holding statement, so nothing here states what this account holds or what it is worth at ${asOf ?? "its own date"}${lastTrade ? `; its transaction statement's last trade is dated ${lastTrade}` : ""}. What would fill it is the manager's own holding statement for this account`
          /**
           * AND THE LAST BRANCH TOLD THE SAME WRONG STORY ONE LEVEL UP.
           *
           * With no holdings document at all it said "its documents report
           * income and distributions only", which is true of the two 360 ONE
           * Alternates folios and FALSE of Motilal Oswal demat 1201090012539150
           * — Ajay's main demat, whose drop carries its TRANSACTION statement
           * and not its holdings. Those two absences need completely different
           * things: one needs nothing (the units are marked in another account),
           * the other needs one missing document from a named custodian. So the
           * report types the account's own documents carry decide the sentence,
           * rather than one sentence covering both.
           */
          : hasTape
          ? `no HOLDING statement for this account is in the drop — only its ${[...new Set(allIssues.map((d) => d.reportType))].sort().join(", ")} statement(s). The tape's closing balances are in the archive as quantities at ${allIssues.map((d) => d.asOf).filter(Boolean).sort().pop() ?? "its own date"} and carry no rate, so nothing here can be valued. What would fill it is that account's own holding statement from its custodian`
          : `no statement for this account carries a valuation; its documents report income and distributions only. Where these units are marked, another account holds them.`;
        /**
         * AND SAID IN A FIELD, NOT ONLY IN THAT SENTENCE. The dashboard values
         * the funds on such an account from the depository's own closing
         * balance and AMFI's published NAV, and its listed shares at the live
         * quote (Stage 10cy), and it must find those
         * accounts structurally — a rule that matched the prose above would stop
         * matching the first time somebody reworded it. It is set on exactly the
         * case the sentence describes: no holding statement in the drop, and a
         * transaction statement that is, on an account the family runs itself or
         * through a broker. A portfolio manager's account with no holding
         * statement (Marathon) is not a depository's, and its manager's
         * statements carry no units for this to value.
         */
        if (!holdingsDoc && hasTape && dematAccount) acct.transactionsOnly = true;
      }
    }

    corporateActionsAll.push(...corporateActions);

    // ── realised capital gains ──
    /**
     * EVERY LOT THIS ACCOUNT'S STATEMENTS REPORT, not the first document's.
     *
     * Green Lantern 510861 issues two capital gain statements over different
     * windows — the house set's, and the one inside its investor-report bundle.
     * `find` took whichever sorted first and the other's lots were simply gone.
     * `dated.capitalGains` is the deduped union; a lot printed on both is counted
     * once, and the window below spans what the union actually covers.
     */
    const lots = dated.capitalGains;
    const cgDoc = group.find((d) => (d.capitalGains ?? []).length)
      ?? allIssues.find((d) => (d.capitalGains ?? []).length);
    if (lots.length && cgDoc) {
      capitalGains.push({
        // A HUMAN label, not the internal accountId — this string is rendered.
        // One row per ACCOUNT, not per owner: the realised windows differ by
        // provider (Green Lantern to 25 Jun, Carnelian to 10 Jul), and summing
        // across them would add two different measurement periods together.
        entity: `${ownerById(ownerId)?.displayName ?? accountNo} · ${provider.split(" ")[0]} ${accountNo}`,
        accountId,
        ownerId,
        realisedST: r2(sum(lots.map((l) => (isNum(l.shortTerm) ? l.shortTerm : 0)))),
        realisedLT: r2(sum(lots.map((l) => (isNum(l.longTerm) ? l.longTerm : 0)))),
        // No lot dates in this corpus → no unrealised split. Null renders "—".
        unrealisedST: null,
        unrealisedLT: null,
        // The window the UNION covers, not one document's — the earliest start
        // and the latest end across every statement that contributed a lot.
        periodFrom: allIssues.filter((d) => (d.capitalGains ?? []).length)
          .map((d) => d.periodFrom).filter(Boolean).sort()[0] ?? cgDoc.periodFrom ?? null,
        periodTo: allIssues.filter((d) => (d.capitalGains ?? []).length)
          .map((d) => d.periodTo).filter(Boolean).sort().pop() ?? cgDoc.periodTo ?? null,
        lots: lots.length,
        // The same totals split by the financial year each lot was SOLD in —
        // what a tax estimate, which is a one-year figure, reads.
        realisedByYear: realisedByYearOf(lots),
        source: cgDoc.docKey,
      });
      // ── the same total, split by ASSET CLASS ──
      //
      // The canonical realised figure nets two unlike books: an equity mandate
      // that lost money and a liquid-fund cash sweep that made some. Netted,
      // the sweep flatters the equity result with nothing on screen to say so.
      // The class is JOINED from the same security's rows on an appraisal or
      // transaction statement — the capital gain statement prints none — and a
      // security neither carries is left `null` and NAMED. "Mutual Fund" in a
      // printed name is not a classification any statement made.
      for (const l of lots) {
        const cls = classByKey.get(l.securityKey) ?? null;
        const k = `${accountId}|${cls ?? ""}`;
        const e = realisedByClass.get(k) ?? {
          accountId, entity: `${ownerById(ownerId)?.displayName ?? accountNo} · ${provider.split(" ")[0]} ${accountNo}`,
          assetClass: cls, lots: 0, realisedST: 0, realisedLT: 0, securities: new Set(),
        };
        e.lots += 1;
        e.realisedST += isNum(l.shortTerm) ? l.shortTerm : 0;
        e.realisedLT += isNum(l.longTerm) ? l.longTerm : 0;
        e.securities.add(l.security);
        realisedByClass.set(k, e);
      }
    }
    // An account with NO capital gain statement is recorded as such, with an
    // empty realised block. Omitting it entirely would let the page average
    // three accounts and call it the family's realised gain; a zero would say
    // the account realised nothing, which nobody measured.
    else {
      capitalGains.push({
        entity: `${ownerById(ownerId)?.displayName ?? accountNo} · ${provider.split(" ")[0]} ${accountNo}`,
        accountId, ownerId,
        realisedST: null, realisedLT: null, unrealisedST: null, unrealisedLT: null,
        periodFrom: null, periodTo: null, lots: 0, source: null,
        absent: "no capital gain statement issued for this account in this drop",
      });
    }

    // ── dated cash flows, for money-weighted return ──
    //
    // Sign convention (types.ts CashFlow): amount < 0 = capital IN, > 0 = OUT.
    //
    // EXTERNAL capital movements only. A trade moves cash between the bank
    // balance and the holdings inside the same account; it is not a flow into or
    // out of the account, and counting it would make the return meaningless.
    //
    // The CAPITAL REGISTER is the account's capital account and is used where
    // the provider issues one; the bank book's Dep/With column is the fallback
    // for the one provider that does not (Carnelian). The choice is checked, not
    // assumed: the total is compared against the performance summary's own
    // stated Net Capital In/Out over the same window, and a disagreement is
    // reported rather than absorbed.
    // WHAT THE FAMILY DID, from the same collection and a different question.
    // `accountCashFlows` below is built for the XIRR and reads the capital
    // register or the bank book; this reads the rows the statements type as a
    // contribution or a withdrawal, wherever they appear, and is the only place
    // in this book that answers "what did WE buy, and when".
    const typedMoves = capitalMovesFrom(dated.cashFlows, accountId, notes, `account ${accountNo}`);
    if (capitalRecordFromInception(dated.cashFlows)) capitalFromInception.add(accountId);
    const switchesHere = reclassificationsFrom(dated.cashFlows, accountId, notes, `account ${accountNo}`);
    reclassifications.push(...switchesHere);
    /**
     * …AND THE CAPITAL REGISTER `capitalMovesFrom` DOES NOT READ, merged onto it
     * only where the register's own balances witness it and never a payment
     * twice. A drawdown fund's dated CALLS are the other record it does not
     * read, and they are joined at display time instead (`capitalMovesWithCalls`,
     * one record per account). See `datedCapitalElsewhere`.
     */
    const commitmentsHere = commitments.filter((c) => c.accountId === accountId);
    const merged = datedCapitalElsewhere({
      accountId, allIssues, existing: typedMoves, typedReach: capitalRecordTo, valueDate: asOf,
      reclassificationsHere: switchesHere, notes, label: `account ${accountNo}`,
    });
    /**
     * …AND A BANK BOOK, only where the same account's profit-and-loss account
     * witnesses its capital rows to the paisa (`bankBookCapitalWitnessed`).
     * Read AFTER the register, against everything the record already carries,
     * so a payment two documents both print is listed once.
     */
    const banked = bankBookCapitalWitnessed({
      accountId, allIssues, existing: [...typedMoves, ...merged.register], notes, label: `account ${accountNo}`,
    });
    const elsewhere = [...merged.register, ...banked.moves];
    capitalMoves.push(...typedMoves, ...elsewhere);
    /**
     * …AND THE RECORD NOW RUNS AS FAR AS THE REGISTER THAT WITNESSES IT. Stage
     * 10cf's `capitalRecordTo` counts only documents carrying a TYPED payment
     * row, so an account whose record the register completes would still read
     * as stopping short: Green Lantern 510861's register walks its balance to
     * 27 July, the date its value is struck, and carries the ₹6,350 of July TDS
     * that were the whole of its shortfall. Extended only forward, and only by a
     * register whose balances tie and whose window meets the typed record's.
     */
    if (merged.witnessedTo && (!capitalRecordTo || merged.witnessedTo > capitalRecordTo)) {
      const acct = accounts.find((a) => a.accountId === accountId);
      if (acct) {
        notes.push(`account ${accountNo}: its dated capital record runs to ${merged.witnessedTo} — the capital register whose `
          + `balances tie reaches that date${capitalRecordTo ? `, past the ${capitalRecordTo} its typed rows reach on their own` : ""}`);
        acct.capitalRecordTo = merged.witnessedTo;
      }
    }
    if (banked.witnessedTo) {
      const acct = accounts.find((a) => a.accountId === accountId);
      const reach = acct?.capitalRecordTo ?? capitalRecordTo;
      if (acct && (!reach || banked.witnessedTo > reach)) {
        notes.push(`account ${accountNo}: its dated capital record runs to ${banked.witnessedTo} — the bank book whose capital `
          + `rows its profit-and-loss account witnesses closes on that date${reach ? `, past the ${reach} it reached before` : ""}`);
        acct.capitalRecordTo = banked.witnessedTo;
      }
    }
    {
      /**
       * A RECORD BESIDE A FUND'S OWN CALLS IS HELD TO THE FUND'S TOTAL.
       * `capitalMovesWithCalls` shows ONE record per account: where the account
       * publishes its own, that record is what the page shows and the fund's
       * calls are not added. So a record that disagrees with the fund's printed
       * called/paid total is exactly what a reader would be shown, and it is
       * named here — the check the date-and-amount dedupe cannot make when two
       * documents print one payment on different dates. An account with no
       * record of its own has nothing to hold: its calls are the record, and
       * their reader already tied them to that total (`callsIfTheyTie`).
       */
      const withCalls = commitmentsHere.find((c) => (c.calls ?? []).length);
      if (withCalls && typedMoves.length + elsewhere.length > 0) {
        const printed = [withCalls.called, withCalls.paid, withCalls.drawn].find(isNum) ?? null;
        const paidIn = sum([...typedMoves, ...elsewhere].filter((m) => m.direction === "in" && isNum(m.amount)).map((m) => m.amount));
        if (printed !== null && Math.abs(paidIn - printed) > 1) {
          notes.push(`account ${accountNo}: its dated capital in adds to ${r2(paidIn)} against the ${r2(printed)} its fund prints `
            + "as called or paid — the record carries a payment the calls do not, or misses one they do");
        }
      }
      const said = (xs, what) => (xs.length
        ? [`${xs.length} ${what} (${r2(sum(xs.filter((m) => m.direction === "in").map((m) => m.amount)))} in, `
          + `${r2(sum(xs.filter((m) => m.direction === "out").map((m) => m.amount)))} out)`] : []);
      const parts = said(merged.register, "movement(s) from its capital register");
      if (parts.length) {
        notes.push(`account ${accountNo}: ${parts.join(" and ")} merged into its dated capital record — each witnessed by `
          + "the register's own opening and closing balance, and none already on the account's typed record");
      }
      const bankParts = said(banked.moves, "dated move(s) from its bank book");
      if (bankParts.length && banked.merged) {
        const b = banked.merged;
        notes.push(`account ${accountNo}: ${bankParts.join(" and ")} merged into its dated capital record — the bank book's `
          + `deposits reproduce the profit-and-loss account's Capital Contribution (${b.contribution}) and its withdrawals with `
          + `its TDS transfers reproduce the Withdrawals (${b.withdrawal}), to the paisa`
          + (b.nilDates.length ? `; on ${b.nilDates.join(", ")} a withdrawal and a TDS reversal net to nil and nothing is listed` : ""));
      }
    }

    /**
     * ── A MANDATE'S CAPITAL, SINCE INCEPTION, AT THE SAME DATE AS ITS HOLDINGS ──
     *
     * FIFO inside a mandate is the manager's: every appraisal carries the cost of
     * the shares LEFT and every capital gain statement the gain on the ones SOLD,
     * each matched first-in, first-out. But a capital gain statement covers ONE
     * WINDOW, so the realised gain on everything the manager sold before it is
     * in no position — and a mandate's return struck over its surviving shares
     * alone reads 8.42% on V.E.C 128004 where the fund's own since-inception
     * record (realised ₹1.05 Cr, unrealised ₹50.5 L, income, fees) says 30%.
     *
     * The mandate as a WHOLE needs no matching at all: the family paid capital
     * in and the account is worth what its positions are worth, so everything
     * the mandate has earned — every lot the manager ever sold, every dividend,
     * less every fee — is `value + withdrawn − contributed`. That is FIFO's own
     * total, because however the units are matched, cost held plus cost sold is
     * what was put in.
     *
     * Taken only from a statement that states it SINCE INCEPTION and AS AT THE
     * HOLDINGS' OWN DATE — a capital figure a fortnight older than the value it
     * is set against would book a fortnight's deposits as profit. Where no such
     * statement exists, the account's own dated capital record stands in only if
     * it starts at the account's printed inception.
     */
    if (acctForPositions.engagement === "PMS") {
      const si = bridges.filter((b) => b.basis === "since-inception" && b.periodTo === asOf
        && isNum(b.contribution));
      const mine = capitalMoves.filter((m) => m.accountId === accountId);
      const ins = mine.filter((m) => m.direction === "in" && isNum(m.amount));
      const firstIn = ins.map((m) => m.date).sort()[0] ?? null;
      if (si.length) {
        const b = si[0];
        acctForPositions.capital = {
          contributed: r2(b.contribution), withdrawn: r2(b.withdrawal ?? 0),
          // A whole-life window that opens before the account existed (ASK's P&L
          // runs from 1 April 2019) is printed from the account's inception: the
          // mandate page reads this as "paid in since …", and no money was paid
          // in before the account was opened.
          from: inception && b.periodFrom < inception ? inception : b.periodFrom,
          to: b.periodTo, source: b.source,
        };
      } else if (ins.length && inception && firstIn <= inception
        && mine.every((m) => m.date <= asOf)) {
        acctForPositions.capital = {
          contributed: r2(sum(ins.map((m) => m.amount))),
          withdrawn: r2(sum(mine.filter((m) => m.direction === "out" && isNum(m.amount)).map((m) => m.amount))),
          from: inception, to: asOf, source: "capital-record",
        };
      } else {
        acctForPositions.capital = null;
        notes.push(`account ${accountNo}: no statement states this mandate's capital since inception as at ${asOf}, `
          + "so its return is struck holding by holding and carries only the realised gain its capital gain statement's window reports");
      }
    }

    const register = group.find((d) => d.reportType === "capital-register" && (d.cashFlows ?? []).length);
    const bank = group.find((d) => d.reportType === "bank-book" && (d.cashFlows ?? []).length);
    const src = register ?? bank;
    /**
     * THE SERIES RUNS OVER ONE WINDOW: FROM THE OPENING VALUE TO THE CLOSING ONE.
     *
     * The app closes this series on the account's own holdings value, struck at
     * `asOf`; where a performance summary supplies the window's OPENING value, the
     * series opens on that value's date. A movement outside the two is either
     * already inside the opening value or not yet inside the closing one, so it
     * is not a flow of this window.
     *
     * Every register in this book covered exactly that window until Green Lantern
     * 510861 sent one since inception (the `october-2026` delivery, 2025-01-16 →
     * 2026-09-22). Read whole beside the 1 April opening value, it put the
     * ₹10 Cr first deposit in TWICE — once as itself and once inside the opening
     * value — and eleven TDS rows dated after the 27 July value the series closes
     * on. Rows outside the window are left out, and counted in the notes.
     */
    const perf = group.find((d) => d.reportType === "performance-summary" && isNum(d.flows?.openingCorpus));
    const opensOn = perf ? (perf.flows.periodFrom ?? src?.periodFrom ?? asOf) : null;
    const flows = [];
    /** Every register (or bank-book) movement, the window aside — what the cross-check below sums. */
    const moves = [];
    let beforeWindow = 0;
    let afterWindow = 0;
    if (src) {
      // A CLASS SWITCH IS NOT A FLOW HERE EITHER (XA-23) — the rule
      // `datedCapitalElsewhere` applies to the dated capital record, on the
      // same witness: the fund's own reclassification record, same date, same
      // rupees. Buoyant 103473's register prints its 1 June switch as
      // "Security in" and "Security out" of ₹22.53 Cr; the two legs cancel, so
      // no rate moves, but a count of "dated flows" read 4 where two payments
      // were made.
      const switchLeg = (c, move) => switchesHere.some((r) => r.date === c.date && Math.abs(r.amount - Math.abs(move)) <= 1);
      let legs = 0;
      for (const c of src.cashFlows ?? []) {
        if (!c.date) continue;
        const move = c.kind === "capital-register" ? c.amount : c.depositWithdrawal;
        if (!isNum(move) || move === 0) continue;
        if (switchLeg(c, move)) { legs += 1; continue; }
        moves.push({ date: c.date, move });
        if (opensOn && c.date < opensOn) { beforeWindow += 1; continue; }
        if (asOf && c.date > asOf) { afterWindow += 1; continue; }
        flows.push({ date: c.date, amount: r2(-move), description: c.description });
      }
      if (legs) {
        notes.push(`account ${accountNo}: ${legs} cash-flow row(s) are the legs of a class switch the fund's own `
          + "reclassification record prints on the same date for the same rupees — not money moving, so not a flow");
      }
      if (beforeWindow || afterWindow) {
        notes.push(`account ${accountNo}: its ${src.reportType} runs ${src.periodFrom ?? "?"} → ${src.periodTo ?? "?"}, so `
          + [beforeWindow ? `${beforeWindow} row(s) before the ${opensOn} opening value (already inside it)` : null,
            afterWindow ? `${afterWindow} row(s) after the ${asOf} value the series closes on (not yet inside it)` : null]
            .filter(Boolean).join(" and ")
          + " are not flows of its money-weighted window");
      }
    }

    // The window's OPENING portfolio value is itself a flow for this purpose:
    // capital already at work on day one. Without it a return over the window is
    // computed against the few thousand rupees of TDS that moved during it, and
    // comes out absurd. The closing value is appended by the app at compute time.
    if (perf && flows.length) {
      flows.push({
        date: opensOn,
        amount: r2(-perf.flows.openingCorpus),
        description: `Opening portfolio value ${perf.flows.periodFrom ?? ""}`.trim(),
      });
    } else if (flows.length) {
      notes.push(`account ${accountNo}: cash flows carry no opening portfolio value — `
        + `no performance summary for the window, so a money-weighted return over it cannot be computed`);
    }

    if (flows.length) {
      flows.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
      accountCashFlows[accountId] = flows;

      // Cross-check against the provider's own statement of the same figure, over
      // every window the source covers whole — summed from the source's own rows,
      // so a since-inception register is held to the since-inception figure too.
      const covers = (d) => !!src?.periodFrom && !!src?.periodTo && !!d.flows?.periodFrom && !!d.flows?.periodTo
        && src.periodFrom <= d.flows.periodFrom && d.flows.periodTo <= src.periodTo;
      for (const stated of group.filter((d) => isNum(d.flows?.netCapitalInOut) && covers(d))) {
        const { periodFrom: from, periodTo: to } = stated.flows;
        const net = r2(sum(moves.filter((m) => m.date >= from && m.date <= to).map((m) => m.move)));
        /**
         * A STATEMENT STRUCK BEFORE ITS CLOSING DAY'S OWN MOVEMENTS POSTED. Green
         * Lantern's performance summary and history both close on 10 August and
         * both leave out the two TDS rows the register dates that day (₹2,376 and
         * ₹1,128): the register's balance just before them is ₹99,885,169, the
         * since-inception figure the history prints. Reproduced exactly — the
         * closing day's rows left out and nothing else — never a widened bound.
         */
        const onClose = moves.filter((m) => m.date === to);
        const beforeClose = r2(net - sum(onClose.map((m) => m.move)));
        if (Math.abs(net - stated.flows.netCapitalInOut) > 1 && onClose.length
          && Math.abs(beforeClose - stated.flows.netCapitalInOut) <= 1) {
          notes.push(`account ${accountNo}: its ${src.reportType} reproduces the ${stated.reportType}'s Net Capital In/Out of `
            + `${stated.flows.netCapitalInOut} over ${from} → ${to} once the ${onClose.length} row(s) dated ${to} itself `
            + `(${r2(sum(onClose.map((m) => m.move)))}) are left out — the statement was struck before that day's movements posted`);
        } else if (Math.abs(net - stated.flows.netCapitalInOut) > 1) {
          notes.push(`account ${accountNo}: cash flows sum to ${net} but the ${stated.reportType} states Net Capital `
            + `In/Out of ${stated.flows.netCapitalInOut} over ${from} → ${to}`);
        }
      }
    } else {
      notes.push(`account ${accountNo}: no external capital movements found, so no `
        + `money-weighted return series`);
    }
  }

  /**
   * The same flows, keyed by OWNER — what `entityXirrPct` reads.
   *
   * A person's money-weighted return is over everything they own, so their
   * accounts' flows merge. The opening values merge with them: each is that
   * account's capital at work when its window opened, and the terminal value
   * the app appends is the owner's whole current market value.
   */
  const entityCashFlows = {};
  for (const a of accounts) {
    const flows = accountCashFlows[a.accountId];
    if (!flows || !a.ownerId) continue;
    const name = ownerById(a.ownerId)?.displayName;
    if (!name) continue;
    entityCashFlows[name] = [...(entityCashFlows[name] ?? []), ...flows];
  }
  for (const k of Object.keys(entityCashFlows)) {
    entityCashFlows[k].sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
  }

  dropDepositoryDuplicates(positions, accounts, notes);

  positions.sort((a, b) => a.accountId.localeCompare(b.accountId) || a.securityKey.localeCompare(b.securityKey));

  /**
   * ── ONE NSE SYMBOL UNDER TWO KEYS IS ONE COMPANY KEYED TWICE ───────────────
   *
   * The ISIN guard above cannot see the split the family reported: `SBI - EQ`
   * printed an ISIN and the four PMS statements spelling it `State Bank of
   * India` printed none, so there was no second ISIN to compare. What both
   * sides DID resolve is the same NSE symbol — the depository's through its
   * ISIN on NSE's own master, the managers' through their name — and a symbol
   * is issued once per listed company. So two book keys on one symbol are
   * named here, every run and at zero, because a guard that only speaks when
   * it fires is indistinguishable from one that was deleted. Closing one is a
   * hand-checked entry in `KEY_ALIASES` (`shared/securityKey.mjs`), never a
   * merge made here: this reports identity, it does not decide it.
   */
  {
    const keysBySymbol = new Map();
    for (const p of positions) {
      if (!p.symbol) continue;
      (keysBySymbol.get(p.symbol) ?? keysBySymbol.set(p.symbol, new Set()).get(p.symbol)).add(p.securityKey);
    }
    const split = [...keysBySymbol].filter(([, ks]) => ks.size > 1);
    notes.push(split.length === 0
      ? "identity: 0 NSE symbol(s) are carried by two securityKeys among the positions — no listed company is keyed twice."
      : `identity: ${split.length} NSE symbol(s) are carried by TWO OR MORE securityKeys among the positions — one listed `
        + `company keyed twice, so it is two rows and two names on every screen. Close each with a hand-checked `
        + `\`KEY_ALIASES\` entry in shared/securityKey.mjs: `
        + split.map(([sym, ks]) => `${sym} (${[...ks].sort().join(" / ")})`).join("; "));
  }

  /**
   * PEEL OFF THE RING-FENCED PROMOTER STOCK (see RINGFENCED_SECURITY_KEYS).
   *
   * Done after the sort, so `polycab` and `positions` are both deterministic, and
   * before EVERYTHING that reads `positions` — dropDepositoryDuplicates has already
   * run and does not touch it (its ISIN is not an AIF unit), and the dedupe-for-
   * total, listed/private split, positionsCount, the emit and the report all read
   * this one array. Removing it here is what keeps it out of every book total; the
   * split-out rows are emitted as `BOOK_POLYCAB` for the Polycab page alone.
   */
  const polycab = positions.filter((p) => RINGFENCED_SECURITY_KEYS.has(p.securityKey));
  for (let i = positions.length - 1; i >= 0; i--) {
    if (RINGFENCED_SECURITY_KEYS.has(positions[i].securityKey)) positions.splice(i, 1);
  }

  // THE REVIEW'S PRIVATE-MARKET ROWS, IN PLACE OF THE STATEMENT ROWS THEY REPLACE.
  const review = PRIVATE_MARKET_FROM_REVIEW ? reviewBookLayer({ root: ROOT, positions, unvalued: unvaluedHoldings }) : null;
  const supersededUnvaluedBy = new Map();
  if (review) {
    const id = (x) => `${x.accountId}|${x.securityKey}`;
    for (let i = positions.length - 1; i >= 0; i--) if (review.removePositions.has(id(positions[i]))) positions.splice(i, 1);
    for (let i = unvaluedHoldings.length - 1; i >= 0; i--) {
      const u = unvaluedHoldings[i];
      if (!review.removeUnvalued.has(id(u))) continue;
      supersededUnvaluedBy.set(u.accountId, (supersededUnvaluedBy.get(u.accountId) ?? 0) + 1);
      unvaluedHoldings.splice(i, 1);
    }
    positions.push(...review.positions);
    positions.sort((a, b) => a.accountId.localeCompare(b.accountId) || a.securityKey.localeCompare(b.securityKey));
    notes.push(...review.notes);
    // AN ACCOUNT THE REVIEW DATES MUST HOLD ONLY THE REVIEW'S LINES. Its dated
    // record replaces the statement's calls and capital moves on the
    // Transactions card (`capitalMovesWithCalls`), so a statement holding with
    // money left beside it would be valued against purchases that never bought
    // it. Refused here rather than discovered on a page (Stage 10dh).
    const dated = new Set(review.flows.map((f) => f.accountId));
    const mixed = positions.filter((p) => dated.has(p.accountId) && !p.review
      && ((isNum(p.marketValue) && p.marketValue !== 0) || (isNum(p.costBasis) && p.costBasis !== 0)));
    if (mixed.length) {
      throw new Error(`build-book: ${mixed.length} statement holding(s) carry money on an account the review dates — `
        + mixed.map((p) => `${p.security} (${p.accountId})`).join("; ")
        + ". The review's dated rows would stand in for a record that bought something else.");
    }
    notes.push(`review: ${dated.size} account(s) carry the review's dated rows, and every holding with money on them is the review's own`);
  }

  /**
   * THE UNVALUED ROWS: FENCED, CROSS-REFERENCED, ORDERED.
   *
   * The fence is a decision about a SECURITY and holds wherever it is reported,
   * so it applies to a quantity-only row exactly as to a valued one.
   *
   * A CUSTODIAN'S ROW MAY BE THE SAME UNITS A FUND'S OWN STATEMENT REPORTS. The
   * demat statements list every fund unit the family owns, and for most of them
   * the fund's own account is also in this book — valued (Buoyant, Sanshi) or
   * not (India SME, Sky Capital). Listed from both sides, a screen of "held but
   * not valued" would show one holding twice, or show a holding the fund's own
   * statement values as if nothing valued it. So each custody row whose ISIN
   * `AIF_UNITS` assigns to a reporting fund is checked the way
   * `dropDepositoryDuplicates` checks a valued one — the SAME OWNER's account at
   * that fund carrying the same unit count to the printed precision — and a
   * match names it in `sameUnitsReportedBy`. Nothing is dropped: the row is
   * still what the custodian printed. A count that does not match is NAMED, not
   * paired, because two statements drawn on different dates describe different
   * unit counts and neither may be assumed to contain the other.
   */
  for (let i = unvaluedHoldings.length - 1; i >= 0; i--) {
    if (RINGFENCED_SECURITY_KEYS.has(unvaluedHoldings[i].securityKey)) unvaluedHoldings.splice(i, 1);
  }
  // THE FAMILY'S KEEP-UNVALUED TABLE, CHECKED FOR DEAD ENTRIES. An entry that
  // reaches no row means its account or ISIN drifted, and the row it was about
  // went back to the statement's own reason without a word. Printed when every
  // entry reached its row too, so a clean run and a deleted check differ.
  for (const d of KEPT_UNVALUED) {
    const n = keptUnvaluedHits.filter((x) => x === d).length;
    notes.push(n === 1
      ? `kept unvalued by the family's decision of ${d.decided}: ${d.isin} on ${d.provider} ${d.accountNo} — its reason says so`
      : `KEPT_UNVALUED entry ${d.isin} on ${d.provider} ${d.accountNo} reached ${n} row(s), not one — `
        + "check shared/keptUnvalued.mjs against the statement.");
  }
  {
    const accountById = new Map(accounts.map((a) => [a.accountId, a]));
    const tie = (q, want) => isNum(q) && Math.abs(q - want) <= 0.0005 + Math.abs(want) * 1e-9;
    for (const u of unvaluedHoldings) {
      if (!CUSTODY_PROVIDERS.has(accountById.get(u.accountId)?.provider)) continue;
      const entry = u.isin ? AIF_UNITS[u.isin] : null;
      if (!entry?.reportedBy || !isNum(u.quantity)) continue;
      const theirs = new Set(accounts
        .filter((a) => a.provider === entry.reportedBy && a.ownerId === u.ownerId).map((a) => a.accountId));
      const matches = [...new Set([
        ...positions.filter((p) => theirs.has(p.accountId) && tie(p.quantity, u.quantity)).map((p) => p.accountId),
        ...unvaluedHoldings.filter((x) => theirs.has(x.accountId) && tie(x.quantity, u.quantity)).map((x) => x.accountId),
      ])];
      if (matches.length === 1) { u.sameUnitsReportedBy = matches[0]; continue; }
      // What the same owner's fund accounts DO carry, whatever they call it: a
      // custodian and a fund spell one class differently, so a securityKey join
      // here would report "no such holding" about a folio that holds it.
      const held = [
        ...positions.filter((p) => theirs.has(p.accountId)),
        ...unvaluedHoldings.filter((x) => theirs.has(x.accountId)),
      ];
      notes.push(`the custodian reports ${u.quantity} unit(s) of ${u.security} on ${u.accountId} (${u.asOf}) with no value, and `
        + (matches.length > 1
          ? `${matches.length} of the same owner's ${entry.reportedBy} accounts carry that count — it is not paired with either`
          : !theirs.size
            ? `no ${entry.reportedBy} account of the same owner's is in this book`
            : `the same owner's ${entry.reportedBy} account(s) carry ${held.length
              ? held.map((x) => `${x.quantity ?? "no count of"} unit(s) of ${x.security} (${x.accountId})`).join("; ")
              : "no holding"}`)
        + ". Both are listed as printed: two statements that do not agree on a unit count are not assumed to describe one holding.");
    }
  }
  unvaluedHoldings.sort((a, b) => a.accountId.localeCompare(b.accountId) || a.securityKey.localeCompare(b.securityKey)
    || (a.quantity ?? 0) - (b.quantity ?? 0));
  /**
   * A RING-FENCED ROW THAT WAS HALF OF A DEDUPE PAIR WOULD MISDIAGNOSE ITS PARTNER.
   *
   * `dedupeGroup` marks one holding reported on two members' statements. Splicing
   * one member's row out leaves the other alone in its group, and the broken-dedupe
   * check below then reports it as "the reconciler matched it against a row in
   * another account that is not in the book — check the partner account's
   * authoritative holdings issue". That sends the next reader to audit a supersede
   * rule that is working perfectly, for a row this constant removed on purpose.
   *
   * No ring-fenced row carries a group today, which is exactly why this has to be
   * written now: the first one that does would produce a confident wrong answer.
   * Reported, never repaired — collapsing or re-tagging the partner would change a
   * consolidated figure to keep a check quiet.
   */
  const fencedGroups = polycab.map((p) => p.dedupeGroup).filter(Boolean);
  for (const g of fencedGroups) {
    const left = positions.filter((p) => p.dedupeGroup === g);
    if (left.length) {
      notes.push(`ring-fenced holding in dedupe group ${g} left ${left.length} position(s) `
        + `(${left.map((p) => `${p.security} / ${p.accountId}`).join("; ")}) alone in that group. They are NOT a broken `
        + "dedupe: their partner is ring-fenced out of the book on purpose. Their value is counted as reported, which is "
        + "correct — but if the partner is ever folded back in, check that the group collapses again.");
    }
  }

  if (polycab.length) {
    const pv = sum(polycab.map((p) => (isNum(p.marketValue) ? p.marketValue : 0)));
    notes.push(`${polycab.length} ring-fenced holding(s) — ${polycab.map((p) => p.security).join(", ")}, `
      + `${r2(pv).toLocaleString("en-IN")} — are carried in the archive and in BOOK_POLYCAB, and OUT of every `
      + "consolidated total, listed/private split, allocation, sector, entity and holdings table. This is the "
      + "family's PROMOTER stock, shown only on the Polycab page. Remove the key from RINGFENCED_SECURITY_KEYS in "
      + "build-book.mjs to fold it back into the book.");
  }

  if (review) {
    accounts.push(...review.accounts);
    const reviewHeld = new Set(review.positions.map((p) => p.accountId));
    for (const a of accounts) {
      if (reviewHeld.has(a.accountId)) { a.noPositionsReason = null; continue; }
      const n = supersededUnvaluedBy.get(a.accountId);
      if (!n) continue;
      const left = unvaluedHoldings.some((u) => u.accountId === a.accountId) || positions.some((p) => p.accountId === a.accountId);
      a.noPositionsReason = left && a.noPositionsReason
        ? `${a.noPositionsReason}. ${n} of these are private-market holdings, counted under the family's consolidated review (MOPWM, 30 Jun 2026) instead`
        : left ? a.noPositionsReason
        : `the private-market holding this statement records is counted under the family's consolidated review (MOPWM, 30 Jun 2026), the source for private-market holdings; the statement's units stay in the archive`;
    }
  }

  accounts.sort((a, b) => a.accountId.localeCompare(b.accountId));
  capitalGains.sort((a, b) => a.accountId.localeCompare(b.accountId));

  const owners = OWNERS
    .filter((o) => accounts.some((a) => a.ownerId === o.ownerId))
    .map((o) => ({ ownerId: o.ownerId, displayName: o.displayName }));
  if (accounts.some((a) => a.ownerId === NOT_ATTRIBUTED)) owners.push({ ownerId: NOT_ATTRIBUTED, displayName: NOT_ATTRIBUTED_NAME });

  /**
   * CARRY BOTH, COUNT ONCE.
   *
   * The same position can appear on two family members' statements — this drop's
   * 360 ONE Special Opportunities Fund Series 8 Class A3 is reported identically
   * under CRN37702 and CRN60117. Neither row is suppressed: both are in
   * `positions`, both show on their own account view, and each carries
   * `alsoReportedUnder` naming the other. But the CONSOLIDATED total counts each
   * `dedupeGroup` once, exactly as `dedupedPositions` does in the app and
   * `consolidatedValue` does in the reconciler. Summing both put 1.46 Cr into the
   * book's headline twice.
   */
  const seenGroups = new Set();
  const dedupedForTotal = [];
  let totalValue = 0;
  let doubleCounted = 0;
  for (const p of positions) {
    const mv = isNum(p.marketValue) ? p.marketValue : 0;
    if (p.dedupeGroup) {
      if (seenGroups.has(p.dedupeGroup)) { doubleCounted += mv; continue; }
      seenGroups.add(p.dedupeGroup);
    }
    dedupedForTotal.push(p);
    totalValue += mv;
  }
  totalValue = r2(totalValue);
  /**
   * A GROUP WITH ONE MEMBER IS A BROKEN DEDUPE, NOT AN ABSENT DUPLICATE.
   *
   * `dedupeGroup` exists to make a consolidated total count one holding once. A
   * group that reaches the book with a SINGLE position collapses nothing, so the
   * total is the naive sum of rows the reconciler judged to be one holding —
   * which is silent, because a tag that does nothing looks exactly like a book
   * with no duplicates in it. That is how 1.47 Cr of 360 ONE Special
   * Opportunities was double-counted for a drop: its partner row lost the tag to
   * the supersede rule (see `dedupeByAcctSec`) and nothing said so.
   *
   * Reported rather than repaired. The propagation above is the repair; this is
   * the check that says it worked, and a future drop where it stops working gets
   * a named line in the book report instead of a wrong headline.
   */
  const groupMembers = new Map();
  for (const p of positions) {
    if (!p.dedupeGroup) continue;
    (groupMembers.get(p.dedupeGroup) ?? groupMembers.set(p.dedupeGroup, []).get(p.dedupeGroup)).push(p);
  }
  // A group whose partner was RING-FENCED is not broken, and it already has its
  // own note with the right cause. Excluded here so the run does not carry two
  // explanations for one fact, one of them pointing at the wrong file.
  const fencedGroupSet = new Set(fencedGroups);
  const brokenGroups = [...groupMembers.entries()].filter(([g, ps]) => ps.length < 2 && !fencedGroupSet.has(g));
  for (const [g, ps] of brokenGroups) {
    notes.push(`dedupe group ${g} reached the book with ONE position (${ps[0].security}, `
      + `${ps[0].accountId}) — the reconciler matched it against a row in another account that is not in `
      + "the book, so nothing is collapsed and its value is counted as reported. Check the partner account's "
      + "authoritative holdings issue.");
  }
  if (doubleCounted) {
    notes.push(`${seenGroups.size} holding(s) reported under more than one member: both rows are carried, `
      + `and ${r2(doubleCounted).toLocaleString("en-IN")} is excluded from the consolidated total so each is counted once`);
  }

  /**
   * THE FAMILY'S ANSWERS, NAMED — AND HELD TO THE BOOK.
   *
   * "both are separate investments" — the family, 28 Sep 2026, about the two
   * pairs this book used to count once (`SEPARATE_INVESTMENTS` in
   * `shared/separateInvestments.mjs`, read by the policy it answers). Named on
   * every run with each account's row and what counting both adds, because a decision
   * that changes a consolidated figure must be visible where the figure is
   * reported, not only where it is made.
   *
   * TWO WAYS IT CAN STOP HOLDING, AND BOTH ARE LOUD:
   *   • a row it names still carries a `dedupeGroup` — the archive was tagged
   *     before the answer and not replayed, so the consolidated total would count
   *     the pair once against the family's word. That REFUSES the build rather
   *     than writing a book that contradicts them (`npm run replay:dedupe`).
   *   • an account it names holds no such row — the key has drifted (a change to
   *     `securityKeyOf` the table did not follow) or the holding is gone. A note,
   *     not a refusal: a redeemed holding is not an error. `separateInvestments
   *     .test.ts` fails on it for today's book, where both pairs are held.
   */
  const separateInvestments = SEPARATE_INVESTMENTS.map((d) => {
    const rows = d.accounts.map((a) => {
      const acc = accounts.find((x) => x.provider === a.provider && String(x.accountNo) === String(a.accountNo));
      const ps = acc ? positions.filter((p) => p.accountId === acc.accountId && p.securityKey === d.securityKey) : [];
      return { provider: a.provider, accountNo: a.accountNo, accountId: acc?.accountId ?? null, owner: acc?.owner ?? null, positions: ps };
    });
    return { ...d, rows };
  });
  const stillOnce = separateInvestments.flatMap((d) => d.rows.flatMap((r) => r.positions.filter((p) => p.dedupeGroup)));
  if (stillOnce.length) {
    throw new Error(`${stillOnce.length} position(s) the family confirmed as separate investments still carry a dedupeGroup `
      + `(${stillOnce.map((p) => `${p.security} / ${p.accountId}`).join("; ")}), so the consolidated total would count them `
      + "once against the family's word. The archive was tagged before the answer: run `npm run replay:dedupe`.");
  }
  for (const d of separateInvestments) {
    const held = d.rows.filter((r) => r.positions.length);
    const missing = d.rows.filter((r) => !r.positions.length);
    const value = sum(held.flatMap((r) => r.positions.map((p) => (isNum(p.marketValue) ? p.marketValue : 0))));
    if (missing.length) {
      notes.push(`family decision ${d.confirmed} names ${d.securityKey} under ${missing.map((r) => `${r.provider} ${r.accountNo}`).join(" and ")}, `
        + "and no such holding is in the book there — the key may have drifted from `securityKeyOf`, or the holding has gone. "
        + "Check SEPARATE_INVESTMENTS in shared/separateInvestments.mjs.");
    }
    if (held.length) {
      notes.push(`separate investments, confirmed by the family on ${d.confirmed}: ${held[0].positions[0].security} under `
        + `${held.map((r) => `${r.owner ?? r.provider} (${r.accountNo})`).join(" and ")} — each counted in full, `
        + `${r2(value).toLocaleString("en-IN")} across ${held.length} account(s).`);
    }
  }

  /**
   * ── WHICH SIDE OF THE BOOK EACH HOLDING IS ON, AND WHAT IS NOT PLACED ─────
   *
   * Reported on EVERY run, including when nothing is unplaced, for the reason
   * this file keeps naming: a guard that only speaks when it fires is
   * indistinguishable, on a clean run, from one that was deleted.
   *
   * The unplaced funds are NAMED rather than counted, because that list IS the
   * ask — each is one document (a SEBI registration, a contribution agreement)
   * away from being placed, and a reader cannot chase a number.
   */
  {
    const side = (k) => dedupedForTotal.filter((p) => (p.marketSide ?? null) === k);
    const val = (rows) => sum(rows.map((p) => p.marketValue ?? 0));
    const L = side("listed"), P = side("private"), U = side(null);
    notes.push(`market side: listed ${r2(val(L)).toLocaleString("en-IN")} over ${L.length} holding(s), `
      + `private ${r2(val(P)).toLocaleString("en-IN")} over ${P.length}, `
      + `and ${r2(val(U)).toLocaleString("en-IN")} over ${U.length} that nothing places on either side. `
      + "An AIF is placed first by the family's own classification of what the fund invests in "
      + "(FAMILY_MARKET_SIDE in shared/aifCategory.mjs), then by a fund naming its own discipline as private "
      + "equity or venture, then by the SEBI category the statements print: Category III trades LISTED "
      + "securities, Categories I and II are private capital. The three are summed from the positions and "
      + "none is the remainder of the other two.");
    /**
     * THE FAMILY'S PLACINGS, NAMED — and the ones that DIFFER from what the
     * statement's category alone would say, named apart. A decision that
     * overrules a printed category silently reads, in the book, exactly like
     * the category having decided; this is the line that says it did not.
     * Reported on every run, including when nothing differs.
     */
    {
      const fam = dedupedForTotal.filter((p) => p.assetClass === "AIF")
        .map((p) => {
          const acct = accounts.find((a) => a.accountId === p.accountId);
          return { p, b: fundMarketSideBasis(p.security, acct) };
        })
        .filter((x) => x.b.basis === "family");
      const differs = fam.filter(({ p, b }) => {
        const acct = accounts.find((a) => a.accountId === p.accountId);
        const byCategory = readsAsPrivateEquity(p.security, acct) ? "private"
          : b.category === "Category III" ? "listed"
          : b.category === "Category I" || b.category === "Category II" ? "private" : null;
        return byCategory !== b.side;
      });
      const differFunds = [...new Set(differs.map(({ p, b }) => `${p.security} (${b.category ?? "no category printed"} → ${b.side}: ${b.decision.invests})`))].sort();
      notes.push(`market side: ${fam.length} AIF holding(s) placed by the family's own classification of what the `
        + `fund invests in; ${differs.length} of them, in ${differFunds.length} fund(s), differ from what the printed SEBI `
        + `category alone would say`
        + (differFunds.length ? ` — ${differFunds.join("; ")}` : "")
        + ". The statement's category is unchanged; only the side is taken from the family.");
    }
    if (U.length) {
      const funds = [...new Set(U.map((p) => p.security))].sort();
      notes.push(`market side: ${funds.length} fund(s) print NO SEBI category and the family have not classified `
        + `them, so they are on neither side and are counted apart rather than defaulted to one: ${funds.join("; ")}. `
        + "Putting them private would claim they are private capital and putting them listed would claim the "
        + "opposite, and no document in this archive makes either claim. One line from the family, or a fund's own "
        + "SEBI registration, settles each one.");
    }
    /**
     * THE FAMILY'S DECLARED CATEGORIES, NAMED — on every run, including at
     * zero. A category no statement printed files a holding under its AIF
     * drill-down section exactly as firmly as one that did, so the report says
     * which rest on the family's word (`DECLARED_AIF_CATEGORY`) rather than on
     * a document. The SIDE of the book is not what this decides: the family's
     * own placing (`FAMILY_MARKET_SIDE`, above) outranks any category.
     */
    const declared = dedupedForTotal.filter((p) => p.assetClass === "AIF"
      && readAifCategory(p.security, accounts.find((a) => a.accountId === p.accountId), p.securityKey).source === "family");
    notes.push(`market side: ${declared.length} holding(s) take a SEBI category the FAMILY declared, because no `
      + `statement for them prints one${declared.length ? ` — ${[...new Set(declared.map((p) => p.security))].sort().join("; ")}` : ""}. `
      + "A declaration only ever fills a category the statements leave empty and never overrides one they print; "
      + "which side of the book each sits on is the family's own placing, noted above.");
    /**
     * THE PE OVERRIDE, NAMED. A fund whose own name says private equity or
     * venture is private whatever category it prints, and Transition Venture's
     * `Category I/II` — the issuer declining to commit — would otherwise be
     * unplaced despite naming its own discipline. Silent, that reads as the
     * category having placed it.
     */
    // …and only where the PE read is what actually decided: a fund the family
    // have placed themselves is theirs, and crediting its side to the PE read
    // would name the wrong reason for it.
    const pe = dedupedForTotal.filter((p) => p.assetClass === "AIF"
      && fundMarketSideBasis(p.security, accounts.find((a) => a.accountId === p.accountId), p.securityKey).basis === "private-equity"
      && readAifCategory(p.security, accounts.find((a) => a.accountId === p.accountId), p.securityKey).category !== "Category I"
      && readAifCategory(p.security, accounts.find((a) => a.accountId === p.accountId), p.securityKey).category !== "Category II");
    if (pe.length) {
      notes.push(`market side: ${pe.length} holding(s) are private because the paperwork names their own `
        + `discipline, not because of a category — ${[...new Set(pe.map((p) => p.security))].sort().join("; ")}. `
        + "Their statements print no single SEBI category, so without that read they would be unplaced.");
    }
  }
  const asOf = accounts.map((a) => a.asOf).filter(Boolean).sort().at(-1) ?? "";

  /**
   * NAV HISTORY — MEASURED from the archive's own reissues.
   *
   * This used to be `[]` with a note reading "the corpus carries an opening and
   * a closing portfolio value per account and nothing between them". True of the
   * nine-account corpus it was written against; false since `august-2026-b`
   * brought the first REISSUE of a statement an account had already filed. See
   * `navHistoryFrom` for what the archive actually carries and for the four
   * rules that keep the series from asserting a path nothing measured.
   */
  const { navHistory, accountNavHistory, coverage: navCoverage, snapshotsByAccount, undatedCapital } = navHistoryFrom(
    byAccount, new Set(accounts.map((a) => a.accountId)), dedupeByAcctSec, accountCashFlows, positions, notes,
  );
  if (review) {
    // An account valued by the review alone has one dated value — the review's.
    const valueOf = (aid) => r2(positions.filter((p) => p.accountId === aid).reduce((t, p) => t + p.marketValue, 0));
    const dateOf = (aid) => positions.filter((p) => p.accountId === aid).map((p) => p.priceAsOf).sort().at(-1) ?? REVIEW_AS_OF;
    for (let i = navCoverage.unvalued.length - 1; i >= 0; i--) {
      const u = navCoverage.unvalued[i];
      if (u.bookValue > 0) { navCoverage.unvalued.splice(i, 1); navCoverage.single.push({ accountId: u.accountId, provider: u.provider, accountNo: u.accountNo, date: dateOf(u.accountId), bookValue: u.bookValue }); }
    }
    for (const a of review.accounts) navCoverage.single.push({ accountId: a.accountId, provider: a.provider, accountNo: a.accountNo, date: dateOf(a.accountId), bookValue: valueOf(a.accountId) });
    navCoverage.single.sort((x, y) => x.accountId.localeCompare(y.accountId));
  }
  // Struck on the SAME snapshots the series is, so the bridge's opening and
  // closing values are the same figures the chart plots. Deriving them again
  // from the archive would be a second selection of "which statement is the
  // mark at this date", which is the failure this repo names most often.
  const attribution = attributionFrom(snapshotsByAccount, positions, notes);
  // The short/long split is produced wherever a lot register exists and left
  // NULL everywhere else — counted rather than asserted, so this note cannot go
  // stale the way its predecessor did (it claimed the split was impossible on
  // every position while the broker's lot register sat unread in `source/`).
  {
    const withSplit = positions.filter((p) => p.stCostBasis !== null || p.ltCostBasis !== null);
    const accountsWithSplit = [...new Set(withSplit.map((p) => p.accountId))];
    notes.push(withSplit.length
      ? `unrealised short/long-term split is populated on ${withSplit.length} of ${positions.length} position(s), `
        + `across ${accountsWithSplit.length} of ${accounts.length} account(s) (${accountsWithSplit.join(", ")}): `
        + "those are the accounts whose broker publishes a LOT REGISTER with dated acquisitions. "
        + "It is NULL on the rest, because the capital register the managed accounts issue is a "
        + "capital-account ledger (contributions, withdrawals, TDS transfers) and carries no purchase dates."
      : "unrealised short/long-term split is NULL on every position: it needs per-lot purchase dates, "
        + "and no statement in this drop carries a lot register.");
    // A realised half withheld rather than written as a zero, NAMED, so the
    // null is visibly a decision about a window and not a missing reader.
    for (const w of realisedWithheld) {
      notes.push(`realised is NULL, not ₹0, on ${w.security} (${w.accountId}): `
        + (w.after
          ? `every one of its ${w.after} capital-gain lot(s) was sold after the holding's own statement date, so the record holds no sale of it up to that date`
          : `its account's capital gain record opens on ${w.opens ?? "a date it does not print"}, after the holding's own statement date`)
        + " — a zero there would read as \"sold nothing\" where the record simply does not reach the holding.");
    }
    // FIFO's restatements, NAMED with both figures, so any one can be checked
    // against the statement it overrides.
    for (const f of fifoRestated) {
      notes.push(`FIFO restates the cost of ${f.security} (${f.accountId}): the statement prints `
        + `${f.printed === null ? "no cost" : f.printed.toLocaleString("en-IN")}, the fund's own unit record matched `
        + `first-in, first-out holds ${f.fifo.toLocaleString("en-IN")} of cost in the units still held`
        + (f.costSold ? `, and ${f.costSold.toLocaleString("en-IN")} of cost was sold for a realised `
          + `${f.realised.toLocaleString("en-IN")}` : "")
        + ". The record carries every unit from its first purchase, and its FIFO balance ties to the printed unit count.");
    }
    // Named, never silently dropped: a register that does not account for the
    // units held cannot split them, and saying so is the whole point.
    for (const u of splitUnreconciled) {
      notes.push(`no short/long-term split for ${u.security} (${u.accountId}): the lot register accounts for `
        + `${u.lotQty ?? "an unknown number of"} unit(s) against ${u.held} held, so the lots do not cover the `
        + "position. Splitting on them would put a tax basis on units the position does not contain, or treat "
        + "the uncovered cost as long-term when it is simply unknown.");
    }
  }

  {
    // Said on every run, zeros included: a tie check that only speaks when it
    // fires cannot be told, on a clean run, from one that was deleted.
    const cols = Object.values(accountBridges).flat();
    const held = cols.filter((b) => !b.ties).length;
    notes.push(`value bridge: ${cols.length - held} of ${cols.length} column(s) add up to their closing value within the `
      + `statement's own rounding; ${held} withheld, each named above with the lines it could not make add up`);
  }

  // Sorted by date so the emitted array is deterministic and the file
  // regenerates byte-identically; the accountId breaks ties within a date.
  capitalMoves.sort((a, b) =>
    a.date.localeCompare(b.date) || a.accountId.localeCompare(b.accountId) || a.direction.localeCompare(b.direction));
  const positionTranches = positionTranchesFrom(capitalMoves, reclassifications, positions, notes, fifoLotsByPosition);
  // After the tranches, because the tranches ARE the licence: a cost is carried
  // through a switch only onto a holding whose dated contributions account for
  // every unit it holds. Market value, and therefore every total and every side
  // of the book, is untouched — this moves cost and the three figures derived
  // from it, on the positions a switch restated and nowhere else.
  carryCostThroughSwitches(positions, positionTranches, reclassifications, accountBridges, notes);
  grossPaidCost(positions, positionTranches, notes);
  // TWO PATHS TO ONE COST, AND THEY MUST AGREE. A class switch with no sale is
  // carried above by `carryCostThroughSwitches`; FIFO ran over the same unit
  // record and reached its own answer independently. They are different code
  // over the same record, so agreement is a real check — and a disagreement
  // means one of them is wrong about which units are which, which is the one
  // thing a cost must never be. Named loudly rather than resolved silently.
  for (const f of fifoSwitchOnly) {
    const p = positions.find((x) => x.accountId === f.accountId && x.securityKey === f.securityKey);
    if (!p) continue;
    if (p.costBasisSource !== "carried-through-switch") {
      notes.push(`FIFO and the class-switch carry disagree on ${p.security} (${p.accountId}): FIFO over the unit record `
        + `holds ${f.fifoCost} of cost, and the switch carry did not restate the statement's ${p.costBasis}. `
        + "The statement's cost stands; see the switch notes above for why it was not carried.");
    } else if (Math.abs(p.costBasis - f.fifoCost) > 1) {
      notes.push(`FIFO and the class-switch carry DISAGREE on ${p.security} (${p.accountId}): carried ${p.costBasis}, `
        + `FIFO ${f.fifoCost}. One of them has the wrong units in the wrong lot.`);
    } else {
      notes.push(`FIFO agrees with the class-switch carry on ${p.security} (${p.accountId}): both hold `
        + `${p.costBasis.toLocaleString("en-IN")} of cost in the units still held, and the unit record shows none sold.`);
    }
  }
  const shareMovements = shareMovementsFrom(docs, [...positions, ...polycab], accounts, notes, unvaluedHoldings);
  for (const r of review?.removeWindows ?? []) {
    // A WINDOW GOES WITH THE LINE IT IS THE QUANTITY ACCOUNT OF. Named by its key,
    // or — where the key is only the depository's own spelling — by the ISIN its
    // tape prints, on the one account named. Anything but exactly one window
    // refuses the build: a supersede that took the wrong window, or none, would
    // leave a line counted twice or a movement nobody can find.
    const keys = r.isin
      ? Object.keys(shareMovements).filter((k) => shareMovements[k].accountId === r.accountId
        && (shareMovements[k].isin ?? "").trim().toUpperCase() === r.isin.toUpperCase())
      : [`${r.accountId}|${r.securityKey}`].filter((k) => k in shareMovements);
    if (keys.length !== 1) {
      throw new Error(`build-book: the review supersedes the movement window ${r.accountId}|${r.securityKey ?? `isin ${r.isin}`}, `
        + `which is in the book ${keys.length} times, not once`);
    }
    // What the depository printed stays named: its own spelling, and the units it
    // closed the window at (null where the tape printed no closing).
    const w = shareMovements[keys[0]];
    r.entry.securityKey = w.securityKey;
    r.entry.security = w.security ?? r.entry.reviewLine;
    r.entry.quantity = w.closing ?? null;
    // AND THE WINDOW ITSELF RIDES ON THE ENTRY. The statement still reports the
    // holding — what it no longer does is decide the book's figure for it — so
    // the review cross-check (section H) reads its dated balance from here
    // rather than calling a line the depository prints "on no statement".
    r.entry.window = { ...w };
    delete shareMovements[keys[0]];
  }

  return {
    accounts, positions, polycab, owners, capitalGains, accountCashFlows, entityCashFlows,
    capitalMoves, positionTranches, shareMovements,
    capitalFromInception: [...capitalFromInception].sort(),
    navHistory, accountNavHistory, navCoverage, undatedCapital, attribution,
    excludedAccounts, bankAccounts, unvaluedHoldings, separateInvestments,
    reviewSuperseded: review?.superseded ?? [], reviewWrittenOff: review?.writtenOff ?? [], reviewFlows: review?.flows ?? [],
    // Sorted deterministically: classified first (biggest book first), the
    // unclassified remainder last. Insertion order would make the emitted file
    // depend on map iteration, and the book must regenerate byte-identically.
    realisedByClass: [...realisedByClass.values()]
      .map((e) => ({
        accountId: e.accountId, entity: e.entity, assetClass: e.assetClass, lots: e.lots,
        realisedST: r2(e.realisedST), realisedLT: r2(e.realisedLT),
        securities: [...e.securities].sort(),
      }))
      .sort((a, b) =>
        (a.assetClass === null) - (b.assetClass === null)
        || (a.assetClass ?? "").localeCompare(b.assetClass ?? "")
        || a.entity.localeCompare(b.entity)),
    accountReturns, accountBridges,
    corporateActions: corporateActionsAll.sort((a, b) =>
      (a.exDate ?? "").localeCompare(b.exDate ?? "") || a.securityKey.localeCompare(b.securityKey)),
    commitments,
    summary: {
      asOf,
      /**
       * LISTED vs PRIVATE, SPLIT BY WHAT THE STATEMENTS SAY — AND A THIRD SIDE.
       *
       * This was `listedValue: totalValue, privateValue: 0` — true when every
       * account in the book was a listed-equity mandate, and false the moment
       * the AIF statements got a reader.
       *
       * IT WAS THEN `assetClass`, WITH EVERY AIF PRIVATE, and that was the same
       * mistake one drop later: true of the AIFs the book held when it was
       * written — 360 ONE Special Opportunities and Transition Venture, both
       * drawdown vehicles — and false from the drop that brought the Category
       * III folios. **₹297.78 Cr, 84% of the private half, was Sanshi, Buoyant
       * and Carnelian Bharat Amritkaal**: open-ended funds trading LISTED
       * securities, reported as private capital.
       *
       * It is read from the SEBI category the statements print
       * (`shared/aifCategory.mjs`, and `Position.marketSide` above). A holding
       * no statement places is on NEITHER side and is counted apart: filing it
       * private would claim it is private capital and filing it listed would
       * claim the opposite, and both are claims no document makes.
       *
       * ALL THREE ARE SUMMED FROM THE POSITIONS and none is `total − the other
       * two`: a residual absorbs whatever a rule stops naming, silently.
       */
      listedValue: r2(sum(dedupedForTotal.filter((p) => p.marketSide === "listed").map((p) => p.marketValue ?? 0))),
      privateValue: r2(sum(dedupedForTotal.filter((p) => p.marketSide === "private").map((p) => p.marketValue ?? 0))),
      unplacedValue: r2(sum(dedupedForTotal.filter((p) => p.marketSide === null).map((p) => p.marketValue ?? 0))),
      totalValue,
      positionsCount: positions.length,
      entitiesCount: owners.length,
      startupsCount: 0,
      accountsCount: accounts.length,
    },
    unclassified: [...unclassified.entries()].map(([providerSector, count]) => ({ providerSector, count })),
    notes,
  };
}

// ── Emit ─────────────────────────────────────────────────────────────────────

/** Stable JSON: keys in the order given, two-space indent, no trailing spaces. */
const j = (v) => JSON.stringify(v, null, 2);

function emit(book) {
  const L = [];
  L.push("// GENERATED — do not edit by hand. Rebuild with `npm run build-book`.");
  L.push("//");
  L.push("// Source: the audit archive under public/audit/, itself generated from the");
  L.push("// statements in source/ by `npm run extract`. Every figure below traces to one");
  L.push("// document; nothing here is estimated, interpolated or defaulted.");
  L.push("//");
  L.push("// Fields that are null are NOT ZERO. They are measurements this corpus does not");
  L.push("// carry, and the UI renders them as an em dash. See docs/BOOK-REPORT.md for the");
  L.push("// list and what document would supply each.");
  L.push("import type {");
  L.push("  Account, AccountBridge, AccountReturnBlock, BookSummary, CapitalMove, CashFlow, Commitment,");
  L.push("  Attribution, CorporateAction, EntityCG, FundInvestment, NavCoverage, NavPoint, Position, PositionTranches,");
  L.push("  RealisedByClass, ReviewFlow, ReviewSuperseded, ReviewWrittenOff, ShareMovement, StartupInvestment, UndatedCapital, UnvaluedStatementHolding,");
  L.push('} from "@/lib/types";');
  L.push("");
  L.push(`/** Newest report date across all accounts. Individual accounts can be older. */`);
  L.push(`export const BOOK_AS_OF = ${JSON.stringify(book.summary.asOf)};`);
  L.push("");
  L.push(`export const BOOK_SUMMARY: BookSummary = ${j(book.summary)};`);
  L.push("");
  L.push("/** Account registry — one row per (provider, account no). Positions join on accountId. */");
  L.push(`export const BOOK_ACCOUNTS: Account[] = ${j(book.accounts)};`);
  L.push("");
  L.push("/** Canonical owners with at least one account in the book. */");
  L.push(`export const BOOK_OWNERS = ${j(book.owners)};`);
  L.push("");
  L.push(`export const BOOK_POSITIONS: Position[] = ${j(book.positions)};`);
  L.push("");
  L.push("/**");
  L.push(" * HELD, AND VALUED BY NO STATEMENT — a QUANTITY, never a value, and in no total.");
  L.push(" *");
  L.push(" * One row per holding an account's authoritative holdings document reports with");
  L.push(" * units and no market value: a fund that publishes no NAV, or a custodian that");
  L.push(" * records a face value or no rate. `reason` is the row's own; `sameUnitsReportedBy`");
  L.push(" * names the same owner's fund account whose own statement reports the identical units.");
  L.push(" */");
  L.push(`export const BOOK_UNVALUED_HOLDINGS: UnvaluedStatementHolding[] = ${j(book.unvaluedHoldings)};`);
  L.push("");
  L.push("/** Statement rows the family's consolidated review replaces (Stage 10dh): each names the review line now counted. */");
  L.push(`export const BOOK_REVIEW_SUPERSEDED: ReviewSuperseded[] = ${j(book.reviewSuperseded)};`);
  L.push("");
  L.push("/** The review's written-off private investments: a measured ₹0, in no total (Stage 10dh). */");
  L.push(`export const BOOK_REVIEW_WRITTEN_OFF: ReviewWrittenOff[] = ${j(book.reviewWrittenOff)};`);
  L.push("");
  L.push("/**");
  L.push(" * THE REVIEW'S DATED ROWS behind each holding it values (Stage 10dh): every purchase,");
  L.push(" * sale and income payout on its Transactions tab, each on its own date. What a private");
  L.push(" * fund's money-weighted return is struck on — the value it closes on is the review's,");
  L.push(" * so its flows are the same document's. `amount` is positive; `kind` gives the direction.");
  L.push(" */");
  L.push(`export const BOOK_REVIEW_FLOWS: ReviewFlow[] = ${j(book.reviewFlows)};`);
  L.push("");
  L.push("/**");
  L.push(" * RING-FENCED PROMOTER STOCK — Polycab India, the family's own promoter");
  L.push(" * holding, carried in the archive but summed into NO book total, split,");
  L.push(" * allocation, sector, entity or holdings table. It is deliberately ABSENT");
  L.push(" * from BOOK_POSITIONS and BOOK_SUMMARY above; the `/polycab` route is its only");
  L.push(" * reader. See RINGFENCED_SECURITY_KEYS in scripts/build-book.mjs and");
  L.push(" * docs/BOOK-REPORT.md. Folding it back into the book is a one-line change.");
  L.push(" */");
  L.push(`export const BOOK_POLYCAB: Position[] = ${j(book.polycab)};`);
  L.push("");
  L.push("/**");
  L.push(" * THE CONSOLIDATED DATED NAV SERIES — one point per date on which any covered");
  L.push(" * account restates, over the accounts that publish MORE THAN ONE dated");
  L.push(" * valuation, each `dedupeGroup` counted once.");
  L.push(" *");
  L.push(" * This was `[]` for several drops with a note saying the corpus carried two");
  L.push(" * points per account and nothing between them. That was true of the");
  L.push(" * nine-account corpus and false from the first REISSUE onwards — the fourth");
  L.push(" * absence in this repo recorded against a premise nobody rechecked. See");
  L.push(" * `navHistoryFrom` in build-book.mjs for the four rules that keep the series");
  L.push(" * honest: constant composition, carry-forward marks, dedupe at every date,");
  L.push(" * and external capital netted out on each account's own clock.");
  L.push(" *");
  L.push(" * `flowIn` is the net external capital that entered since the previous point,");
  L.push(" * so a reader can separate money added from value earned. `unreportedFlowValue`");
  L.push(" * is the MOVE in that interval of accounts whose capital movement no statement");
  L.push(" * establishes — the part of the change that cannot be proved to be performance.");
  L.push(" */");
  L.push(`export const BOOK_NAV_HISTORY: NavPoint[] = ${j(book.navHistory)};`);
  L.push("");
  L.push("/**");
  L.push(" * The same series per account, whole — so one mandate can be charted alone");
  L.push(" * and so the consolidated series above can be checked against its own parts.");
  L.push(" */");
  L.push(`export const BOOK_ACCOUNT_NAV_HISTORY: Record<string, NavPoint[]> = ${j(book.accountNavHistory)};`);
  L.push("");
  L.push("/**");
  L.push(" * WHAT THE SERIES COVERS, AND WHAT IT CANNOT — the accounts publishing two or");
  L.push(" * more dated valuations, the ones publishing exactly one, and the ones");
  L.push(" * publishing none. A series over 17 of 49 accounts that does not say so is a");
  L.push(" * claim about the book; this is what lets the page name every exclusion.");
  L.push(" *");
  L.push(" * `flowBasis` per covered account, over every step between two of its marks:");
  L.push(" * `reported` (the statements' own printed capital totals settle each step, or");
  L.push(" * a dated record does), `units-unchanged` (every step holds the same securities");
  L.push(" * at the same unit counts, none of them cash, so nothing was bought or");
  L.push(" * redeemed), or `unreported` (some step no statement settles — its move, never");
  L.push(" * the account's value, is carried per point as `unreportedFlowValue`).");
  L.push(" */");
  L.push(`export const BOOK_NAV_COVERAGE: NavCoverage = ${j(book.navCoverage)};`);
  L.push("");
  L.push("/**");
  L.push(" * CAPITAL NO DATED ROW CARRIES — where an account's printed capital totals move");
  L.push(" * between two of its marks by more than its dated record does over the same days.");
  L.push(" * The NAV series nets it inside that step, which needs no date. A money-weighted");
  L.push(" * return needs every flow on a day, so it names this amount rather than assuming");
  L.push(" * one: never dated, never dropped.");
  L.push(" */");
  L.push(`export const BOOK_UNDATED_CAPITAL: UndatedCapital[] = ${j(book.undatedCapital)};`);
  L.push("");
  L.push("/**");
  L.push(" * RETURN ATTRIBUTION over each covered account's own dated window — the exact");
  L.push(" * four-term bridge from the opening value to the closing one, plus every");
  L.push(" * holding priced at BOTH ends with its own price and trading effect.");
  L.push(" *");
  L.push(" * `open + price + trading + entered - exited + undecomposed = close`, to the");
  L.push(" * rupee, because market value is quantity x price on every priced row in this");
  L.push(" * archive. An account whose bridge does not tie is NOT PUBLISHED and is named");
  L.push(" * in the run's notes. See `attributionFrom` in build-book.mjs.");
  L.push(" */");
  L.push(`export const BOOK_ATTRIBUTION: Attribution = ${j(book.attribution)};`);
  L.push("");
  L.push("/**");
  L.push(" * Realised short/long-term gains as the MANAGER split them, per account.");
  L.push(" * `unrealisedST` / `unrealisedLT` are null: that split needs per-lot purchase");
  L.push(" * dates, which no statement in this drop carries.");
  L.push(" */");
  L.push(`export const BOOK_CAPITAL_GAINS: EntityCG[] = ${j(book.capitalGains)};`);
  L.push("");
  L.push("/** The canonical realised total, split by asset class — the headline nets these. */");
  L.push(`export const BOOK_REALISED_BY_CLASS: RealisedByClass[] = ${j(book.realisedByClass)};`);
  L.push("");
  L.push("/**");
  L.push(" * Dated external capital flows per account, for money-weighted return.");
  L.push(" * Sign: amount < 0 = capital in, > 0 = capital out, per `CashFlow` in types.ts.");
  L.push(" */");
  L.push(`export const BOOK_ACCOUNT_CASH_FLOWS: Record<string, CashFlow[]> = ${j(book.accountCashFlows)};`);
  L.push("");
  L.push("/**");
  L.push(" * THE FAMILY'S OWN DATED INVESTMENTS — money they put in and took out.");
  L.push(" *");
  L.push(" * Distinct from BOOK_ACCOUNT_CASH_FLOWS above, which exists for the XIRR and");
  L.push(" * carries a synthetic opening-value entry that is not a transaction anybody");
  L.push(" * made. These are movements the statements print as such, and they are what");
  L.push(" * the Transactions card leads with: a share a manager picked is that manager's");
  L.push(" * decision, and the capital behind the mandate is the family's.");
  L.push(" */");
  L.push(`export const BOOK_CAPITAL_MOVES: CapitalMove[] = ${j(book.capitalMoves)};`);
  L.push("");
  L.push("/**");
  L.push(" * The accounts whose capital record provably STARTS AT INCEPTION: every class's");
  L.push(" * earliest allotment brings the statement's own printed unit balance from zero");
  L.push(" * to exactly the units it allots. A return on the family's money needs the");
  L.push(" * whole record, and this is one of the three things that establishes it — see");
  L.push(" * `capitalRecordFromInception` in build-book and `contributionsAreComplete`.");
  L.push(" */");
  L.push(`export const BOOK_CAPITAL_FROM_INCEPTION: string[] = ${j(book.capitalFromInception)};`);
  L.push("");
  L.push("/**");
  L.push(" * Per-position contribution history, keyed `<accountId>|<securityKey>`, and");
  L.push(" * ONLY where the allotted units account for every unit held. Everything else");
  L.push(" * is absent by that gate rather than shown partially — see `positionTranchesFrom`.");
  L.push(" */");
  L.push(`export const BOOK_POSITION_TRANCHES: Record<string, PositionTranches> = ${j(book.positionTranches)};`);

  L.push("");
  L.push("/**");
  L.push(" * OPENING, PLUS, MINUS, CLOSING — one entry per holding-window, keyed");
  L.push(" * `accountId|securityKey`.");
  L.push(" *");
  L.push(" * Read off the demat statements' own per-ISIN blocks: a printed opening");
  L.push(" * balance, every dated movement with its running balance, and a printed");
  L.push(" * closing balance. `opening + unitsIn - unitsOut + corporateAction` equals");
  L.push(" * `closing` on every entry carrying a split, because `motilalDemat.mjs`");
  L.push(" * refuses to publish a block whose rows do not walk its own two printed");
  L.push(" * balances — where they do not, every movement term is null and `reason`");
  L.push(" * says so rather than a zero claiming nothing moved.");
  L.push(" *");
  L.push(" * EVERY FIGURE IS A QUANTITY. A depository movement carries no price and no");
  L.push(" * counterparty, so none of these is a trade and `unitsIn`/`unitsOut` are");
  L.push(" * never called bought and sold. `encumbranceMoves` is a COUNT and in no");
  L.push(" * total: a pledge moves units between free and pledged without any leaving");
  L.push(" * the account, and summing one would report the holding twice.");
  L.push(" */");
  L.push(`export const BOOK_SHARE_MOVEMENTS: Record<string, ShareMovement> = ${j(book.shareMovements)};`);
  L.push("");
  L.push("/**");
  L.push(" * The same flows keyed by OWNER — a person's money-weighted return is over");
  L.push(" * everything they own, so their accounts' flows merge here.");
  L.push(" */");
  L.push(`export const BOOK_ENTITY_CASH_FLOWS: Record<string, CashFlow[]> = ${j(book.entityCashFlows)};`);
  L.push("");
  L.push("/**");
  L.push(" * Time-weighted returns per account, as each manager publishes them.");
  L.push(" *");
  L.push(" * Each carries its OWN period vocabulary and its OWN benchmark, kept apart:");
  L.push(" * Goldstandard prints MTD / QTD / FYTD against N50TRI, Green Lantern and");
  L.push(" * Carnelian trailing 1m / 3m / 1y against S&P BSE 500. `siAnnualised` says");
  L.push(" * whether since-inception is annualised — false under a year, per the");
  L.push(" * reports' own disclosure. `feeBasis` says whether returns are net of fees.");
  L.push(" */");
  L.push(`export const BOOK_ACCOUNT_RETURNS: Record<string, AccountReturnBlock[]> = ${j(book.accountReturns)};`);
  L.push("");
  L.push("/**");
  L.push(" * The value bridge per account: opening → capital → realised → unrealised →");
  L.push(" * income → fees → closing, each block over ONE window and labelled with it.");
  L.push(" * Windows are NOT interchangeable and nothing is added across them.");
  L.push(" */");
  L.push(`export const BOOK_ACCOUNT_BRIDGES: Record<string, AccountBridge[]> = ${j(book.accountBridges)};`);
  L.push("");
  L.push("/**");
  L.push(" * NON-CASH corporate actions — bonuses, splits, rights. Kept apart from");
  L.push(" * dividend income: a bonus prints Amount 0.00 and its substance is the");
  L.push(" * entitlement, not a cash figure to be summed.");
  L.push(" */");
  L.push(`export const BOOK_CORPORATE_ACTIONS: CorporateAction[] = ${j(book.corporateActions)};`);
  L.push("");
  L.push("/**");
  L.push(" * UNDRAWN CAPITAL COMMITMENTS — money owed to a fund on demand.");
  L.push(" *");
  L.push(" * NOT a holding and never summed into NAV: the fund's current value is already");
  L.push(" * a position, and `undrawn` is capital that has not been invested yet. This is");
  L.push(" * what the Morning CIO's dry-powder tile reads.");
  L.push(" */");
  L.push(`export const BOOK_COMMITMENTS: Commitment[] = ${j(book.commitments)};`);
  L.push("");
  L.push("// Private-markets HOLDINGS are carried as ordinary positions with assetClass");
  L.push("// \"AIF\" — see BOOK_SUMMARY.privateValue. These fund/startup collections stay");
  L.push("// empty because no statement in this drop reports a fund-of-funds structure with");
  L.push("// its own TVPI and DPI; a later drop that does needs no change to the contract.");
  L.push("export const BOOK_PE_FUNDS: FundInvestment[] = [];");
  L.push("export const BOOK_PREIPO_FUNDS: FundInvestment[] = [];");
  L.push("export const BOOK_UNLISTED_COMPANIES: FundInvestment[] = [];");
  L.push("export const BOOK_DEBT_FUNDS: FundInvestment[] = [];");
  L.push("export const BOOK_CLOSED_FUNDS: FundInvestment[] = [];");
  L.push("export const BOOK_STARTUPS: StartupInvestment[] = [];");
  L.push("");
  return L.join("\n");
}

function report(book) {
  const L = [];
  L.push("# Book report");
  L.push("");
  L.push("What `npm run build-book` put in `src/data/glowData.ts`, and what it could not.");
  L.push("Generated — **do not edit by hand**.");
  L.push("");
  L.push("## Totals");
  L.push("");
  L.push("| | |");
  L.push("| --- | ---: |");
  L.push(`| Consolidated market value | ${book.summary.totalValue.toLocaleString("en-IN")} |`);
  L.push(`| Positions | ${book.summary.positionsCount} |`);
  L.push(`| Accounts | ${book.accounts.length} |`);
  L.push(`| Owners | ${book.owners.length} |`);
  L.push(`| Newest as-of | ${book.summary.asOf} |`);
  L.push("");
  L.push("## Per account");
  L.push("");
  L.push("| Account | Provider | Owner | Strategy | As of | Positions | Market value |");
  L.push("| --- | --- | --- | --- | --- | ---: | ---: |");
  for (const a of book.accounts) {
    const ps = book.positions.filter((p) => p.accountId === a.accountId);
    const mv = sum(ps.map((p) => (isNum(p.marketValue) ? p.marketValue : 0)));
    L.push(`| ${a.accountNo} | ${a.provider} | ${a.owner ?? "—"} | ${a.strategy ?? "—"} | ${a.asOf ?? "—"} | ${ps.length} | ${r2(mv).toLocaleString("en-IN")} |`);
  }
  L.push("");
  if (book.reviewSuperseded.length) {
    L.push("## Private market — from the family's consolidated review");
    L.push("");
    L.push("Stage 10dh: the review (MOPWM, 30 Jun 2026) is the source for private-market holdings. These statement rows are replaced, each by the review line named:");
    L.push("");
    L.push("| Account | Statement row | Kind | Units | Review line |");
    L.push("| --- | --- | --- | ---: | --- |");
    for (const s of book.reviewSuperseded) L.push(`| ${s.accountId} | ${s.security ?? s.securityKey} | ${s.kind} | ${s.quantity ?? "—"} | ${s.reviewLine} |`);
    L.push("");
    const fresher = book.positions.filter((p) => p.review && /A statement says otherwise/.test(p.reviewNote));
    L.push(`Where a statement disagrees, the review is followed and the statement named (${fresher.length} rows):`);
    L.push("");
    for (const p of fresher) L.push(`- ${p.accountId} · ${p.security}: ${p.reviewNote.split("A statement says otherwise: ")[1]}`);
    L.push("");
    L.push(`Written off on the review, a measured ₹0 in no total: ${book.reviewWrittenOff.map((w) => w.security).join(", ")}.`);
    L.push("");
    const fh = new Map();
    for (const f of book.reviewFlows) {
      const k = `${f.accountId} · ${f.security}`;
      const c = fh.get(k) ?? { purchase: 0, sale: 0, income: 0 };
      c[f.kind] += 1;
      fh.set(k, c);
    }
    L.push(`The review's dated rows behind the holdings it values (${book.reviewFlows.length} rows, \`BOOK_REVIEW_FLOWS\`) — what each fund's return is struck on:`);
    L.push("");
    L.push("| Holding | Purchases | Sales | Income rows |");
    L.push("| --- | ---: | ---: | ---: |");
    for (const [k, c] of fh) L.push(`| ${k} | ${c.purchase} | ${c.sale} | ${c.income} |`);
    L.push("");
  }
  L.push("## Per owner");
  L.push("");
  L.push("| Owner | Accounts | Positions | Market value |");
  L.push("| --- | ---: | ---: | ---: |");
  for (const o of book.owners) {
    const accs = book.accounts.filter((a) => a.ownerId === o.ownerId);
    const ps = book.positions.filter((p) => accs.some((a) => a.accountId === p.accountId));
    L.push(`| ${o.displayName} | ${accs.length} | ${ps.length} | ${r2(sum(ps.map((p) => (isNum(p.marketValue) ? p.marketValue : 0)))).toLocaleString("en-IN")} |`);
  }
  L.push("");
  L.push("## Holdings the family confirmed as separate investments");
  L.push("");
  L.push("Two accounts' statements carry the same figures for these, which is how a holding reported");
  L.push("twice looks. The family has said each is a separate investment, so every figure counts both.");
  L.push("`SEPARATE_INVESTMENTS` in `shared/separateInvestments.mjs` holds the decision.");
  L.push("");
  L.push("| Holding | Account | Owner | Units | Market value | Confirmed |");
  L.push("| --- | --- | --- | ---: | ---: | --- |");
  for (const d of book.separateInvestments ?? []) {
    for (const r of d.rows) {
      if (!r.positions.length) {
        L.push(`| \`${d.securityKey}\` | ${r.provider} ${r.accountNo} | ${r.owner ?? "—"} | — | — (no such holding in the book) | ${d.confirmed} |`);
        continue;
      }
      for (const p of r.positions) {
        L.push(`| ${p.security} | ${r.provider} ${r.accountNo} | ${r.owner ?? "—"} | ${isNum(p.quantity) ? p.quantity.toLocaleString("en-IN") : "—"} | ${isNum(p.marketValue) ? r2(p.marketValue).toLocaleString("en-IN") : "—"} | ${d.confirmed} |`);
      }
    }
  }
  L.push("");
  L.push("## Read, and deliberately NOT in the book");
  L.push("");
  if (!book.excludedAccounts?.length) {
    L.push("_None — every account this pipeline could read belongs to a canonical owner._");
  } else {
    /**
     * THE INTRO SAYS ONLY WHAT IS TRUE OF EVERY ROW, and the rest is said per
     * kind. It read "they belong to somebody else" and "each one becomes part of
     * the book with a single entry in `shared/owners.mjs`" — both true of a
     * folio held by another taxpayer and both FALSE of the family's own savings
     * account, which is in this table for what it IS rather than for whose it
     * is. A sentence that is false of half the rows it covers is the caption
     * failure this book keeps paying for, arriving in a report.
     */
    const kindsOf = (k) => book.excludedAccounts.filter((a) => (a.kind ?? "other-holder") === k);
    const others = [...kindsOf("other-holder"), ...kindsOf("unresolved-holder")];
    const ownBank = kindsOf("own-bank-account");
    L.push("These statements were read COMPLETELY, and that is a different thing from a");
    L.push("document the pipeline could not open — the coverage table in");
    L.push("`docs/EXTRACTION-REPORT.md` has those. Each is absent from every total above for");
    L.push("the reason its own row states.");
    if (others.length) {
      const one = others.length === 1;
      L.push("");
      L.push(`**${others.length} of them ${one ? "belongs" : "belong"} to somebody else** — another taxpayer's folio, or an`);
      L.push("account no statement in the drop resolves to a canonical owner. Each becomes part");
      L.push("of the book with a single entry in `shared/owners.mjs`, if the family says it");
      L.push("should be.");
    }
    if (ownBank.length) {
      const one = ownBank.length === 1;
      L.push("");
      L.push(`**${ownBank.length} of them ${one ? "is the family's OWN bank account" : "are the family's OWN bank accounts"}**, `
        + `excluded for what ${one ? "it is" : "they are"}`);
      L.push(`rather than for whose ${one ? "it is" : "they are"}: a savings account holds no investment, so it has no`);
      L.push(`market value to sum, and no owner entry would ever bring one in. Whether ${one ? "its" : "their"}`);
      L.push(`${one ? "closing balance" : "closing balances"} should count as Cash is the family's decision and is open — see`);
      L.push("the bank-account section below, which carries the four figures each statement");
      L.push("prints.");
    }
    L.push("");
    L.push("| Account | Provider | Holder | Value on its own statement | Why it is out |");
    L.push("| --- | --- | --- | ---: | --- |");
    for (const a of book.excludedAccounts) {
      L.push(`| ${a.accountNo ?? "—"} | ${a.provider} | ${a.owner ?? "—"} | ${isNum(a.value) ? r2(a.value).toLocaleString("en-IN") : "—"} | ${a.reason.replace(/\s+/g, " ")}${a.valueWhy ? ` No value is stated: ${a.valueWhy}.` : ""} |`);
    }
    const known = book.excludedAccounts.filter((a) => isNum(a.value));
    if (known.length) {
      L.push("");
      L.push(`Together they carry **${r2(sum(known.map((a) => a.value))).toLocaleString("en-IN")}** across `
        + `${known.length} account(s). That figure is stated so nobody has to wonder whether `
        + "the money was missed or excluded.");
    }
    const unstated = book.excludedAccounts.filter((a) => !isNum(a.value));
    if (unstated.length) {
      L.push("");
      L.push(`${unstated.length} more account(s) state no value on their own statement, and are named in the table with why.`);
    }
  }
  L.push("");
  /**
   * THE FAMILY'S OWN BANK ACCOUNTS — READ IN FULL, AND IN NO TOTAL ABOVE.
   *
   * It is its own section rather than a column of the table above it, because
   * that table's value column is headed "Value on its own statement" and is
   * SUMMED into one figure: a market value. A bank balance is not one, and
   * adding it there would print a total that does not tie to its own columns.
   *
   * It carries the four figures each statement prints and NOT ONE NARRATION.
   * A row's description names whoever was paid, and this file is read by
   * anybody who opens the repository.
   */
  L.push("## The family's own bank accounts");
  L.push("");
  if (!book.bankAccounts?.length) {
    L.push("_None — no savings-account statement is in this drop._");
  } else {
    /**
     * "READ COMPLETELY" IS TRUE OF A STATEMENT THAT PUBLISHED A TAPE, AND THE
     * BRANCH AT THE FOOT OF THIS SECTION REPORTS ONES THAT DID NOT.
     *
     * Asserted of every row at once, it sat four paragraphs above its own
     * counterexample: a statement the tie-out refused was PARSED completely and
     * published nothing, which is a different claim. So the lead sentence is
     * about the TOTALS — true of every row here, whatever the gate said — and
     * what was published is counted rather than claimed.
     */
    const published = book.bankAccounts.filter((b) => b.rows > 0);
    const refused = book.bankAccounts.filter((b) => b.rows === 0);
    const n = book.bankAccounts.length;
    L.push(`**${n} statement(s)${refused.length ? `, ${published.length} of which published a tape` : ""}** — `
      + "and not one rupee of any of them is in a total above: not in the consolidated value, not in");
    L.push("Cash, and not as capital. This book's Cash is the cash sleeve a manager or a");
    L.push("depository reports INSIDE an investment account; a household account is a different");
    L.push("kind of money, and summing one into Cash would move every allocation weight and every");
    L.push("return denominator on a decision nobody has made. **Whether these balances should be");
    L.push("counted is the family's to answer**, and this section is here so the figures are");
    L.push("stated rather than silently dropped.");
    L.push("");
    /**
     * AND THE CHECKS ARE NAMED PER ACCOUNT, NOT LISTED IN PROSE.
     *
     * This read "the running balance, both printed totals, the Dr/Cr counts and
     * the closing balance all reconcile" — four of which an ICICI statement
     * structurally cannot strike, because it prints no debit total, no credit
     * total and no Dr/Cr count. A sentence claiming a reconciliation the
     * document could not supply a figure for is the same failure as a caption
     * that does not describe its own figure, and this file's own Stage 10dj
     * record already says the two banks differ. So the claim is now what the
     * gate actually guarantees — every check the statement ANSWERS — and the
     * `Checks` column and the list under the table carry the rest, read off
     * each document's own `checks` rather than written here.
     */
    L.push("Every figure below is one the statement PRINTS, and a tape is published only where");
    L.push("**every check the statement itself supplies a figure for reconciles to the paisa**.");
    L.push("Which checks those are is the statement's own doing, so they are counted per account");
    L.push("below: a bank that prints no debit total, no credit total and no Dr/Cr count supplies");
    L.push("four fewer, and a check with no printed figure behind it is NOT APPLICABLE and never a");
    L.push("pass. A statement that fails a check it CAN strike publishes no rows at all and says");
    L.push("which. Where a bank prints no opening balance the cell says so — the figure the reader");
    L.push("chained from is in that document's own `summary` sheet, labelled as derived from the");
    L.push("first row.");
    L.push("");
    L.push("| Account | Bank | Holder | Period | Opening | Debits | Credits | Closing | Rows | Checks |");
    L.push("| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
    /**
     * TWO DECIMALS, ALWAYS, which the rest of this report does not do — and the
     * paragraph above is why: it says every figure here is one the statement
     * PRINTS, and `toLocaleString` drops a trailing zero, so a closing balance
     * the bank prints as 85,500.50 rendered 85,500.5 and an opening of
     * 1,00,000.00 rendered 1,00,000. A portfolio market value elsewhere in this
     * file is a derived figure to the rupee and loses nothing that way; a bank
     * balance is quoted to the paisa, and the tie-out that published it is
     * struck on the paisa, so the paise belong on screen.
     *
     * Found by RENDERING this section against a synthetic statement: the
     * committed archive carries none, so the branch had never run. One
     * formatter for the table and the total under it, rather than one each.
     */
    const money = (v) => (isNum(v)
      ? r2(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—");
    for (const b of book.bankAccounts) {
      const period = b.periodFrom && b.periodTo ? `${b.periodFrom} → ${b.periodTo}` : (b.periodTo ?? b.periodFrom ?? "—");
      const opening = isNum(b.openingBalance) ? money(b.openingBalance) : "not printed";
      const rows = b.rows === 0 ? "none published" : b.rows.toLocaleString("en-IN");
      /**
       * A FAILURE LEADS THE CELL, because it is the one thing in it a reader
       * acts on.
       *
       * This read `${passed} tied${n/a}` whatever the gate said, so a refused
       * statement's cell printed "8 tied, 1 n/a" beside a Rows cell reading
       * "none published" — a cell silent about the only reason the row exists,
       * inviting the reader to wonder why nothing was published when every
       * check tied. The counts are the same; what changed is that the failures
       * are named at all, and first.
       */
      const nApp = (b.checks?.notApplicable ?? []).length;
      const nBad = (b.checks?.failed ?? []).length;
      const checks = b.checks
        ? [nBad ? `**${nBad} FAILED**` : null, `${(b.checks.passed ?? []).length} tied`, nApp ? `${nApp} n/a` : null]
          .filter(Boolean).join(", ")
        : "—";
      L.push(`| ${b.accountNo ?? "—"} | ${b.provider} | ${b.owner ?? "—"} | ${period} | ${opening} | `
        + `${money(b.debits)} | ${money(b.credits)} | ${money(b.closingBalance)} | ${rows} | ${checks} |`);
    }
    /**
     * ONE BALANCE PER ACCOUNT, THE LATEST RECONCILED — and where a NEWER issue
     * was refused, that is not the newest and the sentence must not say it is.
     *
     * `bankAccounts` is one entry per DOCUMENT, because each statement has its
     * own period and its own tie-out, and that is what the table should show.
     * Summing its closing column adds the SAME account's money once per
     * statement: a quarterly set for one HDFC account reads as three accounts
     * holding three times the balance, and the sentence under it said "across 3
     * account(s)" about one.
     *
     * THE NEWEST ISSUE IS CHOSEN OVER EVERY ISSUE, AND ONLY THEN IS ITS BALANCE
     * TAKEN. Choosing over `published` alone drops a newer REFUSED issue before
     * the comparison, so an account with a published Q2 and a refused Q3 had its
     * Q2 closing described as "the newest" while the table two lines above showed
     * the later refused one. What is published is the latest RECONCILED balance;
     * whatever moved in the refused period is not in it, and that gap is NAMED
     * rather than left to be found by reading the table — the figure is in no
     * total on this site, so the gap is the only thing a reader could act on.
     *
     * AND THE COUNT IS NOT A PER-ACCOUNT CLAIM. `each taken from the newest of
     * its N statement(s)` read N off the whole published set, so two accounts
     * holding two statements and one read "each … of its 3" — a count neither
     * has, in a sentence whose "its" asserts it of both.
     */
    const issuesByAccount = new Map();
    for (const b of book.bankAccounts) {
      const key = `${b.provider}|${b.accountNo ?? "—"}`;
      if (!issuesByAccount.has(key)) issuesByAccount.set(key, []);
      issuesByAccount.get(key).push(b);
    }
    const held = [];
    const behind = [];
    const unreconciled = [];
    for (const issues of issuesByAccount.values()) {
      const byNewest = [...issues]
        .sort((a, b) => String(b.periodTo ?? "").localeCompare(String(a.periodTo ?? "")));
      const at = byNewest.find((b) => b.rows > 0 && isNum(b.closingBalance));
      if (!at) { unreconciled.push(byNewest[0]); continue; }
      held.push({ ...at, issues: issues.length });
      const newest = byNewest[0];
      if (newest !== at && String(newest.periodTo ?? "") > String(at.periodTo ?? "")) {
        behind.push({ at, refused: newest });
      }
    }
    if (held.length) {
      const issues = sum(held.map((b) => b.issues));
      L.push("");
      L.push(`Their latest reconciled closing balances come to **${money(sum(held.map((b) => b.closingBalance)))}** `
        + `across ${held.length} account(s)`
        + (issues > held.length ? ` — one balance each, from the ${issues} statement(s) those accounts sent` : "")
        + ", and that figure is in nothing above.");
      if (behind.length) {
        L.push("");
        L.push("**And for some of them it is not the newest.** Each of these accounts sent a LATER");
        L.push("statement whose tie-out failed, so the balance above is the last one this book can");
        L.push("witness and whatever moved after it is not in it:");
        L.push("");
        for (const x of behind) {
          L.push(`- **${x.at.provider} ${x.at.accountNo ?? "—"}** — reconciled to ${x.at.periodTo ?? "—"}; `
            + `its ${x.refused.periodTo ?? "—"} statement was refused.`);
        }
      }
      if (unreconciled.length) {
        /**
         * AND THE BOLD IS CLOSED, which the first draft of this line did not
         * do — found by RENDERING it, like every other defect in this section.
         * An unterminated `**` leaves every paragraph after it bold in any
         * reader, so the one claim a reader must not miss would have taken the
         * not-applicable list and the refusals with it.
         */
        const one = unreconciled.length === 1;
        L.push("");
        L.push(`**${unreconciled.length} further account${one ? "" : "s"} in the table above `
          + `contribute${one ? "s" : ""} no balance at all.** Every statement ${one ? "it" : "they"} sent`);
        L.push(`was refused: ${unreconciled.map((b) => `${b.provider} ${b.accountNo ?? "—"}`).join(", ")}.`);
      }
    }
    /**
     * WHAT THE STATEMENT ITSELF COULD NOT SUPPLY, per account, in the reader's
     * own wording. The counterpart to the `Checks` column: a reader who sees
     * "5 tied, 4 n/a" has to be able to find out which four.
     */
    const skipped = book.bankAccounts.filter((b) => (b.checks?.notApplicable ?? []).length);
    if (skipped.length) {
      L.push("");
      L.push("**What the statements themselves could not supply.** Each of these is a check with no");
      L.push("printed figure behind it, so it is NOT APPLICABLE rather than a pass:");
      L.push("");
      for (const b of skipped) {
        L.push(`- **${b.provider} ${b.accountNo ?? "—"}** (${b.periodTo ?? "—"}): `
          + b.checks.notApplicable.join("; "));
      }
    }
    /**
     * AND THE CHECK THAT FAILED IS NAMED HERE, not pointed at.
     *
     * This said each one "names the check that failed in
     * `docs/EXTRACTION-REPORT.md`" — true, and the figure is in hand: the
     * reader returns `checks.failed` on the refusal path as well as the
     * published one, for exactly this. A pointer to another document is the
     * weaker answer when the sentence could carry the reason itself, and it is
     * the same shape as the not-applicable list directly above.
     */
    if (refused.length) {
      L.push("");
      L.push(`**${refused.length} statement(s) published no rows.** The tie-out did not reconcile, so the`);
      L.push("reader published nothing rather than a partial tape, which would read as a complete one:");
      L.push("");
      for (const b of refused) {
        const why = (b.checks?.failed ?? []).join("; ") || "the reason is in `docs/EXTRACTION-REPORT.md`";
        L.push(`- **${b.provider} ${b.accountNo ?? "—"}** (${b.periodTo ?? "—"}): ${why}`);
      }
    }
  }
  L.push("");
  L.push("## Ring-fenced: the promoter holding, on its own page");
  L.push("");
  if (!book.polycab?.length) {
    L.push("_None._");
  } else {
    L.push("Carried in the archive and OUT of every total above — the consolidated market");
    L.push("value, the listed/private split, and every allocation, sector, entity and holdings");
    L.push("table. This is the family's PROMOTER stock: the statement says the account holds");
    L.push("it, so it is not dropped, but it dwarfs the managed book and the family's own");
    L.push("consolidated review does not carry it, so the family asked for it on the Polycab");
    L.push("page alone. `BOOK_POLYCAB` is its only reader; remove its key from");
    L.push("`RINGFENCED_SECURITY_KEYS` in build-book.mjs to fold it back into the book.");
    L.push("");
    L.push("| Security | Holder | Account | As of | Shares | Market value |");
    L.push("| --- | --- | --- | --- | ---: | ---: |");
    for (const p of book.polycab) {
      const a = book.accounts.find((x) => x.accountId === p.accountId);
      L.push(`| ${p.security} | ${a?.owner ?? "—"} | ${a?.provider ?? "—"} ${a?.accountNo ?? ""} | ${a?.asOf ?? "—"} | `
        + `${isNum(p.quantity) ? p.quantity.toLocaleString("en-IN") : "—"} | ${isNum(p.marketValue) ? r2(p.marketValue).toLocaleString("en-IN") : "—"} |`);
    }
    const pv = sum(book.polycab.map((p) => (isNum(p.marketValue) ? p.marketValue : 0)));
    L.push("");
    L.push(`Together **${r2(pv).toLocaleString("en-IN")}**, excluded from the `
      + `${r2(book.summary.totalValue).toLocaleString("en-IN")} consolidated market value above.`);
  }
  // WHAT THE FAMILY THEMSELVES DID, AND WHAT IT COVERS. Stated as a count
  // rather than asserted in prose, so it cannot go stale the way the
  // navHistory note did for four deliveries.
  L.push("");
  L.push("## The family's own dated investments");
  L.push("");
  const cin = book.capitalMoves.filter((m) => m.direction === "in");
  const cout = book.capitalMoves.filter((m) => m.direction === "out");
  const cinTot = sum(cin.map((m) => m.amount ?? 0));
  const coutTot = sum(cout.map((m) => m.amount ?? 0));
  const cAccts = new Set(book.capitalMoves.map((m) => m.accountId));
  L.push(`**${book.capitalFromInception.length}** of those account(s) start every class's record at nil — a printed `
    + `running unit balance that starts from zero on the class's first allotment, or a first allotment on the day `
    + `the class's own series name says it was issued — which proves their record reaches inception: `
    + `${book.capitalFromInception.join(", ") || "none"}.`);
  L.push("");
  L.push(`**${cin.length}** dated contribution(s) totalling **${r2(cinTot).toLocaleString("en-IN")}** and `
    + `**${cout.length}** withdrawal(s) totalling **${r2(coutTot).toLocaleString("en-IN")}**, across `
    + `**${cAccts.size} of ${book.accounts.length}** account(s).`);
  L.push("");
  L.push("These are movements the STATEMENTS type as a contribution or a withdrawal — what the family "
    + "put in and took out — and not the trades their managers made inside a mandate. The other "
    + `${book.accounts.length - cAccts.size} account(s) publish no dated capital record at all: their `
    + "subscription happened, and no statement in this drop says when.");
  L.push("");
  const trs = Object.values(book.positionTranches);
  const multi = trs.filter((t) => t.moves.length > 1);
  L.push(`A per-contribution breakdown is published for **${trs.length}** position(s), of which `
    + `**${multi.length}** were bought over more than one date. That needs UNITS allotted per `
    + "contribution, and the allotted units accounting for every unit held — without both, a tranche's "
    + "value today cannot be struck, and a return on part of a position would read as a return on all of it.");
  if (trs.length) {
    L.push("");
    L.push("| Position | Account | Contributions | Units | Invested |");
    L.push("| --- | --- | ---: | ---: | ---: |");
    for (const t of trs) {
      const p = book.positions.find((x) => x.accountId === t.accountId && x.securityKey === t.securityKey);
      const inv = sum(t.moves.map((m) => m.invested ?? 0));
      L.push(`| ${p?.security ?? t.securityKey} | ${t.accountId} | ${t.moves.length} | `
        + `${t.units.toLocaleString("en-IN")} | ${r2(inv).toLocaleString("en-IN")} |`);
    }
  }
  L.push("");
  L.push("## Sector allocation");
  L.push("");
  const bySector = new Map();
  for (const p of book.positions) {
    const mv = isNum(p.marketValue) ? p.marketValue : 0;
    bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + mv);
  }
  L.push("| Sector | Market value | Share |");
  L.push("| --- | ---: | ---: |");
  for (const [s, mv] of [...bySector.entries()].sort((a, b) => b[1] - a[1])) {
    L.push(`| ${s} | ${r2(mv).toLocaleString("en-IN")} | ${(mv / book.summary.totalValue * 100).toFixed(2)}% |`);
  }
  L.push("");
  L.push("## Unclassified sectors");
  L.push("");
  if (!book.unclassified.length) L.push("_None — every provider sector mapped to a GICS sector._");
  else {
    L.push("Add these to `shared/sectors.mjs`. Until then they render as Unclassified —");
    L.push("never guessed into the nearest plausible bucket.");
    L.push("");
    for (const u of book.unclassified) L.push(`- **${u.providerSector}** — ${u.count} position(s)`);
  }
  L.push("");
  L.push("## What this corpus does not support");
  L.push("");
  for (const n of book.notes) L.push(`- ${n}`);
  L.push("");
  return L.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

const docs = loadArchive();
if (!docs.length) {
  console.error("No documents in the audit archive. Run `npm run extract` first.");
  process.exit(1);
}
const book = build(docs);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, emit(book));
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, report(book));

console.log(`Book: ${book.positions.length} position(s) across ${book.accounts.length} account(s), ${book.owners.length} owner(s).`);
console.log(`  consolidated market value ${book.summary.totalValue.toLocaleString("en-IN")} as of ${book.summary.asOf}`);
const withGains = book.capitalGains.filter((c) => c.realisedST !== null).length;
console.log(`  cash-flow series for ${Object.keys(book.accountCashFlows).length} account(s); realised gains for ${withGains} of ${book.capitalGains.length} account(s)`);
if (book.unclassified.length) {
  console.log(`  ${book.unclassified.length} UNCLASSIFIED sector(s): ${book.unclassified.map((u) => u.providerSector).join(", ")}`);
}
for (const n of book.notes) console.log(`  ! ${n}`);
console.log("  src/data/glowData.ts");
console.log("  docs/BOOK-REPORT.md");

/**
 * A DEPOSITORY ROW WHOSE FUND ALREADY REPORTS ITSELF IS NOT A SECOND HOLDING.
 *
 * The Motilal Oswal demat statements list every fund unit the family owns, and
 * for eight of them this book already carries the position from the fund's own
 * account statement — Buoyant, Sanshi, Carnelian's Amritkaal fund, Baring,
 * India SME, Motilal Oswal's Founders Fund, Transition Venture and 3P. Carried
 * from both sides the same money would be counted twice, and the depository's
 * side would be marked at the FACE VALUE it prints (100.000 on most of them)
 * rather than at a NAV.
 *
 * `AIF_UNITS` in the reader names which fund reports each ISIN. This is the
 * CHECK on that table rather than a use of it: the depository's unit count is
 * compared against the units the reporting account actually carries, and
 *
 *   - they agree  → the demat row is the same holding, and is dropped;
 *   - they differ → BOTH are kept and the difference is reported, because a
 *     depository holding more units than the fund reports is either a folio this
 *     drop is missing or a reclassification, and dropping it would hide whichever
 *     it is. That is exactly the 3P case: the fund's statement prints nil units
 *     on the one folio it covers while the depository holds 20.5 lakh.
 *
 * Anything not in the table is untouched. A silent drop is not available here.
 */
function dropDepositoryDuplicates(positions, accounts, notes) {
  const dematIds = new Set(accounts.filter((a) => DEPOSITORY_PROVIDERS.has(a.provider)).map((a) => a.accountId));
  if (!dematIds.size) return;
  const idsOf = (provider) =>
    new Set(accounts.filter((a) => a.provider === provider).map((a) => a.accountId));

  const drop = new Set();
  for (const p of positions) {
    if (!dematIds.has(p.accountId)) continue;
    const entry = p.isin ? AIF_UNITS[p.isin] : null;
    if (!entry?.reportedBy) continue;
    const ids = idsOf(entry.reportedBy);
    const theirs = positions.filter((q) => ids.has(q.accountId));
    /**
     * TO THE PRINTED PRECISION, NOT TO THE BIT. Buoyant's own statement prints
     * 3,416,657.417 units and the depository prints 3,416,657.416 — one unit in
     * the third decimal, which is the last place either of them prints. Matched
     * exactly, that row failed to dedupe and put ₹34.17 Cr of the same holding
     * into the book twice at face value. Both print three decimals, so the
     * tolerance is half of one.
     */
    const matched = theirs.find((q) => isNum(q.quantity) && isNum(p.quantity)
      && Math.abs(q.quantity - p.quantity) <= 0.0005 + Math.abs(p.quantity) * 1e-9);
    if (matched) { drop.add(p); continue; }
    notes.push(`the depository reports ${p.quantity} unit(s) of ${p.security} on ${p.accountId}, while `
      + `${entry.reportedBy} — which issues the statement for that fund — reports `
      + `${theirs.length ? theirs.map((q) => q.quantity).join(" / ") : "no matching position"}. `
      + "Both rows are kept and neither is deduped: the two do not describe the same units, so dropping "
      + "either would hide a folio this drop does not cover, or a reclassification the fund has not restated.");
  }

  const byFund = new Map();
  for (const p of drop) {
    const k = AIF_UNITS[p.isin].reportedBy;
    if (!byFund.has(k)) byFund.set(k, []);
    byFund.get(k).push(p);
  }
  for (const [fund, rows] of [...byFund].sort((a, b) => a[0].localeCompare(b[0]))) {
    /**
     * THE REASON HAS TO BE TRUE OF THE ROWS IT IS GIVEN FOR, AND THIS ONE NEVER
     * WAS — because until now the note had never been printed at all.
     *
     * It read that the depository "marks them at the face value it prints". That
     * is true of every CDSL row, and those rows never get here: a face-valued row
     * carries no market value, so the unvalued filter upstream removes it long
     * before this function runs on POSITIONS. So this loop was silent for as long
     * as it existed, and its stated reason went unchecked.
     *
     * The first rows it has ever actually dropped are the two Sanshi ones on the
     * NSDL statement, and the depository prints a real NAV for both (Rs 122.647
     * and Rs 151.966 at 31 March). Dropping them is still right — the fund's own
     * statement is the authority and is the more recent — but the reason given
     * had to stop being one that is false of them. A dead branch with a
     * confident explanation is how a future session "fixes" a rule that was
     * never broken.
     */
    notes.push(`${rows.length} depository row(s) for ${fund} are NOT carried: the unit count matches that `
      + "fund's own statement exactly, so they are the same holding seen from custody, and the fund is the "
      + "authority on what its own units are worth.");
  }
  for (let i = positions.length - 1; i >= 0; i--) if (drop.has(positions[i])) positions.splice(i, 1);
}
