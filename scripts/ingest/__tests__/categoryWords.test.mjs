// A FUND'S SEBI CATEGORY IS QUOTED FROM ITS PAPERWORK, OR IT IS NOT WRITTEN.
// Run: node scripts/ingest/__tests__/categoryWords.test.mjs
//
// `Account.providerEngagement` is the provider's own wording about the vehicle
// (CLAUDE.md §5), and `shared/aifCategory.mjs` reads the SEBI category out of it
// — which puts a chip on the fund, files it under a heading in the AIF
// drill-down and, where the family have not placed it, decides its side of the
// book. So a category in that string is a claim ABOUT A DOCUMENT, and the figure
// audit found four readers getting it wrong in both directions:
//
//   • Transition Venture wrote "Category I/II AIF — drawdown" — neither
//     statement prints a category (their `Sebi Reg. no.-` line is blank), and
//     the drill-down told a reader the issuer "names Category I and Category II
//     and commits to neither" (PM-C3);
//   • Founders and India SME wrote "Category II AIF - …" — no statement, tape
//     or other document in the archive names a category for either;
//   • Neo Infra wrote none — while its manager block prints "AIF -Category-II
//     No : IN/AIF2/22-23/1042", so the fund read "Category not stated" beside a
//     statement that states it (PM-C2).
//
// Three things are therefore held here, and none implies another:
//
//   1. every layout whose category words changed is REPLAYED from its committed
//      text and must reproduce the archive, and the two that now READ a line
//      off the page are broken one line at a time;
//   2. every category an engagement names is EVIDENCED by the archive's own
//      text — the document's own pages, its SEBI registration code, or another
//      statement naming the same fund with that category — and every quotation
//      an engagement carries is found verbatim;
//   3. every category an AIF account's own statements PRINT is CARRIED by that
//      account's engagement or holding names, which is the direction the Neo
//      defect ran and the one nothing else in this repo could see.
//
// Checks 2 and 3 are functions over a document set, so each is also run on the
// archive with the OLD strings put back in memory — the bug-reintroduction proof
// lives in the suite rather than in a harness someone has to remember to run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { categoriesNamedIn } from "../../../shared/aifCategory.mjs";
import { splitFundClass } from "../../../shared/securityKey.mjs";
import { extract as extractAlt } from "../providers/altFundStatements.mjs";
import { extract as extractTvc } from "../providers/transitionVenture.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const AUDIT = path.join(ROOT, "public/audit");
let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log("categoryWords");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const pagesOf = (docKey) => readJson(path.join(AUDIT, docKey, "pages.json")).pages.map((x) => ({ page: x.page, text: x.text ?? "" }));
const docOf = (docKey) => readJson(path.join(AUDIT, docKey, "document.json"));
/** Apply one replacement to whichever pages carry it; a fixture that no longer
 *  contains the text throws, so a mutation can never silently do nothing. */
const pagesWith = (pages, from, to) => {
  if (!pages.some((p) => p.text.includes(from))) throw new Error(`fixture no longer contains ${JSON.stringify(from)}`);
  return pages.map((p) => ({ ...p, text: p.text.split(from).join(to) }));
};
/** Whitespace collapsed exactly as the readers collapse it. */
const flatOf = (pages) => pages.map((p) => p.text).join("\n").replace(/[ \t]+/g, " ");
/** The engagement a replay produced, as a string or nothing — a reader that
 *  hands back a function or an object has not produced wording at all. */
const engOf = (doc) => (typeof doc?.providerEngagement === "string" ? doc.providerEngagement : "");

// ── 1a. NEO INFRA: THE REGISTRATION IS READ, NOT WRITTEN ─────────────────────
const NEO = "neo-infra-income-opportunities-fund-9039920536-2026-06-30-holdings";
const NEO_LINE = "AIF -Category-II No : IN/AIF2/22-23/1042";
{
  const pages = pagesOf(NEO);
  const flat = flatOf(pages);
  ok("Neo: the committed statement prints its registration line", flat.includes(NEO_LINE),
    "the premise of this block — re-read the page if the fixture changed");
  const doc = extractAlt({ grid: { pages }, meta: { docKey: NEO } });
  const eng = engOf(doc);
  ok("Neo: the replay reproduces the archived engagement", eng === docOf(NEO).providerEngagement,
    `${eng}\n       vs ${docOf(NEO).providerEngagement}`);
  ok("Neo: the engagement quotes the registration verbatim", eng.includes(`"${NEO_LINE}"`), eng);
  ok("Neo: …so the category read off it is Category II and nothing else",
    eq(categoriesNamedIn(eng), ["Category II"]), JSON.stringify(categoriesNamedIn(eng)));

  // Remove the line: no category may be claimed, and none of the registration.
  const gone = engOf(extractAlt({ grid: { pages: pagesWith(pages, NEO_LINE, "") }, meta: { docKey: NEO } }));
  ok("Neo: with the registration line gone, no category is claimed",
    categoriesNamedIn(gone).length === 0 && !/IN\/AIF/.test(gone), gone);
  // A different category on the same line is read as THAT category — which is
  // what says the reader reads the page rather than carrying "II" for this fund.
  const iii = engOf(extractAlt({ grid: { pages: pagesWith(pages, NEO_LINE, "AIF -Category-III No : IN/AIF3/22-23/1042") }, meta: { docKey: NEO } }));
  ok("Neo: a Category III registration is read as Category III", eq(categoriesNamedIn(iii), ["Category III"]), iii);
}

