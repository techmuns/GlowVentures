#!/usr/bin/env node
// BUG-REINTRODUCTION HARNESS for Stage 10bv — the KPI tile strips.
//
//   node scripts/dev/kpi-tile-bug.mjs            # every case
//   node scripts/dev/kpi-tile-bug.mjs 3 7        # just those cases (1-based)
//
// Needs `vite preview` on :4173 (as `check:pages` does). Each case patches ONE
// defect back in, rebuilds, and runs only the routes (or the suite) that exist
// to catch it. A case whose patch does not apply, or whose build fails, is
// reported as NOT A RESULT — never as a clean run, which is what it would look
// like if the harness simply swept an unchanged tree.
//
// Two rules this repo paid for, applied here:
//   • files are restored from an in-memory copy and VERIFIED byte for byte, and
//     the tree is REBUILT on the way out — restoring the source alone leaves
//     `dist/` at the bugged build for the next run to report under the wrong
//     name;
//   • commit before running it: a pass that rewrites the files under test is not
//     something to run against unversioned work.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const rel = (p) => path.join(ROOT, p);

const CASES = [
  {
    // WHAT MAIN SHIPPED, verbatim: the ellipsis in the family's screenshot.
    name: "main's truncating tile label put back (\"PRIVATE MARKET VAL…\")",
    file: "src/components/SelectableTiles.tsx",
    edits: [
      ["label-xs -ml-1 flex w-full items-start gap-1", "label-xs -ml-1 inline-flex max-w-full items-center gap-1"],
      ['<span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">', '<span className="truncate">'],
    ],
    only: "cio-tiles-dense",
  },
  {
    // Measured before it was trusted: 191px of "CURRENT VALUE OF HOLDINGS" in
    // a 145px box, running over the chevron with no ellipsis to show it.
    name: "a tile label that will not wrap, overflowing its box",
    file: "src/components/SelectableTiles.tsx",
    edits: [['<span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">', '<span className="min-w-0 flex-1 whitespace-nowrap leading-snug">']],
    only: "cio-tiles-dense",
  },
  {
    // THE FAMILY'S OWN SCREENSHOT, on the default five: a label CONTAINER
    // sized to its content, measured short of its text under --app-zoom —
    // "DISTRIBUTION / S", and "UNCALLED CAPITAL" wrapped in 101px of 122.
    name: "the KPI label container sized to its content (the zoom wrap)",
    file: "src/components/Kpi.tsx",
    edits: [['<div className="label-xs flex min-w-0 flex-1 items-start">', '<div className="label-xs inline-flex items-start">']],
    only: "cio",
  },
  {
    name: "a pick writes ?tiles= into the address again",
    file: "src/components/SelectableTiles.tsx",
    edits: [
      ["    if (params.get(param) != null) {\n      const p = new URLSearchParams(params);\n      p.delete(param);",
       "    {\n      const p = new URLSearchParams(params);\n      p.set(param, next.join(\",\"));"],
    ],
    only: "private-market,cio",
  },
  {
    name: "a save never reaches the shared store",
    file: "src/lib/tileSets.ts",
    edits: [['      method: "POST",\n      headers: { "content-type": "application/json" },', '      method: "GET",\n      headers: { "content-type": "application/json" },']],
    only: "cio-tiles-saved",
  },
  {
    name: "the value tile stops carrying the capital invested",
    file: "src/components/SelectableTiles.tsx",
    edits: [["                second={m.second}\n", "                second={undefined}\n"]],
    only: "cio",
  },
  {
    name: "Morning CIO's strip is a fixed row again — no picker on a KPI tile",
    file: "src/components/SelectableTiles.tsx",
    edits: [["              <Kpi\n                label={picker}", "              <Kpi\n                label={m.label}"]],
    only: "cio",
  },
  {
    name: "the value page loses its cost facets",
    file: "src/lib/drilldown.ts",
    edits: [["const costFacets: Facet[] = costed.length && without.length ? [", "const costFacets: Facet[] = costed.length && without.length && costed.length < 0 ? ["]],
    only: "holdings-book,holdings-invested,holdings-invested-legacy,holdings-nocost",
  },
  {
    name: "Share of invested struck on half the cost",
    file: "src/pages/HoldingsBehind.tsx",
    edits: [["`${((c / cost) * 100).toFixed(1)}%`", "`${((c / (cost * 2)) * 100).toFixed(1)}%`"]],
    only: "holdings-book",
  },
  {
    name: "the page's invested line deleted from the headline",
    file: "src/pages/HoldingsBehind.tsx",
    edits: [["                  Invested <span className=\"mono font-semibold text-slate-100\">{money(cost)}</span>\n", ""]],
    only: "holdings-book",
  },
  {
    name: "a tile line that restates its heading comes back",
    file: "src/pages/PrivateMarket.tsx",
    edits: [['      id: "cost", label: "Capital invested", icon: <Wallet className="h-4 w-4" />,\n      value: money(m.privCost),',
             '      id: "cost", label: "Capital invested", icon: <Wallet className="h-4 w-4" />,\n      value: money(m.privCost),\n      sub: "Cost of these holdings",']],
    only: "private-market",
  },
  {
    name: "the line under a figure back at 11px slate-500",
    file: "src/components/StatTile.tsx",
    edits: [['text-[13px] leading-snug text-slate-300" data-stat-sub', 'text-[11px] leading-snug text-slate-500" data-stat-sub']],
    only: "private-market",
  },
  // ── the store and the precedence rule, in the suite ──
  {
    name: "an unsynced change here is overwritten by the older shared layout",
    file: "src/lib/tileSets.ts",
    edits: [["  if (local && !local.synced && !local.legacy) return { ids: local.ids, push: sharedLoaded };\n", ""]],
    suite: "src/lib/__tests__/tileSets.test.ts",
  },
  {
    name: "a save's answer is read from KV's stale list",
    file: "functions/api/tile-sets.js",
    edits: [["    sets[v.set.page] = { ids: v.set.ids, updatedAt: v.set.updatedAt };\n", ""]],
    suite: "src/lib/__tests__/tileSets.test.ts",
  },
  {
    name: "the store accepts anything as a metric id",
    file: "functions/api/tile-sets.js",
    edits: [["const METRIC = /^[a-z0-9][a-z0-9-]{0,39}$/;", "const METRIC = /^.{1,80}$/;"]],
    suite: "src/lib/__tests__/tileSets.test.ts",
  },
  {
    name: "a cross-site write is accepted",
    file: "functions/api/tile-sets.js",
    edits: [['  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {', "  if (false) {"]],
    suite: "src/lib/__tests__/tileSets.test.ts",
  },
];

