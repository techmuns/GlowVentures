// A PRIVATE COMPANY'S FUNDING ROUNDS, CHECKED (Stage 10ko).
//   npm run test:family
//
// `src/data/privateRounds.json` is the one record in the dashboard that is not
// the family's own statements, so what it may hold is checked here rather than
// trusted: every company line in the book has a record (the page and the Edit
// Columns metrics would otherwise be silently missing for it), every round
// carries a source on a credible host, and the figures the page DERIVES — a
// pre-money from post − raised, the entry round, a stake — are struck exactly
// as `privateRounds.ts` says and nowhere else.
import { BOOK_POSITIONS } from "@/data/glowData";
import {
  PRIVATE_ROUNDS, privateCompanyOf, roundValues, entryRound, companyMetrics, stakeTrail, valuationPoints, seriesCurrency,
  type FundingRound, type PrivateCompany,
} from "@/lib/privateRounds";
import { BLOCKED_SOURCE_HOSTS } from "../../../scripts/lib/privateCompanies.mjs";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const store = PRIVATE_ROUNDS as typeof PRIVATE_ROUNDS & { notCompanies?: Record<string, string> };
const notCompanies = store.notCompanies ?? {};

// ── EVERY PRIVATE COMPANY LINE IN THE BOOK HAS A RECORD ─────────────────────
const unlisted = [...new Set(BOOK_POSITIONS.filter((p) => p.marketSide === "private" && p.assetClass === "Unlisted").map((p) => p.securityKey))];
const unmapped = unlisted.filter((k) => !privateCompanyOf(k) && !(k in notCompanies));
ok(`every private Unlisted line in the book names a company or a reason it is not one (${unlisted.length} lines)`, unmapped.length === 0, unmapped.join(", "));

const bookKeys = new Set(BOOK_POSITIONS.map((p) => p.securityKey));
const stale = store.companies.flatMap((c) => c.fundKeys.filter((k) => !bookKeys.has(k)).map((k) => `${c.id}:${k}`));
ok("every line key a company names is a line the book carries", stale.length === 0, stale.join(", "));

const twice = store.companies.flatMap((c) => c.fundKeys).filter((k, i, a) => a.indexOf(k) !== i);
ok("no line key is claimed by two companies", twice.length === 0, twice.join(", "));

// ── EVERY ROUND IS SOURCED, ON A CREDIBLE HOST, WITH POSITIVE FIGURES ───────
const DATE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };
const bad: string[] = [];
for (const c of store.companies) for (const r of c.rounds) {
  const where = `${c.id} ${r.round} ${r.date}`;
  if (!DATE.test(r.date)) bad.push(`${where}: date`);
  if (!r.sources.length) bad.push(`${where}: no source`);
  for (const s of r.sources) {
    const h = host(s.url);
    if (!h || !/^https?:/.test(s.url)) bad.push(`${where}: url ${s.url}`);
    else if ((BLOCKED_SOURCE_HOSTS as string[]).some((b) => h === b || h.endsWith(`.${b}`))) bad.push(`${where}: blocked host ${h}`);
  }
  for (const m of [r.amountRaised, r.preMoney, r.postMoney, r.valuation, r.pricePerShare]) {
    if (m && !(m.value > 0 && /^[A-Z]{3}$/.test(m.currency))) bad.push(`${where}: money ${JSON.stringify(m)}`);
  }
}
ok(`every round is dated, sourced on a credible host and carries only positive figures (${store.companies.reduce((s, c) => s + c.rounds.length, 0)} rounds)`, bad.length === 0, bad.slice(0, 8).join("; "));
// The ring-fenced promoter holding is named on `/polycab` alone; a report of a
// round that mentions it in passing must not carry the name onto these pages.
ok("the record names no ring-fenced holding", !/polycab/i.test(JSON.stringify(store)));
ok("every company says when it was last researched", store.companies.every((c) => DATE.test(c.checkedOn)));
ok("a company with no round says what was searched", store.companies.every((c) => c.rounds.length > 0 || !!c.searchNote));

