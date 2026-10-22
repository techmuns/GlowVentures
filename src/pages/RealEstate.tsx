import { useTableExporting } from "@/lib/tableExportSnapshot";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, MapPin, Table2, Map as MapIcon, Plus, Pencil, X, Wallet, Landmark, Banknote, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DASH, AbsentValue } from "@/components/Absent";
import { Card } from "@/components/Card";
import { SelectableTiles, type TileMetric } from "@/components/SelectableTiles";
import { SearchInput } from "@/components/SearchInput";
import { SortHeader, Tr, TrFoot } from "@/components/SortHeader";
import { EditColumns } from "@/components/EditColumns";
import { ExportableTable } from "@/components/ExportableTable";
import { useViewParam } from "@/components/ViewToggle";
import { PropertyEditor, emptyProperty } from "@/components/PropertyEditor";
import { useTableView, sortRows, type Accessor } from "@/lib/tableView";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtNum, fmtPct, fmtDate } from "@/lib/format";
import { PROPERTY_TYPES, PROPERTY_STATUSES, propertyFigures, wholePropertyFigures, propertyLabel, propertyTotal, hasPin, useProperties, type Property, type PropertyFigures } from "@/lib/realEstate";
const PropertyMap = lazy(() => import("@/components/PropertyMap"));
const VIEWS = [{ key: "table", label: "Table", icon: Table2 }, { key: "map", label: "Map", icon: MapIcon }] as const;
const DEFAULT_TILES = ["value", "cost", "rent"];
const COLS = ["name", "type", "location", "owners", "area", "cost", "value", "rent", "yield", "status", "pin", "purchasedOn", "valuationDate", "debt", "equity", "netRent", "tenant", "leaseEnd", "titleStatus"];
const OPTIONAL = ["purchasedOn", "valuationDate", "debt", "equity", "netRent", "tenant", "leaseEnd", "titleStatus"];
const LABELS: Record<string, string> = { name: "Property", type: "Type", location: "Location", owners: "Owner / share", area: "Area", cost: "Cost", value: "Current value", rent: "Rent / month", yield: "Gross yield", status: "Status", pin: "Map pin", purchasedOn: "Purchased", valuationDate: "Valued on", debt: "Loan", equity: "Net equity", netRent: "Net rent / month", tenant: "Tenant", leaseEnd: "Lease ends", titleStatus: "Title" };
const TYPES_COLOR: Record<string, string> = { Land: "#678355", Apartment: "#596da4", "Villa / house": "#aa783b", Commercial: "#925e85", Office: "#477f83", Warehouse: "#797054", Industrial: "#786e9c", Farmhouse: "#41795e", Other: "#737373" };
const date = (value: string | null) => value ? fmtDate(value) : DASH;
const location = (p: Property) => [p.city, p.state, p.country === "India" ? "" : p.country].filter(Boolean).join(", ");
const ownerNames = (p: Property) => p.owners.map(o => `${o.name || "Owner not entered"}${o.share === null ? " · share not entered" : ` ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 6 }).format(o.share)}%`}`).join(" · ") || DASH;
const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const shareTitle = "Money follows the selected owners' recorded shares. Area and rent agreements describe the whole property.";

