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
// without anyone adding a case for it.
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
import { displayFiledName, displaySecurity, stripFilingMarks } from "@/lib/format";
import { securityKeyOf } from "@/lib/securityKey";
import { labelVariants, securityLabel } from "@/lib/securityLabel";
import { issuerKeyOf, issuerNameOf } from "@/lib/lookthrough";
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
const bySymbol = new Map<string, Set<string>>();
for (const p of BOOK_POSITIONS) {
  const s = SYM[p.securityKey];
  if (s) (bySymbol.get(s) ?? bySymbol.set(s, new Set()).get(s)!).add(p.securityKey);
}
const twice = [...bySymbol].filter(([, ks]) => ks.size > 1);
ok("no NSE symbol is carried by two keys in the book", twice.length === 0,
  twice.length ? twice.map(([s, ks]) => `${s}: ${[...ks].join(" | ")}`).join("; ") : `${bySymbol.size} symbols, one key each`);
ok("...and the check has something to check", bySymbol.size > 100, `${bySymbol.size} symbols`);

console.log("\n── 2. one label per key ──");
const labels = new Map<string, Set<string>>();
for (const p of BOOK_POSITIONS) {
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
ok("the Kaynes the family searched for is one name", new Set(
  BOOK_POSITIONS.filter((p) => /kaynes/i.test(p.security)).map((p) => securityLabel(p.securityKey, p.security))).size === 1);

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

process.exit(fails ? 1 : 0);
