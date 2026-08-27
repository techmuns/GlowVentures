// LAYER 1 — THE FAMILY'S OWN NOTE STORE.
//
// The spec calls Knowledge & Memory its most important layer: every manager
// meeting, fund pitch, IC discussion, conference note, book and podcast
// captured, tagged and recallable later. That page has been a preview since it
// was built, on the stated grounds that it needed "a note store, a tagging model
// and an AI index".
//
// Two of those three were never the blocker. The muns catalogue's document
// search covers muns' own corpus and can never hold the family's private
// minutes, so waiting for a vendor was waiting for something that was not
// coming. What a note store actually needs is somewhere to put a note — and the
// family-input layer already established where that is and what the rules are.
//
// So this extends `familyInputs.ts` rather than inventing a second discipline:
//
//   NOTHING HERE MAY EVER REACH `glowData.ts`. A meeting note is a record the
//   family creates; the book is generated from `source/` and regenerates
//   byte-identically. Writing one into the other breaks that guarantee.
//
//   AN UNRECORDED FIELD IS EMPTY, NOT A GUESS. A note with no manager named is
//   not a note about nobody; it is a note whose manager was not recorded. The
//   UI shows the omission rather than filling it.
//
//   IT ROUND-TRIPS THROUGH A FILE. `localStorage` alone would lose years of the
//   family's own minutes to a cleared browser. Everything re-enters through
//   `coerce`, so a hand-edited export cannot put a malformed record into the
//   store.
//
// WHAT THIS DELIBERATELY IS NOT.
// The spec asks for natural-language query across the corpus. This is keyword
// and facet search over the family's own notes: it matches text, filters on the
// tag dimensions and orders by date. That is a real, complete answer to "show me
// every discussion on small-cap valuations since 2024" — a search — and it is
// not a language model reading an index. The page says which one it is, because
// a search box labelled "AI" that greps would be a claim the page does not
// honour.

import { IPS_BUCKETS, type IpsBucketKey } from "./familyInputs";

const KEY = "glow:knowledge/v1";
// v2 added the note-level IPS bucket and review date. A v1 export imports
// cleanly — both default to unset, which is what a file written before the
// fields existed actually says.
//
// v3 reworded ONE tag: the asset class `Equity` is stored as `Company Shares`,
// the word the holdings tables render for that class now that `Direct Equity`
// names a narrower set beside it. A v1 or v2 export imports cleanly too, and
// keeps the tag rather than losing it — see `RETIRED_ASSET_CLASS_TAGS`.
export const SCHEMA_VERSION = 3;

/** The bucket keys, as a plain array for `oneOf` to validate against. */
const IPS_BUCKET_KEYS = IPS_BUCKETS.map((b) => b.key);

// ── The tagging model ───────────────────────────────────────────────────────
// These vocabularies are the SPEC's, not a house view. The one dimension left
// free is Theme: a theme list is the family's own language and seeding it would
// put words in their mouth.

/** The twelve source types the spec lists. */
export const NOTE_SOURCES = [
  "Manager meeting", "Fund pitch", "Product presentation", "Investment committee",
  "External interaction", "Tax discussion", "Deal discussion", "Macro call",
  "Conference", "Book", "Podcast", "Research report",
] as const;
export type NoteSource = (typeof NOTE_SOURCES)[number];

