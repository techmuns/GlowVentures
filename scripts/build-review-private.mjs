#!/usr/bin/env node
// npm run build-review-private [-- --check]
//
// The family's consolidated review (MOPWM, 30 June 2026) prints its private
// markets — 87 private investments at cost, six PE funds, two unlisted shares and
// one private credit line — and the family asked on 5 Oct 2026 for it to be SHOWN.
// This emits src/data/reviewPrivate.ts (read by the Private Market page's review
// tab and nothing else) and docs/REVIEW-PRIVATE-MARKET.md.
//
// IT NEVER WRITES TO THE BOOK. Every figure is the review's own, re-derived from
// the review's own dated rows wherever it can be, and every place the review
// disagrees with itself is NAMED as a check rather than corrected.
import { readFileSync, writeFileSync } from "node:fs";
import { loadReviewPrivate, REVIEW_AS_OF } from "./lib/reviewPrivateRead.mjs";
import { REVIEW_PRIVATE_JOIN, REFUSED, DISPLAY_NAME } from "../shared/reviewPrivateJoin.mjs";

const CHECK = process.argv.includes("--check");
const OUT_TS = "src/data/reviewPrivate.ts";
const OUT_MD = "docs/REVIEW-PRIVATE-MARKET.md";

// ── the book, read for the "In the statements" column only ──
const src = readFileSync("src/data/glowData.ts", "utf8");
function exported(name) {
  const i = src.indexOf(`export const ${name}`);
  const s = src.indexOf("= [", i), e = src.indexOf("\n];", s);
  return JSON.parse(src.slice(s + 2, e + 2));
}
const POSITIONS = exported("BOOK_POSITIONS"), UNVALUED = exported("BOOK_UNVALUED_HOLDINGS"), ACCOUNTS = exported("BOOK_ACCOUNTS");
const ACCOUNT = new Map(ACCOUNTS.map((a) => [a.accountId, a]));
const stmt = (accountId, units, valued) => {
  const a = ACCOUNT.get(accountId);
  if (!a) fail(`statement account ${accountId} is not in BOOK_ACCOUNTS`);
  return { accountId, owner: a.owner, provider: a.provider, accountNo: a.accountNo, units, valued };
};

const listedNames = REVIEW_PRIVATE_JOIN.filter((j) => j.listed).map((j) => j.listed);
const r = loadReviewPrivate(".", { listedNames });
const near = (a, b, tol = 1) => a !== null && b !== null && Math.abs(a - b) <= tol;
const sum = (xs) => xs.reduce((s, x) => s + (x ?? 0), 0);
const r2 = (x) => (x === null ? null : Math.round(x * 100) / 100);
const fail = (m) => { throw new Error(`build-review-private: ${m}`); };
const checks = [];
// `short` is the row's face on the page (a few words); `text` and `detail` are its hover.
const check = (key, text, detail, short) => checks.push({ key, short, text, detail });

// ── the joins: each pattern names exactly one review line, each key a book row ──
const allLines = [...r.privateInvestments.lines, ...r.peFunds.lines, ...r.unlisted.lines];
const joinOf = new Map();
for (const j of REVIEW_PRIVATE_JOIN) {
  const hit = allLines.filter((l) => j.line.test(l.product));
  if (hit.length !== 1) fail(`${j.line} names ${hit.length} review lines, not one`);
  joinOf.set(hit[0], j);
}
function statementsFor(keys) {
  const out = [];
  for (const k of keys) {
    const pos = POSITIONS.filter((p) => p.securityKey === k), unv = UNVALUED.filter((u) => u.securityKey === k);
    if (!pos.length && !unv.length) fail(`join key ${k} is on no statement row`);
    for (const p of pos) out.push(stmt(p.accountId, p.quantity, p.marketValue !== null && p.marketValue !== undefined));
    for (const u of unv) out.push(stmt(u.accountId, u.quantity, false));
  }
  return out;
}
const displayName = (product) => DISPLAY_NAME.find((d) => d.line.test(product))?.name ?? product;
const shortName = (product) => displayName(product).split(" - ")[0].split(" (")[0];

