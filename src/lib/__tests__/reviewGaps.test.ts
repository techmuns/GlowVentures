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
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_SHARE_MOVEMENTS, BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
import { REVIEW_GAPS, REVIEW_AS_OF } from "@/data/reviewGaps";
import { reviewGapsFor, claimableGaps, REVIEW_LINE_ISINS, REVIEW_LINES_KEPT_OUT, reportedByStatement } from "@/lib/reviewGaps";
import { depositoryFundHoldings, unpricedStatementUnits } from "@/lib/fundNavs";
import { securityKeyOf } from "@/lib/securityKey";
import SCHEME_NAMES from "@/data/schemeNames.json";
import { BOOK_FUND_NAVS } from "@/data/fundNavs";

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

// ── 6c. …NOR ONE A STATEMENT REPORTS, WHETHER OR NOT THIS BOOK VALUES IT ────
//
// The note says "no statement reports it", and that is a claim about the
// STATEMENTS. Measured, it was false for sixteen lines no name rule reaches: a
// depository prints the AMC's name in front of the scheme's or clips it, and it
// prints an unlisted company's instrument in full where the review writes a
// brand.
// `REVIEW_LINE_ISINS` joins each line to the ISINs a statement reports it
// under, BY HAND. Five claims per entry, and the last is what licenses the join
// rather than a comment asserting it: the review's own units for that line are
// a statement's own units of that ISIN — a closing that is the statement's
// balance on the review's own date, or a purchase the depository credits unit
// for unit.
{
  ok("the statement-reported table has a subject", REVIEW_LINE_ISINS.size > 0, `${REVIEW_LINE_ISINS.size}`);

  // The ISINs the statements report, re-derived here rather than read from the
  // module, so a module that stopped reading one of the three sources fails.
  const up = (x: string | null | undefined) => (x ?? "").trim().toUpperCase();
  const statementIsins = new Set([
    ...BOOK_POSITIONS.filter((p) => p.quantity > 0).map((p) => up(p.isin)),
    ...BOOK_UNVALUED_HOLDINGS.filter((u) => (u.quantity ?? 0) > 0).map((u) => up(u.isin)),
    ...Object.values(BOOK_SHARE_MOVEMENTS).filter((w) => w.reason == null).map((w) => up(w.isin)),
  ].filter(Boolean));

  const flat = (k: string) => k.replace(/-/g, "");
  const bookKeys = [...new Set(BOOK_POSITIONS.map((p) => securityKeyOf(p.security)))].filter(Boolean);
  const related = (name: string) => {
    const k = securityKeyOf(name);
    return !!k && bookKeys.some((bk) =>
      bk.startsWith(k) || k.startsWith(bk) || flat(bk).startsWith(flat(k)) || flat(k).startsWith(flat(bk)));
  };

  // The review's own purchases and closings, each with its holder, date, units
  // and the rate it prices the line at. Read the way `fundNavs.test.ts` reads
  // them; the review is the claim being checked, never the witness.
  const REVIEW = path.join(process.cwd(), "source", "august-2026-d",
    "Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx");
  type Row = { holder: string; product: string; date: string; units: number; rate: number };
  const buys: Row[] = [];
  const closings: Row[] = [];
  if (existsSync(REVIEW)) {
    const wb = XLSX.readFile(REVIEW);
    const sheet = wb.SheetNames.find((n) => /transactions since inception/i.test(n));
    const rows = sheet
      ? (XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, defval: "" }) as unknown[][])
      : [];
    const excelDate = (n: number) => new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
    for (const r of rows) {
      for (const [kind, into] of [["closing", closings], ["purchase", buys]] as const) {
        const j = r.findIndex((c) => String(c).trim().toLowerCase() === kind);
        if (j < 1) continue;
        const units = Number(r[j + 2]);
        if (Number.isFinite(units) && units > 0)
          into.push({ holder: String(r[0]), product: String(r[j - 1]), date: excelDate(Number(r[j + 1])), units, rate: Number(r[j + 3]) });
      }
    }
  }
  ok("the family's review is on disk to witness the joins", closings.length > 0 && buys.length > 0, REVIEW);

  // A CLOSING IS THE REVIEW'S HOLDING ON THE REVIEW'S OWN DATE, whatever date
  // its row carries: the review is struck on one day, and its Zepto closing is
  // dated 31 July 2025, the last time it marked the unlisted share. So every
  // closing is set against the statements' balance on the latest date the
  // sheet closes on — the review's own as-of.
  const reviewOn = closings.reduce((m, c) => (c.date > m ? c.date : m), "");
  ok("the review's closings name the review's own date", reviewOn === "2026-06-30", reviewOn);

  // A statement's own units of one ISIN on a date: a depository window's
  // printed running balance at that date (its opening, where it printed no row
  // before it), and a holding statement's quantity. Never the review's.
  type Doc = { transactions?: { isin?: string | null; date?: string; quantity?: number | null; side?: string; description?: string }[] };
  const docs = new Map<string, Doc>();
  const doc = (src: string): Doc => {
    if (!docs.has(src)) {
      const f = path.join(process.cwd(), "public", "audit", src, "document.json");
      docs.set(src, existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) as Doc : {});
    }
    return docs.get(src)!;
  };
  const ownerOf = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a.owner]));
  const first = (s: string | undefined) => (s ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  type Balance = { isin: string; owner: string; units: number; how: string };
  const balancesOn = (date: string, isins: readonly string[]): Balance[] => {
    const out: Balance[] = [];
    for (const w of Object.values(BOOK_SHARE_MOVEMENTS)) {
      const isin = up(w.isin);
      if (!isins.includes(isin) || w.reason != null || !w.source || !w.periodFrom || !w.periodTo) continue;
      if (date < w.periodFrom || date > w.periodTo) continue;
      const before = (doc(w.source).transactions ?? []).filter((t) => up(t.isin) === isin && (t.date ?? "") <= date);
      const printed = before.length ? /balance ([\d.,]+)/.exec(before[before.length - 1].description ?? "")?.[1] : null;
      const units = before.length ? Number(String(printed ?? "").replace(/,/g, "")) : w.opening;
      if (typeof units === "number" && Number.isFinite(units))
        out.push({ isin, owner: ownerOf.get(w.accountId) ?? "", units, how: "the depository's own balance that day" });
    }
    for (const p of BOOK_POSITIONS)
      if (isins.includes(up(p.isin)) && p.quantity > 0)
        out.push({ isin: up(p.isin), owner: ownerOf.get(p.accountId) ?? "", units: p.quantity, how: "a holding statement's quantity" });
    for (const u of BOOK_UNVALUED_HOLDINGS)
      if (isins.includes(up(u.isin)) && (u.quantity ?? 0) > 0)
        out.push({ isin: up(u.isin), owner: ownerOf.get(u.accountId) ?? "", units: u.quantity!, how: "a holding statement's quantity, printed with no rate" });
    return out;
  };
  const credits = (isins: readonly string[]) => Object.values(BOOK_SHARE_MOVEMENTS)
    .filter((w) => isins.includes(up(w.isin)) && w.source)
    .flatMap((w) => (doc(w.source!).transactions ?? [])
      .filter((t) => up(t.isin) === up(w.isin) && t.side === "receipt" && typeof t.quantity === "number" && t.quantity > 0 && !!t.date)
      .map((t) => ({ date: t.date!, units: t.quantity! })));
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  const same = (a: number, b: number) => Math.abs(a - b) < 0.0005;

  for (const [name, isins] of REVIEW_LINE_ISINS) {
    const gap = REVIEW_GAPS.find((g) => g.name === name);
    ok(`${name}: a line the gap list carries — an entry naming none is dead`, !!gap);
    const reported = isins.filter((i) => statementIsins.has(i));
    ok(`${name}: a statement this dashboard reads reports ${isins.join(" / ")}`, reported.length > 0);
    ok(`${name}: a search for its own name is told nothing about it`,
      !reviewGapsFor(name).some((g) => g.name === name) && (!gap || reportedByStatement(gap)));
    // LOAD-BEARING: without this tier the name tier would have claimed it, or
    // the entry protects nothing and the check above passes over a no-op.
    ok(`${name}: …and the name tier alone would have claimed it absent`, !related(name));

    // THE WITNESS. A closing is tied only to a balance of the same holder: two
    // members holding the same units of one scheme is not a coincidence this
    // check may rely on.
    const closed = closings.filter((c) => c.product === name).flatMap((c) => balancesOn(reviewOn, isins)
      .filter((b) => same(b.units, c.units) && first(b.owner) === first(c.holder))
      .map((b) => `${c.holder}, ${+c.units.toFixed(3)} units on ${reviewOn}: ${b.how}`));
    const cr = credits(isins);
    const bought = buys.filter((b) => b.product === name)
      .filter((b) => cr.some((c) => same(c.units, b.units) && days(c.date, b.date) <= 5))
      .map((b) => `${b.units} units bought on ${b.date} are a depository credit`);
    const witness = [...closed, ...bought];
    ok(`${name}: the review's own units of this line are a statement's own units of ${isins.join(" / ")}`,
      witness.length > 0, witness[0] ?? "no closing or purchase of this line ties to a statement");
  }

  /**
   * A-17: A LINE THE LIVE BOOK VALUES FROM UNITS A HOLDING STATEMENT RECORDS
   * WITH NO RATE is witnessed on EVERY such row, not on one of them. Those rows
   * are valued at AMFI's NAV on the statement's units alone, so the review
   * closing each holder at exactly that balance is what says the units are the
   * line's.
   */
  const live = [...depositoryFundHoldings(), ...unpricedStatementUnits()];
  for (const [name, isins] of REVIEW_LINE_ISINS) {
    const rows = live.filter((p) => isins.includes(up(p.isin)) && p.depositoryUnits?.kind === "no-rate");
    if (!rows.length) continue;
    const unwitnessed = rows.filter((p) => !closings.some((c) => c.product === name && same(c.units, p.quantity)));
    ok(`${name}: the review closes each holder at the statement's own balance, unit for unit`,
      unwitnessed.length === 0, unwitnessed.map((p) => `${p.accountId} ${p.quantity}`).join("; "));
  }

  // AND THE RULE COVERS WHAT THE VALUATION COVERS. Every ISIN the live book
  // values from a statement's units is a statement's ISIN, so switching a
  // valuation off cannot bring the sentence back for it: the units are still
  // on the statement.
  const orphan = live.filter((p) => !statementIsins.has(up(p.isin))).map((p) => `${p.security} ${p.isin}`);
  ok("every holding the live book values from a statement's units is on a statement", orphan.length === 0, orphan.join("; "));
  ok("…and the live book values some", live.length > 0, `${live.length}`);
}

