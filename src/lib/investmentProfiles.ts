// A PRIVATE INVESTMENT'S STRATEGY AND DESCRIPTION, joined to the investment by
// what it IS — never by where a row sits in the file the family supplied.
//
// `scripts/build-private-profiles.mjs` reads every profile table in `source/`
// (a sheet, a CSV, a JSON file — any layout whose header names an investment
// and a strategy or a description) into `src/data/privateProfiles.json`. This
// module decides which investment each record describes, on the identities
// the book already carries for it:
//
//   security key   the book's own join key, where a file carries one
//   ISIN           the holding's ISIN, exactly
//   name           the fund's printed name, its legal entity, the fund without
//                  its unit class — compared with case, punctuation, spacing
//                  and the legal suffix taken off, and nothing looser
//   brand          the name a reader knows it by (`brandOf`, `BRAND_NAMES`)
//   folio          the account number, narrowing any of the above — or, alone,
//                  naming the one investment that account holds
//
// The most exact tier that finds anything decides. A record that lands on
// investments of more than one brand is AMBIGUOUS and matches nothing: merging
// two different things is worse than showing them apart (rule 1). No similarity
// score, no first-word match.
//
// Per investment and field the NEWEST delivery wins (the standing rule); within
// it the most exact match; two different texts left standing are a conflict,
// and the cell says so rather than picking one.
import SUPPLIED from "@/data/privateProfiles.json";

export type ProfileFieldId = "strategy" | "description";
export const PROFILE_FIELDS: readonly ProfileFieldId[] = ["strategy", "description"];
export const PROFILE_LABEL: Record<ProfileFieldId, string> = { strategy: "Strategy", description: "Description" };

/** One record as `build-private-profiles.mjs` read it. */
export type SuppliedProfile = {
  file: string;
  delivery: string;
  sheet: string | null;
  /** The cell the record's identity was read from. */
  at: string;
  identity: { name: string | null; aka: string | null; isin: string | null; folio: string | null; securityKey: string | null };
  strategy: { value: string; cell: string } | null;
  description: { value: string; cell: string } | null;
};
export type SuppliedProfiles = { files: { file: string; md5: string; records: number }[]; records: SuppliedProfile[] };
export const SUPPLIED_PROFILES = SUPPLIED as SuppliedProfiles;

export type MatchBasis = "security key" | "ISIN" | "name" | "brand" | "folio";
/** How a cell's text reached it: matched off a supplied file, or typed on the dashboard (`enteredProfiles.ts`). */
export type CellBasis = MatchBasis | "entered";
const TIER: readonly MatchBasis[] = ["security key", "ISIN", "name", "brand", "folio"];

/** A cell of the Strategy or Description column: the text and where it came from, or why there is none. */
export type ProfileCell =
  | { value: string; source: string; matchedOn: CellBasis; reason: null }
  | { value: null; source: null; matchedOn: null; reason: string };
export type InvestmentProfile = Record<ProfileFieldId, ProfileCell>;

/** What the book knows an investment as. `group` is its brand: a record may cover a brand, never two. */
export type InvestmentIdentity = {
  id: string;
  label: string;
  group: string;
  keys: readonly string[];
  isins: readonly string[];
  names: readonly string[];
  brands: readonly string[];
  folios: readonly string[];
};

const LEGAL = /[\s,]+(?:private\s+limited|pvt\.?\s*ltd\.?|private\s+ltd\.?|pvt\.?\s+limited|limited|ltd\.?|llp|inc\.?|plc)\s*$/i;
/** A name with everything a person types differently taken off — and nothing a person means. */
export function nameKey(s: string | null | undefined): string {
  let t = String(s ?? "").replace(/&/g, " and ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) t = t.replace(LEGAL, "").trim();
  return t.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");
}
const folioKey = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
const isinKey = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/\s+/g, "");

export type ProfileMatch =
  | { record: SuppliedProfile; ids: readonly string[]; matchedOn: MatchBasis; reason: null }
  | { record: SuppliedProfile; ids: readonly string[]; matchedOn: null; reason: string };

/** Which investments one record describes — or why it describes none. */
export function matchRecord(r: SuppliedProfile, inv: readonly InvestmentIdentity[]): ProfileMatch {
  const id = r.identity;
  const folio = folioKey(id.folio);
  const pool = folio ? inv.filter((i) => i.folios.some((f) => folioKey(f) === folio)) : inv;
  if (folio && !pool.length) return { record: r, ids: [], matchedOn: null, reason: `no private investment is held in folio ${id.folio}` };
  const names = [id.name, id.aka].map(nameKey).filter(Boolean);
  const tests: Record<MatchBasis, (i: InvestmentIdentity) => boolean> = {
    "security key": (i) => !!id.securityKey && i.keys.includes(id.securityKey.trim()),
    ISIN: (i) => !!id.isin && i.isins.some((x) => isinKey(x) === isinKey(id.isin)),
    name: (i) => names.some((n) => i.names.some((x) => nameKey(x) === n)),
    brand: (i) => names.some((n) => i.brands.some((x) => nameKey(x) === n)),
    // A folio alone names an investment only where the account holds one.
    folio: () => !!folio && !names.length && !id.isin && !id.securityKey,
  };
  for (const tier of TIER) {
    const hit = pool.filter(tests[tier]);
    if (!hit.length) continue;
    const groups = new Set(hit.map((i) => i.group));
    if (groups.size > 1) {
      const labels = [...new Set(hit.map((i) => i.label))];
      return { record: r, ids: [], matchedOn: null,
        reason: `it could be any of ${labels.length > 3 ? `${labels.length} investments (${labels.slice(0, 3).join(", ")}, …)` : labels.join(", ")} — the ${tier} does not say which` };
    }
    return { record: r, ids: hit.map((i) => i.id), matchedOn: tier, reason: null };
  }
  const named = id.name ?? id.aka ?? id.isin ?? id.securityKey ?? id.folio;
  return { record: r, ids: [], matchedOn: null, reason: `no private investment ${folio ? `in folio ${id.folio} ` : ""}is known as “${named}”` };
}