// ── the review's dated rows, per product: paid in, paid back, XIRR ──
const TSI = r.transactions.rows;
function flowsOf(product) {
  const rows = TSI.filter((t) => t.product === product);
  const paidIn = -sum(rows.filter((t) => t.txn === "Purchase").map((t) => t.value));
  const income = sum(rows.filter((t) => t.txn === "Div / Int").map((t) => t.value));
  const sale = sum(rows.filter((t) => t.txn === "Sale").map((t) => t.value));
  const closing = sum(rows.filter((t) => t.txn === "Closing").map((t) => t.value));
  return { rows, paidIn: rows.length ? r2(paidIn) : null, income: r2(income), sale: r2(sale), closing: r2(closing) };
}
const DAY = 864e5;
/** Money-weighted rate, ACT/365, by bisection — every flow on its own date. */
export function xirr(flows) {
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = Math.min(...flows.map((f) => Date.parse(f.date)));
  const npv = (rate) => flows.reduce((s, f) => s + f.amount / (1 + rate) ** ((Date.parse(f.date) - t0) / DAY / 365), 0);
  let lo = -0.9999, hi = 100;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 300; i++) { const mid = (lo + hi) / 2; (npv(lo) * npv(mid) <= 0) ? (hi = mid) : (lo = mid); }
  return (lo + hi) / 2;
}
function xirrOf(rows) {
  const flows = rows.filter((t) => t.date && t.value).map((t) => ({ date: t.date, amount: t.txn === "Purchase" ? t.value : t.value }));
  return xirr(flows);
}
/** Each holder's units walked purchase by purchase to their closing, and the closing priced. */
function unitWalk(product, rows) {
  const out = [];
  for (const inv of new Set(rows.map((t) => t.investor))) {
    const mine = rows.filter((t) => t.investor === inv);
    const close = mine.filter((t) => t.txn === "Closing");
    if (close.length !== 1) continue;
    const walked = sum(mine.filter((t) => t.txn === "Purchase").map((t) => t.qty)) - sum(mine.filter((t) => t.txn === "Sale").map((t) => t.qty));
    const c = close[0];
    const buys = mine.filter((t) => t.txn === "Purchase");
    if (buys.length && buys.every((t) => t.qty !== null) && c.qty !== null && Math.abs(walked - c.qty) > 0.01) out.push(`${inv}: purchases less sales are ${walked.toLocaleString("en-IN")} units, the closing row says ${c.qty.toLocaleString("en-IN")}`);
    if (c.qty && c.rate && Math.abs(c.qty * c.rate - c.value) > 1) out.push(`${inv}: ${c.qty.toLocaleString("en-IN")} units × ${c.rate} = ₹${Math.round(c.qty * c.rate).toLocaleString("en-IN")}, the closing value says ₹${Math.round(c.value).toLocaleString("en-IN")}`);
  }
  return out;
}
const pct = (x) => (x === null ? "—" : `${(x * 100).toFixed(2)}%`);
const cr = (x) => (x === null ? "—" : `₹${(x / 1e7).toFixed(4)} Cr`);

