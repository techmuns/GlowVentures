// THE CLIENT FOR `/api/chat` — an SSE stream, read defensively.
//
// The upstream answers `text/event-stream`. Its FRAME FORMAT is not documented
// and could not be measured before shipping: `MUNS_TOKEN` lives only in the
// Cloudflare environment, so a local run gets a 401 and the deployed function is
// the first place the real shape appears. This repo has been wrong about an
// undocumented muns response shape more than once (`market_data`'s whole return,
// `stock_data_batch`'s `type`), so nothing here assumes one.
//
// ── WHAT IT ACCEPTS, WIDEST FIRST ───────────────────────────────────────────
//
// A `data:` payload is tried as JSON and, if it parses, the first STRING found
// at any of the usual field names is taken as the delta. If it does not parse,
// the payload is used verbatim — which is what a plain-text token stream looks
// like. `[DONE]` ends it. Anything unrecognised is IGNORED rather than printed:
// rendering a frame's JSON envelope into the answer would put machine noise in
// front of a reader as though the model had written it.
//
// If the stream yields nothing at all, that is reported as such. A silent empty
// answer reads as "the model had nothing to say"; it usually means the frame
// shape is not one of these, and the caller says so and names the diagnostic.

/** Field names an SSE delta might arrive under. First string wins. */
const TEXT_FIELDS = ["delta", "text", "content", "answer", "message", "token", "chunk", "output"];

export type ChatChunk = { text: string };
export type ChatResult = {
  ok: boolean;
  chatId: string | null;
  messageId: string | null;
  /** Set when the answer could not be produced. Never a partial answer. */
  failureCode?: string;
  detail?: string | null;
  upstreamStatus?: number | null;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Pull the first string out of a parsed frame, however it is nested. */
function textFrom(v: unknown, depth = 0): string | null {
  if (typeof v === "string") return v;
  if (!v || typeof v !== "object" || depth > 3) return null;
  const o = v as Record<string, unknown>;
  for (const f of TEXT_FIELDS) {
    const hit = o[f];
    if (typeof hit === "string" && hit) return hit;
    if (hit && typeof hit === "object") {
      const deeper = textFrom(hit, depth + 1);
      if (deeper) return deeper;
    }
  }
  // `choices[0].delta.content`, the shape most chat APIs settle on.
  if (Array.isArray(o.choices) && o.choices.length) return textFrom(o.choices[0], depth + 1);
  return null;
}

export type AskInput = {
  question: string;
  /** The dashboard snapshot, verbatim, as `DASHBOARD_INPUTS`. */
  dashboardInputs: unknown[];
  /** Prepended to the question, because DASHBOARD_INPUTS' handling is unverified. */
  preamble: string;
  tickers?: string[];
  history?: ChatTurn[];
  chatId?: string | null;
  signal?: AbortSignal;
  onChunk: (c: ChatChunk) => void;
};

/**
 * Ask, and stream the answer through `onChunk`.
 *
 * Resolves once the stream ends. Never throws for an upstream problem — the
 * failure is returned with a CODE, so the panel can say which failure it was
 * rather than rendering an empty answer, which is the one thing that reads as
 * "the model considered your question and had nothing".
 */
export async function askMuns(input: AskInput): Promise<ChatResult> {
  const base = import.meta.env.BASE_URL;
  let res: Response;
  try {
    res = await fetch(`${base}api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      signal: input.signal,
      body: JSON.stringify({
        tasks: [`${input.preamble}\n${input.question}`],
        ...(input.chatId ? { chat_id: input.chatId } : {}),
        query_context: {
          chatHistory: (input.history ?? []).map((t) => ({ role: t.role, content: t.content })),
          ...(input.tickers?.length ? { TICKER_SYMBOL: input.tickers } : {}),
          DASHBOARD_INPUTS: input.dashboardInputs,
          mode: "expert",
        },
      }),
    });
  } catch (e) {
    if (input.signal?.aborted) return { ok: false, chatId: null, messageId: null, failureCode: "ABORTED" };
    return { ok: false, chatId: null, messageId: null, failureCode: "UNREACHABLE", detail: String((e as Error)?.message ?? e) };
  }

  const chatId = res.headers.get("x-chat-id");
  const messageId = res.headers.get("x-message-id");

  // The function reports its own failures as JSON with a code — surfaced rather
  // than collapsed into "something went wrong", because NOT_CONFIGURED (no
  // token) and UPSTREAM_ERROR (a token the API rejected) send the next person
  // to completely different places.
  const ctype = res.headers.get("content-type") ?? "";
  if (!res.ok || ctype.includes("application/json")) {
    let body: Record<string, unknown> = {};
    try { body = await res.json(); } catch { /* not JSON after all */ }
    return {
      ok: false, chatId, messageId,
      failureCode: (body.failureCode as string) ?? `HTTP_${res.status}`,
      detail: (body.detail as string) ?? null,
      upstreamStatus: (body.upstreamStatus as number) ?? null,
    };
  }
  if (!res.body) return { ok: false, chatId, messageId, failureCode: "NO_BODY" };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let emitted = 0;

  const handleFrame = (frame: string) => {
    // An SSE frame is a set of lines; only `data:` carries payload. A comment
    // line (`:`) is a keep-alive and means nothing.
    const payload = frame.split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!payload || payload === "[DONE]") return;
    let text: string | null = null;
    try { text = textFrom(JSON.parse(payload)); }
    catch { text = payload; }   // a plain-text token stream
    if (text) { emitted += text.length; input.onChunk({ text }); }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Frames are separated by a blank line. `\r\n` is tolerated because some
      // servers emit it and a reader that only splits on `\n\n` would then
      // never see a frame boundary and print nothing.
      let idx: number;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + buffer.slice(idx).match(/^\r?\n\r?\n/)![0].length);
        handleFrame(frame);
      }
    }
    if (buffer.trim()) handleFrame(buffer);
  } catch (e) {
    if (input.signal?.aborted) return { ok: emitted > 0, chatId, messageId, failureCode: "ABORTED" };
    return { ok: false, chatId, messageId, failureCode: "STREAM_BROKE", detail: String((e as Error)?.message ?? e) };
  }

  // A STREAM THAT PARSED TO NOTHING IS A FAILURE, NOT AN EMPTY ANSWER. It means
  // the frame shape is none of the ones above, and saying so sends the next
  // person to `TEXT_FIELDS` rather than to the model.
  if (!emitted) return { ok: false, chatId, messageId, failureCode: "NO_TEXT_IN_STREAM" };
  return { ok: true, chatId, messageId };
}
