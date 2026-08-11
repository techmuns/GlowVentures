import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Search, Users, Tag, MessageSquare, Newspaper, Plus, Download, Upload,
  Trash2, Pencil, X, CalendarDays, HelpCircle, Filter, Link2, ChevronDown, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { Pill } from "@/components/Pill";
import { AbsentSection, absentTile } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  DECISION_STATUSES, EMPTY_FILTER, GEOGRAPHIES, NOTE_ASSET_CLASSES, NOTE_SOURCES, RISK_LEVELS,
  deleteNote, emptyNote, exportKnowledge, facets, filterIsEmpty, importKnowledge,
  readKnowledge, searchNotes, upsertNote,
  type DecisionStatus, type Geography, type KnowledgeNote, type KnowledgeStore,
  type NoteAssetClass, type NoteFilter, type NoteSource, type RiskLevel,
} from "@/lib/knowledge";

// LAYER 1 — KNOWLEDGE & MEMORY, no longer a preview.
//
// This page was a mock on the stated grounds that the layer needed "a note
// store, a tagging model and an AI index". Two of those three were never
// blocked on anything: the muns catalogue searches muns' own corpus and could
// never hold the family's private minutes, so waiting for a vendor was waiting
// for something that was not coming. `src/lib/knowledge.ts` is the store, and
// the tagging model is the spec's own.
//
// WHAT THE SEARCH IS, STATED ON SCREEN. Keyword and facet search over the
// family's own notes: every word must match, the facets narrow, the result is a
// chronology. That genuinely answers the spec's example questions, which are
// searches. It is not a language model reading an index, and the card says so —
// a box labelled "AI query engine" that greps would be a claim the page does
// not honour, which is the same failure as a badge on a fabricated figure.
//
// EVERY COUNT ON THIS PAGE IS A COUNT OF REAL NOTES. An empty store renders the
// absent state with what would fill it, never zeros: "0 notes" and "no note has
// been captured" look identical on screen and are different facts.

const RISK_TONE: Record<RiskLevel, "gain" | "warn" | "loss"> = { Low: "gain", Moderate: "warn", High: "loss" };

const fmtDate = (iso: string): string =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