// ── PE funds ──
const notesFor = (name) => r.peFunds.notes.filter((n) => n.text.toLowerCase().includes(name.toLowerCase().split(" ")[0])).map((n) => n.text);
function perfRow(l, section) {
  const j = joinOf.get(l) ?? null;
  const f = flowsOf(l.product);
  const paidIn = f.paidIn, paidBack = f.rows.length ? r2(f.income + f.sale) : null;
  const atCost = /shown at cost|face value/i.test(notesFor(l.product).join(" ")) || (l.value !== null && near(l.value, paidIn) && !f.income && !f.sale);
  // A line Transactions since inception carries no dated row for (NSE) is struck on
  // the review's own cost, and says so (`retBasis`); every other line on what its
  // own dated rows say was paid in.
  const base = paidIn ?? l.cost;
  const gain = base === null || !base || l.value === null || atCost ? null : r2(l.value + (paidBack ?? 0) - base);
  const abs = gain === null ? null : gain / base;
  const ours = atCost ? null : xirrOf(f.rows);
  if (abs !== null && l.printed.schemeAbs !== "" && Math.abs(abs - (l.schemeAbs ?? 0)) > 0.0001)
    check(`abs-${section}-${l.row}`, `${displayName(l.product)}: the review prints a ${pct(l.schemeAbs)} return; its own dated rows give ${pct(abs)}`, `(value ${cr(l.value)} + paid back ${cr(paidBack)} − paid in ${cr(paidIn)}) ÷ paid in. Review row ${l.row}.`, `${shortName(l.product)}: printed return ≠ its own rows`);
  if (ours !== null && l.printed.schemeXirr !== "" && Math.abs(ours - (l.schemeXirr ?? 0)) > 0.0005)
    check(`xirr-${section}-${l.row}`, `${displayName(l.product)}: the review prints XIRR ${pct(l.schemeXirr)}; its own dated rows give ${pct(ours)}`, `Every purchase, payout and closing row on Transactions since inception, each on its own date. Review row ${l.row}.`, `${shortName(l.product)}: printed XIRR ≠ its own rows`);
  if (paidIn !== null && l.cost !== null && !near(l.cost, paidIn))
    check(`cost-${section}-${l.row}`, `${displayName(l.product)}: Investment at Cost reads ${cr(l.cost)}, against ${cr(paidIn)} paid in on its own dated rows`, f.sale ? `The review nets the ${cr(f.sale)} sale proceeds out of cost.` : `Review row ${l.row}.`, `${shortName(l.product)}: cost ≠ paid in`);
  const dated = f.rows.filter((t) => t.date).map((t) => t.date).sort();
  for (const w of unitWalk(l.product, f.rows)) check(`walk-${section}-${l.row}-${checks.length}`, `${displayName(l.product)} — ${w}`, `Transactions since inception, ${shortName(l.product)}.`,
    `${shortName(l.product)} · ${w.split(":")[0].split(" ")[0]}: ${/purchases less sales/.test(w) ? "bought less sold ≠ closing units" : "units × price ≠ closing value"}`);
  return {
    key: `${section}-${l.row}`, name: displayName(l.product), tab: section === "pe-funds" ? "Alternate" : section === "credit" ? "Debt" : "Equity", row: l.row,
    dates: l.dates.text || null, invested: l.cost, paidIn, paidBack, value: l.value, gain, atCost,
    ret: abs, reviewRet: l.printed.schemeAbs === "" ? null : l.schemeAbs, xirr: ours, reviewXirr: l.printed.schemeXirr === "" ? null : l.schemeXirr,
    benchmark: l.benchmark, valuedAsOf: notesFor(l.product)[0] ?? null,
    since: dated[0] ?? null, until: dated[dated.length - 1] ?? null, retBasis: abs === null ? null : paidIn === null ? "cost" : "rows",
    statements: j ? statementsFor(j.keys) : [], why: j?.why ?? null,
  };
}
const peRows = r.peFunds.lines.map((l) => perfRow(l, "pe-funds"));
const unlistedRows = r.unlisted.lines.map((l) => {
  const row = perfRow(l, "unlisted");
  const note = r.unlisted.notes.find((n) => n.text.toLowerCase().includes(l.product.toLowerCase().split(" ")[0]));
  return { ...row, valuedAsOf: note?.text ?? null };
});
const creditRows = r.credit.lines.map((l) => perfRow(l, "credit"));