// ── 1b. TRANSITION VENTURE: THE BLANK LINE IS BLANK ─────────────────────────
const TVC = ["transition-venture-capital-tvc262-2026-03-31-unknown", "transition-venture-capital-tvc263-2026-03-31-unknown"];
for (const docKey of TVC) {
  const pages = pagesOf(docKey);
  const flat = flatOf(pages);
  const tag = docKey.match(/tvc\d+/)[0].toUpperCase();
  ok(`${tag}: its statement prints no category and a blank Sebi Reg. line`,
    categoriesNamedIn(flat).length === 0 && /Sebi Reg\. no\.-\n/.test(flat), "the premise of this block");
  const eng = engOf(extractTvc({ grid: { pages }, meta: { docKey } }));
  ok(`${tag}: the replay reproduces the archived engagement`, eng === docOf(docKey).providerEngagement,
    `${eng}\n       vs ${docOf(docKey).providerEngagement}`);
  ok(`${tag}: the engagement names no category`, categoriesNamedIn(eng).length === 0, eng);
  ok(`${tag}: …and says the registration line is blank`, /Sebi Reg\. no\. line is blank/.test(eng), eng);
  const filled = engOf(extractTvc({ grid: { pages: pagesWith(pages, "Sebi Reg. no.-\n", "Sebi Reg. no.- IN/AIF2/19-20/0999\n") }, meta: { docKey } }));
  ok(`${tag}: a registration printed on the line is quoted, not decoded`,
    filled.includes(`"IN/AIF2/19-20/0999"`) && categoriesNamedIn(filled).length === 0 && !/blank/.test(filled), filled);
  const dropped = engOf(extractTvc({ grid: { pages: pagesWith(pages, "Sebi Reg. no.-\n", "\n") }, meta: { docKey } }));
  ok(`${tag}: a statement without the line says nothing about it`, !/Sebi Reg/.test(dropped), dropped);
}

// ── 1c. THE LAYOUTS THAT CLAIMED A CATEGORY NOTHING PRINTS ─────────────────
// Founders and India SME wrote "Category II AIF - …" into a fixed string; 3P's
// Category III is real but printed on the DEPOSITORY's tape rather than its own
// statement, so its string says where. Replayed, so a reader that put the old
// words back fails here before a re-extraction could land them.
const FIXED = [
  ["motilal-oswal-founders-fund-90410016093-2026-07-31-holdings", []],
  ["motilal-oswal-founders-fund-90410016104-2026-07-31-holdings", []],
  ["motilal-oswal-founders-fund-90410016104-2026-07-31-holdings-2", []],
  ["india-sme-investments-175962-2026-06-30-holdings", []],
  ["india-sme-investments-175964-2026-06-30-holdings", []],
  ["india-sme-investments-177302-2026-06-30-holdings", []],
  ["3p-investment-managers-3000048-2026-07-31-holdings", ["Category III"]],
];
for (const [docKey, want] of FIXED) {
  const pages = pagesOf(docKey);
  const eng = engOf(extractAlt({ grid: { pages }, meta: { docKey } }));
  const tag = docKey.replace(/-\d{4}-\d{2}-\d{2}.*$/, "");
  ok(`${tag}: the replay reproduces the archived engagement`, eng === docOf(docKey).providerEngagement,
    `${eng}\n       vs ${docOf(docKey).providerEngagement}`);
  ok(`${tag}: its own statement prints no category`, categoriesNamedIn(flatOf(pages)).length === 0, "the premise of this block");
  ok(`${tag}: the engagement names ${want.length ? want.join(" + ") : "no category"}`, eq(categoriesNamedIn(eng), want), eng);
}

