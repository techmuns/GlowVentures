// THE FAMILY'S CONSOLIDATED REVIEW, AS THE SOURCE FOR PRIVATE-MARKET HOLDINGS.
//
// *"for private market data you can use the MOPWM as the source … it should also
// feed all the mornings CIO and other parts of the dashboard"* — the family,
// Stage 10dh. This reverses "the consolidated review workbook is not a source —
// by decision" for PRIVATE MARKET ONLY. Every listed figure is still the
// statements'.
//
// One function, pure: the review's lines and `shared/reviewHolders.mjs` in, book
// rows out. It REFUSES — throws, naming the line — rather than guess: a holder
// table entry matching no line or two, a split not adding to its line, a line no
// entry covers, a holder whose figures do not tie to the review's own
// Transactions tab, a superseded row that is not in the book exactly once.
// `build-book` splices the result in after the ring-fence and nowhere else.

import { loadReviewPrivate, REVIEW_AS_OF } from "./reviewPrivateRead.mjs";
import { REVIEW_PRIVATE_JOIN, DISPLAY_NAME } from "../../shared/reviewPrivateJoin.mjs";
import {
  PRIVATE_INVESTMENT_HOLDERS, PRIVATE_INVESTMENT_ELSEWHERE, VALUED_HOLDERS, SUPERSEDED,
  FRESHER_STATEMENT, REVIEW_ACCOUNT_PREFIX, NOT_ATTRIBUTED, NOT_ATTRIBUTED_NAME,
} from "../../shared/reviewHolders.mjs";
import { securityKeyOf } from "../../shared/securityKey.mjs";
import { fifoReturnPct } from "../../shared/fifo.mjs";
import { ownerById } from "../../shared/owners.mjs";

// A date is a date, never an Excel serial (Stage 10dg): the review stores a
// single investment date as a serial number, so 45001 is shown as "16 Mar 2023".
// A cell no rule reads is shown as printed, never turned into a date it may not be.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayText = (iso) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const monthText = (ym) => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
function datesText(d) {
  if (!d || d.precision === null) return null;
  if (d.precision === "day") return dayText(d.from);
  if (d.precision === "month") return d.from === d.to ? monthText(d.from) : `${monthText(d.from)} – ${monthText(d.to)}`;
  return d.text ?? null;
}

export const REVIEW_PROVIDER = "Consolidated review (MOPWM)";
const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
const sum = (xs) => xs.reduce((s, x) => s + (x ?? 0), 0);
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
/** A reason opens a sentence of its own in a note, so its first letter is a capital. */
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const fail = (msg) => { throw new Error(`reviewBook: ${msg}`); };

const displayName = (product) => DISPLAY_NAME.find((d) => d.line.test(product))?.name ?? product;
const ownerName = (id) => (id === NOT_ATTRIBUTED ? NOT_ATTRIBUTED_NAME : ownerById(id)?.displayName ?? fail(`no owner ${id}`));

/** The review's Transactions tab names a holder in words; this is the one map. */
const INVESTOR = {
  "Ajay Jaisinghani": "ajay-jaisinghani",
  "Bharat Jaisinghani": "bharat-jaisinghani",
  "Ankita Jaisinghani": "ankita-jaisinghani",
  "Bharat Jaisinghani Family Trust II": "bharat-jaisinghani-family-trust-2",
  "Bharat Jaisinghani Family Trust III": "bharat-jaisinghani-family-trust-3",
};

