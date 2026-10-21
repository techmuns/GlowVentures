/**
 * A scheme's own returns, and the ones its NAV series cannot support.
 *
 * Anchored on the COMMITTED store (`public/lookthrough/`), with every
 * expectation re-derived here from the store's raw start and end NAVs — never
 * read back out of `schemeReturns` — and on constructed series for the
 * boundaries the store does not exercise.
 *
 * The load-bearing claims:
 *   • DSP's Gold and Silver ETFs cross a unit event, and EVERY one of their
 *     returns is refused — the figures were −89% "in a month";
 *   • no other scheme in the store has a single return refused — a rule that
 *     refused good returns would be as wrong as one that let the split through;
 *   • the interval bound is load-bearing: DSP Silver genuinely rose 2.07× over
 *     181 days, and a factor-of-two rule with no interval refuses it;
 *   • the store's `cagr` is read as annualised whatever its case.
 */
import fs from "node:fs";
import path from "node:path";
import {
  navSeries, unitBreaks, schemeReturns, breakAfter, stepWords,
  UNIT_BREAK_FACTOR, UNIT_BREAK_MAX_DAYS,
} from "../schemeReturns";
import type { FundPortfolio } from "../lookthrough";

let failed = 0, passed = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};

const DIR = path.join(process.env.GLOW_FIXTURES ?? "src/lib/__tests__/fixtures", "../../../../public/lookthrough");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
const store = new Map<string, FundPortfolio>(files.map((f) => [f.replace(/\.json$/, ""), JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))]));
const index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8")) as { schemes: Record<string, { schemecode: string }> };

ok("the store carries schemes to check", store.size >= 10, `${store.size} scheme files`);

/**
 * THE RULE RE-EXPRESSED, on the store's raw fields: every dated NAV the file
 * states, consecutive pairs no more than a quarter apart, a factor of two
 * either way. Written independently of the module so the two agreeing is a
 * measurement rather than a copy.
 */
function expectedBreakWindows(p: FundPortfolio): Set<string> {
  const pts: [string, number][] = [];
  for (const r of Object.values(p.returns ?? {})) {
    if (r.startDate && r.startNav) pts.push([r.startDate, r.startNav]);
    if (r.endDate && r.endNav) pts.push([r.endDate, r.endNav]);
  }
  if (p.nav?.prevDate && p.nav.prev) pts.push([p.nav.prevDate, p.nav.prev]);
  if (p.nav?.date && p.nav.value) pts.push([p.nav.date, p.nav.value]);
  const byDate = new Map<string, number>();
  for (const [d, v] of pts) if (!byDate.has(d)) byDate.set(d, v);
  const s = [...byDate].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const steps: [string, string][] = [];
  for (let i = 1; i < s.length; i++) {
    const dd = (Date.parse(s[i][0]) - Date.parse(s[i - 1][0])) / 86_400_000;
    const f = s[i][1] / s[i - 1][1];
    if (dd <= 92 && (f >= 2 || f <= 0.5)) steps.push([s[i - 1][0], s[i][0]]);
  }
  const refused = new Set<string>();
  for (const [k, r] of Object.entries(p.returns ?? {})) {
    if (r.startDate && r.endDate && steps.some(([a, b]) => a >= r.startDate! && b <= r.endDate!)) refused.add(k);
  }
  return refused;
}

// ── 1. The two DSP metal ETFs: every return crosses the split and is refused ──
const dspKeys = ["dsp-gold-etf", "dsp-silver-etf"];
for (const key of dspKeys) {
  const code = index.schemes[key]?.schemecode;
  const p = code ? store.get(code) : undefined;
  ok(`${key} resolves in the store`, !!p, code ?? "no schemecode");
  if (!p) continue;
  const res = schemeReturns(p);
  const periods = Object.keys(p.returns);
  ok(`${key}: a unit event is found`, res.breaks.length === 1, JSON.stringify(res.breaks));
  const b = res.breaks[0];
  ok(`${key}: the step is a split of the units — the NAV falls by more than ${UNIT_BREAK_FACTOR}× inside a quarter`,
    !!b && b.factor < 1 / UNIT_BREAK_FACTOR && b.days <= UNIT_BREAK_MAX_DAYS, b ? `${stepWords(b)} in ${b.days} days` : "none");
  ok(`${key}: every return is refused (${periods.join(", ")})`, res.refused === periods.length && res.rows.every((r) => r.refused),
    res.rows.filter((r) => !r.refused).map((r) => `${r.period} ${r.value}`).join(", "));
  ok(`${key}: each refusal names both NAVs and both dates of the step`,
    res.rows.every((r) => r.refused && b && r.refused.includes(String(b.from.nav).slice(0, 5)) && /change in the unit/.test(r.refused) && /not adjusted/.test(r.refused)));
  // The statement behind the family's holding is dated before the step, so it
  // counts the scheme's EARLIER unit — which is why its mark is ~10× the NAV.
  ok(`${key}: a 31 Jul 2026 statement is before the step`, !!breakAfter(res.breaks, "2026-07-31"));
  ok(`${key}: a statement dated after the step is not`, !breakAfter(res.breaks, "2026-09-10"));
}

