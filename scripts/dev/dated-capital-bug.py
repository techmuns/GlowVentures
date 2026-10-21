#!/usr/bin/env python3
"""Stage 10cf's bug-reintroduction pass: the money-weighted return on a row that
is whole accounts.

Each case puts ONE defect back, rebuilds, walks only the `check:pages` routes
that exist to catch it, and restores the file from memory — verified byte for
byte — before the next. A patch whose anchor does not match exactly once, or a
build that fails, is reported as NOT A RESULT rather than as a clean sweep.
The tree is rebuilt on the way out, because restoring the source alone leaves
`dist/` at the last bugged build for the next run to report under the wrong
name.

Needs a `vite preview` serving `dist/` (BASE, default :4173). Commit your work
first: this rewrites the files it patches.

    python3 scripts/dev/dated-capital-bug.py                 # every case
    python3 scripts/dev/dated-capital-bug.py partial-row-rated
"""
import os
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = os.environ.get("BASE", "http://127.0.0.1:4173")
OUT = tempfile.mkdtemp(prefix="dated-capital-bug-")

CASES = [
    # A ₹0 line with no cost carries none of an account's money. Counted, it
    # splits both Buoyant folios and they lose the rate the whole of their money
    # supports — the converse check, and the company page's, see it.
    ("zero-cash-line-splits", "src/lib/datedCapital.ts",
     "const carries = (p: Position) => p.marketValue !== 0 || (typeof p.costBasis === \"number\" && p.costBasis !== 0);",
     "const carries = (_p: Position) => true;",
     "monitor-xirr,stock-capital"),
    # Green Lantern 510861's record ends 30 June against a 27 July statement.
    ("record-reach-dropped", "src/lib/tranches.ts",
     "      ?? (source === \"record\" ? recordShortfall(a) : null);",
     "      ?? null;",
     "monitor-xirr"),
    # A rate solved against the wrong close — plausible, and only a re-solve sees it.
    ("no-terminal-value", "src/lib/datedCapital.ts",
     "      if (g.value! > 0) flows.push({ date: new Date(close), amount: g.value! });",
     "      if (g.value! > 0) flows.push({ date: new Date(close), amount: g.value! * 0.9 });",
     "monitor-xirr,stock-capital"),
    ("stock-xirr-line-dropped", "src/pages/StockInfo.tsx",
     "  const money = xirr && xirr.shown && xirr.tag === \"XIRR\" ? xirr : null;",
     "  const money = null as typeof xirr;",
     "stock-capital"),
    # A row holding PART of an account given the account's rate.
    ("partial-row-rated", "src/lib/datedCapital.ts",
     "      if (!own.length || !own.every((p) => keys.has(p.securityKey))) return null;",
     "      if (!own.length) return null;",
     "monitor-xirr"),
    # The family's multiple-tranche rule dropped from `auto`.
    ("auto-ignores-capital", "src/lib/analytics.ts",
     "  if (cap?.dated) {\n    if (cap.days < YEAR_DAYS) return capitalSubYear(p.returnPct as number, cap);",
     "  if (cap?.dated && false) {\n    if (cap.days < YEAR_DAYS) return capitalSubYear(p.returnPct as number, cap);",
     "monitor"),
]


def main() -> int:
    only = set(sys.argv[1:])
    results = []
    for name, rel, old, new, routes in CASES:
        if only and name not in only:
            continue
        path = os.path.join(ROOT, rel)
        orig = open(path, encoding="utf8").read()
        if orig.count(old) != 1:
            results.append((name, f"NOT A RESULT: the patch anchor matched {orig.count(old)} times"))
            continue
        try:
            open(path, "w", encoding="utf8").write(orig.replace(old, new))
            b = subprocess.run("npx vite build", shell=True, cwd=ROOT, capture_output=True, text=True)
            if b.returncode != 0:
                results.append((name, "NOT A RESULT: the build failed"))
                continue
            env = dict(os.environ, BASE=BASE, ONLY=routes)
            r = subprocess.run("npm run check:pages", shell=True, cwd=ROOT, env=env, capture_output=True, text=True)
            log = r.stdout + r.stderr
            open(os.path.join(OUT, name + ".log"), "w", encoding="utf8").write(log)
            fails = [l.strip() for l in log.splitlines() if "INVARIANT FAILED" in l]
            results.append((name, f"FIRES {len(fails)}: " + " | ".join(fails) if fails else "CLEAN — the checks did not see it"))
        finally:
            open(path, "w", encoding="utf8").write(orig)
            assert open(path, encoding="utf8").read() == orig, f"{rel} was not restored"
    subprocess.run("npx vite build", shell=True, cwd=ROOT, capture_output=True, text=True)
    for n, r in results:
        print(f"{n:26s} {r}")
    print(f"\nlogs in {OUT}")
    return 1 if any(not r.startswith("FIRES") for _, r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