const whereOf = (r: SuppliedProfile, cell: string) => `${r.file}${r.sheet ? ` › ${r.sheet}` : ""} › ${cell}`;

const noneSupplied = (field: ProfileFieldId, files: number) => files === 0
  ? `no ${PROFILE_LABEL[field].toLowerCase()} has been supplied — no statement prints one, and no file in the statement drop gives one for any investment`
  : `no ${PROFILE_LABEL[field].toLowerCase()} supplied for this investment — none of the ${files} profile ${files === 1 ? "file" : "files"} in the statement drop names it`;

/**
 * EVERY INVESTMENT'S PROFILE, and every record that described none of them.
 * `supplied` defaults to what the build read; a test hands its own.
 */
export function matchProfiles(inv: readonly InvestmentIdentity[], supplied: SuppliedProfiles = SUPPLIED_PROFILES) {
  const matches = supplied.records.map((r) => matchRecord(r, inv));
  const byId = new Map<string, InvestmentProfile>();
  for (const i of inv) {
    const mine = matches.filter((m): m is Extract<ProfileMatch, { reason: null }> => m.reason === null && m.ids.includes(i.id));
    const profile = {} as InvestmentProfile;
    for (const field of PROFILE_FIELDS) {
      const with_ = mine.filter((m) => m.record[field]);
      if (!with_.length) {
        profile[field] = { value: null, source: null, matchedOn: null, reason: noneSupplied(field, supplied.files.length) };
        continue;
      }
      const newest = with_.reduce((d, m) => (m.record.delivery > d ? m.record.delivery : d), "");
      const latest = with_.filter((m) => m.record.delivery === newest);
      const best = Math.min(...latest.map((m) => TIER.indexOf(m.matchedOn)));
      const kept = latest.filter((m) => TIER.indexOf(m.matchedOn) === best);
      const texts = [...new Set(kept.map((m) => m.record[field]!.value))];
      if (texts.length > 1) {
        profile[field] = { value: null, source: null, matchedOn: null,
          reason: `the supplied ${PROFILE_LABEL[field].toLowerCase()}s disagree — ${kept.map((m) => whereOf(m.record, m.record[field]!.cell)).join(" and ")} give different text, so neither is shown` };
        continue;
      }
      const at = [...new Set(kept.map((m) => whereOf(m.record, m.record[field]!.cell)))];
      profile[field] = { value: texts[0], source: at.join("; "), matchedOn: kept[0].matchedOn, reason: null };
    }
    byId.set(i.id, profile);
  }
  const unmatched = matches.filter((m): m is Extract<ProfileMatch, { reason: string }> => m.reason !== null);
  return { byId, unmatched, files: supplied.files.length, records: supplied.records.length };
}

/**
 * ONE ROW OVER SEVERAL INVESTMENTS — a brand, a family member — shows a text
 * only where every investment under it has the same one. Otherwise the row
 * says what to open; the lines under it carry each.
 */
export function combineProfiles(ps: readonly InvestmentProfile[]): InvestmentProfile {
  const out = {} as InvestmentProfile;
  for (const field of PROFILE_FIELDS) {
    const cells = ps.map((p) => p[field]);
    const texts = new Set(cells.map((c) => c.value));
    if (cells.length && texts.size === 1 && cells[0].value != null) {
      out[field] = { ...cells[0], source: [...new Set(cells.map((c) => c.source))].join("; ") };
    } else if (cells.length && cells.every((c) => c.value == null) && new Set(cells.map((c) => c.reason)).size === 1) {
      out[field] = cells[0];
    } else {
      out[field] = { value: null, source: null, matchedOn: null,
        reason: `the investments under this row ${cells.some((c) => c.value != null) ? "do not share one" : "have none"} — open the row to see each` };
    }
  }
  return out;
}

/** What a column's header hover says about the supplied records. */
export function profileSupplyNote(field: ProfileFieldId, m: ReturnType<typeof matchProfiles>): string {
  const what = field === "strategy" ? "A fund's investment strategy" : "What the company does";
  const type = ` Click a cell to type it in, saved for everyone; typed text shows over a file's.`;
  if (!m.files) return `${what}, as the family supplies it. No statement prints one.${type} A sheet, CSV or JSON in the statement drop that names each investment (by name, ISIN or folio) beside a ${PROFILE_LABEL[field]} column fills it too.`;
  const used = m.unmatched.filter((u) => u.record[field]);
  return `${what}, as supplied in ${m.files} ${m.files === 1 ? "file" : "files"} (${m.records} records), matched to each investment by ISIN, name, brand or folio.${type}`
    + (used.length ? ` ${used.length} supplied ${used.length === 1 ? "record matches" : "records match"} no investment on this view: ${used.slice(0, 6).map((u) => `${u.record.identity.name ?? u.record.identity.isin ?? u.record.identity.folio} (${u.reason})`).join("; ")}${used.length > 6 ? "; …" : ""}.` : "");
}
