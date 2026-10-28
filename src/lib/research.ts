// Street estimates, screener financial tables and concall documents, via the
// /api/research server proxy.
//
// These arrive as prose — text/plain estimates, markdown tables scraped from
// screener.in — and are shown as prose. Nothing on the page computes against
// them, because turning an analyst's sentence into a headline figure is exactly
// how a wrong number gets into a dashboard that promises every figure traces to a
// source. If a metric belongs in a tile, it should come from a typed feed.
import { requestDeadline } from "./requestDeadline";
import { keep, readKept } from "./stockPageStore";
import { isOutage, outageSentence } from "@/lib/upstreamStatus";

export type ResearchKind = "estimates" | "financials" | "statements" | "concalls" | "documents";

export type ResearchDoc = { url: string; title: string; date: string | null };

/**
 * Set when the upstream failed and the edge served its last good copy instead.
 *
 * BOTH FIELDS ARE REQUIRED TOGETHER, and the panel must render them. Serving
 * yesterday's tables is right — a 10-year P&L does not move intraday, and a
 * blank panel during an upstream outage helps nobody. Serving them WITHOUT
 * saying how old they are is the failure this book exists to prevent, so the
 * age is not an optional decoration on the response.
 */
export type Staleness = {
  stale?: boolean;
  refreshing?: boolean;
  /** Seconds since the copy was fetched. */
  ageS?: number;
  servedAt?: string;
  /** Why the live fetch failed, even though this response succeeded. */
  upstreamFailure?: string | null;
  /** When the data service fetched this copy from its upstream (epoch ms). */
  fetchedAt?: number;
};

export type Research = Staleness & (
  | { kind: ResearchKind; label: string; format: "text" | "markdown"; text: string; cached: boolean }
  | { kind: ResearchKind; label: string; format: "documents"; documents: ResearchDoc[]; raw: string | null; cached: boolean }
);

export type ResearchError = { failureCode: string; upstreamStatus: number | null; detail: string | null };

const requests = new Map<string, { at: number; value: Promise<Research | ResearchError> }>();
/** The answers this page load already received, for a panel that opens after they arrived. */
const settled = new Map<string, { at: number; value: Research }>();
const MEMORY_MS = 5 * 60_000;
export function fetchResearch(kind: ResearchKind, ticker: string): Promise<Research | ResearchError> {
  const key = `${kind}:${ticker.toUpperCase()}`;
  const cached = requests.get(key);
  if (cached && Date.now() - cached.at < MEMORY_MS) return cached.value;
  const value = loadKeptOrLive(kind, ticker).then((result) => {
    if (isResearchError(result) || result.refreshing) requests.delete(key);
    else {
      if (settled.size >= 40) settled.delete(settled.keys().next().value!);
      settled.set(key, { at: Date.now(), value: result });
    }
    return result;
  });
  if (requests.size >= 40) requests.delete(requests.keys().next().value!);
  requests.set(key, { at: Date.now(), value });
  return value;
}

/** The answer this page load already holds, so a panel can draw it on its first paint. */
export function settledResearch(kind: ResearchKind, ticker: string): Research | undefined {
  const hit = settled.get(`${kind}:${ticker.toUpperCase()}`);
  return hit && Date.now() - hit.at < MEMORY_MS ? hit.value : undefined;
}

/**
 * KEPT IN THIS BROWSER FOR THE SERVICE'S OWN FRESH WINDOW (Stage 10ik).
 *
 * The edge serves a copy as fresh for twelve hours (`FRESH_S` in
 * `functions/api/research.js`), so a copy the service fetched less than twelve
 * hours ago is exactly what it would answer with — and is drawn from this
 * browser (`stockPageStore.ts`) without the round trip. Past that the request
 * goes to the edge as before, which says on the panel when it serves an older
 * copy. Only a live (not stale) answer dated by the service is kept.
 */
export const KEPT_FRESH_MS = 12 * 3600_000;

