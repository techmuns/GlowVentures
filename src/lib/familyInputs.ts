// THE FAMILY-INPUT STORE — the decisions no data source can supply.
//
// Layers 3, 4 and 5 of the FOOS spec are not blocked on a vendor. They are
// blocked on the FAMILY: an IPS target weight, why a position was bought, what
// would make them sell it, what should raise an alarm. No API has ever known any
// of that, and until now every one of those screens was an illustrative preview
// waiting for a feed that could not exist.
//
// This is the store that unblocks them, and it follows the rule `watchlist.ts`
// already set:
//
//   NOTHING HERE MAY EVER REACH `glowData.ts`. The book is generated from
//   `source/` and regenerates byte-identically; a target weight is a judgement,
//   not a statement figure, and writing one into the book would break that
//   guarantee on the first edit.
//
//   AN UNSET FIGURE IS `null`, NEVER 0. A target weight of zero is a real
//   instruction ("hold none of this"); a target nobody has entered is the
//   absence of an instruction. They must not look the same, because the GAP —
//   actual minus target — is the only number on that page anyone acts on, and a
//   gap computed against a defaulted zero is a fabricated call to sell.
//
// WHAT IS DIFFERENT FROM THE WATCHLIST: EXPORT AND IMPORT.
// `localStorage` is per browser, which the watchlist page states as a limitation
// and leaves there. For an IPS and a set of investment theses that is not good
// enough — it is the family's own record, and a cleared browser would lose it
// with no way back. So the whole store round-trips through a single JSON file
// the family can save, share and re-import. That is not a substitute for a
// server-side store, and the page says so, but it makes the data survivable.

import { coerceDeal, type PrivateDeal } from "./deals";
import { coerceHousehold, EMPTY_HOUSEHOLD, type Household } from "./household";

const KEY = "glow:familyInputs/v1";
// v2 added the private deal register; v3 the household balance sheet, the
// adviser register, the decisions queue and the benchmark choice. An older file
// imports cleanly — `coerce` defaults each new field to empty, which is the
// truth about a file written before the field existed.
export const SCHEMA_VERSION = 3;

// ── IPS buckets ─────────────────────────────────────────────────────────────
// The spec names these five. They are fixed because they are the spec's, but
// every target is the family's and starts unset.
export const IPS_BUCKETS = [
  { key: "growth", label: "Growth", hint: "Compounders held for the long term" },
  { key: "liquidity", label: "Liquidity", hint: "Cash & liquid funds for calls and opportunities" },
  { key: "tactical", label: "Tactical", hint: "Shorter-horizon, higher-conviction positions" },
  { key: "hedge", label: "Hedge", hint: "Downside protection & uncorrelated assets" },
  { key: "charity", label: "Charity", hint: "Ring-fenced philanthropic pool" },
] as const;

export type IpsBucketKey = (typeof IPS_BUCKETS)[number]["key"];

export type ThesisRecord = {
  securityKey: string;
  /** The spec's "Why invested?" */
  why: string;
  /** Expected return, % p.a. Null = not stated. */
  expectedReturnPct: number | null;
  /** The spec's "Risk?" */
  risk: string;
  /** The spec's "Exit triggers?" — what would make the family sell. */
  exitTriggers: string;
  /** Who proposed it, and when the decision was taken. */
  proposedBy: string;
  decidedOn: string;
  /** Review cadence in months. Null = no schedule set. */
  reviewEveryMonths: number | null;
  lastReviewed: string;
  updatedAt: string;
};

export type AlertRuleKind =
  | "price-above" | "price-below"
  | "ips-over" | "ips-under"
  | "concentration"
  | "review-overdue";

export type AlertRule = {
  id: string;
  kind: AlertRuleKind;
  /** For price rules. */
  securityKey?: string;
  /** For IPS rules. */
  bucket?: IpsBucketKey;
  /** The level the rule tests against. Null is not a rule — it is an unfinished one. */
  threshold: number | null;
  note: string;
  enabled: boolean;
  createdAt: string;
};

