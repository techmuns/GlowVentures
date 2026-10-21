// THE HOUSEHOLD BALANCE SHEET, THE ADVISER REGISTER AND THE DECISIONS QUEUE.
//
// The Family Dashboard's top strip has always carried four tiles it could not
// fill: net worth, cash available, liquidity coverage and the charity pool. The
// reasons written against them were correct and are worth restating, because
// they say exactly what this module is:
//
//   net worth  — "needs the family's off-book assets — property, bank balances,
//                 unlisted stakes — which no statement here carries"
//   cash       — "no bank statement in this drop; the book's cash is the sweep
//                 inside each mandate, not the family's bank balance"
//   liquidity  — "cash over a committed-outflow schedule, and no outflow
//                 schedule has been supplied"
//   charity    — "no charity pool is identified in the statements; it would need
//                 the family to ring-fence one"
//
// Every one of those is waiting on the FAMILY, not on a vendor — the same
// discovery `familyInputs.ts` made about the IPS. A property is not something a
// PMS statement will ever mention; a school-fee schedule is not a market datum.
// So this is the register they go in, and the four tiles compute from it.
//
// THE RULES ARE THE STORE'S, UNCHANGED:
//
//   NET WORTH IS DERIVED AND SAYS WHAT IT SPANS. Portfolio value (measured, from
//   the book) plus off-book assets less liabilities. A family that has entered
//   one bank balance and no property gets a net worth over ONE asset, and the
//   caption says one — because "net worth ₹340 Cr" over a partial register reads
//   as complete and would be acted on as complete.
//
//   AN EMPTY REGISTER IS ABSENT, NOT ZERO. With nothing entered, net worth does
//   not fall back to the portfolio value: "the family owns nothing else" and
//   "nobody has entered what else they own" are different claims, and only the
//   first is a measurement.
//
//   LIQUIDITY COVERAGE NEEDS BOTH HALVES. Cash with no outflow schedule is not
//   infinite coverage, and an outflow schedule with no cash is not zero months.
//   Either side missing and the figure is absent with the side that is missing
//   named.

import type { IpsBucketKey } from "./familyInputs";

// ── Balance-sheet items ─────────────────────────────────────────────────────

/**
 * What kind of thing an off-book asset is.
 *
 * `tangible` answers the spec's tangible / intangible split and is a property of
 * the KIND, not a judgement per item — a flat is tangible whoever owns it.
 * Recording it on the kind means the split can never disagree with itself
 * across two rows describing the same sort of asset.
 */
export const ASSET_KINDS = [
  { key: "cash", label: "Bank & cash", tangible: false, liquidByDefault: true },
  { key: "property", label: "Property", tangible: true, liquidByDefault: false },
  { key: "unlisted", label: "Unlisted stake", tangible: false, liquidByDefault: false },
  { key: "bullion", label: "Bullion & collectibles", tangible: true, liquidByDefault: false },
  { key: "insurance", label: "Insurance & retirement", tangible: false, liquidByDefault: false },
  { key: "receivable", label: "Loan receivable", tangible: false, liquidByDefault: false },
  { key: "other", label: "Other asset", tangible: false, liquidByDefault: false },
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number]["key"];

export const LIABILITY_KINDS = [
  { key: "mortgage", label: "Mortgage" },
  { key: "loan", label: "Loan" },
  { key: "facility", label: "Credit facility drawn" },
  { key: "tax", label: "Tax payable" },
  { key: "other", label: "Other liability" },
] as const;
export type LiabilityKind = (typeof LIABILITY_KINDS)[number]["key"];

/** One line of the household balance sheet. */
export type BalanceItem = {
  id: string;
  label: string;
  /** An asset kind or a liability kind, depending on which list it is in. */
  kind: string;
  /**
   * Whose it is — an owner display name from the book's registry, or "" for the
   * whole family. An item attributed to nobody counts ONLY in the family scope;
   * spreading it across members would invent a share nobody stated.
   */
  owner: string;
  amount: number | null;
  asOf: string;
  /** Counted as cash available. Defaults from the kind, overridable per item. */
  liquid: boolean;
  /** Ring-fenced for the charity pool. */
  charity: boolean;
  /** Which IPS bucket this sits in, if the family maps it. Null = unmapped. */
  bucket: IpsBucketKey | null;
  note: string;
};

/** A committed future outflow — what liquidity coverage is measured against. */
export type Outflow = {
  id: string;
  label: string;
  dueOn: string;
  amount: number | null;
  /** Repeats every N months. Null = one-off. */
  everyMonths: number | null;
  note: string;
};

// ── Advisers and decisions ──────────────────────────────────────────────────

export const ADVISOR_ROLES = [
  "Investment manager", "Wealth adviser", "Banker", "Chartered accountant",
  "Tax adviser", "Lawyer", "Trustee", "Auditor", "Other",
] as const;

export type Advisor = {
  id: string;
  name: string;
  firm: string;
  role: string;
  /** What they are engaged to do. */
  mandate: string;
  /** How they are paid — free text, because fee structures do not fit a number. */
  fees: string;
  contact: string;
  since: string;
  /** When the engagement is next up for review. Drives nothing automatically. */
  reviewOn: string;
  note: string;
};

