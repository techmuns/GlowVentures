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
  PRIVATE_ROUNDS, PRIVATE_MARKET_NEWS, privateCompanyOf, roundValues, entryRound, companyMetrics, stakeTrail, valuationPoints, seriesCurrency, vendorOnly,
  type FundingRound, type PrivateCompany,
} from "@/lib/privateRounds";
import RAW_ROUNDS from "@/data/privateRounds.json";
import { BLOCKED_SOURCE_HOSTS, PRIVATE_COMPANIES } from "../../../scripts/lib/privateCompanies.mjs";
import { parseMoney, footnoteFor, foldEvidence, foldRows, nameKey, namesOf, companyMatcher } from "../../../scripts/lib/privateFunding.mjs";

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

// ── INC42'S FUNDING TABLE, FOLDED IN (Stage 10kt) ───────────────────────────
// The rows behind Glow Central Research's News → Private Market tab, matched to
// a company by its exact name and merged into its record. What the page may do
// with them is checked here: a row is the company's only by one of its own
// names, it adds a round only where no researched round is the same one, it
// never carries a valuation, and every row of the import is on the page.
const raw = RAW_ROUNDS as unknown as { companies: { id: string; rounds: { date: string; round: string }[] }[] };
const funding = PRIVATE_MARKET_NEWS.funding;
ok("the import carries Inc42's coverage and its rows", !!funding && funding.rowsRead > 0 && funding.rows.length > 0,
  funding ? `${funding.rows.length} rows of ${funding.rowsRead}, ${funding.from} → ${funding.to}` : "no funding block");
const registry = new Map(PRIVATE_COMPANIES.map((c) => [c.id, c]));
const misnamed = (funding?.rows ?? []).filter((r) => !namesOf(registry.get(r.company)!).some((n) => nameKey(n) === nameKey(r.name)));
ok("every Inc42 row prints one of its company's own names, exactly", misnamed.length === 0, misnamed.map((r) => `${r.company}:${r.name}`).join(", "));
const shown = new Map(PRIVATE_ROUNDS.companies.map((c) => [c.id, c]));
const lost = (funding?.rows ?? []).filter((r) => r.date && !shown.get(r.company)?.rounds.some((x) => x.reported?.id === r.id));
ok("every dated Inc42 row is on its company's page — folded into a round or as a round of its own", lost.length === 0, lost.map((r) => r.id).join(", "));
const rawCount = (id: string) => raw.companies.find((c) => c.id === id)?.rounds.length ?? 0;
const unresolved = (id: string) => (funding?.rows ?? []).filter((r) => r.company === id && r.date
  && !(r.fold && raw.companies.find((c) => c.id === id)?.rounds.some((x) => `${x.date}|${x.round}` === r.fold!.key))).length;
const counts = PRIVATE_ROUNDS.companies.filter((c) => c.rounds.length !== rawCount(c.id) + unresolved(c.id));
ok("a company's rounds are its researched rounds plus the Inc42 rows that are none of them — nothing counted twice", counts.length === 0, counts.map((c) => c.id).join(", "));
const valued = PRIVATE_ROUNDS.companies.flatMap((c) => c.rounds).filter((r) => r.kind === "reported" && (r.preMoney || r.postMoney || r.valuation || r.pricePerShare));
ok("a round known only from Inc42 carries no valuation or price (its table prints none)", valued.length === 0);
const noLink = PRIVATE_ROUNDS.companies.flatMap((c) => c.rounds).filter((r) => r.reported && !r.sources.some((x) => x.url === r.reported!.url));
ok("every round Inc42 reports links the roundup it was read from", noLink.length === 0);
ok("the imported record names no ring-fenced holding", !/polycab/i.test(JSON.stringify(PRIVATE_MARKET_NEWS)));
const headlineCos = new Set((PRIVATE_MARKET_NEWS.headlines?.rows ?? []).map((h) => h.company));
ok("every headline belongs to a company in the registry", [...headlineCos].every((id) => registry.has(id)));

ok("an amount is read as printed — $21 Mn, $447K, ₹20 Cr — and a dash or 'Undisclosed' is no amount",
  parseMoney("$21 Mn")?.value === 21e6 && parseMoney("$447K")?.value === 447e3 && parseMoney("$450 Mn*")?.value === 450e6
  && parseMoney("₹20 Cr")?.currency === "INR" && parseMoney("₹20 Cr")?.value === 2e8 && parseMoney("–") === null && parseMoney("Undisclosed") === null);
ok("a footnote star reads the roundup's own note for that many stars",
  footnoteFor(2, ["Source: Inc42\n*Mix of equity and debt\n** Part of a larger round"]) === "Part of a larger round");
