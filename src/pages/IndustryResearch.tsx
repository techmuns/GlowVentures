import { useState } from "react";
import {
  Factory, Boxes, Gauge, ClipboardList, Newspaper, Landmark, FileText, Sparkles, TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { PreviewBanner, PreviewBadge, PreviewNum, PreviewChart, previewTile } from "@/components/Preview";

// LAYER 2 · INDUSTRY RESEARCH (FOOS spec) — a dedicated dashboard per industry:
// structure (size, capacity, utilisation, order book), economics (raw material,
// pricing power, realisations) and intelligence (news, policy, AI summary). No
// industry endpoint exists in the catalogue, so the whole page is a preview.

const INDUSTRIES = ["Cement", "Steel", "PVC Resin", "Fertilisers", "Coal", "Electricity", "Crude Derivatives"] as const;
type Industry = (typeof INDUSTRIES)[number];

// Per-industry sample figures, so switching tabs shows plausibly different numbers.
const STRUCTURE: Record<Industry, { size: string; growth: string; capacity: string; util: string }> = {
  Cement: { size: "₹2.8 L Cr", growth: "+7.4%", capacity: "620 mtpa", util: "71%" },
  Steel: { size: "₹9.1 L Cr", growth: "+5.2%", capacity: "161 mtpa", util: "83%" },
  "PVC Resin": { size: "₹38,400 Cr", growth: "+9.1%", capacity: "1.6 mtpa", util: "68%" },
  Fertilisers: { size: "₹1.4 L Cr", growth: "+3.8%", capacity: "48 mtpa", util: "79%" },
  Coal: { size: "₹1.9 L Cr", growth: "+6.0%", capacity: "1,040 mt", util: "88%" },
  Electricity: { size: "₹12.6 L Cr", growth: "+8.3%", capacity: "446 GW", util: "64%" },
  "Crude Derivatives": { size: "₹6.7 L Cr", growth: "+4.5%", capacity: "254 mmtpa", util: "92%" },
};

const ECONOMICS: Record<Industry, { name: string; value: string; chg: string }[]> = {
  Cement: [
    { name: "Realisation / bag", value: "₹385", chg: "+3.1%" },
    { name: "Pet coke cost", value: "₹12,400/t", chg: "-4.2%" },
    { name: "Freight cost", value: "₹1.14/t-km", chg: "+1.8%" },
    { name: "Pricing power", value: "Improving", chg: "" },
  ],
  Steel: [
    { name: "HRC realisation", value: "₹54,200/t", chg: "-2.6%" },
    { name: "Coking coal", value: "$248/t", chg: "-6.1%" },
    { name: "Iron ore (dom.)", value: "₹6,100/t", chg: "+2.3%" },
    { name: "Spread", value: "₹18,900/t", chg: "-3.4%" },
  ],
  "PVC Resin": [
    { name: "PVC-EDC delta", value: "$420/t", chg: "+5.4%" },
    { name: "Import parity", value: "₹78,400/t", chg: "-1.9%" },
    { name: "Utilisation", value: "68%", chg: "+2.0pp" },
    { name: "Pricing power", value: "Weak", chg: "" },
  ],
  Fertilisers: [
    { name: "Urea realisation", value: "₹5,360/t", chg: "+0.8%" },
    { name: "Gas cost", value: "$11.2/mmbtu", chg: "-3.1%" },
    { name: "Subsidy o/s", value: "₹41,200 Cr", chg: "+6.4%" },
    { name: "Pricing power", value: "Regulated", chg: "" },
  ],
  Coal: [
    { name: "E-auction premium", value: "+38%", chg: "-4.0pp" },
    { name: "Notified price", value: "₹1,540/t", chg: "0%" },
    { name: "Rake availability", value: "412/day", chg: "+2.1%" },
    { name: "Pricing power", value: "Strong", chg: "" },
  ],
  Electricity: [
    { name: "Merchant tariff", value: "₹4.6/kWh", chg: "+7.2%" },
    { name: "PLF (thermal)", value: "69%", chg: "+1.4pp" },
    { name: "Short-term volume", value: "182 BU", chg: "+9.0%" },
    { name: "Pricing power", value: "Improving", chg: "" },
  ],
  "Crude Derivatives": [
    { name: "GRM (Singapore)", value: "$6.8/bbl", chg: "-1.2%" },
    { name: "Naphtha crack", value: "-$4.1/bbl", chg: "+0.6%" },
    { name: "Petchem spread", value: "$118/t", chg: "-8.4%" },
    { name: "Pricing power", value: "Moderate", chg: "" },
  ],
};

const NEWS: Record<Industry, string[]> = {
  Cement: ["Leading players announce ₹15–20/bag price hike across South", "Fresh 12 mtpa capacity commissioned in East", "Input costs ease as pet coke corrects"],
  Steel: ["Govt weighs safeguard duty on cheap imports", "NMDC raises lump ore prices", "Auto & infra demand keeps volumes firm"],
  "PVC Resin": ["Anti-dumping review initiated on imports", "New cracker delayed to next FY", "Agri-pipe demand recovers post-monsoon"],
  Fertilisers: ["Nutrient-based subsidy revised for Kharif", "Gas pooling policy under review", "Complex fertiliser volumes up on good rains"],
  Coal: ["Coal India raises FY output target", "E-auction premiums normalise", "Rail evacuation capacity expanded"],
  Electricity: ["Peak demand hits record; merchant tariffs firm", "Renewable bids see tighter spreads", "Discom dues under revised late-payment rules"],
  "Crude Derivatives": ["Regional GRMs soften on new capacity", "Petchem margins under pressure from China", "Retail fuel marketing margins expand"],
};

export function IndustryResearch() {
  const [industry, setIndustry] = useState<Industry>("Cement");
  const s = STRUCTURE[industry];

  return (
    <div>
      <PageHeader
        eyebrow="Research · Layer 2"
        title="Industry Research"
        subtitle="A dedicated dashboard per industry — structure, economics and intelligence, with an AI-generated industry summary."
        right={<PreviewBadge />}
      />

      <PreviewBanner source="an industry-data feed and an AI research layer" layer="FOOS Layer 2 · Industry">
        There is no industry endpoint in the catalogue — industry size, capacity, utilisation, order books and raw
        material prices all need a dedicated source.
      </PreviewBanner>

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {INDUSTRIES.map((ind) => {
          const active = industry === ind;
          return (
            <button key={ind} onClick={() => setIndustry(ind)}
              className={["rounded-md border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.97]",
                active ? "border-champagne-500/40 bg-champagne-500/10 text-champagne-400" : "border-ink-700 bg-ink-800/60 text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
              {ind}
            </button>
          );
        })}
      </div>

      {/* Structure */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Industry size" {...previewTile(s.size, "annual, domestic")} icon={<Boxes className="h-4 w-4" />} />
        <StatTile label="Growth rate" {...previewTile(s.growth, "YoY")} icon={<TrendingUp className="h-4 w-4" />} />
        <StatTile label="Capacity" {...previewTile(s.capacity, "installed")} icon={<Factory className="h-4 w-4" />} />
        <StatTile label="Capacity utilisation" {...previewTile(s.util, "sector average")} icon={<Gauge className="h-4 w-4" />} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        {/* Economics + order book */}
        <Card className="preview-hatch" title={<span className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-champagne-400" /> Industry economics</span>}
          subtitle="Raw material, input costs, realisations & pricing power" right={<PreviewBadge />}>
          <ul className="space-y-2.5">
            {ECONOMICS[industry].map((r) => (
              <li key={r.name} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="text-slate-400">{r.name}</span>
                <span className="flex items-center gap-1.5">
                  <PreviewNum>{r.value}</PreviewNum>
                  {r.chg && <span className="text-[10px] text-slate-600" title="Placeholder — not live data">{r.chg}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-ink-700/70 pt-3">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-slate-400">Order book</span><PreviewNum>₹94,200 Cr</PreviewNum>
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px]">
              <span className="text-slate-400">Order inflows (QoQ)</span><PreviewNum>+8.2%</PreviewNum>
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px]">
              <span className="text-slate-400">Capacity additions (12m)</span><PreviewNum>+6.4%</PreviewNum>
            </div>
          </div>
        </Card>

        {/* Trend chart */}
        <Card className="lg:col-span-2 preview-hatch" title="Realisations & margins" subtitle="Historical time-series with adjustable periods and overlays" right={<PreviewBadge />}>
          <div className="h-56"><PreviewChart kind="area" height={220} /></div>
        </Card>
      </div>

      {/* Intelligence */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-2 preview-hatch" title={<span className="flex items-center gap-2"><Newspaper className="h-4 w-4 text-champagne-400" /> Industry intelligence</span>}
          subtitle="Industry news, government policies and reports" right={<PreviewBadge />}>
          <ul className="space-y-2">
            {NEWS[industry].map((n) => (
              <li key={n} className="flex items-start gap-2 rounded-md border border-ink-700 bg-ink-800/60 p-2.5 text-[12.5px] text-slate-300" title="Placeholder — not live data">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />{n}
              </li>
            ))}
            <li className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
              <Landmark className="h-3.5 w-3.5" /> Government policy tracker & industry reports would appear here.
            </li>
          </ul>
        </Card>

        <Card className="preview-hatch" title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-champagne-400" /> AI industry summary</span>} right={<PreviewBadge />}>
          <p className="text-[12.5px] leading-relaxed text-slate-400" title="Placeholder — not live data">
            {industry} demand is running ahead of the broader economy, with utilisation improving and pricing power
            {" "}firming into the second half. Input costs have eased, supporting spreads, though incremental capacity
            {" "}over the next 12–18 months could cap the upcycle. Watch order inflows and realisations for the turn.
          </p>
          <p className="mt-3 text-[11px] text-slate-500">A 3–4 line AI synthesis of the structure, economics and news above.</p>
        </Card>
      </div>
    </div>
  );
}
