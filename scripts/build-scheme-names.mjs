/**
 * Build `src/data/schemeNames.json` — the FULL name of every mutual-fund scheme
 * and ETF this book holds, joined to the book BY ISIN, plus the plan the family
 * actually owns.
 *
 *   npm run build-scheme-names
 *   npm run build-scheme-names -- --check     write nothing, report the diff
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 *   *"why should everywhere you show me direct plan growth? You're wasting a
 *    space here… Maybe you can write direct. Just direct plan, growth option —
 *    remove… Rather, I would rather have WhiteOak multi asset… For example,
 *    BNDH L&MC is large and mid cap. Now it's very important, Bandhan, large
 *    and mid cap should come… So we are leaving a lot to imagination."*
 *
 * Two complaints, one cause. A DEPOSITORY clips a scheme name to its own column
 * width — `BNDH L&MCF DP GR`, `WOC MAAF D-GROW`, `ICICI IOPPF D-GRW` — and an
 * AMC folio statement spells the plan out at length, `Helios Flexi Cap Fund -
 * Direct Plan - Growth Option`. Both are what the statement printed, which is
 * why `stripDepositoryTail` cannot help with either: **it only ever REMOVES,
 * and it never supplies a name the statement did not print.**
 *
 * ── THE JOIN IS AN IDENTIFIER, AND THERE IS NO FUZZY TIER ──────────────────
 *
 * `public/lookthrough/<schemecode>.json` already carries `amfiSchemeName`,
 * `amc`, `plan` and `option` for every scheme this book holds, and
 * `build-lookthrough` resolved each one from the book's own ISIN. So the full
 * name is not being invented, guessed or matched on a resemblance: it is AMFI's
 * own published scheme name, reached through the identifier the AMC filed
 * against the units the family holds. A name that resolves no scheme keeps the
 * name its statement printed and is NAMED in the report.
 *
 * This is the third time a clipped name has been answered this way — the ISIN
 * tier in `build-symbols`, the vendor sector tier in `build-sectors` — and the
 * rule is the same each time: *adding an identifier above the name tiers makes
 * the match STRICTER, never looser.*
 *
 * ── FOUR GATES, EACH A WRONG ANSWER AVOIDED ────────────────────────────────
 *
 * A mis-joined scheme name is a COMPLETE, CORRECT name belonging to another
 * fund, and there is nothing on screen a reader could catch it by. So:
 *
 *  1. **The ISIN must agree three ways** — the index entry's, the scheme file's
 *     and the one the BOOK carries for that securityKey. A disagreement means
 *     the entry is joined to the wrong record; nothing is published for it.
 *  2. **The strip is anchored at the END and only ever removes**, one trailing
 *     plan/option token at a time out of a closed vocabulary. No token is ever
 *     added, reordered or re-cased.
 *  3. **The instrument word must survive.** Every AMFI name here ends in a word
 *     that says what the thing IS (`Fund`, `ETF`, `Trust`, `Scheme`). If the
 *     strip eats it — which is what a fund genuinely named "…Focused Growth"
 *     would do — the entry is refused rather than published truncated.
 *  4. **The plan marker is rendered only where the AMFI name carried a plan or
 *     option phrase at all.** An ETF has no plan concept and its name carries
 *     none, so it gets no marker; the `plan: "regular"` the store records for
 *     one is a fact about the schemecode's shape, not about a plan anybody
 *     chose. See `planMarker` below for why the marker's TEXT then comes from
 *     the record rather than from the words removed.
 *
 * Every published expansion, and every refusal, is listed in
 * `docs/SCHEME-NAMES.md` so any one of them can be challenged.
 *
 * ── IT IS DISPLAY ONLY ─────────────────────────────────────────────────────
 *
 * `securityKeyOf` is NOT routed through this and must never be: two keys that
 * resolve one scheme stay two keys, two rows and two `/stock/` pages, and
 * `docs/BOOK-REPORT.md` goes on naming them as the extractor join they are.
 * Merging them on screen would give a reader one tidy row and leave the
 * reconciler none the wiser, which is the failure this repo names in as many
 * words. Nothing here reaches `glowData.ts`, and the book regenerates
 * byte-identically with this map in the tree.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOOKTHROUGH = join(ROOT, "public", "lookthrough");
const BOOK = join(ROOT, "src", "data", "glowData.ts");
const OUT = join(ROOT, "src", "data", "schemeNames.json");
const REPORT = join(ROOT, "docs", "SCHEME-NAMES.md");

const CHECK = process.argv.includes("--check");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** Lifted verbatim from `build-fund-lookthrough.mjs` — one book, one reader. */
const bookArray = (src, name) => {
  const i = src.indexOf(`export const ${name}`);
  if (i < 0) return null;
  const s = src.indexOf("= [", i);
  const e = src.indexOf("\n];", s);
  return s < 0 || e < 0 ? null : JSON.parse(src.slice(s + 2, e + 2));
};