const pick = process.argv.slice(2).map(Number).filter(Boolean);
const run = pick.length ? pick.map((n) => [n, CASES[n - 1]]) : CASES.map((c, i) => [i + 1, c]);

const touched = [...new Set(CASES.map((c) => c.file))];
const originals = new Map(touched.map((f) => [f, fs.readFileSync(rel(f), "utf8")]));

function restore() {
  for (const [f, text] of originals) fs.writeFileSync(rel(f), text);
  for (const [f, text] of originals) {
    if (fs.readFileSync(rel(f), "utf8") !== text) throw new Error(`restore did not take for ${f}`);
  }
}
const build = () => spawnSync("npm", ["run", "build"], { cwd: ROOT, encoding: "utf8" });

let exitCode = 0;
try {
  for (const [n, c] of run) {
    console.log(`\n━━━ ${n}. ${c.name}`);
    let text = originals.get(c.file);
    let applied = true;
    for (const [from, to] of c.edits) {
      const count = text.split(from).length - 1;
      if (count !== 1) { applied = false; console.log(`  NOT A RESULT — patch anchor matched ${count} times in ${c.file}`); break; }
      text = text.split(from).join(to); // never `.replace`: a `$` in `to` is a pattern there
    }
    if (!applied) { exitCode = 1; continue; }
    fs.writeFileSync(rel(c.file), text);
    try {
      if (c.suite) {
        const out = path.join(ROOT, "node_modules/.kpi-bug/suite.mjs");
        const b = spawnSync(path.join(ROOT, "node_modules/.bin/esbuild"),
          [rel(c.suite), "--bundle", "--platform=node", "--format=esm", `--outfile=${out}`, "--packages=external", `--alias:@=${rel("src")}`, "--log-level=error"],
          { encoding: "utf8" });
        if (b.status !== 0) { console.log(`  NOT A RESULT — suite did not bundle\n${b.stderr}`); exitCode = 1; continue; }
        const r = spawnSync(process.execPath, [out], { encoding: "utf8" });
        const fails = (r.stdout ?? "").replace(/\0/g, "").split("\n").filter((l) => l.startsWith("FAIL"));
        console.log(fails.length ? fails.map((l) => `  ${l}`).join("\n") : "  SUITE CLEAN — this case caught NOTHING");
        if (!fails.length) exitCode = 1;
      } else {
        const b = build();
        if (b.status !== 0) { console.log(`  NOT A RESULT — build failed\n${(b.stdout + b.stderr).split("\n").filter((l) => /error/i.test(l)).slice(0, 5).join("\n")}`); exitCode = 1; continue; }
        const r = spawnSync(process.execPath, [rel("scripts/check-pages.mjs")], {
          cwd: ROOT, encoding: "utf8", env: { ...process.env, ONLY: c.only, THEMES: process.env.THEMES ?? "light" },
        });
        const lines = (r.stdout ?? "").split("\n");
        const inv = lines.filter((l) => /INVARIANT|combinations/.test(l));
        const failed = lines.filter((l) => /INVARIANT(?! NOT CHECKED)/.test(l));
        console.log(inv.map((l) => `  ${l.trim()}`).join("\n") || "  (no summary line)");
        if (!failed.length) { console.log("  → CLEAN — this case caught NOTHING"); exitCode = 1; }
      }
    } finally {
      restore();
    }
  }
} finally {
  restore();
  fs.rmSync(path.join(ROOT, "node_modules/.kpi-bug"), { recursive: true, force: true });
  const b = build();
  console.log(b.status === 0 ? "\nrestored and rebuilt" : "\nRESTORED BUT THE REBUILD FAILED — dist/ is not the committed tree");
}
process.exit(exitCode);
