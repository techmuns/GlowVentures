/**
 * ── WHAT AN ALERT LOOKS LIKE, DEFINED ONCE ──────────────────────────────────
 *
 * The stock page's alert boxes and Morning CIO's All alerts table draw the same
 * five kinds, and a Stop loss that is red on one page and amber on the other is
 * a reader learning two colour codes for one thing. So the colour of each kind,
 * the words for how far a price is from its level and the words for where the
 * price came from all live here.
 *
 * EVERY COLOUR IS ONE THE LIGHT THEME ALREADY REMAPS — `gain`, `loss`,
 * `amber-400`, `champagne-400` and slate. A new utility would need its own
 * light-mode rule in `index.css` (CLAUDE.md: every new ink or slate utility
 * needs a light-mode remap), and an alert is the last thing that should turn
 * unreadable on the ivory page.
 *
 *   Buy at     green  — the price has come down to where the family would add
 *   Sell at    amber  — it has risen to where they would take money off
 *   Stop loss  red    — it has fallen through the level they wanted warning of
 *   Target     gold   — it has reached where they thought it would get to
 *   Above      grey   — a plain level, kept for alerts set before the others
 */
import { Bell } from "lucide-react";
import { ALERT_DEF, type AlertKind, type AlertStatus, type LevelCheck, type PriceNow } from "@/lib/priceAlerts";
import { fmtPct } from "@/lib/format";

export const KIND_TONE: Record<AlertKind, { text: string; dot: string; pill: string; tint: string; border: string }> = {
  entry: { text: "text-gain", dot: "bg-gain", pill: "border-gain/30 bg-gain/10 text-gain", tint: "bg-gain/[0.07]", border: "border-gain/40" },
  exit: { text: "text-amber-400", dot: "bg-amber-500", pill: "border-amber-500/30 bg-amber-500/10 text-amber-400", tint: "bg-amber-500/[0.07]", border: "border-amber-500/40" },
  below: { text: "text-loss", dot: "bg-loss", pill: "border-loss/30 bg-loss/10 text-loss", tint: "bg-loss/[0.07]", border: "border-loss/40" },
  target: { text: "text-champagne-400", dot: "bg-champagne-500", pill: "border-champagne-500/30 bg-champagne-500/10 text-champagne-400", tint: "bg-champagne-500/[0.07]", border: "border-champagne-500/40" },
  above: { text: "text-slate-300", dot: "bg-slate-400", pill: "border-ink-600 bg-ink-700/60 text-slate-300", tint: "bg-ink-700/40", border: "border-ink-600" },
};

/** The alert's kind, as a coloured chip — "Stop loss", "Buy at". */
export function KindPill({ kind }: { kind: AlertKind }) {
  return (
    <span data-alert-kind-pill={kind}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${KIND_TONE[kind].pill}`}>
      {ALERT_DEF[kind].label}
    </span>
  );
}

/**
 * How far the price is from the level, in the words an investor uses:
 * "↓ 12.1% to go" while watching (the arrow is the way it has to move), and
 * "2.6% past" once reached. Null where there is no price to measure from —
 * the caller renders that absence with its reason.
 */
export function distanceText(c: LevelCheck, dir: "down" | "up"): string | null {
  if (c.status === "reached" && c.pastPct !== null) {
    return c.pastPct < 0.05 ? "right at your level" : `${fmtPct(c.pastPct, { decimals: 1 })} past`;
  }
  if (c.status === "watching" && c.toGoPct !== null) {
    return `${dir === "down" ? "↓" : "↑"} ${fmtPct(c.toGoPct, { decimals: 1 })} to go`;
  }
  return null;
}

/** "9 Sep" — a NAV's publication day, which is the whole of its freshness. */
export const shortDay = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** Where the price being checked came from, in two or three words. */
export function priceSource(now: PriceNow): string {
  if (now.state === "live") return "live";
  if (now.state === "nav") return now.asOf ? `NAV · ${shortDay(now.asOf)}` : "NAV";
  if (now.state === "checking") return "checking…";
  return "no live price";
}

/**
 * The one-word state of an alert. A REACHED alert says WHICH alert it is —
 * "Stop loss hit", "Buy level reached" — with a bell, in its kind's colour,
 * because that is the line a reader scanning the table has to catch.
 */
export function AlertStatusText({ status, kind, reason }: { status: AlertStatus; kind: AlertKind; reason?: string }) {
  if (status === "reached") {
    return (
      <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${KIND_TONE[kind].text}`}>
        <Bell className="h-3.5 w-3.5" aria-hidden />{ALERT_DEF[kind].reached}
      </span>
    );
  }
  if (status === "watching") return <span className="whitespace-nowrap text-slate-400">Watching</span>;
  if (status === "checking") return <span className="whitespace-nowrap text-slate-500">Checking price…</span>;
  return <span className="whitespace-nowrap text-slate-500" title={reason}>Not checked — no live price</span>;
}
