import { type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Plus, X } from "lucide-react";
import { StatTile } from "@/components/StatTile";

/**
 * One metric a slot can be set to: a short LABEL, the FIGURE, one short line
 * under it, and the DETAIL a reader can hover for.
 *
 * *"these are action cards. They need to have the major figure and a very
 * short description, not such long lines. No one will read this on the
 * dashboard; it needs to be absolutely simple and clear."* So `sub` is one
 * line of a few words and there is no paragraph under it; the coverage counts
 * and the working that used to be paragraphs are `detail`, which rides on the
 * tile's own hover. `hint` stays on the type for a page that wants a visible
 * definition, and no metric on the Private Market sets one.
 */
export type TileMetric = {
  id: string;
  label: string;
  icon?: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  hint?: ReactNode;
  detail?: string;
};

/**
 * ── FOUR SLOTS, AND THE READER CHOOSES WHAT IS IN THEM ──────────────────────
 *
 * *"There are 9 KPI tiles on the private market page, make it 4 and give the
 * user a dropdown list to select what they want to see in each of those 4 KPI
 * tiles. Give option for every single metric the user might want to see and
 * they will select the one's that they want to see. Also add a small + button
 * on the last 4th KPI tile so the user can also increase the no. of KPI tile
 * and add a new one on the page as per their requirement."*
 *
 * THE `+` HAS SINCE BECOME A TILE OF ITS OWN — see `AddTile` below:
 * *"Add another tile. It should be a big empty tile with bold written: ADD
 * TILE. When I click on the ADD TILE button, I should be able to choose what I
 * want to see in that tile."*
 *
 * THE DROPDOWN IS THE TILE'S OWN LABEL, which costs no space and is where a
 * reader already looks to see which metric they are reading. A control tucked
 * into a corner on hover is invisible on a touch screen and invisible to
 * anybody not hunting for it; the label is neither.
 *
 * ── THE SELECTION IS A PER-VIEWER CONVENIENCE, SO IT LIVES IN TWO PLACES ────
 *
 * `localStorage`, like the nav's width and the Extras group's open state — it
 * is a preference about a screen and nothing about the book, and this file's
 * standing rule is that nothing a reader types may reach `glowData.ts`. Every
 * read and write is wrapped, because the accessor throws in a private window
 * and a blocked store must leave the page rendering its default rather than
 * rendering nothing.
 *
 * AND IN `?tiles=`, WHICH WINS, for the same reason every other view on this
 * site is addressable (`?view=`, `?group=`, `?facet=`, `?movers=`): a chosen
 * set is then a link somebody can send, the browser's own Back walks the
 * changes, and `check:pages` can hold any set to the light instead of guessing
 * at a click. The DEFAULT set stays param-free, so one screen is one URL.
 *
 * ── A STORED ID THAT NO LONGER EXISTS IS DROPPED, NOT DRAWN ─────────────────
 *
 * A set saved by an older build can name a metric this one does not have, and
 * a slot rendering a blank card for it would be an empty frame with no reason
 * in it — which is the one thing `Absent.tsx` exists to prevent. Unknown ids
 * are filtered out, and a set left with nothing falls back to the default:
 * "the reader picked these" and "the reader picked nothing that still exists"
 * are different facts, and only the first should ever empty a strip.
 */
