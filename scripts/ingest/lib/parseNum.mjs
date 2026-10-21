// Number parsing for Indian financial statements.
//
// THE RULE THAT MATTERS: `null` means "not reported". It never means zero.
// A blank cell, a bare dash and an "N/A" are all the absence of a figure, and
// coercing them to 0 would make them arithmetic — a missing accrued-income cell
// would silently drag a total down, and nothing on screen would say so.
//
// The second rule: a value this cannot parse CONFIDENTLY is reported as
// unparseable, not guessed. The text layer of these statements runs values
// together (`-33.7912,500` is two numbers, not one), so a permissive parser
// that strips punctuation until something numeric falls out would return
// -33.7912500 here and be believed. The grouping validator below exists
// specifically to reject that.

/** Tokens that mean "the provider printed nothing here". */
const NOT_REPORTED = new Set(["", "-", "--", "---", "n/a", "na", "nil", "none", "not applicable", "."]);

/** Currency marks and units to strip before parsing. */
const NOISE = /[₹$£€]|(?:^|\s)(?:rs|inr|usd)\.?(?=\s|\d|$)/gi;

/**
 * Is this digit grouping well-formed?
 *
 * Accepts both conventions that appear in these statements:
 *   Western — groups of 3:            14,580,412
 *   Indian  — last 3, then 2s:        1,45,80,412
 * and an ungrouped run of digits. Anything else (a 4-digit group, a group after
 * the decimal point, a trailing comma) is a sign the token is two values stuck
 * together, and is rejected.
 */
function groupingIsValid(intPart) {
  if (!intPart.includes(",")) return /^\d+$/.test(intPart);
  const groups = intPart.split(",");
  if (groups.some((g) => !/^\d+$/.test(g))) return false;
  const first = groups[0], rest = groups.slice(1);
  if (first.length < 1 || first.length > 3) return false;
  const last = rest[rest.length - 1];
  if (last.length !== 3) return false;                 // both conventions end in a 3-group
  const middles = rest.slice(0, -1);
  if (middles.length === 0) return true;
  const allThrees = middles.every((g) => g.length === 3);   // Western
  const allTwos = middles.every((g) => g.length === 2);     // Indian
  return allThrees || allTwos;
}

/**
 * Parse one cell.
 * @returns {{ value: number|null, status: "ok"|"not-reported"|"unparseable", raw: string }}
 */
export function parseNumInfo(raw) {
  const original = raw == null ? "" : String(raw);
  let s = original.trim();
  if (NOT_REPORTED.has(s.toLowerCase())) return { value: null, status: "not-reported", raw: original };

  s = s.replace(NOISE, "").trim();
  // Percent is a unit, not part of the number — "35.90%" is 35.90.
  s = s.replace(/%/g, "").trim();
  if (NOT_REPORTED.has(s.toLowerCase())) return { value: null, status: "not-reported", raw: original };

  // Sign can arrive three ways: leading, trailing (common in ledger prints), or
  // parentheses. Exactly one of them may apply.
  let negative = false;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) { negative = true; s = paren[1].trim(); }
  if (/^-/.test(s)) {
    if (negative) return { value: null, status: "unparseable", raw: original };
    negative = true; s = s.slice(1).trim();
  }
  if (/-$/.test(s)) {
    if (negative) return { value: null, status: "unparseable", raw: original };
    negative = true; s = s.slice(0, -1).trim();
  }
  s = s.replace(/^\+/, "").trim();
  if (!s) return { value: null, status: "not-reported", raw: original };

  // A second sign, or a stray separator, anywhere inside means this is not one number.
  if (/[-+]/.test(s)) return { value: null, status: "unparseable", raw: original };
  if (/\s/.test(s)) return { value: null, status: "unparseable", raw: original };

  const parts = s.split(".");
  if (parts.length > 2) return { value: null, status: "unparseable", raw: original };
  const [intPart, fracPart = ""] = parts;
  // A comma after the decimal point is the signature of two concatenated values.
  if (fracPart && !/^\d+$/.test(fracPart)) return { value: null, status: "unparseable", raw: original };
  if (intPart === "" && fracPart === "") return { value: null, status: "not-reported", raw: original };
  if (intPart !== "" && !groupingIsValid(intPart)) return { value: null, status: "unparseable", raw: original };

  const n = Number((intPart.replace(/,/g, "") || "0") + (fracPart ? "." + fracPart : ""));
  if (!Number.isFinite(n)) return { value: null, status: "unparseable", raw: original };
  return { value: negative ? -n : n, status: "ok", raw: original };
}

/** The value, or null for both "not reported" and "unparseable". */
export function parseNum(raw) {
  return parseNumInfo(raw).value;
}

/**
 * Stitch a number split across text spans or lines.
 *
 * These statements break a figure mid-token — `2,037,517.` on one span and `00`
 * on the next. Joined only when the result parses as ONE well-formed number, so
 * two genuinely separate values in adjacent columns are never fused.
 */
export function stitchNumber(...pieces) {
  const joined = pieces.map((p) => (p == null ? "" : String(p).trim())).join("");
  const info = parseNumInfo(joined);
  return info.status === "ok" ? info : { value: null, status: "unparseable", raw: joined };
}

/** True when a token looks like it is meant to be numeric (for column typing). */
export function looksNumeric(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return false;
  return /^[₹$£€(]?[-+]?[\d,]*\.?\d+[)%]?-?$/.test(s.replace(/\s/g, ""));
}