// ── private investments at cost: four groups, every line placed once ──
const pi = r.privateInvestments;
if (pi.lines.length !== 87) fail(`Private Investments carries ${pi.lines.length} lines, not 87`);
if (!near(pi.head.cost, pi.total.cost) || !near(sum(pi.lines.map((l) => l.cost)), pi.total.cost)) fail("Private Investments lines do not add to their total");
const preNames = new Set(r.preIpo.lines.map((l) => l.product));
const listedByLine = new Map(r.listedOnEquityTab.map((e) => [REVIEW_PRIVATE_JOIN.find((j) => j.listed === e.product), e]));
const groups = { "pre-ipo": [], "at-cost": [], "now-listed": [], "written-off": [] };
for (const l of pi.lines) {
  const j = joinOf.get(l) ?? null;
  const g = /written off/i.test(l.remark ?? "") ? "written-off" : preNames.has(l.product) ? "pre-ipo" : l.cost === 0 ? "now-listed" : "at-cost";
  if (g === "now-listed" && !j?.listed) fail(`${l.product} is ₹0 on Private Investments and maps to no Equity-tab line`);
  const eq = j?.listed ? listedByLine.get(j) : null;
  groups[g].push({
    key: `pi-${l.row}`, name: displayName(l.product), tab: "Private Investments", row: l.row, dates: l.dates.text || null,
    invested: g === "written-off" || g === "now-listed" ? null : l.cost, paidIn: null, paidBack: null,
    value: g === "now-listed" ? null : l.value, gain: null, atCost: g !== "written-off" && g !== "now-listed",
    ret: null, reviewRet: null, xirr: null, reviewXirr: null, benchmark: null, valuedAsOf: null, since: null, until: null, retBasis: null, remark: l.remark,
    equityTab: eq ? { row: eq.row, units: eq.qty, cost: eq.cost, value: eq.value } : null,
    statements: j ? statementsFor(j.keys) : [], why: j?.why ?? null,
  });
}
if (groups["pre-ipo"].length + groups["at-cost"].length + groups["now-listed"].length + groups["written-off"].length !== 87) fail("the four groups do not hold all 87 lines");

// ── the review against itself ──
const checkCell = pi.after.map((a) => a.cells.map(Number).find((x) => Number.isFinite(x) && x > 100)).find(Boolean);
if (checkCell && !near(pi.total.cost, Math.round(checkCell * 1e9) / 100)) check("pi-check-cell", `Private Investments: the total reads ${cr(pi.total.cost)}; the check cell under it reads ${cr(Math.round(checkCell * 1e9) / 100)}`, `The ${cr(pi.total.cost - Math.round(checkCell * 1e9) / 100)} between them is Integris, ₹15.99974626 Cr on Private Investments against ₹15.99974627 Cr carried to the check.`, "Private Investments: total ≠ its check cell");
for (const [what, rec] of [["Private Investments total", pi.total], ["PE Funds head", r.peFunds.head], ["Direct Equity - Unlisted head", r.unlisted.head]])
  if (rec.dates.precision === "not-a-date") check(`date-sum-${rec.row}`, `${what}: its date cell reads ${rec.dates.text}, a sum, not a date`, `Review row ${rec.row}.`, `${what}: date cell holds a sum`);
