import { lazy, Suspense, useEffect, useRef, useMemo, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { TextField, SelectField, CheckField } from "@/components/FormBits";
import { PROPERTY_TYPES, PROPERTY_STATUSES, AREA_UNITS, AREA_BASES, TITLE_STATUSES, ACQUISITION_TYPES, EARMARK_MARKER_ONLY, MAX_IMPROVEMENTS, INDEX_BASE_DATE, costLabel, receivedWithoutPurchase, validateProperty, type Property, type PropertyEarmark, type PropertyOwner } from "@/lib/realEstate";
import { findPropertyAddress, type AddressMatch } from "@/lib/propertyMaps";
const PropertyMap = lazy(() => import("./PropertyMap"));
const options = (values: string[]) => values.map(value => ({ value, label: value }));
const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value.replace(/,/g, ""));
const str = (value: number | null) => value === null ? "" : String(value);
export function emptyProperty(): Property {
  return { id: crypto.randomUUID(), name: "", type: "", address: "", city: "", state: "", country: "India", pincode: "",
    owners: [{ ownerId: null, name: "", share: null }], area: null, areaUnit: "sq ft", areaBasis: "",
    cost: null, value: null, monthlyRent: null, monthlyCosts: null, debt: null, monthlyEmi: null,
    improvements: [], priorCost: null, priorAcquiredOn: null, fmv2001: null, ruralAgricultural: false,
    purchasedOn: null, valuationDate: null, leaseEnd: null, acquisition: "", status: "", tenant: "", titleStatus: "Not checked", notes: "", earmark: null, latitude: null, longitude: null };
}
export function PropertyEditor({ property, members, onSave, onCancel }: {
  property: Property; members: { ownerId: string; label: string }[];
  onSave: (p: Property) => Promise<{ ok: boolean; message?: string }>; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(property);
  const [numbers, setNumbers] = useState(() => Object.fromEntries(["area", "cost", "value", "monthlyRent", "monthlyCosts", "debt", "monthlyEmi", "priorCost", "fmv2001", "latitude", "longitude"].map(key => [key, str(property[key as "area"])])));
  const [improvements, setImprovements] = useState(() => property.improvements.map(i => ({ on: i.on ?? "", amount: str(i.amount) })));
  const [shares, setShares] = useState(() => property.owners.map(o => str(o.share)));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [finding, setFinding] = useState(false);
  const [matches, setMatches] = useState<AddressMatch[]>([]);
  const [locationMessage, setLocationMessage] = useState("");
  const searchId = useRef(0);
  // Unticking and ticking the earmark again keeps what was typed.
  const lastEarmark = useRef<PropertyEarmark>(property.earmark ?? { recipientId: null, recipient: "", note: "" });
  useEffect(() => () => { searchId.current++; }, []);
  const set = <K extends keyof Property>(key: K, value: Property[K]) => {
    if (["address", "city", "state", "country", "pincode"].includes(key)) {
      searchId.current++; setFinding(false); setMatches([]);
      setLocationMessage(numbers.latitude ? "Address changed. Find it again or adjust the existing pin." : "");
    }
    setDraft(p => ({ ...p, [key]: value }));
  };
  const changeStatus = (status: string) => set("status", status);
  const point = useMemo<[number, number] | null>(() => {
    const lat = optionalNumber(numbers.latitude), lng = optionalNumber(numbers.longitude);
    return lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
  }, [numbers.latitude, numbers.longitude]);
  const addressQuery = [draft.address, draft.city, draft.state, draft.pincode, draft.country].map(v => v.trim()).filter(Boolean).join(", ");
  const pick = (lat: number, lng: number) => {
    // A manual click or drag takes precedence over an unfinished address search.
    searchId.current++; setFinding(false); setMatches([]);
    setNumbers(n => ({ ...n, latitude: lat.toFixed(7), longitude: lng.toFixed(7) }));
    setLocationMessage("Pin set. Drag it to adjust the exact spot.");
  };
  const locate = (match: AddressMatch) => {
    setNumbers(n => ({ ...n, latitude: String(match.point[0]), longitude: String(match.point[1]) }));
    setDraft(p => ({ ...p, city: p.city || match.city, state: p.state || match.state, country: match.country || p.country, pincode: p.pincode || match.pincode }));
    setMatches([]); setMapOpen(true);
    setLocationMessage(match.approximate ? "Approximate match. Drag the pin to the exact property." : "Address found. Check the pin and drag it if needed.");
  };
  const find = async () => {
    if (!draft.address.trim()) { setLocationMessage("Enter the property address first."); return; }
    const id = ++searchId.current;
    setFinding(true); setLocationMessage(""); setMatches([]); setMapOpen(true);
    try {
      const results = await findPropertyAddress(addressQuery);
      if (id !== searchId.current) return;
      if (results.length === 1) locate(results[0]);
      else if (results.length) { setMatches(results); setLocationMessage("Choose the matching address."); }
      else setLocationMessage("No address found. Add a nearby landmark or place the pin on the map.");
    } catch (e) { if (id === searchId.current) setLocationMessage(e instanceof Error ? e.message : "Address search failed. Try again."); }
    finally { if (id === searchId.current) setFinding(false); }
  };
  const numberField = (key: string, label: string, hint?: string) => <TextField key={key} label={label} value={numbers[key]} onChange={value => setNumbers(n => ({ ...n, [key]: value }))} hint={hint} placeholder="Not entered" />;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    searchId.current++; setFinding(false);
    const candidate = { ...draft, ...Object.fromEntries(Object.entries(numbers).map(([key, value]) => [key, optionalNumber(value)])),
      owners: draft.owners.map((o, i) => ({ ...o, share: optionalNumber(shares[i]) })),
      improvements: improvements.map(i => ({ on: i.on || null, amount: optionalNumber(i.amount) })) };
    const checked = validateProperty(candidate);
    if (!checked.property) { setError(checked.error); return; }
    setBusy(true); setError("");
    const reply = await onSave(checked.property);
    if (!reply.ok) { setError(reply.message || "Property could not be saved."); setBusy(false); }
  };
  // Held since before 1 Apr 2001, by the family or the previous owner: the value on that date may replace the cost.
  const heldFrom = receivedWithoutPurchase(draft) ? draft.priorAcquiredOn : draft.purchasedOn;
  const heldBefore2001 = heldFrom !== null && heldFrom < INDEX_BASE_DATE;
  const ownerChange = (index: number, patch: Partial<PropertyOwner>) => set("owners", draft.owners.map((o, i) => i === index ? { ...o, ...patch } : o));
  const memberId = (name: string) => members.find(m => m.label.toLowerCase() === name.trim().toLowerCase())?.ownerId ?? null;
  const earmarkChange = (patch: Partial<PropertyEarmark>) => { lastEarmark.current = { ...lastEarmark.current, ...patch }; set("earmark", lastEarmark.current); };
  return <form onSubmit={save} className="space-y-5" aria-label="Property editor">
    <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="Property name" value={draft.name} onChange={v => set("name", v)} mono={false} />
        <SelectField label="Property type" blank="Not entered" value={draft.type} options={options(PROPERTY_TYPES)} onChange={v => { setDraft(p => ({ ...p, type: v, areaBasis: v === "Land" || v === "Farmhouse" ? "Plot" : p.areaBasis })); }} />
        <SelectField label="Status" blank="Not entered" value={draft.status} options={options(PROPERTY_STATUSES)} onChange={changeStatus} />
        <TextField label="Address / survey no." value={draft.address} onChange={v => set("address", v)} mono={false} />
        <TextField label="City / district" value={draft.city} onChange={v => set("city", v)} mono={false} />
        <TextField label="State" value={draft.state} onChange={v => set("state", v)} mono={false} />
        <TextField label="Country" value={draft.country} onChange={v => set("country", v)} mono={false} />
        <TextField label="PIN / postal code" value={draft.pincode} onChange={v => set("pincode", v)} />
        <SelectField label="Acquisition" blank="Not entered" value={draft.acquisition} options={options(ACQUISITION_TYPES)} onChange={v => set("acquisition", v)} />
        <TextField label={draft.acquisition === "Inherited" ? "Date of inheritance" : draft.acquisition === "Gifted" ? "Date of gift" : "Purchase date"} value={draft.purchasedOn ?? ""} type="date" onChange={v => set("purchasedOn", v || null)} />
        {numberField("area", "Area")}
        <SelectField label="Area unit" blank="Not entered" value={draft.areaUnit} options={options(AREA_UNITS)} onChange={v => set("areaUnit", v)} />
        <SelectField label="Area basis" blank="Not entered" value={draft.areaBasis} options={options(AREA_BASES)} onChange={v => set("areaBasis", v)} />
      </div>
      <div className="border-t border-ink-700 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="h-section">Property location</h3>
          <button type="button" className="btn-ghost text-xs" disabled={finding || !draft.address.trim()} onClick={find}>{finding ? "Finding address…" : "Find on map"}</button>
          <button type="button" className="btn-ghost text-xs" onClick={() => setMapOpen(open => !open)}>{mapOpen ? "Hide map" : point ? "Adjust pin" : "Place pin on map"}</button>
          {point && <button type="button" className="text-xs underline text-slate-400" onClick={() => { searchId.current++; setFinding(false); setMatches([]); setNumbers(n => ({ ...n, latitude: "", longitude: "" })); setLocationMessage(""); }}>Clear pin</button>}
          <span className="text-xs text-slate-400">{point ? "Pin set" : "No pin set"}</span>
        </div>
        {locationMessage && <p className="mt-2 text-xs text-slate-400" role="status">{locationMessage}</p>}
        {(mapOpen || matches.length > 0) && <p className="mt-1 text-xs text-slate-400">Address search: <a className="underline" href="https://photon.komoot.io" target="_blank" rel="noopener noreferrer">Photon</a> · © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></p>}
        {matches.length > 0 && <div className="mt-2 grid gap-2" aria-label="Matching addresses">{matches.map((match, i) => <button type="button" key={i} className="rounded-md border border-ink-600 p-3 text-left text-sm hover:bg-ink-800" onClick={() => locate(match)}>{match.label}{match.approximate && <span className="ml-2 text-xs text-slate-400">Approximate</span>}</button>)}</div>}
        {mapOpen && <div className="mt-3">{!locationMessage && <p className="mb-2 text-xs text-slate-400">Drag the pin or click the map to set the exact spot.</p>}<Suspense fallback={<div className="p-8 text-sm text-slate-400">Loading map…</div>}><PropertyMap point={point} onPick={pick} /></Suspense></div>}
      </div>
      <div className="border-t border-ink-700 pt-4">
        <div className="mb-3 flex items-center gap-3"><h3 className="h-section">Family ownership</h3><button type="button" className="btn-ghost text-xs" onClick={() => { set("owners", [...draft.owners, { ownerId: null, name: "", share: null }]); setShares(s => [...s, ""]); }}><Plus className="h-3 w-3" />Add owner</button></div>
        <datalist id="property-owner-options">{members.map(m => <option key={m.ownerId} value={m.label} />)}</datalist>
        <div className="space-y-2">{draft.owners.map((o, i) => <div className="flex items-end gap-3" key={i}>
          <label className="block flex-1"><span className="label-xs">Owner / entity</span><input className="property-input mt-1" aria-label={`Owner ${i + 1}`} list="property-owner-options" value={o.name} onChange={e => ownerChange(i, { name: e.target.value, ownerId: memberId(e.target.value) })} /></label>
          <div className="w-28"><TextField label="Share %" value={shares[i]} onChange={v => setShares(s => s.map((share, j) => i === j ? v : share))} /></div>
          <button type="button" className="btn-ghost mb-0.5" aria-label={`Remove owner ${i + 1}`} onClick={() => { set("owners", draft.owners.filter((_, j) => i !== j)); setShares(s => s.filter((_, j) => i !== j)); }}><X className="h-4 w-4" /></button>
        </div>)}</div>
      </div>
      <div className="border-t border-ink-700 pt-4">
        <div className="flex flex-wrap items-center gap-3"><h3 className="h-section">Earmark</h3><CheckField label="Earmarked / to be gifted" checked={!!draft.earmark} onChange={on => set("earmark", on ? lastEarmark.current : null)} hint={EARMARK_MARKER_ONLY} /></div>
        {draft.earmark && <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block"><span className="label-xs text-slate-400" title="A family member or entity">Intended recipient</span><input className="property-input mt-1" list="property-owner-options" value={draft.earmark.recipient} onChange={e => earmarkChange({ recipient: e.target.value, recipientId: memberId(e.target.value) })} /></label>
          <TextField label="Earmark note" value={draft.earmark.note} onChange={v => earmarkChange({ note: v })} wide mono={false} />
        </div>}
      </div>
      <div className="border-t border-ink-700 pt-4">
        <h3 className="h-section mb-3">Value & income · INR · whole property</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {receivedWithoutPurchase(draft) ? numberField("cost", `${costLabel(draft)} (₹)`, "There is no purchase cost. Leave blank if the value on that date is not known; appreciation then shows as —.")
            : numberField("cost", "Purchase cost (₹)", "Include stamp duty and registration. Add later improvements under Tax basis, with their dates.")}
          {numberField("value", "Current value (₹)")}
          <TextField label="Valuation date" value={draft.valuationDate ?? ""} type="date" onChange={v => set("valuationDate", v || null)} />
          {numberField("monthlyRent", "Monthly rent (₹)")}
          {numberField("monthlyCosts", "Monthly costs (₹)", "Maintenance, property tax and other recurring costs; enter the monthly equivalent.")}
          {numberField("debt", "Loan outstanding (₹)", "Enter 0 if there is no loan.")}
          {numberField("monthlyEmi", "EMI / month (₹)", "The loan's monthly instalment. Enter 0 if there is no loan.")}
        </div>
      </div>
      <div className="border-t border-ink-700 pt-4" data-tax-basis>
        <h3 className="h-section mb-3" title="What capital gains tax on a sale needs beyond the cost: each improvement indexes from its own year; an inherited or gifted property carries the previous owner's cost and date.">Tax basis</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {receivedWithoutPurchase(draft) && numberField("priorCost", "Previous owner's cost (₹)", "What the previous owner paid. Tax on a sale uses it, not the value on the date of inheritance or gift.")}
          {receivedWithoutPurchase(draft) && <TextField label="Previous owner acquired on" value={draft.priorAcquiredOn ?? ""} type="date" onChange={v => set("priorAcquiredOn", v || null)} hint="The holding period and indexation run from this date." />}
          {(heldBefore2001 || numbers.fmv2001 !== "") && numberField("fmv2001", "Value on 1 Apr 2001 (₹)", "Fair market value on 1 Apr 2001, for a property held since before then. Where it is higher than the cost, tax uses it.")}
          {(draft.type === "Land" || draft.type === "Farmhouse" || draft.ruralAgricultural) && <CheckField label="Rural agricultural land" checked={draft.ruralAgricultural} onChange={v => set("ruralAgricultural", v)} hint="Rural agricultural land is not a capital asset: its sale carries no capital gains tax." />}
        </div>
        <div className="mt-3 flex items-center gap-3"><span className="label-xs">Improvements</span><button type="button" className="btn-ghost text-xs" disabled={improvements.length >= MAX_IMPROVEMENTS} onClick={() => setImprovements(rows => [...rows, { on: "", amount: "" }])}><Plus className="h-3 w-3" />Add improvement</button></div>
        <div className="mt-2 space-y-2">{improvements.map((row, i) => <div className="flex items-end gap-3" key={i}>
          <div className="w-44"><TextField label={`Improvement ${i + 1} date`} value={row.on} type="date" onChange={v => setImprovements(rows => rows.map((r, j) => i === j ? { ...r, on: v } : r))} /></div>
          <div className="w-48"><TextField label={`Improvement ${i + 1} amount (₹)`} value={row.amount} placeholder="Not entered" onChange={v => setImprovements(rows => rows.map((r, j) => i === j ? { ...r, amount: v } : r))} /></div>
          <button type="button" className="btn-ghost mb-0.5" aria-label={`Remove improvement ${i + 1}`} onClick={() => setImprovements(rows => rows.filter((_, j) => i !== j))}><X className="h-4 w-4" /></button>
        </div>)}</div>
      </div>
      <details className="border-t border-ink-700 pt-4" open={draft.status === "Rented" ? true : undefined}>
        <summary className="h-section cursor-pointer">Lease & title</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="Tenant" value={draft.tenant} onChange={v => set("tenant", v)} mono={false} />
          <TextField label="Lease ends" value={draft.leaseEnd ?? ""} type="date" onChange={v => set("leaseEnd", v || null)} />
          <SelectField label="Title status" blank="Not entered" value={draft.titleStatus} options={options(TITLE_STATUSES)} onChange={v => set("titleStatus", v)} />
          <TextField label="Notes" value={draft.notes} onChange={v => set("notes", v)} wide mono={false} />
        </div>
      </details>
    </fieldset>
    {error && <p role="alert" className="text-sm text-loss">{error}</p>}
    <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-700 bg-ink-900 py-3">
      <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save property"}</button>
    </div>
  </form>;
}
