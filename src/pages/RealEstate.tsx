import { useTableExporting } from "@/lib/tableExportSnapshot";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, MapPin, Table2, Map as MapIcon, Plus, Pencil, X, Wallet, Landmark, Banknote, Trash2, TrendingUp, Gift, Receipt, Scale } from "lucide-react";
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
import { PropertyBulkEntry } from "@/components/PropertyBulkEntry";
import { useTableView, sortRows, type Accessor } from "@/lib/tableView";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtNum, fmtPct, fmtDate } from "@/lib/format";
import { PROPERTY_TYPES, PROPERTY_STATUSES, propertyFigures, wholePropertyFigures, propertyLabel, propertyTotal, hasPin, useProperties, receivedWithoutPurchase, costLabel, acquiredOnLabel, appreciationGap, isEarmarked, earmarkLabel, EARMARK_MARKER_ONLY, propertyGainsTax, financialYear, indexYear, LONG_TERM_RATE, INDEXED_RATE, CESS, type Property, type PropertyFigures, type PropertyGainsTax } from "@/lib/realEstate";
import { todayIso } from "@/lib/enteredCalls";
const PropertyMap = lazy(() => import("@/components/PropertyMap"));
const VIEWS = [{ key: "table", label: "Table", icon: Table2 }, { key: "map", label: "Map", icon: MapIcon }] as const;
const DEFAULT_TILES = ["value", "cost", "rent", "after-tax"];
const COLS = ["name", "type", "location", "owners", "earmark", "area", "cost", "value", "gain", "gainPct", "tax", "afterTax", "rent", "yield", "status", "pin", "acquisition", "purchasedOn", "holding", "indexedCost", "valuationDate", "debt", "emi", "equity", "netRent", "tenant", "leaseEnd", "titleStatus"];
const OPTIONAL = ["acquisition", "purchasedOn", "holding", "indexedCost", "valuationDate", "debt", "emi", "equity", "netRent", "tenant", "leaseEnd", "titleStatus"];
const LABELS: Record<string, string> = { name: "Property", type: "Type", location: "Location", owners: "Owner / share", area: "Area", cost: "Cost", value: "Current value", gain: "Appreciation", gainPct: "Appreciation %", tax: "Est. tax on sale", afterTax: "Value after tax", rent: "Rent / month", yield: "Gross yield", status: "Status", earmark: "Earmarked for", pin: "Map pin", acquisition: "Acquisition", purchasedOn: "Acquired on", holding: "Holding", indexedCost: "Indexed cost", valuationDate: "Valued on", debt: "Loan", emi: "EMI / month", equity: "Net equity", netRent: "Net rent / month", tenant: "Tenant", leaseEnd: "Lease ends", titleStatus: "Title" };
type TaxKey = "tax" | "afterTax" | "indexedCost";
const TAX_KEYS = new Set<string>(["tax", "afterTax", "indexedCost", "holding"]);
const pctRate = (rate: number) => `${Math.round(rate * 1000) / 10}%`;
// What every tax figure on this page is, and what it leaves out — the hover on each.
const TAX_RULES = `Long-term capital gains tax if sold at the current value: held more than 24 months (a previous owner's holding counts for an inheritance or gift). ${pctRate(LONG_TERM_RATE)} without indexation since the Finance (No. 2) Act 2024; a resident individual or HUF selling land or a building acquired before 23 Jul 2024 pays no more than ${pctRate(INDEXED_RATE)} with indexation (Cost Inflation Index). Struck per owner on their share, plus ${pctRate(CESS)} cess. Excludes surcharge (it depends on the owner's total income for the year), selling costs, and reinvestment exemptions.`;
type Summed = Exclude<keyof PropertyFigures, "share" | "gainPct">;
const TYPES_COLOR: Record<string, string> = { Land: "#678355", Apartment: "#596da4", "Villa / house": "#aa783b", Commercial: "#925e85", Office: "#477f83", Warehouse: "#797054", Industrial: "#786e9c", Farmhouse: "#41795e", Other: "#737373" };
const date = (value: string | null) => value ? fmtDate(value) : DASH;
const location = (p: Property) => [p.city, p.state, p.country === "India" ? "" : p.country].filter(Boolean).join(", ");
const ownerNames = (p: Property) => p.owners.map(o => `${o.name || "Owner not entered"}${o.share === null ? " · share not entered" : ` ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 6 }).format(o.share)}%`}`).join(" · ") || DASH;
const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const shareTitle = "Money follows the selected owners' recorded shares. Area and rent agreements describe the whole property.";
const shareMissing = "Ownership share not entered or incomplete. Whole-property figures are available in property details.";
// An absent figure and the few words that say why; the full reason is its hover.
const gap = (reason: string, short: string) => <span title={reason}><AbsentValue /><span className="mt-1 block font-sans text-[10px] text-slate-500">{short}</span></span>;
const receivedTag = (p: Property) => p.acquisition === "Inherited" ? "On inheritance" : "On gift";
// The earmark filter: every earmarked property, one intended recipient, or none.
const EARMARKED = "earmarked", NOT_EARMARKED = "not-earmarked", TO = "to:";
const earmarkTitle = (p: Property) => [earmarkLabel(p), p.earmark?.note, EARMARK_MARKER_ONLY].filter((s): s is string => !!s).map(s => /[.!?]$/.test(s) ? s : `${s}.`).join(" ");
const matchesEarmark = (p: Property, filter: string) => !filter || (filter === EARMARKED ? isEarmarked(p) : filter === NOT_EARMARKED ? !isEarmarked(p)
  : filter.startsWith(TO) && isEarmarked(p) && p.earmark!.recipient === filter.slice(TO.length));
