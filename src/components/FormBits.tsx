import type { ReactNode } from "react";

// The small form controls the family-input editors share.
//
// These exist so the deal register, the household balance sheet, the adviser
// register and the decisions queue look and behave identically — a family
// filling four registers should not have to learn four widgets. They carry no
// parsing of their own: every editor decides for itself what a blank field
// means, because the answer differs by field. A blank price is not set; a blank
// bank balance is not set; a typed 0 target weight is a decision. Putting a
// parser in here would hide that distinction behind a shared default.

export function TextField({ label, value, onChange, placeholder, type = "text", wide, hint, mono = true }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; wide?: boolean; hint?: string; mono?: boolean;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="label-xs text-slate-400" title={hint}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${mono ? "mono " : ""}mt-1 w-full rounded-md border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 text-[12.5px] text-slate-200 placeholder:text-slate-600 focus:border-champagne-500/40 focus:outline-none`}
      />
    </label>
  );
}

export function SelectField({ label, value, onChange, options, hint, wide, blank }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string; wide?: boolean;
  /** Label for the empty option. Omit to make the select required-by-shape. */
  blank?: string;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="label-xs text-slate-400" title={hint}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 text-[12.5px] text-slate-200 focus:border-champagne-500/40 focus:outline-none"
      >
        {blank !== undefined && <option value="">{blank}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function CheckField({ label, checked, onChange, hint }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <label className="flex items-center gap-2 self-end pb-1.5 text-[12px] text-slate-300" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-ink-600 bg-ink-900/60 accent-champagne-400" />
      {label}
    </label>
  );
}

/** A repeating sub-record list — tranches, assets, advisers, decisions. */
export function RowList({ title, note, items, onAdd, onRemove, empty, addLabel = "Add" }: {
  title: ReactNode; note?: ReactNode; empty: string; addLabel?: string;
  items: { id: string; cells: ReactNode[] }[];
  onAdd: () => void; onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-ink-700/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-slate-300">{title}</span>
        <button type="button" onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-md border border-ink-600/70 px-2.5 py-1 text-[11.5px] text-slate-400 transition-colors hover:text-slate-200">
          + {addLabel}
        </button>
      </div>
      {note && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{note}</p>}
      {items.length === 0
        ? <p className="mt-2 text-[11.5px] text-slate-500">{empty}</p>
        : (
          <div className="mt-3 space-y-3">
            {items.map((it) => (
              <div key={it.id} className="flex items-start gap-2 border-t border-dashed border-ink-700/70 pt-3 first:border-t-0 first:pt-0">
                <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{it.cells}</div>
                <button type="button" onClick={() => onRemove(it.id)} title="Remove"
                  className="mt-5 text-[11px] text-slate-600 hover:text-rose-400">remove</button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