export const DECISION_STATES = ["Open", "In progress", "Decided", "Dropped"] as const;
export type DecisionState = (typeof DECISION_STATES)[number];

export const DECISION_CATEGORIES = [
  "Commitment", "IPS", "Manager", "Liquidity", "Tax", "Governance", "Other",
] as const;

export type Decision = {
  id: string;
  title: string;
  category: string;
  raisedOn: string;
  dueOn: string;
  /** Who has to decide. A name, not an id — this is the family's own wording. */
  owner: string;
  state: DecisionState;
  note: string;
};

export type Household = {
  assets: BalanceItem[];
  liabilities: BalanceItem[];
  outflows: Outflow[];
  advisors: Advisor[];
  decisions: Decision[];
  /**
   * The harvested series the family measures itself against — an id from
   * `public/series/index.json`, empty when they have not chosen one.
   *
   * A BENCHMARK IS A CHOICE, NOT A DEFAULT. Picking the Nifty because it is the
   * obvious index would put a comparison on screen the family never agreed to,
   * and a portfolio 62% in private assets measured against a large-cap equity
   * index is a misleading comparison rather than a neutral one.
   */
  benchmarkSeriesId: string;
};

export const EMPTY_HOUSEHOLD: Household = {
  assets: [], liabilities: [], outflows: [], advisors: [], decisions: [], benchmarkSeriesId: "",
};

// ── Coercion ────────────────────────────────────────────────────────────────

const s = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const day = (v: unknown): string => { const t = s(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ""; };

/**
 * A balance-sheet amount. Finite and non-negative.
 *
 * ZERO IS ACCEPTED HERE, unlike a price. A bank account standing at nil is a
 * measurement somebody took, and it is the difference between "the current
 * account is empty" and "nobody has entered the current account" — which is
 * exactly what liquidity coverage turns on.
 */
const amt = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[₹$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

let seq = 0;
export const hid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

const BUCKETS = ["growth", "liquidity", "tactical", "hedge", "charity"];

function coerceItem(v: unknown, kinds: readonly string[], fallbackKind: string): BalanceItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const label = s(o.label, 200);
  // An unlabelled line is not a balance-sheet item. A figure attached to nothing
  // cannot be checked, and it would still move the net-worth total.
  if (!label) return null;
  const kind = kinds.includes(s(o.kind, 30)) ? s(o.kind, 30) : fallbackKind;
  const b = s(o.bucket, 20);
  return {
    id: s(o.id, 40) || hid("bi"),
    label, kind,
    owner: s(o.owner, 120),
    amount: amt(o.amount),
    asOf: day(o.asOf),
    liquid: o.liquid === true,
    charity: o.charity === true,
    bucket: BUCKETS.includes(b) ? (b as IpsBucketKey) : null,
    note: s(o.note, 1000),
  };
}

function coerceOutflow(v: unknown): Outflow | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const label = s(o.label, 200);
  if (!label) return null;
  const every = Number(o.everyMonths);
  return {
    id: s(o.id, 40) || hid("of"),
    label, dueOn: day(o.dueOn), amount: amt(o.amount),
    everyMonths: Number.isFinite(every) && every > 0 ? Math.round(every) : null,
    note: s(o.note, 1000),
  };
}

function coerceAdvisor(v: unknown): Advisor | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const name = s(o.name, 200);
  const firm = s(o.firm, 200);
  if (!name && !firm) return null;
  return {
    id: s(o.id, 40) || hid("adv"),
    name, firm,
    role: s(o.role, 60), mandate: s(o.mandate, 600), fees: s(o.fees, 300),
    contact: s(o.contact, 300), since: day(o.since), reviewOn: day(o.reviewOn),
    note: s(o.note, 1000),
  };
}

function coerceDecision(v: unknown): Decision | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const title = s(o.title, 300);
  if (!title) return null;
  const state = (DECISION_STATES as readonly string[]).includes(s(o.state, 20))
    ? (s(o.state, 20) as DecisionState) : "Open";
  return {
    id: s(o.id, 40) || hid("dec"),
    title,
    category: (DECISION_CATEGORIES as readonly string[]).includes(s(o.category, 30)) ? s(o.category, 30) : "Other",
    raisedOn: day(o.raisedOn), dueOn: day(o.dueOn),
    owner: s(o.owner, 120), state, note: s(o.note, 1000),
  };
}

export function coerceHousehold(raw: unknown): Household {
  if (!raw || typeof raw !== "object") return { ...EMPTY_HOUSEHOLD };
  const o = raw as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const assetKeys = ASSET_KINDS.map((k) => k.key) as string[];
  const liabKeys = LIABILITY_KINDS.map((k) => k.key) as string[];
  return {
    assets: arr(o.assets).map((v) => coerceItem(v, assetKeys, "other")).filter((x): x is BalanceItem => !!x),
    liabilities: arr(o.liabilities).map((v) => coerceItem(v, liabKeys, "other")).filter((x): x is BalanceItem => !!x),
    outflows: arr(o.outflows).map(coerceOutflow).filter((x): x is Outflow => !!x),
    advisors: arr(o.advisors).map(coerceAdvisor).filter((x): x is Advisor => !!x),
    decisions: arr(o.decisions).map(coerceDecision).filter((x): x is Decision => !!x),
    benchmarkSeriesId: s(o.benchmarkSeriesId, 60),
  };
}

