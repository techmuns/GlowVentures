import { useMemo, useState } from "react";
import {
  BellRing, AlertTriangle, Scale, Droplets, UserCog, Globe2, PhoneCall, FilePlus2, Settings2,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { PreviewBadge, PreviewPill } from "@/components/Preview";
import { usePortfolio } from "@/context/PortfolioContext";
import { readWatchlist, firedAlerts, ALERT_WORDING } from "@/lib/watchlist";

// LAYER 5 — ALERT SYSTEM (FOOS spec). IPS, liquidity, manager, macro, private-
// investment and new-proposal alerts.
//
// MIXED. Price-level alerts are REAL: they fire from the watchlist against live
// prices (set them on a holding's company page). Every other category needs a
// rules engine plus data the book does not carry — those are PREVIEW.

/**
 * WHAT EACH ALERT CATEGORY WOULD WATCH — NOT SAMPLE ALERTS THAT HAVE FIRED.
 *
 * These were written as illustrative alert TEXT, and three of them named a real
 * manager and asserted a real event: "Aristos: fund manager resigned" at high
 * severity, "Carnelian: style drift toward large-cap", "GLC: AUM up 3x in 12
 * months". Aristos is the strategy SVAN runs for two of this family's accounts,
 * Carnelian and Green Lantern manage two more; between them that is ₹78 Cr of
 * this book.
 *
 * A GREYED NUMBER READS AS ILLUSTRATIVE; A FACTUAL CLAIM DOES NOT. A reader who
 * sees a red high-severity line saying their fund manager resigned has learnt
 * something, and no amount of badge or hatch unlearns it — the sentence is
 * either true or it is not, and this one was invented to fill a layout. That is
 * the standing rule's own words: nothing on screen may be hardcoded that isn't
 * derived from the book, and no entity names or dates among them.
 *
 * So each category now states the CONDITION it would evaluate. A rule is a
 * description of the page's own logic, true whether or not it has ever fired,
 * and it shows the client the same layout without asserting anything about
 * anyone. Real price alerts, which the watchlist genuinely fires, render above
 * these from live data.
 */
type Cat = { key: string; label: string; icon: typeof Scale; rules: string[] };

const CATEGORIES: Cat[] = [
  { key: "ips", label: "IPS", icon: Scale, rules: [
    "A bucket's actual weight leaves its IPS band",
    "Drift from the target allocation exceeds the rebalancing threshold",
  ]},
  { key: "liquidity", label: "Liquidity", icon: Droplets, rules: [
    "Liquidity coverage falls below the horizon set in the IPS",
    "The cash buffer no longer covers the next period's committed calls",
  ]},
  { key: "manager", label: "Manager", icon: UserCog, rules: [
    "A mandate's key personnel change, as disclosed by the manager",
    "A mandate's AUM grows past its stated capacity",
    "A mandate's holdings drift outside its stated style or market cap",
  ]},
  { key: "macro", label: "Macro", icon: Globe2, rules: [
    "A tracked policy rate, yield or currency crosses a level the family set",
    "A macro series the family watches breaks its trend",
  ]},
  { key: "private", label: "Private investment", icon: PhoneCall, rules: [
    "A drawdown fund issues a capital call against an undrawn commitment",
    "A portfolio company schedules a board meeting or reports a round",
  ]},
  { key: "proposal", label: "New proposal", icon: FilePlus2, rules: [
    "A new commitment is proposed and awaits approval",
    "A proposal is checked against current liquidity before sign-off",
  ]},
];


export function Alerts() {
  const { portfolio, fmtFromBase } = usePortfolio();
  const [watchlist] = useState(() => readWatchlist());

  // Real fired price alerts from the watchlist against current prices.
  const priceAlerts = useMemo(() => {
    if (!portfolio) return [];
    const byKey = new Map<string, number | null>();
    for (const p of portfolio.positions) if (!byKey.has(p.securityKey)) byKey.set(p.securityKey, p.currentPrice ?? null);
    return Object.values(watchlist).flatMap((entry) => {
      const price = byKey.get(entry.securityKey) ?? null;
      const security = portfolio.positions.find((p) => p.securityKey === entry.securityKey)?.security ?? entry.securityKey;
      return firedAlerts(entry, price).map((a) => ({ ...a, security }));
    });
  }, [portfolio, watchlist]);

  if (!portfolio) return null;

  return (
    <div>
      <PageHeader
        eyebrow="Monitor · Layer 5"
        title="Alerts"
        subtitle="IPS, liquidity, manager, macro, private-investment and new-proposal alerts — one place to see what needs attention."
        right={
          <span className="inline-flex items-center gap-2">
            <Pill tone="info">price alerts live</Pill>
            <PreviewBadge label="Preview · other categories" />
          </span>
        }
      />

      {/* Real price alerts */}
      <Card className="mb-5" title={<span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-champagne-400" /> Price alerts</span>}
        subtitle="Live — fired from your watchlist against current prices" right={<Pill tone="info">live</Pill>}>
        {priceAlerts.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-slate-500">
            No price alert has tripped. Price alerts are real and populate here automatically — set an{" "}
            <span className="text-slate-300">alert above / below</span> on any holding via Investment tools on its
            company page, and it will fire here against the live price.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {priceAlerts.map((a, i) => (
              <li key={`${a.securityKey}-${a.kind}-${i}`} className="flex items-start gap-2 text-[12.5px] text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><strong className="text-slate-200">{a.security}</strong> — {ALERT_WORDING[a.kind]}: {fmtFromBase(a.threshold)} set, {fmtFromBase(a.price)} now.</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* What each category WOULD watch. Conditions, not fired alerts — see the
          note on CATEGORIES for why an invented alert text is not a placeholder. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((cat) => (
          <Card key={cat.key} className="preview-hatch"
            title={<span className="flex items-center gap-2 text-[13px]"><cat.icon className="h-4 w-4 text-slate-500" />{cat.label}</span>}
            subtitle="Conditions this category would watch"
            right={<PreviewBadge label="Not wired" />}>
            <ul className="space-y-2">
              {cat.rules.map((r) => (
                <li key={r} className="flex items-start gap-2 rounded-md border border-ink-700 bg-ink-800/60 p-2.5">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
                  <div className="text-[12px] leading-snug text-slate-400">{r}</div>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[10.5px] text-slate-500">
              No alert of this kind has fired — nothing evaluates these yet.
            </p>
          </Card>
        ))}
      </div>

      {/* Rules config — preview */}
      <Card className="mt-5 preview-hatch" title={<span className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-champagne-400" /> Alert rules</span>}
        subtitle="Thresholds the alert engine would watch" right={<PreviewBadge />}>
        <div className="flex flex-wrap gap-2">
          {["Growth bucket ≤ 60%", "Liquidity coverage ≥ 12 mo", "Single stock ≤ 8%", "Manager AUM growth ≤ 2×/yr",
            "Capital call ≥ 7 days notice", "New proposal → approval flow"].map((r) => (
            <PreviewPill key={r}>{r}</PreviewPill>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">Each rule needs a store plus a rules engine; only the price-level half is live today.</p>
      </Card>
    </div>
  );
}
