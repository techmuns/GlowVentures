import { useViewParam } from "@/components/ViewToggle";
import { TodaysMovers } from "@/components/TodaysMovers";
import { NavMovers } from "@/components/NavMovers";

// ── DAILY MOVERS — ONE CARD, TWO MEASUREMENTS, AND A TOGGLE BETWEEN THEM ─────
//
// *"give a toggle button in the direct equity daily movers for 'direct
// equity/ETF & Mutual Funds', and remove the separate daily movers for ETF and
// Mutual Funds."*
//
// ── THE TOGGLE SWITCHES WHICH MEASUREMENT IS SHOWN. IT IS NOT A SCOPE FILTER ─
//
// This is the whole of why the two cards are kept whole rather than merged into
// one model with a scope field, and it is the one thing a future session must
// not "simplify":
//
//   Direct Equity   a LIVE INTRADAY price against the PREVIOUS SESSION'S CLOSE,
//                   on whatever today is.
//   ETFs & MF       a scheme's own PUBLISHED NAV against the ONE BEFORE IT,
//                   struck on the scheme's own business days — on this book,
//                   dates a week behind the quote feed and not even shared
//                   between rows.
//
// They are never added, never averaged and never dated alike. A single model
// with a `scope` field would make summing them a one-line edit and would put
// both under one heading; instead each branch keeps its OWN card title, its own
// as-of, its own coverage line and its own absent states — `TodaysMovers` says
// "Today's movers · Direct Equity", `NavMovers` says "Daily NAV movers · ETFs &
// mutual funds" over the newest published NAV date and never the word "today".
// That is `/api/indices`' own lesson (a real figure under the wrong day is the
// kind a reader cannot catch) applied to a control.
//
// ── `?movers=` IS BACK, AND THAT IS NOT STAGE 10al RUNNING BACKWARDS ─────────
//
// Stage 10ad put four scope tabs on the quote-fed card — Stocks & ETFs / Stocks
// / ETFs / Mutual funds — and Stage 10al deleted them at the family's request,
// along with the param. The reasoning there was that each tab was a different
// SET of one model, so keeping three unselectable ones alive would leave their
// captions, nouns, verbs and a mutual-fund absence essay standing for a card
// that renders one set for ever.
//
// This is a different shape. There are TWO branches, each is a whole card that
// already exists and is already checked end to end, and the family asked for
// exactly this control. Nothing here is unreachable: both branches are offered,
// both are walked, and the param makes each one a link the sweep can hold to the
// light rather than a click it has to guess at.
//
// The second branch is what `NavMovers` was on its own until now — the separate
// card the family asked to remove. Nothing it measured was lost; it moved behind
// this toggle.

const SCOPES = [
  { key: "direct", label: "Direct Equity", title: "Live intraday prices against the previous session's close." },
  { key: "funds", label: "ETFs & mutual funds", title: "Each scheme's own published NAV against the one before it — a different measurement, on its own dates." },
] as const;

export function DailyMovers() {
  /**
   * THE DEFAULT IS DIRECT EQUITY, and it is the param-free one — the family's
   * own wording puts the toggle *in* the direct-equity card, so that is the
   * branch a reader lands on. `useViewParam` keeps the default off the URL, so
   * `/cio` and `/cio?movers=direct` do not become two addresses for one screen.
   */
  const [scope, setScope] = useViewParam(SCOPES, {}, "movers");

  /**
   * THE CONTROL IS BUILT HERE AND RENDERED BY THE BRANCH, because the `right`
   * slot belongs to each card's own `<Card>` — and it has to render in the
   * LOADING and ABSENT branches too. A toggle that disappears when the NAV
   * store does not answer strands a reader on a failed card with no way back to
   * the one that works.
   *
   * `data-movers-scope` + `role="tab"` + `aria-selected` is the contract
   * `check:pages`'s `moverScopes` probe already reads. It was written to prove
   * the four tabs were GONE and now proves this pair is PRESENT and correct:
   * the labels it reads all appear legitimately elsewhere on this page, so only
   * the control can answer whether the toggle is there.
   */
  const toggle = (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-ink-600 bg-ink-800/60 p-0.5"
      role="tablist" aria-label="Which movers">
      {SCOPES.map((s) => (
        <button key={s.key} type="button" role="tab" aria-selected={scope === s.key}
          data-movers-scope={s.key} title={s.title}
          onClick={() => setScope(s.key)}
          className={["whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
            scope === s.key ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"].join(" ")}>
          {s.label}
        </button>
      ))}
    </div>
  );

  return scope === "funds"
    ? <NavMovers scopeToggle={toggle} />
    : <TodaysMovers scopeToggle={toggle} />;
}
