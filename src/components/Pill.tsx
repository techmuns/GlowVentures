import { ReactNode } from "react";

type Tone = "default" | "info" | "gain" | "loss" | "warn" | "core" | "satellite";

const TONE: Record<Tone, string> = {
  default: "border-ink-600 bg-ink-700/60 text-slate-300",
  info: "border-accent-500/30 bg-accent-500/10 text-accent-400",
  gain: "border-gain/30 bg-gain/10 text-gain",
  loss: "border-loss/30 bg-loss/10 text-loss",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  core: "border-champagne-500/30 bg-champagne-500/10 text-champagne-400",
  satellite: "border-accent-500/30 bg-accent-500/10 text-accent-400",
};

export function Pill({ children, tone = "default", icon, className = "" }: {
  children: ReactNode; tone?: Tone; icon?: ReactNode; className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[tone]} ${className}`}>
      {icon}{children}
    </span>
  );
}
