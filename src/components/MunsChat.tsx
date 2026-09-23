import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Send, X, Loader2, TriangleAlert } from "lucide-react";
import { askMuns, type ChatTurn } from "@/lib/munsChat";
import { buildDashboardContext, contextPreamble, contextTickers } from "@/lib/chatContext";

// ── ASK THE BOOK — the Muns chat, beside the search box ─────────────────────
//
// ***NOTHING RENDERS THIS SINCE Stage 10bz — THE FAMILY PAUSED IT.*** *"Remove
// Ask muns from here, dont want this right now."* The top bar's button and the
// search list's Ask Muns row were its only two doors, and both are gone. It is
// kept whole rather than deleted because "right now" says it comes back — and
// because what is below records three defects that each shipped once (the
// scrim trapped in the header, the panel sized in `vh`, the failure that did
// not name itself), which a rewrite from scratch would ship again.
//
// TO BRING IT BACK: render `<MunsChat />` beside `<SmartSearch />` in
// `TopBar.tsx`, and restore the search list's Ask row from the commit that
// removed it (its `Row` type, the ordering on `looksLikeQuestion`, and the
// `openMunsWith` call in `choose`). Then turn `check:pages`' `chat` route and
// the two Stage 10bz claims on its `search` route back the other way — they
// assert the chat is ABSENT until then. `functions/api/chat.js`, `munsChat.ts`
// and `chatContext.ts` are untouched and still tested (`test:family`).
//
// This chat first replaced an `<input>` with no state, no handler and no
// onChange: a search box that looked alive and searched nothing. The slot holds
// a REAL search now (`SmartSearch`), and the chat sits beside it — opened by its
// own button, or from the search list's "Ask Muns" row with the question already
// asked. The dead box is still gone, and `check:pages` still asserts it.
//
// ── AN ANSWER IS NOT A MEASUREMENT, AND MUST NOT LOOK LIKE ONE ──────────────
//
// This is the one surface in the app where text arrives that no statement
// produced. Every figure elsewhere traces to a document; a model's sentence
// does not, however well briefed it is. So the answer is marked as generated —
// once, plainly, ON the answer rather than in a tooltip — and the panel says
// what the assistant was given. A reader must never be unable to tell an
// answer from a figure.
//
// The assistant is briefed from `chatContext.ts`, which sends the derived book
// AND the list of things this book does not carry, because an omission is what
// invites an invention. It cannot reach anything the dashboard cannot: it is
// given a snapshot, not a connection.
//
// ── AND A FAILURE NAMES ITSELF ──────────────────────────────────────────────
//
// `NOT_CONFIGURED` (no token in the Cloudflare environment) and `UPSTREAM_ERROR`
// (a token the API refused) send the next person to completely different
// places, so the code is shown rather than "something went wrong". Same rule as
// `upstreamStatus.ts`: THE CAUSE PICKS THE HEADLINE.

type Msg = { role: "user" | "assistant"; text: string; failure?: string | null; done?: boolean };

/**
 * ── OPENING THE CHAT FROM ELSEWHERE, WITH A QUESTION ALREADY ASKED ──────────
 *
 * The top bar's search box offers "Ask Muns" as a row, and puts it FIRST when
 * what was typed reads as a question. It must not need to know how this panel
 * holds its state, so it dispatches one event and the panel answers it: open,
 * and ask — once the dashboard snapshot the question is briefed on exists.
 */
export const ASK_MUNS_EVENT = "glow:ask-muns";
export function openMunsWith(question: string) {
  window.dispatchEvent(new CustomEvent(ASK_MUNS_EVENT, { detail: { question } }));
}

const SUGGESTIONS = [
  "What is the book worth, and how is it split?",
  "Which holdings are the largest, and who holds them?",
  "What does this book not carry a cost basis for?",
  "Summarise each family member's exposure.",
];

