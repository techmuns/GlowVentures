import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { SortState } from "@/lib/useSort";

// A clickable table-header cell that drives useSort. Shows the current sort
// direction on the active column and a neutral up/down glyph otherwise.
export function SortHeader({ label, col, sort, onSort, align = "right", title, pad = "px-4 py-2" }: {
  label: string;
  col: string;
  sort: SortState;
  onSort: (col: string) => void;
  align?: "left" | "right";
  title?: string;
  pad?: string;
}) {
  const active = sort.col === col;
  const Icon = active ? (sort.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th title={title} onClick={() => onSort(col)}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`label-xs cursor-pointer select-none ${pad} font-medium transition-colors hover:text-slate-300 ${active ? "text-slate-300" : ""} ${align === "left" ? "text-left" : "text-right"}`}>
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <Icon className={`h-3 w-3 ${active ? "text-champagne-400" : "text-slate-600"}`} />
        <span>{label}</span>
      </span>
    </th>
  );
}
