import { useEffect, useRef, useState } from "react";
import { Users, ChevronDown, Check } from "lucide-react";
import { useMemberScope } from "@/context/PortfolioContext";
import type { MemberKind } from "@/lib/memberScope";
import { AbsentSection } from "@/components/Absent";

// ── WHOSE BOOK THE WHOLE DASHBOARD SHOWS (Stage 10di) ─────────────────────────
//
// *"this selector will be at the top most section of the page … the default
// view would be … Whole family. And then there would be a drop down to select
// each family member or family entity and they should be able to multi select."*
//
// The selection lives in the address (`?members=`), set by `PortfolioContext`,
// so every page reads one scope and a scoped view is a link. Ticking the last
// member off goes back to the whole family: a dashboard over nobody would read
// as a measured nothing.
const KIND_NOTE: Record<MemberKind, string> = {
  member: "",
  trust: "trust",
  unattributed: "review lines no member is named on",
};

export function MemberScopeSelect() {
  const { selected, options, label, setSelected, unknown } = useMemberScope();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const picked = new Set(selected ?? []);
  const whole = selected == null;
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next.size ? [...next] : null);
  };
  const hover = whole
    ? "Showing the whole family. Pick one or more members or trusts to show only theirs."
    : `Showing only ${options.filter((o) => picked.has(o.ownerId)).map((o) => o.label).join(", ") || "no member"}. Family & Entities always shows every member.`;

  return (
    <div ref={box} className="relative shrink-0" data-member-scope={selected ? selected.join(",") : "whole"}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox"
        data-member-scope-toggle title={hover}
        className={["flex h-9 items-center gap-2 rounded-md border px-3 text-sm ring-focus transition-colors",
          whole ? "border-ink-600 bg-ink-800/60 text-slate-200 hover:bg-ink-700/60"
            : "border-champagne-500/60 bg-champagne-500/10 text-champagne-400"].join(" ")}>
        <Users className="h-4 w-4 shrink-0" />
        <span className="max-w-[12rem] truncate font-medium" data-member-scope-label>{label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {unknown.length > 0 && (
        <span className="sr-only" data-member-scope-unknown={unknown.join(",")} />
      )}
      {open && (
        <div data-member-scope-panel
          className="absolute left-0 z-50 mt-1 w-[min(20rem,92vw)] overflow-hidden rounded-lg border border-ink-700 bg-ink-800 shadow-xl shadow-black/40">
          <ul role="listbox" aria-multiselectable="true" className="max-h-80 overflow-auto py-1">
            <li role="option" aria-selected={whole} data-member-option="whole"
              onMouseDown={(e) => { e.preventDefault(); setSelected(null); setOpen(false); }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-ink-700/60 ${whole ? "text-slate-100" : "text-slate-300"}`}>
              <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${whole ? "border-champagne-500 bg-champagne-500/20 text-champagne-400" : "border-ink-600 text-transparent"}`}>
                <Check className="h-3 w-3" />
              </span>
              <span className="font-medium">Whole family</span>
            </li>
            <li className="mx-3 my-1 border-t border-ink-700" aria-hidden />
            {options.map((o) => {
              const on = picked.has(o.ownerId);
              return (
                <li key={o.ownerId} role="option" aria-selected={on} data-member-option={o.ownerId}
                  title={`${o.accounts} account${o.accounts === 1 ? "" : "s"}${KIND_NOTE[o.kind] ? ` · ${KIND_NOTE[o.kind]}` : ""}`}
                  onMouseDown={(e) => { e.preventDefault(); toggle(o.ownerId); }}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-ink-700/60 ${on ? "text-slate-100" : "text-slate-300"}`}>
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-champagne-500 bg-champagne-500/20 text-champagne-400" : "border-ink-600 text-transparent"}`}>
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="truncate">{o.label}</span>
                  {o.kind !== "member" && <span className="ml-auto shrink-0 text-[11px] text-slate-500">{o.kind === "trust" ? "trust" : "unattributed"}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * A page whose subject belongs only to members outside the chosen scope.
 *
 * A mandate page for Ankita's account, opened while the scope is Ajay alone,
 * must not say "no account in this book" or "fully exited": both are claims
 * about the BOOK, and the book carries it. What is true is that the scope at the
 * top of the page leaves it out, so this says that, names whose it is, and
 * offers the two ways back — add that member, or show the whole family.
 */
export function OutOfScope({ what, ownerIds }: { what: string; ownerIds: readonly string[] }) {
  const { selected, options, label, setSelected } = useMemberScope();
  const owners = options.filter((o) => ownerIds.includes(o.ownerId));
  const whose = owners.map((o) => o.label).join(", ") || "another member";
  const add = () => setSelected([...(selected ?? []), ...owners.map((o) => o.ownerId).filter((id) => !(selected ?? []).includes(id))]);
  return (
    <div data-member-out-of-scope={ownerIds.join(",")}>
      <AbsentSection what={`${what} · ${whose} · not in ${label}`}
        needs={`This belongs to ${whose}, who ${owners.length > 1 ? "are" : "is"} not among the members chosen at the top of the page. Add ${owners.length > 1 ? "them" : "that member"}, or show the whole family, to see it.`}>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {owners.length > 0 && (
            <button type="button" onClick={add} data-member-scope-add
              className="rounded-md border border-champagne-500/60 bg-champagne-500/10 px-3 py-1.5 text-xs font-medium text-champagne-400 ring-focus hover:bg-champagne-500/20">
              Add {whose}
            </button>
          )}
          <button type="button" onClick={() => setSelected(null)} data-member-scope-reset
            className="rounded-md border border-ink-600 bg-ink-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 ring-focus hover:bg-ink-700/60">
            Show whole family
          </button>
        </div>
      </AbsentSection>
    </div>
  );
}
