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

type Cat = { key: string; label: string; icon: typeof Scale; samples: { sev: "high" | "med" | "low"; text: string }[] };

const CATEGORIES: Cat[] = [
  { key: "ips", label: "IPS", icon: Scale, samples: [
    { sev: "high", text: "Growth bucket 62% vs 60% max — exceeds allocation" },
    { sev: "low", text: "Hedge bucket 6% vs 6% target — in band" },
  ]},
  { key: "liquidity", label: "Liquidity", icon: Droplets, samples: [
    { sev: "med", text: "7-day liquidity coverage below 12-month threshold" },
    { sev: "low", text: "Cash buffer sufficient for next quarter's calls" },
  ]},
  { key: "manager", label: "Manager", icon: UserCog, samples: [
    { sev: "high", text: "Aristos: fund manager resigned" },
    { sev: "med", text: "GLC: AUM up 3× in 12 months — capacity risk" },
    { sev: "med", text: "Carnelian: style drift toward large-cap" },
  ]},
  { key: "macro", label: "Macro", icon: Globe2, samples: [
    { sev: "med", text: "India liquidity cycle deteriorating" },
    { sev: "low", text: "US 10Y crossed 4.3% — duration watch" },
  ]},
  { key: "private", label: "Private investment", icon: PhoneCall, samples: [
    { sev: "high", text: "Capital call due 20 Aug — ₹2.4 Cr" },
    { sev: "med", text: "Board meeting pending — portfolio co. review" },
  ]},
  { key: "proposal", label: "New proposal", icon: FilePlus2, samples: [
    { sev: "med", text: "Fresh commitment proposed — pending approval" },
    { sev: "low", text: "Check against current liquidity before sign-off" },
  ]},
];

const SEV_TONE: Record<string, string> = { high: "text-loss", med: "text-amber-400", low: "text-slate-400" };
const SEV_LABEL: Record<string, string> = { high: "High", med: "Medium", low: "Low" };

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

      {/* Preview alert categories */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((cat) => (
          <Card key={cat.key} className="preview-hatch" title={<span className="flex items-center gap-2 text-[13px]"><cat.icon className="h-4 w-4 text-slate-500" />{cat.label}</span>} right={<PreviewBadge />}>
            <ul className="space-y-2">
              {cat.samples.map((s) => (
                <li key={s.text} className="flex items-start gap-2 rounded-md border border-ink-700 bg-ink-800/60 p-2.5">
                  <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${s.sev === "high" ? "bg-red-500" : s.sev === "med" ? "bg-amber-400" : "bg-slate-500"}`} />
                  <div>
                    <div className="text-[12px] text-slate-300" title="Placeholder — not live data">{s.text}</div>
                    <span className={`text-[10px] font-medium ${SEV_TONE[s.sev]}`}>{SEV_LABEL[s.sev]} severity</span>
                  </div>
                </li>
              ))}
            </ul>
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
