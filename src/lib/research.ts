// Street estimates, screener financial tables and concall documents, via the
// /api/research server proxy.
//
// These arrive as prose — text/plain estimates, markdown tables scraped from
// screener.in — and are shown as prose. Nothing on the page computes against
// them, because turning an analyst's sentence into a headline figure is exactly
// how a wrong number gets into a dashboard that promises every figure traces to a
// source. If a metric belongs in a tile, it should come from a typed feed.
export type ResearchKind = "estimates" | "financials" | "concalls";

export type ResearchDoc = { url: string; title: string; date: string | null };

export type Research =
  | { kind: ResearchKind; label: string; format: "text" | "markdown"; text: string; cached: boolean }
  | { kind: ResearchKind; label: string; format: "documents"; documents: ResearchDoc[]; raw: string | null; cached: boolean };

export type ResearchError = { failureCode: string; upstreamStatus: number | null; detail: string | null };

export async function fetchResearch(kind: ResearchKind, ticker: string): Promise<Research | ResearchError> {
  try {
    const r = await fetch("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, ticker }),
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
  }
}

export const isResearchError = (r: Research | ResearchError): r is ResearchError =>
  typeof (r as ResearchError).failureCode === "string";

/** Human wording for the reasons a panel can come back empty. */
export function researchReason(e: ResearchError): string {
  switch (e.failureCode) {
    case "NOT_CONFIGURED":
      return "The data token isn't set on this deployment, so research panels are off.";
    case "UPSTREAM_UNAUTHORISED":
      return "The data service rejected our token for this endpoint. It works for prices and news, so this is a permissions question for whoever issued it, not an outage.";
    case "UPSTREAM_NO_RESPONSE":
      return "The data service didn't respond in time.";
    case "EMPTY_RESPONSE":
      return "The data service returned nothing for this company.";
    case "NETWORK":
      return "Couldn't reach the server.";
    default:
      return `The data service returned an error${e.upstreamStatus ? ` (${e.upstreamStatus})` : ""}.`;
  }
}
