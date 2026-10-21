#!/usr/bin/env python3
"""Put each Transactions / ManagerTrades defect back, one at a time, and watch its guard fail.

    BASE=http://127.0.0.1:<port> python3 scripts/dev/txn-labels-bug.py
    CASES=3,7 ...  re-runs chosen cases (0 is the no-patch control)

Every case patches exact text that must occur ONCE (a patch that does not
apply is reported as NOT A RESULT, never as a clean run), rebuilds when a page
file moved, runs only the routes and suites that exist to catch it, and
restores the files from memory — verified byte for byte — before the next
case. The tree is rebuilt clean on the way out. Commit before running it, and
never edit a file it patches while it runs.

A case passes when its guard FIRES: at least one "INVARIANT FAILED" on its
routes, or a non-zero suite exit.
"""
import os, subprocess, sys, tempfile, time, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = os.environ.get("BASE", "http://127.0.0.1:4173")
OUT = pathlib.Path(os.environ.get("BUG_OUT") or tempfile.mkdtemp(prefix="txn-labels-bug-"))
SUITE_DIR = pathlib.Path(os.environ.get("SUITE_DIR") or (ROOT / "node_modules" / f".glow-bug-{os.getpid()}"))
PM, MH = "src/pages/PortfolioMonitor.tsx", "src/pages/MandateHoldings.tsx"
LEDGER, ROLL, AXIS, TR = "src/lib/ledger.ts", "src/lib/txnRollup.ts", "src/lib/txnAxis.ts", "src/lib/tranches.ts"
SUITES = {
    "ledger": "src/lib/__tests__/ledgerJoins.test.ts",
    "rollup": "src/lib/__tests__/txnRollup.test.ts",
    "axis": "src/lib/__tests__/txnAxis.test.ts",
    "tranches": "src/lib/__tests__/tranches.test.ts",
}
ALL_ROUTES = ["monitor-txns", "monitor-txn-realised", "monitor-txn-direct", "monitor-txn-out",
              "monitor-txn-window-early", "monitor-txn-window-late", "mandate-trades-realised"]