export function SelectableTiles({ metrics, defaults, storageKey, param = "tiles", max }: {
  metrics: readonly TileMetric[];
  /** The set shown before anybody chooses. Must all be in `metrics`. */
  defaults: readonly string[];
  /** `localStorage` key, versioned by the caller. */
  storageKey: string;
  param?: string;
  /**
   * The most slots a reader may add. Defaults to the catalogue's own size,
   * because a slot can only ever show a metric that exists — see `add` below,
   * where a second copy of a metric already on screen SWAPS rather than
   * duplicating, so more slots than metrics could never be filled.
   */
  max?: number;
}) {
  const [params, setParams] = useSearchParams();
  const byId = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);
  const cap = Math.min(max ?? metrics.length, metrics.length);

  const ids = useMemo(() => {
    const clean = (list: string[]) => list.filter((id, i) => byId.has(id) && list.indexOf(id) === i).slice(0, cap);
    const fromParam = params.get(param);
    if (fromParam != null) {
      const chosen = clean(fromParam.split(",").map((s) => s.trim()).filter(Boolean));
      if (chosen.length) return chosen;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const chosen = clean(JSON.parse(raw) as string[]);
        if (chosen.length) return chosen;
      }
    } catch { /* private mode, or a value this build cannot parse */ }
    return clean([...defaults]);
  }, [params, param, byId, cap, storageKey, defaults]);

  const commit = useCallback((next: string[]) => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* private mode */ }
    const p = new URLSearchParams(params);
    const isDefault = next.length === defaults.length && next.every((id, i) => id === defaults[i]);
    if (isDefault) p.delete(param);
    else p.set(param, next.join(","));
    // Push rather than replace, so Back undoes a choice — the same treatment
    // `useViewParam` gives every other view on this site.
    setParams(p);
  }, [params, setParams, param, storageKey, defaults]);

  /**
   * PICKING A METRIC ALREADY ON SCREEN SWAPS THE TWO SLOTS rather than showing
   * it twice. A duplicate spends one of four slots saying something the reader
   * can already see, and there is no reading of the request under which that is
   * what they meant.
   */
  const choose = (slot: number, id: string) => {
    const at = ids.indexOf(id);
    const next = [...ids];
    if (at >= 0) { next[at] = next[slot]; }
    next[slot] = id;
    commit(next);
  };

  /**
   * THE METRICS NOT ON SCREEN, in the catalogue's own order — what the ADD TILE
   * card offers. A metric already showing is left out rather than offered and
   * swapped, because a new tile that takes an existing one's metric leaves the
   * strip the same size with one tile moved, which is not what "add" means.
   */
  const spare = metrics.filter((m) => !ids.includes(m.id));

  /**
   * ADDS WHAT THE READER CHOSE. The `+` this replaced appended the FIRST spare
   * metric and left the reader to change it with the new tile's own picker —
   * two steps, the first of them a guess. An id already on screen, or past the
   * cap, is refused rather than drawn twice.
   */
  const add = (id: string) => {
    if (!byId.has(id) || ids.includes(id) || ids.length >= cap) return;
    commit([...ids, id]);
  };

  return (
    // `auto-rows-fr` MAKES EVERY ROW AS TALL AS THE TALLEST, which is what makes
    // the ADD TILE card as big as a tile when it starts a row of its own — sized
    // to its content it would be a strip the height of two words.
    <div data-tile-strip={ids.join(",")} className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {ids.map((id, i) => {
        const m = byId.get(id);
        if (!m) return null;
        return (
          <div key={`${id}-${i}`} data-tile-slot={id} className="contents">
            <StatTile
              className="h-full"
              icon={m.icon}
              value={m.value}
              sub={m.sub}
              hint={m.hint}
              title={m.detail}
              label={<MetricPicker slot={i} metrics={metrics} current={m} onPick={(next) => choose(i, next)} />}
              action={
                <div className="flex items-center gap-1">
                  {/* NEVER BELOW ONE SLOT. A strip with no tiles is a page whose
                      figures have gone, which no reader asked for and which a
                      stored empty set would make permanent. */}
                  {ids.length > 1 && (
                    <button type="button" data-tile-remove={i}
                      onClick={() => commit(ids.filter((_, j) => j !== i))}
                      title="Remove this tile" aria-label="Remove this tile"
                      className="grid h-5 w-5 place-items-center rounded border border-ink-700 bg-ink-800/60 text-slate-500 ring-focus transition-colors hover:bg-ink-700/60 hover:text-slate-200">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              } />
          </div>
        );
      })}
      {/* THE NEXT TILE'S OWN PLACE — and only where a metric is left to put in
          it, so the card is never one that opens an empty menu. */}
      {ids.length < cap && spare.length > 0 && <AddTile spare={spare} onPick={add} />}
    </div>
  );
}

/**
 * CLOSES A MENU on a click outside it and on Escape — shared by the two menus
 * on this strip so they cannot behave differently. A menu that can only be
 * closed by choosing something forces a choice on a reader who opened it to
 * look.
 */
function useDismiss(open: boolean, box: RefObject<HTMLElement>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open, box, close]);
}

