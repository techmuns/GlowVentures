// WHAT A MANDATE'S HOLDINGS COST, AGAINST WHAT WAS PAID IN.   npm run test:family
//
// DSM-C6 in the audit: the Invested tile (cost of what is held) and the capital
// card (paid in less taken out) are two figures with nothing tying them. On a
// whole mandate FIFO ties them exactly — cost held = paid in − taken out +
// realised — and the page publishes that tie only where it holds.
//
// Anchored on the COMMITTED book: each PMS account's rows, its own capital
// record and FIFO over the account exactly as the mandate page calls it. The
// cost is re-summed here off the rows, never read back from the helper.
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
import { fifoTotals } from "@/lib/fifo";
import { investedReconciliation } from "@/lib/mandateCapital";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const cap = { contributed: 10_00_00_000, withdrawn: 50_00_000 };

console.log("── constructed ──");
ok("the three tie: 10 Cr in − 0.5 Cr out + 1.2 Cr realised = 10.7 Cr held",
  investedReconciliation({ costHeld: 10_70_00_000, uncostedRows: 0, capital: cap, realised: 1_20_00_000, wholeMandate: true })?.realised === 1_20_00_000);
ok("a row with no cost refuses it — its cost would be counted as a gain",
  investedReconciliation({ costHeld: 10_70_00_000, uncostedRows: 1, capital: cap, realised: 1_20_00_000, wholeMandate: true }) === null);
ok("a part of a mandate refuses it — a filtered set has no capital of its own",
  investedReconciliation({ costHeld: 10_70_00_000, uncostedRows: 0, capital: cap, realised: 1_20_00_000, wholeMandate: false }) === null);
ok("no capital record refuses it",
  investedReconciliation({ costHeld: 10_70_00_000, uncostedRows: 0, capital: null, realised: 1_20_00_000, wholeMandate: true }) === null);
ok("three figures that do not tie are never printed as though they did",
  investedReconciliation({ costHeld: 10_70_00_000, uncostedRows: 0, capital: cap, realised: 1_00_00_000, wholeMandate: true }) === null);

console.log("── the committed book, every PMS mandate with a capital record ──");
let tied = 0, refused = 0; const wrong: string[] = [];
for (const a of BOOK_ACCOUNTS.filter((x) => x.engagement === "PMS" && (x.capital?.contributed ?? 0) > 0)) {
  const rows = BOOK_POSITIONS.filter((p) => p.accountId === a.accountId);
  const f = fifoTotals(rows, { accounts: BOOK_ACCOUNTS, universe: rows });
  const costed = rows.filter((p) => typeof p.costBasis === "number");
  const uncosted = rows.length - costed.length;
  const costHeld = costed.length ? costed.reduce((s, p) => s + (p.costBasis as number), 0) : null;
  const r = investedReconciliation({ costHeld, uncostedRows: uncosted, capital: a.capital, realised: f.realised,
    wholeMandate: f.wholeMandates.includes(a.accountId) });
  if (r) {
    tied++;
    // Re-expressed: what the manager banked is what the holdings cost beyond
    // the net capital — and it is FIFO's own realised for the whole mandate.
    const banked = (costHeld as number) - a.capital!.contributed + a.capital!.withdrawn;
    if (Math.abs(banked - r.realised) > 1 || r.costHeld !== costHeld || r.paidIn !== a.capital!.contributed) wrong.push(a.accountId);
  } else {
    refused++;
    if (uncosted === 0 && f.wholeMandates.includes(a.accountId)) wrong.push(`${a.accountId} refused although every row reports a cost`);
  }
}
ok("every whole, fully costed mandate is reconciled, and each tie is its own rows' arithmetic", wrong.length === 0 && tied > 0,
  `${tied} tied, ${refused} refused${wrong.length ? `; wrong: ${wrong.join(", ")}` : ""}`);
{
  // Load-bearing: the two figures the audit found apart ARE different on this book.
  const svan = BOOK_ACCOUNTS.find((x) => x.engagement === "PMS" && /SVAN/i.test(x.provider) && (x.capital?.contributed ?? 0) > 0);
  const rows = svan ? BOOK_POSITIONS.filter((p) => p.accountId === svan.accountId) : [];
  const cost = rows.reduce((s, p) => s + (p.costBasis ?? 0), 0);
  const net = svan ? svan.capital!.contributed - svan.capital!.withdrawn : 0;
  ok("the cost held and the net capital differ by more than the printing precision — or there would be nothing to reconcile",
    !!svan && Math.abs(cost - net) > 5_00_000, svan ? `${svan.accountId}: cost ${(cost / 1e7).toFixed(2)} Cr vs net ${(net / 1e7).toFixed(2)} Cr` : "no SVAN mandate");
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
if (fails) process.exit(1);
