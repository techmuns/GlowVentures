// THE PRIVATE DEAL REGISTER — the FOOS spec's private-investment tracker, as a
// store the family writes rather than a layout waiting for a feed.
//
// WHY THIS COULD NEVER HAVE COME FROM AN INGEST. The AIF and drawdown statements
// in `source/` report a FUND's capital account: contributed, distributed, NAV.
// They say nothing about the companies underneath — what was committed to
// Helios, on what date, at what pre-money, for what fully-diluted stake, and
// whether the last round diluted it. That is the family's own paperwork: a
// shareholders' agreement, a term sheet, a cap table sent by a founder. No
// statement issuer holds it, so no reader can extract it.
//
// The rules from `familyInputs.ts` carry over unchanged, and one of them does
// most of the work here:
//
//   PRIMITIVES ARE ENTERED; EVERYTHING DERIVABLE IS DERIVED. The family types
//   what it committed and each tranche it actually paid. Amount invested,
//   pending to invest, the first and last investment dates, the document count,
//   whether a subsequent round happened and what the stake is now worth are all
//   COMPUTED. That is the same discipline the ingest applies to a statement, and
//   for the same reason: two figures entered independently disagree, and a
//   register that lets a family type "committed ₹12 Cr, invested ₹9 Cr, pending
//   ₹4 Cr" will eventually be asked which of the three is right.
//
//   AN UNSET FIGURE IS `null`. A deal with no tranche recorded has invested
//   `null`, not ₹0 — "we have not entered the drawdowns yet" and "we committed
//   and paid nothing" are different facts about a live commitment, and only one
//   of them means the whole commitment is still pending.
//
// ATTACHMENTS ARE REGISTERED, NOT STORED. `localStorage` is a few megabytes and
// these are signed PDFs; a browser store is the wrong home for the documents
// themselves. What is recorded is that a document EXISTS, what it is, its date
// and where it lives — which is what makes a missing one findable. The register
// says this on screen rather than implying a vault it does not have.

/** The segments the spec splits a private book into. */
export const DEAL_SEGMENTS = ["PE", "VC", "Pre-IPO", "Unlisted", "Private debt"] as const;
export type DealSegment = (typeof DEAL_SEGMENTS)[number];

