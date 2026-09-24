import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { Card } from "@/components/Card";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtCurrency, fmtDateTime, fmtPct } from "@/lib/format";
import {
  EMPTY_ENTRY, parseWeightPct, readEntry, upsidePct, VALUATION_METHODS, writeEntry, type WatchEntry,
} from "@/lib/watchlist";
import { ALERT_DEF, checkLevel, parseLevel, type AlertField, type AlertKind, type PriceNow } from "@/lib/priceAlerts";
import { usePriceNow, useWatchlist } from "@/lib/usePriceAlerts";
import { AlertStatusText, KIND_TONE, distanceText, priceSource } from "@/components/AlertBits";
import { ResearchStatusLine } from "@/components/ResearchStatus";

// ── PRICE ALERTS FOR ONE HOLDING ─────────────────────────────────────────────
//
// *"Does these alerts actually work, can you make this much simpler to fill in
// for the customer … think like the investor using this dashboard and keep it
// extremely simple and clean ui."*
//
// THE CARD USED TO BE TEN FIELDS IN FOUR ROWS, and a reader could not tell which
// of them did anything. Six price boxes sat side by side with the same weight —
// a target, a fair value, an entry, an exit, an "alert above" and an "alert
// below" — though only four of them ever fired and the ENTRY price, the one a
// buyer cares about most, was not one of them. Under them a "Plan" block named
// three columns on a Portfolio Monitor view that had been removed, and a
// paragraph explained what a 0% target weight means.
//
// NOW THE CARD LEADS WITH THE FOUR LEVELS AN INVESTOR ACTS AT — Buy at, Sell
// at, Stop loss, Target — each saying under itself whether the price has got
// there, or how far it still has to go. Everything else the store holds is one
// click down under "More", and that section OPENS BY ITSELF when anything in it
// has been set, so nothing the family typed is ever hidden from them.
//
// NOTHING IN THE STORE MOVED. The boxes write the same `watchlist.ts` fields as
// before (see `ALERT_DEFS` in `priceAlerts.ts` for which label is which field),
// so a level set before this change is still set, under an investor's name for
// it. The "Add to watchlist" star is gone from the card because the watchlist
// page it fed was removed at the family's request (Stage 10w) — a control whose
// only effect is invisible is the control-that-looks-alive failure. The flag it
// set is kept on every save.
//
// A LEVEL NOBODY SET IS BLANK AND READS AS NOT SET, NEVER ZERO — the same rule
// as before, and why a typed "abc" is now REFUSED with a message rather than
// silently erasing the level that was there.

/** The four boxes a reader sees first. `above` lives under More — see `ALERT_DEFS`. */
const MAIN_KINDS: readonly AlertKind[] = ["entry", "exit", "below", "target"];

/** A stored price as it reads in the box: Indian grouping, no symbol — the box carries the ₹. */
const asTyped = (n: number | null) => (n === null ? "" : n.toLocaleString("en-IN", { maximumFractionDigits: 4 }));

/** How many of the fields under More are set — the section opens itself when any is. */
const moreFieldsSet = (e: WatchEntry) =>
  [e.alertAbove !== null, e.fairValue !== null, e.targetWeightPct !== null, !!e.fairValueRefYear, !!e.valuationMethod]
    .filter(Boolean).length;

