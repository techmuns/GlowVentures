// THE SCHEME LABELS AND THE TRANSACTION ORDER, CHECKED AGAINST THE GENERATED
// FILES RATHER THAN AGAINST A FIXTURE.
//   npm run test:family
//
// ── WHY ─────────────────────────────────────────────────────────────────────
//
//   "why should everywhere you show me direct plan growth? You're wasting a
//    space here… Rather, I would rather have WhiteOak multi asset… For example,
//    BNDH L&MC is large and mid cap… So we are leaving a lot to imagination."
//
//   "how is it sorting? … Not recent transactions first. Do that… See, something
//    is October, something is December, something is 2023. It's all very
//    chaotic."
//
// Both are pure functions over generated data, and both can fail in ways no
// rendered page shows: a label that resolved the WRONG scheme is a complete,
// correct name belonging to another fund, and an order that is right at the top
// level and wrong inside a row looks fine until a row is opened.
//
// Anchored on `schemeNames.json` and `glowData.ts` — two generated artefacts —
// so every expectation is derived on the run or written as a relation that
// survives the next drop moving it.
import { BOOK_POSITIONS } from "@/data/glowData";
import schemeNames from "@/data/schemeNames.json";
import { holdingLabel, schemeNameFor, composeSchemeLabel, SCHEME_KEYS } from "@/lib/schemeLabel";
import { sortRows, TXN_SORTS, type TxnSort } from "@/lib/txnSort";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

type Entry = { name: string; plan: string | null; option: string | null; isin: string; amfiName: string; printed: string | null };
const MAP = schemeNames as Record<string, Entry>;
const held = new Set(BOOK_POSITIONS.map((p) => p.securityKey));
const inBook = Object.entries(MAP).filter(([k]) => held.has(k));

// ── 1. THE MAP IS DOING WORK ────────────────────────────────────────────────
// `golden.mjs`'s rule: a suite that passes over no input claims confidence
// nobody earned. Every assertion below is vacuous on an empty map.
ok("the map resolves schemes this book actually holds", inBook.length > 0, `${inBook.length} of ${SCHEME_KEYS.length}`);
{
  const changed = inBook.filter(([, v]) => v.printed && v.printed !== composeSchemeLabel(v as never));
  ok("…and most of them read differently from what their statement printed",
     changed.length > 0, `${changed.length} of ${inBook.length} change`);
}

// ── 2. NO KEY IS INVENTED ───────────────────────────────────────────────────
// The map may legitimately carry a scheme the book no longer holds (a drop that
// removes a folio does not rebuild the lookthrough store), but a key it carries
// that NEVER existed would mean it was built against a different book.
ok("no mapped key is absent from the book by more than the store's own lag",
   SCHEME_KEYS.length - inBook.length <= 2, `${SCHEME_KEYS.length - inBook.length} unheld`);

// ── 3. THE EXPANSION ONLY EVER SHORTENS THE PLAN, NEVER THE FUND ────────────
// Gate 3 in the builder: the word that says what the thing IS must survive the
// strip. Re-struck here over the committed map, because the builder's gate runs
// at build time and this is what a reader actually reads.
for (const [k, v] of inBook) {
  const hasInstrument = /\b(fund|etf|trust|scheme|index|portfolio)\b/i.test(v.amfiName);
  if (!hasInstrument) continue;
  ok(`${k}: the strip keeps the word that says what it is`,
     /\b(fund|etf|trust|scheme|index|portfolio)\b/i.test(v.name), v.name);
}

// ── 4. THE PLAN IS ONE WORD, AND IT IS NEVER THE PHRASE ─────────────────────
// *"Just direct plan, growth option — remove."*
for (const [k, v] of inBook) {
  ok(`${k}: no plan phrase survives in the name`,
     !/\b(plan|option)\b/i.test(v.name) || /\bindex\b/i.test(v.name), v.name);
  ok(`${k}: the plan marker is one word or absent`,
     v.plan === null || v.plan === "Direct" || v.plan === "Regular", String(v.plan));
}

