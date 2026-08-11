// THE HARVESTER — `npm run harvest`.
//
// Reads the catalogue, fetches each series from its adapter, puts every point
// through the validation gate, merges it over what is already stored, writes the
// series store and the manifest, and reports what happened to
// `docs/SERIES-REPORT.md`.
//
// IT IS IDEMPOTENT. Run it twice with no new data upstream and the second run
// writes nothing and leaves the working tree clean — the same guarantee
// `build-book` gives, and the reason a nightly scheduled run only produces a
// commit when a figure actually moved.
//
// IT NEVER TRUNCATES. Merge keeps every stored observation the incoming batch
// does not mention, so a source that goes dark for a week cannot shorten the
// history we already hold, and the sources arriving in later phases that publish
// only a CURRENT value accumulate their history here one run at a time.
//
// A SERIES THAT FAILS KEEPS ITS LAST GOOD DATA. There is no partial write and no
// empty overwrite: a fetch that throws is reported, the stored series is left
// exactly as it was, and the manifest carries the failure so the page can say
// when the figure was last actually measured.

import { writeFileSync, mkdirSync } from "node:fs";
import { harvestable, declaredAbsent, SERIES, CATEGORIES } from "./catalogue.mjs";
import { readSeries, writeSeries, writeIndex, readIndex, merge, writeIfChanged } from "./lib/store.mjs";
import { validate, freshness } from "./lib/validate.mjs";
import { computeReturns } from "./lib/returns.mjs";
import * as yahoo from "./adapters/yahoo.mjs";
import * as worldbankPink from "./adapters/worldbankPink.mjs";
import * as worldbankApi from "./adapters/worldbankApi.mjs";
import * as rbi from "./adapters/rbi.mjs";
import * as iex from "./adapters/iex.mjs";
import * as fred from "./adapters/fred.mjs";
import * as dataGovIn from "./adapters/dataGovIn.mjs";

const ADAPTERS = { yahoo, worldbankPink, worldbankApi, rbi, iex, fred, dataGovIn };
const CONCURRENCY = 4;          // polite against a free upstream
const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]?.split(",")
  : null;

const nowIso = new Date().toISOString();

async function harvestOne(spec) {
  const adapter = ADAPTERS[spec.source.adapter];
  if (!adapter) return { spec, status: "failed", error: `no adapter "${spec.source.adapter}"`, findings: [] };

  const { meta: storedMeta, points: stored } = readSeries(spec.id);
  let fetched;
  try {
    fetched = await adapter.fetchSeries(spec);
  } catch (e) {
    // Keep whatever is on disk. Report the failure; do not write.
    return {
      spec, status: "failed", error: String(e.message || e), findings: [],
      kept: stored.length, meta: storedMeta,
    };
  }

  const { points: accepted, findings } = validate(spec, stored, fetched.points);
  if (!accepted.length) {
    return { spec, status: "failed", error: "no points survived validation", findings, kept: stored.length, meta: storedMeta };
  }

  const { points, revisions } = merge(stored, accepted);
  if (revisions.length) {
    findings.push({
      severity: "warn", rule: "revised-history",
      detail: `${revisions.length} stored point(s) restated by the source; most recent ${revisions[revisions.length - 1].t}`,
    });
  }

  // The upstream's own currency, checked against what the catalogue declares.
  // A silent unit change at the source is the failure this catches.
  const upstreamUnit = adapter.unitPrefixFor?.(fetched.upstreamCurrency) ?? null;
  if (upstreamUnit && spec.unit && !spec.unit.startsWith(upstreamUnit) && spec.unit !== "index" && spec.unit !== "%") {
    findings.push({
      severity: "warn", rule: "unit-mismatch",
      detail: `catalogue says "${spec.unit}", upstream reports "${fetched.upstreamCurrency}"`,
    });
  }
  // The Pink Sheet PRINTS its unit in the sheet ("$/mt", "$/dmtu"). Comparing it
  // against what the catalogue declares is the check that catches the World Bank
  // changing a basis — the failure that would otherwise put a per-dmtu iron-ore
  // price on a chart labelled per tonne.
  if (fetched.upstreamUnit) {
    // "$/mt" and "USD/t" are the same unit written two ways, so the comparison
    // normalises the numerator and the denominator separately against a small
    // vocabulary. Matching on raw text instead reported a mismatch on every
    // Pink Sheet series, which would train a reader to ignore the one finding
    // that matters — the World Bank actually changing a basis.
    const DENOM = { mt: "t", t: "t", tonne: "t", troyoz: "oz", oz: "oz" };
    const norm = (u) => {
      const [num = "", den = ""] = String(u).toLowerCase().replace(/\s+/g, "").split("/");
      const n = num.replace(/^\$$/, "usd");
      const d = DENOM[den] ?? den;
      return `${n}/${d}`;
    };
    if (norm(fetched.upstreamUnit) !== norm(spec.unit)) {
      findings.push({
        severity: "warn", rule: "unit-mismatch",
        detail: `catalogue says "${spec.unit}", the sheet prints "${fetched.upstreamUnit}"`,
      });
    }
  }

  // Frequency governs BOTH which horizons exist (a monthly series has no "1D"
  // return) and how long silence has to run before the source counts as stale.
  const frequency = spec.frequency ?? "daily";
  const kind = spec.unit === "%" ? "yield" : "price";
  const stats = computeReturns(points, kind, frequency);
  const fresh = freshness(frequency, points[points.length - 1].t);

  // IDEMPOTENCE. `retrievedAt` is the one field that would otherwise differ on
  // every run, rewriting all 37 meta files nightly and producing a commit whose
  // entire content is a new timestamp. It records when the data was last
  // actually OBSERVED TO CHANGE, so a run that finds nothing new leaves the
  // working tree clean — the same guarantee `build-book` gives.
  const dataChanged = revisions.length > 0 || points.length !== stored.length;
  const retrievedAt = dataChanged || !storedMeta?.retrievedAt ? nowIso : storedMeta.retrievedAt;

  const meta = {
    id: spec.id,
    label: spec.label,
    category: spec.category,
    group: spec.group,
    unit: spec.unit,
    kind,
    frequency,
    provenance: spec.source.provenance,
    source: {
      name: spec.source.name,
      symbol: spec.source.symbol,
      url: fetched.sourceUrl ?? spec.source.url,
      exchange: fetched.exchange,
      upstreamCurrency: fetched.upstreamCurrency,
    },
    note: spec.note ?? null,
    // A source that publishes only a CURRENT value: the store builds its history
    // one run at a time, so the UI must say "accumulating since" rather than
    // present a two-point series as though it were a record going back years.
    accumulating: spec.source.accumulating === true,
    first: points[0].t,
    last: points[points.length - 1].t,
    count: points.length,
    retrievedAt,
    staleSince: fresh.stale ? points[points.length - 1].t : null,
  };

  const changed = writeSeries(meta, points);
  return { spec, status: "ok", findings, meta, stats, changed, added: points.length - stored.length };
}