/** What a document attached to a deal is. Drives the MIS column. */
export const DOC_KINDS = ["Agreement", "Term sheet", "Cap table", "Financials", "MIS", "Other"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/** One drawdown actually paid. The spec's "click → investment by tranches & dates". */
export type DealTranche = { id: string; date: string; amount: number | null; note: string };

/** A funding round after entry. The spec's "click → per-round valuation, investors, cap table & dates". */
export type DealRound = {
  id: string;
  name: string;
  date: string;
  /** Post-money valuation at that round. */
  valuation: number | null;
  investors: string;
  /** What the family put in at this round, if anything. Null = did not participate / not recorded. */
  amountInvested: number | null;
  /** Primary (new money into the company) or secondary (bought from an existing holder). */
  kind: "primary" | "secondary" | "";
  /** The cap table as at this round — free text, the family's own summary. */
  capTable: string;
};

/** A document the family holds. The bytes live elsewhere; this records that it exists. */
export type DealDoc = { id: string; title: string; kind: DocKind; dated: string; location: string };

export type PrivateDeal = {
  id: string;
  company: string;
  segment: DealSegment | null;
  /** What was committed, and when. */
  committed: number | null;
  committedOn: string;
  /** Drawdowns actually paid. Amount invested is the SUM of these, never typed. */
  tranches: DealTranche[];
  /** Fully-diluted stake at entry, percent. */
  stakeFdPct: number | null;
  /** The cap table at entry — "Series B", "Seed", the family's own wording. */
  capTableAtEntry: string;
  /** Latest round the family knows of: post-money valuation and its date. */
  lastRoundValuation: number | null;
  lastRoundOn: string;
  /** Fully-diluted stake AFTER that raise, percent. Dilution is a cap-table fact. */
  stakePctPostRaise: number | null;
  rounds: DealRound[];
  docs: DealDoc[];
  /** What the latest financials are — "FY25 audited", "H1 FY26 management". */
  financials: string;
  financialsAsOf: string;
  /** When the last MIS pack arrived. Documents of kind MIS carry their own dates. */
  misReceivedOn: string;
  note: string;
  updatedAt: string;
};

// ── Coercion ────────────────────────────────────────────────────────────────
// Everything read from storage or from an imported file passes through here, so
// a hand-edited JSON cannot put a malformed number into a derived total.

const s = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** An amount. Finite and positive, else NOT RECORDED. Zero is not a drawdown. */
const amt = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[₹$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * A stake percentage. Accepts ZERO — a holding diluted to nothing is a fact
 * somebody measured, and the whole point of the post-raise column is to show it.
 */
const stake = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[%\s,]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

/** An ISO date, or empty. A malformed date is dropped rather than guessed at. */
const day = (v: unknown): string => {
  const t = s(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
};

let seq = 0;
export const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

function coerceTranche(v: unknown): DealTranche {
  const o = (v ?? {}) as Record<string, unknown>;
  return { id: s(o.id, 40) || newId("t"), date: day(o.date), amount: amt(o.amount), note: s(o.note, 200) };
}

function coerceRound(v: unknown): DealRound {
  const o = (v ?? {}) as Record<string, unknown>;
  const kind = o.kind === "primary" || o.kind === "secondary" ? o.kind : "";
  return {
    id: s(o.id, 40) || newId("r"),
    name: s(o.name, 60), date: day(o.date), valuation: amt(o.valuation),
    investors: s(o.investors, 400), amountInvested: amt(o.amountInvested),
    kind, capTable: s(o.capTable, 400),
  };
}

function coerceDoc(v: unknown): DealDoc {
  const o = (v ?? {}) as Record<string, unknown>;
  const kind = (DOC_KINDS as readonly string[]).includes(s(o.kind, 20)) ? (s(o.kind, 20) as DocKind) : "Other";
  return { id: s(o.id, 40) || newId("d"), title: s(o.title, 200), kind, dated: day(o.dated), location: s(o.location, 400) };
}

export function coerceDeal(v: unknown): PrivateDeal | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const company = s(o.company, 200);
  // A deal with no company name is not a deal. Dropping it is better than a row
  // of figures attached to nothing, which nobody can check against anything.
  if (!company) return null;
  const segment = (DEAL_SEGMENTS as readonly string[]).includes(s(o.segment, 20))
    ? (s(o.segment, 20) as DealSegment) : null;
  return {
    id: s(o.id, 40) || newId("deal"),
    company, segment,
    committed: amt(o.committed), committedOn: day(o.committedOn),
    tranches: (Array.isArray(o.tranches) ? o.tranches : []).map(coerceTranche),
    stakeFdPct: stake(o.stakeFdPct),
    capTableAtEntry: s(o.capTableAtEntry, 200),
    lastRoundValuation: amt(o.lastRoundValuation), lastRoundOn: day(o.lastRoundOn),
    stakePctPostRaise: stake(o.stakePctPostRaise),
    rounds: (Array.isArray(o.rounds) ? o.rounds : []).map(coerceRound),
    docs: (Array.isArray(o.docs) ? o.docs : []).map(coerceDoc),
    financials: s(o.financials, 120), financialsAsOf: day(o.financialsAsOf),
    misReceivedOn: day(o.misReceivedOn),
    note: s(o.note, 2000),
    updatedAt: s(o.updatedAt, 40),
  };
}

export const emptyDeal = (): PrivateDeal => ({
  id: newId("deal"), company: "", segment: null,
  committed: null, committedOn: "", tranches: [],
  stakeFdPct: null, capTableAtEntry: "",
  lastRoundValuation: null, lastRoundOn: "", stakePctPostRaise: null,
  rounds: [], docs: [], financials: "", financialsAsOf: "", misReceivedOn: "",
  note: "", updatedAt: "",
});

// ── Derivation ──────────────────────────────────────────────────────────────

/** Every figure the register SHOWS but nobody types. */
export type DealDerived = {
  /** Sum of the tranches. NULL when none carries an amount — not ₹0. */
  invested: number | null;
  /** First and last drawdown dates. */
  firstInvestedOn: string;
  lastInvestedOn: string;
  /** Committed less invested. Null when either side is missing. */
  pending: number | null;
  /** Committed drawn, as a percent. Null unless both sides exist. */
  drawnPct: number | null;
  docCount: number;
  /** Newest document of kind MIS, if any — backs the MIS column. */
  latestMis: DealDoc | null;
  hasSubsequentRounds: boolean;
  /**
   * What the stake is worth after the latest raise: post-raise stake x that
   * round's post-money valuation. BOTH SIDES REQUIRED — a valuation with no
   * stake, or a stake with no valuation, gives no value at all.
   */
  stakeValuePostRaise: number | null;
  /** Multiple of invested capital, on the stake value above. */
  moic: number | null;
};

export function deriveDeal(d: PrivateDeal): DealDerived {
  const paid = d.tranches.filter((t) => t.amount !== null);
  const invested = paid.length ? paid.reduce((a, t) => a + (t.amount as number), 0) : null;
  const dates = d.tranches.map((t) => t.date).filter(Boolean).sort();
  const pending = d.committed !== null && invested !== null ? d.committed - invested : null;
  const misDocs = d.docs.filter((x) => x.kind === "MIS").sort((a, b) => (a.dated < b.dated ? 1 : -1));
  const stakeValuePostRaise =
    d.stakePctPostRaise !== null && d.lastRoundValuation !== null
      ? (d.stakePctPostRaise / 100) * d.lastRoundValuation
      : null;
  return {
    invested,
    firstInvestedOn: dates[0] ?? "",
    lastInvestedOn: dates[dates.length - 1] ?? "",
    pending,
    drawnPct: d.committed !== null && d.committed > 0 && invested !== null ? (invested / d.committed) * 100 : null,
    docCount: d.docs.length,
    latestMis: misDocs[0] ?? null,
    hasSubsequentRounds: d.rounds.length > 0,
    stakeValuePostRaise,
    // `invested > 0` guards the divide; a MOIC on nothing invested is infinite,
    // which renders as a real number and reads as a spectacular outcome.
    moic: stakeValuePostRaise !== null && invested !== null && invested > 0
      ? stakeValuePostRaise / invested : null,
  };
}

/**
 * Register-wide totals.
 *
 * EVERY TOTAL IS NULL-AWARE AND SAYS WHAT IT COVERS. A deal with no tranches
 * recorded contributes nothing to invested rather than a zero, and `coverage`
 * reports how many of the rows the figure actually spans — a committed total
 * over 4 of 9 deals is a different claim from one over all 9, and the caption
 * must be able to say which.
 */
export function summarise(deals: PrivateDeal[]) {
  const nn = (xs: (number | null)[]) => {
    const set = xs.filter((v): v is number => v !== null);
    return { total: set.length ? set.reduce((a, b) => a + b, 0) : null, of: set.length };
  };
  const derived = deals.map(deriveDeal);
  return {
    count: deals.length,
    committed: nn(deals.map((d) => d.committed)),
    invested: nn(derived.map((d) => d.invested)),
    pending: nn(derived.map((d) => d.pending)),
    stakeValue: nn(derived.map((d) => d.stakeValuePostRaise)),
  };
}