export function reviewBookLayer({ root = ".", positions, unvalued }) {
  const listedNames = REVIEW_PRIVATE_JOIN.filter((j) => j.listed).map((j) => j.listed);
  const r = loadReviewPrivate(root, { listedNames });
  const notes = [];

  // ── 1. Which statement rows the review replaces ────────────────────────────
  const removePositions = new Set(), removeUnvalued = new Set(), removeWindows = new Set();
  const isinOf = new Map();
  const superseded = [];
  const reviewLineFor = (key) => {
    const extra = { "bavf-series-20-class-c6": "Blue Ashva Varenya Account", "efpl-pref-18042043": "Everest Fleet Private Ltd" };
    if (extra[key]) return extra[key];
    if (/^zepto/.test(key)) return "Zepto";
    const j = REVIEW_PRIVATE_JOIN.find((x) => x.keys.includes(key));
    const holder = [...PRIVATE_INVESTMENT_HOLDERS, ...VALUED_HOLDERS].find((h) => h.key === key);
    const pattern = j?.line ?? holder?.line;
    if (!pattern) fail(`superseded key ${key} names no review line`);
    const line = [...r.privateInvestments.lines, ...r.peFunds.lines, ...r.unlisted.lines].find((l) => pattern.test(l.product));
    return displayName(line?.product ?? fail(`superseded key ${key}: its pattern ${pattern} matches no review line`));
  };
  for (const s of SUPERSEDED) {
    const id = `${s.accountId}|${s.securityKey}`;
    const reviewLine = reviewLineFor(s.securityKey);
    const base = { accountId: s.accountId, securityKey: s.securityKey, kind: s.kind, reviewLine };
    if (s.kind === "window") { removeWindows.add(id); superseded.push({ ...base, security: null, quantity: null, marketValue: null }); continue; }
    const pool = s.kind === "position" ? positions : unvalued;
    const hits = pool.filter((p) => p.accountId === s.accountId && p.securityKey === s.securityKey);
    if (hits.length !== 1) fail(`superseded ${s.kind} ${id} is in the book ${hits.length} times, not once`);
    const h = hits[0];
    if (h.isin && !isinOf.has(h.securityKey)) isinOf.set(h.securityKey, h.isin);
    (s.kind === "position" ? removePositions : removeUnvalued).add(id);
    superseded.push({ ...base, security: h.security, quantity: h.quantity ?? null, marketValue: s.kind === "position" ? r2(h.marketValue) : null });
  }

  // ── 2. The Transactions tab, per holder ────────────────────────────────────
  const tsi = r.transactions.rows;
  const flowsOf = (product, ownerId) => {
    const rows = tsi.filter((t) => t.product === product && INVESTOR[t.investor] === ownerId);
    const unknown = tsi.filter((t) => t.product === product && !INVESTOR[t.investor]);
    if (unknown.length) fail(`${product}: a Transactions row names a holder this table does not map (${unknown[0].investor})`);
    const closing = rows.filter((t) => t.txn === "Closing");
    const closingDate = closing.length ? closing.map((t) => t.date).sort().at(-1) : null;
    // THE DATED ROWS, AS THE REVIEW PRINTS THEM (Stage 10dh): every purchase,
    // sale and income payout, each on its own date, which is what a fund's
    // money-weighted return is struck on. A row type no rule here reads, a row
    // with no date or no amount, a sign the wrong way round, or a row dated
    // after the line's own closing REFUSES the build — a return over rows this
    // reader guessed at is a figure nobody could check.
    const dated = rows.filter((t) => t.txn !== "Closing").map((t) => {
      const kind = t.txn === "Purchase" ? "purchase" : t.txn === "Sale" ? "sale" : /^div/i.test(t.txn) ? "income"
        : fail(`${product}: ${ownerId}'s Transactions row ${t.row} is a "${t.txn}", which no rule here reads`);
      if (!t.date) fail(`${product}: Transactions row ${t.row} carries no date`);
      if (!Number.isFinite(t.value) || t.value === 0) fail(`${product}: Transactions row ${t.row} carries no amount`);
      if (kind === "purchase" ? t.value > 0 : t.value < 0) fail(`${product}: Transactions row ${t.row}, a ${t.txn}, has the wrong sign (${t.value})`);
      if (closingDate && t.date > closingDate) fail(`${product}: Transactions row ${t.row} is dated ${t.date}, after the line's own closing of ${closingDate}`);
      const units = kind === "income" || t.qty === null || t.qty === undefined ? null : Math.round(Number(t.qty) * 1000) / 1000;
      const rate = kind === "income" || t.rate === null || t.rate === undefined ? null : Number(t.rate);
      return { date: t.date, kind, amount: r2(Math.abs(t.value)), units, rate, reviewRow: t.row };
    }).sort((a, b) => a.date.localeCompare(b.date) || a.reviewRow - b.reviewRow);
    return {
      rows: rows.length,
      cost: r2(-sum(rows.filter((t) => t.txn === "Purchase" || t.txn === "Sale").map((t) => t.value))),
      paidIn: r2(-sum(rows.filter((t) => t.txn === "Purchase").map((t) => t.value))),
      closing: closing.length ? r2(sum(closing.map((t) => t.value))) : null,
      closingDate,
      dated,
    };
  };

  // ── 3. Rows ────────────────────────────────────────────────────────────────
  const out = [];
  /** The review's dated rows behind each valued line, per holder (BOOK_REVIEW_FLOWS). */
  const flows = [];
  const owners = new Set();
  const rowOwner = new Map();
  const fresherOf = (key, owner) => FRESHER_STATEMENT.filter((f) => f.key === key && f.owner === owner).map((f) => f.text);
  // THE REVIEW'S OWN CLASSIFICATION OF EACH LINE (Stage 10dh). Its head tab
  // files the PE funds and the Private Equity block under Alternate, unlisted
  // shares under Equity and the K M Global loan under Debt; the basket is the
  // code each line carries — EG for the private book, SG for NSE's unlisted
  // shares, EG for Zepto's, TT for the credit line. Read by the family's two
  // axes (`familyTaxonomy.ts`) for a line their hand-checked map does not name.
  const REVIEW_TAXONOMY = {
    peFunds: { assetClass: "Alternate", basket: "Entrepreneurial Growth" },
    privateInvestments: { assetClass: "Alternate", basket: "Entrepreneurial Growth" },
    credit: { assetClass: "Debt", basket: "Thematic & Tactical" },
  };
  const UNLISTED_BASKET = { "national-stock-exchange-of-india": "Stable Growth", zepto: "Entrepreneurial Growth" };
  const taxonomyOf = (tab, key) => tab === "unlisted"
    ? { assetClass: "Equity", basket: UNLISTED_BASKET[key] ?? fail(`unlisted line ${key} carries no basket code here`) }
    : REVIEW_TAXONOMY[tab] ?? fail(`no review classification for tab ${tab}`);
  const push = ({ key, security, owner, account, assetClass, qty, cost, value, atCost, asOf, note, tab }) => {
    const accountId = account ?? `${REVIEW_ACCOUNT_PREFIX}${owner}`;
    if (!account) owners.add(owner);
    const fresher = fresherOf(key, owner);
    rowOwner.set(out.length, owner);
    out.push({
      securityKey: key, security, symbol: null, isin: isinOf.get(key) ?? undefined, accountId, memberId: null,
      sector: "Unclassified", providerSector: null, assetClass, marketSide: "private",
      quantity: qty ?? null,
      // What one unit cost, wherever the review records units — held at cost or not:
      // a price paid is a cost, not a valuation (Stage 10dh).
      avgCost: !qty ? null : r2(cost / qty),
      currentPrice: null, costBasis: r2(cost), costBasisSource: "review", printedCostBasis: undefined,
      marketValue: r2(atCost ? cost : value),
      unrealizedPnL: atCost ? null : r2(value - cost),
      realizedPnL: null, costOfUnitsSold: null, realizedLotsAfter: undefined,
      returnPct: atCost ? null : r2(fifoReturnPct(value, cost, null, null)),
      stCostBasis: null, ltCostBasis: null, daysToLT: null, heldSince: null,
      priceAsOf: asOf ?? REVIEW_AS_OF, accruedIncome: null, dividendReceived: null, positionIrrPct: null,
      dedupeGroup: undefined, alsoReportedUnder: undefined,
      review: true, valuedAtCost: atCost ? true : undefined, reviewTaxonomy: taxonomyOf(tab, key),
      reviewNote: `${note}${fresher.length ? ` A newer statement says otherwise: ${fresher.join("; ")}.` : ""}`,
    });
  };

  // Private Investments: every one of its 87 lines is held, named elsewhere, or written off.
  const pi = r.privateInvestments;
  if (pi.lines.length !== 87) fail(`Private Investments carries ${pi.lines.length} lines, not 87`);
  if (!near(sum(pi.lines.map((l) => l.cost)), pi.total.cost)) fail("Private Investments' lines do not add to its own Total");
  const covered = new Map();
  const claim = (entry, where) => {
    const hits = pi.lines.filter((l) => entry.line.test(l.product));
    if (hits.length !== 1) fail(`${where} ${entry.line} matches ${hits.length} Private Investments lines, not one`);
    if (covered.has(hits[0].row)) fail(`Private Investments row ${hits[0].row} is covered twice`);
    covered.set(hits[0].row, where);
    return hits[0];
  };
  const writtenOff = [];
  for (const l of pi.lines) {
    if (!/written off/i.test(l.remark ?? "")) continue;
    if (l.cost || l.value) fail(`written-off row ${l.row} carries a figure`);
    covered.set(l.row, "written off");
    writtenOff.push({ security: displayName(l.product), reviewRow: l.row, remark: l.remark, dates: datesText(l.dates) });
  }
  for (const e of PRIVATE_INVESTMENT_ELSEWHERE) { claim(e, "elsewhere"); }
  for (const e of PRIVATE_INVESTMENT_HOLDERS) {
    const l = claim(e, "held");
    const name = displayName(l.product);
    const key = e.key ?? securityKeyOf(name);
    const bare = e.split.filter((s) => s.cost === undefined);
    if (bare.length > 1) fail(`${name}: more than one part takes the remainder`);
    const fixed = sum(e.split.map((s) => s.cost));
    const parts = e.split.map((s) => ({ ...s, cost: s.cost ?? l.cost - fixed }));
    if (!near(sum(parts.map((s) => s.cost)), l.cost)) fail(`${name}: the split adds to ${sum(parts.map((s) => s.cost))}, not the line's ${l.cost}`);
    for (const s of parts) {
      push({ key, security: name, owner: s.owner, assetClass: e.assetClass, qty: null, cost: s.cost, atCost: true, tab: "privateInvestments",
        note: `Held at cost on the family's consolidated review (MOPWM, 30 Jun 2026), Private Investments row ${l.row}${parts.length > 1 ? ` — ${ownerName(s.owner)}'s ₹${s.cost.toLocaleString("en-IN")} of the line` : ""}. ${cap(e.why)}.` });
    }
  }
  for (const l of pi.lines) if (!covered.has(l.row)) fail(`Private Investments row ${l.row} (${displayName(l.product)}) is covered by no entry`);

  // PE funds, unlisted shares and the credit line: valued where the review values them.
  const TAB = { peFunds: [r.peFunds, "PE Funds"], unlisted: [r.unlisted, "Direct Equity - Unlisted"], credit: [r.credit, "Debt"] };
  const byTab = {};
  for (const e of VALUED_HOLDERS) {
    const [block, tabName] = TAB[e.tab] ?? fail(`unknown tab ${e.tab}`);
    const hits = block.lines.filter((l) => e.line.test(l.product));
    if (hits.length !== 1) fail(`${e.line} matches ${hits.length} ${tabName} lines, not one`);
    const l = hits[0];
    (byTab[e.tab] ??= new Set()).add(l.row);
    const parts = e.split;
    if (!e.atCost && !near(sum(parts.map((s) => s.value)), l.value)) fail(`${e.name}: the parts' value ${sum(parts.map((s) => s.value))} is not the line's ${l.value}`);
    if (l.cost > 1 && !near(sum(parts.map((s) => s.cost)), l.cost)) fail(`${e.name}: the parts' cost is not the line's ${l.cost}`);
    if (e.atCost && !near(sum(parts.map((s) => s.cost)), l.value)) fail(`${e.name}: held at cost, but the parts' cost is not the line's value ${l.value}`);
    const qtyPrinted = Number(String(l.qty ?? "").replace(/,/g, ""));
    if (qtyPrinted && parts.every((s) => s.qty !== undefined) && !near(sum(parts.map((s) => s.qty)), qtyPrinted, 0.01)
      && !/India SME/.test(e.name)) fail(`${e.name}: the parts' units are not the line's ${qtyPrinted}`);
    for (const s of parts) {
      if (s.owner === NOT_ATTRIBUTED) fail(`${e.name}: a valued line must name its holder`);
      const f = flowsOf(l.product, s.owner);
      if (f.rows) {
        if (!e.atCost && f.closing !== null && !near(f.closing, s.value)) fail(`${e.name}: ${s.owner}'s value ${s.value} is not the Transactions closing ${f.closing}`);
        const tieTo = l.cost > 1 ? f.cost : f.paidIn;
        if (!near(tieTo, s.cost)) fail(`${e.name}: ${s.owner}'s cost ${s.cost} is not the Transactions figure ${tieTo}`);
      } else if (!/National Stock Exchange/.test(e.name) && !s.account) {
        fail(`${e.name}: no Transactions row for ${s.owner}`);
      }
      const accountId = s.account ?? `${REVIEW_ACCOUNT_PREFIX}${s.owner}`;
      for (const x of f.dated) flows.push({ accountId, securityKey: e.key, security: e.name, ...x });
      // THE UNITS THE DATED ROWS WALK TO, where every one of them prints units:
      // a line whose closing holds a different count is NAMED, never reconciled
      // by a unit nobody dated (360 ONE's 3,769.026, Stage 10dh).
      const unitRows = f.dated.filter((x) => x.kind !== "income");
      if (s.qty && unitRows.length && unitRows.every((x) => x.units !== null)) {
        const walked = sum(unitRows.map((x) => (x.kind === "purchase" ? x.units : -x.units)));
        if (!near(walked, s.qty, 0.01)) {
          notes.push(`review: ${e.name} — ${ownerName(s.owner)}'s Transactions rows walk to ${walked.toLocaleString("en-IN", { maximumFractionDigits: 3 })} units; the closing holds ${s.qty.toLocaleString("en-IN", { maximumFractionDigits: 3 })}, so ${(walked - s.qty).toLocaleString("en-IN", { maximumFractionDigits: 3 })} units are on no dated row`);
        }
      }
      push({ key: e.key, security: e.name, owner: s.owner, account: s.account, assetClass: e.assetClass, qty: s.qty, tab: e.tab,
        cost: s.cost, value: s.value, atCost: !!e.atCost, asOf: e.atCost ? REVIEW_AS_OF : f.closingDate ?? REVIEW_AS_OF,
        note: `${e.atCost ? "Held at cost" : `Valued at ₹${s.value.toLocaleString("en-IN")}`} on the family's consolidated review (MOPWM, 30 Jun 2026), ${tabName} row ${l.row}${f.closingDate && !e.atCost ? `, its closing of ${dayText(f.closingDate)}` : ""}. ${cap(e.why)}.` });
    }
  }
  for (const [tab, [block, tabName]] of Object.entries(TAB)) {
    for (const l of block.lines) if (!byTab[tab]?.has(l.row)) fail(`${tabName} row ${l.row} (${l.product}) is covered by no entry`);
  }

  // ── 4. Every member ties to the review's own Investorwise summary ──────────
  // PE funds and unlisted shares tie member by member. Private Investments ties
  // as a whole: what no member is shown holding is exactly the not-attributed
  // rows, plus the two lines counted elsewhere (ESDS, and the K M Global loan).
  const tabOf = (p) => (/PE Funds row/.test(p.reviewNote) ? "peFunds" : /Unlisted row/.test(p.reviewNote) ? "unlisted" : /Private Investments row/.test(p.reviewNote) ? "peAtCost" : null);
  const ownerOfRow = (p) => rowOwner.get(out.indexOf(p));
  const held = { peFunds: new Map(), unlisted: new Map(), peAtCost: new Map() };
  for (const p of out) { const t = tabOf(p); if (t) held[t].set(ownerOfRow(p), (held[t].get(ownerOfRow(p)) ?? 0) + p.marketValue); }
  for (const t of ["peFunds", "unlisted"]) {
    for (const [member, v] of Object.entries(r.members[t].byMember)) {
      const ownerId = INVESTOR[member];
      if (!ownerId) { if (v) fail(`Investorwise ${t}: ${member} holds ₹${v}, and no row here is theirs`); continue; }
      if (!near(held[t].get(ownerId) ?? 0, v)) fail(`Investorwise ${t}: ${member} ₹${v} against ₹${held[t].get(ownerId) ?? 0} here`);
    }
  }
  const elsewhereCost = sum(PRIVATE_INVESTMENT_ELSEWHERE.map((e) => pi.lines.find((l) => e.line.test(l.product)).cost));
  const gap = sum(Object.entries(r.members.peAtCost.byMember).map(([m, v]) => v - (held.peAtCost.get(INVESTOR[m]) ?? 0)));
  if (!near(gap, (held.peAtCost.get(NOT_ATTRIBUTED) ?? 0) + elsewhereCost, 2)) fail(`Investorwise Private Equity: members leave ₹${gap}, not the not-attributed rows and the lines counted elsewhere`);

  // Keys unique per (account, security).
  const seen = new Set();
  for (const p of out) {
    const id = `${p.accountId}|${p.securityKey}`;
    if (seen.has(id)) fail(`two rows for ${id}`);
    seen.add(id);
    if (/Polycab|AVENDUS/i.test(JSON.stringify(p))) fail(`${p.security} carries a name this dashboard keeps off every page`);
  }
  notes.push(`review: ${out.length} private-market rows from the consolidated review (MOPWM, 30 Jun 2026) — ${superseded.length} statement rows superseded, ${writtenOff.length} written-off lines named`);

  const accounts = [...owners].sort().map((ownerId) => ({
    accountId: `${REVIEW_ACCOUNT_PREFIX}${ownerId}`, provider: REVIEW_PROVIDER, accountNo: "MOPWM", ownerId, owner: ownerName(ownerId),
    strategy: null, engagement: "Direct",
    providerEngagement: "Private investments as the family's consolidated review records them (MOPWM, 30 June 2026)",
    members: [], asOf: REVIEW_AS_OF, inceptionDate: null, capitalRecordTo: null, custodian: REVIEW_PROVIDER, noPositionsReason: null,
    // A holder bucket, not a custodian account: its lines are separate
    // investments, so a dated record over it is struck per line (Stage 10dh).
    reviewHolder: true,
  }));
  flows.sort((a, b) => a.accountId.localeCompare(b.accountId) || a.securityKey.localeCompare(b.securityKey) || a.date.localeCompare(b.date) || a.reviewRow - b.reviewRow);
  notes.push(`review: ${flows.length} dated rows (purchases, sales, income) behind ${new Set(flows.map((x) => `${x.accountId}|${x.securityKey}`)).size} valued holdings`);
  return { positions: out, accounts, flows, removePositions, removeUnvalued, removeWindows, superseded, writtenOff, notes, members: r.members };
}