// ── 2 & 3. THE ARCHIVE'S OWN TEXT IS THE WITNESS ────────────────────────────
//
// A document set is { docKey, doc, text } per archived document. Statements the
// pipeline holds out by decision (the family review, the investment register,
// the unidentified scan) are `failed` in the archive and are never evidence:
// an aggregation naming a category is somebody else's decision, not the fund's.
const loadArchive = () => fs.readdirSync(AUDIT).sort()
  .filter((k) => fs.existsSync(path.join(AUDIT, k, "document.json")))
  .map((docKey) => {
    const doc = docOf(docKey);
    const pj = path.join(AUDIT, docKey, "pages.json");
    const text = fs.existsSync(pj) ? readJson(pj).pages.map((p) => p.text ?? "").join("\n") : "";
    return { docKey, doc, text };
  });
const norm = (s) => String(s ?? "").toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
const collapse = (s) => String(s ?? "").replace(/\s+/g, " ");
const REG_CATEGORY = { 1: "Category I", 2: "Category II", 3: "Category III" };

/** The names a document carries for ITS OWN fund: its strategy and its
 *  holdings, with a unit-class tail cut off. Never the provider — a manager
 *  runs funds of different categories. */
const fundNamesOf = (doc) => [...new Set([doc.strategy, ...(doc.holdings ?? []).map((h) => h.security)]
  .filter(Boolean)
  .flatMap((n) => [n, splitFundClass(n)?.fund].filter(Boolean))
  .map(norm)
  .filter((n) => n.length >= 12))];

/** Where each category an engagement names is printed. Returns one row per
 *  (document, category) with the tier that evidences it, or `null`. */
