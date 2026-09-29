#!/usr/bin/env node
// BUG-REINTRODUCTION HARNESS for Stage 10cx — the family's answers of 28 Sep 2026.
//
//   node scripts/dev/family-answers-bug.mjs            # the control, then every case
//   node scripts/dev/family-answers-bug.mjs 3 7        # the control, then those cases (1-based)
//   NO_CONTROL=1 node scripts/dev/family-answers-bug.mjs 3
//   BASE=http://127.0.0.1:4179 node scripts/dev/family-answers-bug.mjs
//
//   1. "both are separate investments"            → SEPARATE_INVESTMENTS
//   2. "keep them pre tax only by default"        → the tax-basis notes
//   3. "keep them unvalued for now"               → KEPT_UNVALUED
//
// Each case puts ONE defect back and runs only the layers that exist to catch
// it. The layers are different in kind, and a case says which it expects:
//
//   book    `build-book`. `true`: it must build (or the case is NOT A RESULT);
//           "refuses": it must refuse, and the refusal is the finding.
//   replay  `replay:dedupe --check` — a non-zero exit is the finding.
//   ingest  the ingest suites named, run as they are by `test:ingest`.
//   family  the family suites named, bundled as `test:family` bundles them.
//   pages   `check:pages` over the routes named, after `npm run build`, against
//           the preview at BASE.
//   quiet   layers this case is EXPECTED to leave clean, and why — a check
//           that passes by construction is recorded as such, never counted as
//           a catch.
//
// A patch whose anchor does not match exactly once, or a build that fails, is
// NOT A RESULT — never a clean run, which is what it would look like if the
// harness swept an unchanged tree.
//
// THE RULES THIS REPO PAID FOR:
//   • the tree must be committed before it runs — it refuses otherwise; a pass
//     that rewrites the files under test is not something to run against
//     unversioned work;
//   • text files are restored from an in-memory copy and VERIFIED byte for
//     byte; generated files and archive documents are restored from git and
//     verified against HEAD; and the tree is REBUILT on the way out, because
//     restoring the source alone leaves `dist/` at the bugged build;
//   • edits use split/join, never `.replace` — a `$` in the replacement is a
//     pattern there, and it has cost this repo a patch twice;
//   • run it in its own `git worktree` with its own `vite preview` (BASE), so
//     the working copy stays clean while it runs.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const rel = (p) => path.join(ROOT, p);
const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
const GENERATED = ["src/data/glowData.ts", "docs/BOOK-REPORT.md"];

/** The six documents the family's first answer re-tagged, as they were before it. */
const TAGGED_REV = "c119078fa";
const TAGGED_DOCS = [
  "360-one-private-wealth-37702-2026-05-31-holdings",
  "360-one-private-wealth-37702-2026-06-30-holdings",
  "360-one-private-wealth-60117-2026-05-31-holdings",
  "360-one-private-wealth-60117-2026-06-30-holdings",
  "transition-venture-capital-tvc262-2026-03-31-unknown",
  "transition-venture-capital-tvc263-2026-03-31-unknown",
].map((k) => `public/audit/${k}/document.json`);

const SEP_INGEST = "scripts/ingest/__tests__/separateInvestments.test.mjs";
const SEP_FAMILY = "src/lib/__tests__/separateInvestments.test.ts";
const NOTES = "src/lib/__tests__/statementNotes.test.ts";
const KEPT = "src/lib/__tests__/keptUnvalued.test.ts";

