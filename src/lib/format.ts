// Currency / number / date formatters. INR compact uses Indian crore/lakh
// (₹1,606.8 Cr) rather than Intl's "₹1.61KCr"; other currencies use Intl compact.
export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP";

const LOCALE_BY_CURRENCY: Record<string, string> = { USD: "en-US", INR: "en-IN", EUR: "en-GB", GBP: "en-GB" };
const VALID = new Set(["USD", "INR", "EUR", "GBP"]);

export function fmtCurrency(n: number, code = "INR", opts?: { compact?: boolean; sign?: boolean }): string {
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

export function fmtPct(n: number, opts?: { sign?: boolean; decimals?: number }): string {
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

export function changeColor(n: number): string {
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
  // Title-case each alphabetic run (handles HI-TECH → Hi-Tech, (INDIA) → (India)).
  return tok.replace(/[A-Za-z]+/g, (w) => w[0] + w.slice(1).toLowerCase());
}

export function displaySecurity(name: string): string {
  if (!name) return name;
  return name.split(/(\s+)/).map((p) => (/^\s+$/.test(p) ? p : normNameToken(p))).join("");
}

// Compact fiscal-year axis label: "FY2021-22" → "FY21-22", "Q1 FY26-27" → "Q1FY26-27".
export function fmtFyPeriod(period: string): string {
  return period
    .replace(/\s+/g, "")
    .replace(/FY(\d{4})-(\d{2})/, (_, y1: string, y2: string) => `FY${y1.slice(2)}-${y2}`);
}
