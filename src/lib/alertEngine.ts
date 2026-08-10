// THE ALERT ENGINE — Layer 5 of the FOOS spec, evaluated against the book.
//
// The Alerts page has until now stated the CONDITION each card would test and
// said plainly that nothing had fired, because there was no rules engine and no
// thresholds to test against. Both now exist: the family sets a rule in the
// family-input store, and this evaluates it against the real portfolio.
//
// THE RULE THAT GOVERNS EVERY ONE OF THESE: A RULE WHOSE INPUTS ARE INCOMPLETE
// DOES NOT FIRE, AND IT DOES NOT PASS EITHER — it reports as UNMEASURABLE with
// the reason. Silence from an alert is read as "all clear", so a price rule on a
// security with no live quote must never look the same as a price rule that was
// checked and did not trigger. This is the absent-vs-zero rule applied to a
// boolean: a condition nobody could evaluate is not a condition that held.
import type { Portfolio, Position } from "./types";
import { dedupedPositions } from "./analytics";
import {
  IPS_BUCKETS, type AlertRule, type FamilyInputs, type IpsBucketKey,
} from "./familyInputs";

export type AlertStatus = "firing" | "ok" | "unmeasurable";

export type EvaluatedAlert = {
  rule: AlertRule;
  status: AlertStatus;
  /** One line a reader can act on. */
  headline: string;
  /** The measured side of the comparison, formatted by the caller if numeric. */
  actual: number | null;
  /** Why it could not be evaluated. Only set when `unmeasurable`. */
  reason?: string;
  /** Display label for the subject (security name or bucket label). */
  subject: string;
};

/** Actual weight per IPS bucket, from the asset-class mapping the family set. */
export type BucketActuals = {
  byBucket: Partial<Record<IpsBucketKey, number>>;
  /** Market value the family has not mapped to any bucket. */
  unmappedValue: number;
  unmappedClasses: string[];
  total: number;
};

/**
 * Roll the book up into IPS buckets.
 *
 * CONSOLIDATED (each dedupeGroup once) because this is a family-wide allocation.
 * An asset class the family has not mapped contributes to NO bucket and is
 * counted separately, so a partial mapping produces a partial actual that the
 * page can name — never a bucket weight computed against a denominator that
 * silently includes value belonging to no bucket at all.
 */
export function bucketActuals(portfolio: Portfolio, inputs: FamilyInputs): BucketActuals {
  const rows = dedupedPositions(portfolio.positions);
  const byBucket: Partial<Record<IpsBucketKey, number>> = {};
  let unmappedValue = 0;
  const unmapped = new Set<string>();
  let total = 0;

  for (const p of rows) {
    total += p.marketValue;
    const bucket = inputs.bucketByAssetClass[p.assetClass] ?? null;
    if (!bucket) {
      unmappedValue += p.marketValue;
      unmapped.add(p.assetClass);
      continue;
    }
    byBucket[bucket] = (byBucket[bucket] ?? 0) + p.marketValue;
  }
  return { byBucket, unmappedValue, unmappedClasses: [...unmapped].sort(), total };
}

/** Bucket weight in percent of the WHOLE book, or null when nothing is mapped to it. */
export function bucketWeightPct(a: BucketActuals, bucket: IpsBucketKey): number | null {
  const v = a.byBucket[bucket];
  if (v == null || !(a.total > 0)) return null;
  return (v / a.total) * 100;
}

const monthsSince = (iso: string): number | null => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / (365.25 / 12 * 86400000);
};

/**
 * Evaluate every enabled rule.
 *
 * @param liveOnly when a price rule's security has no LIVE price, the rule is
 *   unmeasurable rather than tested against a statement mark — a mark from last
 *   month cannot answer "has it crossed today".
 */
