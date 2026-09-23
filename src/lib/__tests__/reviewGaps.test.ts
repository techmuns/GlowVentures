// WHY A NAME THE FAMILY HOLDS IS ON NO SCREEN, CHECKED AGAINST THE BOOK AND
// THE REPORT.
//   npm run test:family
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
//   "According to the client, BSE is a holding for them … But it is not visible
//    anywhere on the dashboard. We cannot find BSE as a holding."
//
// They are right that they hold it and wrong that a statement carries it: BSE
// Ltd. is 40,000 shares on their own consolidated review and NO document in
// `source/` reports it — 251 PDFs, 7 spreadsheets and the whole audit archive
// were searched. So the book is right to carry nothing, and the DEFECT was
// that the screen could not say so.
//
// The failures worth catching here are the ones that render perfectly:
//
//   • a REVIEW FIGURE reaching the dashboard, which would end this book's own
//     guarantee that every number traces to the institution that struck it;
//   • a gap naming a holding the book DOES carry, which tells a reader their
//     own position is missing when it is on the screen behind the dropdown;
//   • the matcher growing a fuzzy tier and answering a search with the wrong
//     company — a wrong sentence about a reader's own money;
//   • the list emptying, so every check below passes over nothing.
//
// Every expectation is derived from the generated module, from `glowData.ts`
// and from the committed report on the run — never from a fixture, which would
// prove only that two inventions agree.
import { readFileSync } from "node:fs";
import { BOOK_POSITIONS } from "@/data/glowData";
import { REVIEW_GAPS, REVIEW_AS_OF } from "@/data/reviewGaps";
import { reviewGapsFor, claimableGaps } from "@/lib/reviewGaps";
import { securityKeyOf } from "@/lib/securityKey";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}`);
};

const MODULE_SRC = readFileSync("src/data/reviewGaps.ts", "utf8");
const REPORT = readFileSync("docs/REVIEW-RECONCILIATION.md", "utf8");

// ── 0. THE LIST HAS A SUBJECT ───────────────────────────────────────────────
//
// `golden.mjs`'s rule: a suite that passes over no input claims confidence
// nobody earned. Every check below is an `every()` or a lookup, and all of them
// are vacuously true against an empty list.
{
  ok("the gap list is not empty", REVIEW_GAPS.length > 0, `${REVIEW_GAPS.length}`);
  ok("it names the review's own as-of", /\d{4}$/.test(REVIEW_AS_OF), REVIEW_AS_OF);
}

// ── 1. NOT ONE FIGURE OF THE REVIEW'S CROSSES OVER ──────────────────────────
//
// THE LOAD-BEARING CHECK. The consolidated review is held out of the book by
// decision — it carries someone else's choices about what to include and how to
// value it — so the NAME and the two sentences may travel and a valuation may
// not. Struck on the emitted TYPE and on the emitted TEXT, because those fail
// differently: a numeric field is a schema change, and a rupee figure inside
// one of the sentences is a value smuggled through prose.
{
  const numeric = REVIEW_GAPS.flatMap((g) =>
    Object.entries(g).filter(([, v]) => typeof v === "number").map(([k]) => `${g.name}.${k}`));
  ok("no gap carries a numeric field", numeric.length === 0, numeric.join(", "));

  // The report is full of `₹15.46 Cr`; the module must carry none of it.
  ok("the report does state review values", /₹[\d,.]+ Cr/.test(REPORT));
  ok("the module states none", !/₹/.test(MODULE_SRC));
  const money = MODULE_SRC.match(/\b\d[\d,]*\.?\d*\s*(Cr|Lakh|L)\b/g) ?? [];
  ok("and no crore or lakh figure in its prose", money.length === 0, money.join(", "));
}

// ── 2. EVERY GAP IS GENUINELY ABSENT FROM THE BOOK ──────────────────────────
//
// The whole claim the screen makes. A line the book DOES carry appearing here
// would tell a reader a position is missing while it sits one dropdown away —
// which is worse than the silence this replaces, because it is a false
// statement rather than no statement. Keyed through `securityKeyOf`, the book's
// own identity, so a rename on either side is caught rather than papered over.
{
  const held = new Set(BOOK_POSITIONS.map((p) => securityKeyOf(p.security)));
  const wrong = REVIEW_GAPS.filter((g) => held.has(securityKeyOf(g.name))).map((g) => g.name);
  ok("no gap names a security the book carries", wrong.length === 0, wrong.join(", "));
}

// ── 3. EVERY GAP SAYS WHY, AND WHAT WOULD CLOSE IT ──────────────────────────
//
// `Absent.tsx`'s rule — a reason is a REQUIRED argument, because "no data" on
// its own tells a reader nothing about whether to go and find something.
{
  ok("every gap carries a reason", REVIEW_GAPS.every((g) => g.why.trim().length > 20));
  ok("every gap names a document", REVIEW_GAPS.every((g) => g.ask.trim().length > 20));
  // An AGGREGATE has no document to ask for, so it is not a line anybody can
  // act on and is left out at the generator rather than rendered as an ask.
  ok("no aggregate block is in the list", REVIEW_GAPS.every((g) => !/AGGREGATE/i.test(g.why)));
  // Markdown belongs in the report, not on screen.
  ok("no markdown survives into the sentences",
    REVIEW_GAPS.every((g) => !/\*\*|`/.test(g.why + g.ask)));
}