export type FamilyInputs = {
  version: number;
  /** The spec's one-page family charter. Free text; empty means not written. */
  charter: string;
  /** Target weight per IPS bucket, in percent. Null = the family has not set one. */
  ipsTargets: Partial<Record<IpsBucketKey, number | null>>;
  /** Target weight per GICS sector, in percent. Null / absent = not set. */
  sectorTargets: Record<string, number | null>;
  /**
   * WHICH IPS BUCKET EACH ASSET CLASS BELONGS TO — the mapping without which no
   * GAP can be computed at all.
   *
   * The spec's buckets (Growth, Liquidity, Tactical, Hedge, Charity) are not a
   * property of a security; they are how the FAMILY chooses to think about it.
   * Nothing in the archive says the AIF book is "Growth" rather than "Tactical",
   * and guessing would fabricate the classification the whole GAP rests on.
   *
   * Mapping at ASSET-CLASS level is the deliberate compromise: four or five
   * decisions instead of one per holding, which is a form a family will actually
   * complete. An unmapped class contributes to no bucket and is NAMED on screen,
   * so a partial mapping shows a partial actual rather than a wrong one.
   */
  bucketByAssetClass: Record<string, IpsBucketKey | null>;
  /** Keyed by securityKey. */
  theses: Record<string, ThesisRecord>;
  alertRules: AlertRule[];
  /**
   * The private deal register — one entry per company the family invested in
   * directly. See `deals.ts`: no statement issuer holds a cap table, so this
   * could never have come from an ingest.
   */
  deals: PrivateDeal[];
  /**
   * The household balance sheet, the adviser register, the decisions queue and
   * the family's chosen benchmark — see `household.ts`. These fill the four
   * Family Dashboard tiles that were absent for want of a family fact, not for
   * want of a feed.
   */
  household: Household;
  updatedAt: string;
};

export const EMPTY: FamilyInputs = {
  version: SCHEMA_VERSION,
  charter: "",
  ipsTargets: {},
  sectorTargets: {},
  bucketByAssetClass: {},
  theses: {},
  alertRules: [],
  deals: [],
  household: EMPTY_HOUSEHOLD,
  updatedAt: "",
};

export const emptyThesis = (securityKey: string): ThesisRecord => ({
  securityKey, why: "", expectedReturnPct: null, risk: "", exitTriggers: "",
  proposedBy: "", decidedOn: "", reviewEveryMonths: null, lastReviewed: "", updatedAt: "",
});

/**
 * A percentage the family typed. Accepted only if finite and in [0, 100];
 * anything else — including a blank field — is NOT SET, which is `null`.
 */
export const pct = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[%\s,]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

