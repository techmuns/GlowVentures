import { useEffect, useState } from "react";
import { Star, AlertTriangle } from "lucide-react";
import { Card } from "@/components/Card";
import { AbsentCell } from "@/components/Absent";
import { fmtPct, changeColor } from "@/lib/format";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  readEntry, writeEntry, firedAlerts, upsidePct, ALERT_WORDING,
  type WatchEntry,
} from "@/lib/watchlist";

// INVESTMENT TOOLS — the client spec's watchlist, target price, fair value,
// entry / exit price and price alerts, for one security.
//
// This is the only panel in the cockpit a reader WRITES to, and everything about
// it is deliberately kept apart from the book. `glowData.ts` is generated from
// `source/` and regenerates byte-identically; a judgement about what a share is
// worth is not a statement figure and must never end up in there.
//
// A price nobody has set is BLANK and reads as absent, not as zero. That matters
// more here than anywhere: a target of 0 would render as a real number and make
// every holding look 100% overvalued, which is a fabricated figure produced by a
// default — the exact failure this codebase is built to prevent.

const FIELDS: { key: keyof WatchEntry; label: string; hint: string }[] = [
  { key: "targetPrice", label: "Target price", hint: "Where we think this gets to. Drives the upside figure below." },
  { key: "fairValue", label: "Fair value", hint: "What we think it is worth today, independent of the market price." },
  { key: "entryPrice", label: "Entry price", hint: "The level at which we would add." },
  { key: "exitPrice", label: "Exit price", hint: "The level at which we would sell." },
  { key: "alertAbove", label: "Alert above", hint: "Flag when the live price reaches or passes this." },
  { key: "alertBelow", label: "Alert below", hint: "Flag when the live price falls to or through this." },
];

/** Parses a typed price. Blank means NOT SET — never zero. */
const parsePrice = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function InvestmentTools({ securityKey, name, price, priceIsLive }: {
  securityKey: string;
  name: string;
  /** The current mark, live or from the statement. Null when there is none. */
  price: number | null;
  priceIsLive: boolean;
}) {
  const { fmtFromBase } = usePortfolio();
  const [entry, setEntry] = useState<WatchEntry>(() => readEntry(securityKey));
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const e = readEntry(securityKey);
    setEntry(e);
    setDraft({});
  }, [securityKey]);

  const save = (next: WatchEntry) => {
    writeEntry(next);
    setEntry(readEntry(securityKey));
  };

  const fieldValue = (k: keyof WatchEntry) => {
    if (k in draft) return draft[k as string];
    const v = entry[k];
    return typeof v === "number" ? String(v) : "";
  };

  const commit = (k: keyof WatchEntry, raw: string) => {
    setDraft((d) => { const { [k as string]: _drop, ...rest } = d; return rest; });
    save({ ...entry, [k]: parsePrice(raw) } as WatchEntry);
  };

  const upside = upsidePct(price, entry.targetPrice);
  const alerts = firedAlerts(entry, price);

  return (
    <Card
      className="mt-5"
      title="Investment tools"
      subtitle={<>Our own view on {name} — a target, a fair value, the levels we would act at. These are judgements, not statement figures, and they are stored in this browser only.</>}
      right={
        <button
          type="button"
          onClick={() => save({ ...entry, watching: !entry.watching })}
          aria-pressed={entry.watching}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
            entry.watching
              ? "border-champagne-400/50 bg-champagne-400/10 text-champagne-400"
              : "border-ink-600/70 text-slate-400 hover:text-slate-200"
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${entry.watching ? "fill-current" : ""}`} />
          {entry.watching ? "On watchlist" : "Add to watchlist"}
        </button>
      }
    >
      {alerts.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
          {alerts.map((a) => (
            <div key={a.kind} className="flex items-start gap-2 text-[12px] text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {ALERT_WORDING[a.kind]} — {fmtFromBase(a.threshold)} set, {fmtFromBase(a.price)} now
                {priceIsLive ? "" : " (on the statement mark, not a live price)"}.
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={String(f.key)} className="block">
            <span className="label-xs block text-slate-400" title={f.hint}>{f.label}</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="not set"
              value={fieldValue(f.key)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key as string]: e.target.value }))}
              onBlur={(e) => commit(f.key, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="mono mt-1 w-full rounded-md border border-ink-600/70 bg-ink-800/40 px-2.5 py-1.5 text-[13px] text-slate-200 placeholder:text-slate-600 focus:border-champagne-400/50 focus:outline-none"
            />
          </label>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="label-xs block text-slate-400" title="The spec's second question: why do we own it?">Why we own it</span>
        <textarea
          rows={3}
          placeholder="Thesis, expected return, risk, exit triggers, who proposed it…"
          value={"note" in draft ? draft.note : entry.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          onBlur={(e) => {
            setDraft((d) => { const { note: _drop, ...rest } = d; return rest; });
            save({ ...entry, note: e.target.value });
          }}
          className="mt-1 w-full rounded-md border border-ink-600/70 bg-ink-800/40 px-2.5 py-2 text-[13px] leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-champagne-400/50 focus:outline-none"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink-700/70 pt-3 text-[12px]">
        <span className="text-slate-500">
          Upside to target:{" "}
          {upside === null
            ? <AbsentCell reason={entry.targetPrice === null ? "no target price set" : "no current price to measure from"} />
            : <span className={`mono ${changeColor(upside)}`}>{fmtPct(upside, { sign: true, decimals: 1 })}</span>}
        </span>
        <span className="text-slate-500">
          Fair value vs price:{" "}
          {entry.fairValue === null || price === null
            ? <AbsentCell reason={entry.fairValue === null ? "no fair value set" : "no current price"} />
            : <span className={`mono ${changeColor(entry.fairValue - price)}`}>
                {fmtFromBase(entry.fairValue - price, { sign: true })}
              </span>}
        </span>
        <span className="ml-auto text-slate-600">
          {entry.updatedAt ? `Last edited ${new Date(entry.updatedAt).toLocaleString("en-IN")}` : "Nothing recorded yet"}
        </span>
      </div>
    </Card>
  );
}