// ── 6d. …NOR ONE A STATEMENT REPORTS FOR AN ENTITY THIS BOOK KEEPS OUT ─────
//
// The review files four Cash-tab lines under HOPE INDIA TRUST, and that
// trust's own AMC folio statements are in the drop and report each of them.
// The book keeps them out by decision — the trust is a separate taxpayer — so
// no position carries them and no ISIN tier can see them: two of the four
// print no ISIN at all. `REVIEW_LINES_KEPT_OUT` names each line's folio, and
// what licenses it is the folio's own statement: held by the trust, kept out of
// the book, and printing a holding at exactly the NAV the review prices the
// line at on the same days.
{
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "public", "audit", "manifest.json"), "utf8")) as
    { docKey: string; accountNo?: string | null; owner?: string | null; reportType?: string | null }[];
  const accounts = new Set(BOOK_ACCOUNTS.map((a) => a.accountNo));
  const REVIEW = path.join(process.cwd(), "source", "august-2026-d",
    "Final Consolidated Jaisinghani Family Review as on 30 June 2026.xlsx");
  const closings: { holder: string; product: string; rate: number }[] = [];
  if (existsSync(REVIEW)) {
    const wb = XLSX.readFile(REVIEW);
    const sheet = wb.SheetNames.find((n) => /transactions since inception/i.test(n));
    const rows = sheet
      ? (XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, defval: "" }) as unknown[][])
      : [];
    for (const r of rows) {
      const j = r.findIndex((c) => String(c).trim().toLowerCase() === "closing");
      if (j >= 1) closings.push({ holder: String(r[0]), product: String(r[j - 1]), rate: Number(r[j + 3]) });
    }
  }
  ok("the kept-out table has a subject", REVIEW_LINES_KEPT_OUT.size > 0, `${REVIEW_LINES_KEPT_OUT.size}`);
  const trust = /hope india trust/i;
  const flat = (k: string) => k.replace(/-/g, "");
  const bookKeys = [...new Set(BOOK_POSITIONS.map((p) => securityKeyOf(p.security)))].filter(Boolean);
  const related = (name: string) => {
    const k = securityKeyOf(name);
    return !!k && bookKeys.some((bk) =>
      bk.startsWith(k) || k.startsWith(bk) || flat(bk).startsWith(flat(k)) || flat(k).startsWith(flat(bk)));
  };
  for (const [name, folio] of REVIEW_LINES_KEPT_OUT) {
    const gap = REVIEW_GAPS.find((g) => g.name === name);
    ok(`${name}: a line the gap list carries`, !!gap);
    ok(`${name}: a search for its own name is told nothing about it`,
      !reviewGapsFor(name).some((g) => g.name === name) && (!gap || reportedByStatement(gap)));
    // LOAD-BEARING: neither the name tier nor an ISIN join would withhold it.
    ok(`${name}: …and nothing else would have withheld it`, !related(name) && !REVIEW_LINE_ISINS.has(name));
    const issues = manifest.filter((d) => d.accountNo === folio && d.reportType === "holdings");
    ok(`${name}: folio ${folio}'s statements are in the archive, held by the trust`,
      issues.length > 0 && issues.every((d) => trust.test(d.owner ?? "")), `${issues.length} issue(s)`);
    ok(`${name}: …and kept out of the book by decision`, !accounts.has(folio));
    const navs = issues.flatMap((d) => {
      const f = path.join(process.cwd(), "public", "audit", d.docKey, "document.json");
      const h = existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")).holdings ?? []) as { marketPrice?: number | null }[] : [];
      return h.map((x) => x.marketPrice).filter((x): x is number => typeof x === "number");
    });
    const line = closings.filter((c) => c.product === name);
    ok(`${name}: the review closes it under the trust at a NAV the folio's own statement prints`,
      line.length > 0 && line.every((c) => trust.test(c.holder) && navs.some((n) => Math.abs(n - c.rate) < 0.00005)),
      `review ${line.map((c) => c.rate).join(", ")} · folio ${navs.join(", ")}`);
  }
  // THE TIER IS KEYED ON THE FOLIO, NOT THE HOLDER. A line the review files
  // under the trust with no folio in the drop is still claimed absent, because
  // for that one the sentence is true.
  const trustLines = [...new Set(closings.filter((c) => trust.test(c.holder)).map((c) => c.product))]
    .filter((p) => REVIEW_GAPS.some((g) => g.name === p) && !REVIEW_LINES_KEPT_OUT.has(p));
  ok("a trust line with no folio in the drop is still claimed", trustLines.length > 0
    && trustLines.every((p) => reviewGapsFor(p).some((g) => g.name === p)), trustLines.join(", "));
}