/** A failure code, said in words a reader can act on. */
function failureText(code: string | null | undefined, detail?: string | null): string {
  switch (code) {
    case "NOT_CONFIGURED":
      return "The assistant is not configured on this deployment — its API token is set in the Cloudflare environment, "
        + "and is absent here. Nothing was asked and nothing was answered.";
    case "UPSTREAM_TIMEOUT":
      return "The assistant did not answer in time. Nothing partial has been kept.";
    case "UPSTREAM_UNREACHABLE":
    case "UNREACHABLE":
      return "The assistant's API could not be reached. This is the service, not your question.";
    // `MUNS_TOKEN` is a SERVICE token, so the chat endpoint — the only
    // user-scoped one this dashboard calls — must name the acting user. One is
    // ALWAYS sent now, so the only identity failure left is a REFUSED one:
    // there is no `USER_INDEX_REQUIRED` case any more, and the upstream's own
    // words carry the name of the field it is complaining about.
    case "USER_INDEX_REJECTED":
      return `The assistant's API refused the user identity this dashboard sends${detail ? ` — ${detail}` : ""}. `
        + "Override it with MUNS_USER_INDEX in the Cloudflare environment — this is configuration, not your question.";
    case "UPSTREAM_ERROR":
      return `The assistant's API refused the request${detail ? ` — ${detail}` : ""}.`;
    case "NO_TEXT_IN_STREAM":
      return "The assistant's reply arrived in a format this dashboard could not read, so nothing is shown rather "
        + "than a half-parsed answer.";
    case "STREAM_BROKE":
      return "The connection dropped part-way through the answer. What is above is incomplete.";
    case "ABORTED":
      return "Stopped.";
    // A 404 IS A DEPLOYMENT FACT, NOT A MODEL ONE. `/api/chat` is a Cloudflare
    // Pages Function; `vite preview` runs no Functions, so it 404s on every
    // local build exactly as the index and quote feeds do. Saying "could not
    // answer" there sends a developer to look at the model.
    case "HTTP_404":
      return "The assistant runs as a server-side function on the deployed site and is not available in local "
        + "preview. On the deployment, a 404 here means the function has not been published yet.";
    default:
      return `The assistant could not answer (${code ?? "unknown"}).`;
  }
}