/** A price the family typed. Positive and finite, else not set. */
export const money = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[₹$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Coerce anything read from storage — or imported from a file someone edited —
 * into the shape above. An unrecognised field is dropped rather than trusted:
 * this store drives a GAP analysis and an alert engine, and a malformed number
 * reaching either is how a fabricated figure gets on screen.
 */
export function coerce(raw: unknown): FamilyInputs {
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  const o = raw as Record<string, unknown>;

  const ipsTargets: FamilyInputs["ipsTargets"] = {};
  const rawIps = (o.ipsTargets ?? {}) as Record<string, unknown>;
  for (const b of IPS_BUCKETS) ipsTargets[b.key] = pct(rawIps[b.key]);

  const sectorTargets: Record<string, number | null> = {};
  const rawSec = (o.sectorTargets ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(rawSec)) if (k) sectorTargets[k] = pct(v);

  const bucketByAssetClass: Record<string, IpsBucketKey | null> = {};
  const rawMap = (o.bucketByAssetClass ?? {}) as Record<string, unknown>;
  const bucketKeys = IPS_BUCKETS.map((b) => b.key) as string[];
  for (const [k, v] of Object.entries(rawMap)) {
    if (!k) continue;
    bucketByAssetClass[k] = typeof v === "string" && bucketKeys.includes(v) ? (v as IpsBucketKey) : null;
  }

  const theses: Record<string, ThesisRecord> = {};
  const rawTh = (o.theses ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(rawTh)) {
    if (!k || !v || typeof v !== "object") continue;
    const t = v as Record<string, unknown>;
    const months = Number(t.reviewEveryMonths);
    theses[k] = {
      securityKey: k,
      why: str(t.why), risk: str(t.risk), exitTriggers: str(t.exitTriggers),
      proposedBy: str(t.proposedBy), decidedOn: str(t.decidedOn),
      lastReviewed: str(t.lastReviewed), updatedAt: str(t.updatedAt),
      expectedReturnPct: Number.isFinite(Number(t.expectedReturnPct)) && t.expectedReturnPct !== null && t.expectedReturnPct !== ""
        ? Number(t.expectedReturnPct) : null,
      reviewEveryMonths: Number.isFinite(months) && months > 0 ? months : null,
    };
  }

  const KINDS: AlertRuleKind[] = ["price-above", "price-below", "ips-over", "ips-under", "concentration", "review-overdue"];
  const alertRules: AlertRule[] = [];
  for (const v of Array.isArray(o.alertRules) ? o.alertRules : []) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const kind = KINDS.includes(r.kind as AlertRuleKind) ? (r.kind as AlertRuleKind) : null;
    if (!kind) continue;
    const n = Number(r.threshold);
    alertRules.push({
      id: str(r.id) || `r${alertRules.length}-${Date.now()}`,
      kind,
      securityKey: r.securityKey ? str(r.securityKey) : undefined,
      bucket: r.bucket ? (str(r.bucket) as IpsBucketKey) : undefined,
      threshold: Number.isFinite(n) ? n : null,
      note: str(r.note),
      enabled: r.enabled !== false,
      createdAt: str(r.createdAt),
    });
  }

  // A deal that coerces to null — no company name — is DROPPED, not repaired.
  // Figures attached to no company cannot be checked against anything.
  const deals = (Array.isArray(o.deals) ? o.deals : [])
    .map(coerceDeal)
    .filter((d): d is PrivateDeal => d !== null);

  return {
    version: SCHEMA_VERSION,
    charter: str(o.charter),
    ipsTargets, sectorTargets, bucketByAssetClass, theses, alertRules, deals,
    household: coerceHousehold(o.household),
    updatedAt: str(o.updatedAt),
  };
}

export function readFamilyInputs(): FamilyInputs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? coerce(JSON.parse(raw)) : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

export function writeFamilyInputs(next: FamilyInputs): FamilyInputs {
  const stamped = { ...next, version: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(stamped)); } catch { /* private mode */ }
  return stamped;
}

/** Has the family entered anything at all? Drives "not set yet" vs a real GAP. */
export const hasAnyInput = (f: FamilyInputs): boolean =>
  !!f.charter
  || Object.values(f.ipsTargets).some((v) => v != null)
  || Object.values(f.sectorTargets).some((v) => v != null)
  || Object.values(f.bucketByAssetClass).some((v) => v != null)
  || Object.keys(f.theses).length > 0
  || f.alertRules.length > 0
  || f.deals.length > 0
  || f.household.assets.length > 0
  || f.household.liabilities.length > 0
  || f.household.outflows.length > 0
  || f.household.advisors.length > 0
  || f.household.decisions.length > 0
  || !!f.household.benchmarkSeriesId;

/** Do the IPS targets add to 100? Null when none is set — not "0% allocated". */
export function ipsTargetTotal(f: FamilyInputs): number | null {
  const set = IPS_BUCKETS.map((b) => f.ipsTargets[b.key]).filter((v): v is number => v != null);
  return set.length ? set.reduce((a, b) => a + b, 0) : null;
}

// ── Export / import ─────────────────────────────────────────────────────────

export function exportFamilyInputs(f: FamilyInputs): void {
  const blob = new Blob([JSON.stringify(f, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `glow_family_inputs_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Read a previously exported file back in.
 *
 * Everything goes through `coerce`, so a hand-edited or truncated file cannot
 * put a malformed number into the GAP analysis — it loses the bad field rather
 * than the whole import, and an unset value stays unset.
 */
export async function importFamilyInputs(file: File): Promise<FamilyInputs> {
  const text = await file.text();
  return writeFamilyInputs(coerce(JSON.parse(text)));
}
