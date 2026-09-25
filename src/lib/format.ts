// Currency / number / date formatters. INR compact uses Indian crore/lakh
// (₹1,606.8 Cr) rather than Intl's "₹1.61KCr"; other currencies use Intl compact.
import { stripDepositoryTail } from "../../shared/securityKey.mjs";
export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP";

const LOCALE_BY_CURRENCY: Record<string, string> = { USD: "en-US", INR: "en-IN", EUR: "en-GB", GBP: "en-GB" };
const VALID = new Set(["USD", "INR", "EUR", "GBP"]);

/**
 * Money, or `—` when the book carries no figure.
 *
 * NULL IS NOT ZERO here either. A depository holding statement reports what
 * shares are worth and not what they cost, so `costBasis` and everything derived
 * from it are genuinely absent on those positions — and `₹0` beside a ₹23 L
 * market value would read as a holding acquired for nothing.
 *
 * The dash is the floor, not the goal: where the reason is worth stating, the
 * caller should use `src/components/Absent.tsx`, which requires one.
 */
export function fmtCurrency(n: number | null | undefined, code = "INR", opts?: { compact?: boolean; sign?: boolean }): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const effective = VALID.has(code) ? code : "INR";
  const locale = LOCALE_BY_CURRENCY[effective] ?? "en-IN";
  const signPrefix = opts?.sign && n > 0 ? "+" : "";
  if (opts?.compact && effective === "INR") {
    const neg = n < 0;
    const a = Math.abs(n);
    let body: string;
    // Below ₹10 Cr a single decimal collapses distinct figures onto the same
    // label — ₹1.9625 Cr and ₹2.0000 Cr both render "₹2 Cr", which reads as a
    // contradiction next to the 0.98× they produce. Two decimals there; the
    // larger headline numbers keep one.
    if (a >= 1e7) body = `${(a / 1e7).toLocaleString("en-IN", { maximumFractionDigits: a < 1e8 ? 2 : 1 })} Cr`;
    else if (a >= 1e5) body = `${(a / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
    else body = a.toLocaleString("en-IN", { maximumFractionDigits: 0 });
    return `${neg ? "-" : signPrefix}₹${body}`;
  }
  try {
    return signPrefix + new Intl.NumberFormat(locale, {
      style: "currency", currency: effective,
      notation: opts?.compact ? "compact" : "standard",
      maximumFractionDigits: 2, minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${signPrefix}${effective} ${n.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
  }
}

// Explicit crore formatter (always INR-Cr, no currency conversion) for tables/axes.
export function fmtCr(nInr: number, decimals = 1): string {
  return `₹${(nInr / 1e7).toLocaleString("en-IN", { maximumFractionDigits: decimals })} Cr`;
}

/** An absent measurement, everywhere in the UI. Never a zero. */
export const DASH = "\u2014";

/**
 * A percentage, or `—` when there is nothing to format.
 *
 * NULL IS NOT ZERO. A return needs a cost basis, and a depository holding
 * statement reports a value and no cost — so `returnPct` is genuinely absent on
 * those positions. Rendering `0.00%` there is a measurement of break-even that
 * nobody made. The dash is what the standing rule asks for; where the reason
 * matters enough to state, use `src/components/Absent.tsx` instead.
 */
export function fmtPct(n: number | null | undefined, opts?: { sign?: boolean; decimals?: number }): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const sign = opts?.sign && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(opts?.decimals ?? 2)}%`;
}

