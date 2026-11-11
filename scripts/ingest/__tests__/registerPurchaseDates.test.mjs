// A private line the review dates by month, dated by the register's payments (Stage 10mw).
// Run: node scripts/ingest/__tests__/registerPurchaseDates.test.mjs
//
// ON CONSTRUCTED INPUTS shaped like Bharat's Waterwala Labs line: the review
// prints "Feb 2020 – Jul 2023" and one cost; the register's serial group 3
// prints the payments behind it. Each gate is broken once and must date nothing.
import { registerPurchaseDates, registerPayments, registerDate } from "../../lib/registerPurchaseDates.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
console.log("registerPurchaseDates");

const HEAD = ["SR. NO.", "INVESTMENT NAME", "INVESTMENT NAME (AKA)", "INVESTMENT DATE", "INVESTMENT DONE UNDER", "INVESTMENT AMOUNT"];
const wb = (rows) => ({ sheets: [{ name: "PVT INV", rows: [HEAD, ...rows] }] });
const ROWS = [
  ["3a", "WATERWALA LABS PRIVATE LIMITED", "DRINK PRIME", "17.02.2020", "BHARAT", 6000232],
  ["3b", "WATERWALA LABS PRIVATE LIMITED", "DRINK PRIME", 43955, "BHARAT", 1000000],
  ["3h", "WATERWALA LABS PRIVATE LIMITED -DRINKPRIME", "DRINK PRIME", "31.07.2023", "BHARAT", 70000000],
  ["", "WATERWALA LABS - TOTAL", "", "", "", 77000232],
  ["4a", "HANOK REUBEN MEDHARI", "DRINK PRIME", "12.04.2020", "BHARAT", 200000],
];
const position = {
  accountId: "review-bharat-jaisinghani", securityKey: "waterwala-labs-private-limited-drink-prime", costBasis: 77000232,
  investedDates: { from: "2020-02", to: "2023-07", text: "Feb 2020 – Jul 2023" },
};
const run = (over = {}, rows = ROWS) => registerPurchaseDates({ position: { ...position, ...over }, ownerId: over.ownerId ?? "bharat-jaisinghani", payments: registerPayments(wb(rows)) });

ok("a serial date and a dotted date both read as days", registerDate(43955) === "2020-05-04" && registerDate("17.02.2020") === "2020-02-17" && registerDate("15/05/2023") === "2023-05-15");
ok("a subtotal row is no payment", registerPayments(wb(ROWS)).every((r) => r.serial));
{
  const r = run();
  ok("the group's payments date the line, each on its day",
    r?.payments?.length === 3 && r.payments[0].date === "2020-02-17" && r.payments.at(-1).date === "2023-07-31", JSON.stringify(r));
  ok("…with the register rows as evidence", JSON.stringify(r?.evidence?.rows) === "[2,3,4]", JSON.stringify(r?.evidence));
}
ok("a line no alias names is not attempted", run({ securityKey: "something-else" }) === null);
ok("another holder's payments date nothing", /not this holder/.test(run({ ownerId: "ankita-jaisinghani" })?.reason ?? ""));
ok("a total that misses the review's cost dates nothing", /add to/.test(run({ costBasis: 77000300 })?.reason ?? ""));
ok("a day the review prints is never replaced", /as a day/.test(run({ investedDates: { from: "2020-02-17", to: "2020-02-17", text: "17 Feb 2020" } })?.reason ?? ""));
ok("a payment outside the review's months dates nothing",
  /outside the review/.test(run({ investedDates: { from: "2020-03", to: "2023-07", text: "Mar 2020 – Jul 2023" } })?.reason ?? ""));
ok("an undated payment dates nothing",
  /undated/.test(run({}, [ROWS[0], ROWS[1], ["3h", "WATERWALA", "", "", "BHARAT", 70000000]])?.reason ?? ""));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
