// THE FAMILY-INPUT ARITHMETIC, CHECKED.  npm run test:family
//
// Everything the family enters is a primitive; everything on screen beside it is
// derived. These are the derivations, and every case here is one where the
// WRONG answer would look entirely plausible on a dashboard:
//
//   • a deal with no drawdowns recorded reporting ₹0 invested and its whole
//     commitment as outstanding cash to find
//   • a 0% target weight read as "not set" instead of "sell it all", or the
//     reverse — an unset target read as 0% and rendered as an instruction to
//     liquidate the position
//   • cash with no outflow schedule reported as unlimited liquidity coverage, or
//     a schedule with no cash reported as zero months
//   • a quarterly outflow counted once a year instead of four times
//   • a total that silently spans 3 of 4 rows and reads as complete
//
// None of these throws. Each returns a number, and the number is wrong. That is
// why they are asserted rather than left to a type checker.
import { deriveDeal, summarise, emptyDeal, coerceDeal } from "@/lib/deals";
import { viewHousehold, outflowsWithin, liquidityMonths, coerceHousehold, emptyAsset } from "@/lib/household";
import { pendingToInvest, parseWeightPct } from "@/lib/watchlist";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};

// ── deals ───────────────────────────────────────────────────────────────────
const d = {
  ...emptyDeal(), company: "Acme", committed: 12_00_00_000,
  tranches: [
    { id: "a", date: "2024-04-20", amount: 5_00_00_000, note: "" },
    { id: "b", date: "2025-01-10", amount: 4_00_00_000, note: "" },
    { id: "c", date: "2025-06-01", amount: null, note: "not yet called" },
  ],
  lastRoundValuation: 180_00_00_000, stakePctPostRaise: 4.7,
  rounds: [{ id: "r", name: "B", date: "2025-01-01", valuation: 180_00_00_000, investors: "", amountInvested: null, kind: "" as const, capTable: "" }],
  docs: [
    { id: "d1", title: "SHA", kind: "Agreement" as const, dated: "2024-04-20", location: "" },
    { id: "d2", title: "Q1 MIS", kind: "MIS" as const, dated: "2026-04-30", location: "" },
    { id: "d3", title: "Q2 MIS", kind: "MIS" as const, dated: "2026-07-31", location: "" },
  ],
};
const x = deriveDeal(d);
eq("invested = 5cr + 4cr, null tranche skipped", x.invested, 9_00_00_000);
eq("pending = 12cr - 9cr", x.pending, 3_00_00_000);
eq("drawn%", Number(x.drawnPct!.toFixed(4)), 75);
eq("first drawdown", x.firstInvestedOn, "2024-04-20");
eq("last drawdown", x.lastInvestedOn, "2025-06-01");
eq("latest MIS is the newest", x.latestMis!.dated, "2026-07-31");
eq("stake value = 4.7% x 180cr", x.stakeValuePostRaise, 0.047 * 180_00_00_000);
eq("moic = stakeValue / invested", Number(x.moic!.toFixed(6)), Number((0.047 * 180_00_00_000 / 9_00_00_000).toFixed(6)));

const noTranche = deriveDeal({ ...emptyDeal(), company: "B", committed: 5_00_00_000 });
eq("no tranches -> invested null, NOT 0", noTranche.invested, null);
eq("no tranches -> pending null, NOT the whole commitment", noTranche.pending, null);

const noStake = deriveDeal({ ...emptyDeal(), company: "C", lastRoundValuation: 100, stakePctPostRaise: null });
eq("valuation without stake -> no value", noStake.stakeValuePostRaise, null);
const zeroStake = deriveDeal({ ...emptyDeal(), company: "D", lastRoundValuation: 100, stakePctPostRaise: 0 });
eq("0% stake is a MEASUREMENT and gives 0", zeroStake.stakeValuePostRaise, 0);

const s = summarise([d, { ...emptyDeal(), company: "B", committed: 5_00_00_000 }]);
eq("committed total over 2 of 2", [s.committed.total, s.committed.of], [17_00_00_000, 2]);
eq("invested total over 1 of 2 rows", [s.invested.total, s.invested.of], [9_00_00_000, 1]);
eq("pending covers only the deal with both sides", [s.pending.total, s.pending.of], [3_00_00_000, 1]);