export function MunsChat() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const chatId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // A question handed over by the search box, asked once the panel is open and
  // its context built — never before, or it would be sent with no snapshot.
  const [pending, setPending] = useState<string | null>(null);

  // Built once per open, from the book — so an answer is briefed on what the
  // reader is looking at rather than on whatever the model remembers.
  const context = useMemo(() => (open ? buildDashboardContext() : null), [open]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [msgs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && open) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Cancel an answer in flight when the panel closes, so a stream cannot go on
  // writing into a component nobody is looking at.
  useEffect(() => { if (!open) { abort.current?.abort(); abort.current = null; } }, [open]);

  useEffect(() => {
    const onAsk = (e: Event) => {
      const question = (e as CustomEvent<{ question?: string }>).detail?.question?.trim();
      setOpen(true);
      if (question) setPending(question);
    };
    window.addEventListener(ASK_MUNS_EVENT, onAsk);
    return () => window.removeEventListener(ASK_MUNS_EVENT, onAsk);
  }, []);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy || !context) return;
    setQ("");
    setBusy(true);
    // The history sent up is what the reader can SEE — no hidden turns, and a
    // failed turn carries no text to send.
    const history: ChatTurn[] = msgs.filter((m) => !m.failure).map((m) => ({ role: m.role, content: m.text }));
    setMsgs((prev) => [...prev, { role: "user", text: question }, { role: "assistant", text: "" }]);
    const ctl = new AbortController();
    abort.current = ctl;

    const res = await askMuns({
      question,
      dashboardInputs: context,
      preamble: contextPreamble(context),
      tickers: contextTickers(),
      history,
      chatId: chatId.current,
      signal: ctl.signal,
      onChunk: ({ text: chunk }) => {
        setMsgs((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") next[next.length - 1] = { ...last, text: last.text + chunk };
          return next;
        });
      },
    });

    if (res.chatId) chatId.current = res.chatId;
    setMsgs((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = {
          ...last, done: true,
          failure: res.ok ? null : failureText(res.failureCode, res.detail),
        };
      }
      return next;
    });
    setBusy(false);
    abort.current = null;
  };

  useEffect(() => {
    if (!open || !context || !pending || busy) return;
    const question = pending;
    setPending(null);
    void ask(question);
    // `ask` is recreated each render and reads the same state this effect
    // watches; listing it would re-run the effect for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context, pending, busy]);

  return (
    <>
      {/* THE TRIGGER, BESIDE THE SEARCH BOX THAT NOW HOLDS ITS OLD SLOT. The
          slot is a real search (`SmartSearch`) and asks Muns from its own last
          row; this button opens the chat directly, empty, as it always did. */}
      <button type="button" onClick={() => setOpen(true)} data-testid="muns-chat-open"
        title="Ask Muns about this book — an AI answer from a snapshot of the dashboard, not a statement figure"
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800 px-2.5 py-2 text-sm text-slate-400 ring-focus hover:border-champagne-500/40 hover:text-slate-300">
        <Sparkles className="h-4 w-4 shrink-0 text-champagne-400" />
        <span className="hidden whitespace-nowrap sm:inline">Ask Muns</span>
      </button>

      {/*
        THE OVERLAY IS PORTALLED OUT OF THE TOP BAR, AND THAT IS THE BUG THAT
        MADE THE DIALOG "MIX WITH THE DASHBOARD".

        `backdrop-filter` on an ancestor makes that ancestor the containing
        block for `position: fixed` descendants — and the top bar this trigger
        lives in carries `backdrop-blur`. So `fixed inset-0` resolved against
        the HEADER: measured, the overlay was 1304x55, a scrim over the header
        strip and nothing else. The dashboard underneath was never dimmed at
        all, which is exactly what the reader saw.

        Portalled into `#root` rather than `document.body`: `#root` carries
        `--app-zoom`, so the dialog keeps the app's scale, and it has no filter
        or transform of its own, so `inset-0` finally resolves against the
        viewport.
      */}
      {open && createPortal(
        /*
          THE DASHBOARD HAS TO RECEDE, OR THE TWO LAYERS READ AS ONE.
          
          The panel was always fully opaque — measured, not assumed — so the
          "mixing" was never transparency in the panel. It was the SCRIM: at
          0.35 alpha with 4px of blur the table behind stayed perfectly legible,
          so the eye never separated the dialog from the page under it. A heavy
          blur and a real dim are what make a modal read as one.
        */
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-6 backdrop-blur-xl"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          {/*
            SIZED AS A PERCENTAGE OF THE OVERLAY, NEVER IN `vh`.
            
            `#root` carries `--app-zoom`, and a viewport unit is NOT rescaled by
            zoom (see index.css) — so the old `h-[min(78vh,720px)]` painted
            78vh x 0.875, a 614px panel in a 900px window while claiming 78%.
            The overlay is `fixed inset-0`, which DOES resolve correctly in the
            zoomed coordinate space, so a percentage of it is a percentage of
            the real viewport. Same trap the app shell hit once; same fix.
          */}
          <div data-testid="muns-chat-panel"
            className="flex h-full max-h-[920px] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">

            <div className="flex items-center gap-2 border-b border-ink-700 px-4 py-3">
              <Sparkles className="h-4 w-4 text-champagne-400" />
              <div className="text-sm font-semibold text-slate-100">Ask about this book</div>
              {/*
                THE ONE LABEL THAT MATTERS ON THIS SCREEN. Every other figure in
                this app traces to a statement; this panel produces sentences
                that no document produced. Said once, on the panel, in words —
                not a badge a reader has to hover to understand.
              */}
              <span className="rounded border border-champagne-500/40 bg-champagne-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-champagne-400">
                AI answer · not a statement figure
              </span>
              <button onClick={() => setOpen(false)} className="btn-ghost ml-auto h-8 px-2" title="Close (Esc)">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {msgs.length === 0 && (
                <div className="space-y-3">
                  <p className="text-[12.5px] leading-relaxed text-slate-400">
                    The assistant is given a snapshot of this dashboard — the current value of holdings and its listed/private
                    split, the allocation by mandate and asset class, every account with its owner and report date, the
                    largest holdings, the undrawn commitments — <span className="text-slate-300">and the list of
                    things this book does not carry</span>, so it can say what is missing instead of estimating it.
                  </p>
                  <p className="text-[11.5px] leading-relaxed text-slate-500">
                    It reads that snapshot and nothing else: it cannot reach an account, place a trade, or see a figure
                    the dashboard does not already show. Answers are generated text — check any figure against the page
                    it came from.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => ask(s)}
                        className="rounded-md border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-left text-[12px] text-slate-300 hover:border-champagne-500/40">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                  {m.role === "user" ? (
                    <div className="max-w-[80%] rounded-lg rounded-br-sm bg-champagne-500/15 px-3 py-2 text-[13px] text-slate-100">
                      {m.text}
                    </div>
                  ) : (
                    <div className="max-w-full">
                      {m.text && (
                        <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-200">{m.text}</div>
                      )}
                      {!m.done && !m.text && (
                        <div className="flex items-center gap-2 text-[12px] text-slate-500">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                        </div>
                      )}
                      {m.failure && (
                        <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] leading-relaxed text-amber-300/90">
                          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{m.failure}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form className="flex items-center gap-2 border-t border-ink-700 px-3 py-3"
              onSubmit={(e) => { e.preventDefault(); ask(q); }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} disabled={busy}
                data-testid="muns-chat-input" placeholder="Ask anything about the holdings, entities or allocation…"
                className="flex-1 rounded-md border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 ring-focus disabled:opacity-60" />
              <button type="submit" disabled={busy || !q.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-champagne-500/40 bg-champagne-500/10 px-3 py-2 text-sm font-medium text-champagne-400 hover:bg-champagne-500/20 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {busy ? "Answering" : "Ask"}
              </button>
            </form>
          </div>
        </div>,
        document.getElementById("root") ?? document.body,
      )}
    </>
  );
}