async function loadKeptOrLive(kind: ResearchKind, ticker: string): Promise<Research | ResearchError> {
  const keptKey = `research:${kind}:${ticker.toUpperCase()}`;
  const kept = await readKept<Research>(keptKey);
  if (kept && Date.now() - kept.at < KEPT_FRESH_MS) return { ...kept.value, cached: true };
  const r = await loadResearch(kind, ticker);
  if (!isResearchError(r) && !r.stale && typeof r.fetchedAt === "number") void keep(keptKey, documentOf(r), r.fetchedAt);
  return r;
}

/** The document alone — none of the response's serving state, which belongs to the request that carried it. */
function documentOf(r: Research): Research {
  return r.format === "documents"
    ? { kind: r.kind, label: r.label, format: r.format, documents: r.documents, raw: r.raw, cached: true, fetchedAt: r.fetchedAt }
    : { kind: r.kind, label: r.label, format: r.format, text: r.text, cached: true, fetchedAt: r.fetchedAt };
}

async function loadResearch(kind: ResearchKind, ticker: string): Promise<Research | ResearchError> {
  const deadline = requestDeadline(25_000);
  try {
    const r = await fetch("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, ticker }),
      signal: deadline.signal,
    });
    const d = await r.json().catch(() => null);
    if (!d || !d.ok) {
      const err: ResearchError = {
        failureCode: d?.failureCode ?? (r.ok ? "BAD_RESPONSE" : `HTTP_${r.status}`),
        upstreamStatus: d?.upstreamStatus ?? null,
        detail: d?.diagnostics?.[0]?.bodyPreview ?? d?.diagnostics?.[0]?.errorMessage ?? null,
      };
      console.warn(`[research:${kind}]`, err, d ?? "(no body)");
      return err;
    }
    return { ...d } as Research;
  } catch (e) {
    return { failureCode: "NETWORK", upstreamStatus: null, detail: e instanceof Error ? e.message : String(e) };
  } finally { deadline.dispose(); }
}

export const isResearchError = (r: Research | ResearchError): r is ResearchError =>
  typeof (r as ResearchError).failureCode === "string";

/**
 * How old a served-stale copy is, in the reader's words. Null when the response
 * is live, so a caller cannot accidentally label a fresh panel.
 */
export function stalenessNote(r: Research): string | null {
  if (!r.stale) return null;
  const s = typeof r.ageS === "number" ? r.ageS : null;
  if (s === null) return "Served from the last saved copy; its age is not recorded.";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  const age = h >= 1 ? `${h}h${m ? ` ${m}m` : ""}` : `${Math.max(1, m)}m`;
  return r.refreshing ? `Showing the saved copy from ${age} ago while it refreshes.`
    : `The data service did not respond, so this is the last saved copy — fetched ${age} ago.`;
}

/**
 * Human wording for the reasons a panel can come back empty.
 *
 * `what` names the panel, so an outage sentence can say what is missing rather
 * than only that something is. The outage branch runs FIRST: a gateway status
 * is a fact about the service, and only `EMPTY_RESPONSE` — a 200 carrying
 * nothing — is a fact about the company.
 */
export function researchReason(e: ResearchError, what = "this panel"): string {
  if (e.failureCode === "UPSTREAM_UNAUTHORISED") {
    return "The data service rejected our token for this endpoint. It works for prices and news, so this is a permissions question for whoever issued it, not an outage.";
  }
  if (e.failureCode === "NOT_CONFIGURED") {
    return "The data token isn't set on this deployment, so research panels are off.";
  }
  if (e.failureCode === "EMPTY_RESPONSE") {
    return "The data service answered, and returned nothing for this company.";
  }
  if (isOutage(e)) return outageSentence(e, what);
  return `The data service returned an error${e.upstreamStatus ? ` (${e.upstreamStatus})` : ""}.`;
}

/** True where the panel is empty because the SERVICE is down, not the company. */
export const researchIsOutage = (e: ResearchError) => isOutage(e);