// ── THE DERIVATIONS, ON A FIXTURE ──────────────────────────────────────────
const src = [{ url: "https://entrackr.com/x", publisher: "Entrackr", published: "2024-01-01", supports: "fixture" }];
const round = (date: string, name: string, f: Partial<FundingRound>): FundingRound => ({
  date, dateBasis: null, round: name, kind: "primary", amountRaised: null, preMoney: null, postMoney: null, valuation: null,
  pricePerShare: null, sharesAllotted: null, leadInvestors: [], note: null, sources: src, ...f,
});
const inr = (value: number) => ({ value, currency: "INR" });
const fixture: PrivateCompany = {
  id: "fixture", legalName: "Fixture Pvt Ltd", brand: "Fixture", fundKeys: [], website: null, sector: null, listed: null,
  familyMentions: [], searchNote: null, checkedOn: "2026-11-04",
  rounds: [
    round("2021-03-10", "Seed", { postMoney: inr(100e7), amountRaised: inr(10e7) }),
    round("2022-06", "Series A", { preMoney: inr(300e7), amountRaised: inr(50e7), pricePerShare: inr(1000) }),
    round("2024-02-01", "Series B", { valuation: { ...inr(900e7), basis: "unspecified" } }),
    round("2025-09-01", "Series C", { postMoney: { value: 2e8, currency: "USD" } }),
  ],
};
const seed = roundValues(fixture.rounds[0], "INR");
ok("a pre-money is post-money − raised where the source prints those two, and says it is derived",
  seed.pre?.value === 90e7 && !!seed.pre.derived && seed.post?.derived === null);
const a = roundValues(fixture.rounds[1], "INR");
ok("a post-money is pre-money + raised where the source prints those two", a.post?.value === 350e7 && !!a.post.derived);
const b = roundValues(fixture.rounds[2], "INR");
ok("a valuation with no basis is drawn as unspecified, never as post-money", b.post === null && b.headline?.basis === "unspecified");
ok("a round printed only in another currency is never converted", roundValues(fixture.rounds[3], "INR").headline === null
  && valuationPoints(fixture, "INR").leftOut.map((r) => r.round).join() === "Series C");
ok("the series is drawn in the currency most rounds print", seriesCurrency(fixture) === "INR");
ok("the entry round is the one dated within the window of the investment", entryRound(fixture, "2022-07-15")?.round.round === "Series A"
  && entryRound(fixture, "2022-07-15")?.match === "at");
ok("…else the last priced round before it", entryRound(fixture, "2023-05-01")?.round.round === "Series A"
  && entryRound(fixture, "2023-05-01")?.match === "before");
ok("…and none where no round is dated before it", entryRound(fixture, "2020-01-01") === null);
const m = companyMetrics(fixture, "2021-04-01");
ok("the change since entry is struck only on one basis — post-money entry against an unspecified latest is refused",
  m.entry?.round.round === "Seed" && m.latest?.round === "Series B" && m.change === null);
const m2 = companyMetrics({ ...fixture, rounds: fixture.rounds.slice(0, 2) }, "2021-04-01");
ok("…and is latest ÷ entry where both are post-money", m2.change === 3.5);
// The family came in on Series A (₹1,000 a share, ₹350 Cr post) with 1,000 shares.
const diluting: PrivateCompany = { ...fixture, rounds: [
  fixture.rounds[0], fixture.rounds[1],
  round("2023-01-10", "Secondary", { kind: "secondary", valuation: { ...inr(500e7), basis: "unspecified" } }),
  round("2023-06-01", "Series B", { preMoney: inr(600e7), postMoney: inr(800e7), pricePerShare: inr(1) }), // a 1:1000 split since — the price no longer matters
  round("2024-06-01", "Series C", { amountRaised: inr(100e7) }),
  round("2025-01-01", "Series D", { postMoney: inr(2000e7), amountRaised: inr(200e7) }),
] };
const t = stakeTrail(diluting, 1000, 1000 * 1000, "2022-06-20", "INR");
const atA = t.at.get(diluting.rounds[1])?.pct;
ok("the entry stake is shares × the entry round's price ÷ its post-money", atA != null && Math.abs(atA - (1e6 / 350e7) * 100) < 1e-12);
ok("a secondary issues no shares and leaves the stake as it was", t.at.get(diluting.rounds[2])?.pct === atA);
ok("a later round dilutes by its pre ÷ post-money, whatever its per-share price", Math.abs((t.at.get(diluting.rounds[3])?.pct ?? 0) - atA! * 0.75) < 1e-12);
ok("a round that issues shares and prints no pre and post breaks the chain from there on",
  !t.at.has(diluting.rounds[4]) && !t.at.has(diluting.rounds[5]) && /Series C/.test(t.why.get(diluting.rounds[5]) ?? ""));
ok("a round before the family invested carries no stake", /before/.test(t.why.get(diluting.rounds[0]) ?? ""));
const offBasis = stakeTrail(diluting, 1000, 31_810 * 1000, "2022-06-20", "INR");
ok("no stake where the family's cost per share is not the entry round's price (a split, a secondary purchase)",
  offBasis.at.size === 0 && /another price or share basis/.test(offBasis.why.get(diluting.rounds[1]) ?? ""));
ok("no stake without a share count", stakeTrail(diluting, null, 1e6, "2022-06-20", "INR").at.size === 0);

if (fails) { console.log(`\n${fails} failing`); process.exit(1); }
console.log("\nall private-round checks pass");
