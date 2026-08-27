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
]);
const NAME_SUFFIX: Record<string, string> = {
  LIMITED: "Limited", LTD: "Ltd", "LTD.": "Ltd.", PVT: "Pvt", "PVT.": "Pvt.",
  PRIVATE: "Private", CO: "Co", "CO.": "Co.", CORP: "Corp", INC: "Inc",
};
const NAME_LOWER_WORDS = new Set(["AND", "OF", "THE", "OR"]);

function normNameToken(tok: string): string {
  // Already intentionally cased (has a lowercase letter) or carries a digit → leave.
  if (/[a-z]/.test(tok) || /\d/.test(tok)) return tok;
  const alpha = tok.replace(/[^A-Za-z]/g, "");
  if (!alpha) return tok; // "&", "-", …
  if (tok in NAME_SUFFIX) return NAME_SUFFIX[tok];
  const up = alpha.toUpperCase();
  if (up in NAME_SUFFIX) return NAME_SUFFIX[up];
  if (NAME_LOWER_WORDS.has(up)) return up.toLowerCase();
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
  if (alpha.length > 1 && /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(up)) return tok;
  // Title-case each alphabetic run (handles HI-TECH → Hi-Tech, (INDIA) → (India)).
  return tok.replace(/[A-Za-z]+/g, (w) => w[0] + w.slice(1).toLowerCase());
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
  return clean.split(/(\s+)/).map((p) => (/^\s+$/.test(p) ? p : normNameToken(p))).join("");
}

// Compact fiscal-year axis label: "FY2021-22" → "FY21-22", "Q1 FY26-27" → "Q1FY26-27".
export function fmtFyPeriod(period: string): string {
  return period
    .replace(/\s+/g, "")
    .replace(/FY(\d{4})-(\d{2})/, (_, y1: string, y2: string) => `FY${y1.slice(2)}-${y2}`);
}