# (id, finding, [(file, old, new), ...], routes, suites)
CASES = [
    (1, "MT-6: the return headers borrow the Holdings tab's FIFO wording",
     [(PM, "title={TXN_MEASURE_HINT[measure]}", "title={def.hint}")], ["monitor-txns"], []),
    (2, "MT-7: the Value total stops naming the holding two account rows both report",
     [(PM, "                        doubled.groups.length\n", "                        doubled.groups.length > 1e9\n")], ["monitor-txns"], []),
    (3, "MT-8: Purchased on spans every movement, not the purchases",
     [(TR, "const boughtDates = ins.map((m) => m.date).sort();", "const boughtDates = ms.map((m) => m.date).sort();")],
     ["monitor-txns"], ["tranches"]),
    (4, "MT-9: a Value cell stops naming the statement date it is struck at",
     [(PM, "asOfOf(r) ? `As of ${fmtDate(asOfOf(r)!)} — the date of the statement",
           "asOfOf(r) === \"__never__\" ? `As of ${fmtDate(asOfOf(r)!)} — the date of the statement")], ["monitor-txns"], []),
    (5, "MT-10: a sale is classed on its own key, never the one book security its ISIN names",
     [(AXIS, "const bookKey = bookKeyOf(t);", "const bookKey = t.isin === \"__never__\" ? bookKeyOf(t) : null;")],
     ["monitor-txns"], ["axis"]),
    (6, "MT-12: every unrealised sale is told no lot matches — its account's own window and absence ignored",
     [(LEDGER, "if (cg?.absent) {", "if (cg?.absent && t.date === \"__never__\") {"),
      (LEDGER, "} else if (cg && ((cg.periodTo && t.date > cg.periodTo)",
               "} else if (cg && t.date === \"__never__\" && ((cg.periodTo && t.date > cg.periodTo)")],
     ["monitor-txn-realised"], ["ledger"]),
    (7, "MT-12: a sibling's sale is counted as unreported in k of n",
     [(ROLL, "realizedOf: sells.filter(realisedIsCounted).length,", "realizedOf: sells.filter((r) => r.realized != null).length,")],
     ["monitor-txn-realised"], ["ledger", "rollup"]),
    (8, "MT-13: a side line denies its sibling — the other side says 'not traded'",
     [(PM, "ins.side === \"Sell\" && hasSide(ins, \"Buy\")\n      ? \"this line holds the sales",
           "ins.side === \"Sell\" && hasSide(ins, \"Buy\") && ins.key === \"__never__\"\n      ? \"this line holds the sales")],
     ["monitor-txn-realised"], []),
    (9, "MT-14: the dated table's staggered pill says 'built up' whatever side was worked",
     [(PM, "const b = ins.buys >= STAGGERED_MIN, sl = ins.sells >= STAGGERED_MIN;",
           "const b = ins.buys + ins.sells >= STAGGERED_MIN, sl = ins.key === \"__never__\";")], ["monitor-txn-realised"], []),
    (10, "MT-14: ManagerTrades' staggered pill says 'built up' whatever side was worked",
     [(MH, "title={ins.buys >= STAGGERED_MIN && ins.sells >= STAGGERED_MIN",
           "title={ins.key !== \"__never__\" ? `Built up over ${ins.days} trading days rather than in one go.` : ins.buys >= STAGGERED_MIN && ins.sells >= STAGGERED_MIN")],
     ["mandate-trades-realised"], []),
    (11, "MT-15: an own-broking security row is told the managed mandates issue a ledger",
     [(PM, "return own ? OWN_TRADE_CAPITAL_WHY : NO_CAPITAL_WHY;", "return own && r.key === \"__never__\" ? OWN_TRADE_CAPITAL_WHY : NO_CAPITAL_WHY;")],
     ["monitor-txn-direct"], []),
    (12, "MT-15: the capital drill-down heads its purchase column 'Bought', the manager's word",
     [(PM, "pad=\"px-3 py-1.5\">Purchase</SortHeader>", "pad=\"px-3 py-1.5\">Bought</SortHeader>")], ["monitor-txn-out"], []),
    (13, "MT-16: a window before the tape prints 0 trades as a count",
     [(PM, "const outsideTape = windowed && !!tapePeriod.from", "const outsideTape = windowed && from === \"__never__\" && !!tapePeriod.from")],
     ["monitor-txn-window-early"], []),
    (14, "MT-16: under a date window the absence is worded as the side filter's",
     [(PM, "const noPurchaseWhy = side === \"out\"", "const noPurchaseWhy = side === \"out\" || windowed")],
     ["monitor-txn-window-late"], []),
    (15, "MT-18: a bare dash comes back in the dated table",
     [(PM, "{!trd ? <AbsentCell reason={NO_TRADES_WHY} />\n                              : <>{fmtNum(trd.trades)}",
           "{!trd ? \"—\"\n                              : <>{fmtNum(trd.trades)}")], ["monitor-txns"], []),
    # The defect as the audit found it: ONE hardcoded reason on every line with
    # no realised figure, whatever it sold. On this book every sale in a mandate
    # that issues a capital gain statement is settled by a lot (A-08), so the
    # lines it reaches there are the buy-only ones — 13 on the route's subject.
    (16, "DSM-C10: ManagerTrades tells every unrealised line, sold or not, that no capital gain statement covers it",
     [(MH, "reason={ins.sells === 0 ? \"nothing of this security was sold over the period, so nothing was realised\" : realisedAbsence(ins.tranches)} />",
           "reason={ins.key === \"__never__\" ? realisedAbsence(ins.tranches) : \"no capital gain statement covers this account, so what these sales realised was never reported\"} />")],
     ["mandate-trades-realised"], []),
    (17, "DSM-D8: a side the manager never traded is a bare dash again",
     [(MH, "{ins.buys === 0 ? <AbsentCell reason=\"nothing of this security was bought over the period — there is no buy row, rather than a missing figure\" />",
           "{ins.buys === 0 ? \"—\"")], ["mandate-trades-realised"], []),
    (18, "DSM-D9: a trade with no printed price or amount reads ₹0 again",
     [(LEDGER, "const qty = t.quantity ?? 0, amount = settledAmount(t);", "const qty = t.quantity ?? 0, amount = settledAmount(t) ?? 0;"),
      (LEDGER, "rate: t.unitPrice ?? (amount != null && qty > 0 ? amount / qty : null), amount,",
               "rate: t.unitPrice ?? (qty > 0 ? amount / qty : 0), amount,")], [], ["ledger"]),
]


def sh(cmd, log, env=None, timeout=3600):
    with open(log, "w") as f:
        p = subprocess.run(cmd, cwd=ROOT, stdout=f, stderr=subprocess.STDOUT, env={**os.environ, **(env or {})}, timeout=timeout)
    return p.returncode


def build(tag):
    return sh(["npm", "run", "build"], OUT / f"build-{tag}.log") == 0