const CASES = [
  // ── 1. "both are separate investments" ─────────────────────────────────
  {
    name: "the answer never reached the archive — the six documents carry their old tags",
    checkout: { rev: TAGGED_REV, paths: TAGGED_DOCS },
    book: "refuses",
    replay: true,
    ingest: [SEP_INGEST],
  },
  {
    name: "…and build-book's guard removed, so a book counting each pair once is written anyway",
    checkout: { rev: TAGGED_REV, paths: TAGGED_DOCS },
    edits: [["scripts/build-book.mjs", "if (stillOnce.length) {", "if (stillOnce.length && false) {"]],
    book: true,
    family: [SEP_FAMILY, "src/lib/__tests__/privateMarket.test.ts", "src/lib/__tests__/privateBook.test.ts"],
    pages: "private-market,stock-aif-dual",
    quiet: { pages: "every page check derives its claim from the book, and the page draws the book it is given: re-tagged consistently, screen and book agree. The suites are what tie the book to the family's word." },
  },
  {
    name: "the duplicate policy ignores the family's answer",
    edits: [["scripts/ingest/reconcile.mjs", "    if (decided) {", "    if (decided && false) {"]],
    replay: true,
    ingest: [SEP_INGEST],
  },
  {
    name: "the replay's gate judges an untagged holding alone, not its whole group",
    edits: [["scripts/lib/dedupeReplay.mjs",
      "    return Boolean(id) && (members.get(id) ?? []).every((t) => same(t, UNTAGGED));",
      "    return Boolean(id);"]],
    ingest: [SEP_INGEST],
  },
  {
    name: "a fund held in two folios is printed as a pair pending the family's answer",
    edits: [["src/pages/PrivateMarket.tsx", "    if (g.overlap) bits.push(", "    if (g.overlap || (g.kind === \"fund\" && held > 1)) bits.push("]],
    pages: "private-market",
  },
  // ── 2. "keep them pre tax only by default" ─────────────────────────────
  {
    name: "a fund whose statement prints only a post-tax NAV is labelled pre-tax",
    edits: [["src/lib/statementNotes.ts",
      "securityKeys: [\"motilal-oswal-founders-fund-series-ii-class-g1\"],\n    short: \"post-tax NAV\",",
      "securityKeys: [\"motilal-oswal-founders-fund-series-ii-class-g1\"],\n    short: \"pre-tax NAV\","]],
    family: [NOTES],
    pages: "stock-posttax",
    quiet: { family: "the suite holds each chip's FIRST word to its own note, and Founders' note names both bases (\"its post-tax NAV … the family's pre-tax default\"), so a chip naming either passes it. The page check reads the chip itself." },
  },
  {
    name: "Sanshi's note says its NAV is before tax again, not before the performance fee",
    edits: [["src/lib/statementNotes.ts",
      "says its NAV is before the manager's annual performance fee, which is charged at the end of the financial year.",
      "says its NAV is calculated without accounting for tax."]],
    family: [NOTES],
    pages: "stock-pretax",
  },
  {
    name: "the price tile drops the basis chip",
    edits: [["src/pages/StockInfo.tsx", "{priceNote.line}{markNote ? ` · ${markNote.short}` : \"\"}", "{priceNote.line}"]],
    pages: "stock-pretax,stock-posttax",
  },
  // ── 3. "keep them unvalued for now" ────────────────────────────────────
  {
    name: "the row's reason stops naming the family's decision",
    edits: [["shared/keptUnvalued.mjs",
      "  return `the ${d.provider} statement of ${asOf} ${d.why} — and the family decided on ${d.decided} `\n"
        + "    + `to keep them unvalued (\"${d.words}\") rather than borrow a mark from another statement, `\n"
        + "    + \"so they carry a quantity and no value\";",
      "  return `the ${d.provider} statement of ${asOf} ${d.why}, so they carry a quantity and no value`;"]],
    book: true,
    family: [KEPT],
    pages: "family-kept-unvalued",
  },
  {
    name: "the reason drops what the statement says about the lock-in",
    edits: [["shared/keptUnvalued.mjs",
      "    why: \"holds every one of these shares in its lock-in + freeze balance, none of them free, and prints no rate for them\",",
      "    why: \"prints no rate for them\","]],
    book: true,
    family: [KEPT],
    pages: "family-kept-unvalued",
    quiet: { family: "the suite asserts the reason carries `why`, whatever `why` says — it passes by construction. The page check is struck on the statement's facts, so it is the independent one." },
  },
  {
    name: "the decision is matched on the ISIN alone, so another account's Clean Max takes it",
    edits: [["shared/keptUnvalued.mjs",
      "d.provider === provider && String(d.accountNo) === String(accountNo) && d.isin === isin",
      "d.isin === isin"]],
    family: [KEPT],
  },
  {
    name: "the Family & Entities line drops its hover, and with it the reason",
    edits: [["src/pages/FamilyEntities.tsx",
      "className=\"flex items-baseline justify-between gap-3\" title={l.row.reason ?? undefined}>",
      "className=\"flex items-baseline justify-between gap-3\">"]],
    pages: "family-kept-unvalued",
  },
  {
    name: "the table's account number drifts, so the decision reaches no row",
    edits: [["shared/keptUnvalued.mjs", "    accountNo: \"1201090012838316\",", "    accountNo: \"1201090012838317\","]],
    book: true,
    family: [KEPT],
    pages: "family-kept-unvalued",
  },
];

// ── running ──────────────────────────────────────────────────────────────
const sh = (cmd, args, env = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 1 << 28 });
const git = (...args) => sh("git", args);