// ── 4. THE MODULE AND THE REPORT ARE ONE LIST ───────────────────────────────
//
// Two paths to one finding: the report renders `[...notInBook, ...trulyAbsent]`
// and the module projects the same array. They share `custodianNote` and
// `askFor` precisely so the ask list and the dashboard can never name different
// documents for one line — this is the check that says so.
{
  const missing = REVIEW_GAPS.filter((g) => !REPORT.includes(g.name)).map((g) => g.name);
  ok("every gap appears in the report", missing.length === 0, missing.join(", "));
}

// ── 5. THE FAMILY'S OWN QUESTION, ANSWERED ──────────────────────────────────
//
// Anchored on the name they asked about. If a future drop brings the Motilal
// holding statement, BSE leaves this list and these three flip — which is the
// point: the suite then says the absence has been closed rather than passing
// over a sentence that has quietly become false.
{
  const bse = REVIEW_GAPS.find((g) => /^BSE\b/i.test(g.name));
  ok("BSE Ltd. is a named gap", !!bse, bse?.name);
  ok("searching BSE finds it", reviewGapsFor("BSE").some((g) => g === bse));
  // The family named it twice in one sentence — "It is named either Bombay
  // Stock Exchange or BSE" — and the review prints only the short form.
  ok("searching Bombay Stock Exchange finds it too",
    reviewGapsFor("Bombay Stock Exchange").some((g) => g === bse));
  ok("it names Motilal Oswal as the custodian to ask",
    !!bse && /Motilal/i.test(bse.why) && /Motilal/i.test(bse.ask));
}

// ── 6. THE MATCHER HAS NO FUZZY TIER ────────────────────────────────────────
//
// `shared/nameMatch.mjs` records what a token-overlap rule did to this corpus:
// `KIRANAKART TECHNOLOGIES (Zepto)` matched to `TATA TECHNOLOGIES`, `MAN
// INDUSTRIES` to `Deep Industries`. A wrong match here answers a reader's
// search with the wrong company's absence, so every hit must be a substring
// relation in one direction or the other.
{
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const substringRelated = (q: string, g: { name: string; aliases: string[] }) =>
    [g.name, ...g.aliases].some((s) => norm(s).includes(norm(q)) || norm(q).includes(norm(s)));

  // DERIVED, not typed. The first draft named "vedanta" as the probe that must
  // find something — and Vedanta is precisely what §6b then withheld, so a
  // correct build failed this check. A probe list that names a case by hand goes
  // stale the moment the rule it was written against moves.
  const claimed = claimableGaps();
  const derived = claimed.slice(0, 3).map((g) => g.name.split(/[^A-Za-z]+/)[0]);
  const probes = [...derived, "Tata Technologies", "Deep Industries", "reliance",
    "Star Health", "zzzz"];
  const bad = probes.flatMap((q) => reviewGapsFor(q, 50)
    .filter((g) => !substringRelated(q, g))
    .map((g) => `${q} -> ${g.name}`));
  ok("every hit is a substring relation, in one direction or the other",
    bad.length === 0, bad.join("; "));

  // A one-character query names half the list under a substring rule, which is
  // noise rather than an answer.
  ok("a one-character query matches nothing", reviewGapsFor("b").length === 0);
  ok("an unrelated query matches nothing", reviewGapsFor("zzzz").length === 0);

  // AND IT IS LOAD-BEARING: the probes must actually find things, or the check
  // above passes by matching nothing at all. Counted across the whole list, so
  // no single name has to keep being the one that hits.
  const hits = probes.reduce((n, q) => n + reviewGapsFor(q, 50).length, 0);
  ok("the probes do find gaps", hits >= 2, `${hits}`);

  // Closest first: a reader typing a full name is not led by a longer line that
  // merely contains it.
  const exact = claimed[0];
  ok("an exact name ranks first", reviewGapsFor(exact.name)[0]?.name === exact.name);
}

