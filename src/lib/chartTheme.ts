import type { CSSProperties } from "react";

export const chartTooltipStyle: CSSProperties = {
  background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)",
  borderRadius: 8, fontSize: 12, color: "var(--chart-tooltip-text)", boxShadow: "var(--chart-tooltip-shadow)",
};
export const chartTooltipLabelStyle: CSSProperties = { color: "var(--chart-tooltip-muted)", fontWeight: 500 };
export const chartTooltipItemStyle: CSSProperties = { color: "var(--chart-tooltip-text)" };

// Shared categorical palette (champagne-led, indigo accents). Use in order.
export const CHART_COLORS = [
  "#d9c48f", "#6366f1", "#10b981", "#e0709b", "#38bdf8",
  "#c3a962", "#818cf8", "#34d399", "#f59e0b", "#a78bfa",
  "#f87171", "#2dd4bf",
];