async function main() {
  const specs = harvestable().filter((s) => !only || only.includes(s.id));
  console.log(`harvest · ${specs.length} series from ${new Set(specs.map((s) => s.source.adapter)).size} adapter(s)`);

  const results = [];
  for (let i = 0; i < specs.length; i += CONCURRENCY) {
    const batch = specs.slice(i, i + CONCURRENCY);
    const done = await Promise.all(batch.map(harvestOne));
    for (const r of done) {
      const tag = r.status === "ok"
        ? `${String(r.meta.count).padStart(6)} pts  ${r.meta.first} → ${r.meta.last}${r.added ? `  (+${r.added})` : ""}`
        : `FAILED — ${r.error}`;
      console.log(`  ${r.spec.id.padEnd(22)} ${tag}`);
      results.push(r);
    }
  }

  // ── Manifest ────────────────────────────────────────────────────────────
  // One fetch on the client powers the whole returns table. The chart loads the
  // year chunks it needs and nothing more.
  const ok = results.filter((r) => r.status === "ok");
  const harvested = ok.map((r) => ({
    ...r.meta,
    last_value: r.stats.last,
    returns: r.stats.returns,
    spans: r.stats.spans,
    high52: r.stats.high52,
    low52: r.stats.low52,
  }));

  // A `--only` RUN MUST NOT EMPTY THE MANIFEST.
  //
  // `--only` limits which series are FETCHED; it does not mean the others
  // stopped existing. Rebuilding the manifest from this run alone deleted the
  // other 72 entries from `index.json` while leaving every one of their data
  // files on disk — so the store was intact and the whole dashboard read as
  // having two series. The next full run would have repaired it, which is
  // exactly what made it dangerous: a local `--only` run followed by a commit
  // ships a manifest that says the store is nearly empty.
  //
  // So a limited run MERGES into what was there. Entries are carried forward
  // only if the catalogue still declares them harvestable — a series genuinely
  // removed from the catalogue must not be resurrected by a run that never
  // looked at it.
  const previous = readIndex();
  const entries = [...harvested];
  if (only) {
    const live = new Set(harvestable().map((s) => s.id));
    const fresh = new Set(harvested.map((e) => e.id));
    for (const e of previous?.series ?? []) {
      if (!fresh.has(e.id) && live.has(e.id)) entries.push(e);
    }
    // Catalogue order, so a limited run and a full run produce the same file.
    const order = new Map(harvestable().map((s, i) => [s.id, i]));
    entries.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  // Series the spec asks for that nothing can serve yet travel in the manifest
  // too, carrying their reason — the page names them instead of quietly
  // dropping them, so the gap stays visible.
  const absent = declaredAbsent().map((s) => ({
    id: s.id, label: s.label, category: s.category, group: s.group,
    unit: s.unit, absent: s.absent,
  }));
  const failedNow = results.filter((r) => r.status === "failed")
    .map((r) => ({ id: r.spec.id, label: r.spec.label, category: r.spec.category, group: r.spec.group, error: r.error, kept: r.kept ?? 0 }));
  // Failures carry forward on a limited run for the same reason entries do: a
  // series this run never attempted has not thereby recovered, and clearing it
  // would report a green store that nobody re-measured.
  const failed = [...failedNow];
  if (only) {
    const touched = new Set(results.map((r) => r.spec.id));
    const live = new Set(harvestable().map((s) => s.id));
    for (const f of previous?.failed ?? []) {
      if (!touched.has(f.id) && live.has(f.id)) failed.push(f);
    }
  }

  // Same idempotence rule as `retrievedAt`: the manifest's own timestamp only
  // moves when something in it moved, or every run rewrites it for nothing.
  const prevIndex = previous;
  const anyChanged = ok.some((r) => (r.changed ?? []).length > 0);
  const manifestChanged = writeIndex({
    generatedAt: anyChanged || !prevIndex?.generatedAt ? nowIso : prevIndex.generatedAt,
    categories: CATEGORIES,
    series: entries,
    absent,
    failed,
  });

  // ── Report ──────────────────────────────────────────────────────────────
  const L = [];
  L.push("# Series harvest report");
  L.push("");
  L.push("Generated by `npm run harvest`. Every series below is stored under");
  L.push("`public/series/<id>/` with its own `meta.json` recording the source, the");
  L.push("unit and the retrieval time. Nothing here is estimated, interpolated or");
  L.push("carried forward: a day the source did not publish is a day the series does");
  L.push("not have.");
  L.push("");
  L.push(`- **Harvested:** ${ok.length} series, ${ok.reduce((s, r) => s + r.meta.count, 0).toLocaleString()} points`);
  L.push(`- **Failed:** ${failed.length}`);
  L.push(`- **Declared absent:** ${absent.length} (the spec asks for them; no source we have serves them)`);
  L.push("");
  L.push("## Harvested");
  L.push("");
  L.push("| Series | Group | Points | From | To | Unit | Source | Provenance |");
  L.push("| --- | --- | ---: | --- | --- | --- | --- | --- |");
  for (const r of ok) {
    L.push(`| ${r.meta.label} | ${r.meta.group} | ${r.meta.count.toLocaleString()} | ${r.meta.first} | ${r.meta.last} | ${r.meta.unit} | ${r.meta.source.name} \`${r.meta.source.symbol}\` | ${r.meta.provenance} |`);
  }

  const withFindings = results.filter((r) => r.findings?.length);
  L.push("");
  L.push("## Validation");
  L.push("");
  if (!withFindings.length) {
    L.push("No findings — every point passed the gate.");
  } else {
    L.push("`blocked` points never reached disk; the series kept its last good value.");
    L.push("`warn` points were stored and are named here.");
    L.push("");
    L.push("**`large-move` on a futures series is usually a CONTRACT ROLL, not an error.**");
    L.push("Yahoo's `=F` symbols are continuous front-month series: when the front");
    L.push("contract expires the series steps to the next one, and that step is a price");
    L.push("difference between two contracts rather than a move in the market. It is");
    L.push("reported and kept — the level on each date is what that contract traded at —");
    L.push("but a one-day return spanning a roll is measuring the roll.");
    L.push("");
    L.push("| Series | Severity | Rule | Detail |");
    L.push("| --- | --- | --- | --- |");
    for (const r of withFindings) {
      for (const f of r.findings) L.push(`| ${r.spec.label} | ${f.severity} | ${f.rule} | ${f.detail} |`);
    }
  }

  if (failed.length) {
    L.push("");
    L.push("## Failed");
    L.push("");
    L.push("These kept whatever was already stored — no partial write, no empty overwrite.");
    L.push("");
    L.push("| Series | Error | Points kept |");
    L.push("| --- | --- | ---: |");
    for (const f of failed) L.push(`| ${f.label} | ${f.error} | ${f.kept} |`);
  }

  L.push("");
  L.push("## Declared absent");
  L.push("");
  L.push("The FOOS spec asks for each of these. None is served by a source in this");
  L.push("phase, so each renders as absent WITH THIS REASON rather than as an");
  L.push("illustrative number.");
  L.push("");
  L.push("| Series | Group | Why it is absent |");
  L.push("| --- | --- | --- |");
  for (const a of absent) L.push(`| ${a.label} | ${a.group} | ${a.absent} |`);
  L.push("");

  mkdirSync("docs", { recursive: true });
  writeIfChanged("docs/SERIES-REPORT.md", L.join("\n"));

  const changedFiles = ok.flatMap((r) => r.changed ?? []);
  console.log(`\n${ok.length} ok · ${failed.length} failed · ${absent.length} declared absent`);
  console.log(`${changedFiles.length} series file(s) written${manifestChanged ? " · manifest updated" : " · manifest unchanged"}`);
  if (failed.length) {
    // A failure is reported and does not abort the run — the other series are
    // still good, and the page shows this one at its last measured value.
    console.log(`\nFailures:\n${failed.map((f) => `  ${f.id}: ${f.error}`).join("\n")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