// ── 5. TWO PLANS OF ONE SCHEME STAY TELLABLE APART ──────────────────────────
// This book holds BOTH plans of HDFC Balanced Advantage and of ICICI Pru Nifty
// Next 50. Dropping the plan word altogether — which is the literal reading of
// the ask — would give each pair one name and two different figures, which
// reads as a defect. **This is the case that decides the design**, so it is
// asserted rather than left to a comment.
{
  const byName = new Map<string, string[]>();
  for (const [k, v] of inBook) (byName.get(v.name) ?? byName.set(v.name, []).get(v.name)!).push(k);
  const twins = [...byName.entries()].filter(([, ks]) => ks.length > 1);
  ok("this book really does hold a scheme under two plans", twins.length > 0,
     twins.map(([n, ks]) => `${n} ×${ks.length}`).join("; "));
  for (const [n, ks] of twins) {
    const labels = new Set(ks.map((k) => holdingLabel(k, "")));
    const isins = new Set(ks.map((k) => MAP[k].isin));
    // A twin pair is EITHER two plans (two ISINs, and the labels must differ)
    // or one scheme the book keys twice (one ISIN, and the labels SHOULD agree
    // — that is the extractor join `docs/BOOK-REPORT.md` names, surfacing).
    if (isins.size > 1) ok(`${n}: two plans, two labels`, labels.size === ks.length, [...labels].join(" / "));
    else ok(`${n}: one ISIN keyed twice reads as one scheme`, labels.size === 1, [...labels].join(" / "));
  }
}

// ── 6. THE FALLBACK IS THE OLD BEHAVIOUR, NOT A BLANK ───────────────────────
// Everything that is not a resolved scheme — every company share, every AIF
// folio, every PMS mandate — must come back exactly as `displaySecurity` left
// it. A label helper that silently emptied those would be invisible in the map.
{
  const unmapped = BOOK_POSITIONS.filter((p) => !schemeNameFor(p.securityKey));
  ok("the book still holds plenty this map does not name", unmapped.length > 0, `${unmapped.length} positions`);
  ok("…and every one of them keeps a non-empty label",
     unmapped.every((p) => holdingLabel(p.securityKey, p.security).trim().length > 0));
}

// ── 7. THE ORDER: THREE MODES, AND EACH DOES WHAT IT SAYS ───────────────────
// The rollups' own rows are exercised by `check:pages`; this is the comparator
// underneath them, where the traps are the two that never show on a page — an
// absent amount read as zero, and a mode that silently falls through to another.
{
  const rows = [
    { key: "a", first: "2023-05-04", last: "2026-07-31", amount: 10 },
    { key: "b", first: "2025-10-03", last: "2025-10-03", amount: 90 },
    { key: "c", first: "2025-12-16", last: "2026-08-01", amount: null },
  ];
  const ids = (m: TxnSort) => sortRows(rows, m, (r) => r.amount).map((r) => r.key).join("");
  ok("recent first puts the newest LAST movement on top", ids("recent") === "cab", ids("recent"));
  ok("longest held puts the earliest FIRST movement on top", ids("held") === "abc", ids("held"));
  ok("largest first puts the biggest amount on top", ids("size") === "bac", ids("size"));
  // THE ONE THAT IS NOT OBVIOUS: an absent amount must sort LAST, not as zero.
  // Row `c` reports no settled amount; `?? 0` would file it above row `a`.
  ok("an absent amount sorts last rather than as zero", ids("size").endsWith("c"), ids("size"));
  ok("the three modes really are three orderings",
     new Set([ids("recent"), ids("held"), ids("size")]).size === 3);
  ok("every mode the control offers is one this comparator implements",
     TXN_SORTS.every((o) => ["recent", "held", "size"].includes(o.id)) && TXN_SORTS.length === 3,
     TXN_SORTS.map((o) => o.id).join(","));
  ok("recent is offered first, which is the default the family asked for",
     TXN_SORTS[0].id === "recent");
  ok("sorting does not mutate its input", rows[0].key === "a" && rows[2].key === "c");
}

console.log(fails ? `\n${fails} failed` : "\nall scheme-label and order checks passed");
process.exit(fails ? 1 : 0);
