// ONE SECTOR ROLLUP, TWO PANELS (Stage 10gs).   npm run test:family
//
// Sector Composition and the Returns tab's Sector axis read `sectorSets`. On the
// COMMITTED book, with no look-through (the store unreachable, so nothing is
// derived), both sets partition their holdings into GICS sectors, and the
// sectors' gains and capital add to FIFO struck afresh over every costed
// holding of the set — never read back from the helper under test.
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
import { accountIndex, engagementOf } from "@/lib/accounts";
import { currentHoldings, dedupedPositions, holdingRoute, isCompanyShare } from "@/lib/analytics";
import { fifoTotals } from "@/lib/fifo";
import { hasSectorReturnCost } from "@/lib/sectorReturnCoverage";
import { sectorSets } from "@/lib/sectorRollup";
import { GICS_SECTORS, UNCLASSIFIED } from "@/lib/sectors";
import type { Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

const consolidated = dedupedPositions(BOOK_POSITIONS as Position[]);
const idx = accountIndex(BOOK_ACCOUNTS);
const sets = sectorSets(consolidated, idx, { status: "unreachable" });
const shares = currentHoldings(consolidated).filter(isCompanyShare);
const own = shares.filter((p) => holdingRoute(engagementOf(idx, p) || null) === "own");
const sectorKeys = new Set<string>([...GICS_SECTORS, UNCLASSIFIED]);

ok("the book carries own-account shares and mandate shares (load-bearing)", own.length > 0 && shares.length > own.length,
  `${own.length} own of ${shares.length}`);

for (const [name, rows, set] of [["Consolidated", sets.consSectors, shares], ["Direct Equity", sets.directSectors, own]] as const) {
  const held = rows.flatMap((s) => s.positions);
  ok(`${name}: every row is a sector, never a fund, cash or private class`, rows.length > 0 && rows.every((s) => sectorKeys.has(s.key)),
    rows.map((s) => s.key).join(", "));
  ok(`${name}: the sectors partition the set's holdings`, held.length === set.length && new Set(held).size === set.length && set.every((p) => held.includes(p)));
  ok(`${name}: the sector values add to the set's value`, near(rows.reduce((a, s) => a + s.mv, 0), set.reduce((a, p) => a + p.marketValue, 0)));
  const fifo = fifoTotals(set.filter(hasSectorReturnCost));
  const gain = rows.reduce((a, s) => a + (s.gain ?? 0), 0), deployed = rows.reduce((a, s) => a + (s.gain === null ? 0 : s.deployed ?? 0), 0);
  ok(`${name}: the sectors' gains and capital add to FIFO over every costed holding`, near(gain, fifo.gain ?? 0) && near(deployed, fifo.deployed ?? 0),
    `${(gain / 1e7).toFixed(2)} Cr on ${(deployed / 1e7).toFixed(2)} Cr`);
  ok(`${name}: a sector's return is its gain over its capital`, rows.every((s) => s.returnPct === null
    || (s.gain !== null && s.deployed !== null && Math.abs(s.returnPct - s.gain / s.deployed * 100) < 1e-9)));
}

if (fails) { console.log(`\n${fails} failing`); process.exit(1); }