export function fmtNum(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(n);
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Gain / loss / neutral colour. An ABSENT figure is neutral, never green.
 *
 * A null return coloured as a gain would say the position is up when nobody
 * measured whether it is — the colour is a claim about the number, and there is
 * no number.
 */
export function changeColor(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "text-slate-400";
  return n > 0 ? "text-gain" : n < 0 ? "text-loss" : "text-slate-400";
}

export function fmtBps(bps: number, opts?: { sign?: boolean }): string {
  const sign = opts?.sign && bps > 0 ? "+" : "";
  return `${sign}${Math.round(bps)} bps`;
}

// ── Security-name display normalisation ──────────────────────────────────────
// Broker / ledger names arrive in a mix of ALL-CAPS ("HFCL LIMITED") and proper
// case ("IIFL Finance"). We standardise to Title Case for display, but only touch
// tokens that are entirely upper-case — so already-cased brands (BeES, eGov,
// ETF-Growth) and anything with a digit (1D) are left exactly as the source has
// them — while preserving known acronyms and canonicalising legal suffixes.
// Idempotent: applying it to an already-tidy name is a no-op.
const NAME_ACRONYMS = new Set([
  "IIFL", "HFCL", "HDFC", "ICICI", "RBL", "PNB", "JSW", "ITC", "PB", "GOCL", "RPSG", "ETF", "LT",
  "SBI", "LIC", "NBCC", "BSE", "NSE", "GST", "REIT", "IPO", "NAV", "AMC", "ONGC", "NTPC", "BHEL",
  "GAIL", "HAL", "IRCTC", "RVNL", "IDFC", "IDBI", "DLF", "UPL", "TVS", "MRF", "CNC", "ISGEC",
  // Stripping the depository furniture exposed the acronyms it used to hide
  // behind: with `PG ELECTRO-EQ1/` shortened to `PG ELECTRO`, the title-caser
  // reached the first token and printed "Pg Electro". These are company and
  // fund-house acronyms, listed here so they keep their case.
  //
  // ONLY UNAMBIGUOUS ONES. The same scan turned up `BNK`, `VYS`, `GR` and `CON`
  // — those are the depository CLIPPING a real word, not acronyms, and adding
  // them would freeze a truncation into something that looks deliberate. They
  // title-case like any other word and stay visibly clipped, which is honest
  // about what the statement printed.
  "PG", "DSP", "ABSL", "GHCL", "PVR", "BLS", "EIH", "MPS", "GMM", "KSB", "ZF",
  "EMA", "DCW", "EFPL", "HEG", "IFB", "SBFC", "VIP", "SGS", "AIF", "DP", "NFT",
  /**
   * *"Make sure that the name of all the entities is written correctly neither
   * in all full cap nor in all small cap."* Measured rather than guessed: every
   * all-caps name this app renders — the book's own statements, the four
   * mandate strategy names, and the fund filings behind the look-through — was
   * put through this and every run it would title-case was read. These are the
   * ones that are names in their own right and must keep their capitals:
   *
   *   SG      `SG Mart Limited` was printing as "Sg Mart"
   *   LLP     both strategy names that carry it — "Green Lantern Capital Llp"
   *   GLC     Green Lantern Capital's own strategy prefix
   *   SVAN    the manager's name, printed in capitals on its own report
   *   GOI     every government security a fund files — "7.18% Goi Mat 140833"
   *   DBS     `DBS Bank India Limited`, filed in capitals by one AMC
   *   NABARD  filed in capitals and with no properly-cased sibling to borrow
   *   MF      the depository's `HDFC MF-…` scheme prefix
   *   HSBC · JNK · MIM · SRF · WAM — company names five all-caps filing lines
   *           carry (`CANARA HSBC LIFE…`, `JNK INDIA`, `INDO-MIM`, `SRF LTD.`,
   *           `360 ONE WAM`) with no properly-cased sibling in the store
   *
   * The list is still a list, and what it cannot know is written down rather
   * than hidden: a new all-caps acronym arriving in a filing title-cases like a
   * word until it is listed here. That is why `lookthrough.ts` first borrows a
   * name another filing printed in its own case (61 of the 142 all-caps lines in
   * today's store have one) and only falls back to this where none exists.
   */
  "SG", "LLP", "GLC", "SVAN", "GOI", "DBS", "NABARD", "MF",
  "HSBC", "JNK", "MIM", "SRF", "WAM",
  /**
   * SDL — a State Development Loan, which one AMC files in capitals
   * (`TAMIL NADU SDL - Mat 290636^`). Title-cased it read "Tamil Nadu Sdl", a
   * word nobody writes; it is the instrument's own abbreviation.
   */
  "SDL",
  /**
   * NLC — `NLC India Limited`, which a depository TRANSACTION statement prints
   * in capitals (`NLC INDIA LIMITED # EQTY SHARES`, Stage 10cx). The company's
   * name, not an expansion of one; title-cased it read "Nlc India".
   */
  "NLC",
]);
/**
 * A BRAND THAT IS NOT AN ACRONYM AND STILL KEEPS ITS CAPITALS. "ONE" is a word
 * everywhere except in `360 ONE`, the wealth house this book holds two
 * engagements with and one fund from; listing ONE as an acronym would shout it
 * in every other name. So the brand is restored after title-casing, and only
 * where it is the brand.
 */
const BRANDS: [RegExp, string][] = [[/\b360 One Wam\b/gi, "360 ONE WAM"], [/\b360 One\b/g, "360 ONE"]];
/** The brands above, applied to a name however it arrived. */
const withBrands = (name: string): string => BRANDS.reduce((acc, [re, to]) => acc.replace(re, to), name);
const NAME_SUFFIX: Record<string, string> = {
  LIMITED: "Limited", LTD: "Ltd", "LTD.": "Ltd.", PVT: "Pvt", "PVT.": "Pvt.",
  PRIVATE: "Private", CO: "Co", "CO.": "Co.", CORP: "Corp", INC: "Inc",
};
const NAME_LOWER_WORDS = new Set(["AND", "OF", "THE", "OR"]);
/** The same four, as a source prints them when it has cased the name itself. */
const MIXED_LOWER_WORDS = new Set(["Of", "And", "The", "Or"]);
/**
 * The words a name legitimately carries in lower case mid-name — the four above
 * and the prepositions a debt line uses (`Additional Tier I Bond under Basel
 * III`). Every OTHER all-lowercase word in a name its filer otherwise cased is a
 * typo in the filing, measured on the store: `Himachal pradesh`, `SBI funds
 * Management ltd.`, `Reliance Retail ventures Ltd.`, `Aditya Birla Capital
 * ltd.`. Those are what a reader sees as "written in small cap", and each is
 * one word the filer forgot to capitalise.
 */
const FILED_LOWER_WORDS = new Set(["of", "and", "the", "or", "for", "in", "on", "at", "to", "by", "with", "under"]);
/**
 * A ROMAN NUMERAL IS NOT A WORD, and fund names are full of them — see below.
 * The STRICT pattern, so it matches numerals and not any string of those
 * letters.
 */
const ROMAN = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

/**
 * One token of a name, cased for display. `first` is whether it opens the name,
 * because a connective is a word everywhere except at the start: `THE KARUR
 * VYS-EQ` was printing as "the Karur Vys" — a name beginning in lower case,
 * which is exactly the "all small cap" the family asked never to see.
 */
function normNameToken(tok: string, first: boolean): string {
  // A token the SOURCE cased (it carries a lowercase letter) is the source's own
  // spelling and is left — with one exception: a connective. "State Bank Of
  // India" and "State Bank of India" are one company printed by two statements,
  // and a reader shown both in one list reads them as two.
  if (/[a-z]/.test(tok)) return !first && MIXED_LOWER_WORDS.has(tok) ? tok.toLowerCase() : tok;
  // A digit means a code, a class or a series (`1D`, `SER20-C6`) — leave it.
  if (/\d/.test(tok)) return tok;
  const alpha = tok.replace(/[^A-Za-z]/g, "");
  if (!alpha) return tok; // "&", "-", …
  if (tok in NAME_SUFFIX) return NAME_SUFFIX[tok];
  const up = alpha.toUpperCase();
  if (up in NAME_SUFFIX) return NAME_SUFFIX[up];
  if (NAME_LOWER_WORDS.has(up)) return first ? up[0] + up.slice(1).toLowerCase() : up.toLowerCase();
  if (alpha.length === 1) return tok; // single initial: J, K, L
  if (NAME_ACRONYMS.has(up)) return tok; // keep acronyms upper-case
  /**
   * A ROMAN NUMERAL IS NOT A WORD, and fund names are full of them.
   *
   * Title-casing every all-caps token turned "Category III" into "Category
   * Iii" and "Series II" into "Series Ii" the moment the August 2026 drop
   * brought funds that use them — Buoyant's Category III, Motilal Oswal
   * Founders Fund Series II, India SME Investments Fund II. A single "I"
   * already survived by the length-1 rule above, which is why "Fund I" always
   * looked right and nobody had reason to look further.
   *
   * The pattern is the STRICT one, so it matches numerals and not any string
   * of those letters. It admits a handful of real words spelled entirely in
   * numeral characters — MIX is M + IX — and the cost of that is a security
   * named MIX keeping the casing its statement printed, which is the safe
   * direction to fail in.
   */
  if (alpha.length > 1 && ROMAN.test(up)) return tok;
  /**
   * Title-case each alphabetic run (HI-TECH → Hi-Tech, (INDIA) → (India)) —
   * AND APPLY THE SAME TWO RULES PER RUN, because the whole-token tests above
   * cannot see inside a hyphen. Sanshi's statement prints `(Open Ended AIF
   * CAT-III)` and the token `CAT-III` is not a numeral, so the fall-through
   * title-cased every run and the fund read "Cat-Iii" on every screen that
   * named it; an acronym joined to a word (`AIF-CAT`) went the same way.
   */
  return tok.replace(/[A-Za-z]+/g, (w) => {
    const u = w.toUpperCase();
    if (w.length > 1 && (ROMAN.test(u) || NAME_ACRONYMS.has(u))) return w;
    return w[0] + w.slice(1).toLowerCase();
  });
}

/**
 * A security name as a reader should see it: the depository's trailing series
 * and face-value furniture removed, then title-cased.
 *
 * `stripDepositoryTail` lives in `shared/securityKey.mjs`, beside the key it must
 * never affect and shared with the Node side, so the screen and the symbol
 * report clean a name with ONE implementation rather than two that drift.
 */
export function displaySecurity(name: string): string {
  if (!name) return name;
  const clean = stripDepositoryTail(name);
  let first = true;
  const cased = clean.split(/(\s+)/).map((p) => {
    if (/^\s+$/.test(p) || p === "") return p;
    const out = normNameToken(p, first);
    first = false;
    return out;
  }).join("");
  return withBrands(cased);
}

/**
 * A depository TRANSACTION statement's name for a holding, as a reader should
 * see it (Stage 10cx). CDSL prints `ISSUER#INSTRUMENT` — `NLC INDIA LIMITED #
 * EQTY SHARES`, `BANDHAN AMC LTD#BANDHAN MF-BANDHAN LARGE & MID CAP FUND - DIRECT
 * PL - GROWTH` — so a company is the part before the `#`, and a fund is the
 * scheme after it with the fund house's `… MF-` prefix taken off.
 *
 * ONLY EVER REMOVES, on `displaySecurity`'s terms: nothing here supplies a word
 * the statement did not print. An instrument that is NOT the ordinary equity —
 * a preference share, a warrant — is kept after the company, because it is a
 * different holding and folding it into the company's name merges two.
 */
export function displayDepositoryName(name: string): string {
  if (!name) return name;
  const at = name.indexOf("#");
  const head = (at < 0 ? name : name.slice(0, at)).trim();
  const tail = at < 0 ? "" : name.slice(at + 1).trim();
  // Equity furniture, whether after the `#` or glued on with a dash.
  const EQUITY = /^[\s#-]*(NEW\s+)?(EQUITY|EQTY|EQ)\b.*$/i;
  const stripEquity = (s: string) => s.replace(/[\s-]*(NEW\s+)?(EQUITY|EQTY|EQ)\s+SHARES?\b.*$/i, "").trim();
  // A fund house (an AMC) or an AIF's own trust or fund — `BUOYANT CAPITAL AIF`,
  // `INDIA SME INVESTMENTS AIF TRUST II` — whose scheme after the `#` IS the name.
  const fundHouse = /\b(AMC|AM|ASSET\s+(MGMNT|MANAGEMENT)(\s+CO(MPANY)?)?)\s+(LTD|LIMITED)\.?$|\b(TRUST|FUND|AIF)(\s+[IVX]+)?$/i;
  let out: string;
  if (tail && fundHouse.test(head)) {
    out = tail.replace(/^.*?\b(MF|MOMF|MUTUAL\s+FUND)\s*-\s*/i, "");
  } else {
    const company = stripEquity(head);
    out = tail && !EQUITY.test(tail) ? `${company} · ${tail}` : company;
  }
  return displaySecurity(out || name);
}

/**
 * A name somebody ELSE printed — an AMC's portfolio disclosure — cased for
 * display without second-guessing the filer.
 *
 * 94% of the lines in the look-through store are already printed in their
 * filer's own case (`KPIT Technologies Ltd.`, `LIC Housing Finance Ltd.`), and
 * running those through the title-caser would turn every capitalised acronym it
 * does not list into a word: "Kpit Technologies". So a name that carries a
 * lowercase letter keeps its filer's casing and only has its connectives
 * lowered — the one thing two filers disagree on. A name printed ENTIRELY in
 * capitals carries no casing information at all, and only that one is
 * title-cased; `lookthrough.ts` borrows another filing's spelling of the same
 * identifier first, and this is the fallback when there is none.
 */
export function displayFiledName(name: string): string {
  if (!name) return name;
  const bare = stripFilingMarks(name);
  if (!/[a-z]/.test(bare)) return displaySecurity(bare);
  let first = true;
  // A filer that cased the name still writes a brand its own way — one AMC
  // prints `360 One Wam Ltd.` — and the brand is restored here as it is in
  // `displaySecurity`, so the house reads one way on every screen.
  return withBrands(bare.split(/(\s+)/).map((p) => {
    if (/^\s+$/.test(p) || p === "") return p;
    let out = !first && MIXED_LOWER_WORDS.has(p) ? p.toLowerCase() : p;
    // A WORD THE FILER LEFT IN LOWER CASE, in a name it otherwise cased. Only a
    // token with NO capital at all: `eClerx` and `iShares` are brands and keep
    // their spelling; `pradesh` and `ltd.` are a filer's slip and do not.
    const letters = out.replace(/[^A-Za-z]/g, "");
    if (letters && letters === letters.toLowerCase() && !/\d/.test(out)
      && (first || !FILED_LOWER_WORDS.has(letters))) {
      out = out.replace(/[a-z]/, (c) => c.toUpperCase());
    }
    first = false;
    return out;
  }).join(""));
}

/**
 * ── A FILER'S FOOTNOTE MARK IS NOT PART OF A NAME ───────────────────────────
 *
 * An AMC's monthly disclosure appends `**`, `#`, `^`, `$`, `@` or `~` to a line
 * to point at a legend at the foot of ITS OWN filing — "** thinly traded",
 * "# certificate of deposit", "^ awaiting listing". The store carries the line
 * and not the legend, so on this dashboard the mark points at nothing: it made
 * `Karur Vysya Bank Ltd. (17/11/2026) **#` read as a different name from
 * `Karur Vysya Bank Ltd.`, which is the "two names for one company" the family
 * asked never to see. Display only, and it only ever removes — anchored at the
 * END, where every one of the store's 804 marked lines carries it.
 */
export function stripFilingMarks(name: string): string {
  return String(name ?? "").replace(/(?:\s*[*#^$@~]+)+\s*$/, "").trim();
}

// Compact fiscal-year axis label: "FY2021-22" → "FY21-22", "Q1 FY26-27" → "Q1FY26-27".
export function fmtFyPeriod(period: string): string {
  return period
    .replace(/\s+/g, "")
    .replace(/FY(\d{4})-(\d{2})/, (_, y1: string, y2: string) => `FY${y1.slice(2)}-${y2}`);
}