export function InvestmentTools({ securityKey, name }: { securityKey: string; name: string }) {
  const { convertFromBase, displayCurrency, quotesAsOf, quoteFeeds } = usePortfolio();
  const entry = useWatchlist()[securityKey] ?? EMPTY_ENTRY(securityKey);
  const now = usePriceNow(securityKey);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [moreOpen, setMoreOpen] = useState(() => moreFieldsSet(readEntry(securityKey)) > 0);
  const card = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();

  useEffect(() => {
    setDraft({});
    setInvalid({});
    setMoreOpen(moreFieldsSet(readEntry(securityKey)) > 0);
  }, [securityKey]);

  /**
   * ARRIVING FROM MORNING CIO'S ALL ALERTS TAB lands on this card rather than at
   * the top of a long page. Twice, because the panels above it load after the
   * first paint and push it down; the second pass lands it where it ends up.
   */
  useEffect(() => {
    if (hash !== "#alerts") return;
    const go = () => card.current?.scrollIntoView({ block: "start" });
    const timers = [60, 700].map((ms) => window.setTimeout(go, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [hash, securityKey]);

  const perUnit = (n: number) => fmtCurrency(convertFromBase(n), displayCurrency);

  /**
   * One change, saved. The page's own NAME travels with it so the All alerts
   * table can still say what an alert is about after the holding is sold.
   */
  const save = (patch: Partial<WatchEntry>) => { writeEntry({ ...readEntry(securityKey), ...patch, name }); };

  const dropDraft = (k: string) => {
    setDraft(({ [k]: _d, ...rest }) => rest);
    setInvalid(({ [k]: _i, ...rest }) => rest);
  };

  /** A price box. Blank clears it; anything that is not a positive number is refused, never saved. */
  const commitPrice = (field: AlertField | "fairValue", raw: string) => {
    const r = parseLevel(raw);
    if (!r.ok) { setInvalid((v) => ({ ...v, [field]: true })); return; }
    dropDraft(field);
    if (r.value !== entry[field]) save({ [field]: r.value } as Partial<WatchEntry>);
  };

  /** Target weight: ZERO IS A DECISION HERE (hold none), so it has its own parser. */
  const commitWeight = (raw: string) => {
    const v = parseWeightPct(raw);
    if (raw.trim() && v === null) { setInvalid((x) => ({ ...x, targetWeightPct: true })); return; }
    dropDraft("targetWeightPct");
    if (v !== entry.targetWeightPct) save({ targetWeightPct: v });
  };

  const commitText = (field: "fairValueRefYear" | "valuationMethod" | "note", raw: string) => {
    dropDraft(field);
    const v = field === "note" ? raw : raw.trim();
    if (v !== entry[field]) save({ [field]: v } as Partial<WatchEntry>);
  };

  const textOf = (field: keyof WatchEntry, stored: string) => (field in draft ? draft[field as string] : stored);
  const levelBox = (kind: AlertKind) => {
    const field = ALERT_DEF[kind].field;
    return (
      <LevelBox key={kind} kind={kind} value={entry[field]} now={now}
        text={textOf(field, asTyped(entry[field]))} invalid={!!invalid[field]}
        onChange={(v) => setDraft((d) => ({ ...d, [field]: v }))}
        onCommit={(v) => commitPrice(field, v)}
        onClear={() => { dropDraft(field); save({ [field]: null } as Partial<WatchEntry>); }} />
    );
  };

  const anyLevel = [...MAIN_KINDS, "above" as const].some((k) => entry[ALERT_DEF[k].field] !== null);
  const fvGap = now.state === "live" || now.state === "nav" ? upsidePct(now.price, entry.fairValue) : null;
  const moreCount = moreFieldsSet(entry);

  return (
    <div ref={card} id="alerts" data-alerts-card className="mt-5 scroll-mt-4">
      {/* WHAT THE CARD DOES IS THE TITLE'S HOVER, AND THE WAY TO ALL ALERTS IS
          A LINK BESIDE THE PRICE (Stage 10cp's rule — main's letter — that no
          card draws a line under its title). The sentence used to be that line,
          with the link inside it; a hover can carry only a string, so the link
          is its own short control now, where the price chip already is. */}
      <Card
        title="Price alerts"
        subtitle="Type the price you would act at. When the price gets there, it shows on Morning CIO → All alerts."
        right={
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <PriceNowChip now={now} perUnit={perUnit} feeds={quoteFeeds} asOf={quotesAsOf} />
            <Link to="/cio?tab=alerts" data-alerts-card-link
              title="Every alert you have set, on Morning CIO — the ones that have fired first."
              className="whitespace-nowrap text-[12px] font-medium text-champagne-400 transition-colors hover:text-slate-200">
              All alerts →</Link>
          </div>
        }>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MAIN_KINDS.map(levelBox)}
        </div>

        {/* A HOLDING NO PRICE REACHES says so once, here, rather than four
            boxes each saying it — and only where a level is set, because an
            empty card has nothing to warn about. */}
        {now.state === "none" && anyLevel && (
          <p data-alert-unchecked-note className="mt-2.5 text-[11.5px] text-slate-500">
            Saved, but this dashboard can&rsquo;t check these alerts: {now.reason}.
          </p>
        )}

        <label className="mt-4 block">
          <span className="label-xs block text-slate-400">
            Why we own it <span className="normal-case tracking-normal text-slate-600">(optional)</span>
          </span>
          <textarea
            rows={2}
            data-alert-note
            placeholder="Why we hold it, and what would make us sell…"
            value={textOf("note", entry.note)}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            onBlur={(e) => commitText("note", e.target.value)}
            className="mt-1 w-full rounded-md border border-ink-600/70 bg-ink-800/40 px-2.5 py-2 text-[13px] leading-relaxed text-slate-200 placeholder:text-slate-600 focus:border-champagne-400/50 focus:outline-none"
          />
        </label>

        {/* EVERYTHING ELSE THE STORE HOLDS, ONE CLICK DOWN. A `<details>` rather
            than a conditional render, so the fields are in the page whether it
            is open or not — which is what lets `check:family` assert every field
            the store holds is still reachable without clicking anything. */}
        <details data-alert-more open={moreOpen}
          onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}
          className="mt-4 border-t border-ink-700/70 pt-3">
          <summary className="cursor-pointer select-none text-[12px] text-slate-400 transition-colors hover:text-slate-200">
            More options <span className="text-slate-500">— alert above, fair value, target weight, valuation</span>
            {moreCount > 0 && <span className="text-champagne-400"> · {moreCount} set</span>}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {levelBox("above")}

            <PlainBox label="Fair value" hint="What we think it is worth today. Not an alert.">
              <PriceInput field="fairValue" text={textOf("fairValue", asTyped(entry.fairValue))} invalid={!!invalid.fairValue}
                onChange={(v) => setDraft((d) => ({ ...d, fairValue: v }))} onCommit={(v) => commitPrice("fairValue", v)} />
              <div className="mt-1.5 min-h-[1.1rem] text-[11.5px] text-slate-500">
                {invalid.fairValue ? <span className="text-loss">Type a price, like 1250</span>
                  : fvGap !== null ? <span data-fair-value-gap>{fmtPct(fvGap, { sign: true, decimals: 1 })} from today&rsquo;s price</span>
                  : entry.fairValue === null ? "Not set" : "No live price to compare"}
              </div>
            </PlainBox>

            <PlainBox label="Target weight %" hint="Our intended share of the whole book. 0 means hold none; blank means not decided.">
              <input data-plan-field="targetWeightPct" type="text" inputMode="decimal" autoComplete="off" placeholder="not set"
                value={textOf("targetWeightPct", entry.targetWeightPct === null ? "" : String(entry.targetWeightPct))}
                onChange={(e) => setDraft((d) => ({ ...d, targetWeightPct: e.target.value }))}
                onBlur={(e) => commitWeight(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className={`${FIELD} mono ${invalid.targetWeightPct ? "border-loss/60 ring-1 ring-loss/50" : "border-ink-600/70"}`} />
              <div className="mt-1.5 min-h-[1.1rem] text-[11.5px] text-slate-500">
                {invalid.targetWeightPct ? <span className="text-loss">A percent from 0 to 100</span> : "0 = hold none · blank = not decided"}
              </div>
            </PlainBox>

            <PlainBox label="Fair value year" hint="The year the fair value is for, like FY28E.">
              <input data-plan-field="fairValueRefYear" type="text" autoComplete="off" placeholder="e.g. FY28E"
                value={textOf("fairValueRefYear", entry.fairValueRefYear)}
                onChange={(e) => setDraft((d) => ({ ...d, fairValueRefYear: e.target.value }))}
                onBlur={(e) => commitText("fairValueRefYear", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className={`${FIELD} border-ink-600/70`} />
            </PlainBox>

            <PlainBox label="Valuation method" hint="How the fair value was worked out. Free text; the list keeps spellings the same.">
              <input data-plan-field="valuationMethod" type="text" autoComplete="off" placeholder="e.g. DCF" list="valuation-methods"
                value={textOf("valuationMethod", entry.valuationMethod)}
                onChange={(e) => setDraft((d) => ({ ...d, valuationMethod: e.target.value }))}
                onBlur={(e) => commitText("valuationMethod", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className={`${FIELD} border-ink-600/70`} />
              <datalist id="valuation-methods">
                {VALUATION_METHODS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </PlainBox>
          </div>
        </details>

        {/* WHERE THESE LEVELS WENT (Stage 10cq): every save is also sent to
            Glow Central Research, which alerts there too — and this line says
            whether it arrived, or why not and what happens next. */}
        <ResearchStatusLine securityKey={securityKey} updatedAt={entry.updatedAt} />
      </Card>
    </div>
  );
}

const FIELD = "mt-1.5 w-full rounded-md border bg-ink-800/40 px-2.5 py-1.5 text-[13px] text-slate-200 placeholder:text-slate-600 focus:border-champagne-400/50 focus:outline-none";

/** The price being checked, top right of the card — or why there is none. */
function PriceNowChip({ now, perUnit, feeds, asOf }: {
  now: PriceNow; perUnit: (n: number) => string; feeds: string[]; asOf: string | null;
}) {
  const priced = now.state === "live" || now.state === "nav";
  const title = now.state === "live"
    ? `The live price${feeds.length ? ` from ${feeds.join(" and ")}` : ""}${asOf ? `, updated ${fmtDateTime(asOf)}` : ""} — every alert on this card is checked against it.`
    : now.state === "nav"
      ? `This fund's published NAV for ${now.asOf}. A fund has no intraday price, so its alerts are checked against the NAV it publishes each business day.`
      : now.state === "none" ? `No price to check alerts against: ${now.reason}.` : "The live price has not arrived yet.";
  return (
    <div data-alert-price={now.state} className="shrink-0 text-right" title={title}>
      <div className="label-xs">Price now</div>
      {priced ? (
        <>
          <div className="mono text-[15px] font-semibold text-slate-100">{perUnit(now.price)}</div>
          <div className="text-[10.5px] text-slate-500">{priceSource(now)}</div>
        </>
      ) : (
        <div className="mt-0.5 text-[12px] text-slate-500">{now.state === "checking" ? "Checking…" : "No live price"}</div>
      )}
    </div>
  );
}

/** One alert level: its name, a ₹ box, and whether the price has got there. */
function LevelBox({ kind, value, now, text, invalid, onChange, onCommit, onClear }: {
  kind: AlertKind;
  value: number | null;
  now: PriceNow;
  text: string;
  invalid: boolean;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  onClear: () => void;
}) {
  const def = ALERT_DEF[kind];
  const tone = KIND_TONE[kind];
  const c = value === null ? null : checkLevel(def.dir, value, now);
  const reached = c?.status === "reached";
  const dist = c ? distanceText(c, def.dir) : null;
  return (
    <div data-alert-box={kind} data-alert-status={c?.status ?? "unset"}
      className={`rounded-lg border p-3 transition-colors ${reached ? `${tone.border} ${tone.tint}` : "border-ink-700 bg-ink-800/30"}`}>
      {/* A FIXED-HEIGHT ROW, so a box showing its × lines up with one that
          does not — otherwise every set level sits a few pixels lower. */}
      <div className="flex h-5 items-center justify-between gap-2">
        <label htmlFor={`alert-${kind}`} className="label-xs flex items-center gap-1.5 text-slate-400" title={def.when}>
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />{def.label}
        </label>
        {value !== null && (
          <button type="button" data-alert-clear={kind} onClick={onClear}
            title={`Remove the ${def.label} alert`} aria-label={`Remove the ${def.label} alert`}
            className="rounded p-0.5 text-slate-500 transition-colors hover:text-slate-200">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <PriceInput field={def.field} id={`alert-${kind}`} text={text} invalid={invalid} onChange={onChange} onCommit={onCommit} />
      <div data-alert-line className="mt-1.5 min-h-[1.1rem] text-[11.5px] leading-snug">
        {invalid ? <span className="text-loss">Type a price, like 1250</span>
          : !c ? <span className="text-slate-500">{def.when}</span>
          : c.status === "reached" ? <><AlertStatusText status="reached" kind={kind} />{dist && <span className="text-slate-500"> · {dist}</span>}</>
          : c.status === "watching" ? <span className="text-slate-300">{dist}</span>
          : <AlertStatusText status={c.status} kind={kind} reason={now.state === "none" ? now.reason : undefined} />}
      </div>
    </div>
  );
}

/** A ₹ price box. Saved on blur or Enter — the rule every field on this card follows. */
function PriceInput({ field, id, text, invalid, onChange, onCommit }: {
  field: string; id?: string; text: string; invalid: boolean; onChange: (v: string) => void; onCommit: (v: string) => void;
}) {
  // THE INPUT IS THE BOX, with the ₹ drawn inside it — not an input inside a
  // bordered wrapper. The light theme paints every text input white with square
  // corners (`index.css`), and a white square corner inside a rounded wrapper
  // drew a hairline at the right edge of every box. The invalid state is a RING
  // because the same light rule sets `border-color` on inputs and would win.
  return (
    <div className="relative mt-1.5">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[13px] text-slate-500" aria-hidden>₹</span>
      <input id={id} data-alert-input={field} type="text" inputMode="decimal" autoComplete="off" placeholder="not set"
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={`mono w-full rounded-md border bg-ink-800/40 py-1.5 pl-6 pr-2.5 text-[14px] text-slate-100 placeholder:text-slate-600 focus:border-champagne-400/50 focus:outline-none ${
          invalid ? "border-loss/60 ring-1 ring-loss/50" : "border-ink-600/70"}`} />
    </div>
  );
}

/** A field under More that is not an alert. */
function PlainBox({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-800/30 p-3">
      <div className="label-xs text-slate-400" title={hint}>{label}</div>
      {children}
    </div>
  );
}
