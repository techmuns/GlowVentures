// ONE COMPANY, ONE NAME, WRITTEN AS A NAME.   npm run test:family
//
//   "when I am searching Kaynes in the search bar, it is coming up in small cap
//    and large cap both. It should be a single name only. Make sure that the
//    name of all the entities is written correctly neither in all full cap nor
//    in all small cap. Otherwise 2 separate names of the same company does not
//    make sense."
//
// Three different defects produced that screen, and each has its own section:
//
//   1. IDENTITY — one company under two `securityKey`s (SBI, Karur Vysya,
//      Crompton), which no label can repair because they are two rows;
//   2. THE LABEL — one key printed two ways by two statements, so one row
//      carried whichever spelling its first position happened to have;
//   3. THE CASE — a name printed in capitals, or a filer's lowercase slip,
//      reaching the screen exactly so.
//
// Anchored on the GENERATED book and the committed symbol map, never on a
// fixture, so a new drop that brings a new spelling is checked by this suite
// without anyone adding a case for it. The one exception is section 5, which is
// CONSTRUCTED because the real case it mirrors lasts only as long as one month's
// fund filings — and it says so, and states the premise that makes the
// construction necessary.
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
import { displayDepositoryName, displayFiledName, displaySecurity, stripFilingMarks } from "@/lib/format";
import { allRecordedLines } from "@/lib/recordedHoldings";
import { securityKeyOf } from "@/lib/securityKey";
import { labelVariants, securityLabel } from "@/lib/securityLabel";
import { issuerKeyOf, issuerNameOf, loadStockExposure, type HeldFund } from "@/lib/lookthrough";
import NSE_SYMBOLS from "@/data/nseSymbols.json";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const eq = (name: string, got: unknown, want: unknown) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name} = ${JSON.stringify(got)}`);
};

console.log("\n── 1. identity: one company, one key ──");
// Each of these was a real split on this book, and each pair is corroborated by
// an identifier nobody here controls — the depository row's ISIN resolves to the
// same NSE symbol the other spelling's name resolves to. See `KEY_ALIASES`.
eq("the depository's `SBI - EQ` is State Bank of India", securityKeyOf("SBI - EQ"), securityKeyOf("State Bank of India"));
eq("...`THE KARUR VYS-EQ` is Karur Vysya Bank", securityKeyOf("THE KARUR VYS-EQ"), securityKeyOf("Karur Vysya Bank Ltd."));
eq("...and the clipped Crompton is Crompton",
  securityKeyOf("Crompton Greaves Consumer Elec"), securityKeyOf("Crompton Greaves Consumer Electrical Ltd"));
/**
 * THE PROPERTY THOSE THREE WERE INSTANCES OF, struck on the whole book: a
 * listed company has ONE trading symbol, so two keys resolving to one symbol are
 * one company keyed twice. Re-derived from the committed map, not from
 * `build-book`'s own note, which reports the same count on every run.
 */
const SYM = NSE_SYMBOLS as Record<string, string>;
/**
 * EVERY LINE A PAGE NAMES A COMPANY ON — a position, and since Stage 10cy a
 * holding a statement records as a quantity and nothing values. The three
 * Motilal Oswal holding statements' 43 rows are that now (their rate is the
 * last depository movement, not a price), and a page draws each under its
 * HOME key (`recordedHoldings.ts`) — the key its company already has in the
 * book, found by ISIN. Read off positions alone this section stopped seeing
 * Kaynes, the company the family searched for, and passed over nothing.
 */
const RECORDED = allRecordedLines();
const PAGE_LINES: { securityKey: string; security: string; symbolKey: string }[] = [
  ...BOOK_POSITIONS.map((p) => ({ securityKey: p.securityKey, security: p.security, symbolKey: p.securityKey })),
  ...RECORDED.map((l) => ({ securityKey: l.homeKey, security: displayDepositoryName(l.security), symbolKey: l.securityKey })),
];
const bySymbol = new Map<string, Set<string>>();
for (const p of PAGE_LINES) {
  const s = SYM[p.symbolKey] ?? SYM[p.securityKey];
  if (s) (bySymbol.get(s) ?? bySymbol.set(s, new Set()).get(s)!).add(p.securityKey);
}
const twice = [...bySymbol].filter(([, ks]) => ks.size > 1);
ok("no NSE symbol is carried by two keys in the book — a position's, or a recorded line's home", twice.length === 0,
  twice.length ? twice.map(([s, ks]) => `${s}: ${[...ks].join(" | ")}`).join("; ") : `${bySymbol.size} symbols, one key each`);
ok("...and the check has something to check", bySymbol.size > 100, `${bySymbol.size} symbols`);

console.log("\n── 2. one label per key ──");
const labels = new Map<string, Set<string>>();
for (const p of PAGE_LINES) {
  (labels.get(p.securityKey) ?? labels.set(p.securityKey, new Set()).get(p.securityKey)!)
    .add(securityLabel(p.securityKey, p.security));
}
const plural = [...labels].filter(([, s]) => s.size > 1);
ok("every key in the book renders under exactly one name", plural.length === 0,
  plural.length ? plural.slice(0, 3).map(([k, s]) => `${k}: ${[...s].join(" | ")}`).join("; ") : `${labels.size} keys`);
/**
 * LOAD-BEARING: the book really does print some keys two ways — otherwise the
 * check above passes on a book with nothing to choose between. And the name
 * chosen is always one a statement PRINTED, never one assembled.
 */
const variants = labelVariants();
ok("the book prints some securities two or more ways", variants.size > 0,
  [...variants.keys()].slice(0, 5).join(", "));
const invented = [...variants].filter(([k, spellings]) => !spellings.includes(securityLabel(k, "")));
ok("...and the one chosen is always one of the spellings printed", invented.length === 0,
  invented.map(([k]) => k).join(", "));
const kaynes = PAGE_LINES.filter((p) => /kaynes/i.test(p.security));
ok("the Kaynes the family searched for is one name, over every line a statement records it on",
  kaynes.length > 0 && new Set(kaynes.map((p) => securityLabel(p.securityKey, p.security))).size === 1,
  `${kaynes.length} line(s): ${[...new Set(kaynes.map((p) => securityLabel(p.securityKey, p.security)))].join(" | ")}`);

console.log("\n── 3. the case: neither all capitals nor all small ──");
// Two words or more in capitals. One capitalised word is an acronym by
// construction — the title-caser keeps only the ones it lists — so `SBI` alone
// is a name and `HDFC BANK` is shouting.
const shouted = (s: string) => !/[a-z]/.test(s) && (s.match(/\b[A-Z]{2,}\b/g)?.length ?? 0) >= 2;
// A name may begin in lower case only as a brand does — `eClerx`, `iShares` —
// with a capital inside its first word.
const smallStart = (s: string) => /^[a-z]/.test(s) && !/^[a-z]+[A-Z]/.test(s);
const bookLabels = [...labels.values()].flatMap((s) => [...s]);
ok("no book name is printed all in capitals", !bookLabels.some(shouted),
  bookLabels.filter(shouted).slice(0, 3).join("; "));
ok("...nor opens in lower case", !bookLabels.some(smallStart), bookLabels.filter(smallStart).join("; "));
const strategies = BOOK_ACCOUNTS.map((a) => a.strategy).filter((s): s is string => !!s);
ok("the book really does carry strategy names printed in capitals",
  strategies.some(shouted), strategies.filter(shouted).join("; "));
ok("...and none reaches the screen that way", !strategies.map(displaySecurity).some(shouted),
  strategies.map(displaySecurity).join("; "));
// The cases the title-caser used to get wrong, each seen on this book.
eq("a connective at the start is a capital, not the small letter it was",
  displaySecurity("THE KARUR VYS-EQ"), "The Karur Vys");
eq("two statements' `Of` and `of` are one spelling", displaySecurity("State Bank Of India"), "State Bank of India");
eq("an acronym that is a name keeps its capitals", displaySecurity("SG MART LIMITED"), "SG Mart Limited");
eq("...and a manager's own", displaySecurity("SVAN INVESTMENT MANAGERS LLP - VELOCITY"), "SVAN Investment Managers LLP - Velocity");
eq("a numeral is not a word", displaySecurity("MOTILAL OSWAL FOUNDERS FUND SERIES II"), "Motilal Oswal Founders Fund Series II");
eq("the brand is restored however it arrived", displayFiledName("360 One Wam Ltd."), "360 ONE WAM Ltd.");
eq("a fund's filing in capitals is title-cased", displayFiledName("KAYNES TECHNOLOGY INDIA LIMITED"), "Kaynes Technology India Limited");
eq("a filer's lowercase slip is a capital", displayFiledName("State Government of Himachal pradesh"), "State Government of Himachal Pradesh");
eq("...every one of them", displayFiledName("SBI funds Management ltd."), "SBI Funds Management Ltd.");
eq("...but a preposition stays small", displayFiledName("HDFC Bank Ltd. ( Additional Tier I Bond under Basel III ) **"),
  "HDFC Bank Ltd. ( Additional Tier I Bond under Basel III )");
eq("...and a brand keeps the spelling it chose", displayFiledName("eClerx Services Ltd."), "eClerx Services Ltd.");

console.log("\n── 4. an instrument's words are not an issuer's name ──");
eq("a filer's footnote marks go", stripFilingMarks("Karur Vysya Bank Ltd. (17/11/2026) **#"), "Karur Vysya Bank Ltd. (17/11/2026)");
eq("an issuer row drops the coupon and the maturity",
  issuerNameOf("8.30% Aditya Birla Capital Ltd. (16/09/2026) **"), "Aditya Birla Capital Ltd.");
eq("...and the zero-coupon mark", issuerNameOf("JTPM Metal Traders Ltd. (29/09/2028) (ZCB) **"), "JTPM Metal Traders Ltd.");
eq("a bracket that is not a date stays — it names a different company",
  issuerNameOf("Tata Teleservices (Maharastra) Ltd. (08/09/2026) **"), "Tata Teleservices (Maharastra) Ltd.");
ok("...so the two Tata Teleservices stay two issuers",
  issuerKeyOf("Tata Teleservices (Maharastra) Ltd. (08/09/2026) **") !== issuerKeyOf("Tata Teleservices Ltd. (17/11/2026) **"));
for (const n of ["7.18% GOI MAT 140833", "GOI STRIPS - Mat 170628^", "91 DAY T-BILL 05.11.26",
  "364 Days Tbill (MD 04/02/2027)", "182 Days TBILL MAT 19112026", "Government of India (24/07/2037)"]) {
  eq(`government paper is the Government of India: ${n}`, issuerKeyOf(n), "government-of-india");
}
eq("a state's development loan is that state's", issuerKeyOf("7.27% Gujarat SDL ISD 171225 MAT 171234^"),
  issuerKeyOf("State Government of Gujarat"));
eq("...with or without the word SDL", issuerKeyOf("7.48% Madhya Pradesh MAT 011045^"),
  issuerKeyOf("State Government of Madhya Pradesh"));
ok("`Government Securities` names no government and is not assigned one",
  issuerKeyOf("Government Securities") !== "government-of-india");

console.log("\n── 5. a company's paper joins the company the book holds (constructed) ──");
/**
 * THE ISSUER SEED, ON A CONSTRUCTED STORE, BECAUSE THE REAL CASE MOVES MONTHLY.
 *
 * `loadStockExposure` files a fund's line under the BOOK's company three ways:
 * the line's own ISIN is one the book carries; its ISIN's issuer prefix is one
 * the book's own company ISINs carry (the SEED); or the issuer's NAME keys the
 * same as the book's company. The seed is the backstop for the one case the
 * name tier cannot bridge: a depository that CLIPS the company's name, and a
 * fund that files only its debt, under the name written out.
 *
 * This book has exactly one such issuer today. It holds City Union under the
 * depository's `CITY UNION -EQ RE1/`, which keys as `city-union`, and two of
 * the funds it holds file City Union's certificates of deposit as `City Union
 * Bank Ltd.`, which keys as `city-union-bank`; of the six prefixes the seed
 * decides for the funds the page loads, it is the only one the name tier cannot
 * reach. `stockExposure.test.ts` asserts it on the real store — but that case
 * exists only while a fund the family holds files City Union's paper and none
 * files its share, and both of those move with every monthly filing. So the
 * same shape is constructed here, and the store is served from memory: this
 * suite fetches nothing else.
 *
 * AND THE FIRST MEASUREMENT OF THIS WAS WRONG, which is worth keeping. It read
 * every scheme file in the store, not the ones the page loads, and one of those
 * — a fund redeemed to nil — files City Union's SHARE; so it reported that the
 * seed decided three prefixes, all of which the name tier also reached. The
 * rendered page disagreed, and the page was right.
 */
const CONSTRUCTED_STORE: Record<string, unknown> = {
  "index.json": {
    source: {},
    schemes: {
      "constructed-liquid-fund": {
        schemecode: "CONSTRUCTED-1", scheme: "Constructed Liquid Fund", plan: "Direct", isin: null,
        matchedVia: "isin", navDate: null, holdingsAsOf: "2026-08-31", holdingsSource: "amc",
      },
    },
    unresolved: [],
  },
  "CONSTRUCTED-1.json": {
    schemecode: "CONSTRUCTED-1", scheme: "Constructed Liquid Fund", amfiSchemeName: null, amc: null,
    plan: "Direct", option: "Growth", classification: null, isin: null,
    nav: { value: null, date: null, prev: null, prevDate: null, changePct: null },
    returns: {}, returnsAsOf: null, fundAumCr: null, holdingsAsOf: "2026-08-31",
    holdingsSource: { kind: "amc", url: null }, section: "Whole portfolio", coveragePct: null, allocation: null,
    holdings: [{
      name: "City Union Bank Ltd. (15/06/2027) **", pctAum: 2.5, shares: null, isin: "INE491A16AB1",
      assetClass: "Debt", sector: null, rating: "CARE A1+", marketValueCr: 12.3,
    }],
    counts: { holdings: 1, byClass: { Debt: 1 } },
  },
};
(globalThis as { fetch?: unknown }).fetch = async (u: unknown) => {
  const hit = CONSTRUCTED_STORE[String(u).split("/").pop() ?? ""];
  return { ok: hit != null, json: async () => hit ?? null };
};
// `import.meta.env` is Vite's, and this runs in node.
(import.meta as { env?: Record<string, string> }).env ??= { BASE_URL: "/" };

const cdLine = "City Union Bank Ltd. (15/06/2027) **";
const funds: HeldFund[] = [{ securityKey: "constructed-liquid-fund", name: "Constructed Liquid Fund", marketValue: 1e8, assetClass: "Mutual Fund" }];
// THE PREMISE, stated so the case cannot pass by the name tier: the book's key
// and the filer's name must key apart, or this would test nothing the real book
// does not already test.
ok("the case needs the seed: the depository's key and the filer's name key apart",
  securityKeyOf("CITY UNION -EQ RE1/") !== issuerKeyOf(cdLine),
  `${securityKeyOf("CITY UNION -EQ RE1/")} vs ${issuerKeyOf(cdLine)}`);

const seeded = await loadStockExposure(funds, new Map([["INE491A01021", "city-union"]]));
const seededKeys = seeded.status === "ok" ? [...seeded.byKey.keys()] : [];
eq("the certificate of deposit joins the company the book holds, by the prefix of its ISIN", seededKeys, ["city-union"]);
const cdRow = seeded.status === "ok" ? seeded.byKey.get("city-union") : undefined;
eq("...named as its filer names the ISSUER, not as the instrument",
  cdRow?.name ?? null, "City Union Bank Ltd.");
ok("...while the instrument under it keeps its maturity",
  cdRow?.rows[0]?.instruments[0]?.name === "City Union Bank Ltd. (15/06/2027)", cdRow?.rows[0]?.instruments[0]?.name ?? "");
/**
 * AND IT REFUSES A PREFIX THE BOOK NAMES TWICE. Two book companies on one
 * issuer prefix, both equity series, is not a question the seed can answer —
 * guessing would file one company's debt under the other. So the line falls to
 * the name tier and stands as its filer named it.
 */
const refused = await loadStockExposure(funds,
  new Map([["INE491A01021", "city-union"], ["INE491A01039", "city-union-class-b"]]));
eq("a prefix two book companies share seeds neither", refused.status === "ok" ? [...refused.byKey.keys()] : [],
  [issuerKeyOf(cdLine)]);

process.exit(fails ? 1 : 0);