// ── 6e. …AND A GAP WHOSE NAME IS A SCHEME THE BOOK REPORTS (SC-B4) ─────────
//
// 6b compares the review's name with the name the STATEMENT printed, which for
// a mutual fund cannot work: the depository clips `WhiteOak Capital Multi Asset
// Allocation Fund` to `WOC MAAF D-GROW`, and the note told a reader no statement
// reported a fund the dashboard displays under its full published name. That
// name is AMFI's, joined on the book's own ISIN — `schemeNames.json`, and AMFI's
// daily file for Liquid BeES — so the relation is an identifier's, not a
// resemblance's.
//
// RE-EXPRESSED HERE, never imported: the plan and option words and the review's
// two AMC abbreviations are written out again as one regular expression, so a
// check that agreed with `schemeStem` by construction is not what passes. And
// the whole claimable list is compared as a SET, in both directions — a rule
// that withheld too little leaves a held fund denied, and one that withheld too
// much swallows a genuine gap such as BSE.
{
  type SchemeRec = { name: string; amfiName: string };
  const schemes = SCHEME_NAMES as Record<string, SchemeRec>;
  const TAIL = /\b(direct|regular|plan|growth|gr|grw|grow|g|d|dp|option|dd|idcw|dividend|reinvestment|reinvest|payout|daily|weekly|monthly|quarterly|bonus)\b/g;
  const stem = (n: string) => n.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsl\b/g, "sun life").replace(/\bpru\b/g, "prudential")
    .replace(TAIL, " ").replace(/\s+/g, " ").trim();
  const flat = (k: string) => k.replace(/-/g, "");
  const rel = (k: string, keys: string[]) => keys.some((bk) =>
    bk.startsWith(k) || k.startsWith(bk) || flat(bk).startsWith(flat(k)) || flat(k).startsWith(flat(bk)));
  // A line a statement RECORDS with no usable price (Stage 10cz) is a holding
  // the statements report, on both tiers — written out again here rather than
  // read from the module.
  const recorded = BOOK_UNVALUED_HOLDINGS.filter((u) => (u.quantity ?? 0) > 0 && !u.sameUnitsReportedBy);
  const bookKeys = [...new Set([...BOOK_POSITIONS.map((p) => p.security), ...recorded.map((u) => u.security)]
    .map((n) => securityKeyOf(n)))].filter(Boolean);
  const heldBy = new Map<string, string>();
  for (const key of [...BOOK_POSITIONS.map((p) => p.securityKey), ...recorded.map((u) => u.securityKey)]) {
    const names = [schemes[key]?.name, schemes[key]?.amfiName,
      BOOK_FUND_NAVS.find((e) => e.securityKey === key)?.scheme].filter((x): x is string => !!x);
    for (const n of names) { const k = securityKeyOf(stem(n)); if (k) heldBy.set(k, key); }
  }
  const schemeKeys = [...heldBy.keys()];
  const heldScheme = (g: typeof REVIEW_GAPS[number]) =>
    [g.name, ...g.aliases].some((s) => { const k = securityKeyOf(stem(s)); return !!k && rel(k, schemeKeys); });
  // A line a statement reports under an ISIN the name tiers cannot reach is
  // withheld too (§6c) — that join is held to the statements' own balances and
  // credits above, so it is taken from there rather than re-derived here.
  const expected = REVIEW_GAPS.filter((g) => {
    const k = securityKeyOf(g.name);
    return !!k && !rel(k, bookKeys) && !heldScheme(g) && !reportedByStatement(g);
  }).map((g) => g.name).sort();
  const actual = claimableGaps().map((g) => g.name).sort();
  const missingFromCode = expected.filter((n) => !actual.includes(n));
  const extraInCode = actual.filter((n) => !expected.includes(n));
  ok("the claimable gaps are exactly the ones naming neither a held security nor a held scheme, nor a statement-reported line",
    missingFromCode.length === 0 && extraInCode.length === 0,
    `withheld too much: ${missingFromCode.join(", ") || "none"} · withheld too little: ${extraInCode.join(", ") || "none"}`);

  // LOAD-BEARING: the scheme tier must withhold gaps the key tier does not, or
  // the equality above passes over a tier that does nothing.
  const bySchemeOnly = REVIEW_GAPS.filter((g) => {
    const k = securityKeyOf(g.name);
    return !!k && !rel(k, bookKeys) && heldScheme(g);
  });
  ok("…and the scheme tier withholds gaps the statement-name tier cannot see",
    bySchemeOnly.length > 0, `${bySchemeOnly.length}: ${bySchemeOnly.slice(0, 4).map((g) => g.name).join("; ")}`);
  const denied = bySchemeOnly.filter((g) => reviewGapsFor(g.name).length > 0).map((g) => g.name);
  ok("…and not one of them is answered with \"no statement reports it\"", denied.length === 0, denied.join(", "));
  ok("…while BSE, which no statement reports, still is", reviewGapsFor("BSE Ltd.").some((g) => g.name === "BSE Ltd."));
}