const ex = r.exclPreIpo;
const exGap = r2(ex.total.cost - ex.head.cost);
if (Math.abs(exGap) > 1) {
  const named = pi.lines.find((l) => near(l.cost, exGap));
  check("excl-head", `Private Equity Excl Pre IPO: its head reads ${cr(ex.head.cost)}, its own total ${cr(ex.total.cost)}`, `The ${cr(exGap)} between them${named ? ` is ${named.product}` : ""}. The tab says it is "copy pasted (not linked)".`, "Excl Pre IPO: head ≠ its own total");
}
const exAlloc = sum(ex.lines.map((l) => l.alloc));
if (Math.abs(exAlloc - 1) > 0.001) check("excl-alloc", `Private Equity Excl Pre IPO: its allocations add to ${(exAlloc * 100).toFixed(1)}%, not 100%`, `${ex.lines.length} lines.`, `Excl Pre IPO: allocations add to ${(exAlloc * 100).toFixed(1)}%`);
const piPreGap = r2(pi.head.cost - r.preIpo.head.cost - ex.total.cost);
if (Math.abs(piPreGap) > 1) check("pi-split", `Private Investments less Pre IPO is ${cr(pi.head.cost - r.preIpo.head.cost)}; Excl Pre IPO adds to ${cr(ex.total.cost)}`, `A ${cr(piPreGap)} difference.`, "Private Investments: split ≠ total");
const peHead = r.peFunds.head;
const pePaid = r2(sum(peRows.map((x) => x.paidIn)));
if (!near(peHead.cost, pePaid)) check("pe-head-cost", `PE funds: Investment at Cost reads ${cr(peHead.cost)}, against ${cr(pePaid)} paid in on the funds' own dated rows`, "The head leaves out Assetgro and Transition Venture, whose cost cells read 0, and nets 360 One's sale proceeds out of cost.", "PE funds head: cost ≠ paid in");
const peEarned = (sum(peRows.map((x) => x.value)) + sum(peRows.map((x) => x.paidBack)) - pePaid) / pePaid;
if (peHead.printed.schemeAbs === "0") check("pe-head-abs", `PE funds: the head prints 0% under Scheme Absolute and ${pct(peHead.indexAbs)} under Index Absolute`, Math.abs(peEarned - (peHead.indexAbs ?? 0)) < 1e-6
  ? `The funds' own dated rows give ${pct(peEarned)} — the scheme's return, printed one column to the right.`
  : `The funds' own dated rows give ${pct(peEarned)}.`, "PE funds head: return in the wrong column");
const pooled = xirr(peRows.length ? TSI.filter((t) => t.category === "PE Funds" && t.date && t.value).map((t) => ({ date: t.date, amount: t.value })) : []);
if (pooled !== null && Math.abs(pooled - (peHead.schemeXirr ?? 0)) > 0.0005) check("pe-head-xirr", `PE funds: the head prints XIRR ${pct(peHead.schemeXirr)}; the six funds' dated rows pooled give ${pct(pooled)}`, "Every purchase, payout and closing row of the PE funds on Transactions since inception.", "PE funds head: XIRR ≠ pooled rows");
// members
const mem = r.members;
const memTie = [["PE Funds", mem.peFunds, peHead.value], ["Direct Equity - Unlisted", mem.unlisted, r.unlisted.head.value], ["Private Equity (at cost)", mem.peAtCost, pi.total.cost]];
for (const [label, line, want] of memTie) {
  const got = sum(Object.values(line.byMember));
  if (!near(got, want)) check(`members-${line.row}`, `Investorwise Summary: ${label} adds to ${cr(got)} across members, against ${cr(want)} on its own tab`, `Review row ${line.row}.`, `Investorwise: ${label} ≠ its tab`);
}
const members = mem.members.map((name) => ({
  name, peFunds: mem.peFunds.byMember[name], unlisted: mem.unlisted.byMember[name], peAtCost: mem.peAtCost.byMember[name],
})).filter((m) => (m.peFunds ?? 0) + (m.unlisted ?? 0) + (m.peAtCost ?? 0) !== 0);

