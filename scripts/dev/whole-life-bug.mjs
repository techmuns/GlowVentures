#!/usr/bin/env node
// BUG-REINTRODUCTION HARNESS for Stage 10df — the September 2026 delivery's
// follow-ups: the whole-life reports' printed lines, a closed mandate's return,
// a mandate with no holding statement, a redeemed holding's return, and the
// reconciler's holder step.
//
//   node scripts/dev/whole-life-bug.mjs            # the control, then every case
//   node scripts/dev/whole-life-bug.mjs 3 7        # the control, then those cases (1-based)
//   NO_CONTROL=1 node scripts/dev/whole-life-bug.mjs 3
//   BASE=http://127.0.0.1:4177 node scripts/dev/whole-life-bug.mjs
//
// Each case puts ONE defect back and runs only the layers that exist to catch
// it: `gen` (a generator re-run before the suites, its outputs restored from
// git afterwards), `ingest`, `family` and `pages` (after `npm run build`,
// against the preview at BASE). A patch whose anchor does not match exactly
// once, or a build that fails, is NOT A RESULT — never a clean run.
//
// The rules are family-answers-bug.mjs's: the tree must be committed, text
// files are restored from memory and verified, generated files from git and
// verified against HEAD, the app is REBUILT on the way out, edits use
// split/join, and it runs in its own `git worktree` with its own preview.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const rel = (p) => path.join(ROOT, p);
const BASE = process.env.BASE ?? "http://127.0.0.1:4173";
const GENERATED = ["src/data/glowData.ts", "docs/BOOK-REPORT.md", "docs/REVIEW-RECONCILIATION.md", "src/data/reviewGaps.ts"];
const TAGGED_DOCS = [];

const PL = "scripts/ingest/__tests__/profitLoss.test.mjs";
const HELD = "src/lib/__tests__/heldThrough.test.ts";
const GAPS = "src/lib/__tests__/reviewGaps.test.ts";
const PERF = "src/pages/Performance.tsx";
const MAND = "src/pages/MandateHoldings.tsx";

const CASES = [
  // ── the whole-life reports' printed lines ──────────────────────────────
  {
    name: "a lines-only column is drawn as a withheld one again",
    edits: [
      [PERF, "const withheld = b.ties === false && !linesOnly;", "const withheld = b.ties === false;"],
      [PERF, "const withheld = b.ties === false && b.linesOnly !== true;", "const withheld = b.ties === false;"],
    ],
    pages: "performance",
  },
  {
    name: "several printed lines behind one bridge row are no longer listed under it",
    edits: [[PERF, "{printed.length > 1 && (", "{printed.length > 99 && ("]],
    pages: "performance",
  },
  {
    name: "the profit and loss reader drops its printed lines",
    edits: [["scripts/ingest/providers/pmsStatements.mjs", "lines: printedLines(PL_FLOW, labels, g),", "lines: [],"]],
    ingest: [PL],
  },
  {
    name: "the income and expense reader drops its printed lines",
    edits: [["scripts/ingest/providers/pmsStatements.mjs", "lines: printedLines(printedOrder, labelOf, v),", "lines: [],"]],
    ingest: [PL],
  },
  // ── a closed mandate, a mandate with no holding statement ─────────────
  {
    name: "a mandate that holds nothing today is never whole, so its return is struck on its cash",
    edits: [["src/lib/fifo.ts", "if (raw.length && set.every((p) => p.accountId === acct)", "if (raw.length > 1e9 && set.every((p) => p.accountId === acct)"]],
    pages: "mandate-closed",
  },
  {
    name: "a mandate with no holding statement is drawn as a mandate holding nothing",
    edits: [[MAND, "const noHoldingStatement = rows.length === 0 && !!account.noPositionsReason;", "const noHoldingStatement = rows.length > 1e9 && !!account.noPositionsReason;"]],
    pages: "mandate-no-statement",
  },
  {
    name: "the no-holding-statement card loses its reason",
    edits: [[MAND, "needs={account.noPositionsReason ?? \"\"}", "needs={\"\"}"]],
    pages: "mandate-no-statement",
  },
  // ── a redeemed holding's return ───────────────────────────────────────
  {
    name: "a holding redeemed to nil refuses its return again (the old cost > 0 guard)",
    edits: [["src/lib/heldThrough.ts", "costedReturn: cost !== null && pnl !== null ? fifo.returnPct : null,", "costedReturn: cost !== null && pnl !== null && cost > 0 ? fifo.returnPct : null,"]],
    family: [HELD],
    pages: "stock-redeemed",
  },
  // ── the reconciler's holder step ──────────────────────────────────────
  {
    name: "a holder with an account and no valued position is subtracted again as a holder with no account",
    edits: [["scripts/review-reconcile.mjs", "if (!hasAccount) { absentHolders += mv ?? 0; noAccountHolders.push(holder); }", "if (b == null) { absentHolders += mv ?? 0; noAccountHolders.push(holder); }"]],
    gen: ["scripts/review-reconcile.mjs"],
    family: [GAPS],
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

const TMP = fs.mkdtempSync(path.join(ROOT, "node_modules", ".whole-life-bug-"));
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
  for (const g of c.gen ?? []) {
    const r = sh(process.execPath, [rel(g)]);
    if (r.status !== 0) { console.log(`  NOT A RESULT — ${g} failed\n${errLines(r)}`); return { notResult: true }; }
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
      replay: chosen.some((c) => c.replay), gen: [...new Set(chosen.flatMap((c) => c.gen ?? []))],
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
