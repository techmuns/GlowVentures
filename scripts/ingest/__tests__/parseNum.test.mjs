// Unit tests for the number parser. Run: node scripts/ingest/__tests__/parseNum.test.mjs
import { parseNum, parseNumInfo, stitchNumber, looksNumeric } from "../lib/parseNum.mjs";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = Object.is(got, want);
  if (ok) pass++; else { fail++; console.log(`  FAIL ${label}\n       got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};
const status = (label, raw, want) => eq(label, parseNumInfo(raw).status, want);

console.log("parseNum");

// ── Indian and Western grouping both appear in this book ────────────────────
eq("indian crore",      parseNum("1,45,80,412.51"), 14580412.51);
eq("western millions",  parseNum("14,580,412.51"), 14580412.51);
eq("indian lakh",       parseNum("1,71,713.60"), 171713.60);
eq("ungrouped",         parseNum("178050895"), 178050895);
eq("grouped equity MV", parseNum("178,050,895"), 178050895);
eq("cash with paise",   parseNum("3,482,781.83"), 3482781.83);
eq("indian same value", parseNum("17,80,50,895"), 178050895);

// ── Signs ───────────────────────────────────────────────────────────────────
eq("leading minus",   parseNum("-33.79"), -33.79);
eq("trailing minus",  parseNum("1,234-"), -1234);
eq("parenthesised",   parseNum("(1,234.50)"), -1234.50);
eq("explicit plus",   parseNum("+2.35"), 2.35);
eq("negative TWRR",   parseNum("-7.73"), -7.73);

// ── Units are stripped, value preserved ─────────────────────────────────────
eq("percent",   parseNum("35.90%"), 35.90);
eq("rupee",     parseNum("₹1,234"), 1234);
eq("rs prefix", parseNum("Rs. 1,234"), 1234);

// ── Zero is a MEASUREMENT and must survive ──────────────────────────────────
eq("zero",        parseNum("0"), 0);
eq("zero decimal", parseNum("0.00"), 0);
status("zero is ok", "0", "ok");

// ── Absence is null, never zero ─────────────────────────────────────────────
eq("dash",   parseNum("-"), null);
eq("blank",  parseNum(""), null);
eq("spaces", parseNum("   "), null);
eq("n/a",    parseNum("N/A"), null);
eq("nil",    parseNum("Nil"), null);
eq("null in", parseNum(null), null);
status("dash not-reported",  "-", "not-reported");
status("blank not-reported", "", "not-reported");
status("na not-reported",    "NA", "not-reported");

// ── The concatenation trap: these MUST be rejected, not guessed ─────────────
status("two numbers run together",  "-33.7912,500", "unparseable");
status("comma after decimal",       "1.234,56", "unparseable");
status("bad group width",           "12,50", "unparseable");
status("four-digit group",          "1,2345,678", "unparseable");
status("double sign",               "--33.79", "unparseable");
status("sign both ends",            "-33.79-", "unparseable");
status("embedded space",            "12 500", "unparseable");
status("two decimal points",        "1.2.3", "unparseable");
status("trailing comma",            "12,", "unparseable");
status("letters",                   "abc", "unparseable");
eq("concat returns null",           parseNum("-33.7912,500"), null);

// ── Stitching values split across spans / lines ─────────────────────────────
eq("stitch decimal tail", stitchNumber("2,037,517.", "00").value, 2037517.00);
eq("stitch nav",          stitchNumber("14,580,412.", "51").value, 14580412.51);
eq("stitch whole",        stitchNumber("178,050,", "895").value, 178050895);
eq("stitch refuses junk", stitchNumber("12,50", "abc").value, null);
eq("stitch keeps status", stitchNumber("1,234.", "56").status, "ok");
// Two adjacent columns must NOT fuse into one plausible number.
eq("stitch rejects two values", stitchNumber("-33.79", "12,500").value, null);

// ── Column typing helper ────────────────────────────────────────────────────
eq("looksNumeric money", looksNumeric("1,45,80,412.51"), true);
eq("looksNumeric pct",   looksNumeric("35.90%"), true);
eq("looksNumeric neg",   looksNumeric("(1,234)"), true);
eq("looksNumeric name",  looksNumeric("Blue Jet Healthcare Ltd."), false);
eq("looksNumeric dash",  looksNumeric("-"), false);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
