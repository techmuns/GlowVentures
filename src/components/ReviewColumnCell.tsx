import { reviewColumn, reviewField, REVIEW_NOTE, type ReviewScope } from "@/lib/reviewColumns";
import { usePortfolio } from "@/context/PortfolioContext";

export function ReviewColumnCell({ id, scope }: { id: string; scope?: ReviewScope }) {
  const { fmtFromBase, scope: memberScope } = usePortfolio();
  const column = reviewColumn(id);
  const field = reviewField(scope ? { ...scope, familySubset: memberScope.owners !== null } : undefined, column?.field ?? "");
  const value = field.value;
  const content = value == null ? "—" : typeof value !== "number" ? value
    : column?.format === "currency" ? fmtFromBase(value, { compact: true })
    : column?.format === "percent" ? `${(value * 100).toFixed(2)}%`
    : value.toLocaleString("en-IN");
  return <td data-col-cell={id} data-review-source={field.source || undefined} data-review-value={value ?? undefined}
    title={[field.source, field.note, REVIEW_NOTE].filter(Boolean).join(" · ")}
    className={`px-3 py-2 text-xs ${column?.format === "text" ? "max-w-xs text-left" : "whitespace-nowrap text-right mono"} ${value == null ? "text-slate-600" : "text-slate-300"}`}>
    {content}
  </td>;
}
