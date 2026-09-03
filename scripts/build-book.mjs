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
import { sourceFor } from "./ingest/precedence.mjs";
import { AIF_UNITS, PROVIDER as CDSL_DEMAT_PROVIDER } from "./ingest/providers/motilalDemat.mjs";
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
/**
 * Asset classes with no exchange behind them. What splits `listedValue` from
 * `privateValue` — a property of the HOLDING, never of the mandate it sits in.
 */
const PRIVATE_CLASSES = new Set(["AIF", "Unlisted", "Structured Product"]);

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
 */
const RINGFENCED_SECURITY_KEYS = new Set(["polycab-india-limited-eq"]);

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
          quantity: isNum(h.quantity) ? h.quantity : null,
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
        from: null, to: null,
      },
    };
  }

  // Rule 1 — the series starts where the composition is COMPLETE.
  const firstOf = (id) => snapshotsByAccount.get(id).snaps[0].date;
  const start = covered.map(firstOf).sort().at(-1);
  const dates = [...new Set(covered.flatMap((id) => snapshotsByAccount.get(id).snaps.map((s) => s.date)))]
    .filter((d) => d >= start).sort();

  /** The account's latest snapshot at or before `d`. */
  const at = (id, d) => {
    const snaps = snapshotsByAccount.get(id).snaps;
    let hit = null;
    for (const s of snaps) if (s.date <= d) hit = s; else break;
    return hit;
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
  let prevPoint = null;
  for (const d of dates) {
    let nav = 0;
    let onDate = 0;
    /** Net external capital IN, attributed on each account's own clock (rule 4). */
    let flowIn = 0;
    let flowUnknownValue = 0;
    /**
     * RULE 3, AND THE TIE-BREAK IS NOT ALPHABETICAL.
     *
     * 360 ONE Special Opportunities is reported under CRN37702 and CRN60117, and
     * both CRNs are in the covered set. Counting whichever account sorted first
     * would have taken 60117's 30 June mark on every date after 31 July, when
     * 37702 has restated — the group would be counted once (right) at a stale
     * figure (wrong). The group is held at its LATEST-DATED row, which is the
     * same "a snapshot supersedes" rule `newestPerReportType` applies one layer
     * up; the accountId breaks a genuine tie so the file stays byte-identical.
     */
    const best = new Map();
    for (const id of covered) {
      const snap = at(id, d);
      if (!snap) continue;                       // cannot happen after `start`, by construction
      if (snap.date === d) onDate++;
      for (const row of snap.rows) {
        if (!row.dedupeGroup) { nav += row.marketValue; continue; }
        const cur = best.get(row.dedupeGroup);
        if (!cur || snap.date > cur.date || (snap.date === cur.date && id < cur.id)) {
          best.set(row.dedupeGroup, { date: snap.date, id, marketValue: row.marketValue });
        }
      }
      if (prevPoint) {
        const was = at(id, prevPoint.date);
        // This account's mark MOVED in this interval — so its own flows since
        // that earlier snapshot are what this interval's change contains.
        if (was && was.date !== snap.date) {
          const flows = (accountCashFlows[id] ?? []).filter((f) =>
            !/^Opening portfolio value/i.test(f.description ?? "") && f.date > was.date && f.date <= snap.date);
          // `CashFlow.amount` is NEGATIVE for capital in (see types.ts), so
          // capital in is the negated sum.
          flowIn += -sum(flows.map((f) => f.amount));
          if (flowBasis[id].basis === "unreported") flowUnknownValue += snap.marketValue;
        }
      }
    }
    for (const g of best.values()) nav += g.marketValue;
    const point = {
      period: d,
      date: d,
      nav: r2(nav),
      accountsOnDate: onDate,
      accountsCarried: covered.length - onDate,
      /** Net external capital in since the previous point, on each account's own clock. */
      flowIn: prevPoint ? r2(flowIn) : 0,
      /** Value restated in this interval by an account with no capital record. */
      unreportedFlowValue: prevPoint ? r2(flowUnknownValue) : 0,
    };
    navHistory.push(point);
    prevPoint = { date: d };
  }

  notes.push(`navHistory: ${navHistory.length} dated point(s) from ${dates[0]} to ${dates.at(-1)}, `
    + `over the ${covered.length} account(s) that publish MORE THAN ONE dated valuation `
    + `(₹${(navHistory.at(-1).nav / 1e7).toFixed(2)} Cr at the last point, each dedupeGroup counted once). `
    + `${single.length} account(s) publish exactly one dated valuation and ${unvalued.length} publish none — `
    + "both are named in the coverage block rather than carried into the series as a flat line, "
    + "which would drag its return towards a figure nothing measured. "
    + "The series starts where the composition is complete: an earlier start would climb because accounts ARRIVED.");
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
    },
  };
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
  const accountReturns = {};
  const corporateActionsAll = [];
  const realisedByClass = new Map();
  const accountBridges = {};
  const unclassified = new Map();
  /** Accounts read in full and deliberately left OUT — see excludedFromBook. */
  const excludedAccounts = [];
  /** Positions whose lot register does not account for the units held — no split. */
  const splitUnreconciled = [];
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
      const costBasis = isNum(h.totalCost) ? h.totalCost : joinedCost;
      const marketValue = h.marketValue;
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
        quantity: h.quantity,
        avgCost: h.unitCost,
        currentPrice: h.marketPrice,
        costBasis,
        /** "opening-position" where the cost came from the broker's ledger, not this statement. */
        costBasisSource: joinedCost !== null ? "opening-position" : undefined,
        marketValue,
        // Derived from whatever cost we ended up with, so a joined cost yields a
        // gain on the same basis. Both stay null when there is no cost at all —
        // a market value with no basis under it is not a profit of its own size.
        unrealizedPnL: isNum(marketValue) && isNum(costBasis) ? r2(marketValue - costBasis) : h.gainLoss,
        returnPct: isNum(marketValue) && isNum(costBasis) && costBasis
          ? r2(((marketValue - costBasis) / costBasis) * 100)
          : h.pctGainLoss,
        stCostBasis,
        ltCostBasis,
        daysToLT,
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
  const { navHistory, accountNavHistory, coverage: navCoverage } = navHistoryFrom(
    byAccount, new Set(accounts.map((a) => a.accountId)), dedupeByAcctSec, accountCashFlows, positions, notes,
  );
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
    // Named, never silently dropped: a register that does not account for the
    // units held cannot split them, and saying so is the whole point.
    for (const u of splitUnreconciled) {
      notes.push(`no short/long-term split for ${u.security} (${u.accountId}): the lot register accounts for `
        + `${u.lotQty ?? "an unknown number of"} unit(s) against ${u.held} held, so the lots do not cover the `
        + "position. Splitting on them would put a tax basis on units the position does not contain, or treat "
        + "the uncovered cost as long-term when it is simply unknown.");
    }
  }

  return {
    accounts, positions, polycab, owners, capitalGains, accountCashFlows, entityCashFlows,
    navHistory, accountNavHistory, navCoverage,
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
       * LISTED vs PRIVATE, SPLIT BY WHAT THE HOLDINGS ARE.
       *
       * These were `listedValue: totalValue, privateValue: 0` — true when every
       * account in the book was a listed-equity mandate, and false the moment
       * the AIF statements got a reader. ₹204 Cr of Sanshi Fund and ₹3.4 Cr of
       * Transition Venture were being reported as listed equity, which is 62% of
       * the book under a label that does not describe it.
       *
       * The split is on `assetClass`, which is what a holding IS — the same
       * field §5 of CLAUDE.md keeps separate from how an account is RUN. Cash
       * counts as listed because it is liquid and sits inside listed mandates;
       * an unlisted holding or a structured product is private for the same
       * reason an AIF unit is: there is no exchange to sell it on.
       */
      listedValue: r2(sum(dedupedForTotal.filter((p) => !PRIVATE_CLASSES.has(p.assetClass)).map((p) => p.marketValue ?? 0))),
      privateValue: r2(sum(dedupedForTotal.filter((p) => PRIVATE_CLASSES.has(p.assetClass)).map((p) => p.marketValue ?? 0))),
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
  L.push("  Account, AccountBridge, AccountReturnBlock, BookSummary, CashFlow, Commitment,");
  L.push("  CorporateAction, EntityCG, FundInvestment, NavCoverage, NavPoint, Position, RealisedByClass,");
  L.push("  StartupInvestment,");
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
