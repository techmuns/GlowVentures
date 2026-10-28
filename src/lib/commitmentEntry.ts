import type { BookFolio } from "./privateBook";
import { capitalInputId, privateCapitalId, type InputChange, type InputRecord } from "./tableInputs";

/**
 * ── CAPITAL COMMITMENTS, ENTERED PER FOLIO ────────────────────────────────
 *
 *   *"Capital commitment and yet-to-be-drawn capital per fund — Gaurav to
 *    enter"* — the family, 28 Oct 2026.
 *
 * One row per folio the Private Market table shows, keyed on the SAME capital
 * input record its Committed / Still to call cells edit (`<Tr>` in
 * SortHeader.tsx): a capital account's own record where its statement sends one,
 * the holding's `private-capital` record otherwise. A fund held by three members
 * is three commitments, so a fund is never one row — that would split a figure
 * nobody supplied.
 */
export const COMMITMENT_FIELDS = ["committed", "undrawn"] as const;
export type CommitmentField = (typeof COMMITMENT_FIELDS)[number];

export type CommitmentRow = {
  record: InputRecord;
  fundName: string;
  owner: string;
  account: string;
  asOf: string | null;
  /** A fund (a SEBI category, or a capital account), as opposed to a company held directly. */
  isFund: boolean;
};

/** The capital record a folio's Committed / Still to call cells edit — null for an income-only view, which carries none. */
export function commitmentRecordId(f: BookFolio, has: (id: string) => boolean): string | null {
  if (f.viewOf) return null;
  if (f.position) {
    const own = privateCapitalId(f.position);
    if (has(own)) return own;
  }
  const id = capitalInputId(f.capital?.accountId ?? f.accountId);
  return has(id) ? id : null;
}

export function commitmentRows(folios: readonly BookFolio[], catalog: readonly InputRecord[]): CommitmentRow[] {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const rows: CommitmentRow[] = [];
  for (const f of folios) {
    const id = commitmentRecordId(f, (x) => byId.has(x));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push({ record: byId.get(id)!, fundName: f.fundName, owner: f.owner, account: `${f.provider} ${f.accountNo}`,
      asOf: byId.get(id)!.asOf || f.asOf, isFund: f.category != null || f.capital != null });
  }
  return rows.sort((a, b) => Number(b.isFund) - Number(a.isFund) || a.fundName.localeCompare(b.fundName) || a.owner.localeCompare(b.owner));
}

const UNIT: Record<string, number> = { cr: 1e7, crore: 1e7, crores: 1e7, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5 };
/**
 * A typed amount in rupees: `12,50,000`, `₹2.5 Cr` or `40 lakh`. Blank is
 * null (not known); anything else that is not an amount is NaN, never a guess.
 */
export function parseRupees(text: string): number | null {
  const t = text.trim().replace(/^₹\s*/, "").replace(/,/g, "");
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?|\.\d+)\s*([a-z]+)?$/i.exec(t);
  if (!m) return NaN;
  const scale = m[2] ? UNIT[m[2].toLowerCase()] : 1;
  return scale ? Math.round(Number(m[1]) * scale * 100) / 100 : NaN;
}
export const rupeeText = (n: number | null) => (n == null ? "" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 }));

/** A cell's draft, struck against the record version it was typed over. */
export type CommitmentDraft = { text: string; version: string; source: string };
export const draftKey = (id: string, field: string) => `${id}\n${field}`;

/**
 * The drafts as store changes. Clearing a number the family entered restores
 * the original (the statement's figure, or blank where none was ever read);
 * clearing a statement's figure records it as not known.
 */
export function commitmentChanges(drafts: ReadonlyMap<string, CommitmentDraft>, catalog: readonly InputRecord[]): { changes: InputChange[]; error: string | null } {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const changes: InputChange[] = [];
  for (const [key, d] of drafts) {
    const [id, field] = key.split("\n");
    const r = byId.get(id), label = r?.fields.find((f) => f.key === field)?.label;
    if (!r || !label) return { changes: [], error: "An investment has changed. Close and reopen Enter commitments." };
    const value = parseRupees(d.text);
    if (value !== null && !Number.isFinite(value)) return { changes: [], error: `Enter an amount for ${r.label}: ${label} — rupees, or with Cr / lakh.` };
    if (value === r.values[field] && d.version === (r.versions[field] ?? "")) continue;
    changes.push({ id, field, value, version: d.version, source: d.source, ...(value === null && d.version ? { reset: true } : {}) });
  }
  return { changes, error: null };
}