export function evaluateAlerts(
  portfolio: Portfolio,
  inputs: FamilyInputs,
  opts: { nameFor: (key: string) => string } = { nameFor: (k) => k },
): EvaluatedAlert[] {
  const rows = dedupedPositions(portfolio.positions);
  const bySecurity = new Map<string, Position[]>();
  for (const p of rows) (bySecurity.get(p.securityKey) ?? bySecurity.set(p.securityKey, []).get(p.securityKey)!).push(p);
  const actuals = bucketActuals(portfolio, inputs);
  const total = actuals.total;

  const out: EvaluatedAlert[] = [];

  for (const rule of inputs.alertRules) {
    if (!rule.enabled) continue;
    const bucketLabel = rule.bucket ? IPS_BUCKETS.find((b) => b.key === rule.bucket)?.label ?? rule.bucket : "";
    const subject = rule.securityKey ? opts.nameFor(rule.securityKey) : bucketLabel || "The book";

    if (rule.threshold == null) {
      out.push({ rule, subject, status: "unmeasurable", actual: null,
        headline: "This rule has no threshold set, so there is nothing to test.",
        reason: "A rule without a level is an unfinished rule, not a rule that passes." });
      continue;
    }

    if (rule.kind === "price-above" || rule.kind === "price-below") {
      const held = rule.securityKey ? bySecurity.get(rule.securityKey) ?? [] : [];
      if (!held.length) {
        out.push({ rule, subject, status: "unmeasurable", actual: null,
          headline: `${subject} is not held in this book.`,
          reason: "A price rule needs a holding to price. The security may have been exited." });
        continue;
      }
      const live = held.every((h) => h.live);
      const price = held[0].currentPrice ?? null;
      if (price == null || !live) {
        out.push({ rule, subject, status: "unmeasurable", actual: price,
          headline: `No live quote for ${subject}.`,
          reason: "The last price is a statement mark, not a live one. A month-old mark cannot answer whether the price has crossed a level today, and testing against it would report a crossing that may not have happened — or miss one that did." });
        continue;
      }
      const fired = rule.kind === "price-above" ? price > rule.threshold : price < rule.threshold;
      out.push({
        rule, subject, actual: price, status: fired ? "firing" : "ok",
        headline: fired
          ? `${subject} is ${rule.kind === "price-above" ? "above" : "below"} the ${rule.threshold} level.`
          : `${subject} has not crossed ${rule.threshold}.`,
      });
      continue;
    }

    if (rule.kind === "ips-over" || rule.kind === "ips-under") {
      if (!rule.bucket) {
        out.push({ rule, subject, status: "unmeasurable", actual: null,
          headline: "This rule names no IPS bucket.", reason: "Pick a bucket for the rule to test." });
        continue;
      }
      const w = bucketWeightPct(actuals, rule.bucket);
      if (w == null) {
        out.push({ rule, subject, status: "unmeasurable", actual: null,
          headline: `Nothing is mapped to ${bucketLabel}.`,
          reason: "The book's actual weight in this bucket cannot be measured until at least one asset class is mapped to it on Exposure & IPS." });
        continue;
      }
      // A partial mapping means the denominator includes value in no bucket, so
      // say so rather than presenting the weight as complete.
      const partial = actuals.unmappedValue > 0
        ? ` ${((actuals.unmappedValue / total) * 100).toFixed(0)}% of the book (${actuals.unmappedClasses.join(", ")}) is still unmapped.`
        : "";
      const fired = rule.kind === "ips-over" ? w > rule.threshold : w < rule.threshold;
      out.push({
        rule, subject: bucketLabel, actual: w, status: fired ? "firing" : "ok",
        headline: fired
          ? `${bucketLabel} is ${w.toFixed(1)}% against a ${rule.kind === "ips-over" ? "maximum" : "minimum"} of ${rule.threshold}%.${partial}`
          : `${bucketLabel} is ${w.toFixed(1)}%, within its ${rule.threshold}% ${rule.kind === "ips-over" ? "ceiling" : "floor"}.${partial}`,
      });
      continue;
    }

    if (rule.kind === "concentration") {
      if (!(total > 0)) {
        out.push({ rule, subject, status: "unmeasurable", actual: null,
          headline: "The book has no value to measure concentration against." });
        continue;
      }
      let topKey = "", topVal = 0;
      for (const [k, ps] of bySecurity) {
        const v = ps.reduce((s, p) => s + p.marketValue, 0);
        if (v > topVal) { topVal = v; topKey = k; }
      }
      const w = (topVal / total) * 100;
      const fired = w > rule.threshold;
      out.push({
        rule, subject: opts.nameFor(topKey), actual: w, status: fired ? "firing" : "ok",
        headline: fired
          ? `${opts.nameFor(topKey)} is ${w.toFixed(1)}% of the book, over the ${rule.threshold}% single-name limit.`
          : `Largest single name is ${opts.nameFor(topKey)} at ${w.toFixed(1)}%, within ${rule.threshold}%.`,
      });
      continue;
    }

    if (rule.kind === "review-overdue") {
      const due: string[] = [];
      let checked = 0;
      for (const t of Object.values(inputs.theses)) {
        if (!t.reviewEveryMonths) continue;
        const since = monthsSince(t.lastReviewed || t.decidedOn);
        if (since == null) continue;
        checked++;
        if (since > t.reviewEveryMonths) due.push(opts.nameFor(t.securityKey));
      }
      if (!checked) {
        out.push({ rule, subject: "Thesis reviews", status: "unmeasurable", actual: null,
          headline: "No thesis carries both a review cadence and a last-reviewed date.",
          reason: "Record a review schedule on Thesis & Triggers for this to become measurable." });
        continue;
      }
      out.push({
        rule, subject: "Thesis reviews", actual: due.length, status: due.length ? "firing" : "ok",
        headline: due.length
          ? `${due.length} thesis review${due.length === 1 ? "" : "s"} overdue: ${due.slice(0, 4).join(", ")}${due.length > 4 ? "…" : ""}.`
          : `All ${checked} scheduled thesis reviews are current.`,
      });
    }
  }

  return out;
}

export const ALERT_KIND_LABEL: Record<AlertRule["kind"], string> = {
  "price-above": "Price rises above",
  "price-below": "Price falls below",
  "ips-over": "IPS bucket exceeds",
  "ips-under": "IPS bucket falls below",
  concentration: "Single name exceeds",
  "review-overdue": "Thesis review overdue",
};
