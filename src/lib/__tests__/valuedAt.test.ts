// WHEN, AND BY WHAT, A HOLDING'S VALUE IS STRUCK.   npm run test:family
//
// VD-17 and DSM-C4 in the audit. The company page printed a holding's value with
// no date — the ICICI Bank NSDL holdings are 31 March marks — and the fund card
// dated the family's holding by its statement while multiplying AMFI's later NAV.
//
// Anchored on the COMMITTED book with the published NAVs applied exactly as the
// page applies them (`applyFundNavs`), and every expectation RE-EXPRESSED here
// from the positions' own fields and their accounts' dates — never read back
// through `valueDateOf`, which is what the helper under test calls.
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
import { applyFundNavs } from "@/lib/fundNavs";
import { fmtDate } from "@/lib/format";
import { holdingValuation } from "@/lib/valuedAt";
import type { Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const asOf = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a.asOf] as const));
const stmt = (id: string) => asOf.get(id) ?? null;
const NOW = Date.UTC(2026, 8, 24, 6, 0, 0); // 24 Sep 2026, 11:30 IST

console.log("── constructed ──");
{
  const v = holdingValuation([], stmt, NOW);
  ok("no rows: no date, no source, no words", v.at === null && v.by === null && v.dates === 0 && v.words === null);
}
{
  // A live quote pulled 10 minutes ago, at 00:05 IST on the 25th — the EXCHANGE's
  // date, not the server's UTC one.
  const now = Date.UTC(2026, 8, 24, 18, 45, 0); // 00:15 IST on 25 Sep
  const v = holdingValuation([{ accountId: "x", live: true, quoteAgeS: 600 }], () => "2026-07-31", now);
  ok("a live row is struck on the quote's own IST date", v.at === "2026-09-25" && v.by === "live" && /^live price · /.test(v.words ?? ""), `${v.at} ${v.words}`);
}
{
  const v = holdingValuation([{ accountId: "a", navPriced: true, navDate: "2026-09-22" }, { accountId: "b" }],
    (id) => (id === "b" ? "2026-09-22" : "2026-07-31"), NOW);
  ok("one date by two routes is that date, and says it is mixed", v.at === "2026-09-22" && v.by === "mixed" && v.dates === 1);
}
{
  const v = holdingValuation([{ accountId: "a" }, { accountId: "b" }], (id) => (id === "a" ? "2026-07-31" : "2026-08-10"), NOW);
  ok("two statement dates give no date, and the words count them", v.at === null && v.dates === 2 && v.words === "valued on 2 dates"
    && /2 different dates/.test(v.why), v.words ?? "");
}

console.log("── the committed book, with the published NAVs applied as the page applies them ──");
const book: Position[] = applyFundNavs(BOOK_POSITIONS.map((p) => ({ ...p })));
const byKey = new Map<string, Position[]>();
for (const p of book) (byKey.get(p.securityKey) ?? byKey.set(p.securityKey, []).get(p.securityKey)!).push(p);
// Re-expressed: no quote reaches a headless suite, so a row is its NAV's date if
// the NAV priced it, else its own statement's.
const expectedDate = (p: Position) => (p.navPriced && p.navDate ? p.navDate : stmt(p.accountId));
let checked = 0, wrong: string[] = [];
for (const [key, ps] of byKey) {
  const v = holdingValuation(ps, stmt, NOW);
  const ds = new Set(ps.map(expectedDate));
  const at = ds.size === 1 ? [...ds][0] ?? null : null;
  const kinds = new Set(ps.map((p) => (p.navPriced ? "nav" : "statement")));
  const by = kinds.size === 1 ? [...kinds][0] : "mixed";
  const wordsOk = at ? (v.words ?? "").endsWith(fmtDate(at)) : v.words === `valued on ${ds.size} dates`;
  checked++;
  if (v.at !== at || v.by !== by || v.dates !== ds.size || !wordsOk) wrong.push(`${key}: ${v.at}/${v.by}/${v.words} vs ${at}/${by}`);
}
ok("every held security is dated and sourced exactly as its rows' own dates say", wrong.length === 0 && checked > 100,
  `${checked} securities${wrong.length ? `; wrong: ${wrong.slice(0, 3).join("; ")}` : ""}`);

{
  // The ICICI Bank NSDL demat: a statement mark of its own date, never today's.
  const icici = BOOK_ACCOUNTS.find((a) => /ICICI/i.test(a.provider) && /NSDL/i.test(a.provider));
  const own = icici ? [...byKey.values()].filter((ps) => ps.every((p) => p.accountId === icici.accountId))
    .sort((a, b) => b.reduce((s, p) => s + p.marketValue, 0) - a.reduce((s, p) => s + p.marketValue, 0))[0] : undefined;
  if (!icici || !own) ok("the ICICI Bank NSDL demat holds a company this suite can date", false);
  else {
    const v = holdingValuation(own, stmt, NOW);
    ok("an ICICI Bank NSDL holding says its value is that statement's mark, on that statement's date",
      v.by === "statement" && v.at === icici.asOf && v.words === `statement mark · ${fmtDate(icici.asOf)}`
      && /that day's prices, not today's/.test(v.why), `${own[0].securityKey}: ${v.words}`);
  }
}
{
  // A fund the published NAV values: AMFI's date, not the statement's.
  const fund = [...byKey.values()].find((ps) => ps.length > 0 && ps.every((p) => p.navPriced && p.navDate)
    && ps.some((p) => p.navDate !== stmt(p.accountId)));
  if (!fund) ok("a fund the published NAV values on a date its statement does not carry", false);
  else {
    const v = holdingValuation(fund, stmt, NOW);
    ok("a NAV-priced fund is dated by AMFI's publication, never by its statement", v.by === "nav" && v.at === fund[0].navDate
      && v.at !== stmt(fund[0].accountId) && /^AMFI NAV · /.test(v.words ?? ""), `${fund[0].securityKey}: ${v.words}`);
  }
}
{
  // A holding two statements mark on different dates has no one date.
  const split = [...byKey.values()].find((ps) => new Set(ps.map(expectedDate)).size > 1);
  if (!split) ok("the book carries a holding struck on more than one date", false);
  else {
    const v = holdingValuation(split, stmt, NOW);
    ok("…and a holding struck on several dates names how many, never one of them", v.at === null && v.dates > 1
      && v.words === `valued on ${v.dates} dates`, `${split[0].securityKey}: ${v.words}`);
  }
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
if (fails) process.exit(1);
