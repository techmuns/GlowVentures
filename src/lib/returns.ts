// Per-entity money-weighted returns for the Family & Entities breakdown.
// These need dated inputs the base position model doesn't carry, so each
// function returns null (rendered as "—") until the upload supplies them:
//   • XIRR  — needs entityCashFlows (dated buys/sells/distributions).
//   • YTD   — needs entityNavHistory (a per-entity opening NAV for the FY).
import type { Portfolio } from "./types";
import { xirr } from "./xirr";
import { fyStartYear } from "./analytics";

// Annualized money-weighted return (XIRR) for one owning entity (keyed by the
// owner name from the account registry, not by an account code).
// Uses the entity's dated flows plus its current market value as the terminal
// (positive) flow at the portfolio's as-of date. Returns a percentage.
export function entityXirrPct(portfolio: Portfolio, owner: string, currentMV: number): number | null {
  const flows = portfolio.entityCashFlows?.[owner];
  if (!flows || flows.length === 0 || currentMV <= 0) return null;
  const dated = flows.map((f) => ({ date: new Date(f.date), amount: f.amount }));
  dated.push({ date: new Date(portfolio.asOf), amount: currentMV });
  const r = xirr(dated);
  return r == null ? null : r * 100;
}

// Financial-year-to-date return (1 Apr → as-of) for one owning entity, using the
// Simple Dietz method so mid-year contributions don't distort the figure.
// Returns a non-annualized percentage for the period.
export function entityYtdPct(portfolio: Portfolio, owner: string, currentMV: number): number | null {
  const nav = portfolio.entityNavHistory?.[owner];
  if (!nav || nav.length === 0 || currentMV <= 0) return null;
  const asOf = new Date(portfolio.asOf);
  const fyStart = new Date(fyStartYear(asOf), 3, 1); // 1 April of the current FY
  const opening = [...nav]
    .filter((n) => new Date(n.date) <= fyStart)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  if (!opening || opening.nav <= 0) return null;
  // Net capital contributed during the FY-to-date window (amount < 0 = capital in).
  const contrib = (portfolio.entityCashFlows?.[owner] ?? [])
    .filter((f) => { const d = new Date(f.date); return d > fyStart && d <= asOf; })
    .reduce((s, f) => s + (-f.amount), 0);
  const gain = currentMV - opening.nav - contrib;
  const base = opening.nav + contrib / 2;
  return base > 0 ? (gain / base) * 100 : null;
}
