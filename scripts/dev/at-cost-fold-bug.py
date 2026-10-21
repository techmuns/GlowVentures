#!/usr/bin/env python3
"""
Reintroduce, one at a time, every defect Stage 10dh's last three gates exist
for, and show each one FIRES.

Three gates, and none of them could be shown load-bearing by reading the code:

  * the AIF drill-down's at-cost fold. Sky Capital's four Category I folios are
    recorded at cost by the family's own review, so they left the AIF allocation
    bucket and the fold that used to name them is empty — leaving the table with
    no Category I heading and no note, which is the one way this change could
    mislead (Stage 10bp). Cases 1-4.
  * `AIF_BOOK`'s scope. The checker filtered on the ASSET CLASS while the
    drill-down is the allocation BUCKET's, and failed three invariants against a
    page that was right. Case 5.
  * the two footer checks on `monitor-txns`, which were right only while the row
    count and the account count coincided. Cases 6-7.
  * the review builder's two name gates: a display name that normalises onto
    another holding in the book, and an override whose review text collides with
    nothing. Cases 8-10, which are `build-book`'s and reach no page.

RUN IT IN A WORKTREE OF ITS OWN, with its own `dist/` and its own preview, so
the working copy stays clean for the half-hour it takes — and COMMIT FIRST
(Stage 10bm: a harness that rewrites the files under test is not something to
run against unversioned work).

    git worktree add /tmp/wt HEAD && cd /tmp/wt && npm run build
    npx vite preview --port 4177 &
    WT=/tmp/wt BASE=http://localhost:4177 python3 scripts/dev/at-cost-fold-bug.py
    CASES=5,8 ...   # re-run chosen cases, the control always first
"""
import os, shutil, subprocess, sys, tempfile, filecmp

WT = os.environ.get("WT", os.getcwd())
BASE = os.environ.get("BASE", "http://localhost:4173")
PICK = {c.strip() for c in os.environ.get("CASES", "").split(",") if c.strip()}

CP = "scripts/check-pages.mjs"
HB = "src/pages/HoldingsBehind.tsx"
TR = "src/lib/tranches.ts"
RH = "shared/reviewHolders.mjs"
RB = "scripts/lib/reviewBook.mjs"

AIF = "cio-allocation,holdings-aif"
TXN = "monitor-txns"

# (name, kind, [(file, old, new), ...])
#   kind "sweep:<routes>"  build, then walk those routes
#   kind "book"            run build-book; the case fires if it REFUSES
#   kind "book-silent"     run build-book; the case fires if the BOOK MOVES
CASES = [
 ("the at-cost fold is not drawn — the Category I claim leaves the page", f"sweep:{AIF}", [
   (HB, "            {atCost.length > 0 && (", "            {atCost.length > 99 && (")]),
 ("the fold names the funds and not their categories", f"sweep:{AIF}", [
   (HB, '                    {" · "}{atCostBySection.map(([k, n]) => `${k} ×${n}`).join(", ")}\n', "")]),
 ("the fold drops the fence — its cost is in no total here", f"sweep:{AIF}", [
   (HB, '</span> in no total\n', '</span>\n')]),
 ("the summary reads as a sentence again, as its first draft did", f"sweep:{AIF}", [
   (HB, '{atCost.length === 1 ? "fund" : "funds"} at cost\n',
        '{atCost.length === 1 ? "fund" : "funds"} held at cost\n'),
   (HB, '</span> in no total\n', '</span> at cost, in no total here\n')]),
 ("AIF_BOOK is scoped to the asset class again, not to the bucket", f"sweep:{AIF}", [
   (CP, '&& acc.get(p.accountId)?.engagement !== "PMS" && !atCost(p));',
        '&& acc.get(p.accountId)?.engagement !== "PMS");')]),
 ("the footer's row count is read off the capital rows, not the table's", f"sweep:{TXN}", [
   (CP, "        const drawn = ctx.datedTable?.rows?.length;\n        if (drawn == null) return false;\n        const payments = ctx.mineRows.reduce",
        "        const drawn = ctx.mineRows.length;\n        const payments = ctx.mineRows.reduce")]),
 ("the page counts its capital rows as accounts again", f"sweep:{TXN}", [
   (TR, "    accounts: new Set(groups.map((g) => g.accountId)).size,", "    accounts: groups.length,")]),
 ("a review name is put back to text that reads as another holding", "book", [
   (RH, '    name: "Borosil Renewables - Warrants 13AG26", ...one(AJ) },',
        '    ...one(AJ) },')]),
 ("...and the gate that refuses it is removed with it", "book-silent", [
   (RH, '    name: "Borosil Renewables - Warrants 13AG26", ...one(AJ) },',
        '    ...one(AJ) },'),
   (RB, "    if (now) fail(", "    if (false && now) fail(")]),
 ("an override whose review text collides with nothing is left standing", "book", [
   (RB, "    if (overrides.has(p.security) && !was) fail(", "    if (overrides.has(p.security) && !!was) fail(")]),
]

def run(cmd, cwd=WT, env=None, timeout=1800):
    e = dict(os.environ); e.update(env or {})
    return subprocess.run(cmd, shell=True, cwd=cwd, env=e, capture_output=True, text=True, timeout=timeout)

