/**
 * ── ONE SECURITY, ONE NAME, ON EVERY SCREEN ─────────────────────────────────
 *
 *   *"when I am searching Kaynes in the search bar, it is coming up in small
 *    cap and large cap both. It should be a single name only. Make sure that
 *    the name of all the entities is written correctly neither in all full cap
 *    nor in all small cap. Otherwise 2 separate names of the same company does
 *    not make sense."*
 *
 * A security's IDENTITY has been one `securityKey` since Stage 10ak. Its NAME
 * was not: each position carried the spelling its own statement printed, so
 * one company held through two statements reached the screen twice —
 * measured on this book, seven securities (`labelVariants` lists them, and the
 * names suite fails if the choice below is ever not one of them):
 *
 *   icici-bank              `ICICI Bank Ltd.`  (a PMS appraisal)  ·  `ICICI Bank`  (the depository)
 *   state-bank-of-india     `State Bank of India`  ·  `SBI`  (the depository's `SBI - EQ`)
 *   karur-vysya-bank        `Karur Vysya Bank Ltd.`  ·  `The Karur Vys`  (clipped)
 *   crompton-greaves-…      `… Electrical Ltd`  ·  `… Elec`  (clipped)
 *   arvind-fashions         `Arvind Fashions Ltd`  ·  `Arvind Fashions Limited`
 *   caplin-point-…          `… Ltd.`  ·  `… Ltd`
 *   sharda-motor-industries `… Ltd`  ·  `Sharda Motor Industries`
 *
 * Every one of those was two options in the holdings pick-list and two
 * spellings across the tables — the same defect the family reported, on names
 * nobody had searched for yet. (The first three were ALSO two keys until
 * `KEY_ALIASES` in `shared/securityKey.mjs` joined them — a label cannot merge
 * two rows, so identity had to be fixed first and naming second.)
 *
 * ── THE FULLEST SPELLING A STATEMENT PRINTED, AND NOTHING ANYBODY INVENTED ──
 *
 * The label for a key is one of the spellings the book's OWN statements
 * printed for it, chosen by a rule that says why:
 *
 *   1. one the STATEMENT CASED ITSELF beats one this app had to title-case —
 *      the issuer's own capitals are evidence, the title-caser is a heuristic;
 *   2. then the LONGEST, because a depository clips a name to its column width
 *      and a clipped name is the less complete one;
 *   3. then the one carrying more of the family's money, then alphabetical, so
 *      the choice is deterministic and a rebuild cannot flip it.
 *
 * NO NAME IS SUPPLIED THAT NO STATEMENT PRINTED. A fund's filing names Kaynes
 * `KAYNES TECHNOLOGY INDIA LIMITED` and the family's demat clips it to
 * `KAYNES TECHNOLOGY-EQ`; the demat's spelling is the one used, because the
 * filing is somebody else's document about somebody else's portfolio. Borrowing
 * a fuller name from a third party is the separate decision `stripDepositoryTail`
 * already records as not taken, and it stays not taken here.
 *
 * ── DISPLAY ONLY ────────────────────────────────────────────────────────────
 *
 * `securityKeyOf` is not routed through this and must never be. Two keys that
 * render alike (Helios Flexi Cap under its AMC folio and its clipped depository
 * row) are still two keys and two `/stock/` pages — the extractor join
 * `docs/BOOK-REPORT.md` names. This changes what a row is CALLED, never which
 * row a position is in.
 */
import { BOOK_POSITIONS } from "@/data/glowData";
import { holdingLabel } from "./schemeLabel";

type Candidate = { label: string; cased: boolean; value: number };

const CANONICAL: ReadonlyMap<string, string> = (() => {
  const byKey = new Map<string, Map<string, Candidate>>();
  for (const p of BOOK_POSITIONS) {
    const label = holdingLabel(p.securityKey, p.security);
    const labels = byKey.get(p.securityKey) ?? new Map<string, Candidate>();
    const c = labels.get(label) ?? { label, cased: false, value: 0 };
    // WHETHER THE STATEMENT CASED IT, read off what it printed rather than off
    // the label: a lowercase letter in the source is the issuer's own casing.
    c.cased = c.cased || /[a-z]/.test(p.security);
    c.value += Number.isFinite(p.marketValue) ? p.marketValue : 0;
    labels.set(label, c);
    byKey.set(p.securityKey, labels);
  }
  const out = new Map<string, string>();
  for (const [key, labels] of byKey) {
    const best = [...labels.values()].sort((a, b) =>
      Number(b.cased) - Number(a.cased)
      || b.label.length - a.label.length
      || b.value - a.value
      || a.label.localeCompare(b.label))[0];
    out.set(key, best.label);
  }
  return out;
})();

/**
 * The one name a reader sees for a security.
 *
 * Every key the book holds resolves to its canonical label; anything else — a
 * trade in a name since sold, a lot on a capital-gain statement — falls through
 * to `holdingLabel`, the same casing and scheme rules applied to the spelling
 * that record printed.
 */
export function securityLabel(securityKey: string, printedName: string): string {
  return CANONICAL.get(securityKey) ?? holdingLabel(securityKey, printedName);
}

/** Every key whose label was chosen among two or more printed spellings — for the suite. */
export function labelVariants(): Map<string, string[]> {
  const m = new Map<string, Set<string>>();
  for (const p of BOOK_POSITIONS) {
    const s = m.get(p.securityKey) ?? new Set<string>();
    s.add(holdingLabel(p.securityKey, p.security));
    m.set(p.securityKey, s);
  }
  return new Map([...m].filter(([, s]) => s.size > 1).map(([k, s]) => [k, [...s].sort()]));
}