/**
 * THE CLOSED VOCABULARY. Every token here is a plan or an option word — what a
 * scheme's UNITS are, never what the scheme INVESTS IN. Nothing that could name
 * a strategy (`Value`, `Contra`, `Momentum`, `Balanced`, `Advantage`) is in it,
 * which is what keeps the strip from eating a fund's identity.
 */
const TAIL = /[\s-]+(direct|regular|dir|reg|plan|option|growth|cumulative|payout|reinvestment|idcw|dividend|bonus)\s*$/i;

/** What a thing IS. At least one of these must survive the strip. */
const INSTRUMENT = /\b(fund|etf|trust|scheme|index|portfolio)\b/i;

/**
 * Strip the trailing plan/option phrase, one token at a time, from the end.
 *
 * Returns the remaining name and the words removed — the second is what decides
 * whether a plan marker is rendered at all (gate 4), so it is a return value
 * rather than something the caller re-derives.
 */
function stripPlanTail(amfiName) {
  let s = String(amfiName ?? "").trim();
  const removed = [];
  for (;;) {
    const trimmed = s.replace(/[\s,–—-]+$/, "");
    const m = trimmed.match(TAIL);
    if (!m) { s = trimmed; break; }
    removed.push(m[1]);
    s = trimmed.slice(0, m.index);
  }
  return { name: s.replace(/\s{2,}/g, " ").trim(), removed };
}

/**
 * WHICH PLAN, AND WHY THE WORD COMES FROM THE RECORD RATHER THAN THE STRIP.
 *
 * `HDFC Balanced Advantage Fund - Growth Plan` is the REGULAR plan and its name
 * says so nowhere: the only plan-bearing word in it is "Plan", attached to the
 * option. Its direct twin is `HDFC Balanced Advantage Fund - Growth Plan -
 * Direct Plan`. **This book holds both**, and so it does of ICICI Pru Nifty
 * Next 50 — so a marker read off the removed words would leave one of each pair
 * unlabelled and two rows indistinguishable on screen.
 *
 * The record's `plan` is not a guess either: `build-lookthrough` took it from
 * the schemecode the ISIN resolved (`1273` regular, `1273-D` direct), which is
 * the AMC's own filing against the units the family actually holds.
 */
function planMarker(rec, removed) {
  if (!removed.length) return null;           // gate 4 — an ETF names no plan
  const p = String(rec.plan ?? "").toLowerCase();
  return p === "direct" ? "Direct" : p === "regular" ? "Regular" : null;
}

/**
 * The option, and only where it is not the default.
 *
 * Growth is what every scheme in this book holds, and printing "· Growth" on
 * all of them is the wasted space the family pointed at. An IDCW or payout
 * folio is a materially different holding — different NAV, different cash flows
 * — so it says so, and that is derived rather than hardcoded away.
 */