def run_routes(routes, tag):
    if not routes:
        return None
    log = OUT / f"pages-{tag}.log"
    sh(["node", "scripts/check-pages.mjs"], log, env={"BASE": BASE, "ONLY": ",".join(routes), "THEMES": "light",
                                                     "SHOTS": "0", "OUT": str(OUT / f"cp-{tag}")})
    text = log.read_text(errors="replace").replace("\x00", "")
    return [l.strip() for l in text.splitlines() if "INVARIANT FAILED" in l or l.startswith("✗ light")]


def run_suites(names, tag):
    out = {}
    SUITE_DIR.mkdir(parents=True, exist_ok=True)
    for n in names:
        rel = SUITES[n]
        bundle = SUITE_DIR / (pathlib.Path(rel).stem + ".mjs")
        b = subprocess.run([str(ROOT / "node_modules/.bin/esbuild"), str(ROOT / rel), "--bundle", "--platform=node",
                            "--format=esm", f"--outfile={bundle}", "--packages=external", f"--alias:@={ROOT / 'src'}",
                            "--log-level=error"], cwd=ROOT, capture_output=True, text=True)
        if b.returncode != 0:
            out[n] = ("BUNDLE-FAILED", [b.stderr[-300:]])
            continue
        log = OUT / f"suite-{tag}-{n}.log"
        code = sh(["node", str(bundle)], log, env={"GLOW_FIXTURES": str(ROOT / "src/lib/__tests__/fixtures")})
        text = log.read_text(errors="replace").replace("\x00", "")
        out[n] = (code, [l for l in text.splitlines() if l.startswith("FAIL")][:6])
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    pick = os.environ.get("CASES")
    wanted = {int(x) for x in pick.split(",")} if pick else None
    report = []
    # ── the control: nothing patched, every route and suite this harness uses ──
    if wanted is None or 0 in wanted:
        ok = build("control")
        pages = run_routes(ALL_ROUTES, "control") if ok else None
        suites = run_suites(list(SUITES), "control") if ok else {}
        clean = ok and not [l for l in pages if "INVARIANT FAILED" in l] and all(c == 0 for c, _ in suites.values())
        report.append(("0", "control — nothing patched", "clean" if clean else "NOT CLEAN", pages or [], suites))
        print(f"[0] control: {'clean' if clean else 'NOT CLEAN'}", flush=True)
    touched_page = False
    for cid, what, patches, routes, suites in CASES:
        if wanted is not None and cid not in wanted:
            continue
        files = sorted({p[0] for p in patches})
        snap = {f: (ROOT / f).read_bytes() for f in files}
        verdict, pages, sres = None, [], {}
        try:
            for f, old, new in patches:
                s = (ROOT / f).read_text()
                n = s.count(old)
                if n != 1:
                    verdict = f"NOT A RESULT — anchor occurs {n} times in {f}"
                    break
                (ROOT / f).write_text(s.replace(old, new))
            if verdict is None:
                if routes:
                    touched_page = True
                    if not build(f"case{cid}"):
                        verdict = "NOT A RESULT — the patched tree does not build"
                if verdict is None:
                    pages = run_routes(routes, f"case{cid}") or []
                    sres = run_suites(suites, f"case{cid}")
                    fired = [l for l in pages if "INVARIANT FAILED" in l]
                    sfired = [n for n, (c, _) in sres.items() if c != 0]
                    verdict = "FIRES" if (fired or sfired) else "CLEAN — the guard did not fire"
        finally:
            for f, b in snap.items():
                (ROOT / f).write_bytes(b)
                if (ROOT / f).read_bytes() != b:
                    print(f"RESTORE FAILED for {f}", flush=True)
                    sys.exit(2)
        report.append((str(cid), what, verdict, pages, sres))
        print(f"[{cid}] {what}: {verdict}", flush=True)
        for l in pages:
            print(f"      {l[:220]}", flush=True)
        for n, (c, fl) in sres.items():
            print(f"      suite {n}: exit {c}" + ("".join(f"\n        {x[:200]}" for x in fl)), flush=True)
    if touched_page:
        build("final")
    (OUT / "summary.txt").write_text("\n".join(f"[{c}] {w}: {v}" for c, w, v, _, _ in report) + "\n")
    print(f"summary: {OUT / 'summary.txt'}", flush=True)
    bad = [r for r in report if r[0] != "0" and r[2] != "FIRES"] + [r for r in report if r[0] == "0" and r[2] != "clean"]
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