const dirty = git("status", "--porcelain", "--untracked-files=no").stdout.trim();
if (dirty) {
  console.error(`REFUSED: the tree has uncommitted changes — commit before running a harness that rewrites them.\n${dirty}`);
  process.exit(2);
}

const TMP = fs.mkdtempSync(path.join(ROOT, "node_modules", ".family-answers-bug-"));
const textFiles = [...new Set(CASES.flatMap((c) => (c.edits ?? []).map((e) => e[0])))];
const originals = new Map(textFiles.map((f) => [f, fs.readFileSync(rel(f), "utf8")]));

function restore() {
  for (const [f, text] of originals) fs.writeFileSync(rel(f), text);
  for (const [f, text] of originals) {
    if (fs.readFileSync(rel(f), "utf8") !== text) throw new Error(`restore did not take for ${f}`);
  }
  const fromGit = [...GENERATED, ...TAGGED_DOCS];
  git("checkout", "HEAD", "--", ...fromGit);
  const left = git("diff", "--name-only", "HEAD", "--", ...fromGit).stdout.trim();
  if (left) throw new Error(`restore from git did not take:\n${left}`);
}

const failLines = (out) => (out ?? "").replace(/\0/g, "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("FAIL"));

function runFamily(suite) {
  const out = path.join(TMP, `${path.basename(suite, ".ts")}.mjs`);
  const b = spawnSync(rel("node_modules/.bin/esbuild"),
    [rel(suite), "--bundle", "--platform=node", "--format=esm", `--outfile=${out}`, "--packages=external", `--alias:@=${rel("src")}`, "--log-level=error"],
    { encoding: "utf8" });
  if (b.status !== 0) return { error: `did not bundle: ${b.stderr.trim().split("\n")[0]}` };
  // …and run as `test:family` runs them: fixtures are handed in, because a
  // bundle cannot find them from its own `import.meta.url`.
  const r = sh(process.execPath, [out], { GLOW_FIXTURES: rel("src/lib/__tests__/fixtures") });
  return { fails: failLines(r.stdout), status: r.status };
}
function runIngest(suite) {
  const r = sh(process.execPath, [rel(suite)]);
  return { fails: failLines(r.stdout + r.stderr), status: r.status };
}
function runPages(only) {
  const r = sh(process.execPath, [rel("scripts/check-pages.mjs")], { ONLY: only, BASE, THEMES: process.env.THEMES ?? "light" });
  const lines = (r.stdout ?? "").split("\n");
  const summary = lines.filter((l) => /combinations/.test(l)).map((l) => l.trim());
  const fails = lines.filter((l) => /INVARIANT(?! NOT CHECKED)/.test(l)).map((l) => l.trim());
  const unchecked = lines.filter((l) => /INVARIANT NOT CHECKED/.test(l)).map((l) => l.trim());
  return { fails, unchecked, summary, walked: summary.length > 0 };
}
const buildBook = () => sh(process.execPath, [rel("scripts/build-book.mjs")]);
const buildApp = () => sh("npm", ["run", "build"]);
const errLines = (r) => `${r.stdout}\n${r.stderr}`.split("\n").filter((l) => /error|refus|throw/i.test(l)).slice(0, 4).map((l) => `      ${l.trim()}`).join("\n");

/** Runs one case's layers. Returns { fired, notResult }. */
function runLayers(c, { control = false } = {}) {
  const found = [];
  const quiet = c.quiet ?? {};
  const note = (layer, hit, detail) => {
    const expectQuiet = !control && quiet[layer];
    const tag = control
      ? (hit ? "CONTROL FAILED" : "clean")
      : hit ? "CAUGHT" : expectQuiet ? "clean, as expected" : "clean";
    console.log(`  ${layer.padEnd(7)} ${tag}${detail ? ` — ${detail}` : ""}`);
    if (!control && expectQuiet && !hit) console.log(`          (${quiet[layer]})`);
    if (hit) found.push(layer);
  };

  if (c.book) {
    const r = buildBook();
    if (c.book === "refuses") {
      note("book", r.status !== 0, r.status !== 0 ? `build-book refused:\n${errLines(r)}` : "build-book wrote a book");
    } else if (r.status !== 0) {
      console.log(`  NOT A RESULT — build-book failed\n${errLines(r)}`);
      return { notResult: true };
    } else if (control) {
      const moved = git("diff", "--name-only", "HEAD", "--", ...GENERATED).stdout.trim();
      note("book", !!moved, moved ? `the committed tree does not regenerate byte-identically: ${moved}` : "regenerates byte-identically");
    }
  }
  if (c.replay) {
    const r = sh(process.execPath, [rel("scripts/replay-dedupe.mjs"), "--check"]);
    const last = `${r.stdout}${r.stderr}`.trim().split("\n").slice(-1)[0];
    note("replay", r.status !== 0, `exit ${r.status} — ${last}`);
  }
  for (const s of c.ingest ?? []) {
    const r = runIngest(s);
    note("ingest", r.fails.length > 0 || r.status !== 0, `${path.basename(s)}: ${r.fails.length} FAIL${r.fails.length ? `\n${r.fails.slice(0, 6).map((l) => `      ${l}`).join("\n")}` : ""}`);
  }
  for (const s of c.family ?? []) {
    const r = runFamily(s);
    if (r.error) { console.log(`  NOT A RESULT — ${path.basename(s)} ${r.error}`); return { notResult: true }; }
    note("family", r.fails.length > 0 || r.status !== 0, `${path.basename(s)}: ${r.fails.length} FAIL${r.fails.length ? `\n${r.fails.slice(0, 6).map((l) => `      ${l}`).join("\n")}` : ""}`);
  }
  if (c.pages) {
    const b = buildApp();
    if (b.status !== 0) { console.log(`  NOT A RESULT — the app did not build\n${errLines(b)}`); return { notResult: true }; }
    const r = runPages(c.pages);
    if (!r.walked) { console.log("  NOT A RESULT — check:pages printed no tally line (did the preview answer at BASE?)"); return { notResult: true }; }
    note("pages", r.fails.length > 0, `${c.pages} · ${r.summary.join(" ")}${r.fails.length ? `\n${r.fails.slice(0, 8).map((l) => `      ${l}`).join("\n")}` : ""}`);
    if (control && r.unchecked.length) console.log(r.unchecked.map((l) => `      ${l}`).join("\n"));
  }
  return { fired: found.length > 0 };
}

const pick = process.argv.slice(2).map(Number).filter(Boolean);
const run = pick.length ? pick.map((n) => [n, CASES[n - 1]]) : CASES.map((c, i) => [i + 1, c]);
let exitCode = 0;
let builtApp = false;
try {
  if (!process.env.NO_CONTROL) {
    // THE CONTROL: every layer the chosen cases use, on the committed tree. A
    // layer that fails here cannot tell a caught bug from its own noise.
    const chosen = run.map(([, c]) => c);
    const union = (k) => [...new Set(chosen.flatMap((c) => c[k] ?? []))];
    const pages = [...new Set(chosen.flatMap((c) => (c.pages ? c.pages.split(",") : [])))].join(",");
    console.log("\n━━━ 0. CONTROL — nothing patched");
    const ctl = runLayers({
      book: chosen.some((c) => c.book) ? true : undefined,
      replay: chosen.some((c) => c.replay),
      ingest: union("ingest"), family: union("family"), pages: pages || undefined,
    }, { control: true });
    builtApp ||= !!pages;
    restore();
    if (ctl.notResult || ctl.fired) { console.log("\nTHE CONTROL IS NOT CLEAN — no case below could be read. Stopping."); process.exit(1); }
  }
  for (const [n, c] of run) {
    console.log(`\n━━━ ${n}. ${c.name}`);
    let applied = true;
    const byFile = new Map();
    for (const [f, from, to] of c.edits ?? []) {
      let text = byFile.get(f) ?? originals.get(f);
      const count = text.split(from).length - 1;
      if (count !== 1) { applied = false; console.log(`  NOT A RESULT — patch anchor matched ${count} times in ${f}`); break; }
      byFile.set(f, text.split(from).join(to));
    }
    if (!applied) { exitCode = 1; continue; }
    try {
      for (const [f, text] of byFile) fs.writeFileSync(rel(f), text);
      if (c.checkout) {
        const r = git("checkout", c.checkout.rev, "--", ...c.checkout.paths);
        if (r.status !== 0) { console.log(`  NOT A RESULT — git checkout failed: ${r.stderr.trim()}`); exitCode = 1; continue; }
      }
      const res = runLayers(c);
      builtApp ||= !!c.pages;
      if (res.notResult) exitCode = 1;
      else if (!res.fired) { console.log("  → CLEAN — this case caught NOTHING"); exitCode = 1; }
    } finally {
      restore();
    }
  }
} finally {
  restore();
  fs.rmSync(TMP, { recursive: true, force: true });
  if (builtApp) {
    const b = buildApp();
    console.log(b.status === 0 ? "\nrestored and rebuilt" : "\nRESTORED BUT THE REBUILD FAILED — dist/ is not the committed tree");
  } else console.log("\nrestored");
}
process.exit(exitCode);
