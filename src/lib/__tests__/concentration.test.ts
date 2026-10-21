// CONCENTRATION IS COUNTED BY INVESTMENT, NOT BY SHARE CLASS (Stage 10fz).
//   npm run test:family
//
// Morning CIO's Largest holding and Top-10 grouped on `securityKey`, so Sanshi
// Fund I's Class E and Class A2 were two names and Helios Flexi Cap's AMC folio
// and its depository units (one ISIN, two keys) stood apart. Every expectation
// here is re-derived from the live book the page reads, not typed.
import { LIVE_POSITIONS } from "./liveBook";
import { currentHoldings, dedupedPositions } from "@/lib/analytics";
import { concentrationNames } from "@/lib/concentration";
import { splitFundClass } from "../../../shared/securityKey.mjs";
import type { Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const CR = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const book = currentHoldings(dedupedPositions(LIVE_POSITIONS));
const names = concentrationNames(book);
const total = sum(book.map((p) => p.marketValue));

// ── A PARTITION OF THE BOOK ─────────────────────────────────────────────────
ok("every holding is in exactly one name", sum(names.map((g) => g.rows.length)) === book.length
  && new Set(names.flatMap((g) => g.rows)).size === book.length);
ok("the names add to the book", Math.abs(sum(names.map((g) => g.value)) - total) < 1, CR(total));
ok("ranked largest first", names.every((g, i) => i === 0 || names[i - 1].value >= g.value));
ok("no securityKey is rewritten", names.every((g) => g.rows.every((p) => g.securityKeys.includes(p.securityKey))));

// ── THE CLASS CLUB: a fund the book holds in two or more classes is one name ──
{
  const classes = new Map<string, Set<string>>();
  for (const p of book) {
    const f = splitFundClass(p.security);
    if (f) (classes.get(f.fund) ?? classes.set(f.fund, new Set()).get(f.fund)!).add(f.cls);
  }
  const multi = [...classes].filter(([, s]) => s.size >= 2).map(([f]) => f);
  ok("the book holds a fund in several classes — else the club below is unchecked", multi.length > 0, multi.join(", "));
  for (const fund of multi) {
    const rows = book.filter((p) => splitFundClass(p.security)?.fund === fund);
    const g = names.find((x) => x.clubbedFund === fund);
    ok(`${fund}: every class is one name, at the classes' sum`, !!g
      && rows.every((p) => g.rows.includes(p)) && Math.abs(g.value - sum(rows.map((p) => p.marketValue))) < 1,
      g ? `${g.securityKeys.length} keys · ${CR(g.value)}` : "no group");
  }
  // A single-class fund is not clubbed by this rule.
  const single = [...classes].filter(([, s]) => s.size === 1).map(([f]) => f);
  ok("a fund held in one class is not marked clubbed", single.every((f) => !names.some((g) => g.clubbedFund === f)));
}
// ── THE ISIN JOIN: two keys one ISIN names are one name ─────────────────────
{
  const byIsin = new Map<string, Set<string>>();
  for (const p of book) if (p.isin) (byIsin.get(p.isin.trim().toUpperCase()) ?? byIsin.set(p.isin.trim().toUpperCase(), new Set()).get(p.isin.trim().toUpperCase())!).add(p.securityKey);
  const split = [...byIsin].filter(([, ks]) => ks.size > 1);
  ok("the book carries a security under two keys — else the join below is unchecked", split.length > 0, split.map(([i]) => i).join(", "));
  for (const [isin, ks] of split) {
    const g = names.find((x) => [...ks].every((k) => x.securityKeys.includes(k)));
    ok(`${isin}: its ${ks.size} keys are one name`, !!g, [...ks].join(" + "));
  }
}
// ── THE LARGEST NAME IS THE LARGEST INVESTMENT, NOT THE LARGEST CLASS ───────
{
  const byKey = new Map<string, number>();
  for (const p of book) byKey.set(p.securityKey, (byKey.get(p.securityKey) ?? 0) + p.marketValue);
  const largestKey = Math.max(...byKey.values());
  ok("the largest name is at least the largest single key", names[0].value >= largestKey - 1,
    `${names[0].label} ${CR(names[0].value)} (${(names[0].value / total * 100).toFixed(1)}%) vs largest key ${CR(largestKey)} (${(largestKey / total * 100).toFixed(1)}%)`);
  const top = names[0].rows.reduce((m, p) => (p.marketValue > m.marketValue ? p : m), names[0].rows[0]);
  ok("its lead key is its largest line's", top.securityKey === names[0].leadKey, names[0].leadKey);
}
// ── CONSTRUCTED: the rule, with nothing in the book to lean on ──────────────
{
  const row = (security: string, securityKey: string, marketValue: number, isin: string | null = null) =>
    ({ security, securityKey, marketValue, isin } as unknown as Position);
  const g = concentrationNames([
    row("Alpha Fund — Class A", "alpha-a", 10), row("Alpha Fund — Class B", "alpha-b", 5),
    row("Beta Fund — Class A", "beta-a", 12),
    row("Gamma Ltd", "gamma", 8, "INE000000001"), row("GAMMA LTD-EQ", "gamma-eq", 4, "INE000000001"),
    row("Delta Ltd", "delta", 3),
  ]);
  const by = (k: string) => g.find((x) => x.securityKeys.includes(k))!;
  ok("constructed: two classes of one fund are one name of 15", by("alpha-a") === by("alpha-b") && by("alpha-a").value === 15 && by("alpha-a").label === "Alpha Fund");
  ok("constructed: a one-class fund stands alone", by("beta-a").securityKeys.length === 1 && by("beta-a").clubbedFund === null);
  ok("constructed: one ISIN under two keys is one name of 12", by("gamma") === by("gamma-eq") && by("gamma").value === 12 && by("gamma").leadKey === "gamma");
  ok("constructed: the clubbed fund now outranks the larger single class", g[0].label === "Alpha Fund" && g[0].value === 15);
}

console.log(fails ? `\n${fails} FAILED` : "\nall concentration checks passed");
process.exit(fails ? 1 : 0);