/** A multi-select chip row. Used for every facet so they all behave alike. */
function ChipRow<T extends string>({ options, selected, onToggle, counts }: {
  options: readonly T[];
  selected: T[];
  onToggle: (v: T) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o);
        const n = counts?.[o];
        return (
          <button key={o} type="button" onClick={() => onToggle(o)}
            className={[
              "rounded-md border px-2 py-1 text-[11px] transition-colors",
              on ? "border-champagne-500/60 bg-champagne-500/15 text-champagne-300"
                 : "border-ink-600/70 bg-ink-800/40 text-slate-400 hover:border-ink-500 hover:text-slate-200",
            ].join(" ")}>
            {o}{n != null && <span className="ml-1 text-slate-500">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="label-xs mb-1 block font-medium">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[10.5px] leading-snug text-slate-500">{hint}</span>}
  </label>
);

const inputCls = "w-full rounded-md border border-ink-600/70 bg-ink-800/40 px-2.5 py-1.5 text-[12.5px] text-slate-200 placeholder:text-slate-600 focus:border-champagne-500/60 focus:outline-none";

function NoteEditor({ note, managers, securities, onSave, onCancel }: {
  note: KnowledgeNote;
  managers: string[];
  securities: { key: string; name: string }[];
  onSave: (n: KnowledgeNote) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<KnowledgeNote>(note);
  const [themeText, setThemeText] = useState(note.themes.join(", "));
  const set = <K extends keyof KnowledgeNote>(k: K, v: KnowledgeNote[K]) => setD((p) => ({ ...p, [k]: v }));
  const toggle = <T extends string>(k: "assetClasses" | "geographies" | "securityKeys", v: T) =>
    setD((p) => {
      const cur = p[k] as string[];
      return { ...p, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  const canSave = !!d.title.trim() || !!d.body.trim();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title"><input className={inputCls} value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="What the note is about" /></Field>
        <Field label="Source">
          <select className={inputCls} value={d.source} onChange={(e) => set("source", e.target.value as NoteSource)}>
            {NOTE_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Note" hint="Minutes, a summary, a transcript excerpt — whatever was actually said or read.">
        <textarea className={`${inputCls} min-h-[120px] leading-relaxed`} value={d.body} onChange={(e) => set("body", e.target.value)} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date it happened" hint="Not the date it was typed up — a chronology built on the typing date would be wrong.">
          <input type="date" className={inputCls} value={d.occurredOn} onChange={(e) => set("occurredOn", e.target.value)} />
        </Field>
        <Field label="Manager / counterparty" hint="Blank is fine — many notes name none.">
          <input className={inputCls} list="glow-managers" value={d.manager} onChange={(e) => set("manager", e.target.value)} placeholder="e.g. a provider in the book" />
          <datalist id="glow-managers">{managers.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Participants">
          <input className={inputCls} value={d.participants} onChange={(e) => set("participants", e.target.value)} placeholder="Who was there" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Asset class"><ChipRow options={NOTE_ASSET_CLASSES} selected={d.assetClasses} onToggle={(v) => toggle<NoteAssetClass>("assetClasses", v)} /></Field>
        <Field label="Geography"><ChipRow options={GEOGRAPHIES} selected={d.geographies} onToggle={(v) => toggle<Geography>("geographies", v)} /></Field>
      </div>

      <Field label="Themes" hint="Your own labels, comma separated. Nothing is seeded here — a theme list is the family's language, not ours.">
        <input className={inputCls} value={themeText}
          onChange={(e) => { setThemeText(e.target.value); set("themes", e.target.value.split(",").map((t) => t.trim()).filter(Boolean)); }}
          placeholder="e.g. manufacturing, small-cap valuations" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Risk" hint="Your read, recorded — not derived from anything.">
          <select className={inputCls} value={d.risk ?? ""} onChange={(e) => set("risk", (e.target.value || null) as RiskLevel | null)}>
            <option value="">Not stated</option>
            {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Decision status">
          <select className={inputCls} value={d.decisionStatus ?? ""} onChange={(e) => set("decisionStatus", (e.target.value || null) as DecisionStatus | null)}>
            <option value="">No decision recorded</option>
            {DECISION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Open question">
          <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-300">
            <input type="checkbox" className="h-3.5 w-3.5 accent-champagne-500" checked={d.openQuestion} onChange={(e) => set("openQuestion", e.target.checked)} />
            Something is left unresolved
          </label>
        </Field>
      </div>

      {securities.length > 0 && (
        <Field label="Linked holdings" hint="Ties this note to positions in the book, so a company page can show what was said about it.">
          <select className={inputCls} value=""
            onChange={(e) => { if (e.target.value) toggle("securityKeys", e.target.value); }}>
            <option value="">Add a holding…</option>
            {securities.filter((s) => !d.securityKeys.includes(s.key)).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
          </select>
          {d.securityKeys.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {d.securityKeys.map((k) => (
                <button key={k} type="button" onClick={() => toggle("securityKeys", k)}
                  className="flex items-center gap-1 rounded-md border border-ink-600/70 bg-ink-800/40 px-2 py-1 text-[11px] text-slate-300 hover:border-rose-500/50 hover:text-rose-300">
                  {securities.find((s) => s.key === k)?.name ?? k}<X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </Field>
      )}

      <div className="flex items-center gap-2 border-t border-ink-700 pt-3">
        <button type="button" disabled={!canSave} onClick={() => onSave(d)}
          className="rounded-md bg-champagne-500 px-3 py-1.5 text-[12px] font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40">
          Save note
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-ink-600 px-3 py-1.5 text-[12px] text-slate-300 hover:border-ink-500">Cancel</button>
        {!canSave && <span className="text-[11px] text-slate-500">A note needs a title or a body — an empty one records nothing.</span>}
      </div>
    </div>
  );
}

function NoteRow({ n, securities, onEdit, onDelete }: {
  n: KnowledgeNote;
  securities: { key: string; name: string }[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-ink-700/60 last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-0.5 text-slate-500 hover:text-slate-300" aria-label={open ? "Collapse" : "Expand"}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-slate-100">{n.title || "(untitled note)"}</span>
            <Pill>{n.source}</Pill>
            {n.decisionStatus && <Pill tone="info">{n.decisionStatus}</Pill>}
            {n.risk && <Pill tone={RISK_TONE[n.risk]}>{n.risk} risk</Pill>}
            {n.openQuestion && <Pill tone="warn"><HelpCircle className="mr-1 inline h-3 w-3" />Open</Pill>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {n.occurredOn
              ? <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{fmtDate(n.occurredOn)}</span>
              : <span className="text-slate-600" title="No date was recorded for this note">no date recorded</span>}
            {n.manager && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{n.manager}</span>}
            {n.participants && <span className="truncate">{n.participants}</span>}
            {n.themes.map((t) => <span key={t} className="rounded-sm bg-ink-700/60 px-1.5 py-px text-slate-400">{t}</span>)}
          </div>
          {open && (
            <div className="mt-2.5 space-y-2">
              {n.body && <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-300">{n.body}</p>}
              {(n.assetClasses.length > 0 || n.geographies.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {[...n.assetClasses, ...n.geographies].map((t) => <Pill key={t}>{t}</Pill>)}
                </div>
              )}
              {n.securityKeys.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  <Link2 className="h-3 w-3" />
                  {n.securityKeys.map((k) => (
                    <a key={k} href={`#/stock/${encodeURIComponent(k)}`} className="rounded-sm bg-ink-700/60 px-1.5 py-px text-slate-300 hover:text-champagne-300">
                      {securities.find((s) => s.key === k)?.name ?? k}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onEdit} className="rounded p-1 text-slate-500 hover:text-slate-200" aria-label="Edit note"><Pencil className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onDelete} className="rounded p-1 text-slate-500 hover:text-rose-400" aria-label="Delete note"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </li>
  );
}

export function Knowledge() {
  const { portfolio, consolidated } = usePortfolio();
  const [store, setStore] = useState<KnowledgeStore>(() => readKnowledge());
  const [filter, setFilter] = useState<NoteFilter>(EMPTY_FILTER);
  const [editing, setEditing] = useState<KnowledgeNote | null>(null);
  const [showFacets, setShowFacets] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Another tab writing the same store must not leave this one showing stale
  // counts — the family may well have two open.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === "glow:knowledge/v1") setStore(readKnowledge()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // The book's OWN vocabulary, so a note joins to a real mandate and a real
  // holding rather than to a typed string that resembles one.
  const managers = useMemo(
    () => [...new Set((portfolio?.accounts ?? []).map((a) => a.provider).filter(Boolean))].sort(),
    [portfolio],
  );
  const securities = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of consolidated) if (!m.has(p.securityKey)) m.set(p.securityKey, p.security);
    return [...m.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [consolidated]);

  const notes = store.notes;
  const f = useMemo(() => facets(notes), [notes]);
  const results = useMemo(() => searchNotes(notes, filter), [notes, filter]);
  const filtered = !filterIsEmpty(filter);

  const save = (n: KnowledgeNote) => { setStore(upsertNote(store, n)); setEditing(null); };
  const remove = (id: string) => { if (confirm("Delete this note? It cannot be recovered unless you have an export.")) setStore(deleteNote(store, id)); };
  const toggleIn = <T extends string>(k: keyof NoteFilter, v: T) =>
    setFilter((p) => {
      const cur = p[k] as unknown as T[];
      return { ...p, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  const openQuestions = notes.filter((n) => n.openQuestion).length;
  const empty = notes.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow="Knowledge & Memory · Layer 1"
        title="Knowledge & Memory"
        subtitle="Every manager meeting, fund pitch, IC discussion, conference note, book and podcast — captured, tagged and searchable."
        right={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setEditing(emptyNote())}
              className="flex items-center gap-1.5 rounded-md bg-champagne-500 px-3 py-1.5 text-[12px] font-semibold text-ink-950">
              <Plus className="h-3.5 w-3.5" /> New note
            </button>
            <button type="button" onClick={() => exportKnowledge(store)} disabled={empty}
              title={empty ? "Nothing captured yet" : "Download every note as JSON"}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-[12px] text-slate-300 hover:border-ink-500 disabled:opacity-40">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md border border-ink-600 px-3 py-1.5 text-[12px] text-slate-300 hover:border-ink-500">
              <Upload className="h-3.5 w-3.5" /> Import
            </button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try { setStore(await importKnowledge(file, store)); }
                catch { alert("That file could not be read as a knowledge export."); }
                e.target.value = "";
              }} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Notes captured" icon={<BookOpen className="h-4 w-4" />}
          {...(empty
            ? absentTile("no note has been captured yet", "Nothing is seeded — every note here is one the family wrote")
            : { value: String(notes.length), sub: <span>{filtered ? `${results.length} match the current search` : "across every source"}</span> })} />
        <StatTile label="Sources used" icon={<Newspaper className="h-4 w-4" />}
          {...(empty
            ? absentTile("no note has been captured yet", `${NOTE_SOURCES.length} source types are available`)
            : { value: String(f.sources.length), sub: <span>of {NOTE_SOURCES.length} the spec lists</span> })} />
        <StatTile label="Managers referenced" icon={<Users className="h-4 w-4" />}
          {...(f.managers.length === 0
            ? absentTile(empty ? "no note has been captured yet" : "no note names a manager", "A note may legitimately name none")
            : { value: String(f.managers.length), sub: <span>named across the notes</span> })} />
        <StatTile label="Open questions" icon={<MessageSquare className="h-4 w-4" />}
          {...(empty
            ? absentTile("no note has been captured yet", "Flag a note as open to have it counted here")
            // A COMPUTED zero, and it stays: notes exist and none is flagged. The
            // reason sits in the tile rather than a tooltip.
            : { value: String(openQuestions), sub: <span>{openQuestions === 0 ? "no note is flagged unresolved" : "flagged unresolved"}</span> })} />
      </div>

      {editing && (
        <Card className="mt-5" title={store.notes.some((n) => n.id === editing.id) ? "Edit note" : "New note"}
          subtitle="Stored in this browser and exportable as JSON. Nothing here ever reaches the book.">
          <NoteEditor note={editing} managers={managers} securities={securities} onSave={save} onCancel={() => setEditing(null)} />
        </Card>
      )}

      {/* Search — described as what it is. */}
      <Card className="mt-5"
        title={<span className="flex items-center gap-2"><Search className="h-4 w-4 text-champagne-400" /> Search the family's notes</span>}
        subtitle="Every word must appear somewhere in the note — title, body, manager, participants or tag. Facets narrow it; results are a chronology, newest first."
        right={
          <button type="button" onClick={() => setShowFacets((s) => !s)}
            className="flex items-center gap-1.5 rounded-md border border-ink-600 px-2.5 py-1 text-[11.5px] text-slate-300 hover:border-ink-500">
            <Filter className="h-3.5 w-3.5" /> {showFacets ? "Hide filters" : "Filters"}
          </button>
        }>
        <div className="flex items-center gap-2 rounded-lg border border-ink-600/70 bg-ink-800/40 px-3 py-2">
          <Search className="h-4 w-4 text-slate-500" />
          <input value={filter.text} onChange={(e) => setFilter((p) => ({ ...p, text: e.target.value }))}
            placeholder="e.g. manufacturing · small-cap valuations · a manager's name"
            className="w-full bg-transparent text-[13px] text-slate-300 placeholder:text-slate-600 focus:outline-none" />
          {filtered && (
            <button type="button" onClick={() => setFilter(EMPTY_FILTER)} className="shrink-0 text-[11px] text-slate-500 hover:text-slate-300">Clear</button>
          )}
        </div>

        {showFacets && (
          <div className="mt-3 space-y-3 rounded-lg border border-ink-700 bg-ink-800/30 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From"><input type="date" className={inputCls} value={filter.from} onChange={(e) => setFilter((p) => ({ ...p, from: e.target.value }))} /></Field>
              <Field label="To"><input type="date" className={inputCls} value={filter.to} onChange={(e) => setFilter((p) => ({ ...p, to: e.target.value }))} /></Field>
            </div>
            <div>
              <span className="label-xs mb-1 block font-medium">Source</span>
              <ChipRow options={NOTE_SOURCES} selected={filter.sources} onToggle={(v) => toggleIn<NoteSource>("sources", v)}
                counts={Object.fromEntries(f.sources.map((s) => [s.value, s.n]))} />
            </div>
            <div>
              <span className="label-xs mb-1 block font-medium">Decision status</span>
              <ChipRow options={DECISION_STATUSES} selected={filter.statuses} onToggle={(v) => toggleIn<DecisionStatus>("statuses", v)}
                counts={Object.fromEntries(f.statuses.map((s) => [s.value, s.n]))} />
            </div>
            <div>
              <span className="label-xs mb-1 block font-medium">Asset class</span>
              <ChipRow options={NOTE_ASSET_CLASSES} selected={filter.assetClasses} onToggle={(v) => toggleIn<NoteAssetClass>("assetClasses", v)}
                counts={Object.fromEntries(f.assetClasses.map((s) => [s.value, s.n]))} />
            </div>
            {f.managers.length > 0 && (
              <div>
                <span className="label-xs mb-1 block font-medium">Manager</span>
                <ChipRow options={f.managers.map((m) => m.value)} selected={filter.managers} onToggle={(v) => toggleIn<string>("managers", v)}
                  counts={Object.fromEntries(f.managers.map((s) => [s.value, s.n]))} />
              </div>
            )}
            {f.themes.length > 0 && (
              <div>
                <span className="label-xs mb-1 block font-medium">Theme</span>
                <ChipRow options={f.themes.map((t) => t.value)} selected={filter.themes} onToggle={(v) => toggleIn<string>("themes", v)}
                  counts={Object.fromEntries(f.themes.map((s) => [s.value, s.n]))} />
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-slate-300">
              <input type="checkbox" className="h-3.5 w-3.5 accent-champagne-500" checked={filter.openOnly}
                onChange={(e) => setFilter((p) => ({ ...p, openOnly: e.target.checked }))} />
              Only notes with an open question
            </label>
          </div>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          <Tag className="mr-1 inline h-3 w-3" />
          This is keyword and facet search over the family's own notes, executed here in the browser —
          <span className="text-slate-400"> not a language model reading an index</span>. It answers the spec's example
          questions, which are searches; a box labelled "AI" that matched text would be a claim this page does not honour.
          Notes with no date recorded are excluded from a date-bounded search rather than assumed to fall inside it.
        </p>
      </Card>

      {/* Results */}
      <Card className="mt-5" title="Notes"
        subtitle={empty ? undefined : filtered ? `${results.length} of ${notes.length} match` : `${notes.length} captured · newest first`}
        right={notes.length > 0 && filtered && results.length === 0 ? <Pill tone="warn">no match</Pill> : undefined}
        pad={empty || results.length === 0}>
        {empty ? (
          <AbsentSection
            what="No note has been captured yet"
            needs="This layer holds the family's own record — manager meetings, fund pitches, IC discussions, conference notes, books and podcasts. Nothing is seeded, because a minute nobody wrote is a fabricated document, and one naming a real manager is worse. Capture the first note and every count, facet and search on this page becomes real.">
            <button type="button" onClick={() => setEditing(emptyNote())}
              className="mt-2 flex items-center gap-1.5 rounded-md bg-champagne-500 px-3 py-1.5 text-[12px] font-semibold text-ink-950">
              <Plus className="h-3.5 w-3.5" /> Capture the first note
            </button>
          </AbsentSection>
        ) : results.length === 0 ? (
          <AbsentSection what="No note matches this search" needs="Every word in the box must appear somewhere in a note. Widen the words, clear a facet, or drop the date bounds." />
        ) : (
          <ul>
            {results.map((n) => (
              <NoteRow key={n.id} n={n} securities={securities} onEdit={() => setEditing(n)} onDelete={() => remove(n.id)} />
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Notes are stored in <span className="text-slate-400">this browser</span> and never reach the book —
        <code className="mx-1 rounded bg-ink-800 px-1 py-px text-[10.5px]">glowData.ts</code> is generated from the
        statements in <code className="rounded bg-ink-800 px-1 py-px text-[10.5px]">source/</code> and must regenerate
        byte-identically, so a note written into it would break that guarantee on the first edit. Use
        <span className="text-slate-400"> Export</span> to keep a copy the family owns; <span className="text-slate-400">Import</span> merges
        rather than replaces, and the newer edit of a note wins, so restoring on a second device cannot destroy what was
        written here in the meantime.
      </p>
    </div>
  );
}