const data = {
  workbook: r.workbook, asOf: REVIEW_AS_OF, basis: mem.basis,
  sections: [
    { key: "pe-funds", title: "PE funds", tab: "Alternate", head: { row: peHead.row, invested: peHead.cost, value: peHead.value }, rows: peRows },
    { key: "unlisted", title: "Unlisted shares", tab: "Equity", head: { row: r.unlisted.head.row, invested: r.unlisted.head.cost, value: r.unlisted.head.value }, rows: unlistedRows },
    { key: "pre-ipo", title: "Pre-IPO · at cost", tab: "Pre IPO", head: { row: r.preIpo.head.row, invested: r.preIpo.head.cost, value: r.preIpo.head.value }, rows: groups["pre-ipo"] },
    { key: "at-cost", title: "Private investments · at cost", tab: "Private Investments", head: null, rows: groups["at-cost"] },
    { key: "now-listed", title: "Now listed", tab: "Private Investments", head: null, rows: groups["now-listed"] },
    { key: "written-off", title: "Written off", tab: "Private Investments", head: null, rows: groups["written-off"] },
    { key: "credit", title: "Private credit", tab: "Debt", head: null, rows: creditRows },
  ],
  privateInvestmentsTotal: { row: pi.total.row, invested: pi.total.cost, value: pi.total.value },
  members, membersRow: { peFunds: mem.peFunds.row, unlisted: mem.unlisted.row, peAtCost: mem.peAtCost.row },
  checks,
  refused: REFUSED.map((x) => ({ line: displayName(allLines.find((l) => x.line.test(l.product))?.product ?? String(x.line)), why: x.why })),
};

const ts = `// GENERATED by \`npm run build-review-private\` from the family's consolidated
// review (${r.workbook}). Never hand-edit.
// The review's own figures, shown at the family's request of 5 Oct 2026 — read by
// the Private Market page's review tab ONLY, and never added to any book total.
import type { ReviewPrivate } from "../lib/reviewPrivate";

export const REVIEW_PRIVATE: ReviewPrivate = ${JSON.stringify(data, null, 1)};
`;
const line = (x) => `| ${x.row} | ${x.name} | ${x.dates ?? "—"} | ${cr(x.invested)} | ${cr(x.paidIn)} | ${cr(x.value)} | ${x.ret === null ? "—" : pct(x.ret)} | ${x.statements.length ? x.statements.map((s) => `${s.accountId} ${s.units}${s.valued ? "" : " (not valued)"}`).join("; ") : "on no statement in this drop"} |`;
const md = [
  "# The review's private markets", "",
  `Generated by \`npm run build-review-private\` from \`${r.workbook}\`, as on ${REVIEW_AS_OF}. Every figure is the review's own; nothing here reaches a book total. Private investments are carried AT COST — the review says so (${mem.basis}).`, "",
  ...data.sections.flatMap((s) => [`## ${s.title} (${s.rows.length})`, "", "| Row | Line | Dates | Invested | Paid in | Value | Return | In the statements |", "| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |", ...s.rows.map(line), ""]),
  `Private Investments total (row ${pi.total.row}): ${cr(pi.total.cost)}.`, "",
  "## By family member (Investorwise Summary)", "", "| Member | PE funds | Unlisted | Private equity at cost |", "| --- | ---: | ---: | ---: |",
  ...members.map((m) => `| ${m.name} | ${cr(m.peFunds)} | ${cr(m.unlisted)} | ${cr(m.peAtCost)} |`), "",
  `## Where the review disagrees with itself (${checks.length})`, "", ...checks.map((c) => `- **${c.text}.** ${c.detail}`), "",
  "## Joins refused", "", ...REFUSED.map((x) => `- ${allLines.find((l) => x.line.test(l.product))?.product ?? x.line}: ${x.why}.`), "",
  "## The two names shown differently", "", ...DISPLAY_NAME.map((d) => `- \`${allLines.find((l) => d.line.test(l.product))?.product}\` is shown as **${d.name}**: the full text names something this dashboard keeps off every page.`), "",
].join("\n");

let drift = false;
for (const [path, body] of [[OUT_TS, ts], [OUT_MD, md]]) {
  let cur = null; try { cur = readFileSync(path, "utf8"); } catch {}
  if (cur === body) continue;
  drift = true;
  if (!CHECK) writeFileSync(path, body);
}
console.log(`review private markets: ${data.sections.map((s) => `${s.key} ${s.rows.length}`).join(", ")}; ${members.length} members; ${checks.length} checks${CHECK ? (drift ? " — WOULD CHANGE" : " — no change") : ""}`);
if (CHECK && drift) process.exit(1);