function engagementEvidence(set) {
  const evidence = set.filter((d) => d.doc.status !== "failed").map((d) => ({ ...d, n: norm(d.text) }));
  const rows = [];
  for (const d of set) {
    const cats = categoriesNamedIn(d.doc.providerEngagement ?? "");
    if (!cats.length) continue;
    const own = new Set(categoriesNamedIn(d.text));
    const regs = new Set([...d.text.matchAll(/IN\/AIF([123])\//g)].map((m) => REG_CATEGORY[m[1]]));
    const names = fundNamesOf(d.doc);
    for (const c of cats) {
      let tier = own.has(c) ? "own text" : regs.has(c) ? "own registration code" : null;
      if (!tier) {
        for (const e of evidence) {
          if (e.docKey === d.docKey) continue;
          for (const name of names) {
            let at = e.n.indexOf(name);
            while (at >= 0 && !tier) {
              if (categoriesNamedIn(e.n.slice(at + name.length, at + name.length + 160)).includes(c)) tier = `named with the fund in ${e.docKey}`;
              at = e.n.indexOf(name, at + 1);
            }
            if (tier) break;
          }
          if (tier) break;
        }
      }
      rows.push({ docKey: d.docKey, category: c, tier });
    }
  }
  return rows;
}

/** Every "…" quotation of twelve characters or more an engagement carries must
 *  be printed, verbatim up to whitespace, somewhere in the archive's text. */
function unquotedQuotations(set) {
  const corpus = set.filter((d) => d.doc.status !== "failed").map((d) => collapse(d.text)).join("\n");
  const bad = [];
  for (const d of set) {
    for (const m of String(d.doc.providerEngagement ?? "").matchAll(/"([^"]{12,})"/g)) {
      if (!corpus.includes(collapse(m[1]))) bad.push(`${d.docKey}: "${m[1]}"`);
    }
  }
  return bad;
}

/** THE NEO DIRECTION: a category an AIF account's own statements print, which
 *  none of that account's documents carry — in an engagement or a holding's
 *  name — so `readAifCategory` can never see it. Struck per ACCOUNT, because a
 *  capital register carries no holding and its fund's category rides on the
 *  same account's holdings statement. */
function uncarriedCategories(set) {
  const byAcct = new Map();
  for (const d of set) {
    if (d.doc.engagement !== "AIF" || d.doc.status === "failed") continue;
    const k = `${d.doc.provider}|${d.doc.accountNo}`;
    const a = byAcct.get(k) ?? { printed: new Map(), carried: new Set() };
    for (const c of categoriesNamedIn(d.text)) if (!a.printed.has(c)) a.printed.set(c, d.docKey);
    for (const c of categoriesNamedIn(d.doc.providerEngagement ?? "")) a.carried.add(c);
    for (const h of d.doc.holdings ?? []) for (const c of categoriesNamedIn(h.security ?? "")) a.carried.add(c);
    byAcct.set(k, a);
  }
  const bad = [];
  for (const [k, a] of byAcct) for (const [c, docKey] of a.printed) if (!a.carried.has(c)) bad.push(`${k}: ${c} printed on ${docKey}`);
  return bad;
}

const ARCHIVE = loadArchive();
ok("the archive loads", ARCHIVE.length > 200, `${ARCHIVE.length} documents`);
{
  const rows = engagementEvidence(ARCHIVE);
  const missing = rows.filter((r) => !r.tier);
  ok("every category an engagement names is printed somewhere in the archive", missing.length === 0,
    missing.map((r) => `${r.docKey}: ${r.category}`).join("; "));
  // THE CHECK MUST HAVE SOMETHING TO BITE ON — and all three tiers are used by
  // this book, so a tier that stopped working would show up as a failure above
  // rather than as a quietly narrower guard.
  const tiers = new Set(rows.map((r) => (r.tier ?? "").replace(/ in .*$/, "")));
  ok("the evidence check is exercised on all three tiers",
    rows.length >= 30 && ["own text", "own registration code", "named with the fund"].every((t) => tiers.has(t)),
    `${rows.length} claims · tiers ${[...tiers].join(", ")}`);
  const three = rows.filter((r) => r.docKey.startsWith("3p-investment-managers"));
  ok("3P's Category III is the depository tape's own scheme name",
    three.length === 1 && /named with the fund in motilal-oswal/.test(three[0].tier ?? ""), JSON.stringify(three));
  const q = unquotedQuotations(ARCHIVE);
  ok("every quotation an engagement carries is printed verbatim", q.length === 0, q.join("; "));
  const u = uncarriedCategories(ARCHIVE);
  ok("every category an AIF account's statements print is carried by that account", u.length === 0, u.join("; "));
}

// ── THE OLD STRINGS, PUT BACK IN MEMORY, EACH FAIL THE CHECK THEY SHOULD ────
//
// The archive on disk is never touched. Each mutation restores one reader's
// former output on a copy of the document set and asserts the matching check
// reports it BY DOCUMENT — so a check that could not fail on this corpus fails
// this suite instead of passing it.
const withEngagement = (pred, engagement) => ARCHIVE.map((d) => pred(d.docKey)
  ? { ...d, doc: { ...d.doc, providerEngagement: engagement } } : d);
{
  // Counted RELATIVE to the archive as it stands, so each case asserts only the
  // failure it introduces and a second defect elsewhere cannot mask it.
  const baseUncarried = uncarriedCategories(ARCHIVE);
  const baseUnquoted = unquotedQuotations(ARCHIVE);
  const tv = engagementEvidence(withEngagement((k) => k.startsWith("transition-venture"), "Category I/II AIF — drawdown"))
    .filter((r) => r.docKey.startsWith("transition-venture") && !r.tier);
  ok("the old Transition Venture string fails the evidence check, both categories, both trusts",
    tv.length === 4, JSON.stringify(tv));
  const fo = engagementEvidence(withEngagement((k) => k.startsWith("motilal-oswal-founders"), "Category II AIF - drawdown, with a commitment and called capital"))
    .filter((r) => r.docKey.startsWith("motilal-oswal-founders") && !r.tier);
  ok("the old Founders string fails the evidence check on all three documents", fo.length === 3, JSON.stringify(fo));
  const sme = engagementEvidence(withEngagement((k) => k.startsWith("india-sme"), "Category II AIF - drawdown, with a commitment and uncalled capital"))
    .filter((r) => r.docKey.startsWith("india-sme") && !r.tier);
  ok("the old India SME string fails the evidence check on all three folios", sme.length === 3, JSON.stringify(sme));
  const neo = uncarriedCategories(withEngagement((k) => k === NEO, "drawdown fund — the statement prints a capital commitment, dated drawdowns and a quarterly NAV"));
  ok("the old Neo Infra string fails the carried check — Category II printed and carried nowhere",
    neo.length === baseUncarried.length + 1 && neo.some((l) => /Neo Infra.*Category II printed on neo-infra/.test(l)), JSON.stringify(neo));
  const misquote = unquotedQuotations(withEngagement((k) => k === NEO,
    `drawdown fund; its manager block prints the SEBI registration "AIF -Category-II No : IN/AIF2/22-23/1043"`));
  ok("a quotation the page does not print fails the quotation check",
    misquote.length === baseUnquoted.length + 1 && misquote.some((l) => l.includes("22-23/1043")), JSON.stringify(misquote));
  // AND A FUTURE STATEMENT THAT DOES PRINT A CATEGORY FOR FOUNDERS: its reader
  // writes "prints no SEBI category" as a fixed sentence, so the carried check
  // is what turns that sentence false by name the day the page changes.
  const printed = uncarriedCategories(ARCHIVE.map((d) => d.docKey === "motilal-oswal-founders-fund-90410016104-2026-07-31-holdings"
    ? { ...d, text: `${d.text}\nMotilal Oswal Founders Fund Series II (A Category II AIF Scheme)` } : d));
  ok("a Founders statement that starts printing a category fails the carried check",
    printed.length === baseUncarried.length + 1 && printed.some((l) => /Founders.*Category II/.test(l)), JSON.stringify(printed));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
