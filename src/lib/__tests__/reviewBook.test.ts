// THE REVIEW IS THE BOOK'S PRIVATE-MARKET SOURCE, AND THE BOOK IS HELD TO IT (Stage 10dh).
//   npm run test:family
//
// The family's words: "for private market data … we will use the
// reconciliation sheet as the source … It should also feed all the mornings CIO
// and other parts of the dashboard." So `build-book` carries every
// private-market line of the consolidated review as an ordinary book position,
// tagged with the review row it was read from (`reviewSource`). The failures
// worth catching here are the ones that render perfectly:
//
//   • a line LEFT OUT — a book that drops one still adds up to itself;
//   • a line counted TWICE — once from the review and again from a statement
//     that reports the same holding, or twice inside the review itself;
//   • a figure read off the WRONG ROW or the wrong column, which reads exactly
//     like the right one;
//   • a gain struck on a line the review holds at cost;
//   • the review tab coming back, now that the review feeds every page.
//
// Every expectation is read off the workbook with SheetJS on the run, cell by
// cell — never through `scripts/lib/reviewPrivateRead.mjs` or
// `scripts/lib/reviewBook.mjs`, the code under test, which would agree with
// itself by construction. The book side is the GENERATED `glowData.ts`.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import {
  BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_REVIEW_FLOWS, BOOK_REVIEW_SUPERSEDED, BOOK_REVIEW_WRITTEN_OFF,
  BOOK_SHARE_MOVEMENTS, BOOK_SUMMARY, BOOK_UNVALUED_HOLDINGS,
} from "@/data/glowData";

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const WORKBOOK = "source/august-2026-d/Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx";
const CRORE = 1e7;
const WB = XLSX.readFile(path.join(process.cwd(), WORKBOOK));
const sheet = (name: string) => {
  // The review's own sheet names carry stray spaces ("Private Investments ").
  const real = WB.SheetNames.find((n) => n.trim() === name.trim());
  const ws = real ? WB.Sheets[real] : undefined;
  if (!ws) throw new Error(`the review has no sheet "${name}"`);
  return ws;
};
const cell = (tab: string, row: number, c: number): unknown => sheet(tab)[XLSX.utils.encode_cell({ r: row - 1, c })]?.v ?? null;
const text = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const lastRow = (tab: string) => XLSX.utils.decode_range(sheet(tab)["!ref"] as string).e.r + 1;
/** The first row (from the top) whose column 1 reads `label`. */
const rowOf = (tab: string, label: RegExp, from = 1) => {
  for (let r = from; r <= lastRow(tab); r++) if (label.test(text(cell(tab, r, 1)))) return r;
  return -1;
};
/** A column BY ITS HEADER, never by position: the review's tabs place cost and
 *  value in different columns (Debt carries a Quantity column the others do not). */
