import {
  Sunrise, LineChart, Users, PieChart, Receipt,
  Activity, History, Table2, Calculator, Gauge, Handshake, Cable,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * ── WHERE EVERY PAGE SITS, DECLARED ONCE ────────────────────────────────────
 *
 * This table was private to `Sidebar.tsx` for as long as the nav was the only
 * surface that stated where a page lives. It is not any more: every page now
 * carries a crumb naming its own place (see `PageNav`), and two tables would be
 * two chances for the crumb to file a page under a group the sidebar puts
 * somewhere else — the failure this repo has extracted `holdingBucket`,
 * `costCoversSet` and `companyExposure` for, arriving through a label.
 *
 * So the sidebar and the crumb read ONE declaration. Moving it here also
 * retired four STALE eyebrows that had been claiming a group each page had
 * since left: Data Audit said "Setup" while the nav said Admin, and Capital
 * Gains, NAV & Performance, Return & Drawdown and Ledger Insights each said
 * "Tax & Income" or "Analytics" while the nav said Extras. Those strings were
 * typed per page, which is exactly why they could drift.
 */
const EXTRAS = "Extras";

export type NavEntry = { to: string; label: string; icon: LucideIcon; group: string };

export const NAV: readonly NavEntry[] = [
  // ── DAILY, IN THE ORDER THE FAMILY ASKED FOR ────────────────────────────
  // *"change the hierarchy of these pages, Morning CIO then Portfolio Monitor
  // and then Private Market and then Polycab"*. Polycab led this group until
  // now, on an earlier request; it closes it instead. Nothing about the
  // ring-fence moves with it — the promoter holding is still kept out of every
  // other route's figures by `RINGFENCED_SECURITY_KEYS` in build-book.mjs, and
  // a nav position was never what enforced that.
  { to: "/cio", label: "Morning CIO", icon: Sunrise, group: "Daily" },
  { to: "/monitor", label: "Portfolio Monitor", icon: LineChart, group: "Daily" },
  { to: "/private-market", label: "Private Market", icon: Handshake, group: "Daily" },
  { to: "/polycab", label: "Polycab", icon: Cable, group: "Daily" },
  // EXPOSURE & IPS was REMOVED at the family's request. Its ALLOCATION group
  // survives with the other two entries, so — unlike MONITOR, KNOWLEDGE and
  // RESEARCH — there is no heading to go with it. See App.tsx for where the
  // address forwards and what became a no-caller.
  { to: "/family", label: "Family & Entities", icon: Users, group: "Allocation" },
  { to: "/sectors", label: "Sector Composition", icon: PieChart, group: "Allocation" },
  { to: "/capital-gains", label: "Capital Gains & Tax", icon: Receipt, group: EXTRAS },
  { to: "/performance", label: "NAV & Performance", icon: Activity, group: EXTRAS },
  { to: "/returns", label: "Return & Drawdown", icon: Gauge, group: EXTRAS },
  { to: "/ledger", label: "Ledger Insights", icon: Calculator, group: EXTRAS },
  // ── ADMIN CLOSES THE NAV, AND DATA AUDIT IS NOW IN IT ───────────────────
  // *"move data audit page at the bottom of the left navigation bar just above
  // upload page selection button rather than at the top"*. It was the only
  // entry in SETUP, so that heading goes with it by the derivation below — a
  // group label standing over nothing is the defect this repo already records
  // twice.
  { to: "/audit", label: "Data Audit", icon: Table2, group: "Admin" },
  { to: "/history", label: "Upload History", icon: History, group: "Admin" },
];

export const EXTRAS_GROUP = EXTRAS;

/**
 * DERIVED, NEVER TYPED. The dropdown opens itself when the reader navigates to
 * a route inside it — otherwise someone landing on /performance from a link or
 * a bookmark sees no active entry anywhere in the nav, which reads as the page
 * having left the app. Reading the set off `NAV` means a fifth entry added to
 * Extras keeps that working with no second list to remember.
 */
export const EXTRAS_PATHS: ReadonlySet<string> = new Set(
  NAV.filter((i) => i.group === EXTRAS).map((i) => i.to),
);

/** The nav entry serving a pathname, or null for a page the nav does not list. */
export function navEntry(pathname: string): NavEntry | null {
  return NAV.find((i) => i.to === pathname) ?? null;
}