eq("deal with no company is dropped", coerceDeal({ committed: 5 }), null);
eq("negative amount is not recorded", coerceDeal({ company: "X", committed: -5 })!.committed, null);
eq("stake over 100 rejected", coerceDeal({ company: "X", stakeFdPct: 140 })!.stakeFdPct, null);
eq("stake of 0 kept", coerceDeal({ company: "X", stakeFdPct: 0 })!.stakeFdPct, 0);

// ── household ───────────────────────────────────────────────────────────────
const h = coerceHousehold({
  assets: [
    { ...emptyAsset(), label: "HDFC current", kind: "cash", amount: 2_00_00_000, liquid: true, owner: "" },
    { ...emptyAsset(), label: "Worli flat", kind: "property", amount: 30_00_00_000, liquid: false, owner: "Ajay" },
    { ...emptyAsset(), label: "Trust corpus", kind: "cash", amount: 3_00_00_000, liquid: true, charity: true, owner: "" },
    { ...emptyAsset(), label: "No amount yet", kind: "property", amount: null, owner: "" },
  ],
  liabilities: [{ label: "LAP", kind: "loan", amount: 8_00_00_000, owner: "Ajay" }],
  outflows: [
    { label: "School fees", dueOn: "2026-09-01", amount: 10_00_000, everyMonths: 3 },
    { label: "Advance tax", dueOn: "2026-12-15", amount: 50_00_000, everyMonths: null },
    { label: "Long past", dueOn: "2020-01-01", amount: 99_00_00_000, everyMonths: null },
  ],
});
eq("4 assets kept (one with no amount)", h.assets.length, 4);
const fam = viewHousehold(h, null);
eq("assets total skips the null, covers 3 of 4", [fam.assets.total, fam.assets.of, fam.assets.rows], [35_00_00_000, 3, 4]);
eq("liabilities", fam.liabilities.total, 8_00_00_000);
eq("off-book net", fam.offBookNet, 35_00_00_000 - 8_00_00_000);
eq("cash = the two liquid lines", fam.cash.total, 5_00_00_000);
eq("charity = the ring-fenced line", fam.charity.total, 3_00_00_000);
eq("tangible = property only", fam.tangible.total, 30_00_00_000);
eq("intangible = the two cash lines", fam.intangible.total, 5_00_00_000);

const ajay = viewHousehold(h, "Ajay");
eq("member scope takes only their lines", [ajay.assets.total, ajay.liabilities.total], [30_00_00_000, 8_00_00_000]);
eq("family-attributed lines are excluded, and counted", ajay.outOfScope, 3);

const from = new Date(Date.UTC(2026, 7, 11));
const yr = outflowsWithin(h, from, 12);
// school fees 2026-09-01 then every 3 months inside 12m: Sep, Dec, Mar, Jun = 4 x 10L = 40L
// advance tax 2026-12-15 once = 50L ; the 2020 row is outside the window
eq("recurring counted per occurrence, past rows excluded", yr.total, 4 * 10_00_000 + 50_00_000);
eq("liquidity months = cash / (year outflow / 12)", Number(liquidityMonths(5_00_00_000, yr.total)!.toFixed(4)),
   Number((5_00_00_000 / (90_00_000 / 12)).toFixed(4)));
eq("cash with no schedule is NOT unlimited", liquidityMonths(5_00_00_000, null), null);
eq("schedule with no cash is NOT zero months", liquidityMonths(null, 90_00_000), null);
eq("zero outflow gives no ratio", liquidityMonths(5_00_00_000, 0), null);

// ── watchlist plan fields ───────────────────────────────────────────────────
eq("pending to invest = 5% of 100cr less 3cr held", pendingToInvest(5, 100_00_00_000, 3_00_00_000), 2_00_00_000);
eq("overweight is negative", pendingToInvest(1, 100_00_00_000, 3_00_00_000), -2_00_00_000);
eq("no target -> null, not the whole position", pendingToInvest(null, 100_00_00_000, 3_00_00_000), null);
eq("0% target is an instruction: sell it all", pendingToInvest(0, 100_00_00_000, 3_00_00_000), -3_00_00_000);
eq("empty book -> null", pendingToInvest(5, 0, 3_00_00_000), null);
eq("parse '0' -> 0, not null", parseWeightPct("0"), 0);
eq("parse '' -> null", parseWeightPct(""), null);
eq("parse '7.5%' -> 7.5", parseWeightPct("7.5%"), 7.5);
eq("parse '150' rejected", parseWeightPct("150"), null);

console.log(fails ? `\n${fails} FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
