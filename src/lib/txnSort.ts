/**
 * ── HOW THE TRANSACTION ROLLUPS ARE ORDERED, DEFINED ONCE ──────────────────
 *
 *   *"how is it sorting? Is it, like, the recent transactions first? How is it
 *    sorted? Not recent transactions first. Do that… your transaction should
 *    always have your recent transactions first… It should be date wise,
 *    basically."*   …   *"See, something is October, something is December,
 *    something is 2023. It's all very chaotic."*
 *
 * It was chaotic, and it was chaotic for a reason that looked defensible when it
 * was written: every rollup on the Transactions card sorted BY SIZE — the
 * family's capital by what they paid in, a manager's year by the position they
 * built. That answers "what is the biggest", and a reader scanning a list of
 * dated movements is asking "what happened last". The Period column then read
 * 3 Oct 2025, 4 May 2023, 16 Dec 2025 down the page, which is the complaint.
 *
 * So **recent first is the default** and the size ordering keeps its place as
 * the one alternative, because it was never wrong — only wrong to impose.
 *
 *   *"you can give me an option. I can sort recent transactions first, or I can
 *    sort as per, say, holding period… you need to have some kind of a filter
 *    is all I'm trying to tell."*
 *
 * ── TWO MODES, AND "LONGEST HELD" IS NOT ONE OF THEM ANY MORE ──────────────
 *
 *   *"And the toggle switch of recent first/largest first… remove longest first
 *    filter."*
 *
 * It was offered because the family had asked to be able to sort "as per, say,
 * holding period", and it was the honest answer to that: "oldest first" and
 * "longest held" are the SAME ORDERING on this data — a row's holding period
 * runs from its first dated movement, so the longest-held row is the one that
 * starts earliest — so naming it once was better than shipping two controls
 * that cannot be told apart by their results. The family have now asked for it
 * to go, which is their call on their own screen.
 *
 * IT IS DELETED RATHER THAN HIDDEN. Left in `TXN_SORTS` and merely not
 * rendered, `sortRows`'s `held` branch would be a mode nothing can select —
 * dead code wearing a confident explanation, which is the failure this repo
 * keeps naming. Removing the id from the union makes reintroducing it a type
 * error rather than a quiet edit, the same treatment the Economy `Row` fields
 * got when a fabricated column was retired.
 *
 * ── ONE DEFINITION, THREE LEVELS ───────────────────────────────────────────
 *
 * `capitalRollup` and `rollup` both order rows, and `rollup` orders two more
 * levels underneath them. A comparator written per level is a chance for a
 * group to open on its oldest tranche while the groups above it read newest
 * first, so the mode is applied by ONE function at every level that has a date.
 */

export type TxnSort = "recent" | "size";

export const TXN_SORTS: readonly { id: TxnSort; label: string; title: string }[] = [
  {
    id: "recent",
    label: "Recent first",
    title: "Newest movement first — the row whose latest dated transaction is the most recent comes top, and every list inside it opens on its newest row.",
  },
  {
    id: "size",
    label: "Largest first",
    title: "Biggest first, by the money that moved. A row whose statements report no settled amount sorts last rather than as zero.",
  },
];

/**
 * What this function READS off a row — its latest date and, through `sizeOf`,
 * the money that moved. `first` was here for the `held` mode and came out with
 * it: a field a type declares and nothing reads is the same dead-weight as a
 * helper nothing calls, one layer up. Rows still carry their own `first` and
 * still render it; this type simply no longer claims to use it.
 */
export type Sortable = { last?: string; date?: string; amount?: number | null };

/**
 * The money a row moved, for the size ordering.
 *
 * ABSENT SORTS LAST RATHER THAN AS ZERO — `-Infinity`, never `0`. A statement
 * that reports no settled amount has not reported a small one, and a `?? 0`
 * here would file every unreported movement among the smallest, which is the
 * absent-vs-zero rule arriving through a comparator.
 */
export type SizeOf<T> = (row: T) => number | null;

export function sortRows<T extends Sortable>(rows: T[], mode: TxnSort, sizeOf: SizeOf<T>): T[] {
  const last = (r: T) => r.last ?? r.date ?? "";
  const size = (r: T) => sizeOf(r) ?? -Infinity;
  const out = [...rows];
  if (mode === "recent") out.sort((a, b) => last(b).localeCompare(last(a)) || size(b) - size(a));
  else out.sort((a, b) => size(b) - size(a) || last(b).localeCompare(last(a)));
  return out;
}
