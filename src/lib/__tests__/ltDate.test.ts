// WHEN A LOT TURNS LONG-TERM, AND THE HOLD-TO-LTCG PLANNER LOT BY LOT (Stage 10fz).
//   npm run test:family
//
// Struck on constructed dates for the calendar rule and on the committed
// archive for the planner, whose expectations are re-expressed here from the
// lot registers' own rows rather than read back from the helper under test.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
import {
  istToday, longTermFrom, isLongTermOn, daysBetween, lotsForPosition, termSplitOn, plannerLots,
  HOLD_RATE_DIFFERENCE, UNLISTED_LT_MONTHS, type OpenLot,
} from "@/lib/ltDate";
import { deriveStockLedger, deriveIncome, type ArchiveDoc } from "@/lib/ledgerModel";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const inr = (n: number | null | undefined) => (n == null ? "null" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const near = (a: number | null | undefined, b: number, eps = 0.01) => typeof a === "number" && Math.abs(a - b) <= eps;

// ── 1. THE CALENDAR RULE ────────────────────────────────────────────────────
{
  ok("long-term from the day after the first anniversary", longTermFrom("2025-09-19") === "2026-09-20", String(longTermFrom("2025-09-19")));
  // LOAD-BEARING: purchase + 365 days lands one day early, and that is what the page used.
  const plus365 = new Date(Date.parse("2025-09-19") + 365 * 864e5).toISOString().slice(0, 10);
  ok("…which purchase + 365 days misses by a day", plus365 === "2026-09-19" && plus365 < longTermFrom("2025-09-19")!);
  ok("held exactly twelve months is still short-term (s.2(42A): not more than 12 months)",
    !isLongTermOn("2025-09-19", "2026-09-19") && isLongTermOn("2025-09-19", "2026-09-20"));
  ok("a 29 Feb purchase has its anniversary on 28 Feb, so it is long-term from 1 Mar",
    longTermFrom("2024-02-29") === "2025-03-01", String(longTermFrom("2024-02-29")));
  ok("a 28 Feb purchase before a leap day turns long-term on 29 Feb",
    longTermFrom("2023-02-28") === "2024-02-29", String(longTermFrom("2023-02-28")));
  ok("a month-end purchase is calendar months, not days", longTermFrom("2025-01-31") === "2026-02-01");
  ok("an unlisted share's mark is twenty-four months", longTermFrom("2024-02-29", UNLISTED_LT_MONTHS) === "2026-03-01");
  ok("an unparseable date has no long-term date", longTermFrom("31/03/2026") === null && longTermFrom(null) === null);
  ok("days between two ISO dates", daysBetween("2026-10-21", "2026-11-25") === 35);
  // TODAY IS INDIA'S DATE: 00:30 IST on 21 Oct is still 20 Oct in UTC.
  const t = Date.UTC(2026, 9, 20, 19, 0);
  ok("today is the IST date, a day ahead of UTC between 00:00 and 05:30 IST",
    istToday(t) === "2026-10-21" && new Date(t).toISOString().slice(0, 10) === "2026-10-20", istToday(t));
  ok("…and the same date after 05:30 IST", istToday(Date.UTC(2026, 9, 21, 6, 0)) === "2026-10-21");
}

// ── the archive, read off disk ───────────────────────────────────────────────
const ROOT = path.join(process.env.GLOW_FIXTURES ?? "src/lib/__tests__/fixtures", "../../../..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "public/audit/manifest.json"), "utf8"));
const docs: ArchiveDoc[] = manifest.map((d: { docKey: string }) =>
  JSON.parse(readFileSync(path.join(ROOT, "public/audit", d.docKey, "document.json"), "utf8")));
const accounts = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
const ledgerCache = new Map<string, OpenLot[]>();
const lotsFor = (key: string) => {
  if (!ledgerCache.has(key)) ledgerCache.set(key, deriveStockLedger(docs, key).openLots);
  return ledgerCache.get(key)!;
};

// ── 2. THE REGISTERS' LOTS, AS THE BOOK READS THEM ──────────────────────────
{
  // Transrail is on LKP's June AND July registers; the book reads the newest
  // issue only, so its lots are two, not four.
  const tr = lotsFor("transrail-lighting");
  ok("a lot register restates: the newest issue's lots only", tr.length === 2 && tr.every((l) => l.registerDate === "2026-07-31"),
    tr.map((l) => `${l.purchaseDate}@${l.registerDate}`).join(", "));
  // Every position the book splits has lots that reconcile, under the same gate.
  const dated = BOOK_POSITIONS.filter((p) => p.stCostBasis != null || p.ltCostBasis != null);
  const joined = dated.filter((p) => lotsForPosition(p, accounts.get(p.accountId), lotsFor(p.securityKey)));
  ok("every position the book dates joins its register's lots", dated.length > 0 && joined.length === dated.length,
    `${joined.length} of ${dated.length}`);
  ok("…and each joined set's cost is the book's own split, to the paisa", joined.every((p) => {
    const lots = lotsForPosition(p, accounts.get(p.accountId), lotsFor(p.securityKey))!;
    return near(lots.reduce((s, l) => s + l.totalCost, 0), (p.stCostBasis ?? 0) + (p.ltCostBasis ?? 0), 0.05);
  }));
  // THE GATE: Belrise's register carries 6,500 units against a holding of 12,500.
  const bel = BOOK_POSITIONS.find((p) => p.securityKey === "belrise-industries" && p.accountId === "lkp-securities-98245");
  if (bel) {
    ok("a register that does not account for the units held joins nothing",
      lotsForPosition(bel, accounts.get(bel.accountId), lotsFor("belrise-industries")) === null,
      `held ${bel.quantity}, lots ${lotsFor("belrise-industries").reduce((s, l) => s + l.quantity, 0)}`);
  } else console.log("NOT CHECKED the reconciliation gate on Belrise — no such LKP position on this book");
}

// ── 3. THE TERM, RE-AGED TO TODAY ───────────────────────────────────────────
{
  const tr = BOOK_POSITIONS.find((p) => p.securityKey === "transrail-lighting" && p.accountId === "lkp-securities-98245");
  const lots = tr ? lotsForPosition(tr, accounts.get(tr.accountId), lotsFor("transrail-lighting")) : null;
  if (tr && lots) {
    const atStatement = termSplitOn(lots, "2026-03-31", tr)!, now = termSplitOn(lots, "2026-10-21", tr)!;
    ok("Transrail is wholly short-term at LKP's 31 Mar statement, as the book splits it",
      near(atStatement.st, tr.stCostBasis ?? NaN) && atStatement.lt === 0, `${inr(atStatement.st)} ST`);
    ok("…and wholly long-term today: both lots crossed on 11 and 18 Sep 2026",
      now.st === 0 && near(now.lt, (tr.stCostBasis ?? 0) + (tr.ltCostBasis ?? 0)) && now.nextLT === null,
      `${inr(now.lt)} LT`);
  } else console.log("NOT CHECKED Transrail's re-aging — not on this book");
  // ATHER: dated on V.E.C 128004 only; V.E.C 128005 issues no register. The
  // split is over the dated row, and the other is unknown — never short-term.
  const ather = BOOK_POSITIONS.filter((p) => p.securityKey === "ather-energy");
  const split = ather.filter((p) => p.stCostBasis != null || p.ltCostBasis != null);
  const unknown = ather.filter((p) => p.stCostBasis == null && p.ltCostBasis == null);
  if (split.length && unknown.length) {
    const lt = split.reduce((s, p) => s + termSplitOn(lotsForPosition(p, accounts.get(p.accountId), lotsFor("ather-energy"))!, "2026-10-21", p)!.lt, 0);
    const splitCost = split.reduce((s, p) => s + (p.costBasis ?? 0), 0);
    const allCost = ather.reduce((s, p) => s + (p.costBasis ?? 0), 0);
    ok("Ather: long-term is 100% of the cost a register dates", near(lt / splitCost, 1, 1e-9), `${inr(lt)} of ${inr(splitCost)}`);
    // LOAD-BEARING: over every account's cost the same figure read 23%, and
    // the remainder was labelled short-term.
    ok("…where over every account's cost it would read 23% and call the rest short-term",
      Math.round((lt / allCost) * 100) === 23, `${((lt / allCost) * 100).toFixed(1)}%`);
  } else console.log("NOT CHECKED Ather's split — not held on both a dated and an undated account on this book");
}

// ── 4. THE PLANNER, LOT BY LOT ──────────────────────────────────────────────
{
  const today = "2026-10-21";
  const rows = BOOK_POSITIONS.filter((p) => p.stCostBasis != null || p.ltCostBasis != null).flatMap((p) => {
    const lots = lotsForPosition(p, accounts.get(p.accountId), lotsFor(p.securityKey));
    return lots ? [{ position: p, statementDate: accounts.get(p.accountId)!.asOf, lots }] : [];
  });
  const plan = plannerLots(rows, today);
  // Re-expressed off the registers: a lot still short-term today at a gain.
  let expected = 0, lotsN = 0;
  const names = new Set<string>();
  for (const { position: p, lots } of rows) {
    for (const l of lots) {
      const [y, m, d] = l.purchaseDate.split("-").map(Number);
      const anniv = new Date(Date.UTC(y + 1, m - 1, Math.min(d, new Date(Date.UTC(y + 1, m, 0)).getUTCDate())));
      const ltFrom = new Date(anniv.getTime() + 864e5).toISOString().slice(0, 10);
      const gain = l.quantity * (p.currentPrice as number) - l.totalCost;
      if (ltFrom > today && gain > 0) { expected += gain * 0.075; lotsN++; names.add(p.securityKey); }
    }
  }
  const total = plan.candidates.reduce((s, c) => s + c.saving, 0);
  ok("the saving is the sum over short-term lots at a gain, re-expressed from the registers", near(total, expected, 1),
    `helper ${inr(total)} · re-expressed ${inr(expected)}`);
  ok("…over four lots in three holdings on the 7 Oct V.E.C register", plan.candidates.length === lotsN && lotsN === 4 && names.size === 3,
    `${plan.candidates.length} lots · ${names.size} names`);
  ok("…≈ ₹1.04 L", Math.round(total / 1000) === 104, inr(total));
  const greaves = plan.candidates.find((c) => c.securityKey === "greaves-cotton");
  ok("Greaves Cotton's short-term lot saves its own gain's rate difference, ₹43,555",
    !!greaves && greaves.purchaseDate === "2026-05-25" && near(greaves.saving, 580726.83 * HOLD_RATE_DIFFERENCE, 1) && greaves.ltDate === "2027-05-26",
    greaves ? `${inr(greaves.saving)} · LT ${greaves.ltDate}` : "missing");
  // LOAD-BEARING: per POSITION, the planner took Greaves' net +₹4.55 L and
  // dropped Shoppers Stop and Tejas Networks, net losers whose short-term lots
  // are winners. The old figure must differ, or this suite would pass on it.
  const perPosition = BOOK_POSITIONS.filter((p) => p.daysToLT != null && typeof p.unrealizedPnL === "number" && p.unrealizedPnL > 0)
    .reduce((s, p) => s + (p.unrealizedPnL as number) * HOLD_RATE_DIFFERENCE, 0);
  ok("the position rule's figure differs from the lot rule's by more than ₹50,000",
    Math.abs(perPosition - total) > 5e4, `per position ${inr(perPosition)} · per lot ${inr(total)}`);
  const netLosers = plan.candidates.filter((c) => {
    const p = BOOK_POSITIONS.find((x) => x.accountId === c.accountId && x.securityKey === c.securityKey)!;
    return (p.unrealizedPnL ?? 0) < 0;
  });
  ok("a holding at a net loss with a short-term lot at a gain is on the planner",
    new Set(netLosers.map((c) => c.securityKey)).size === 2 && netLosers.some((c) => c.securityKey === "shoppers-stop")
    && netLosers.some((c) => c.securityKey === "tejas-networks"));
  ok("every candidate is still short-term today and every saving is the rate difference on its own gain",
    plan.candidates.every((c) => c.ltDate > today && c.daysLeft === daysBetween(today, c.ltDate) && near(c.saving, c.gain * 0.075, 1e-6) && c.gain > 0));
  // A lot short-term at its statement and long-term now is CROSSED; a holding
  // with a crossed lot and a short-term one is on both sides.
  const constructed = plannerLots([{
    position: { accountId: "a", securityKey: "s", security: "S", currentPrice: 200 },
    statementDate: "2026-03-31",
    lots: [
      { accountNo: "1", provider: "P", registerDate: "2026-03-31", purchaseDate: "2025-09-10", quantity: 10, totalCost: 1000 },
      { accountNo: "1", provider: "P", registerDate: "2026-03-31", purchaseDate: "2026-02-01", quantity: 10, totalCost: 1000 },
      { accountNo: "1", provider: "P", registerDate: "2026-03-31", purchaseDate: "2026-03-01", quantity: 10, totalCost: 5000 },
    ],
  }], "2026-10-21");
  ok("constructed: a crossed lot, a short-term winner and a short-term loser in one holding",
    constructed.crossed.length === 1 && constructed.crossed[0].purchaseDate === "2025-09-10"
    && constructed.candidates.length === 1 && constructed.candidates[0].ltDate === "2027-02-02" && near(constructed.candidates[0].gain, 1000)
    && constructed.shortTermAtLoss === 1);
}

// ── 5. ONE DOCUMENT'S REPEATS ARE DATA; A REPEAT ACROSS TWO IS A DUPLICATE ─
{
  const base = docs.find((d) => d.reportType === "dividend-statement" && (d.income ?? []).some((e) => /^dividend$/i.test(e.kind)))!;
  const ev = base.income!.find((e) => /^dividend$/i.test(e.kind))!;
  const one = { ...base, docKey: "t-1", income: [ev, { ...ev }] };
  const reissue = { ...base, docKey: "t-2", asOf: "2099-01-01", income: [{ ...ev, receivedDate: "2099-01-02" }, { ...ev, receivedDate: "2099-01-02" }] };
  const single = { ...base, docKey: "t-3", asOf: "2099-02-01", income: [{ ...ev, receivedDate: "2099-02-02" }] };
  ok("two identical dividends one document prints are both kept", deriveIncome([one]).cash.length === 2);
  ok("…and a later issue reprinting them with a received date adds none", deriveIncome([one, reissue]).cash.length === 2);
  ok("…while one event on two issues is one", deriveIncome([single, { ...single, docKey: "t-4", asOf: "2099-03-01", income: [{ ...ev, receivedDate: "2099-03-02" }] }]).cash.length === 1);
}

if (fails) { console.log(`\n${fails} failure(s)`); process.exit(1); }
console.log("\nPASS lot terms, the IST date and the hold-to-LTCG planner");
