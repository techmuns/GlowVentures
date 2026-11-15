/**
 * ── CLASSIFICATION TIE-OUT (#374) ───────────────────────────────────────────
 *
 *   "there should be a reconciliation so we can SEE that the category / asset
 *    class / basket breakdowns actually add back to the book."
 *
 * Every allocation view slices the SAME holdings a different way — by category,
 * by the family's own asset classes, by basket — and `groupAxis.ts` is the one
 * place that decides which section a holding sits in on each. That file notes,
 * at its head: *"Measured on this book, all three axes sum to
 * `BOOK_SUMMARY.totalValue` to the rupee."* This panel is that guarantee made
 * VISIBLE on the Data Audit page, rather than only asserted in a test.
 *
 * It is NOT a second value model. It groups the EXACT set `BOOK_SUMMARY` is
 * summed from — `dedupedPositions(BOOK_POSITIONS)`, each `dedupeGroup` counted
 * once, Polycab already ring-fenced out of `BOOK_POSITIONS` — so a sum that
 * failed to match the book headline would be a real classifier defect, not a
 * rounding of ours. The tie is checked against `BOOK_SUMMARY.totalValue` itself,
 * the independently-built headline, so the app's dedupe and the build's headline
 * are cross-checked here too.
 *
 * The honest, non-vacuous content is per axis: the group count, and any amount
 * that landed in the family's "Not classified" section (basket and asset class
 * can carry one; the category axis is derived from the book and never does). A
 * residual is NAMED, never hidden — the same rule the Sector "Unclassified" cut
 * (#405) was held to.
 *
 * Whole book, statement basis — no member scope and no live quotes — because the
 * Data Audit record reconciles the canonical book, exactly as the consolidated
 * sheet above it does. Figures are shown in the reader's display currency.
 */
import { useMemo } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { BOOK_SUMMARY, BOOK_POSITIONS, BOOK_ACCOUNTS } from "@/data/glowData";
import { dedupedPositions } from "@/lib/analytics";
import { accountIndex } from "@/lib/accounts";
import { GROUP_VIEWS, groupKeyFor, groupLabelFor, groupOrdFor, groupCount } from "@/lib/groupAxis";
import { UNCLASSIFIED } from "@/lib/familyTaxonomy";
import { AbsentSection } from "@/components/Absent";
import type { Position } from "@/lib/types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const mv = (p: Position) => (Number.isFinite(p.marketValue) ? (p.marketValue as number) : 0);

export function ClassificationTieOut() {
  const { fmtFromBase, bookIsEmpty } = usePortfolio();
  // Compact figures, but a non-zero amount must never read as “₹0”: a sub-₹0.50
  // residue (a redeemed-to-nil speck with no basket) is real, so fall back to the
  // exact figure rather than let compact rounding print it as nothing.
  const money = (v: number) => {
    const compact = fmtFromBase(v, { compact: true });
    return v !== 0 && compact === fmtFromBase(0, { compact: true }) ? fmtFromBase(v) : compact;
  };

  const model = useMemo(() => {
    const deduped = dedupedPositions(BOOK_POSITIONS);
    const idx = accountIndex(BOOK_ACCOUNTS);
    const total = r2(deduped.reduce((s, p) => s + mv(p), 0));
    const axes = GROUP_VIEWS.map((view) => {
      const sums = new Map<string, number>();
      for (const p of deduped) {
        const key = groupKeyFor(view.key, idx, p);
        sums.set(key, (sums.get(key) ?? 0) + mv(p));
      }
      const label = groupLabelFor(view.key);
      const ord = groupOrdFor(view.key);
      // Raw sums, never rounded before adding — the axis total is then the SAME
      // arithmetic the book headline is: `r2(Σ marketValue)` over the same set,
      // so a mismatch is a classifier defect, not a double-rounding of ours.
      const groups = [...sums.entries()]
        .map(([key, value]) => ({ key, label: label(key), value, unplaced: key === UNCLASSIFIED }))
        .sort((a, b) => ord(a.key) - ord(b.key) || b.value - a.value);
      const sum = groups.reduce((s, g) => s + g.value, 0);
      const unclassified = groups.filter((g) => g.unplaced).reduce((s, g) => s + g.value, 0);
      return {
        key: view.key, name: view.label, title: view.title, groups,
        // The count names real sections; the "Not classified" group is the
        // absence of one, so it is excluded (and named in its own amber row).
        groupsN: groups.filter((g) => !g.unplaced).length, sum, unclassified,
        ties: Math.abs(r2(sum) - BOOK_SUMMARY.totalValue) < 0.01,
        diff: r2(sum - BOOK_SUMMARY.totalValue),
      };
    });
    return { count: deduped.length, total, axes };
  }, []);

  if (bookIsEmpty || model.count === 0)
    return (
      <div className="mt-8 border-t border-ink-700 pt-4">
        <AbsentSection what="the classification tie-out" needs="the book to carry at least one holding" />
      </div>
    );

  return (
    <section className="mt-8 border-t border-ink-700 pt-4" data-xa="classification-tieout">
      <h2 className="text-sm font-semibold text-slate-200">Classification tie-out</h2>
      <p data-prose-ok="classification tie-out requested by the customer (#374)" className="my-2 max-w-3xl text-xs text-slate-500">
        Every holding is sorted three ways — by category, by the family's own asset classes, and by basket. Each way must add back to the same book total, so nothing is dropped or counted twice. Consolidated book:{" "}
        <span className="text-slate-300">{money(BOOK_SUMMARY.totalValue)}</span> across {BOOK_ACCOUNTS.length} accounts, each holding counted once.
      </p>
      <div className="space-y-2">
        {model.axes.map((a) => (
          <details key={a.key} className="rounded border border-ink-700" data-xa-axis={a.key}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="font-medium text-slate-200" title={a.title}>{a.name}</span>
              <span className="text-slate-400">{groupCount(a.key, a.groupsN)}</span>
              <span className="ml-auto tabular-nums text-slate-200">{money(a.sum)}</span>
              {a.ties ? (
                <span className="text-gain" data-xa-tie="ok" title="The groups on this view add back to the book total exactly.">
                  ✓ ties to the book
                </span>
              ) : (
                <span className="text-loss" data-xa-tie="off" title="The groups on this view do not add back to the book total.">
                  ✗ off by {money(a.diff)}
                </span>
              )}
            </summary>
            {/* A plain list, not an HTML table element: a .tsx in src/components may
                not carry a raw one (tableExcel.test — tables go through ExportableTable),
                and this read-only reconciliation needs no sort, column drag or export. */}
            <div className="px-3 pb-3 text-sm">
              {a.groups.map((g) => (
                <div key={g.key} className="flex items-baseline justify-between gap-3 border-t border-ink-700 py-1">
                  <span className={g.unplaced ? "text-amber-400" : "text-slate-300"}>{g.label}</span>
                  <span className={`tabular-nums ${g.unplaced ? "text-amber-400" : "text-slate-300"}`}>{money(g.value)}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-ink-700 py-1 font-semibold">
                <span className="text-slate-200">Total</span>
                <span className="tabular-nums text-slate-100">{money(a.sum)}</span>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
