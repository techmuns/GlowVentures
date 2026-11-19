// ── THE PRIVATE-MARKET DEAL UNIVERSE (client #441–#448) ─────────────────────
//
// The read model for the Deal Flow page: the whole market of Indian startup
// funding rounds (Inc42 "Funding Galore", via Glow Central Research), fetched
// live from `functions/api/private-market-deals.js`. For DEAL SOURCING — the
// companies the family does NOT yet hold — with the funnel filters Gaurav asked
// for (#443): sector → sub-sector → date → stage (exclude seed/pre-seed) → sort
// by round size, plus a trending-theme tag (#444) derived from the source's own
// sector/sub-sector labels. Nothing here is fabricated: an undisclosed amount
// stays null (never zero), the feed carries funding rounds only (no M&A, #441)
// and no founder contacts (#446), and the page says so.
import { useEffect, useState } from "react";

export type DealAmount = { value: number; currency: "INR" | "USD" };
export type Deal = {
  id: string;
  company: string;
  slug: string;
  date: string; // YYYY-MM-DD
  sector: string | null;
  subsector: string | null;
  businessModel: string | null;
  amountText: string | null;
  amount: DealAmount | null;
  stage: string | null;
  stageGroup: string; // Pre-Seed | Seed | Series A | Series B | Series C | Series D+ | Debt | Other
  investors: string[];
  leadInvestor: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
};
export type DealsMeta = { count: number; from: string | null; to: string | null; asOf: string | null; source: string };

export type DealsState =
  | { status: "loading" }
  | { status: "ready"; deals: Deal[]; meta: DealsMeta }
  | { status: "unavailable"; reason: string; hint: string };

/** The standing stage order for the funnel's multi-select (Series A+ is the usual shortlist). */
export const STAGE_ORDER = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D+", "Debt", "Other"] as const;

/**
 * TRENDING THEMES (#444), derived from the source's own Sector / Sub-sector
 * labels — a reviewed read of what Inc42 already prints, never a guess about a
 * company. A deal carries every theme it matches; a deal that matches none is
 * grouped under its sector on the theme axis.
 */
const THEMES: [string, RegExp][] = [
  ["Space Tech", /space|satellite|aerospace|launch vehicle|geospatial/i],
  ["Quantum", /quantum/i],
  ["AI / GenAI", /\bai\b|artificial intelligence|gen ?ai|machine learning|\bllm\b|deeptech/i],
  ["Electric Mobility", /\bev\b|electric vehicle|e-?mobility|charging|battery/i],
  ["Defence", /defen[cs]e|defence tech|drone|uav|military/i],
  ["Climate / Clean", /climate|clean ?tech|renewable|solar|green ?hydrogen|carbon|sustainab/i],
  ["Fintech", /fintech|payments|lending|insurtech|wealth ?tech|neobank|investment tech/i],
  ["Healthtech / Bio", /health ?tech|medtech|biotech|pharma|diagnostic|healthcare/i],
  ["Agritech", /agri|farm|food ?tech/i],
  ["SaaS / Enterprise", /saas|enterprise|dev ?tools|b2b software|productivity/i],
  ["D2C / Consumer", /d2c|consumer brand|ecommerce|fashion|beauty|\bfmcg\b/i],
  ["Gaming", /gaming|esports|game/i],
  ["Edtech", /edtech|education|learning/i],
  ["Logistics / Supply", /logistics|supply chain|mobility|delivery|e-?commerce enabler/i],
  ["Web3", /web3|crypto|blockchain|\bnft\b/i],
  ["Robotics", /robotic|automation/i],
];
export function themesOf(d: Pick<Deal, "sector" | "subsector" | "businessModel" | "company">): string[] {
  const hay = `${d.sector ?? ""} ${d.subsector ?? ""} ${d.company ?? ""}`;
  const hits = THEMES.filter(([, re]) => re.test(hay)).map(([t]) => t);
  return hits.length ? hits : [];
}

/** A comparable size in INR for the "largest raise" sort, using the live USD→INR rate; null-amount last. */
export function dealSizeInr(d: Deal, inrPerUsd: number | null): number | null {
  if (!d.amount) return null;
  if (d.amount.currency === "INR") return d.amount.value;
  return inrPerUsd ? d.amount.value * inrPerUsd : d.amount.value * 83; // sort-only fallback; the cell shows the source's own figure
}

/** Lowercased, legal-suffix-stripped key for matching a deal to the watchlist / book. */
export function dealNameKey(name: string): string {
  return name.toLowerCase()
    .replace(/\b(private|pvt|limited|ltd|llp|inc|technologies|technology|labs|solutions|india)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export type DealFilter = {
  from: string | null; to: string | null;
  sector: string | null; subsector: string | null;
  stageGroups: Set<string>; // empty = all
  themes: Set<string>;      // empty = all
  query: string;
};

export function filterDeals(deals: Deal[], f: DealFilter): Deal[] {
  const q = f.query.trim().toLowerCase();
  return deals.filter((d) => {
    if (f.from && d.date < f.from) return false;
    if (f.to && d.date > f.to) return false;
    if (f.sector && d.sector !== f.sector) return false;
    if (f.subsector && d.subsector !== f.subsector) return false;
    if (f.stageGroups.size && !f.stageGroups.has(d.stageGroup)) return false;
    if (f.themes.size) { const ts = themesOf(d); if (!ts.some((t) => f.themes.has(t))) return false; }
    if (q) {
      const hay = `${d.company} ${d.sector ?? ""} ${d.subsector ?? ""} ${d.investors.join(" ")} ${d.leadInvestor ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Distinct values with counts over a set of deals, for the facet dropdowns. */
export function facetCounts<T extends string>(deals: Deal[], pick: (d: Deal) => T[] | T | null): { value: T; count: number }[] {
  const m = new Map<T, number>();
  for (const d of deals) {
    const v = pick(d);
    const vs = Array.isArray(v) ? v : v == null ? [] : [v];
    for (const x of vs) m.set(x, (m.get(x) ?? 0) + 1);
  }
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

export function usePrivateDeals(): DealsState {
  const [state, setState] = useState<DealsState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch("/api/private-market-deals", { headers: { accept: "application/json" } });
        if (!active) return;
        if (r.status === 404) { setState({ status: "unavailable", reason: "The deal feed runs on the deployed site.", hint: "Open this on the live dashboard, where the research feed is served." }); return; }
        const d = await r.json().catch(() => null);
        if (!active) return;
        if (d && d.ok && Array.isArray(d.deals)) {
          setState({ status: "ready", deals: d.deals as Deal[], meta: { count: d.count, from: d.from, to: d.to, asOf: d.asOf, source: d.source } });
        } else {
          setState({ status: "unavailable", reason: "The deal feed could not be read right now.", hint: "Glow Central Research did not respond — try again in a moment." });
        }
      } catch {
        if (active) setState({ status: "unavailable", reason: "The deal feed could not be reached.", hint: "Check the connection and try again." });
      }
    })();
    return () => { active = false; };
  }, []);
  return state;
}
