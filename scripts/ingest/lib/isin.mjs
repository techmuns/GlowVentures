// AN ISIN READ OFF A SCAN — checked by its own check digit, and repaired only
// where the repair is the one clear answer.
//
// Every ISIN carries a check digit (ISO 6166: letters to numbers, then Luhn), so
// a scanned ISIN is not taken on trust the way a scanned name has to be. OCR of a
// photographed statement confuses a small set of glyphs — O and 0, I and 1, S
// and 5, B and 8 — and a reading that fails its check digit is repaired by
// trying exactly those swaps (and dropping one or two specks the scanner read as
// characters), keeping only candidates whose check digit holds.
//
// A repair is accepted only when it is unambiguous:
//   • candidates are ranked by how likely each confusion is (O→0 is the
//     commonest error a serif face produces; L→1 is rare), and the best must be
//     strictly cheaper than the next — a tie is not resolved by guessing;
//   • several independent readings of the same cell must not contradict it;
//   • an Indian ISIN's issuer code starts with a digit, and an equity's
//     security type is two digits (INE + issuer + type + serial + check digit),
//     so a letter there is not a candidate.
// Anything else comes back unresolved, and the reader refuses the row.

/** True when `s` is a well-formed ISIN whose check digit is right. */
export function isinValid(s) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(s ?? ""))) return false;
  const digits = s.slice(0, 11).split("").map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55))).join("");
  let sum = 0, double = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10 === Number(s[11]);
}

/**
 * What OCR prints in place of what the page printed, and what each swap costs —
 * the commoner the confusion, the cheaper. A dropped speck costs 1.
 */
const SWAPS = {
  O: [["0", 1]], 0: [["O", 1.5]], Q: [["0", 1.5]], D: [["0", 2]],
  I: [["1", 1]], L: [["1", 2]], 1: [["I", 1.5]],
  S: [["5", 1.5]], 5: [["S", 1.5]], B: [["8", 1.5]], 8: [["B", 1.5]],
  Z: [["2", 2]], 2: [["Z", 2]], G: [["6", 2]], 6: [["G", 2]],
  T: [["7", 2.5]], 7: [["T", 2.5]], A: [["4", 2.5]], 4: [["A", 2.5]],
};
const DROP = 1;

/**
 * Where an Indian ISIN must carry a digit: the issuer code's first character
 * (`INE455K…`, `INE0LTR…`, `INF0RO5…`, `INF740K…` — NSDL allots it numeric), the
 * equity security type, and the check digit. A serial may carry letters (a
 * bond's `08AN`), so it is left to the check digit.
 */
const digitAt = (isin, i) => i === 3 || i === 11 || (isin[2] === "E" && (i === 7 || i === 8));

/** Every check-digit-valid ISIN within reach of one reading, with its cost. */
export function isinCandidates(raw) {
  let base = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Leading specks before the country code ("JINE…", "'INF…").
  base = base.replace(/^[^I]{1,2}(?=I[NM][EF])/, "");
  if (base.length < 12 || base.length > 14) return [];
  const out = new Map();
  const drops = (t, n, cost) => n === 0 ? [[t, cost]]
    : [...Array(t.length).keys()].flatMap((i) => drops(t.slice(0, i) + t.slice(i + 1), n - 1, cost + DROP));
  for (const [t0, dropCost] of drops(base, base.length - 12, 0)) {
    if (!/^I[NM][EF]/.test(t0)) continue;
    const t = "IN" + t0.slice(2);
    // Positions 3–11 may each stay or take one of their swaps.
    let partial = [[t.slice(0, 3), dropCost]];
    for (let i = 3; i < 12; i++) {
      const next = [];
      for (const [prefix, cost] of partial) {
        const options = [[t[i], 0], ...(SWAPS[t[i]] ?? [])];
        for (const [c, w] of options) {
          if (digitAt(t, i) && !/\d/.test(c)) continue;
          if (cost + w <= 6) next.push([prefix + c, cost + w]);
        }
      }
      partial = next;
    }
    for (const [isin, cost] of partial) {
      if (isinValid(isin) && (!out.has(isin) || out.get(isin) > cost)) out.set(isin, cost);
    }
  }
  return [...out.entries()].map(([isin, cost]) => ({ isin, cost })).sort((a, b) => a.cost - b.cost || a.isin.localeCompare(b.isin));
}

/**
 * The ISIN several readings of one cell agree on, or null.
 *
 * A candidate's cost is its TOTAL distance from every reading that reaches it —
 * how much of what OCR saw, across all its looks at the cell, has to be undone
 * for it to be right. A candidate fewer readings reach ranks below one they all
 * reach. The winner must be strictly cheaper than the runner-up. `known` (ISINs
 * other statements in this book print) breaks a remaining tie only when exactly
 * one of the tied candidates is known — an identifier the book already holds,
 * never a guess about a new one.
 */
export function resolveIsin(readings, { known = new Set() } = {}) {
  const pooled = new Map();
  let reached = 0;
  for (const r of readings) {
    const cands = isinCandidates(r);
    if (!cands.length) continue;
    reached++;
    for (const { isin, cost } of cands) {
      const p = pooled.get(isin) ?? { isin, costs: [] };
      p.costs.push(cost);
      pooled.set(isin, p);
    }
  }
  if (!pooled.size) return { isin: null, why: "no reading is a valid ISIN, whatever single-glyph confusions are undone" };
  // A candidate reached by every reading beats one only some readings reach.
  const ranked = [...pooled.values()]
    .map((p) => ({ isin: p.isin, misses: reached - p.costs.length, cost: p.costs.reduce((s, c) => s + c, 0) }))
    .sort((a, b) => a.misses - b.misses || a.cost - b.cost || a.isin.localeCompare(b.isin));
  const [best, next] = ranked;
  if (!next || best.misses < next.misses || best.cost < next.cost) return { isin: best.isin, cost: best.cost };
  const tied = ranked.filter((c) => c.misses === best.misses && c.cost === best.cost);
  const knownTied = tied.filter((c) => known.has(c.isin));
  if (knownTied.length === 1) return { isin: knownTied[0].isin, cost: best.cost, via: "known" };
  return { isin: null, why: `the readings fit ${tied.length} valid ISINs equally well (${tied.map((c) => c.isin).join(", ")})` };
}