def build():
    # THE PREPARED READ MODELS ARE PART OF THE BUILD, and a worktree's are its
    # own: `public/views/` and `src/data/readModels.json` are gitignored and
    # content-hashed off the book, so a fresh worktree carries whichever
    # revision it was last built at. Left stale, the Transactions tab loads
    # another book's ledger and every one of its invariants fails — which is
    # what the first run of cases 6 and 7 measured, 27 failures each, on a
    # control that failed the same 27. A bug pass whose control is not clean is
    # not a result, so the views are rebuilt with the bundle.
    r = run("node scripts/build-read-models.mjs 2>&1 && npx tsc -b 2>&1 && npx vite build 2>&1")
    return r.returncode == 0, (r.stdout or "") + (r.stderr or "")

def sweep(routes):
    r = run(f"node scripts/check-pages.mjs", env={"ONLY": routes, "BASE": BASE})
    out = (r.stdout or "").replace("\x00", "") + (r.stderr or "").replace("\x00", "")
    return out

def buildbook():
    r = run("node scripts/build-book.mjs 2>&1")
    return r.returncode, (r.stdout or "") + (r.stderr or "")

FILES = sorted({f for _, _, pats in CASES for f, _, _ in pats})
snap = tempfile.mkdtemp(prefix="at-cost-bug-")
for f in FILES:
    os.makedirs(os.path.join(snap, os.path.dirname(f)), exist_ok=True)
    shutil.copy2(os.path.join(WT, f), os.path.join(snap, f))

def restore():
    for f in FILES:
        shutil.copy2(os.path.join(snap, f), os.path.join(WT, f))
        if not filecmp.cmp(os.path.join(snap, f), os.path.join(WT, f), shallow=False):
            print(f"!! RESTORE FAILED for {f}"); sys.exit(1)

def apply(pats):
    for f, old, new in pats:
        p = os.path.join(WT, f)
        src = open(p, encoding="utf-8").read()
        if src.count(old) != 1:
            return f"{f}: anchor matched {src.count(old)} times"
        open(p, "w", encoding="utf-8").write(src.replace(old, new))
    return None

def findings(out):
    fails = [l.strip() for l in out.splitlines() if "INVARIANT FAILED" in l]
    uncheck = [l.strip() for l in out.splitlines() if "INVARIANT NOT CHECKED" in l]
    tally = [l.strip() for l in out.splitlines() if "combination" in l]
    return fails, uncheck, tally

try:
    print("== CONTROL (no patch) ==", flush=True)
    ok, log = build()
    if not ok:
        print("NOT A RESULT: the control does not build\n" + log[-2000:]); sys.exit(1)
    for routes in (AIF, TXN):
        out = sweep(routes)
        f, u, t = findings(out)
        print(f"  {routes}: {t[-1] if t else 'NO TALLY — NOT A RESULT'}  failures={len(f)} notchecked={len(u)}", flush=True)
        if not t: sys.exit(1)
        for x in f: print("    " + x)
        # A CONTROL THAT FAILS IS NOT A BASELINE. Every case below is read as
        # "these checks fire and the others do not", which says nothing at all
        # if the unpatched tree already fails them.
        if f:
            print("NOT A RESULT: the control is not clean on " + routes); sys.exit(1)
    rc, log = buildbook()
    print(f"  build-book: rc={rc}", flush=True)
    bb = run("git status --porcelain src/data/glowData.ts docs/BOOK-REPORT.md").stdout.strip()
    print(f"  book after control: {'MOVED — NOT A RESULT' if bb else 'byte-identical'}", flush=True)
    if bb: sys.exit(1)

    for i, (name, kind, pats) in enumerate(CASES, 1):
        if PICK and str(i) not in PICK: continue
        print(f"\n== CASE {i}: {name} ==", flush=True)
        err = apply(pats)
        if err:
            print(f"  NOT A RESULT: {err}"); restore(); continue
        if kind.startswith("sweep:"):
            ok, log = build()
            if not ok:
                print("  NOT A RESULT: the patched tree does not build\n  " + log.strip().splitlines()[-1]); restore(); build(); continue
            out = sweep(kind.split(":", 1)[1])
            f, u, t = findings(out)
            print(f"  {t[-1] if t else 'NO TALLY — NOT A RESULT'}  failures={len(f)} notchecked={len(u)}")
            for x in f: print("    " + x)
            if not f: print("  !! CLEAN — this case fires nothing")
        else:
            rc, log = buildbook()
            refused = rc != 0
            moved = bool(run("git status --porcelain src/data/glowData.ts").stdout.strip())
            why = [l for l in log.splitlines() if "review:" in l or "Error" in l or "fail" in l.lower()]
            if kind == "book":
                print(f"  build-book rc={rc} → {'REFUSES' if refused else '!! ACCEPTS — this case fires nothing'}")
            else:
                print(f"  build-book rc={rc}, book {'MOVED' if moved else '!! byte-identical — this case fires nothing'}")
            for x in why[-3:]: print("    " + x.strip()[:200])
            run("git checkout -- src/data/glowData.ts docs/BOOK-REPORT.md")
        restore()
finally:
    restore()
    ok, _ = build()
    run("git checkout -- src/data/glowData.ts docs/BOOK-REPORT.md")
    print(f"\n== restored, rebuilt ({'ok' if ok else 'BUILD FAILED'}) ==")
    shutil.rmtree(snap, ignore_errors=True)
