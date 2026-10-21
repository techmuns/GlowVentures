import { lazy, Suspense, useMemo, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { TextField, SelectField } from "@/components/FormBits";
import { PROPERTY_TYPES, PROPERTY_STATUSES, AREA_UNITS, TITLE_STATUSES, validateProperty, type Property, type PropertyOwner } from "@/lib/realEstate";
const PropertyMap = lazy(() => import("./PropertyMap"));
const options = (values: string[]) => values.map(value => ({ value, label: value }));
const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value.replace(/,/g, ""));
const str = (value: number | null) => value === null ? "" : String(value);
export function emptyProperty(): Property {
  return { id: crypto.randomUUID(), name: "", type: "Apartment", address: "", city: "", state: "", country: "India", pincode: "",
    owners: [{ ownerId: null, name: "", share: 100 }], area: null, areaUnit: "sq ft", areaBasis: "Carpet",
    cost: null, value: null, monthlyRent: 0, monthlyCosts: null, debt: null,
    purchasedOn: null, valuationDate: null, leaseEnd: null, status: "Vacant", tenant: "", titleStatus: "Not checked", notes: "", latitude: null, longitude: null };
}
export function PropertyEditor({ property, members, onSave, onCancel }: {
  property: Property; members: { ownerId: string; label: string }[];
  onSave: (p: Property) => Promise<{ ok: boolean; message?: string }>; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(property);
  const [numbers, setNumbers] = useState(() => Object.fromEntries(["area", "cost", "value", "monthlyRent", "monthlyCosts", "debt", "latitude", "longitude"].map(key => [key, str(property[key as "area"])])));
  const [shares, setShares] = useState(() => property.owners.map(o => String(o.share)));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Property>(key: K, value: Property[K]) => setDraft(p => ({ ...p, [key]: value }));
  const point = useMemo<[number, number] | null>(() => {
    const lat = optionalNumber(numbers.latitude), lng = optionalNumber(numbers.longitude);
    return lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
  }, [numbers.latitude, numbers.longitude]);
  const numberField = (key: string, label: string, hint?: string) => <TextField key={key} label={label} value={numbers[key]} onChange={value => setNumbers(n => ({ ...n, [key]: value }))} hint={hint} placeholder="Not entered" />;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const candidate = { ...draft, ...Object.fromEntries(Object.entries(numbers).map(([key, value]) => [key, optionalNumber(value)])),
      owners: draft.owners.map((o, i) => ({ ...o, share: optionalNumber(shares[i]) })) };
    const checked = validateProperty(candidate);
    if (!checked.property) { setError(checked.error); return; }
    setBusy(true); setError("");
    const reply = await onSave(checked.property);
    if (!reply.ok) { setError(reply.message || "Property could not be saved."); setBusy(false); }
  };
  const ownerChange = (index: number, patch: Partial<PropertyOwner>) => set("owners", draft.owners.map((o, i) => i === index ? { ...o, ...patch } : o));
  return <form onSubmit={save} className="space-y-5" aria-label="Property editor">
    <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="Property name *" value={draft.name} onChange={v => set("name", v)} mono={false} />
        <SelectField label="Property type" value={draft.type} options={options(PROPERTY_TYPES)} onChange={v => { setDraft(p => ({ ...p, type: v, areaBasis: v === "Land" || v === "Farmhouse" ? "Plot" : p.areaBasis })); }} />
        <SelectField label="Status" value={draft.status} options={options(PROPERTY_STATUSES)} onChange={v => { set("status", v); setNumbers(n => ({ ...n, monthlyRent: ["Rented", "For sale"].includes(v) ? "" : "0" })); }} />
        <TextField label="Address / survey no. *" value={draft.address} onChange={v => set("address", v)} mono={false} />
        <TextField label="City / district *" value={draft.city} onChange={v => set("city", v)} mono={false} />
        <TextField label="State" value={draft.state} onChange={v => set("state", v)} mono={false} />
        <TextField label="Country *" value={draft.country} onChange={v => set("country", v)} mono={false} />
        <TextField label="PIN / postal code" value={draft.pincode} onChange={v => set("pincode", v)} />
        <TextField label="Purchase date" value={draft.purchasedOn ?? ""} type="date" onChange={v => set("purchasedOn", v || null)} />
        {numberField("area", "Area")}
        <SelectField label="Area unit" value={draft.areaUnit} options={options(AREA_UNITS)} onChange={v => set("areaUnit", v)} />
        <SelectField label="Area basis" value={draft.areaBasis} options={options(["Plot", "Carpet", "Built-up", "Super built-up"])} onChange={v => set("areaBasis", v)} />
      </div>
      <div className="border-t border-ink-700 pt-4">
        <div className="mb-3 flex items-center gap-3"><h3 className="h-section">Ownership</h3><button type="button" className="btn-ghost text-xs" onClick={() => { set("owners", [...draft.owners, { ownerId: null, name: "", share: 0 }]); setShares(s => [...s, ""]); }}><Plus className="h-3 w-3" />Add owner</button></div>
        <datalist id="property-owner-options">{members.map(m => <option key={m.ownerId} value={m.label} />)}</datalist>
        <div className="space-y-2">{draft.owners.map((o, i) => <div className="flex items-end gap-3" key={i}>
          <label className="block flex-1"><span className="label-xs">Owner / entity *</span><input className="property-input mt-1" aria-label={`Owner ${i + 1}`} list="property-owner-options" value={o.name} onChange={e => ownerChange(i, { name: e.target.value, ownerId: members.find(m => m.label.toLowerCase() === e.target.value.trim().toLowerCase())?.ownerId ?? null })} /></label>
          <div className="w-28"><TextField label="Share % *" value={shares[i]} onChange={v => setShares(s => s.map((share, j) => i === j ? v : share))} /></div>
          {draft.owners.length > 1 && <button type="button" className="btn-ghost mb-0.5" aria-label={`Remove owner ${i + 1}`} onClick={() => { set("owners", draft.owners.filter((_, j) => i !== j)); setShares(s => s.filter((_, j) => i !== j)); }}><X className="h-4 w-4" /></button>}
        </div>)}</div>
      </div>
      <div className="border-t border-ink-700 pt-4">
        <h3 className="h-section mb-3">Value & income · INR · whole property</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {numberField("cost", "Total cost (₹)", "Include stamp duty, registration and improvements.")}
          {numberField("value", "Current value (₹)")}
          <TextField label="Valuation date" value={draft.valuationDate ?? ""} type="date" onChange={v => set("valuationDate", v || null)} />
          {["Rented", "For sale"].includes(draft.status) && numberField("monthlyRent", "Monthly rent (₹)")}
          {numberField("monthlyCosts", "Monthly costs (₹)", "Maintenance, property tax and other recurring costs; enter the monthly equivalent.")}
          {numberField("debt", "Loan outstanding (₹)", "Enter 0 if there is no loan.")}
        </div>
      </div>
      <details className="border-t border-ink-700 pt-4" open={draft.status === "Rented" ? true : undefined}>
        <summary className="h-section cursor-pointer">Lease & title</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="Tenant" value={draft.tenant} onChange={v => set("tenant", v)} mono={false} />
          <TextField label="Lease ends" value={draft.leaseEnd ?? ""} type="date" onChange={v => set("leaseEnd", v || null)} />
          <SelectField label="Title status" value={draft.titleStatus} options={options(TITLE_STATUSES)} onChange={v => set("titleStatus", v)} />
          <TextField label="Notes" value={draft.notes} onChange={v => set("notes", v)} wide mono={false} />
        </div>
      </details>
      <details className="border-t border-ink-700 pt-4" open={!point || undefined}>
        <summary className="h-section cursor-pointer">Map pin {point ? "· set" : "· not set"}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {numberField("latitude", "Latitude")}{numberField("longitude", "Longitude")}
        </div>
        <div className="my-3 flex flex-wrap items-center gap-3 text-xs text-slate-400"><span>Enter coordinates or click the exact location on the map.</span>
          {point && <button type="button" className="underline" onClick={() => setNumbers(n => ({ ...n, latitude: "", longitude: "" }))}>Clear pin</button>}
          <a className="text-champagne-400 underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([draft.address, draft.city, draft.state, draft.country].filter(Boolean).join(", "))}`} target="_blank" rel="noopener noreferrer">Find address ↗</a>
        </div>
        <Suspense fallback={<div className="p-8 text-sm text-slate-400">Loading map…</div>}><PropertyMap point={point} onPick={(lat, lng) => setNumbers(n => ({ ...n, latitude: lat.toFixed(7), longitude: lng.toFixed(7) }))} /></Suspense>
      </details>
    </fieldset>
    {error && <p role="alert" className="text-sm text-loss">{error}</p>}
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-700 bg-ink-900 py-3">
      <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save property"}</button>
    </div>
  </form>;
}