// ── 7. EVERY SEARCH A READER CAN RUN OVER HOLDINGS IS WIRED TO IT ───────────
//
// `check:pages` drives the Portfolio Monitor's pick-list, which is the control
// the family used, and the top bar's search, which types the same names — and
// it does NOT drive the other two, because reaching their empty state needs a
// search that matches nothing and no route types one. So a page quietly
// dropping the wiring would go unseen, which is the shape of regression this
// repo keeps finding.
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
    ["the top bar's search", "src/components/SmartSearch.tsx"],
  ];
  for (const [what, file] of SURFACES) {
    const src = readFileSync(file, "utf8");
    ok(`${what} renders the absence`, /<AbsentFromBook\b/.test(src));
  }
}

// ── 8. THE REPORT DOES NOT SET A LATER HOLDING AGAINST THE REVIEW AS DRIFT ──
//
// Section H reads each account's own dated record, and where it holds nothing on
// the review's date it says so — "Helios Mutual Fund 10355977 first holds it on
// 2026-08-06, after the review". Section C1 sets the same manager's book figure
// against the review's line, and before Stage 10de it printed that pair as an
// ordinary difference (+₹3.82 Cr) beside the review's ₹27.17 Cr for five other
// holdings: two sections of one report contradicting each other, which is the
// failure Stage 10dd fixed in C2. Read off the report's own text, so the H row
// and the C1 row must agree whatever the next drop brings.
{
  const later = [...REPORT.matchAll(/([A-Z][^|;—]*?) (\S+) first holds it on (\d{4}-\d{2}-\d{2}), after the review/g)]
    .map((m) => ({ provider: m[1].trim(), accountNo: m[2], first: m[3] }));
  const c1 = REPORT.slice(REPORT.indexOf("### C1."), REPORT.indexOf("### C2."));
  const onC1 = later.filter((x) => c1.includes(`-> ${x.provider}</sub>`));
  if (!onC1.length) {
    console.log("NOT CHECKED a manager's book figure first held after the review is named on its C1 row — section H names no such account on a C1 manager");
  }
  for (const x of onC1) {
    const row = c1.split("\n").find((l) => l.includes(`-> ${x.provider}</sub>`)) ?? "";
    ok(`C1 names ${x.provider} ${x.accountNo} as first held ${x.first}, after the review`,
      row.includes(`account ${x.accountNo}, first held ${x.first}`) && /not drift/.test(row));
    ok(`…and the residual counts it as a holding the review could not carry`,
      new RegExp(`${x.accountNo} \\(₹[\\d,.]+ Cr, first held ${x.first}\\)`).test(REPORT) && /runs the other way/.test(REPORT));
  }
}

console.log(fails ? `\n${fails} FAILED` : "\nall review-gap checks passed");
process.exit(fails ? 1 : 0);
