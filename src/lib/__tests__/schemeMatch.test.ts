// HOW A HOLDING WAS JOINED TO ITS SCHEME, SAID AS IT HAPPENED.   npm run test:family
//
// DSM-C5, VD-19 and D5 in the audit. The fund card claimed a match on "this
// holding's own ISIN" for a scheme the store matched on its name and plan, and
// the header said the provider reports no ISIN — on a statement that prints one.
//
// Anchored on the COMMITTED fund store (`public/lookthrough/`), the book, and the
// archive's own statement text: the claim "the book carries no ISIN, but the
// statement prints one" is struck on the page text the extractor read.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { BOOK_POSITIONS } from "@/data/glowData";
import { isinAbsentWords, optionWords, schemeMatchWords } from "@/lib/schemeMatch";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const CLAIMS_HOLDING_ISIN = /this holding'?s (own )?ISIN/i;
const all = (w: ReturnType<typeof schemeMatchWords>) => [w.pill, w.pillTip, w.planSource, w.planTip].join(" | ");

console.log("── constructed ──");
{
  const w = schemeMatchWords("isin", "INF000X01AB1");
  ok("an ISIN match says so, on the pill, its hover and the plan caption", w.pill === "matched on ISIN"
    && CLAIMS_HOLDING_ISIN.test(w.pillTip) && w.planSource === "from this holding's ISIN");
}
{
  const w = schemeMatchWords("name+plan", "INF247L01EP5");
  ok("a name+plan match never claims the holding's ISIN, anywhere", !CLAIMS_HOLDING_ISIN.test(all(w)), all(w));
  ok("…names the store's ISIN as the store's", /INF247L01EP5 is the scheme's own ISIN, from the fund store/.test(w.pillTip));
  ok("…and says the plan is the one its statement names", w.planSource === "the plan its statement names");
}
{
  const w = schemeMatchWords("name", null);
  ok("a name-only match claims no plan and names no ISIN", !/plan its statement names/.test(w.pillTip) && !/INF/.test(w.pillTip)
    && w.planSource === "matched on the scheme's name");
  ok("a missing join reads as a name match, never as an ISIN one", !CLAIMS_HOLDING_ISIN.test(all(schemeMatchWords(null))));
}
{
  ok("a holding's header never says 'no ISIN reported' of its own statement", isinAbsentWords(false, null).text === "no ISIN in the book"
    && isinAbsentWords(false, "INF247L01EP5").tip.includes("INF247L01EP5"));
  ok("…while a company only a fund holds keeps the filing's own words", isinAbsentWords(true).text === "no ISIN reported");
}
{
  ok("the store's placeholder option reads as not stated", optionWords("unknown")?.text === "option not stated"
    && optionWords("Unknown")?.text === "option not stated" && optionWords("growth")?.text === "growth" && optionWords(null) === null);
}

console.log("── the committed fund store, the book and the archive ──");
const LT = "public/lookthrough";
const idx = JSON.parse(readFileSync(path.join(LT, "index.json"), "utf8"));
const schemes = Object.entries<any>(idx.schemes ?? {});
const bookIsin = (key: string) => BOOK_POSITIONS.some((p) => p.securityKey === key && !!p.isin);
let isinN = 0, otherN = 0; const wrong: string[] = [];
for (const [key, e] of schemes) {
  const w = schemeMatchWords(e.matchedVia, e.isin);
  if (e.matchedVia === "isin") { isinN++; if (!CLAIMS_HOLDING_ISIN.test(w.pillTip)) wrong.push(`${key}: an ISIN match not said`); }
  else { otherN++; if (CLAIMS_HOLDING_ISIN.test(all(w))) wrong.push(`${key}: claims the holding's ISIN`); }
}
ok("every scheme in the store is described by the join it was actually made on", wrong.length === 0 && isinN > 0,
  `${isinN} on ISIN, ${otherN} another way${wrong.length ? `; ${wrong.join("; ")}` : ""}`);

const named = schemes.filter(([, e]) => e.matchedVia !== "isin");
if (!named.length) ok("the store matches at least one scheme another way than the ISIN", false);
for (const [key, e] of named) {
  ok(`${key}: the book carries no ISIN for it — which is why the store matched another way`, !bookIsin(key));
  // The archive's documents for this holding: does the statement PRINT the ISIN
  // the book does not carry? Then "no ISIN reported" was false of it.
  const docs = readdirSync("public/audit").filter((d) => existsSync(path.join("public/audit", d, "document.json")))
    .filter((d) => readFileSync(path.join("public/audit", d, "document.json"), "utf8").includes(`"securityKey": "${key}"`));
  const printed = e.isin && docs.some((d) => {
    const pj = path.join("public/audit", d, "pages.json");
    return existsSync(pj) && new RegExp(`ISIN.{0,16}?${e.isin}`).test(readFileSync(pj, "utf8"));
  });
  ok(`${key}: its own statement prints ${e.isin ?? "an ISIN"}, so the header must not say none was reported`,
    !!printed && isinAbsentWords(false, e.isin).text !== "no ISIN reported", `${docs.length} document(s)`);
}

let unknown = 0, rendered = 0;
for (const [, e] of schemes) {
  const f = path.join(LT, `${e.schemecode}.json`);
  if (!existsSync(f)) continue;
  const o = JSON.parse(readFileSync(f, "utf8")).option;
  if (/^unknown$/i.test(String(o ?? ""))) unknown++;
  if (/unknown/i.test(optionWords(o)?.text ?? "")) rendered++;
}
ok("no scheme's option renders as the word 'unknown'", rendered === 0 && unknown > 0, `${unknown} scheme(s) the store leaves unknown`);

console.log(fails ? `\n${fails} failed` : "\nall passed");
if (fails) process.exit(1);
