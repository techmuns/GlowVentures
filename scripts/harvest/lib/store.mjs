// THE SERIES STORE — read, merge and write time series on disk.
//
// LAYOUT
//   public/series/index.json         the manifest: every series, its metadata,
//                                    its latest level and its computed returns
//   public/series/<id>/meta.json     unit, frequency, provenance, source, coverage
//   public/series/<id>/<year>.json   daily series, ONE FILE PER CALENDAR YEAR
//   public/series/<id>/series.json   monthly/quarterly/annual — one file, small
//
// WHY DAILY SERIES ARE CHUNKED BY YEAR
// ────────────────────────────────────
// Git stores a whole new blob every time a file changes. A 26-year daily series
// is ~6,500 points; rewritten on every harvest that is ~130 KB of new object per
// series per day, and across the catalogue it would add multiple megabytes a day
// to the repository forever. Chunked by year, a daily run rewrites only the
// CURRENT year (a few KB) and every closed year is written once and never
// touched again. It also makes a range-limited chart cheap on the client: a
// 1-year window fetches one or two small files instead of the whole history.
//
// MERGE SEMANTICS: ACCUMULATE, NEVER TRUNCATE
// ───────────────────────────────────────────
// `merge` keeps every stored point that the incoming batch does not mention, and
// lets the incoming batch win where the dates overlap. That matters for the
// sources coming in later phases which publish only a CURRENT value and no
// history — RBI's weekly supplement, AMFI's monthly flows, a scraped spot price.
// Against those, the store builds the history itself, one observation at a time,
// and a source that goes down for a week cannot silently shorten what we already
// hold. Yahoo hands over the whole series each run, so for the Phase 0 adapters
// the merge is a no-op that still proves the contract.

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

export const SERIES_DIR = "public/series";

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

/**
 * Write only when the bytes actually change.
 *
 * Idempotence is the whole point: `npm run harvest` twice in a row must leave the
 * working tree clean, exactly as `build-book` does, or every scheduled run
 * produces a commit whether or not any data moved.
 */
export function writeIfChanged(path, text) {
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return true;
}

const yearOf = (t) => t.slice(0, 4);

/** Read a stored series back as a flat, date-ascending point list. */
export function readSeries(id) {
  const dir = join(SERIES_DIR, id);
  const meta = readJson(join(dir, "meta.json"));
  if (!meta) return { meta: null, points: [] };
  const points = [];
  if (meta.frequency === "daily") {
    if (!existsSync(dir)) return { meta, points };
    const years = readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).sort();
    for (const y of years) {
      const c = readJson(join(dir, y));
      if (c && Array.isArray(c.t)) for (let i = 0; i < c.t.length; i++) points.push({ t: c.t[i], v: c.v[i] });
    }
  } else {
    const c = readJson(join(dir, "series.json"));
    if (c && Array.isArray(c.t)) for (let i = 0; i < c.t.length; i++) points.push({ t: c.t[i], v: c.v[i] });
  }
  return { meta, points };
}

/**
 * Merge incoming points over stored ones. Incoming wins on a shared date; stored
 * points the incoming batch does not mention SURVIVE (see the note above).
 * Returns the merged list plus the revisions it noticed, which the report names —
 * a source quietly restating history is a fact worth seeing, not one to absorb.
 */
export function merge(stored, incoming) {
  const m = new Map(stored.map((p) => [p.t, p.v]));
  const revisions = [];
  for (const raw of incoming) {
    // COMPARE AT STORED PRECISION. Values are rounded on write, so comparing a
    // stored 4-decimal value against an incoming 17-digit float reports every
    // point in the series as "restated" on every run — thousands of phantom
    // revisions that bury the handful of real ones. Round first, then compare.
    const p = { t: raw.t, v: round(raw.v) };
    const prev = m.get(p.t);
    if (prev !== undefined && Number.isFinite(prev) && prev !== p.v) {
      revisions.push({ t: p.t, from: prev, to: p.v });
    }
    m.set(p.t, p.v);
  }
  const out = [...m.entries()].map(([t, v]) => ({ t, v })).sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return { points: out, revisions };
}

/**
 * Round to a sensible number of decimals FOR ITS MAGNITUDE.
 *
 * Not cosmetic: an unrounded float prints 17 significant digits, which triples
 * the stored size and makes a diff of a chunk unreadable. Six significant digits
 * is well past the precision any of these sources publishes.
 */
function round(v) {
  if (!Number.isFinite(v)) return v;
  const a = Math.abs(v);
  const dp = a >= 10000 ? 2 : a >= 100 ? 3 : a >= 1 ? 4 : 6;
  return Number(v.toFixed(dp));
}

/** Columnar encoding — parallel `t`/`v` arrays, one line each, so a diff is readable. */
const encodeChunk = (points) =>
  `{\n "t": ${JSON.stringify(points.map((p) => p.t))},\n "v": ${JSON.stringify(points.map((p) => round(p.v)))}\n}\n`;

/** Write a series to disk. Returns the paths that actually changed. */
export function writeSeries(meta, points) {
  const dir = join(SERIES_DIR, meta.id);
  const changed = [];
  if (meta.frequency === "daily") {
    const byYear = new Map();
    for (const p of points) {
      const y = yearOf(p.t);
      (byYear.get(y) ?? byYear.set(y, []).get(y)).push(p);
    }
    for (const [y, pts] of byYear) {
      if (writeIfChanged(join(dir, `${y}.json`), encodeChunk(pts))) changed.push(`${meta.id}/${y}.json`);
    }
  } else {
    if (writeIfChanged(join(dir, "series.json"), encodeChunk(points))) changed.push(`${meta.id}/series.json`);
  }
  if (writeIfChanged(join(dir, "meta.json"), JSON.stringify(meta, null, 1) + "\n")) changed.push(`${meta.id}/meta.json`);
  return changed;
}

export const readIndex = () => readJson(join(SERIES_DIR, "index.json"));

export function writeIndex(entries) {
  return writeIfChanged(join(SERIES_DIR, "index.json"), JSON.stringify(entries, null, 1) + "\n");
}