/** The pipeline a note moves along. */
export const DECISION_STATUSES = ["Research", "Watchlist", "Approved", "Invested", "Exited"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const RISK_LEVELS = ["Low", "Moderate", "High"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const GEOGRAPHIES = ["India", "Global"] as const;
export type Geography = (typeof GEOGRAPHIES)[number];

/**
 * ONE TAG PER ASSET CLASS, in the words the holdings tables render.
 *
 * This mirrors `AssetClass` in `lib/types.ts` ON PURPOSE, so a note and a
 * holding are filed against one vocabulary. PMS is absent here for the same
 * reason it is absent there: it is how an account is RUN, not what a thing IS.
 *
 * `Equity` WAS THE ONE VALUE THAT COULD BE READ TWO WAYS. The holdings tables
 * now carry two sets whose names are a word apart — `assetClassLabel("Equity")`
 * is **Company Shares** and answers *what is this?*, `DIRECT_EQUITY_BUCKET` is
 * **Direct Equity** and answers *who chose it?* — and a tag reading plain
 * "Equity" sits between them naming neither. This page renders its tags as the
 * bare stored string, so that ambiguity was on screen and not merely in the
 * model. A note is about a KIND of asset and never about who picked it, so the
 * tag takes the class word: a note on a company a manager holds for this family
 * is a note about company shares exactly like one on a company they bought
 * themselves.
 *
 * It is TYPED here rather than derived from `assetClassLabel`, deliberately.
 * This is a STORED value, and a store whose vocabulary follows a screen label
 * would silently drop every tag the next time that label is reworded — which is
 * the failure this rename had to avoid, not repeat. A future rename adds an
 * entry to `RETIRED_ASSET_CLASS_TAGS` below instead.
 */
export const NOTE_ASSET_CLASSES = [
  "Company Shares", "ETF", "Mutual Fund", "AIF", "Bond", "Structured Product", "Unlisted", "Cash",
] as const;
export type NoteAssetClass = (typeof NOTE_ASSET_CLASSES)[number];

/**
 * Spellings this vocabulary has retired, mapped forward on the way in.
 *
 * `oneOfMany` DROPS anything outside the vocabulary, so renaming a tag without
 * this would quietly delete it from every note the family had already written —
 * in `localStorage` and in every export file they have ever saved. The word
 * changed; what the tag MEANS did not, so the note keeps it.
 */
const RETIRED_ASSET_CLASS_TAGS: Record<string, NoteAssetClass> = { Equity: "Company Shares" };

export type KnowledgeNote = {
  id: string;
  /** What the note is about, in the note-taker's words. */
  title: string;
  /** The note itself. Free text — minutes, a summary, a transcript excerpt. */
  body: string;
  /** Where it came from. */
  source: NoteSource;
  /**
   * THE DATE THE THING HAPPENED, not the date it was typed up. A meeting note
   * entered three weeks later is still a note about that meeting, and a
   * chronology built on the typing date would be wrong. Empty = not recorded.
   */
  occurredOn: string;
  /** Who was there / who wrote it. Free text — this is a record, not a registry. */
  participants: string;
  /**
   * The manager or counterparty the note concerns. Free text, but the page
   * offers the book's own provider names so a note joins to a real mandate.
   * Empty means the note names no manager, which is common and fine.
   */
  manager: string;
  assetClasses: NoteAssetClass[];
  geographies: Geography[];
  /** The family's own theme labels. Free tags — nothing here is seeded. */
  themes: string[];
  /** The note-taker's own read, recorded rather than derived. Null = not stated. */
  risk: RiskLevel | null;
  /** Null = the note carries no decision, which is not the same as "Research". */
  decisionStatus: DecisionStatus | null;
  /** securityKeys this note is about, linking it to holdings in the book. */
  securityKeys: string[];
  /** The spec's "open questions" — something left unresolved and worth chasing. */
  openQuestion: boolean;
  /**
   * Which IPS bucket the note bears on — the spec asks that knowledge be
   * filed against the allocation it informs, not only against a security.
   * Null = not filed against a bucket, which is most notes.
   */
  bucket: IpsBucketKey | null;
  /**
   * When this note is next due to be revisited.
   *
   * A DATE, NOT A CADENCE, and never derived from `occurredOn`. A note about a
   * lock-in expiring in March is due in March whenever it was written, and
   * inferring "six months after it was taken" would put a review date on every
   * note in the store that nobody chose. Empty = no review scheduled, which is
   * not the same as reviewed.
   */
  reviewOn: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeStore = {
  version: number;
  notes: KnowledgeNote[];
  updatedAt: string;
};

export const EMPTY_STORE: KnowledgeStore = { version: SCHEMA_VERSION, notes: [], updatedAt: "" };

// `crypto.randomUUID` is not available on every browser this may open in, so
// the id falls back to a timestamp-plus-random. Ids only need to be unique
// within one family's store.
const newId = (): string => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch { /* older browser */ }
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
};

export const emptyNote = (): KnowledgeNote => ({
  id: newId(),
  title: "", body: "", source: "Manager meeting", occurredOn: "",
  participants: "", manager: "",
  assetClasses: [], geographies: [], themes: [],
  risk: null, decisionStatus: null, securityKeys: [],
  openQuestion: false, bucket: null, reviewOn: "",
  createdAt: "", updatedAt: "",
});

// ── Coercion ────────────────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Keep only values that are in the declared vocabulary, deduped and ordered.
 *
 * `alias` maps a RETIRED spelling forward before the check, so a vocabulary that
 * rewords a tag carries the family's existing notes across instead of silently
 * dropping the tag from each of them.
 */
function oneOfMany<T extends string>(v: unknown, allowed: readonly T[], alias: Record<string, T> = {}): T[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<T>();
  for (const x of v) {
    if (typeof x !== "string") continue;
    const val = (alias[x] ?? x) as T;
    if ((allowed as readonly string[]).includes(val)) seen.add(val);
  }
  return allowed.filter((a) => seen.has(a));
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

/** A date the family typed. `YYYY-MM-DD` or nothing — never a parsed guess. */
const isoDate = (v: unknown): string => {
  const s = str(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

/** Free tags: trimmed, deduped case-insensitively, empties dropped. */
const tags = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const t = String(x ?? "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
};

export function coerceNote(raw: unknown): KnowledgeNote | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  // A note with neither a title nor a body records nothing. Dropped on import
  // rather than kept as an empty row that would inflate every count on screen.
  const title = str(o.title).trim();
  const body = str(o.body).trim();
  if (!title && !body) return null;
  return {
    id: str(o.id) || newId(),
    title, body,
    source: oneOf(o.source, NOTE_SOURCES) ?? "Manager meeting",
    occurredOn: isoDate(o.occurredOn),
    participants: str(o.participants),
    manager: str(o.manager),
    assetClasses: oneOfMany(o.assetClasses, NOTE_ASSET_CLASSES, RETIRED_ASSET_CLASS_TAGS),
    geographies: oneOfMany(o.geographies, GEOGRAPHIES),
    themes: tags(o.themes),
    risk: oneOf(o.risk, RISK_LEVELS),
    decisionStatus: oneOf(o.decisionStatus, DECISION_STATUSES),
    securityKeys: tags(o.securityKeys),
    openQuestion: o.openQuestion === true,
    bucket: oneOf(o.bucket, IPS_BUCKET_KEYS),
    reviewOn: isoDate(o.reviewOn),
    createdAt: str(o.createdAt),
    updatedAt: str(o.updatedAt),
  };
}

export function coerceStore(raw: unknown): KnowledgeStore {
  if (!raw || typeof raw !== "object") return { ...EMPTY_STORE, notes: [] };
  const o = raw as Record<string, unknown>;
  const list = Array.isArray(o.notes) ? o.notes : [];
  const notes: KnowledgeNote[] = [];
  const seenIds = new Set<string>();
  for (const r of list) {
    const n = coerceNote(r);
    if (!n) continue;
    // A duplicated id would make edit and delete act on the wrong row.
    if (seenIds.has(n.id)) n.id = newId();
    seenIds.add(n.id);
    notes.push(n);
  }
  return { version: SCHEMA_VERSION, notes, updatedAt: str(o.updatedAt) };
}

// ── Read / write ────────────────────────────────────────────────────────────

export function readKnowledge(): KnowledgeStore {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? coerceStore(JSON.parse(raw)) : { ...EMPTY_STORE, notes: [] };
  } catch {
    return { ...EMPTY_STORE, notes: [] };
  }
}

export function writeKnowledge(next: KnowledgeStore): KnowledgeStore {
  const stamped: KnowledgeStore = { ...next, version: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(stamped)); } catch { /* private mode */ }
  return stamped;
}

export function upsertNote(store: KnowledgeStore, note: KnowledgeNote): KnowledgeStore {
  const now = new Date().toISOString();
  const i = store.notes.findIndex((n) => n.id === note.id);
  const stamped: KnowledgeNote = { ...note, updatedAt: now, createdAt: note.createdAt || now };
  const notes = i >= 0
    ? store.notes.map((n, j) => (j === i ? stamped : n))
    : [stamped, ...store.notes];
  return writeKnowledge({ ...store, notes });
}

export function deleteNote(store: KnowledgeStore, id: string): KnowledgeStore {
  return writeKnowledge({ ...store, notes: store.notes.filter((n) => n.id !== id) });
}

// ── Search ──────────────────────────────────────────────────────────────────

export type NoteFilter = {
  text: string;
  sources: NoteSource[];
  managers: string[];
  assetClasses: NoteAssetClass[];
  geographies: Geography[];
  themes: string[];
  statuses: DecisionStatus[];
  /** Inclusive `YYYY-MM-DD` bounds on `occurredOn`. Empty = unbounded. */
  from: string;
  to: string;
  openOnly: boolean;
};

export const EMPTY_FILTER: NoteFilter = {
  text: "", sources: [], managers: [], assetClasses: [], geographies: [],
  themes: [], statuses: [], from: "", to: "", openOnly: false,
};

export const filterIsEmpty = (f: NoteFilter): boolean =>
  !f.text.trim() && !f.sources.length && !f.managers.length && !f.assetClasses.length
  && !f.geographies.length && !f.themes.length && !f.statuses.length
  && !f.from && !f.to && !f.openOnly;

/**
 * Every word in the query must appear somewhere in the note.
 *
 * AND rather than OR, because a two-word query that ORs matches nearly the whole
 * store and the reader reads that as "we have discussed this constantly". The
 * haystack spans the title, body and every tag, so a manager name or a theme
 * finds its notes without the reader having to know which field it was typed in.
 */
function matchesText(n: KnowledgeNote, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    n.title, n.body, n.manager, n.participants,
    n.source, n.decisionStatus ?? "", n.risk ?? "",
    ...n.themes, ...n.assetClasses, ...n.geographies, ...n.securityKeys,
  ].join("  ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function searchNotes(notes: KnowledgeNote[], f: NoteFilter): KnowledgeNote[] {
  const some = <T,>(sel: T[], has: T[]) => !sel.length || has.some((v) => sel.includes(v));
  const out = notes.filter((n) => {
    if (!matchesText(n, f.text)) return false;
    if (f.sources.length && !f.sources.includes(n.source)) return false;
    if (f.statuses.length && (!n.decisionStatus || !f.statuses.includes(n.decisionStatus))) return false;
    if (f.managers.length && !f.managers.includes(n.manager)) return false;
    if (!some(f.assetClasses, n.assetClasses)) return false;
    if (!some(f.geographies, n.geographies)) return false;
    if (f.themes.length && !n.themes.some((t) => f.themes.some((s) => s.toLowerCase() === t.toLowerCase()))) return false;
    if (f.openOnly && !n.openQuestion) return false;
    // A note with no date recorded cannot satisfy a date bound. It is excluded
    // from a bounded search rather than assumed to fall inside it — the same
    // rule as never blending a missing value into a total.
    if (f.from && (!n.occurredOn || n.occurredOn < f.from)) return false;
    if (f.to && (!n.occurredOn || n.occurredOn > f.to)) return false;
    return true;
  });
  // Chronology, newest first — the spec asks for it on every aggregated answer.
  // Undated notes sort last rather than to the top of "most recent".
  return out.sort((a, b) => {
    if (a.occurredOn && b.occurredOn) return b.occurredOn.localeCompare(a.occurredOn);
    if (a.occurredOn) return -1;
    if (b.occurredOn) return 1;
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
}

/** Distinct values actually present in the store, for the facet lists. */
export function facets(notes: KnowledgeNote[]) {
  const count = <T extends string>(vals: T[]): { value: T; n: number }[] => {
    const m = new Map<T, number>();
    for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || String(a.value).localeCompare(String(b.value)));
  };
  return {
    sources: count(notes.map((n) => n.source)),
    managers: count(notes.map((n) => n.manager).filter(Boolean)),
    themes: count(notes.flatMap((n) => n.themes)),
    assetClasses: count(notes.flatMap((n) => n.assetClasses)),
    statuses: count(notes.map((n) => n.decisionStatus).filter((s): s is DecisionStatus => !!s)),
  };
}

// ── Export / import ─────────────────────────────────────────────────────────
// Same reasoning as the family-input store: this is the family's own record and
// a cleared browser must not be able to lose it with no way back.

export function exportKnowledge(store: KnowledgeStore): void {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `glow_knowledge_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Read an exported file back in, MERGING rather than replacing.
 *
 * Replace would be the simpler rule and the wrong one: the likely use is a
 * second device or a restore after a clear, and replacing would silently
 * destroy whatever was captured on this browser in the meantime. Notes are
 * matched on id; the newer `updatedAt` wins, so importing the same file twice
 * changes nothing.
 */
export async function importKnowledge(file: File, current: KnowledgeStore): Promise<KnowledgeStore> {
  const incoming = coerceStore(JSON.parse(await file.text()));
  const byId = new Map(current.notes.map((n) => [n.id, n]));
  for (const n of incoming.notes) {
    const held = byId.get(n.id);
    if (!held || (n.updatedAt || "") > (held.updatedAt || "")) byId.set(n.id, n);
  }
  return writeKnowledge({ ...current, notes: [...byId.values()] });
}