function optionMarker(rec) {
  const o = String(rec.option ?? "").toLowerCase();
  if (!o || o === "growth" || o === "cumulative" || o === "unknown") return null;
  return o.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function main() {
  const idxPath = join(LOOKTHROUGH, "index.json");
  if (!existsSync(idxPath)) {
    console.error(`No lookthrough index at ${idxPath}. Run \`npm run build-lookthrough\` first.`);
    process.exit(1);
  }
  const index = readJson(idxPath);
  const entries = Object.entries(index.schemes ?? {});
  if (!entries.length) { console.error("The lookthrough index carries no schemes."); process.exit(1); }

  const bookSrc = readFileSync(BOOK, "utf8");
  const positions = bookArray(bookSrc, "BOOK_POSITIONS") ?? [];
  /**
   * AND EVERY LINE THE BOOK CARRIES AS A QUANTITY (Stage 10cz). A fund a
   * Motilal Oswal holding statement records is a `BOOK_UNVALUED_HOLDINGS` row
   * since the statement's rate turned out to be a last movement's price, not a
   * valuation — and the dashboard still shows it, valued at AMFI's NAV. Read off
   * positions alone, its printed name and ISIN would drop out of this map.
   */
  const recorded = bookArray(bookSrc, "BOOK_UNVALUED_HOLDINGS") ?? [];
  /** The book's own printed name and ISIN per securityKey — the third witness. */
  const printed = new Map();
  for (const p of [...positions, ...recorded]) {
    if (!printed.has(p.securityKey)) printed.set(p.securityKey, { name: p.security, isin: p.isin ?? null });
  }

  const out = {};
  const refused = [];
  for (const [securityKey, entry] of entries) {
    const f = join(LOOKTHROUGH, `${entry.schemecode}.json`);
    if (!existsSync(f)) { refused.push([securityKey, `no scheme file ${entry.schemecode}.json`]); continue; }
    const rec = readJson(f);

    // GATE 1 — the ISIN must agree three ways. A name reached through the wrong
    // ISIN is a complete, correct name belonging to another fund.
    const bookIsin = printed.get(securityKey)?.isin ?? null;
    const isins = [entry.isin, rec.isin, bookIsin].filter(Boolean);
    if (!isins.length) { refused.push([securityKey, "no ISIN on the index entry, the scheme file or the book"]); continue; }
    if (new Set(isins).size > 1) {
      refused.push([securityKey, `ISIN disagrees — index ${entry.isin ?? "—"}, scheme file ${rec.isin ?? "—"}, book ${bookIsin ?? "—"}`]);
      continue;
    }

    const amfi = String(rec.amfiSchemeName ?? "").trim();
    if (!amfi) { refused.push([securityKey, `scheme file ${entry.schemecode}.json carries no amfiSchemeName`]); continue; }

    const { name, removed } = stripPlanTail(amfi);

    // GATE 3 — the word that says what the thing IS must survive the strip.
    if (INSTRUMENT.test(amfi) && !INSTRUMENT.test(name)) {
      refused.push([securityKey, `the plan strip would eat the instrument word: "${amfi}" → "${name}"`]);
      continue;
    }
    if (name.length < 4) { refused.push([securityKey, `the plan strip leaves "${name}", which names nothing`]); continue; }

    out[securityKey] = {
      name,
      plan: planMarker(rec, removed),
      option: optionMarker(rec),
      amc: rec.amc ?? null,
      isin: isins[0],
      schemecode: entry.schemecode,
      amfiName: amfi,
      printed: printed.get(securityKey)?.name ?? null,
      joinedBy: entry.matchedVia ?? null,
    };
  }

  // Sorted, so the file is a stable diff rather than one that reshuffles with
  // whatever order the index happened to be written in.
  const sorted = {};
  for (const k of Object.keys(out).sort()) sorted[k] = out[k];
  const text = JSON.stringify(sorted, null, 2) + "\n";

  const expanded = Object.values(sorted).filter((v) => v.printed && v.printed.trim() !== v.name);
  const L = [];
  L.push("# Scheme names");
  L.push("");
  L.push("Generated by `npm run build-scheme-names`. The FULL name of every mutual-fund");
  L.push("scheme and ETF this book holds, joined to the book **by ISIN** through");
  L.push("`public/lookthrough/` and therefore through the AMC's own filing. Nothing here is");
  L.push("matched on a resemblance, and nothing reaches `glowData.ts`: it is the label a");
  L.push("reader sees, and `securityKeyOf` is not routed through it.");
  L.push("");
  L.push(`**${Object.keys(sorted).length} schemes resolve** and ${expanded.length} of them print differently from the name their own statement carried.`);
  L.push("");
  L.push("| What the statement printed | What a reader sees | Plan | AMC | ISIN | Joined by |");
  L.push("| --- | --- | --- | --- | --- | --- |");
  for (const [k, v] of Object.entries(sorted)) {
    L.push(`| ${v.printed ?? `_(not in the book)_ \`${k}\``} | ${v.name} | ${v.plan ?? "—"}${v.option ? ` · ${v.option}` : ""} | ${v.amc ?? "—"} | ${v.isin} | ${v.joinedBy ?? "—"} |`);
  }
  L.push("");
  L.push("## Not expanded");
  L.push("");
  const unresolved = index.unresolved ?? [];
  if (!refused.length && !unresolved.length) {
    L.push("Nothing. Every scheme in the lookthrough store resolved a full name.");
  } else {
    L.push("Each of these keeps the name its own statement printed. None is name-matched to a");
    L.push("scheme it resembles: an expansion is published only where an identifier reached it.");
    L.push("");
    for (const u of unresolved) L.push(`- \`${u.securityKey}\` — **${u.name}**: ${u.reason}`);
    for (const [k, why] of refused) L.push(`- \`${k}\` — refused by a gate: ${why}`);
  }
  L.push("");
  const report = L.join("\n");

  const sameMap = existsSync(OUT) && readFileSync(OUT, "utf8") === text;
  const sameReport = existsSync(REPORT) && readFileSync(REPORT, "utf8") === report;
  if (CHECK) {
    console.log(`--check: ${Object.keys(sorted).length} schemes, ${refused.length} refused. `
      + `${sameMap ? "map is a no-op" : "MAP DIFFERS"}; ${sameReport ? "report is a no-op" : "REPORT DIFFERS"}.`);
    return;
  }
  if (!sameMap) writeFileSync(OUT, text);
  if (!sameReport) writeFileSync(REPORT, report);
  console.log(`${Object.keys(sorted).length} schemes → src/data/schemeNames.json (${expanded.length} read differently from the statement), ${refused.length} refused.`);
  for (const [k, why] of refused) console.log(`  refused ${k}: ${why}`);
}

main();