const match = companyMatcher([{ brand: "Hoopr", legalName: "GSharp Media Private Limited" }, { brand: "Acme", legalName: "Acme Ltd" }, { brand: "Acme Labs", legalName: "Acme" }]);
ok("a name matches exactly, by brand or legal name; a part of a name never does, and a name two companies share matches neither",
  match("HOOPR")?.brand === "Hoopr" && match("GSharp Media Pvt. Ltd.")?.brand === "Hoopr" && match("Hoopr Music") === null && match("Acme") === null);
const fx = (date: string, round: string | null, amount: { value: number; currency: string } | null, investors: string[]) => ({ date, round, amount, investors, leadInvestors: [] as string[] });
const researched = (date: string, round: string, amountRaised: { value: number; currency: string; alt?: { value: number; currency: string }[] } | null, leadInvestors: string[]) => ({ date, round, amountRaised, leadInvestors });
const usd = (value: number) => ({ value, currency: "USD" });
ok("the same round folds on the same amount and an investor both name",
  foldEvidence(fx("2025-08-12", null, usd(45.7e6), ["Motilal Oswal Financial Services Ltd"]), researched("2025-08-12", "Preferential allotment", { value: 4e9, currency: "INR", alt: [usd(46e6)] }, ["Motilal Oswal Financial Services Limited"])).score >= 2);
ok("…but never across a different amount in one currency",
  foldEvidence(fx("2025-08-07", null, usd(2.9e6), ["MapmyIndia"]), researched("2025-08-12", "Preferential allotment", { value: 4e9, currency: "INR", alt: [usd(46e6)] }, ["Motilal Oswal"])).contradiction !== null);
ok("…or two different series", foldEvidence(fx("2024-01-10", "Series B", usd(5e6), ["Foo Capital"]), researched("2024-01-10", "Series A", usd(5e6), ["Foo Capital"])).contradiction !== null);
ok("…and a seed and a pre-seed of one day with one investor are the same cheque",
  foldEvidence(fx("2023-08-29", "Seed", usd(447e3), ["Madhuram Papers family office"]), researched("2023-08-29", "Pre-seed", inr(3.7e7), ["Family office of the promoters of Madhuram Papers"])).score >= 2);
const rowA = fx("2024-05-15", null, usd(3e6), ["SIDBI Venture Capital"]), rowB = fx("2024-05-20", null, usd(3e6), ["SIDBI Venture Capital"]);
const folded = foldRows([rowA, rowB], [researched("2024-05-15", "Series A extension", usd(3e6), ["SIDBI Venture Capital"])]);
ok("a researched round takes one Inc42 row — the strongest; the other stays a row of its own", !!folded.get(rowA) && folded.get(rowB) === null);
const withReported: PrivateCompany = { ...diluting, rounds: [...diluting.rounds.slice(0, 2),
  round("2022-09-01", "Round type not named", { kind: "reported", amountRaised: { value: 2e6, currency: "USD" } }), diluting.rounds[3]] };
const tr = stakeTrail(withReported, 1000, 1000 * 1000, "2022-06-20", "INR");
ok("a round known only from Inc42 breaks the stake chain — its table does not say whether it issued shares",
  tr.at.has(withReported.rounds[1]) && !tr.at.has(withReported.rounds[2]) && !tr.at.has(withReported.rounds[3]) && /Inc42/.test(tr.why.get(withReported.rounds[3]) ?? ""));

// ── THE RESEARCH PASS (Stage 10kz) ─────────────────────────────────────────
const vendorRound = round("2024-01-01", "Seed", { valuation: { ...inr(50e7), basis: "unspecified" },
  sources: [{ url: "https://inc42.com/company/x/funding/", publisher: "Inc42 Datalabs", published: null, supports: "fixture", aggregator: true }] });
ok("a valuation only a data vendor's page states is flagged so, on the chart's point too",
  vendorOnly(vendorRound) && valuationPoints({ ...fixture, rounds: [vendorRound] }, "INR").points[0]?.vendor === true
  && !vendorOnly(fixture.rounds[0]));
const unnamed = PRIVATE_ROUNDS.companies.flatMap((c) => c.familyMentions.filter((x) => !/Jaisinghani|Glow Ventures/i.test(x.text)).map(() => c.id));
ok("every family line names the member it is about", unnamed.length === 0, unnamed.join(", "));
const mentionHosts = PRIVATE_ROUNDS.companies.flatMap((c) => c.familyMentions.map((x) => host(x.source.url))).filter((h) => !h || (BLOCKED_SOURCE_HOSTS as string[]).some((b) => h === b || h.endsWith(`.${b}`)));
ok("every family line links a credible source", mentionHosts.length === 0, mentionHosts.join(", "));

if (fails) { console.log(`\n${fails} failing`); process.exit(1); }
console.log("\nall private-round checks pass");