// ── 6b. A GAP THE BOOK MAY HOLD UNDER A CLIPPED NAME IS NEVER CLAIMED ───────
//
// Check 2 above is keyed on `securityKeyOf`, which is EXACT — and a depository
// clips: the book holds `ONESOURCE SPECIAL-EQ` (48,000 shares, ₹8.61 Cr) while
// the review writes `Onesource Specialty Pharma`, so the keys differ and the
// note told a reader no statement reported a position sitting one search away.
//
// THE SUPPRESSION TIER IS LOOSER THAN THE JOIN TIER, ON PURPOSE. A weak match in
// `shared/nameMatch.mjs` publishes a figure; a weak match here only decides
// whether to stay quiet. Suppressing too much costs the silence a reader already
// had; suppressing too little tells them their own holding is missing.
{
  const flat = (k: string) => k.replace(/-/g, "");
  const bookKeys = [...new Set(BOOK_POSITIONS.map((p) => securityKeyOf(p.security)))].filter(Boolean);
  const related = (name: string) => {
    const k = securityKeyOf(name);
    return !!k && bookKeys.some((bk) =>
      bk.startsWith(k) || k.startsWith(bk) || flat(bk).startsWith(flat(k)) || flat(k).startsWith(flat(bk)));
  };

  const claimable = claimableGaps();
  const leaked = claimable.filter((g) => related(g.name)).map((g) => g.name);
  ok("no claimable gap shares a name with a book position", leaked.length === 0, leaked.join(", "));

  // LOAD-BEARING: the tier must actually withhold something, or the check above
  // passes over a filter that does nothing.
  const withheld = REVIEW_GAPS.length - claimable.length;
  ok("the tier withholds the gaps it is for", withheld > 0, `${withheld} of ${REVIEW_GAPS.length}`);

  // The case the family's own screenshot contains: the book's row is visible in
  // it at ₹8.15 Cr, and a search for the review's spelling must not deny it.
  ok("Onesource is never claimed absent",
    reviewGapsFor("Onesource Specialty Pharma").length === 0);
  ok("…and BSE, which the book really does not hold, still is",
    reviewGapsFor("BSE").length === 1);
}

// ── 7. EVERY SEARCH A READER CAN RUN OVER HOLDINGS IS WIRED TO IT ───────────
//
// `check:pages` drives the Portfolio Monitor's pick-list, which is the control
// the family used — and it does NOT drive the other two, because reaching their
// empty state needs a search that matches nothing and no route types one. So a
// page quietly dropping the wiring would go unseen, which is the shape of
// regression this repo keeps finding.
//
// A SOURCE CHECK IS CRUDE AND IT CATCHES EXACTLY THAT. It cannot tell a working
// note from a broken one — the Monitor walk is what does that, on the shared
// component all three render — but it can tell a caller that stopped rendering
// one at all, which is the half nothing else would report.
{
  const SURFACES = [
    ["the Portfolio Monitor's holdings pick-list", "src/pages/PortfolioMonitor.tsx"],
    ["Family & Entities' holdings search", "src/pages/FamilyEntities.tsx"],
    ["the /holdings drill-down filter", "src/pages/HoldingsBehind.tsx"],
  ];
  for (const [what, file] of SURFACES) {
    const src = readFileSync(file, "utf8");
    ok(`${what} renders the absence`, /<AbsentFromBook\b/.test(src));
  }
}

console.log(fails ? `\n${fails} FAILED` : "\nall review-gap checks passed");
process.exit(fails ? 1 : 0);