export const emptyAsset = (): BalanceItem => ({
  id: hid("as"), label: "", kind: "cash", owner: "", amount: null, asOf: "",
  liquid: true, charity: false, bucket: null, note: "",
});
export const emptyLiability = (): BalanceItem => ({
  id: hid("li"), label: "", kind: "loan", owner: "", amount: null, asOf: "",
  liquid: false, charity: false, bucket: null, note: "",
});
export const emptyOutflow = (): Outflow => ({ id: hid("of"), label: "", dueOn: "", amount: null, everyMonths: null, note: "" });
export const emptyAdvisor = (): Advisor => ({
  id: hid("adv"), name: "", firm: "", role: "", mandate: "", fees: "", contact: "", since: "", reviewOn: "", note: "",
});
export const emptyDecision = (): Decision => ({
  id: hid("dec"), title: "", category: "Other", raisedOn: "", dueOn: "", owner: "", state: "Open", note: "",
});

// ── Derivation ──────────────────────────────────────────────────────────────

/** A total plus how many of the rows it actually covers. */
export type Covered = { total: number | null; of: number; rows: number };

const cover = (xs: (number | null)[]): Covered => {
  const set = xs.filter((v): v is number => v !== null);
  return { total: set.length ? set.reduce((a, b) => a + b, 0) : null, of: set.length, rows: xs.length };
};

/** Items belonging to a scope. `null` scope = whole family, which takes them all. */
const inScope = (items: BalanceItem[], owner: string | null) =>
  owner === null ? items : items.filter((i) => i.owner === owner);

export type HouseholdView = {
  assets: Covered;
  liabilities: Covered;
  /** Off-book only — the portfolio is added by the caller, which knows its basis. */
  offBookNet: number | null;
  cash: Covered;
  charity: Covered;
  tangible: Covered;
  intangible: Covered;
  /** Items excluded from this scope because they are attributed to somebody else. */
  outOfScope: number;
};

export function viewHousehold(h: Household, owner: string | null): HouseholdView {
  const a = inScope(h.assets, owner);
  const l = inScope(h.liabilities, owner);
  const assets = cover(a.map((x) => x.amount));
  const liabilities = cover(l.map((x) => x.amount));
  const tangibleKeys = new Set(ASSET_KINDS.filter((k) => k.tangible).map((k) => k.key as string));
  return {
    assets, liabilities,
    offBookNet: assets.total === null && liabilities.total === null
      ? null
      : (assets.total ?? 0) - (liabilities.total ?? 0),
    cash: cover(a.filter((x) => x.liquid).map((x) => x.amount)),
    charity: cover(a.filter((x) => x.charity).map((x) => x.amount)),
    tangible: cover(a.filter((x) => tangibleKeys.has(x.kind)).map((x) => x.amount)),
    intangible: cover(a.filter((x) => !tangibleKeys.has(x.kind)).map((x) => x.amount)),
    outOfScope: owner === null ? 0 : (h.assets.length + h.liabilities.length) - (a.length + l.length),
  };
}

/**
 * Committed outflows over the next `months`, from `from`.
 *
 * A recurring item contributes once per occurrence inside the window, which is
 * the only reading that makes coverage mean anything: school fees every three
 * months are four payments a year, not one.
 */
export function outflowsWithin(h: Household, from: Date, months: number): Covered {
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + months);
  const amounts: (number | null)[] = [];
  for (const o of h.outflows) {
    if (!o.dueOn) continue;
    const t0 = Date.parse(`${o.dueOn}T00:00:00Z`);
    if (!Number.isFinite(t0)) continue;
    if (o.everyMonths === null) {
      const d = new Date(t0);
      if (d >= from && d < end) amounts.push(o.amount);
      continue;
    }
    // Walk occurrences forward from the stated date. Bounded by the window, and
    // by a hard cap so a one-month cadence over a long window cannot spin.
    const d = new Date(t0);
    for (let n = 0; n < 600 && d < end; n++) {
      if (d >= from) amounts.push(o.amount);
      d.setUTCMonth(d.getUTCMonth() + o.everyMonths);
    }
  }
  return cover(amounts);
}

/**
 * Liquidity coverage, in MONTHS: cash divided by the average monthly committed
 * outflow over the next year.
 *
 * BOTH SIDES OR NOTHING. No cash entered is not zero months, and no outflow
 * schedule is not infinite coverage — the caller renders the missing side by
 * name. A zero monthly outflow with real cash is likewise absent rather than
 * infinite: "nothing is committed in the next year" is a statement about the
 * schedule, not a coverage ratio.
 */
export function liquidityMonths(cash: number | null, yearOutflow: number | null): number | null {
  if (cash === null || yearOutflow === null || !(yearOutflow > 0)) return null;
  return cash / (yearOutflow / 12);
}
