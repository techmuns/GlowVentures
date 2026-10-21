import type { Position } from "./types";
import { splitFundClass } from "../../shared/securityKey.mjs";

/**
 * ── CONCENTRATION IS COUNTED BY INVESTMENT, NOT BY SHARE CLASS (Stage 10fz) ──
 *
 * Morning CIO's Largest holding and Top-10 concentration grouped on
 * `securityKey`, and a key is a SECURITY: Sanshi Fund I's Class E (₹175.13 Cr)
 * and Class A2 (₹29.35 Cr) are two keys, so the book's largest exposure read
 * 20.9% where the fund is 24.4% (₹204.48 Cr — the family review's own `Sanshi
 * Fund 1` line), and the top ten left out the eleventh name the split pushed
 * off the list. A concentration measure asks how much rides on one manager's
 * one fund, and two unit classes of one fund are not two bets.
 *
 * TWO JOINS, BOTH ALREADY RULES ELSEWHERE — neither is invented here:
 *
 *   · THE MONITOR'S CLASS CLUB (Stage 10ff): a fund whose name carries a class
 *     suffix (`splitFundClass`) and that the book holds in two or more classes
 *     is one row there. The same test, over the same whole book.
 *   · THE ISIN, where two keys carry one (B-14): Helios Flexi Cap is ₹29.49 Cr
 *     on the AMC's statement under `helios-flexi-cap-fund-direct-growth` and
 *     ₹11.58 Cr of depository units under `helios-fcf-d-grow`, one ISIN
 *     (INF0R8701046). The ISIN is evidence neither name controls, which is why
 *     the Monitor's split-name count is keyed on it. That count STATES the
 *     split and leaves the key alone — and so does this: `securityKey` is not
 *     rewritten, the extractor still owes the repair, and only the grouping a
 *     concentration figure is struck over joins the two.
 *
 * Struck over whatever set the caller passes — the consolidated current
 * holdings, deduped, for Morning CIO.
 */
export type ConcentrationName = {
  /** The group's identity — stable across loads, never shown. */
  key: string;
  /** The name to print: the fund's own name where classes are clubbed, else the largest line's security. */
  label: string;
  value: number;
  /** Every `securityKey` the group joins, largest first. */
  securityKeys: string[];
  /** The largest line's key — where a link to the name lands when it is one security. */
  leadKey: string;
  /** The fund's name where the group clubs unit classes, else null. */
  clubbedFund: string | null;
  rows: Position[];
};

export function concentrationNames(book: readonly Position[]): ConcentrationName[] {
  // THE CLASS CLUB, exactly as the Monitor decides it: a fund the book holds in
  // two or more classes.
  const classes = new Map<string, Set<string>>();
  for (const p of book) {
    const f = splitFundClass(p.security);
    if (f) (classes.get(f.fund) ?? classes.set(f.fund, new Set()).get(f.fund)!).add(f.cls);
  }
  const clubOf = (p: Position): string | null => {
    const f = splitFundClass(p.security);
    return f && (classes.get(f.fund)?.size ?? 0) >= 2 ? f.fund : null;
  };

  // Union-find over securityKeys: joined by a shared ISIN or a shared club.
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let x = k;
    while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; }
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const firstBy = new Map<string, string>();
  for (const p of book) {
    if (!parent.has(p.securityKey)) parent.set(p.securityKey, p.securityKey);
    const isin = p.isin?.trim().toUpperCase();
    const club = clubOf(p);
    for (const id of [isin ? `isin:${isin}` : null, club ? `club:${club}` : null]) {
      if (!id) continue;
      const seen = firstBy.get(id);
      if (seen) union(seen, p.securityKey); else firstBy.set(id, p.securityKey);
    }
  }

  const groups = new Map<string, Position[]>();
  for (const p of book) {
    const r = find(p.securityKey);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(p);
  }
  return [...groups.entries()].map(([root, rows]) => {
    const byKey = new Map<string, number>();
    for (const p of rows) byKey.set(p.securityKey, (byKey.get(p.securityKey) ?? 0) + p.marketValue);
    const securityKeys = [...byKey.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const lead = rows.reduce((a, p) => (p.marketValue > a.marketValue ? p : a), rows[0]);
    const clubbedFund = rows.map(clubOf).find((f): f is string => !!f) ?? null;
    return {
      key: root, value: rows.reduce((a, p) => a + p.marketValue, 0),
      label: clubbedFund ?? lead.security,
      securityKeys, leadKey: lead.securityKey, clubbedFund, rows,
    };
  }).sort((a, b) => b.value - a.value);
}