// Cost totals that include values on the date of inheritance or gift say how many.
function receivedNote(list: Property[], owners: ReadonlySet<string> | null) {
  const received = list.filter(p => receivedWithoutPurchase(p) && propertyFigures(p, owners).cost !== null);
  if (!received.length) return "";
  const kinds = new Set(received.map(p => p.acquisition));
  return `${received.length} at value on ${kinds.size > 1 ? "inheritance or gift" : kinds.has("Inherited") ? "inheritance" : "gift"}`;
}

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
  const q = params.get("q") ?? "", state = params.get("state") ?? "", city = params.get("city") ?? "", country = params.get("country") ?? "", type = params.get("type") ?? "", status = params.get("status") ?? "", earmark = params.get("earmark") ?? "";
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key === "country") { next.delete("state"); next.delete("city"); }
    if (key === "state") next.delete("city");
    setParams(next, { replace: true });
  };
  const scoped = useMemo(() => store.properties.filter(p => !scope.owners || !p.owners.some(o => o.ownerId) || p.owners.some(o => o.ownerId && scope.owners!.has(o.ownerId))), [store.properties, scope.owners]);
  const filtered = useMemo(() => exportingTable ? scoped : scoped.filter(p => (!country || p.country === country) && (!state || p.state === state) && (!city || p.city === city) && (!type || p.type === type) && (!status || p.status === status) && matchesEarmark(p, earmark)
    && (!q.trim() || [propertyLabel(p), p.address, p.city, p.state, p.country, p.pincode, p.type, p.acquisition, p.tenant, p.earmark?.recipient ?? "", ...p.owners.map(o => o.name)].join(" ").toLowerCase().includes(q.trim().toLowerCase()))), [exportingTable, scoped, country, state, city, type, status, earmark, q]);
  // A sale today: the date sets the financial year, its index and each holding period.
  const asOf = useMemo(() => todayIso(), []);
  const taxes = useMemo(() => new Map(store.properties.map(p => [p.id, propertyGainsTax(p, { asOf, owners: scope.owners })])), [store.properties, scope.owners, asOf]);
  const taxOf = (p: Property) => taxes.get(p.id) ?? propertyGainsTax(p, { asOf, owners: scope.owners });
  const taxFigure = (t: PropertyGainsTax, key: TaxKey) => key === "indexedCost" ? (t.indexedCost === null || t.share === null ? null : t.indexedCost * t.share) : t[key];
  const accessors = useMemo<Record<string, Accessor<Property>>>(() => Object.fromEntries(COLS.map(key => [key, (p: Property) => {
    if (TAX_KEYS.has(key)) { const t = taxes.get(p.id); return !t ? null : key === "holding" ? t.longTermFrom : taxFigure(t, key as TaxKey); }
    const figures = propertyFigures(p, scope.owners);
    if (key in figures) return figures[key as keyof PropertyFigures];
    if (key === "location") return location(p);
    if (key === "owners") return ownerNames(p);
    if (key === "pin") return hasPin(p) ? 1 : 0;
    if (key === "earmark") return isEarmarked(p) ? p.earmark!.recipient || " " : null;
    // Areas with different units cannot be ranked as if their numbers shared a unit.
    if (key === "area") return p.area === null || !p.areaUnit ? null : p.area * ({ "sq ft": 1, "sq m": 10.7639104167, "sq yd": 9, acre: 43560, hectare: 107639.104167, cent: 435.6, guntha: 1089 }[p.areaUnit] ?? 1);
    return p[key as "name"];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }])), [scope.owners, taxes]);
  const rows = sortRows(filtered, table.sort, accessors);
  const selected = store.properties.find(p => p.id === params.get("property"));
  const activeProperty = adding ?? selected;
  const close = () => { if (busy) return; setAdding(null); setEditing(false); setRemoving(false); setRemoveError(""); const next = new URLSearchParams(params); next.delete("property"); setParams(next, { replace: true }); };
  useEffect(() => { if (activeProperty && !dialog.current?.open) dialog.current?.showModal(); else if (!activeProperty && dialog.current?.open) dialog.current.close(); }, [activeProperty]);
  const open = (p: Property) => { setEditing(false); setRemoving(false); setRemoveError(""); const next = new URLSearchParams(params); next.set("property", p.id); setParams(next); };
  const coverage = (t: ReturnType<typeof propertyTotal>) => t.count && t.known < t.count ? `${t.known} of ${t.count} properties` : `${t.count} ${t.count === 1 ? "property" : "properties"}`;
  const sum = (key: Summed) => propertyTotal(filtered, key, scope.owners);
  const missingName = (p: Property, id: Summed) => (id === "cost" || id === "gain") && receivedWithoutPurchase(p) && p.cost === null ? `${propertyLabel(p)} (${p.acquisition.toLowerCase()}, no cost entered)` : propertyLabel(p);
  const metric = (id: Summed, label: string, icon: ReactNode): TileMetric => {
    const total = sum(id);
    const note = id === "cost" ? receivedNote(filtered, scope.owners) : "";
    return { id: id === "netRent" ? "net-rent" : id, label, value: money(total.value, { compact: true }), sub: `${coverage(total)}${note ? ` · ${note}` : ""}`, icon,
      detail: `${shareTitle}${total.known < total.count ? ` Missing: ${filtered.filter(p => propertyFigures(p, scope.owners)[id] === null).map(p => missingName(p, id)).join(", ")}.` : ""}` };
  };
  const taxTotal = (key: TaxKey) => {
    const figures = filtered.map(p => taxFigure(taxOf(p), key)), known = figures.filter((n): n is number => n !== null);
    return { value: known.length ? known.reduce((s, n) => s + n, 0) : null, known: known.length, count: filtered.length };
  };
  const taxMissing = (key: TaxKey) => filtered.filter(p => taxFigure(taxOf(p), key) === null).map(p => `${propertyLabel(p)} (${taxOf(p).gap?.short ?? (key === "indexedCost" ? "not indexed" : "not known")})`).join(", ");
  const taxMetric = (key: "tax" | "afterTax", label: string, icon: ReactNode): TileMetric => {
    const total = taxTotal(key);
    return { id: key === "afterTax" ? "after-tax" : key, label, value: money(total.value, { compact: true }), sub: coverage(total), icon,
      detail: `If sold on ${fmtDate(asOf)} (FY ${financialYear(asOf)}). ${key === "afterTax" ? "Current value less the estimated tax on its gain. " : ""}${TAX_RULES} ${shareTitle}${total.known < total.count ? ` Missing: ${taxMissing(key)}.` : ""}` };
  };
  const metrics = [metric("value", "Property value", <Building2 className="h-4 w-4" />), metric("cost", "Total cost", <Wallet className="h-4 w-4" />), metric("gain", "Appreciation", <TrendingUp className="h-4 w-4" />), taxMetric("tax", "Est. tax on sale", <Receipt className="h-4 w-4" />), taxMetric("afterTax", "Value after tax", <Scale className="h-4 w-4" />), metric("rent", "Monthly rent", <Banknote className="h-4 w-4" />), metric("debt", "Loan outstanding", <Landmark className="h-4 w-4" />), metric("emi", "EMI / month", <Landmark className="h-4 w-4" />), metric("netRent", "Net monthly rent", <Banknote className="h-4 w-4" />)];
  const filterSelect = (key: string, value: string, label: string, values: string[]) => <select aria-label={label} value={value} onChange={e => setFilter(key, e.target.value)} className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-slate-200">
    <option value="">{label}</option>{distinct(value ? [...values, value] : values).map(v => <option key={v} value={v}>{v}</option>)}
  </select>;
  const empty = store.loading ? "Loading properties…" : store.error && !store.ready ? "Properties unavailable" : scoped.length === 0 ? scope.owners ? "No properties for the selected members" : "No properties added" : "No matching properties";
  const figures = selected ? wholePropertyFigures(selected) : null;
  // Details show every recorded owner's working, whatever members are selected.
  const saleTax = selected ? propertyGainsTax(selected, { asOf }) : null;
  const inlineGap = (reason: string, short: string) => <span title={reason}><AbsentValue /> <span className="text-xs text-slate-500">{short}</span></span>;
  const appreciation = (p: Property, f: PropertyFigures): ReactNode => {
    const why = appreciationGap(p);
    if (why) return inlineGap(why.reason, why.short);
    return <span className={f.gain! > 0 ? "text-gain" : f.gain! < 0 ? "text-loss" : ""}>{money(f.gain, { sign: true })} · {fmtPct(f.gainPct, { sign: true })}{receivedWithoutPurchase(p) && <span className="text-xs text-slate-500"> since {p.acquisition === "Inherited" ? "inheritance" : "gift"}</span>}</span>;
  };
  const indexWorking = (t: PropertyGainsTax) => t.acquiredOn === null || t.indexedCost === null ? t.indexGap
    : `${t.basisLabel} ${money(t.basis)} indexed from FY ${indexYear(t.acquiredOn)} (CII ${t.acquisitionIndex}) to FY ${t.fy} (CII ${t.saleIndex})${t.improvementsCounted ? `, plus ${t.improvementsCounted} improvement${t.improvementsCounted === 1 ? "" : "s"} each from its own year` : ""}: ${money(t.indexedCost)} for the whole property.`;
  const taxWorking = (t: PropertyGainsTax) => `If sold on ${date(t.asOf)} at the current value (FY ${t.fy}). ${t.notCapitalAsset ? "Rural agricultural land is not a capital asset." : t.owners.map(o => `${o.name || "Owner not entered"} (${o.status}): ${o.route === "none" ? "no gain, ₹0"
    : o.route === "indexed" ? `${pctRate(INDEXED_RATE)} with indexation ${money(o.tax)}, lower than ${pctRate(LONG_TERM_RATE)} without at ${money(o.flatTax)}` : `${pctRate(LONG_TERM_RATE)} without indexation ${money(o.tax)}`}`).join("; ")}. ${TAX_RULES}`;
  const numeric = new Set(["area", "cost", "value", "gain", "gainPct", "tax", "afterTax", "indexedCost", "rent", "yield", "debt", "emi", "equity", "netRent"]);
  const cell = (p: Property, key: string): ReactNode => {
    const f = propertyFigures(p, scope.owners);
    if (key === "cost" && receivedWithoutPurchase(p) && f.share !== null) return f.cost === null
      ? gap(`${p.acquisition}, so there is no purchase cost. ${costLabel(p)} not entered.`, `${p.acquisition} · no cost`)
      : <span title={`${costLabel(p)}, entered in place of a purchase cost. ${shareTitle}`}>{money(f.cost)}<span data-export-ignore className="mt-1 block font-sans text-[10px] text-slate-500">{receivedTag(p)}</span></span>;
    if (key === "gain" || key === "gainPct") {
      const why = appreciationGap(p);
      if (why) return gap(why.reason, why.short);
      if (key === "gain" && f.gain === null) return <span title={shareMissing}><AbsentValue /></span>;
      const n = key === "gain" ? f.gain! : f.gainPct!;
      return <span className={n > 0 ? "text-gain" : n < 0 ? "text-loss" : ""} title={`Current value less ${costLabel(p).toLowerCase()}${key === "gainPct" ? `, as a share of the ${costLabel(p).toLowerCase()}. Whole property.` : `. ${shareTitle}`}`}>
        {key === "gain" ? money(n, { sign: true }) : fmtPct(n, { sign: true })}
        {receivedWithoutPurchase(p) && <span data-export-ignore className="mt-1 block font-sans text-[10px] text-slate-500">Since {p.acquisition === "Inherited" ? "inheritance" : "gift"}</span>}
      </span>;
    }
    if (TAX_KEYS.has(key)) {
      const t = taxOf(p), sub = (text: string) => <span data-export-ignore className="mt-1 block font-sans text-[10px] text-slate-500">{text}</span>;
      if (key === "holding") return t.longTerm === null ? gap(t.gap?.reason ?? "Not known", t.gap?.short ?? "Not known")
        : <span title={`Counted from ${t.received ? "the previous owner's acquisition" : "the purchase"} on ${date(t.acquiredOn)}. Long-term after more than 24 months.`}>{t.longTerm ? "Long-term" : "Short-term"}{sub(`${t.longTerm ? "Since" : "Long-term from"} ${date(t.longTermFrom)}`)}</span>;
      if (key === "indexedCost") {
        if (t.indexedCost === null) return t.cost === null && t.gap ? gap(t.gap.reason, t.gap.short) : t.notCapitalAsset ? gap("Rural agricultural land is not a capital asset.", "Not a capital asset") : gap(t.indexGap, "Not indexed");
        if (t.share === null) return <span title={shareMissing}><AbsentValue /></span>;
        return <span title={`${indexWorking(t)} ${t.option?.note ?? ""} ${shareTitle}`}>{money(t.indexedCost * t.share)}{t.option?.open === false && sub("Not used for tax")}</span>;
      }
      const n = t[key as "tax" | "afterTax"];
      if (n === null) return gap(t.gap?.reason ?? "Not known", t.gap?.short ?? "Not known");
      return <span title={`${taxWorking(t)} ${shareTitle}`}>{money(n)}{key === "tax" && t.route && sub(t.route)}</span>;
    }
    if (["cost", "value", "rent", "debt", "emi", "equity", "netRent"].includes(key)) return f[key as "cost"] === null ? <span title={f.share === null ? shareMissing : key === "equity" ? "Needs current value and loan outstanding" : key === "netRent" ? "Needs monthly rent and monthly costs" : "Not entered"}><AbsentValue /></span> : <span title={`${shareTitle}${p.valuationDate && key === "value" ? ` Valued ${date(p.valuationDate)}.` : ""}`}>{money(f[key as "cost"])}</span>;
    switch (key) {
      case "name": return <div className="flex items-center gap-2"><button type="button" onClick={() => open(p)} className="text-left font-medium text-slate-100 hover:text-champagne-400 underline decoration-ink-600 underline-offset-4">{propertyLabel(p)}</button><button type="button" aria-label={`Edit ${propertyLabel(p)}`} title="Edit property" className="shrink-0 text-slate-500 hover:text-champagne-400" onClick={() => { open(p); setEditing(true); }}><Pencil className="h-3 w-3" /></button></div>;
      case "location": return <span title={[p.address, p.pincode].filter(Boolean).join(", ")}>{location(p) || DASH}</span>;
      case "owners": return <span title={ownerNames(p)}>{ownerNames(p)}</span>;
      case "type": return !p.type ? <AbsentValue /> : <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: TYPES_COLOR[p.type] }} />{p.type}</span>;
      case "area": return p.area === null ? <span title="Area not entered"><AbsentValue /></span> : <span title={`${p.areaBasis} area · whole property`}>{fmtNum(p.area, 2).replace(/\.00$/, "")} {p.areaUnit}</span>;
      case "yield": return <span title={f.yield === null ? "Needs monthly rent and a current value above zero" : "Annual gross rent ÷ current value. Excludes expenses and financing."}>{fmtPct(f.yield)}</span>;
      case "earmark": return isEarmarked(p)
        ? <span data-earmark data-export-value={earmarkLabel(p)} title={earmarkTitle(p)} className="block"><span className="inline-flex items-center gap-1.5 text-slate-200"><Gift className="h-3 w-3 shrink-0 text-champagne-400" />{p.earmark!.recipient || <AbsentValue />}</span><span className="mt-1 block font-sans text-[10px] text-slate-500">{p.earmark!.recipient ? "To be gifted" : "To be gifted · recipient not entered"}</span></span>
        : <span className="text-xs text-slate-500">Not earmarked</span>;
      case "pin": return <button type="button" data-export-value={hasPin(p) ? `${p.latitude}, ${p.longitude}` : "Pin needed"} onClick={() => { open(p); if (!hasPin(p)) setEditing(true); }} className={`inline-flex items-center gap-1 text-xs ${hasPin(p) ? "text-champagne-400" : "text-slate-500"}`}><MapPin className="h-3 w-3" />{hasPin(p) ? "View" : "Pin needed"}</button>;
      case "purchasedOn": case "valuationDate": case "leaseEnd": return <span title={p[key] ? undefined : "Not entered"}>{date(p[key])}</span>;
      default: return p[key as "status"] || <span title="Not entered"><AbsentValue /></span>;
    }
  };
  return <div>
    <PageHeader eyebrow="Daily" title="Real Estate" right={<div className="flex flex-wrap items-center gap-2"><PropertyBulkEntry shown={scoped} all={store.properties} members={scope.options} ready={store.ready} onSaved={() => void store.reload()} /><button type="button" className="btn-primary" disabled={!store.ready} onClick={() => { setAdding(emptyProperty()); setEditing(true); }}><Plus className="h-4 w-4" />Add property</button></div>} />
    {store.error && <div role="alert" className="mb-4 flex items-center gap-3 rounded-lg border border-ink-600 bg-ink-800 p-3 text-sm text-loss">{store.error}<button type="button" className="btn-ghost" onClick={() => void store.reload()}>Retry</button></div>}
    <SelectableTiles page="real-estate" storageKey="glow:realEstateTiles:v1" defaults={DEFAULT_TILES} metrics={metrics} showSavedWhere={false} />
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
        <select aria-label="All earmarks" value={earmark} onChange={e => setFilter("earmark", e.target.value)} className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-slate-200" data-earmark-filter>
          <option value="">All earmarks</option><option value={EARMARKED}>Earmarked / to be gifted</option>
          {distinct([...scoped.filter(isEarmarked).map(p => p.earmark!.recipient), ...(earmark.startsWith(TO) ? [earmark.slice(TO.length)] : [])]).map(r => <option key={r} value={`${TO}${r}`}>To be gifted to {r}</option>)}
          <option value={NOT_EARMARKED}>Not earmarked</option>
        </select>
        {(q || country || state || city || type || status || earmark) && <button type="button" className="text-xs text-champagne-400 underline" onClick={() => { const next = new URLSearchParams(params); ["q", "state", "city", "country", "type", "status", "earmark"].forEach(k => next.delete(k)); setParams(next, { replace: true }); }}>Clear filters</button>}
        <span className="ml-auto text-xs text-slate-500" title={shareTitle}>Selected owners’ share</span>
      </div>
      {view === "table" ? <div className="overflow-x-auto" data-navigation-scroll="realestate-1"><ExportableTable exportName="Real Estate — Properties" className="min-w-full text-[13px]" data-real-estate-table>
        <thead className="border-b border-ink-700"><Tr view={table}>{COLS.map(key => <SortHeader key={key} col={key} view={table} align={numeric.has(key) ? "right" : "left"} pad="px-3 py-2" title={numeric.has(key) && key !== "area" && key !== "yield" ? shareTitle : undefined} className={key === "name" ? "min-w-[12rem]" : ""}>{LABELS[key]}</SortHeader>)}</Tr></thead>
        <tbody>{rows.map(p => <Tr key={p.id} view={table} inputRecordId={`property:${p.id}`} className="border-b border-ink-700/50" data-property={p.id}>{COLS.map(key => <td key={key} className={`px-3 py-3 ${numeric.has(key) ? "text-right mono tabular whitespace-nowrap" : "text-slate-300"} ${key === "owners" ? "min-w-[10rem] max-w-[15rem] text-xs" : ""}`}>{cell(p, key)}</td>)}</Tr>)}
          {!rows.length && <tr><td colSpan={table.order.length} className="px-5 py-14 text-center text-sm text-slate-500">{empty}{store.ready && !scoped.length && !scope.owners && <button type="button" className="mx-auto mt-3 block text-champagne-400 underline" onClick={() => { setAdding(emptyProperty()); setEditing(true); }}>Add property</button>}</td></tr>}
        </tbody>
        {!!rows.length && <tfoot><TrFoot view={table} label="Total" className="border-t border-ink-600 bg-ink-800/50 font-semibold" cells={{ ...Object.fromEntries((["cost", "value", "gain", "rent", "debt", "emi", "equity", "netRent"] as const).map(key => { const total = sum(key); const note = key === "cost" ? receivedNote(filtered, scope.owners) : ""; return [key, <td key={key} className="px-3 py-3 text-right mono tabular whitespace-nowrap" title={shareTitle}>{key === "gain" ? money(total.value, { sign: true }) : money(total.value)}{(total.known < total.count || note) && <span data-export-ignore className="mt-1 block font-sans text-[10px] font-normal text-slate-500">{[total.known < total.count ? coverage(total) : "", note].filter(Boolean).join(" · ")}</span>}</td>]; })),
          ...Object.fromEntries((["tax", "afterTax", "indexedCost"] as const).map(key => { const total = taxTotal(key); return [key, <td key={key} className="px-3 py-3 text-right mono tabular whitespace-nowrap" title={`${key === "indexedCost" ? "Each property's cost for tax, indexed to this year." : TAX_RULES} ${shareTitle}${total.known < total.count ? ` Missing: ${taxMissing(key)}.` : ""}`}>{money(total.value)}{total.known < total.count && <span data-export-ignore className="mt-1 block font-sans text-[10px] font-normal text-slate-500">{coverage(total)}</span>}</td>]; })) }} /></tfoot>}
      </ExportableTable></div> : <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0"><Suspense fallback={<div className="p-16 text-sm text-slate-400">Loading map…</div>}><PropertyMap properties={filtered} onSelect={open} /></Suspense>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-700 px-4 py-2 text-xs text-slate-400">{distinct(filtered.map(p => p.type)).map(t => <span key={t} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: TYPES_COLOR[t] }} />{t}</span>)}<span className="ml-auto">{filtered.filter(hasPin).length} pinned · {filtered.filter(p => !hasPin(p)).length} need a pin</span></div>
        </div>
        <div className="max-h-[590px] overflow-y-auto border-t border-ink-700 lg:border-l lg:border-t-0" data-navigation-scroll="realestate-2">
          {!filtered.length && <p className="px-4 py-10 text-center text-sm text-slate-500">{empty}</p>}
          {filtered.map(p => <button type="button" key={p.id} onClick={() => open(p)} className="block w-full border-b border-ink-700 p-4 text-left hover:bg-ink-700/30"><span className="block font-medium text-slate-100">{propertyLabel(p)}</span><span className="mt-1 block text-xs text-slate-400">{[p.type, location(p)].filter(Boolean).join(" · ") || "Details not entered"}</span>{isEarmarked(p) && <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-300" title={earmarkTitle(p)}><Gift className="h-3 w-3 shrink-0 text-champagne-400" />{earmarkLabel(p)}</span>}<span className="mt-2 flex justify-between gap-2 text-xs"><span className="mono text-slate-200">{money(propertyFigures(p, scope.owners).value)}</span><span className={hasPin(p) ? "text-champagne-400" : "text-slate-500"}>{hasPin(p) ? "View property" : "Pin needed"}</span></span></button>)}
        </div>
      </div>}
    </Card>
    <dialog ref={dialog} aria-labelledby="property-dialog-title" onCancel={e => { e.preventDefault(); close(); }} onClose={() => { if (activeProperty) close(); }} className="property-dialog card w-[min(62rem,calc(100%-2rem))] max-h-[90vh] overflow-y-auto p-5 text-slate-200 backdrop:bg-black/50" data-navigation-scroll="realestate-3">
      {activeProperty && <><div className="mb-5 flex items-start justify-between gap-4"><h2 id="property-dialog-title" className="font-display text-lg font-bold text-slate-100">{adding ? "Add property" : propertyLabel(activeProperty)}</h2><button type="button" className="btn-ghost" aria-label="Close property" disabled={busy} onClick={close}><X className="h-4 w-4" /></button></div>
        {editing || adding ? <PropertyEditor key={activeProperty.id} property={activeProperty} members={scope.options} onCancel={adding ? close : () => setEditing(false)} onSave={async p => {
          setBusy(true); const reply = await store.mutate({ op: "save", property: p }); setBusy(false);
          if (reply.ok) { setAdding(null); setEditing(false); const next = new URLSearchParams(params); next.set("property", p.id); setParams(next, { replace: true }); }
          return reply;
        }} /> : selected && figures && <>
          <div className="mb-4 flex flex-wrap items-center gap-3"><span className="text-sm text-slate-400">{[selected.type, selected.status].filter(Boolean).join(" · ")}</span><button type="button" className="btn-primary ml-auto" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" />Edit property</button></div>
          {selected.earmark && <div data-earmark className="mb-4 rounded-lg border border-ink-600 bg-ink-800 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-slate-100" title={EARMARK_MARKER_ONLY}><Gift className="h-4 w-4 shrink-0 text-champagne-400" />{earmarkLabel(selected)}</p>
            {selected.earmark.note && <p className="mt-1 whitespace-pre-wrap text-slate-300">{selected.earmark.note}</p>}
          </div>}
          <p className="mb-3 text-xs text-slate-400">Whole-property figures</p>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ["Address", [selected.address, location(selected), selected.pincode].filter(Boolean).join(", ") || DASH], ["Owner / share", ownerNames(selected)], ["Area", selected.area === null ? DASH : [`${fmtNum(selected.area, 2).replace(/\.00$/, "")} ${selected.areaUnit}`.trim(), selected.areaBasis].filter(Boolean).join(" · ")],
              ["Current value", money(figures.value)], ["Valued on", date(selected.valuationDate)], ["Acquisition", selected.acquisition],
              [costLabel(selected), figures.cost === null && receivedWithoutPurchase(selected) ? inlineGap(`${selected.acquisition}, so there is no purchase cost. ${costLabel(selected)} not entered.`, "Not entered") : money(figures.cost)],
              [acquiredOnLabel(selected), date(selected.purchasedOn)], ["Appreciation", appreciation(selected, figures)], ["Loan outstanding", money(figures.debt)], ["EMI / month", money(figures.emi)], ["Net equity", money(figures.equity)],
              ["Monthly rent", money(figures.rent)], ["Monthly costs", money(figures.costs)], ["Net monthly rent", money(figures.netRent)], ["Gross rental yield", fmtPct(figures.yield)], ["Tenant", selected.tenant || "—"], ["Lease ends", date(selected.leaseEnd)], ["Title", selected.titleStatus],
            ] as [string, ReactNode][]).map(([label, value]) => <div key={label}><dt className="label-xs">{label}</dt><dd className="mt-1 text-sm text-slate-200">{value || DASH}</dd></div>)}
          </dl>
          {saleTax && <section className="mt-5 border-t border-ink-700 pt-4" data-property-tax>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="h-section" title={TAX_RULES}>Capital gains tax if sold today</h3><span className="text-xs text-slate-400" title="Date of the sale this assumes, its financial year and that year's Cost Inflation Index">{fmtDate(asOf)} · FY {saleTax.fy} · CII {saleTax.saleIndex ?? "not notified"}</span></div>
            {saleTax.notCapitalAsset ? <p className="text-sm text-slate-200" title="Rural agricultural land is not a capital asset, so selling it carries no capital gains tax.">{money(0)} · not a capital asset</p>
              : saleTax.cost === null ? <p className="text-sm">{inlineGap(saleTax.gap?.reason ?? "Not known", saleTax.gap?.short ?? "Not known")}</p> : <>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  ["Holding", <span title={`Long-term after more than 24 months, counted from ${saleTax.received ? "the previous owner's acquisition" : "the purchase"}.`}>{saleTax.longTerm ? `Long-term since ${date(saleTax.longTermFrom)}` : `Short-term · long-term from ${date(saleTax.longTermFrom)}`}</span>],
                  [saleTax.basisLabel, <span title={saleTax.received ? "An inherited or gifted property carries the previous owner's cost." : undefined}>{money(saleTax.basis)}</span>],
                  ["Improvements counted", saleTax.improvements ? <span title={saleTax.improvementsBefore2001 ? `${saleTax.improvementsBefore2001} made before 1 Apr 2001 do not count.` : undefined}>{money((saleTax.cost ?? 0) - (saleTax.basis ?? 0))} · {saleTax.improvementsCounted} of {saleTax.improvements}</span> : "None entered"],
                  ["Gain without indexation", money(saleTax.gain, { sign: true })],
                  ["Indexed cost", saleTax.indexedCost === null ? inlineGap(saleTax.indexGap, "Not indexed") : <span title={`${indexWorking(saleTax)} ${saleTax.option?.note ?? ""}`}>{money(saleTax.indexedCost)}</span>],
                  ["Gain with indexation", saleTax.indexedGain === null ? inlineGap(saleTax.indexGap, "Not indexed") : money(saleTax.indexedGain, { sign: true })],
                  ["Tax payable", saleTax.tax === null ? inlineGap(saleTax.gap?.reason ?? "Not known", saleTax.gap?.short ?? "Not known") : <span title={taxWorking(saleTax)}>{money(saleTax.tax)}{saleTax.route && <span className="text-xs text-slate-500"> · {saleTax.route}</span>}</span>],
                  ["Value after tax", saleTax.afterTax === null ? inlineGap(saleTax.gap?.reason ?? "Not known", "Needs the tax") : <span title="Recorded owners' share of the current value, less the tax.">{money(saleTax.afterTax)}</span>],
                ] as [string, ReactNode][]).map(([label, value]) => <div key={label}><dt className="label-xs">{label}</dt><dd className="mt-1 text-sm text-slate-200">{value}</dd></div>)}
              </dl>
              {saleTax.owners.length > 0 && <div className="mt-4 overflow-x-auto" data-navigation-scroll="realestate-4"><ExportableTable exportName="Real Estate — Tax by owner" className="min-w-full text-[13px]" data-property-tax-owners data-table-static="one row per owner, each the working of the same sale's tax">
                <thead className="border-b border-ink-700 text-left"><tr className="label-xs">
                  <th className="px-3 py-2">Owner</th><th className="px-3 py-2 text-right">Share</th><th className="px-3 py-2" title="Resident individuals and HUFs may take the 20%-with-indexation ceiling, recorded from their own statements">Status</th>
                  <th className="px-3 py-2 text-right">{pctRate(LONG_TERM_RATE)} without indexation</th><th className="px-3 py-2 text-right">{pctRate(INDEXED_RATE)} with indexation</th><th className="px-3 py-2 text-right">Tax payable</th>
                </tr></thead>
                <tbody>{saleTax.owners.map((o, i) => {
                  const shortTerm = !saleTax.longTerm && o.route !== "none";
                  const rate = (n: number | null, indexed: boolean) => shortTerm ? inlineGap("Short-term: taxed at the owner's slab rate.", "Short-term")
                    : indexed && saleTax.option?.open === false ? inlineGap(saleTax.option.note, "After 23 Jul 2024")
                    : indexed && o.eligible === false ? inlineGap(o.holderNote, "Not available")
                    : n === null ? inlineGap(saleTax.indexGap, "Not indexed") : money(n);
                  return <tr key={i} className="border-b border-ink-700/50">
                    <td className="px-3 py-2 text-slate-200">{o.name || "Owner not entered"}</td><td className="px-3 py-2 text-right mono">{fmtPct(o.share * 100)}</td>
                    <td className="px-3 py-2 text-slate-300" title={o.holderNote}>{o.status}</td>
                    <td className="px-3 py-2 text-right mono">{rate(o.flatTax, false)}</td><td className="px-3 py-2 text-right mono">{rate(o.indexedTax, true)}</td>
                    <td className="px-3 py-2 text-right mono">{o.tax === null ? inlineGap(o.gap?.reason ?? "Not known", o.gap?.short ?? "Not known") : <span title={o.note}>{money(o.tax)}</span>}</td>
                  </tr>;
                })}</tbody>
              </ExportableTable></div>}
            </>}
          </section>}
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