/**
 * ── THE ADD TILE CARD ───────────────────────────────────────────────────────
 *
 * *"Add another tile. It should be a big empty tile with bold written: ADD
 * TILE. When I click on the ADD TILE button, I should be able to choose what I
 * want to see in that tile."*
 *
 * IT SITS WHERE THE NEXT TILE WILL LAND. It is the strip's last grid cell, so
 * with three tiles it fills the fourth column and with four it starts a second
 * row: the tile a reader adds appears exactly where they clicked.
 *
 * DASHED AND UNFILLED, NOT A `.card`, because it is EMPTY. Drawn like the tiles
 * beside it, it would read as one more figure that failed to load.
 *
 * THE MENU OPENS OVER THE CARD ITSELF, as wide as the card, so it can never run
 * off the right edge of the page from the last column. It offers only the
 * metrics not already on screen, in the catalogue's order.
 */
function AddTile({ spare, onPick }: { spare: readonly TileMetric[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  return (
    <div ref={box} data-tile-add-slot className="relative">
      <button type="button" data-tile-add aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={`Add a tile — choose one of the ${spare.length} figure${spare.length === 1 ? "" : "s"} not on screen`}
        className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-600 text-slate-400 ring-focus transition-colors hover:border-champagne-500/70 hover:bg-ink-700/30 hover:text-champagne-400">
        <Plus className="h-5 w-5" aria-hidden />
        <span data-tile-add-label className="text-sm font-bold uppercase tracking-[0.14em]">Add tile</span>
      </button>
      {open && (
        <div data-tile-add-menu
          className="absolute inset-x-0 top-0 z-30 max-h-72 overflow-y-auto rounded-md border border-ink-600 bg-ink-800 p-1 shadow-card">
          <div className="label-xs px-2 pb-1 pt-1.5">Choose what it shows</div>
          <div role="listbox" aria-label="Choose what the new tile shows">
            {spare.map((m) => (
              <button key={m.id} type="button" role="option" aria-selected={false} data-tile-add-option={m.id}
                onClick={() => { onPick(m.id); setOpen(false); }}
                className="block w-full truncate rounded px-2 py-1.5 text-left text-[12px] text-slate-300 transition-colors hover:bg-ink-700/60">
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ── A MENU BUTTON, NOT A `<select>`, AND THAT IS NOT A STYLING PREFERENCE ────
 *
 * Measured: Chromium's `innerText` on a closed `<select>` returns EVERY
 * option's text, one line each. With eighteen metrics that put eighteen lines
 * between each tile's label and its figure, and this repo's page sweep reads
 * pages as text — twelve invariants on this page broke at once, on a strip that
 * rendered perfectly. A menu renders its options only while it is open, so the
 * page reads as the four tiles a reader can actually see.
 *
 * It closes on a click outside and on Escape (`useDismiss`, shared with the
 * ADD TILE card's menu).
 */
function MetricPicker({ slot, metrics, current, onPick }: {
  slot: number;
  metrics: readonly TileMetric[];
  current: TileMetric;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);

  return (
    <div ref={box} className="relative">
      <button type="button" data-tile-select={slot} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((v) => !v)} title="Choose what this tile shows"
        className="label-xs -ml-1 inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-slate-400 ring-focus transition-colors hover:bg-ink-700/60 hover:text-slate-200">
        <span className="truncate">{current.label}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
      {open && (
        <div role="listbox" data-tile-menu={slot}
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-ink-600 bg-ink-800 p-1 shadow-card">
          {metrics.map((mm) => (
            <button key={mm.id} type="button" role="option" aria-selected={mm.id === current.id}
              data-tile-option={mm.id}
              onClick={() => { onPick(mm.id); setOpen(false); }}
              className={`block w-full truncate rounded px-2 py-1.5 text-left text-[12px] transition-colors ${
                mm.id === current.id ? "bg-champagne-500 text-ink-950" : "text-slate-300 hover:bg-ink-700/60"}`}>
              {mm.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
