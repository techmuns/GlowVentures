import { CSSProperties, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Plus, X } from "lucide-react";
import { StatTile } from "@/components/StatTile";
import { Kpi } from "@/components/Kpi";
import {
  chooseTileSet, readLocalTileSet, saveTileSet, useTileSets, writeLocalTileSet,
  SAVED_FOR_EVERYONE, type LocalTileSet,
} from "@/lib/tileSets";

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
  /**
   * A SECOND FIGURE UNDER THE FIRST, for a tile that carries two — Morning
   * CIO's Current Value of Holdings shows what was invested beneath what it is
   * worth, because the family asked for the two tiles to become one. A figure,
   * never a caption: it is struck from the book like the value above it.
   */
  second?: ReactNode;
  sub?: ReactNode;
  hint?: ReactNode;
  detail?: string;
  /** The percentage arrow — `null` renders nothing, never a measured-looking 0%. */
  delta?: number | null;
  /** `kpi` variant only: the page behind this figure. One per tile, never two. */
  href?: string;
  /** What the reader will find there. Falls back to `detail`. */
  hrefTitle?: string;
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
 * THE DROPDOWN IS THE TILE'S OWN LABEL, which costs no space and is where a
 * reader already looks to see which metric they are reading. A control tucked
 * into a corner on hover is invisible on a touch screen and invisible to
 * anybody not hunting for it; the label is neither.
 *
 * ── THE CHOICE IS SAVED, AND THE NEXT VISIT OPENS ON IT ─────────────────────
 *
 * *"When we are selecting a particular KPI tile, after changing the metric that
 * we want to see on it, make sure that it is being saved and next time when we
 * come on the dashboard it should be in the same format as it was after we
 * changed it."*
 *
 * It used to live in `localStorage` alone, which is a memory of ONE BROWSER:
 * it survived a reload and failed on a second laptop, a phone, a cleared
 * browser and the partitioned storage a page embedded in another site's frame
 * gets — each of which reads to the family as "it did not save". So a choice
 * now goes to the dashboard's SHARED layout store (`src/lib/tileSets.ts` →
 * `/api/tile-sets`, Cloudflare KV) as well, and this browser's copy is what the
 * page paints from before the store answers. `chooseTileSet` is the one rule
 * for which wins; the picker says in words where the choice was kept.
 *
 * It is still ONLY metric ids and nothing about the book — nothing a reader
 * picks here can reach `glowData.ts`.
 *
 * AND `?tiles=` STILL WINS FOR THE TAB IT IS ON, for the reason every view on
 * this site is addressable: a set is a link somebody can send, and
 * `check:pages` can hold any set to the light instead of guessing at a click.
 * What changed is that CHOOSING no longer writes the address: a saved layout is
 * the thing a reader comes back to, so a choice removes the param rather than
 * leaving an older set in the URL to outrank it.
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
export function SelectableTiles({ metrics, defaults, storageKey, page, param = "tiles", max, variant = "stat" }: {
  metrics: readonly TileMetric[];
  /** The set shown before anybody chooses. Must all be in `metrics`. */
  defaults: readonly string[];
  /** `localStorage` key, versioned by the caller. */
  storageKey: string;
  /**
   * WHICH PAGE THIS STRIP IS, in the shared layout store — `private-market`,
   * `cio`. One key per page, so two strips can never overwrite each other.
   */
  page: string;
  param?: string;
  /**
   * The most slots a reader may add. Defaults to the catalogue's own size,
   * because a slot can only ever show a metric that exists — see `add` below,
   * where a second copy of a metric already on screen SWAPS rather than
   * duplicating, so more slots than metrics could never be filled.
   */
  max?: number;
  /**
   * `stat` — a panel tile (Private Market). `kpi` — Morning CIO's raised,
   * clickable tile, whose whole surface opens the page behind its figure; the
   * picker and the add/remove buttons sit ABOVE that click target so choosing a
   * metric never navigates.
   */
  variant?: "stat" | "kpi";
}) {
  const [params, setParams] = useSearchParams();
  const byId = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);
  const cap = Math.min(max ?? metrics.length, metrics.length);
  const store = useTileSets();
  /**
   * THIS BROWSER'S COPY, HELD AS STATE so a choice re-renders the strip at once.
   * Read in the initialiser — before the first paint — which is what stops the
   * page opening on the default four and then jumping to the saved ones.
   */
  const [local, setLocal] = useState<LocalTileSet | null>(() => readLocalTileSet(storageKey));
  /** Which slot's picker is open, so that tile can sit above its neighbours. */
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  /**
   * THE SET A SAVE IS ALREADY CARRYING. A save's own answer updates the shared
   * snapshot, which re-runs the sync below before the save has marked this
   * browser's copy confirmed — so without this the same set is sent twice.
   */
  const inflight = useRef<string | null>(null);

  const clean = useCallback(
    (list: readonly string[]) => list.filter((id, i) => byId.has(id) && list.indexOf(id) === i).slice(0, cap),
    [byId, cap],
  );

  const choice = useMemo(() => {
    const raw = params.get(param);
    const fromParam = raw != null ? clean(raw.split(",").map((s) => s.trim()).filter(Boolean)) : null;
    const shared = store.status === "shared" && store.sets[page] ? clean(store.sets[page]) : null;
    const loc = local ? { ...local, ids: clean(local.ids) } : null;
    return chooseTileSet({
      fromParam: fromParam?.length ? fromParam : null,
      local: loc?.ids.length ? loc : null,
      shared: shared?.length ? shared : null,
      sharedLoaded: store.status === "shared",
    });
  }, [params, param, clean, store, page, local]);

  const ids = useMemo(() => choice.ids ?? clean([...defaults]), [choice, clean, defaults]);

  /**
   * KEEP THE TWO MEMORIES IN STEP, once the shared store has answered.
   *
   *   · a change this browser made and the store never confirmed is PUSHED —
   *     it is the newest thing anybody did to this strip;
   *   · otherwise the store's set becomes this browser's copy, so the next
   *     visit paints it before the store has even answered.
   *
   * Never while a `?tiles=` address is being shown: an address is somebody's
   * link, and opening it must not rewrite the layout everybody else sees.
   */
  const idsKey = ids.join(",");
  useEffect(() => {
    if (store.status !== "shared" || params.get(param) != null) return;
    if (choice.push && choice.ids?.length) {
      const pushing = choice.ids;
      if (inflight.current === pushing.join(",")) return;
      inflight.current = pushing.join(",");
      void saveTileSet(page, pushing).then((ok) => {
        if (inflight.current === pushing.join(",")) inflight.current = null;
        if (ok) { writeLocalTileSet(storageKey, pushing, true); setLocal({ ids: pushing, synced: true }); }
      });
      return;
    }
    const shared = store.sets[page];
    if (shared?.length && (!local || !local.synced || local.ids.join(",") !== shared.join(","))) {
      writeLocalTileSet(storageKey, shared, true);
      setLocal({ ids: shared, synced: true });
    }
    // `idsKey` rather than `ids`: an array rebuilt each render would re-run this
    // on every paint and push the same set again.
  }, [store, page, storageKey, choice.push, idsKey, params, param]);

  /**
   * A CHOICE IS SAVED, AND THE ADDRESS STOPS OVERRIDING IT.
   *
   * It goes to this browser at once and to the shared store behind it. Where
   * the strip was opened from a `?tiles=` link, the param is REMOVED rather than
   * rewritten: the layout the reader has just made is what they should see on
   * their next visit, and an address carrying an older set would otherwise
   * outrank it on this tab.
   */
  const commit = useCallback((next: string[]) => {
    writeLocalTileSet(storageKey, next, false);
    setLocal({ ids: next, synced: false });
    if (params.get(param) != null) {
      const p = new URLSearchParams(params);
      p.delete(param);
      setParams(p, { replace: true });
    }
    inflight.current = next.join(",");
    void saveTileSet(page, next).then((ok) => {
      if (inflight.current === next.join(",")) inflight.current = null;
      // Only the LATEST choice may mark this browser's copy confirmed: a reader
      // who picks twice quickly must not have the first answer overwrite the
      // second choice.
      if (ok && readLocalTileSet(storageKey)?.ids.join(",") === next.join(",")) {
        writeLocalTileSet(storageKey, next, true);
        setLocal({ ids: next, synced: true });
      }
    });
  }, [params, setParams, param, storageKey, page]);

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

  const add = () => {
    const spare = metrics.find((m) => !ids.includes(m.id));
    if (spare && ids.length < cap) commit([...ids, spare.id]);
  };

  /** Where the choice is kept, in words — shown inside the picker, never on the strip. */
  const savedWhere = store.status === "shared" ? SAVED_FOR_EVERYONE
    : store.status === "local" ? store.reason
    : "Saved in this browser — checking the shared store…";

  const controls = (i: number, last: boolean) => (
    <div className="flex items-center gap-1">
      {/* NEVER BELOW ONE SLOT. A strip with no tiles is a page whose figures
          have gone, which no reader asked for and which a saved empty set would
          make permanent. */}
      {ids.length > 1 && (
        <button type="button" data-tile-remove={i}
          onClick={() => commit(ids.filter((_, j) => j !== i))}
          title="Remove this tile" aria-label="Remove this tile"
          className="grid h-5 w-5 place-items-center rounded border border-ink-700 bg-ink-800/60 text-slate-500 ring-focus transition-colors hover:bg-ink-700/60 hover:text-slate-200">
          <X className="h-3 w-3" />
        </button>
      )}
      {/* ON THE LAST TILE, as asked — and only where a metric is left to put in
          it, so the control is never one that looks live and does nothing. */}
      {last && ids.length < cap && (
        <button type="button" data-tile-add onClick={add}
          title="Add another tile" aria-label="Add another tile"
          className="grid h-5 w-5 place-items-center rounded border border-ink-700 bg-ink-800/60 text-slate-400 ring-focus transition-colors hover:bg-ink-700/60 hover:text-slate-200">
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <div data-tile-strip={ids.join(",")} data-tile-saved={store.status}
      className={variant === "kpi" ? "kpi-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"}
      style={variant === "kpi" ? ({ "--kpi-cols": Math.min(Math.max(ids.length, 1), 6) } as CSSProperties) : undefined}
      data-testid={variant === "kpi" ? "kpi-strip" : undefined}>
      {ids.map((id, i) => {
        const m = byId.get(id);
        if (!m) return null;
        const last = i === ids.length - 1;
        const picker = (
          <MetricPicker slot={i} metrics={metrics} current={m} savedWhere={savedWhere}
            onOpenChange={(o) => setOpenSlot((s) => (o ? i : s === i ? null : s))}
            onPick={(next) => choose(i, next)} />
        );
        return (
          <div key={`${id}-${i}`} data-tile-slot={id} className="contents">
            {variant === "kpi" ? (
              <Kpi
                label={picker}
                labelText={m.label}
                value={m.value}
                second={m.second}
                sub={m.sub}
                delta={m.delta}
                icon={m.icon}
                href={m.href}
                hrefTitle={m.hrefTitle ?? m.detail}
                action={controls(i, last)}
                raise={openSlot === i} />
            ) : (
              <StatTile
                className={`h-full${openSlot === i ? " relative z-30" : ""}`}
                icon={m.icon}
                value={m.value}
                sub={m.sub}
                hint={m.hint}
                title={m.detail}
                label={picker}
                action={controls(i, last)} />
            )}
          </div>
        );
      })}
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
 * It closes on a click outside and on Escape, because a menu that can only be
 * closed by choosing something forces a choice on a reader who opened it to
 * look.
 */
function MetricPicker({ slot, metrics, current, onPick, onOpenChange, savedWhere }: {
  slot: number;
  metrics: readonly TileMetric[];
  current: TileMetric;
  onPick: (id: string) => void;
  /** So the tile can rise above its neighbours while its menu hangs over them. */
  onOpenChange?: (open: boolean) => void;
  /** Where the choice is kept, in words — the menu's last line. */
  savedWhere: string;
}) {
  const [open, setOpen] = useState(false);
  // Reported from an effect rather than from inside a state updater, which must
  // stay free of side effects (StrictMode runs updaters twice).
  const report = useRef(onOpenChange);
  report.current = onOpenChange;
  useEffect(() => { report.current?.(open); }, [open]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    // `pointer-events-auto` ON THE PICKER'S OWN BOX: on a Morning CIO tile the
    // whole card is a link and its content passes clicks through to it, so the
    // control has to take them back — and only the control, not the empty width
    // beside it.
    <div ref={box} className="pointer-events-auto relative w-full">
      {/* ── THE WHOLE LABEL, ALWAYS ──────────────────────────────────────────
          *"the headings of the KPI tiles is not being shown completely."* The
          label was one line with an ellipsis, so "COMMITTED" read "COMMITT…" and
          "CAPITAL INVESTED" read "CAPITAL INVEST…" — a reader had to open the
          menu to learn which metric the tile was showing. It WRAPS now: a label
          that does not fit on one line takes a second, and no heading is ever
          cut. `check:pages` measures the text against its box.

          AND THE ROOT CAUSE IS A MEASUREMENT CHROMIUM GETS WRONG, SO THE BOX
          NO LONGER ASKS IT. `label-xs` letters are spaced 0.14em and the app
          runs at `--app-zoom` 0.875; sizing a box to its own text ("shrink to
          fit"), Chromium counts the zoomed letter-spacing while the line is laid
          out with the unzoomed one, so every label came up short of itself by
          about 0.18px a letter — measured: "Distributions" in a 82px box that
          its own text needed 84px of. With an ellipsis that was "COMMITT…"
          beside an empty third of the header; with wrapping, "DISTRIBUTION / S".
          So the button takes the label's WHOLE width and the text takes what is
          left beside the chevron: nothing is sized from the text any more, and a
          label wraps only where the tile really is too narrow for it. */}
      <button type="button" data-tile-select={slot} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((v) => !v)} title="Choose what this tile shows"
        className="label-xs -ml-1 flex w-full items-start gap-1 rounded px-1 py-0.5 text-left text-slate-400 ring-focus transition-colors hover:bg-ink-700/60 hover:text-slate-200">
        <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{current.label}</span>
        <ChevronDown className="mt-px h-3 w-3 shrink-0" />
      </button>
      {open && (
        <div role="listbox" data-tile-menu={slot}
          className="absolute left-0 top-full z-40 mt-1 w-72 rounded-md border border-ink-600 bg-ink-800 p-1 text-left font-normal normal-case tracking-normal shadow-card">
          <div className="max-h-72 overflow-y-auto">
            {metrics.map((mm) => (
              <button key={mm.id} type="button" role="option" aria-selected={mm.id === current.id}
                data-tile-option={mm.id}
                onClick={() => { onPick(mm.id); setOpen(false); }}
                className={`block w-full rounded px-2.5 py-1.5 text-left text-[13px] leading-snug transition-colors ${
                  mm.id === current.id ? "bg-champagne-500 text-ink-950" : "text-slate-200 hover:bg-ink-700/60"}`}>
                {mm.label}
              </button>
            ))}
          </div>
          {/* WHERE THE CHOICE GOES, ONCE, IN THE MENU THAT MAKES IT — never on
              the strip, which the family asked to keep to a figure and a line. */}
          <p data-tile-saved-where className="mt-1 border-t border-ink-700 px-2.5 pb-1 pt-1.5 text-[11.5px] leading-snug text-slate-400">
            {savedWhere}
          </p>
        </div>
      )}
    </div>
  );
}
