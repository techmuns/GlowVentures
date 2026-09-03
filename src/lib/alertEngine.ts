// THE IPS BUCKET ROLL-UP — what the family's asset-class mapping actually
// measures, read by Exposure & IPS.
//
// THIS FILE WAS THE ALERT ENGINE, and Layer 5's evaluator has been REMOVED with
// the Alerts page at the family's request (Stage 10y). `evaluateAlerts` and
// `ALERT_KIND_LABEL` had exactly one caller between them and went with it; a
// builder nothing calls is worse than no builder, because the next session finds
// it exported and wires it back believing it load-bearing. What it enforced is
// worth keeping in view if a rules engine is ever wanted again, and is recorded
// in CLAUDE.md rather than here: a rule whose inputs are incomplete does not
// fire and does not pass either — it reports UNMEASURABLE with the reason,
// because silence from an alert is read as "all clear".
//
// THE FAMILY'S ALERT RULES THEMSELVES WERE NOT DELETED. They are still stored in
// `familyInputs.ts` and still round-trip through the one Export/Import on
// Exposure & IPS; nothing evaluates them today.
//
// What remains is the bucket roll-up, which was never about alerts: it answers
// "what fraction of the book sits in each IPS bucket", and Exposure & IPS reads
// it directly.
import type { Portfolio } from "./types";
import { dedupedPositions } from "./analytics";
import { IPS_BUCKETS, type FamilyInputs, type IpsBucketKey } from "./familyInputs";

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
