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
import { sourceFor } from "./ingest/precedence.mjs";
import { AIF_UNITS, PROVIDER as CDSL_DEMAT_PROVIDER } from "./ingest/providers/motilalDemat.mjs";
import { reclassificationsFrom, carryLotsThroughSwitches, carryCostThroughSwitches, UNIT_TIE } from "./lib/classSwitch.mjs";
import { PROVIDER as NSDL_DEMAT_PROVIDER } from "./ingest/providers/nsdlDemat.mjs";

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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_DIR = process.env.GLOW_AUDIT_DIR ?? path.join(ROOT, "public", "audit");
const OUT = process.env.GLOW_BOOK_OUT ?? path.join(ROOT, "src", "data", "glowData.ts");
const REPORT = path.join(ROOT, "docs", "BOOK-REPORT.md");

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

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

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
 * WHAT THIS STILL CANNOT DO, stated rather than papered over: ten of the
 * seventeen covered accounts publish NO dated capital record, so a subscription
 * or redemption inside one of them would read as performance. Where such an
 * account holds a SINGLE security whose unit count is identical at every
 * snapshot, the statement itself rules that out and the account is marked
 * `units-unchanged`; where it does not, the account is `unreported` and is NAMED
 * on screen with its share of the covered value.
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
          dedupeGroup: h.dedupeGroup ?? dedupeByAcctSec.get(`${key}|${h.securityKey}`)?.dedupeGroup ?? null,
        })),
      });
    }

    if (snaps.length >= 2) snapshotsByAccount.set(accountId, { provider, accountNo: sample.accountNo, snaps });
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
      navHistory: [], accountNavHistory,
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

  // Rule 4 — the flow basis per account, measured rather than assumed.
  const flowBasis = {};
  for (const id of covered) {
    const flows = accountCashFlows[id] ?? [];
    // The opening-portfolio-value entry is a STAKE, not a movement: it is how
    // `accountCashFlows` states the window's starting position for the XIRR, and
    // netting it out of a NAV interval would remove the account's whole value.
    const movements = flows.filter((f) => !/^Opening portfolio value/i.test(f.description ?? ""));
    if (flows.length) { flowBasis[id] = { basis: "reported", movements: movements.length }; continue; }
    // No capital record. If the account holds ONE security and its unit count is
    // identical at every snapshot, no units were subscribed or redeemed and the
    // whole change is the fund's own mark — which the statement PROVES rather
    // than the pipeline assuming.
    const snaps = snapshotsByAccount.get(id).snaps;
    const oneRow = snaps.every((s) => s.rows.length === 1 && s.rows[0].quantity !== null);
    const sameQty = oneRow && snaps.every((s) => Math.abs(s.rows[0].quantity - snaps[0].rows[0].quantity) < 1e-6);
    flowBasis[id] = { basis: sameQty ? "units-unchanged" : "unreported", movements: 0 };
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
      // This account's mark MOVED in this interval — so its own flows since
      // that earlier snapshot are what this interval's change contains.
      if (was.date === snap.date) continue;
      const flows = (accountCashFlows[id] ?? []).filter((f) =>
        !/^Opening portfolio value/i.test(f.description ?? "") && f.date > was.date && f.date <= snap.date);
      // `CashFlow.amount` is NEGATIVE for capital in (see types.ts), so capital
      // in is the negated sum.
      flowIn += -sum(flows.map((f) => f.amount));
      if (flowBasis[id].basis === "unreported") flowUnknownValue += snap.marketValue;
    }

    const point = {
      period: d,
      date: d,
      nav: r2(nav),
      accountsOnDate: onDate,
      accountsCarried: present.length - onDate,
      /** Net external capital in since the previous point, on each account's own clock. */
      flowIn: prevDate ? r2(flowIn) : 0,
      /** Value restated in this interval by an account with no capital record. */
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
  const unreported = covered.filter((id) => flowBasis[id].basis === "unreported");
  if (unreported.length) {
    notes.push(`navHistory: ${unreported.length} covered account(s) publish no dated capital record and hold more than `
      + `one security, so a subscription or redemption inside them would read as performance: ${unreported.join(", ")}. `
      + "Named on screen with their share of the covered value.");
  }

  return {
    navHistory,
    accountNavHistory,
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
 * STRUCK PER CLASS AND REQUIRED OF EVERY ONE. A single class that begins
 * mid-stream would leave some purchase unrecorded, so every contribution row must
 * carry a security, units and a printed balance, and every class's first row must
 * start from zero within half the last printed decimal. Anything less is not
 * evidence and the account is not listed — the caller then falls back to the
 * other two tests, and failing those, withholds the return with the reason.
 */
function capitalRecordFromInception(cashFlows) {
  const rows = (cashFlows ?? []).filter((c) => c.date && CAPITAL_KINDS.has(c.kind));
  const ins = rows.filter((c) => c.kind === "contribution");
  if (!ins.length) return false;
  if (!ins.every((c) => c.securityKey && isNum(c.units) && isNum(c.balance))) return false;
  const first = new Map();
  for (const c of [...rows].filter((r) => r.securityKey && isNum(r.units) && isNum(r.balance)).sort((a, b) => a.date.localeCompare(b.date))) {
    if (!first.has(c.securityKey)) first.set(c.securityKey, c);
  }
  return [...first.values()].every((c) => c.kind === "contribution" && Math.abs(Math.abs(c.balance) - Math.abs(c.units)) <= UNIT_TIE);
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


/** Half of the last decimal a printed unit count carries — the tie a FIFO balance is held to. */
function printedUnitTie(q) {
  if (!isNum(q)) return UNIT_TIE;
  const s = String(q);
  const dp = s.includes(".") ? s.split(".")[1].length : 0;
  return Math.max(UNIT_TIE, 0.5 * 10 ** -dp);
}

/** The economic gain on one capital-gain lot: proceeds less what those units cost. */
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
function shareMovementsFrom(docs, positions, accounts, notes) {
  const out = {};
  const byAcctIsin = new Map();
  for (const p of positions) if (p.isin) byAcctIsin.set(`${p.accountId}|${p.isin}`, p.securityKey);
  const keysByIsin = new Map();
  const aifIsins = new Set();
  for (const p of positions) {
    if (!p.isin) continue;
    (keysByIsin.get(p.isin) ?? keysByIsin.set(p.isin, new Set()).get(p.isin)).add(p.securityKey);
    if (p.assetClass === "AIF") aifIsins.add(p.isin);
  }
  // THE REGISTRY DECIDES WHICH ACCOUNTS EXIST. Account 32387399's three
  // identifiers give three answers, so it is excluded with the reason and its
  // ₹8.23 Cr is in no total — and it issues a transaction statement like every
  // other demat, so a window keyed on its own accountId would walk that account
  // back into the book through a side door, attributed to a holder this book
  // has said it cannot establish.
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

  let blocks = 0, split = 0, joined = 0, unclassified = 0, offRegistry = 0, bridged = 0, ambiguous = 0, collided = 0, overwritten = 0, fundCopy = 0;
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
      if (key) joined += 1;
      else {
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
    notes.push(`share movements: ${blocks} holding-window(s) from the demat statements, ${split} of which walk their own printed opening balance to their own printed closing balance and carry an opening-to-closing split. ${joined} join a position this book carries; ${exited} close at nil, securities the account sold out of during the window; ${heldNoHoldings} close with units still held on an account that sent no holding statement, so the tape's closing balance is the only record of them; ${notCarried} sit on an account whose own holding statement is in the drop and are deliberately not carried as positions — a fund reporting its own units, or a row with no mark. ${unclassified} movement row(s) matched no known particular and are counted in the in/out totals by their own balance change.${offRegistry ? ` ${offRegistry} demat statement(s) were skipped entirely because their account is not in the registry — an account excluded by decision stays excluded here too.` : ""}`);
    // PRINTED EVEN AT ZERO: a join that only speaks when it fires is
    // indistinguishable, on a quiet drop, from one that was deleted.
    notes.push(`share movements: ${bridged} window(s) in an account that carries no position for the security are filed under the key the rest of the book carries for the same ISIN, so the company's page shows them (${bridged - bridgedHeld} close at nil; ${bridgedHeld} close with units still held on an account that sent no holding statement); ${ambiguous} ISIN(s) the book files under two keys keep the statement's own name rather than picking one; ${fundCopy} window(s) are the depository's copy of AIF units a fund's own statement reports and stay off the fund's page; ${collided} block(s) would have landed on a key their account already filed and keep their own name instead; ${overwritten} window(s) were overwritten by a second block under one key.`);
  }
  return out;
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
    out[k] = { accountId, securityKey, moves, units: Math.round(allotted * 1e3) / 1e3 };
  }
  return out;
}

// ── Build ────────────────────────────────────────────────────────────────────

function build(docs) {
  const notes = [];
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
  /** Positions whose lot register does not account for the units held — no split. */
  const splitUnreconciled = [];
  /** Positions whose statement cost FIFO over the fund's own unit record restates — named in the report. */
  const fifoRestated = [];
  /** The FIFO lots still held, per `${accountId}|${securityKey}` — the per-contribution breakdown's source. */
  const fifoLotsByPosition = new Map();
  /** FIFO's cost for a holding a class SWITCH alone moved — checked against the switch carry, never applied. */
  const fifoSwitchOnly = [];
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
      excludedAccounts.push({ accountId, provider, accountNo, owner: group.map((d) => d.owner).find(Boolean) ?? null, value, reason: excluded });
      notes.push(`account ${accountNo} (${provider}) is NOT in the book: ${excluded}`
        + (value !== null ? ` Value on its own statement: ${value.toLocaleString("en-IN")}.` : ""));
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
    const realisedByKey = new Map();
    let lotsAfterSnapshot = 0;
    let lotsUnreadable = 0;
    const hasCgStatement = dated.capitalGains.length > 0;
    for (const l of dated.capitalGains) {
      if (!l.securityKey) continue;
      if (asOf && l.saleDate && l.saleDate > asOf) {
        lotsAfterSnapshot += 1;
        const e = realisedByKey.get(l.securityKey) ?? { gain: 0, cost: 0, lots: 0, after: 0 };
        e.after += 1;
        realisedByKey.set(l.securityKey, e);
        continue;
      }
      const g = lotGain(l);
      if (!g) { lotsUnreadable += 1; continue; }
      const e = realisedByKey.get(l.securityKey) ?? { gain: 0, cost: 0, lots: 0, after: 0 };
      e.gain += g.gain;
      e.cost += g.cost;
      e.lots += 1;
      realisedByKey.set(l.securityKey, e);
    }
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
    if (unvalued.length && unvalued.length === allHoldings.length) {
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
          + `${isNum(h.faceValue) ? `, recorded at a face value of ${h.faceValue}` : ", no price published"})`).join("; ")}. `
        + "A depository records the value a security was allotted at where it holds no price for it, and that is "
        + "not a mark: carried, it would state a valuation nobody struck. The remaining "
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
        realizedPnL = rz?.lots ? r2(rz.gain) : 0;
        costOfUnitsSold = rz?.lots ? r2(rz.cost) : 0;
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
        costBasis,
        /**
         * "opening-position" where the cost came from the broker's ledger, not
         * this statement; "carried-through-switch" where a fund's class switch
         * restated it and `carryCostThroughSwitches` carried the family's own
         * cost through — set there, after the tranches, never here; "fifo"
         * where units LEFT the holding and its cost is that of the units still
         * held after the fund's own unit record was matched first-in, first-out.
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
      bridges.push({
        reportType: d.reportType,
        source: d.docKey,
        periodFrom: f.periodFrom,
        periodTo: f.periodTo,
        basis: f.periodFrom === inception ? "since-inception" : "financial-year-to-date",
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
      });
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
        acct.noPositionsReason = facePriced.length === unvaluedHere.length && unvaluedHere.length
          ? `this custody account values nothing: its statement of ${holdingsDoc.asOf} carries ${unvaluedHere.length} holding(s) whose only price is the FACE VALUE the security was allotted at, which is not a mark anybody struck. The units are in the archive; multiplying by a face value would put a valuation nobody made into the book`
          : unvaluedHere.length
          ? `this fund publishes no NAV: its statement of ${holdingsDoc.asOf} carries ${unvaluedHere.length} holding(s) with units and the capital drawn against a commitment, and no valuation. The units and the cost are in the archive; there is nothing to mark them at, and the contributions are what was paid rather than what the stake is worth`
          : holdingsDoc
          ? `every holding on this account's ${holdingsDoc.reportType} statement of ${holdingsDoc.asOf} has been redeemed — the balance is nil, and that is a measurement`
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
          : allIssues.some((d) => /transaction/i.test(d.reportType ?? ""))
          ? `no HOLDING statement for this account is in the drop — only its ${[...new Set(allIssues.map((d) => d.reportType))].sort().join(", ")} statement(s). The tape's closing balances are in the archive as quantities at ${allIssues.map((d) => d.asOf).filter(Boolean).sort().pop() ?? "its own date"} and carry no rate, so nothing here can be valued. What would fill it is that account's own holding statement from its custodian`
          : `no statement for this account carries a valuation; its documents report income and distributions only. Where these units are marked, another account holds them.`;
        /**
         * AND SAID IN A FIELD, NOT ONLY IN THAT SENTENCE. The dashboard values a
         * cash-equivalent fund on such an account from the depository's own
         * closing balance and AMFI's published NAV, and it must find those
         * accounts structurally — a rule that matched the prose above would stop
         * matching the first time somebody reworded it. It is set on exactly the
         * case the sentence describes: no holding statement in the drop, and a
         * transaction statement that is.
         */
        if (!holdingsDoc && allIssues.some((d) => /transaction/i.test(d.reportType ?? ""))) acct.transactionsOnly = true;
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
    capitalMoves.push(...capitalMovesFrom(dated.cashFlows, accountId, notes, `account ${accountNo}`));
    if (capitalRecordFromInception(dated.cashFlows)) capitalFromInception.add(accountId);
    reclassifications.push(...reclassificationsFrom(dated.cashFlows, accountId, notes, `account ${accountNo}`));

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
          from: b.periodFrom, to: b.periodTo, source: b.source,
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
    const flows = [];
    if (src) {
      for (const c of src.cashFlows ?? []) {
        if (!c.date) continue;
        const move = c.kind === "capital-register" ? c.amount : c.depositWithdrawal;
        if (!isNum(move) || move === 0) continue;
        flows.push({ date: c.date, amount: r2(-move), description: c.description });
      }
    }

    // The window's OPENING portfolio value is itself a flow for this purpose:
    // capital already at work on day one. Without it a return over the window is
    // computed against the few thousand rupees of TDS that moved during it, and
    // comes out absurd. The closing value is appended by the app at compute time.
    const perf = group.find((d) => d.reportType === "performance-summary" && isNum(d.flows?.openingCorpus));
    if (perf && flows.length) {
      flows.push({
        date: perf.flows.periodFrom ?? src?.periodFrom ?? asOf,
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

      // Cross-check against the provider's own statement of the same figure.
      const net = r2(sum(flows
        .filter((f) => !/^opening portfolio value/i.test(f.description))
        .map((f) => -f.amount)));
      const stated = group.find((d) => isNum(d.flows?.netCapitalInOut)
        && d.flows.periodFrom === src?.periodFrom && d.flows.periodTo === src?.periodTo);
      if (stated && Math.abs(net - stated.flows.netCapitalInOut) > 1) {
        notes.push(`account ${accountNo}: cash flows sum to ${net} but the performance `
          + `summary states Net Capital In/Out of ${stated.flows.netCapitalInOut} over the same window`);
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

  accounts.sort((a, b) => a.accountId.localeCompare(b.accountId));
  capitalGains.sort((a, b) => a.accountId.localeCompare(b.accountId));

  const owners = OWNERS
    .filter((o) => accounts.some((a) => a.ownerId === o.ownerId))
    .map((o) => ({ ownerId: o.ownerId, displayName: o.displayName }));

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
  const { navHistory, accountNavHistory, coverage: navCoverage, snapshotsByAccount } = navHistoryFrom(
    byAccount, new Set(accounts.map((a) => a.accountId)), dedupeByAcctSec, accountCashFlows, positions, notes,
  );
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
  const shareMovements = shareMovementsFrom(docs, [...positions, ...polycab], accounts, notes);

  return {
    accounts, positions, polycab, owners, capitalGains, accountCashFlows, entityCashFlows,
    capitalMoves, positionTranches, shareMovements,
    capitalFromInception: [...capitalFromInception].sort(),
    navHistory, accountNavHistory, navCoverage, attribution,
    excludedAccounts,
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
  L.push("  RealisedByClass, ShareMovement, StartupInvestment,");
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
  L.push(" * is the value restated in that interval by an account publishing NO capital");
  L.push(" * record — the part of the move that cannot be proved to be performance.");
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
  L.push(" * `flowBasis` per covered account: `reported` (a dated capital record exists),");
  L.push(" * `units-unchanged` (one security, identical unit count at every snapshot, so");
  L.push(" * the statement itself rules out a subscription or redemption), or");
  L.push(" * `unreported` (neither — a capital movement there would read as performance).");
  L.push(" */");
  L.push(`export const BOOK_NAV_COVERAGE: NavCoverage = ${j(book.navCoverage)};`);
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
  L.push("## Read, and deliberately NOT in the book");
  L.push("");
  if (!book.excludedAccounts?.length) {
    L.push("_None — every account this pipeline could read belongs to a canonical owner._");
  } else {
    L.push("These statements were read COMPLETELY. They are absent from every total above");
    L.push("because they belong to somebody else, and that is a different thing from a");
    L.push("document the pipeline could not open — the coverage table in");
    L.push("`docs/EXTRACTION-REPORT.md` has those. Each one becomes part of the book with a");
    L.push("single entry in `shared/owners.mjs`, if the family says it should be.");
    L.push("");
    L.push("| Account | Provider | Holder | Value on its own statement | Why it is out |");
    L.push("| --- | --- | --- | ---: | --- |");
    for (const a of book.excludedAccounts) {
      L.push(`| ${a.accountNo ?? "—"} | ${a.provider} | ${a.owner ?? "—"} | ${isNum(a.value) ? r2(a.value).toLocaleString("en-IN") : "—"} | ${a.reason.replace(/\s+/g, " ")} |`);
    }
    const known = book.excludedAccounts.filter((a) => isNum(a.value));
    if (known.length) {
      L.push("");
      L.push(`Together they carry **${r2(sum(known.map((a) => a.value))).toLocaleString("en-IN")}** across `
        + `${known.length} account(s). That figure is stated so nobody has to wonder whether `
        + "the money was missed or excluded.");
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
  L.push(`**${book.capitalFromInception.length}** of those account(s) print a running unit balance that starts `
    + `from zero on every class's first allotment, which proves their record reaches inception: `
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