const colOf = (tab: string, headerRow: number, header: RegExp) => {
  for (let c = 0; c < 30; c++) if (header.test(text(cell(tab, headerRow, c)))) return c;
  return -1;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** The first significant word of a company name, cut to five letters — enough
 *  to find "Fractual Analytics" (the review's spelling) as fractal-analytics. */
const stem = (s: string) => norm(s).replace(/^m s /, "").split(" ").find((w) => w.length >= 4)?.slice(0, 5) ?? "";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const serialToDate = (v: number) => new Date(Date.UTC(1899, 11, 30) + v * 864e5);
const isoOf = (v: number) => serialToDate(v).toISOString().slice(0, 10);
/** A review date cell written out the way the book writes it: an Excel serial
 *  as "5 Dec 2024", a month range as "Sep 2024 – Mar 2026". */
const dateText = (v: unknown): string | null => {
  if (v === null || text(v) === "") return null;
  if (typeof v === "number") { const t = serialToDate(v); return `${t.getUTCDate()} ${MON[t.getUTCMonth()]} ${t.getUTCFullYear()}`; }
  const toks = [...String(v).matchAll(/([a-z]{3,})[\s'-]*(\d{2,4})/gi)];
  const m = (tk: RegExpMatchArray) => {
    const i = MON.findIndex((x) => x.toLowerCase() === tk[1].slice(0, 3).toLowerCase());
    return i < 0 ? null : `${MON[i]} ${tk[2].length === 2 ? `20${tk[2]}` : tk[2]}`;
  };
  const a = toks.length ? m(toks[0]) : null, b = toks.length ? m(toks[toks.length - 1]) : null;
  if (!a || !b) return text(v);
  return a === b ? a : `${a} – ${b}`;
};

type Pos = (typeof BOOK_POSITIONS)[number] & {
  review?: boolean; valuedAtCost?: boolean;
  reviewSource?: { sheet: string; block: string; row: number };
};
const ALL = BOOK_POSITIONS as Pos[];
const REV = ALL.filter((p) => p.review === true);
const NONREV = ALL.filter((p) => p.review !== true);
const accById = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
const ownerOf = (p: Pos) => accById.get(p.accountId)?.owner ?? "";
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const rowsAt = (tab: string, row: number) => REV.filter((p) => p.reviewSource?.sheet === tab && p.reviewSource.row === row);

/** Every review line this suite finds, keyed `${tab}|${row}` — the set every
 *  review row in the book must point into. */
type Line = { tab: string; block: string; row: number; product: string; cost: number; value: number; carried: boolean };
const LINES = new Map<string, Line>();

// ───────────────────────────────────────────────────────────────────────────
console.log("\n1. The Private Investments tab: 87 lines, adding to its own Total");
const PI = "Private Investments";
const piHead = rowOf(PI, /^private equity$/i);
const piTotal = rowOf(PI, /^total$/i, Math.max(piHead, 1));
const piHeader = rowOf(PI, /^product$/i);
const piCost = colOf(PI, piHeader, /^investment at cost/i);
const piValue = colOf(PI, piHeader, /^market value/i);
const piRemark = colOf(PI, piHeader, /^remarks?$/i);
const piDate = colOf(PI, piHeader, /date investment range|investment date range/i);
ok("the tab's header, head and Total rows and its cost, value, remark and date columns are found by their own words",
  piHeader > 0 && piHead > piHeader && piTotal > piHead && [piCost, piValue, piRemark, piDate].every((c) => c >= 0),
  `header ${piHeader}, head ${piHead}, total ${piTotal}, cols ${piCost}/${piValue}/${piRemark}/${piDate}`);
const piLines: number[] = [];
for (let r = piHead + 1; r < piTotal; r++) if (text(cell(PI, r, 1))) piLines.push(r);
ok("the review lists 87 private investments between its head and its Total", piLines.length === 87, String(piLines.length));
// The Total's cost BY ITS HEADER: that row also carries a stray number (921871)
// in its date column, which a positional read takes for a figure.
const totalCost = num(cell(PI, piTotal, piCost)) * CRORE;
const totalValue = num(cell(PI, piTotal, piValue)) * CRORE;
ok("the 87 lines' cost adds to the Total row, to the rupee", Math.abs(sum(piLines.map((r) => num(cell(PI, r, piCost)) * CRORE)) - totalCost) <= 1,
  `${sum(piLines.map((r) => num(cell(PI, r, piCost)) * CRORE))} vs ${totalCost}`);
ok("…and that Total is ₹136.16 Cr", Math.abs(totalCost / CRORE - 136.159302888) < 1e-6, String(totalCost / CRORE));
ok("…and the lines' value adds to the Total's value", Math.abs(sum(piLines.map((r) => num(cell(PI, r, piValue)) * CRORE)) - totalValue) <= 1);

// ───────────────────────────────────────────────────────────────────────────
console.log("\n2. Every private investment is exactly one thing: carried, held elsewhere, listed since, or written off");
const carriedPI: number[] = [], writtenOff: number[] = [], listedSince: number[] = [], elsewhere: number[] = [];
{
  const bad: string[] = [];
  for (const r of piLines) {
    const product = text(cell(PI, r, 1));
    const cost = num(cell(PI, r, piCost)) * CRORE, value = num(cell(PI, r, piValue)) * CRORE;
    const remark = text(cell(PI, r, piRemark));
    const rows = rowsAt(PI, r);
    if (rows.length) {
      carriedPI.push(r);
      LINES.set(`${PI}|${r}`, { tab: PI, block: PI, row: r, product, cost, value, carried: true });
      const v = sum(rows.map((p) => p.marketValue)), c = sum(rows.map((p) => p.costBasis ?? 0));
      const tol = 1 + 0.01 * rows.length;
      if (Math.abs(v - value) > tol) bad.push(`${product}: book value ${v} vs the review's ${value}`);
      if (Math.abs(c - cost) > tol) bad.push(`${product}: book cost ${c} vs the review's ${cost}`);
      continue;
    }
    LINES.set(`${PI}|${r}`, { tab: PI, block: PI, row: r, product, cost, value, carried: false });
    if (/written off/i.test(remark)) writtenOff.push(r);
    else if (cost === 0 && value === 0) listedSince.push(r);
    else elsewhere.push(r);
  }
  ok("each carried line's book rows add to the review's own cost and value", bad.length === 0, bad.slice(0, 4).join("; "));
  ok("59 lines are carried", carriedPI.length === 59, String(carriedPI.length));
  const piRows = REV.filter((p) => p.reviewSource?.sheet === PI);
  ok("…as 71 book rows, one per holder", piRows.length === 71, String(piRows.length));
  ok("22 are written off", writtenOff.length === 22, String(writtenOff.length));
  ok("4 are now listed", listedSince.length === 4, String(listedSince.length));
  ok("2 are held elsewhere", elsewhere.length === 2, elsewhere.map((r) => text(cell(PI, r, 1))).join(", "));
  ok("…and together they are all 87, each once",
    new Set([...carriedPI, ...writtenOff, ...listedSince, ...elsewhere]).size === 87 &&
    carriedPI.length + writtenOff.length + listedSince.length + elsewhere.length === 87);
  // A line held at cost is a cost, never a gain: the review prints the same
  // figure in both columns and no measurement says the stake is worth more.
  const gained = piRows.filter((p) => p.valuedAtCost !== true || p.unrealizedPnL !== null || p.returnPct !== null || Math.abs(p.marketValue - (p.costBasis ?? NaN)) > 0.01);
  ok("every carried private investment is held at cost, with no gain and no return", gained.length === 0,
    gained.slice(0, 3).map((p) => p.security).join(", "));
}
{
  // WRITTEN OFF — a measured ₹0, listed with the review's own words and date.
  const listed = (BOOK_REVIEW_WRITTEN_OFF as { security: string; reviewRow: number; remark: string; dates: string | null }[]);
  const rowsListed = listed.map((w) => w.reviewRow).sort((a, b) => a - b);
  ok("the written-off lines are exactly the book's written-off list", rowsListed.join() === [...writtenOff].sort((a, b) => a - b).join(),
    `book ${rowsListed.join()}, review ${writtenOff.join()}`);
  const zero = writtenOff.filter((r) => num(cell(PI, r, piCost)) !== 0 || num(cell(PI, r, piValue)) !== 0);
  ok("…each at ₹0 cost and ₹0 value on the review — a measured zero", zero.length === 0, zero.join());
  const mismatch = listed.filter((w) => w.security !== text(cell(PI, w.reviewRow, 1)) || w.remark !== text(cell(PI, w.reviewRow, piRemark)) || w.dates !== dateText(cell(PI, w.reviewRow, piDate)));
  ok("…each listed under the review's own name, remark and date", mismatch.length === 0,
    mismatch.slice(0, 3).map((w) => `${w.security} (${w.dates} vs ${dateText(cell(PI, w.reviewRow, piDate))})`).join("; "));
  ok("…and no date is left as an Excel serial", listed.every((w) => !w.dates || !/^\d{5}$/.test(w.dates)));
}
{
  // LISTED SINCE — the review shows ₹0 because the shares now sit on a
  // statement; the book carries them from that statement and nowhere else.
  const unheld: string[] = [];
  for (const r of listedSince) {
    const s = stem(text(cell(PI, r, 1)));
    const onStatement = NONREV.some((p) => p.securityKey.replace(/-/g, "").startsWith(s)) ||
      BOOK_UNVALUED_HOLDINGS.some((u) => u.securityKey.replace(/-/g, "").startsWith(s));
    if (!s || !onStatement) unheld.push(text(cell(PI, r, 1)));
  }
  ok("each line listed since is a company a statement holds", unheld.length === 0, unheld.join(", "));
  ok("…and none of them is also a review row", listedSince.every((r) => rowsAt(PI, r).length === 0));
}
{
  // HELD ELSEWHERE — exactly two, each named, so a line that simply fell out
  // of the book cannot hide here.
  const names = elsewhere.map((r) => text(cell(PI, r, 1)));
  ok("the two lines held elsewhere are ESDS and Credit Fair", names.length === 2 && names.some((n) => /^ESDS$/.test(n)) && names.some((n) => /^Credit Fair/.test(n)),
    names.join(", "));
  const esdsHeld = NONREV.some((p) => /^esds/.test(p.securityKey)) || BOOK_UNVALUED_HOLDINGS.some((u) => /^esds/.test(u.securityKey));
  ok("ESDS is on a statement — ICICI Bank's NSDL account holds the shares", esdsHeld);
  const cf = elsewhere.find((r) => /^Credit Fair/.test(text(cell(PI, r, 1))));
  const DEBT = "Debt";
  const debtHeader = rowOf(DEBT, /^product$/i);
  const km = rowOf(DEBT, /k m global/i);
  const kmCost = num(cell(DEBT, km, colOf(DEBT, debtHeader, /^investment at cost/i))) * CRORE;
  const cfCost = cf ? num(cell(PI, cf, piCost)) * CRORE : NaN;
  ok("Credit Fair is the review's own K M Global credit line, which its Debt tab carries — counted there, once",
    !!cf && /k m global/i.test(text(cell(PI, cf, 1))) && km > 0 && cfCost > 0 && cfCost <= kmCost && rowsAt(DEBT, km).length === 1,
    `Credit Fair ${cfCost}, K M Global ${kmCost}`);
}

// ───────────────────────────────────────────────────────────────────────────
console.log("\n3. The PE funds, unlisted shares and private credit lines are carried, each to its own figures");
type Block = { tab: string; head: RegExp; txCategory: string };
const BLOCKS: Block[] = [
  { tab: "Alternate", head: /^pe funds$/i, txCategory: "PE Funds" },
  { tab: "Equity", head: /^direct equity - unlisted$/i, txCategory: "Direct Equity - Unlisted" },
  { tab: "Debt", head: /^pp structures$/i, txCategory: "PP Structures" },
];
// The Transactions tab, read by ITS header row — the purchases are what a line
// the review prints at ₹0 cost was actually paid.
const TX = "Transactions since inception";
const txHeader = rowOf(TX, /^investor$/i);
const txCol = (h: RegExp) => colOf(TX, txHeader, h);
const TXC = { investor: txCol(/^investor$/i), category: txCol(/^category$/i), product: txCol(/^product$/i), kind: txCol(/^transaction$/i),
  date: txCol(/^date$/i), qty: txCol(/^quantity$/i), rate: txCol(/^rate$/i), value: txCol(/^value$/i) };
ok("the Transactions tab's columns are found by their own headers", txHeader > 0 && Object.values(TXC).every((c) => c >= 0), JSON.stringify(TXC));
const txRows: { row: number; category: string; product: string; kind: string; date: number; qty: number | null; rate: number | null; value: number }[] = [];
for (let r = txHeader + 1; r <= lastRow(TX); r++) {
  const category = text(cell(TX, r, TXC.category));
  if (!BLOCKS.some((b) => b.txCategory === category)) continue;
  const q = cell(TX, r, TXC.qty), rt = cell(TX, r, TXC.rate);
  txRows.push({ row: r, category, product: text(cell(TX, r, TXC.product)), kind: text(cell(TX, r, TXC.kind)),
    date: num(cell(TX, r, TXC.date)), qty: typeof q === "number" ? q : null, rate: typeof rt === "number" ? rt : null, value: num(cell(TX, r, TXC.value)) });
}
let blockRows = 0;
for (const b of BLOCKS) {
  const header = rowOf(b.tab, /^product$/i);
  const head = rowOf(b.tab, b.head, header + 1);
  const cCost = colOf(b.tab, header, /^investment at cost/i), cValue = colOf(b.tab, header, /^market value/i);
  const headCost = num(cell(b.tab, head, cCost)) * CRORE, headValue = num(cell(b.tab, head, cValue)) * CRORE;
  // The block's lines follow its head until they add to the head's own figures.
  const lines: number[] = [];
  let c = 0, v = 0;
  for (let r = head + 1; r <= lastRow(b.tab) && (Math.abs(c - headCost) > 1 || Math.abs(v - headValue) > 1); r++) {
    if (!text(cell(b.tab, r, 1))) continue;
    lines.push(r);
    c += num(cell(b.tab, r, cCost)) * CRORE; v += num(cell(b.tab, r, cValue)) * CRORE;
  }
  ok(`${b.txCategory}: ${lines.length} line(s) under the ${b.tab} tab's head add to its cost and value`,
    head > 0 && lines.length > 0 && Math.abs(c - headCost) <= 1 && Math.abs(v - headValue) <= 1, `cost ${c} vs ${headCost}, value ${v} vs ${headValue}`);
  const bad: string[] = [];
  for (const r of lines) {
    const product = text(cell(b.tab, r, 1));
    const cost = num(cell(b.tab, r, cCost)) * CRORE, value = num(cell(b.tab, r, cValue)) * CRORE;
    LINES.set(`${b.tab}|${r}`, { tab: b.tab, block: b.txCategory, row: r, product, cost, value, carried: true });
    const rows = rowsAt(b.tab, r);
    blockRows += rows.length;
    if (!rows.length) { bad.push(`${product}: not carried`); continue; }
    const tol = 1 + 0.01 * rows.length;
    const bv = sum(rows.map((p) => p.marketValue)), bc = sum(rows.map((p) => p.costBasis ?? 0));
    if (Math.abs(bv - value) > tol) bad.push(`${product}: value ${bv} vs ${value}`);
    // Where the review prints no cost (Transition Venture, Assetgro), what was
    // paid is its own Transactions tab's purchases — never a figure invented.
    const paid = -sum(txRows.filter((t) => t.category === b.txCategory && t.product === product && /^purchase$/i.test(t.kind)).map((t) => t.value));
    const wantCost = cost > 1 ? cost : paid;
    if (!(wantCost > 0) || Math.abs(bc - wantCost) > tol) bad.push(`${product}: cost ${bc} vs ${wantCost}`);
    for (const p of rows) {
      if (p.valuedAtCost) {
        if (p.unrealizedPnL !== null || p.returnPct !== null || Math.abs(p.marketValue - (p.costBasis ?? NaN)) > 0.01) bad.push(`${p.security}: a gain on a line held at cost`);
      } else if (p.unrealizedPnL === null || Math.abs(p.unrealizedPnL - (p.marketValue - (p.costBasis ?? 0))) > 1) {
        bad.push(`${p.security}: unrealised ${p.unrealizedPnL} vs ${p.marketValue - (p.costBasis ?? 0)}`);
      }
    }
  }
  ok(`${b.txCategory}: every line is carried, at the review's own value and the cost it was paid`, bad.length === 0, bad.slice(0, 4).join("; "));
}

// ───────────────────────────────────────────────────────────────────────────
console.log("\n4. Nothing is counted twice, and nothing else is carried");
{
  const stray = REV.filter((p) => !p.reviewSource || !LINES.get(`${p.reviewSource.sheet}|${p.reviewSource.row}`)?.carried);
  ok("every review row in the book points at a private-market line of the review", stray.length === 0,
    stray.slice(0, 3).map((p) => `${p.security} → ${JSON.stringify(p.reviewSource)}`).join("; "));
  ok("…and there are 89 of them: 71 private investments and 18 PE fund, unlisted and credit rows",
    REV.length === 89 && REV.length === 71 + blockRows, `${REV.length} rows, ${blockRows} outside Private Investments`);
  const carried = [...LINES.values()].filter((l) => l.carried);
  ok("the review rows add to the carried lines' own value, to the rupee",
    Math.abs(sum(REV.map((p) => p.marketValue)) - sum(carried.map((l) => l.value))) <= 1 + 0.01 * REV.length,
    `${sum(REV.map((p) => p.marketValue))} vs ${sum(carried.map((l) => l.value))}`);
  // Every other private holding is a statement's, and none of them is a line the
  // review carries — or the same holding would be counted from both.
  const privOthers = NONREV.filter((p) => p.marketSide === "private");
  const lineStems = new Set([...LINES.values()].map((l) => stem(l.product)).filter(Boolean));
  const doubled = privOthers.filter((p) => lineStems.has(stem(p.security)));
  ok("no statement's private holding is also one of the review's private-market lines", doubled.length === 0,
    doubled.map((p) => p.security).join(", "));
  ok("the book's private side is the review rows plus those statement holdings, to the rupee",
    Math.abs(BOOK_SUMMARY.privateValue - sum(REV.map((p) => p.marketValue)) - sum(privOthers.map((p) => p.marketValue))) <= 1,
    `${BOOK_SUMMARY.privateValue} vs ${sum(REV.map((p) => p.marketValue)) + sum(privOthers.map((p) => p.marketValue))}`);
  ok("every review row is on the private side", REV.every((p) => p.marketSide === "private"));
  const keys = new Set(REV.map((p) => p.securityKey));
  const sharedPos = NONREV.filter((p) => keys.has(p.securityKey));
  const sharedUnv = BOOK_UNVALUED_HOLDINGS.filter((u) => keys.has(u.securityKey));
  ok("no statement row or unvalued holding shares a review row's key", sharedPos.length === 0 && sharedUnv.length === 0,
    [...sharedPos.map((p) => p.securityKey), ...sharedUnv.map((u) => u.securityKey)].join(", "));
  // What the review replaced is named, and gone from where it was.
  type Sup = { accountId: string; securityKey: string; kind: string; reviewLine: string };
  const sup = BOOK_REVIEW_SUPERSEDED as Sup[];
  const products = [...LINES.values()].map((l) => norm(l.product));
  const unnamed = sup.filter((s) => !products.some((p) => p.startsWith(norm(s.reviewLine))));
  ok("every superseded statement figure names the review line that replaced it", sup.length > 0 && unnamed.length === 0,
    unnamed.slice(0, 3).map((s) => s.reviewLine).join(", "));
  const back = sup.filter((s) =>
    (s.kind === "position" && NONREV.some((p) => p.accountId === s.accountId && p.securityKey === s.securityKey)) ||
    (s.kind === "unvalued" && BOOK_UNVALUED_HOLDINGS.some((u) => u.accountId === s.accountId && u.securityKey === s.securityKey)) ||
    (s.kind === "window" && (BOOK_SHARE_MOVEMENTS as Record<string, unknown>)[`${s.accountId}|${s.securityKey}`] !== undefined));
  ok("…and none of them is still in the book", back.length === 0, back.slice(0, 3).map((s) => `${s.kind} ${s.securityKey}`).join(", "));
}

// ───────────────────────────────────────────────────────────────────────────
console.log("\n5. Each member's share is the review's own Investorwise figure");
{
  const IW = "Investorwise Summary";
  const header = rowOf(IW, /^category$/i);
  const peRow = rowOf(IW, /^pe funds$/i, header + 1);
  const unlRow = rowOf(IW, /^direct equity - unlisted$/i, header + 1);
  const atCostRow = rowOf(IW, /^private equity \( at cost \)$/i, header + 1);
  ok("the summary's member columns and its three private-market rows are found", header > 0 && peRow > 0 && unlRow > 0 && atCostRow > 0);
  // A member column is a header that names a person or a trust; the trusts'
  // Roman numerals are the book's Arabic ones.
  const owners = [...new Set(BOOK_ACCOUNTS.map((a) => a.owner))];
  const members: { col: number; header: string; owner: string | null }[] = [];
  for (let c = 2; c < 30; c++) {
    const h = text(cell(IW, header, c));
    if (!h || /allocation/i.test(h)) continue;
    const n = norm(h).replace(/ iii$/, " 3").replace(/ ii$/, " 2");
    const w = n.split(" ");
    const owner = owners.find((o) => norm(o) === n) ??
      owners.find((o) => { const ow = norm(o).split(" "); return !/trust/.test(n) && !/trust/.test(norm(o)) && ow[0] === w[0] && ow[ow.length - 1] === w[w.length - 1]; }) ?? null;
    members.push({ col: c, header: h, owner });
  }
  const blockOf = (p: Pos) => p.reviewSource?.block;
  const book = (owner: string | null, f: (p: Pos) => boolean, v: (p: Pos) => number) =>
    owner ? sum(REV.filter((p) => ownerOf(p) === owner && f(p)).map(v)) : 0;
  const pe = members.map((m) => [m.header, num(cell(IW, peRow, m.col)) * CRORE, book(m.owner, (p) => blockOf(p) === "PE Funds", (p) => p.marketValue)] as const);
  const unl = members.map((m) => [m.header, num(cell(IW, unlRow, m.col)) * CRORE, book(m.owner, (p) => blockOf(p) === "Direct Equity - Unlisted", (p) => p.marketValue)] as const);
  const off = (xs: readonly (readonly [string, number, number])[]) => xs.filter(([, a, b]) => Math.abs(a - b) > 2);
  ok("PE funds by member: the book's rows are the review's own column for every member", off(pe).length === 0,
    off(pe).map(([h, a, b]) => `${h} ${a} vs ${b}`).join("; "));
  ok("unlisted shares by member: likewise", off(unl).length === 0, off(unl).map(([h, a, b]) => `${h} ${a} vs ${b}`).join("; "));
  ok("…and the book's members are all on the review — nothing is filed under a member it does not name",
    members.filter((m) => !m.owner).every((m) => num(cell(IW, peRow, m.col)) === 0 && num(cell(IW, unlRow, m.col)) === 0 && num(cell(IW, atCostRow, m.col)) === 0));
  // Private equity at cost: the book's own member rows never exceed the
  // review's, and what the review attributes and the book does not is exactly
  // the lines no document names a holder for, plus the two held elsewhere.
  const atCost = members.map((m) => [m.header, num(cell(IW, atCostRow, m.col)) * CRORE, book(m.owner, (p) => blockOf(p) === PI, (p) => p.costBasis ?? 0)] as const);
  ok("private equity at cost: no member holds more in the book than the review gives them", atCost.every(([, a, b]) => b <= a + 1),
    atCost.filter(([, a, b]) => b > a + 1).map(([h, a, b]) => `${h} ${a} vs ${b}`).join("; "));
  const gap = sum(atCost.map(([, a, b]) => a - b));
  const na = sum(REV.filter((p) => accById.get(p.accountId)?.ownerId === "not-attributed").map((p) => p.costBasis ?? 0));
  const away = sum(elsewhere.map((r) => num(cell(PI, r, piCost)) * CRORE));
  ok("…and the gap is the lines attributed to no member plus ESDS and Credit Fair, to the rupee",
    na > 0 && Math.abs(gap - na - away) <= 2, `gap ${gap}, not attributed ${na}, elsewhere ${away}`);
  ok("the lines attributed to no member are all private investments, held at cost",
    REV.filter((p) => accById.get(p.accountId)?.ownerId === "not-attributed").every((p) => p.reviewSource?.sheet === PI && p.valuedAtCost === true));
}

// ───────────────────────────────────────────────────────────────────────────
console.log("\n6. Every dated private-market flow is the review's own Transactions row");
{
  type Flow = { accountId: string; securityKey: string; security: string; date: string; kind: string; amount: number; units: number | null; rate: number | null; reviewRow: number };
  const flows = BOOK_REVIEW_FLOWS as Flow[];
  const want = txRows.filter((t) => !/^closing$/i.test(t.kind));
  ok("the book's review flows are exactly the review's non-closing private-market Transactions rows",
    flows.map((f) => f.reviewRow).sort((a, b) => a - b).join() === want.map((t) => t.row).sort((a, b) => a - b).join(),
    `${flows.length} flows, ${want.length} rows`);
  const kindOf = (k: string) => (/^purchase$/i.test(k) ? "purchase" : /^sale$/i.test(k) ? "sale" : /div|int/i.test(k) ? "income" : "?");
  const bad: string[] = [];
  for (const f of flows) {
    const t = want.find((x) => x.row === f.reviewRow);
    if (!t) continue;
    if (f.date !== isoOf(t.date)) bad.push(`row ${t.row}: date ${f.date} vs ${isoOf(t.date)}`);
    if (Math.abs(f.amount - Math.abs(t.value)) > 1) bad.push(`row ${t.row}: amount ${f.amount} vs ${Math.abs(t.value)}`);
    if (f.kind !== kindOf(t.kind)) bad.push(`row ${t.row}: kind ${f.kind} vs ${t.kind}`);
    // Units are kept to three decimals, the precision every statement in this
    // book prints them at; the review stores the raw float (5,751.296097…)
    // and displays it whole. Half the last kept decimal is the bound.
    if (f.kind !== "income" && !(f.units === null ? t.qty === null : t.qty !== null && Math.abs(f.units - t.qty) <= 0.0005))
      bad.push(`row ${t.row}: units ${f.units} vs ${t.qty}`);
    if ((f.rate ?? null) !== (t.rate ?? null)) bad.push(`row ${t.row}: rate ${f.rate} vs ${t.rate}`);
  }
  ok("each flow's date, amount, kind, units and rate are its row's", bad.length === 0, bad.slice(0, 4).join("; "));
  const pairs = new Set(REV.map((p) => `${p.accountId}|${p.securityKey}`));
  ok("each flow belongs to a review row the book carries", flows.every((f) => pairs.has(`${f.accountId}|${f.securityKey}`)));
  const carriedProducts = new Set([...LINES.values()].filter((l) => l.tab !== PI).map((l) => norm(l.product)));
  ok("…and to a PE fund, unlisted or credit line this suite found carried", want.every((t) => carriedProducts.has(norm(t.product))),
    want.filter((t) => !carriedProducts.has(norm(t.product))).map((t) => t.product).slice(0, 3).join(", "));
}

// ───────────────────────────────────────────────────────────────────────────
console.log("\n7. Every review row says where it came from");
{
  ok("each carries the review as its cost's source", REV.every((p) => p.costBasisSource === "review"));
  ok("each carries the date its value is struck on", REV.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(String(p.priceAsOf ?? ""))));
  const holders = BOOK_ACCOUNTS.filter((a) => (a as { reviewHolder?: boolean }).reviewHolder);
  ok("the review's own holder accounts say whose figures they are",
    holders.length > 0 && holders.every((a) => a.provider === "Consolidated review (MOPWM)" && a.accountNo === "MOPWM" && a.asOf === "2026-06-30"),
    holders.map((a) => `${a.accountId} ${a.provider} ${a.accountNo} ${a.asOf}`).join("; "));
  ok("…and hold nothing but review rows", ALL.filter((p) => holders.some((a) => a.accountId === p.accountId)).every((p) => p.review === true));
}

// ───────────────────────────────────────────────────────────────────────────
console.log("\n8. No name this dashboard keeps off its pages arrives through the review");
{
  const blob = JSON.stringify([REV, BOOK_REVIEW_FLOWS, BOOK_REVIEW_WRITTEN_OFF, BOOK_REVIEW_SUPERSEDED,
    BOOK_ACCOUNTS.filter((a) => (a as { reviewHolder?: boolean }).reviewHolder)]);
  ok("no review row, flow or list names the ring-fenced holding", !/polycab/i.test(blob));
  ok("…nor the register's sentinel", !/avendus/i.test(blob));
}

// ───────────────────────────────────────────────────────────────────────────
console.log("\n9. The review tab is gone — the review feeds the book instead");
{
  const gone = ["src/data/reviewPrivate.ts", "src/lib/reviewPrivate.ts", "src/components/ReviewPrivateTable.tsx", "scripts/build-review-private.mjs"];
  ok("the tab's module, table and generator are deleted", gone.every((f) => !existsSync(f)), gone.filter((f) => existsSync(f)).join(", "));
  const importers: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|mjs|js)$/.test(f) || p.endsWith("reviewBook.test.ts")) continue;
      if (/@\/data\/reviewPrivate\b|@\/lib\/reviewPrivate\b|ReviewPrivateTable/.test(readFileSync(p, "utf8"))) importers.push(p);
    }
  };
  walk("src");
  ok("nothing in the app reaches for them", importers.length === 0, importers.join(", "));
  const pm = readFileSync("src/pages/PrivateMarket.tsx", "utf8");
  const views = pm.slice(pm.indexOf("const BOOK_VIEWS"), pm.indexOf("];", pm.indexOf("const BOOK_VIEWS")));
  ok("Private Market's tabs are funds, owners and transactions — no review tab",
    /key: "funds"/.test(views) && /key: "owners"/.test(views) && /key: "transactions"/.test(views) && !/key: "review"/.test(views));
  ok("build-book reads the review — it is the book's private-market source now",
    /reviewBookLayer/.test(readFileSync("scripts/build-book.mjs", "utf8")) && REV.length > 0);
}

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall review-as-source checks passed");
