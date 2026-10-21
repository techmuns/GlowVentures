// THE VALIDATION GATE — the harvester's sibling of the ingest reconciler.
//
// Harvested data has to earn the same trust as a statement PDF, and it arrives
// from sources nobody controls: a vendor changes a unit from tonnes to pounds, a
// scraper starts reading the wrong column, a CSV shifts a decimal. Every one of
// those produces a number that looks entirely plausible on a chart.
//
// So the same three severities the extraction report uses:
//
//   blocked  — the point is WRONG on its face and is dropped before it is stored.
//              Non-finite, a date in the future, a duplicate, or outside the
//              series' declared plausible band.
//   warn     — the point is stored but named in the report. A move large enough
//              to be a decimal shift, a revision to history, a stale source.
//   ok       — nothing to say.
//
// A blocked point never reaches disk, so the series keeps its last good value and
// the page shows it with an honest `as of` date. That is the same rule the book
// already applies to a quote the feed could not supply: keep the last measured
// mark and flag it, never invent a replacement and never render a gap as zero.

const DAY = 86400000;
const ms = (t) => Date.parse(t + "T00:00:00Z");

/** Default: a daily move past this is reported, not dropped — markets do gap. */
const JUMP_WARN_PCT = 25;

/**
 * @param spec    catalogue entry (carries `band`, `unit`)
 * @param stored  points already on disk
 * @param incoming points this run fetched
 * @returns { points, findings } — `points` is the accepted subset
 */
export function validate(spec, stored, incoming) {
  const findings = [];
  const accepted = [];
  const seen = new Set(stored.map((p) => p.t));
  const tomorrow = Date.now() + DAY;
  const band = spec.band;

  for (const p of incoming) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.t)) {
      findings.push({ severity: "blocked", rule: "date-format", detail: `"${p.t}" is not an ISO date` });
      continue;
    }
    const at = ms(p.t);
    if (!Number.isFinite(at)) {
      findings.push({ severity: "blocked", rule: "date-parse", detail: p.t });
      continue;
    }
    if (at > tomorrow) {
      findings.push({ severity: "blocked", rule: "future-date", detail: `${p.t} is in the future` });
      continue;
    }
    if (!Number.isFinite(p.v)) {
      findings.push({ severity: "blocked", rule: "non-finite", detail: `${p.t} → ${p.v}` });
      continue;
    }
    if (band && (p.v < band[0] || p.v > band[1])) {
      // The band is deliberately wide. Tripping it means the SOURCE changed —
      // a unit, a scale, a column — not that the market did something unusual.
      findings.push({
        severity: "blocked", rule: "out-of-band",
        detail: `${p.t} → ${p.v} ${spec.unit}, outside the declared band [${band[0]}, ${band[1]}]`,
      });
      continue;
    }
    accepted.push(p);
    seen.add(p.t);
  }

  // Duplicate dates within one batch: the last one wins, but say so.
  const dupes = new Set();
  const byDate = new Set();
  for (const p of accepted) { if (byDate.has(p.t)) dupes.add(p.t); byDate.add(p.t); }
  if (dupes.size) {
    findings.push({ severity: "warn", rule: "duplicate-dates", detail: `${dupes.size} date(s) appeared twice in one batch` });
  }

  // Large consecutive moves — reported, never dropped. Yields move in points,
  // not ratios, so the rule does not apply to them.
  if (spec.kind !== "yield") {
    const sorted = [...accepted].sort((a, b) => (a.t < b.t ? -1 : 1));
    let jumps = 0, worst = null;
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1].v, b = sorted[i].v;
      if (!(a > 0) || !(b > 0)) continue;
      const pct = Math.abs(b / a - 1) * 100;
      if (pct > JUMP_WARN_PCT) { jumps++; if (!worst || pct > worst.pct) worst = { pct, t: sorted[i].t, from: a, to: b }; }
    }
    if (jumps) {
      findings.push({
        severity: "warn", rule: "large-move",
        detail: `${jumps} consecutive move(s) over ${JUMP_WARN_PCT}%; largest ${worst.pct.toFixed(1)}% on ${worst.t} (${worst.from} → ${worst.to})`,
      });
    }
  }

  return { points: accepted, findings };
}

/**
 * Is the series fresher than its own publication cadence allows?
 *
 * A source that stops updating is the failure mode nobody notices: the page keeps
 * rendering yesterday's number as though it were today's. Two publication periods
 * of silence sets `staleSince`, and the UI shows the real observation date.
 */
export function freshness(frequency, lastPointDate) {
  const expected = { daily: 4, weekly: 14, monthly: 62, quarterly: 200, annual: 800 }[frequency] ?? 30;
  const ageDays = Math.floor((Date.now() - ms(lastPointDate)) / DAY);
  return { ageDays, stale: ageDays > expected, expectedWithinDays: expected };
}
