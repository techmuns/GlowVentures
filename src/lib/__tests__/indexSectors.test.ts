// AN INDEX'S SECTOR WEIGHTS, CHECKED AGAINST THE FACTSHEET FILE THEY COME FROM.
//   npm run test:family
//
// Sector Composition sets the family's allocation against an index the reader
// picks (Stage 10fe). `src/data/indexSectors.json` is generated from each
// index's NSE factsheet by `npm run build-index-sectors`; `indexSectors()` rolls
// its sectors into GICS sectors through `resolveSector`. A wrong roll-up looks
// exactly like a right one on a bar chart, so every expectation here is a
// RELATION on the generated file — never a typed-in weight — and survives the
// next month's factsheet.
import data from "@/data/indexSectors.json";
import { BENCHMARKS, type BenchmarkKey } from "@/lib/benchmarks";
import { indexSectors } from "@/lib/indexSectors";
import { resolveSector, UNCLASSIFIED, GICS_SECTORS } from "@/lib/sectors";

let fails = 0;
function ok(name: string, pass: boolean, detail?: string) {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
}

type Raw = { asOf: string; url: string; sectors: { label: string; weight: number }[] };
const RAW = (data as { indices: Record<string, Raw> }).indices;
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;

console.log("── the file is the factsheets, whole and dated ──");
ok("at least one index is read", Object.keys(RAW).length > 0, Object.keys(RAW).join(", "));
for (const [key, ix] of Object.entries(RAW)) {
  const total = ix.sectors.reduce((a, s) => a + s.weight, 0);
  ok(`${key}: its weights are the whole index (100 within the printed rounding)`, Math.abs(total - 100) <= 0.1, total.toFixed(2));
  ok(`${key}: dated, and from NSE's factsheet`, /^\d{4}-\d{2}-\d{2}$/.test(ix.asOf) && /niftyindices\.com\/Factsheet\//.test(ix.url), `${ix.asOf} ${ix.url}`);
  ok(`${key}: keyed on an index the NAV chart offers`, BENCHMARKS.some((b) => b.key === key));
}

console.log("\n── the roll-up into GICS loses nothing and invents nothing ──");
for (const b of BENCHMARKS) {
  const r = indexSectors(b.key as BenchmarkKey);
  const raw = RAW[b.key];
  if (!raw) {
    ok(`${b.key}: no factsheet read, so it is absent with a reason`, !r.ok && r.reason.length > 40);
    continue;
  }
  if (!r.ok) { ok(`${b.key}: read`, false, "indexSectors() says absent for an index the file carries"); continue; }
  const total = raw.sectors.reduce((a, s) => a + s.weight, 0) / 100;
  ok(`${b.key}: the GICS rows add to the factsheet's own total`, near(r.rows.reduce((a, x) => a + x.weight, 0), total));
  ok(`${b.key}: every row is a GICS sector or the index's own Unclassified`,
    r.rows.every((x) => GICS_SECTORS.includes(x.sector) || x.sector === UNCLASSIFIED));
  ok(`${b.key}: each row is exactly the factsheet sectors the map places there`,
    r.rows.every((x) => near(x.weight, raw.sectors.filter((s) => resolveSector(s.label).sector === x.sector).reduce((a, s) => a + s.weight / 100, 0))
      && x.from.every((f) => resolveSector(f.label).sector === x.sector)));
  const u = r.rows.findIndex((x) => x.sector === UNCLASSIFIED);
  ok(`${b.key}: the unplaced, if any, is last`, u === -1 || u === r.rows.length - 1);
  const unplaced = raw.sectors.filter((s) => resolveSector(s.label).matchedBy === null);
  ok(`${b.key}: what the map cannot place is small and named`, unplaced.reduce((a, s) => a + s.weight, 0) < 1,
    unplaced.map((s) => `${s.label} ${s.weight}%`).join(", ") || "none");
}

console.log(fails === 0 ? "\nAll index-sector checks passed." : `\n${fails} FAILED`);
if (fails) process.exit(1);
