// ONE REALISED FIGURE PER COMPANY PAGE, ON THE BOOK'S FIELD.   npm run test:family
//
// DL-6 in the audit. The stock page's Realised tile read the runtime ledger —
// every capital-gain lot for the name — while the FIFO return beside it read the
// book, which strikes each holding's realised gain up to its OWN statement's
// date. LKP's Belrise printed +₹6.6 L "booked on exits" on units the page still
// showed as held.
//
// Two halves:
//   • CONSTRUCTED rows, one per rule, so each rule is exercised whatever the
//     book happens to contain;
//   • THE COMMITTED BOOK against the REAL ledger loaders, served off disk the
//     way `ledgerJoins.test.ts` serves them — so the claim "the tile never adds
//     a sale dated after the statement" is struck on the names where the ledger
//     genuinely counts one, and is shown to be load-bearing there.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_POSITIONS } from "@/data/glowData";
import { realisedTile, type RealisedRow } from "@/lib/stockRealised";
import type { Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const row = (realizedPnL: number | null, extra: Partial<RealisedRow> = {}): RealisedRow => ({ realizedPnL, ...extra });

console.log("── constructed ──");
{
  const t = realisedTile([], 5_00_000);
  ok("a name the book no longer holds reads the capital gain statements' lots", t.value === 5_00_000 && t.basis === "statements" && t.unreconciled === null);
  ok("…and while those are loading it has no figure yet", realisedTile([], undefined).value === null);
  ok("…and where no statement covers it, none", realisedTile([], null).value === null && realisedTile([], null).source === null);
}
{
  // LKP's Belrise: nothing sold before the 31 March statement, one lot after it.
  const t = realisedTile([row(0, { realizedLotsAfter: 1 })], 6_57_636);
  ok("a sale after the statement is counted and not added", t.value === 0 && t.lotsAfter === 1 && t.basis === "book");
  ok("…and the ledger's figure, which includes it, is not called a gap", t.unreconciled === null);
}
{
  // The book's measured ₹0 against lots the statements carry and no later sale
  // explains — a lot that did not join the holding it was sold from.
  const t = realisedTile([row(0), row(0)], 8_62_231.63);
  ok("a difference no after-statement sale explains is named, never hidden", t.value === 0 && t.unreconciled === 8_62_231.63);
  ok("…and a rupee of rounding is not a difference", realisedTile([row(100.4)], 100) .unreconciled === null);
}
{
  const t = realisedTile([row(null)], 70_000);
  ok("a holding the book carries no realised for, while the statements carry lots, names them", t.value === null && t.unreconciled === 70_000);
}
{
  // 3P: FIFO over the fund's own dated unit record; no capital gain statement.
  const t = realisedTile([row(2_56_09_033.87, { costBasisSource: "fifo" })], null);
  ok("a fund's redemption is struck from its own unit record, and says so", t.value === 2_56_09_033.87 && t.source === "unit-record");
  ok("…and the ledger's silence about it is not a gap — the ledger reads capital-gain lots only", t.unreconciled === null);
  const both = realisedTile([row(1000, { costBasisSource: "fifo" }), row(500)], 500);
  ok("two rows on two records say both", both.source === "mixed" && both.value === 1500 && both.unreconciled === null);
}
{
  ok("a measured ₹0 over a statement stays a figure", realisedTile([row(0)], null).value === 0 && realisedTile([row(0)], null).source === "capital-gains");
  ok("no row carrying a figure is no figure, never ₹0", realisedTile([row(null), row(null)], null).value === null && realisedTile([row(null)], null).source === null);
}
{
  // A REALISED STRUCK ON SOME OF THE ACCOUNTS: State Bank of India's shape —
  // two accounts with a capital gain statement and no sale, three with none.
  const sbi = realisedTile([
    row(0, { accountId: "gl-1", costOfUnitsSold: 0 }), row(0, { accountId: "gl-2", costOfUnitsSold: 0 }),
    row(null, { accountId: "gs-1" }), row(null, { accountId: "gs-2" }), row(null, { accountId: "mo-1" }),
  ], null);
  ok("a realised on some of the accounts counts the accounts it covers, and the accounts that hold it", sbi.value === 0 && sbi.covered === 2 && sbi.accounts === 5);
  ok("…and a zero where nothing was sold is named as that", sbi.nothingSold === true);
  const sold = realisedTile([row(0, { accountId: "a", costOfUnitsSold: 1_00_000 }), row(0, { accountId: "b", costOfUnitsSold: 0 })], null);
  ok("a zero after a sale that broke even is not called nothing sold", sold.value === 0 && sold.nothingSold === false);
  const unstated = realisedTile([row(0, { accountId: "a" })], null);
  ok("…and a zero whose cost of units sold is not reported is not called nothing sold either", unstated.nothingSold === false);
  const two = realisedTile([row(10, { accountId: "a" }), row(5, { accountId: "a" })], null);
  ok("two rows in one account are one account", two.accounts === 1 && two.covered === 1);
  const none = realisedTile([], 5);
  ok("a name the book no longer holds covers no accounts of its own", none.accounts === 0 && none.covered === 0 && none.nothingSold === false);
}
{
  // THE BOOK: every holding whose realised is on some of its accounts, counted
  // the way the page counts them — distinct accounts, each dedupeGroup once.
  const byK = new Map<string, Position[]>();
  for (const p of BOOK_POSITIONS as Position[]) (byK.get(p.securityKey) ?? byK.set(p.securityKey, []).get(p.securityKey)!).push(p);
  let partial = 0;
  const bad: string[] = [];
  for (const [key, ps] of byK) {
    const seen = new Set<string>();
    const rows = ps.filter((p) => !p.dedupeGroup || (!seen.has(p.dedupeGroup) && !!seen.add(p.dedupeGroup)));
    const t = realisedTile(rows, null);
    const carry = rows.filter((p) => typeof p.realizedPnL === "number");
    const wantCovered = new Set(carry.map((p) => p.accountId)).size, wantAccounts = new Set(rows.map((p) => p.accountId)).size;
    if (t.covered !== wantCovered || t.accounts !== wantAccounts) bad.push(key);
    if (carry.length && t.covered < t.accounts) partial++;
  }
  ok("every holding's coverage is its distinct accounts, and the book has holdings struck on some of theirs", bad.length === 0 && partial > 0, `${partial} partial${bad.length ? `; wrong: ${bad.slice(0, 3).join(", ")}` : ""}`);
}

// ── the committed book, against the real ledger ─────────────────────────────
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
(import.meta as { env?: Record<string, string> }).env ??= { BASE_URL: "/" };
const L = await import("@/lib/ledger");

console.log("\n── the book, against the ledger ──");
const byKey = new Map<string, Position[]>();
for (const p of BOOK_POSITIONS as Position[]) (byKey.get(p.securityKey) ?? byKey.set(p.securityKey, []).get(p.securityKey)!).push(p);
const once = (ps: Position[]) => { const seen = new Set<string>(); return ps.filter((p) => !p.dedupeGroup || (!seen.has(p.dedupeGroup) && !!seen.add(p.dedupeGroup))); };
const bookSum = (ps: Position[]) => {
  const v = ps.map((p) => p.realizedPnL).filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

let after = 0, afterDiffers = 0, flagged = 0, loaded = 0;
const afterBad: string[] = [], flagBad: string[] = [], valueBad: string[] = [];
for (const [key, ps] of byKey) {
  const rows = once(ps);
  const led = await L.loadStockLedger(key);
  if (led) loaded++;
  const lr = led?.realizedProfit ?? null;
  const t = realisedTile(rows, lr);
  const book = bookSum(rows);
  if ((t.value ?? null) !== (book ?? null) && !(t.value != null && book != null && Math.abs(t.value - book) < 1e-6)) valueBad.push(key);
  const lotsAfter = rows.reduce((s, p) => s + (p.realizedLotsAfter ?? 0), 0);
  if (lotsAfter > 0) {
    after++;
    if (lr != null && Math.abs((book ?? 0) - lr) > 1) afterDiffers++;
    if (t.lotsAfter !== lotsAfter || t.unreconciled !== null) afterBad.push(key);
  }
  if (t.unreconciled !== null) {
    flagged++;
    // Independent of the helper: the ledger's lot total and the book's own
    // statement-struck figure really do differ for every name it flags.
    const fromCg = bookSum(rows.filter((p) => p.costBasisSource !== "fifo"));
    if (lr == null || (fromCg != null && Math.abs(fromCg - lr) <= 1)) flagBad.push(key);
  }
}
ok("the committed archive loads through the real ledger", loaded > 0, `${loaded} names`);
ok("wherever the book carries the holding, the tile is the book's own realised", valueBad.length === 0, valueBad.slice(0, 5).join(", "));
ok("every holding with sales after its statement counts them and flags nothing", after > 0 && afterBad.length === 0,
  `${after} names${afterBad.length ? `; wrong on ${afterBad.slice(0, 5).join(", ")}` : ""}`);
// LOAD-BEARING: on at least one of those names the ledger's figure genuinely
// differs from the book's — so the rule above is doing work on this book, not
// passing over names where the two happen to agree.
ok("…and on those names the ledger's figure really does include the later sales", afterDiffers > 0, `${afterDiffers} of ${after}`);
ok("every name the tile flags is one whose statements' lots and the book's figure disagree", flagBad.length === 0,
  `${flagged} flagged${flagBad.length ? `; wrongly: ${flagBad.join(", ")}` : ""}`);
{
  const fund = [...byKey.entries()].find(([, ps]) => ps.some((p) => p.costBasisSource === "fifo" && (p.realizedPnL ?? 0) !== 0));
  if (!fund) ok("a fund's unit-record realised is on the book", false);
  else {
    const t = realisedTile(once(fund[1]), (await L.loadStockLedger(fund[0]))?.realizedProfit ?? null);
    ok("a fund's redemption realised says it comes from the fund's own record, and is not flagged", t.source === "unit-record" && t.unreconciled === null, fund[0]);
  }
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
if (fails) process.exit(1);