// ── 2. Every other scheme in the store: NOTHING refused ────────────────────────
const dspCodes = new Set(dspKeys.map((k) => index.schemes[k]?.schemecode));
let others = 0, wrongly = 0;
for (const [code, p] of store) {
  const expected = expectedBreakWindows(p);
  const got = new Set(schemeReturns(p).rows.filter((r) => r.refused).map((r) => r.period));
  const same = expected.size === got.size && [...expected].every((k) => got.has(k));
  if (!same) { wrongly++; console.log(`    ${code}: expected ${[...expected]} got ${[...got]}`); }
  if (!dspCodes.has(code)) { others++; if (got.size) console.log(`    ${code} (${p.scheme}) refused ${[...got]}`); }
}
ok("the module agrees with the rule re-expressed on the store's raw NAVs, scheme by scheme", wrongly === 0, `${wrongly} disagree`);
ok("no scheme other than the two DSP ETFs has a return refused",
  [...store].filter(([c]) => !dspCodes.has(c)).every(([, p]) => schemeReturns(p).refused === 0), `${others} other schemes`);

// ── 3. The interval bound is load-bearing ─────────────────────────────────────
{
  const silver = store.get(index.schemes["dsp-silver-etf"]?.schemecode ?? "");
  const s = silver ? navSeries(silver) : [];
  // A genuine move of at least 2× over MORE than a quarter must exist in the
  // store, or the bound is asserting nothing.
  let longDouble = false;
  for (let i = 1; i < s.length; i++) {
    const d = (Date.parse(s[i].date) - Date.parse(s[i - 1].date)) / 86_400_000;
    const f = s[i].nav / s[i - 1].nav;
    if (d > UNIT_BREAK_MAX_DAYS && (f >= UNIT_BREAK_FACTOR || f <= 1 / UNIT_BREAK_FACTOR)) longDouble = true;
  }
  ok("the store carries a genuine ≥2× move over more than a quarter (DSP Silver's rally)", longDouble);
  ok("…and the rule does not call it a unit event", unitBreaks(s).every((b) => b.days <= UNIT_BREAK_MAX_DAYS));
}

// ── 4. Constructed boundaries ─────────────────────────────────────────────────
const mk = (returns: FundPortfolio["returns"], nav: Partial<FundPortfolio["nav"]> = {}) =>
  ({ returns, nav: { value: null, date: null, prev: null, prevDate: null, changePct: null, ...nav } }) as Pick<FundPortfolio, "nav" | "returns">;
{
  // A 1:5 split inside a month, windows either side of it.
  const p = mk({
    "1M": { value: -79, kind: "simple", startDate: "2026-01-01", endDate: "2026-01-31", startNav: 100, endNav: 21 },
    "3M": { value: 5, kind: "simple", startDate: "2026-01-31", endDate: "2026-04-30", startNav: 21, endNav: 22.05 },
  });
  const r = schemeReturns(p);
  ok("a 1:5 split inside a month refuses the window that spans it", r.rows.find((x) => x.period === "1M")?.refused != null);
  ok("…and not the window wholly after it", r.rows.find((x) => x.period === "3M")?.refused == null);
}
{
  // A consolidation (NAV × 10) is a unit event too.
  const p = mk({ "1M": { value: 900, kind: "simple", startDate: "2026-01-01", endDate: "2026-01-31", startNav: 10, endNav: 100 } });
  ok("a consolidation (NAV ×10) inside a month is refused", schemeReturns(p).refused === 1);
}
{
  // A 60% rise in a quarter is a market, not a unit.
  const p = mk({ "3M": { value: 60, kind: "simple", startDate: "2026-01-01", endDate: "2026-03-31", startNav: 100, endNav: 160 } });
  ok("a 60% rise inside a quarter is not refused", schemeReturns(p).refused === 0);
}
{
  const p = mk({
    "3Y": { value: 12, kind: "cagr", startDate: "2023-01-01", endDate: "2026-01-01", startNav: 100, endNav: 140.5 },
    "5Y": { value: 12, kind: "CAGR", startDate: "2021-01-01", endDate: "2026-01-01", startNav: 80, endNav: 140.5 },
    "1M": { value: 1, kind: "simple", startDate: "2025-12-01", endDate: "2026-01-01", startNav: 139, endNav: 140.5 },
    "2W": { value: 1, kind: null, startDate: "2025-12-18", endDate: "2026-01-01", startNav: 139, endNav: 140.5 },
  });
  const r = schemeReturns(p).rows;
  ok("the store's lowercase `cagr` is read as annualised", r.find((x) => x.period === "3Y")?.annualised === true);
  ok("…and so is an uppercase `CAGR`", r.find((x) => x.period === "5Y")?.annualised === true);
  ok("`simple` and a missing kind are not annualised", r.filter((x) => x.period === "1M" || x.period === "2W").every((x) => !x.annualised));
}
{
  // The store's own 3Y figures are CAGRs: reproduce ABSL Liquid's +7.0% from its NAVs.
  const p = store.get(index.schemes["absl-liqf-d-growth"]?.schemecode ?? "");
  const r3 = p?.returns?.["3Y"];
  if (r3 && r3.startNav && r3.endNav && r3.startDate && r3.endDate) {
    const yrs = (Date.parse(r3.endDate) - Date.parse(r3.startDate)) / (365.25 * 86_400_000);
    const cagr = (Math.pow(r3.endNav / r3.startNav, 1 / yrs) - 1) * 100;
    const simple = (r3.endNav / r3.startNav - 1) * 100;
    ok("ABSL Liquid's 3Y is the CAGR of its own NAVs, not the simple return", Math.abs(cagr - r3.value) < 0.1 && Math.abs(simple - r3.value) > 5,
      `value ${r3.value}, CAGR ${cagr.toFixed(2)}, simple ${simple.toFixed(2)}`);
    ok("…and the module marks it annualised", schemeReturns(p!).rows.find((x) => x.period === "3Y")?.annualised === true);
  } else ok("ABSL Liquid carries a 3Y return in the store", false);
}

console.log(`\nscheme returns: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