export function RealEstate() {
  const exportingTable = useTableExporting();
  const { scope, fmtFromBase: money } = usePortfolio();
  const store = useProperties();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useViewParam(VIEWS);
  const table = useTableView("real-estate", COLS, { optional: OPTIONAL, manualEditor: true });
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<Property | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const q = params.get("q") ?? "", state = params.get("state") ?? "", city = params.get("city") ?? "", country = params.get("country") ?? "", type = params.get("type") ?? "", status = params.get("status") ?? "";
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key === "country") { next.delete("state"); next.delete("city"); }
    if (key === "state") next.delete("city");
    setParams(next, { replace: true });
  };
  const scoped = useMemo(() => store.properties.filter(p => !scope.owners || !p.owners.some(o => o.ownerId) || p.owners.some(o => o.ownerId && scope.owners!.has(o.ownerId))), [store.properties, scope.owners]);
  const filtered = useMemo(() => exportingTable ? scoped : scoped.filter(p => (!country || p.country === country) && (!state || p.state === state) && (!city || p.city === city) && (!type || p.type === type) && (!status || p.status === status)
    && (!q.trim() || [propertyLabel(p), p.address, p.city, p.state, p.country, p.pincode, p.type, p.tenant, ...p.owners.map(o => o.name)].join(" ").toLowerCase().includes(q.trim().toLowerCase()))), [exportingTable, scoped, country, state, city, type, status, q]);
  const accessors = useMemo<Record<string, Accessor<Property>>>(() => Object.fromEntries(COLS.map(key => [key, (p: Property) => {
    const figures = propertyFigures(p, scope.owners);
    if (key in figures) return figures[key as keyof PropertyFigures];
    if (key === "location") return location(p);
    if (key === "owners") return ownerNames(p);
    if (key === "pin") return hasPin(p) ? 1 : 0;
    // Areas with different units cannot be ranked as if their numbers shared a unit.
    if (key === "area") return p.area === null || !p.areaUnit ? null : p.area * ({ "sq ft": 1, "sq m": 10.7639104167, "sq yd": 9, acre: 43560, hectare: 107639.104167, cent: 435.6, guntha: 1089 }[p.areaUnit] ?? 1);
    return p[key as "name"];
  }])), [scope.owners]);
  const rows = sortRows(filtered, table.sort, accessors);
  const selected = store.properties.find(p => p.id === params.get("property"));
  const activeProperty = adding ?? selected;
  const close = () => { if (busy) return; setAdding(null); setEditing(false); setRemoving(false); setRemoveError(""); const next = new URLSearchParams(params); next.delete("property"); setParams(next, { replace: true }); };
  useEffect(() => { if (activeProperty && !dialog.current?.open) dialog.current?.showModal(); else if (!activeProperty && dialog.current?.open) dialog.current.close(); }, [activeProperty]);
  const open = (p: Property) => { setEditing(false); setRemoving(false); setRemoveError(""); const next = new URLSearchParams(params); next.set("property", p.id); setParams(next); };
  const coverage = (t: ReturnType<typeof propertyTotal>) => t.count && t.known < t.count ? `${t.known} of ${t.count} properties` : `${t.count} ${t.count === 1 ? "property" : "properties"}`;
  const sum = (key: Exclude<keyof PropertyFigures, "share">) => propertyTotal(filtered, key, scope.owners);
  const metric = (id: Exclude<keyof PropertyFigures, "share">, label: string, icon: ReactNode): TileMetric => {
    const total = sum(id);
    return { id: id === "netRent" ? "net-rent" : id, label, value: money(total.value, { compact: true }), sub: coverage(total), icon,
      detail: `${shareTitle}${total.known < total.count ? ` Missing: ${filtered.filter(p => propertyFigures(p, scope.owners)[id] === null).map(propertyLabel).join(", ")}.` : ""}` };
  };
  const metrics = [metric("value", "Property value", <Building2 className="h-4 w-4" />), metric("cost", "Total cost", <Wallet className="h-4 w-4" />), metric("rent", "Monthly rent", <Banknote className="h-4 w-4" />), metric("debt", "Loan outstanding", <Landmark className="h-4 w-4" />), metric("netRent", "Net monthly rent", <Banknote className="h-4 w-4" />)];
  const filterSelect = (key: string, value: string, label: string, values: string[]) => <select aria-label={label} value={value} onChange={e => setFilter(key, e.target.value)} className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-slate-200">
    <option value="">{label}</option>{distinct(value ? [...values, value] : values).map(v => <option key={v} value={v}>{v}</option>)}
  </select>;
  const empty = store.loading ? "Loading properties…" : store.error && !store.ready ? "Properties unavailable" : scoped.length === 0 ? scope.owners ? "No properties for the selected members" : "No properties added" : "No matching properties";
  const figures = selected ? wholePropertyFigures(selected) : null;
  const numeric = new Set(["area", "cost", "value", "rent", "yield", "debt", "equity", "netRent"]);
  const cell = (p: Property, key: string): ReactNode => {
    const f = propertyFigures(p, scope.owners);
    if (["cost", "value", "rent", "debt", "equity", "netRent"].includes(key)) return f[key as "cost"] === null ? <span title={f.share === null ? "Ownership share not entered or incomplete. Whole-property figures are available in property details." : key === "equity" ? "Needs current value and loan outstanding" : key === "netRent" ? "Needs monthly rent and monthly costs" : "Not entered"}><AbsentValue /></span> : <span title={`${shareTitle}${p.valuationDate && key === "value" ? ` Valued ${date(p.valuationDate)}.` : ""}`}>{money(f[key as "cost"])}</span>;
    switch (key) {
      case "name": return <div className="flex items-center gap-2"><button type="button" onClick={() => open(p)} className="text-left font-medium text-slate-100 hover:text-champagne-400 underline decoration-ink-600 underline-offset-4">{propertyLabel(p)}</button><button type="button" aria-label={`Edit ${propertyLabel(p)}`} title="Edit property" className="shrink-0 text-slate-500 hover:text-champagne-400" onClick={() => { open(p); setEditing(true); }}><Pencil className="h-3 w-3" /></button></div>;
      case "location": return <span title={[p.address, p.pincode].filter(Boolean).join(", ")}>{location(p) || DASH}</span>;
      case "owners": return <span title={ownerNames(p)}>{ownerNames(p)}</span>;
      case "type": return !p.type ? <AbsentValue /> : <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: TYPES_COLOR[p.type] }} />{p.type}</span>;
      case "area": return p.area === null ? <span title="Area not entered"><AbsentValue /></span> : <span title={`${p.areaBasis} area · whole property`}>{fmtNum(p.area, 2).replace(/\.00$/, "")} {p.areaUnit}</span>;
      case "yield": return <span title={f.yield === null ? "Needs monthly rent and a current value above zero" : "Annual gross rent ÷ current value. Excludes expenses and financing."}>{fmtPct(f.yield)}</span>;
      case "pin": return <button type="button" data-export-value={hasPin(p) ? `${p.latitude}, ${p.longitude}` : "Pin needed"} onClick={() => { open(p); if (!hasPin(p)) setEditing(true); }} className={`inline-flex items-center gap-1 text-xs ${hasPin(p) ? "text-champagne-400" : "text-slate-500"}`}><MapPin className="h-3 w-3" />{hasPin(p) ? "View" : "Pin needed"}</button>;
      case "purchasedOn": case "valuationDate": case "leaseEnd": return <span title={p[key] ? undefined : "Not entered"}>{date(p[key])}</span>;
      default: return p[key as "status"] || <span title="Not entered"><AbsentValue /></span>;
    }
  };
  return <div>
    <PageHeader eyebrow="Daily" title="Real Estate" right={<button type="button" className="btn-primary" disabled={!store.ready} onClick={() => { setAdding(emptyProperty()); setEditing(true); }}><Plus className="h-4 w-4" />Add property</button>} />
    {store.error && <div role="alert" className="mb-4 flex items-center gap-3 rounded-lg border border-ink-600 bg-ink-800 p-3 text-sm text-loss">{store.error}<button type="button" className="btn-ghost" onClick={() => void store.reload()}>Retry</button></div>}
    <SelectableTiles page="real-estate" storageKey="glow:realEstateTiles:v1" defaults={DEFAULT_TILES} metrics={metrics} />
    <Card className="mt-5" pad={false} title={`Properties${store.ready ? ` · ${filtered.length}` : ""}`} right={<div className="flex flex-wrap items-center justify-end gap-2">
      <div role="tablist" aria-label="Property views" className="inline-flex items-center gap-0.5 rounded-lg border border-ink-600/60 bg-ink-900/40 p-0.5">
        {VIEWS.map(({ key, label, icon: Icon }) => <button type="button" role="tab" aria-selected={view === key} key={key} onClick={() => setView(key)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${view === key ? "bg-champagne-500 text-ink-950 shadow-glow" : "text-slate-400 hover:text-slate-200"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
      </div>
      {view === "table" && <EditColumns view={table} />}
      <SearchInput value={q} onChange={v => setFilter("q", v)} placeholder="Search properties…" className="w-52" suggestions={scoped.map(propertyLabel)} />
    </div>}>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-5 pb-3 pt-3">
        {distinct(scoped.map(p => p.country)).length > 1 && filterSelect("country", country, "All countries", scoped.map(p => p.country))}
        {filterSelect("state", state, "All states", scoped.filter(p => !country || p.country === country).map(p => p.state))}
        {filterSelect("city", city, "All cities / districts", scoped.filter(p => (!state || p.state === state) && (!country || p.country === country)).map(p => p.city))}
        {filterSelect("type", type, "All property types", PROPERTY_TYPES)}
        {filterSelect("status", status, "All statuses", PROPERTY_STATUSES)}
        {(q || country || state || city || type || status) && <button type="button" className="text-xs text-champagne-400 underline" onClick={() => { const next = new URLSearchParams(params); ["q", "state", "city", "country", "type", "status"].forEach(k => next.delete(k)); setParams(next, { replace: true }); }}>Clear filters</button>}
        <span className="ml-auto text-xs text-slate-500" title={shareTitle}>Selected owners’ share</span>
      </div>
      {view === "table" ? <div className="overflow-x-auto"><ExportableTable exportName="Real Estate — Properties" className="min-w-full text-[13px]" data-real-estate-table>
        <thead className="border-b border-ink-700"><Tr view={table}>{COLS.map(key => <SortHeader key={key} col={key} view={table} align={numeric.has(key) ? "right" : "left"} pad="px-3 py-2" title={numeric.has(key) && key !== "area" && key !== "yield" ? shareTitle : undefined} className={key === "name" ? "min-w-[12rem]" : ""}>{LABELS[key]}</SortHeader>)}</Tr></thead>
        <tbody>{rows.map(p => <Tr key={p.id} view={table} inputRecordId={`property:${p.id}`} className="border-b border-ink-700/50" data-property={p.id}>{COLS.map(key => <td key={key} className={`px-3 py-3 ${numeric.has(key) ? "text-right mono tabular whitespace-nowrap" : "text-slate-300"} ${key === "owners" ? "min-w-[10rem] max-w-[15rem] text-xs" : ""}`}>{cell(p, key)}</td>)}</Tr>)}
          {!rows.length && <tr><td colSpan={table.order.length} className="px-5 py-14 text-center text-sm text-slate-500">{empty}{store.ready && !scoped.length && !scope.owners && <button type="button" className="mx-auto mt-3 block text-champagne-400 underline" onClick={() => { setAdding(emptyProperty()); setEditing(true); }}>Add property</button>}</td></tr>}
        </tbody>
        {!!rows.length && <tfoot><TrFoot view={table} label="Total" className="border-t border-ink-600 bg-ink-800/50 font-semibold" cells={Object.fromEntries(["cost", "value", "rent", "debt", "equity", "netRent"].map(key => { const total = sum(key as "cost"); return [key, <td key={key} className="px-3 py-3 text-right mono tabular whitespace-nowrap" title={shareTitle}>{money(total.value)}{total.known < total.count && <span data-export-ignore className="mt-1 block font-sans text-[10px] font-normal text-slate-500">{coverage(total)}</span>}</td>]; }))} /></tfoot>}
      </ExportableTable></div> : <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0"><Suspense fallback={<div className="p-16 text-sm text-slate-400">Loading map…</div>}><PropertyMap properties={filtered} onSelect={open} /></Suspense>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-700 px-4 py-2 text-xs text-slate-400">{distinct(filtered.map(p => p.type)).map(t => <span key={t} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: TYPES_COLOR[t] }} />{t}</span>)}<span className="ml-auto">{filtered.filter(hasPin).length} pinned · {filtered.filter(p => !hasPin(p)).length} need a pin</span></div>
        </div>
        <div className="max-h-[590px] overflow-y-auto border-t border-ink-700 lg:border-l lg:border-t-0">
          {!filtered.length && <p className="px-4 py-10 text-center text-sm text-slate-500">{empty}</p>}
          {filtered.map(p => <button type="button" key={p.id} onClick={() => open(p)} className="block w-full border-b border-ink-700 p-4 text-left hover:bg-ink-700/30"><span className="block font-medium text-slate-100">{propertyLabel(p)}</span><span className="mt-1 block text-xs text-slate-400">{[p.type, location(p)].filter(Boolean).join(" · ") || "Details not entered"}</span><span className="mt-2 flex justify-between gap-2 text-xs"><span className="mono text-slate-200">{money(propertyFigures(p, scope.owners).value)}</span><span className={hasPin(p) ? "text-champagne-400" : "text-slate-500"}>{hasPin(p) ? "View property" : "Pin needed"}</span></span></button>)}
        </div>
      </div>}
    </Card>
    <dialog ref={dialog} aria-labelledby="property-dialog-title" onCancel={e => { e.preventDefault(); close(); }} onClose={() => { if (activeProperty) close(); }} className="property-dialog card w-[min(62rem,calc(100%-2rem))] max-h-[90vh] overflow-y-auto p-5 text-slate-200 backdrop:bg-black/50">
      {activeProperty && <><div className="mb-5 flex items-start justify-between gap-4"><h2 id="property-dialog-title" className="font-display text-lg font-bold text-slate-100">{adding ? "Add property" : propertyLabel(activeProperty)}</h2><button type="button" className="btn-ghost" aria-label="Close property" disabled={busy} onClick={close}><X className="h-4 w-4" /></button></div>
        {editing || adding ? <PropertyEditor key={activeProperty.id} property={activeProperty} members={scope.options} onCancel={adding ? close : () => setEditing(false)} onSave={async p => {
          setBusy(true); const reply = await store.mutate({ op: "save", property: p }); setBusy(false);
          if (reply.ok) { setAdding(null); setEditing(false); const next = new URLSearchParams(params); next.set("property", p.id); setParams(next, { replace: true }); }
          return reply;
        }} /> : selected && figures && <>
          <div className="mb-4 flex flex-wrap items-center gap-3"><span className="text-sm text-slate-400">{[selected.type, selected.status].filter(Boolean).join(" · ")}</span><button type="button" className="btn-primary ml-auto" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" />Edit property</button></div>
          <p className="mb-3 text-xs text-slate-400">Whole-property figures</p>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ["Address", [selected.address, location(selected), selected.pincode].filter(Boolean).join(", ") || DASH], ["Owner / share", ownerNames(selected)], ["Area", selected.area === null ? DASH : [`${fmtNum(selected.area, 2).replace(/\.00$/, "")} ${selected.areaUnit}`.trim(), selected.areaBasis].filter(Boolean).join(" · ")],
              ["Current value", money(figures.value)], ["Valued on", date(selected.valuationDate)], ["Cost", money(figures.cost)], ["Purchased", date(selected.purchasedOn)], ["Loan outstanding", money(figures.debt)], ["Net equity", money(figures.equity)],
              ["Monthly rent", money(figures.rent)], ["Monthly costs", money(figures.costs)], ["Net monthly rent", money(figures.netRent)], ["Gross rental yield", fmtPct(figures.yield)], ["Tenant", selected.tenant || "—"], ["Lease ends", date(selected.leaseEnd)], ["Title", selected.titleStatus],
            ] as [string, ReactNode][]).map(([label, value]) => <div key={label}><dt className="label-xs">{label}</dt><dd className="mt-1 text-sm text-slate-200">{value || DASH}</dd></div>)}
          </dl>
          {selected.notes && <p className="mt-5 whitespace-pre-wrap text-sm text-slate-300">{selected.notes}</p>}
          <div className="mt-5 border-t border-ink-700 pt-4">
            {hasPin(selected) ? <><div className="mb-3 flex items-center justify-between text-xs text-slate-400"><span>Property location</span><a className="text-champagne-400 underline" href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`} target="_blank" rel="noopener noreferrer">Open in Maps ↗</a></div><Suspense fallback={<div className="p-8">Loading map…</div>}><PropertyMap point={[selected.latitude!, selected.longitude!]} /></Suspense></> : <button type="button" className="btn-ghost" onClick={() => setEditing(true)}><MapPin className="h-4 w-4" />Set map pin</button>}
          </div>
          <div className="mt-5 border-t border-ink-700 pt-4">{!removing ? <button type="button" className="inline-flex items-center gap-1 text-xs text-loss" onClick={() => setRemoving(true)}><Trash2 className="h-3 w-3" />Delete property</button> : <div className="flex flex-wrap items-center gap-3 text-sm"><span>Delete {propertyLabel(selected)}?</span><button type="button" className="btn-ghost" disabled={busy} onClick={() => setRemoving(false)}>Keep property</button><button type="button" className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); const reply = await store.mutate({ op: "delete", id: selected.id }); setBusy(false); if (reply.ok) close(); else setRemoveError(reply.message); }}>{busy ? "Deleting…" : "Delete"}</button></div>}{removeError && <p role="alert" className="mt-2 text-sm text-loss">{removeError}</p>}</div>
        </>}
      </>}
    </dialog>
  </div>;
}
