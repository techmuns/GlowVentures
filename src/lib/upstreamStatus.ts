/**
 * ONE VOCABULARY FOR "THE DATA SERVICE DID NOT ANSWER".
 *
 * Every research surface on this dashboard talks to the same in-house API and
 * every one of them wrote its own sentence for a failure. Measured against the
 * live deployment on 2026-08-13, with the site's own cache-bypassing control
 * failing alongside them:
 *
 *   fastapi.muns.io   quotes · street estimates · /financials · ratio_source
 *                     · web-reader · market_data          → HTTP 522
 *   devde.muns.io     financial_tables · filings · drhp   → HTTP 522
 *   birdnest.muns.io  corporate announcements             → answering
 *   hostapi.muns.io   news search                         → answering
 *
 * 522 is Cloudflare's own status and it means one specific thing: Cloudflare
 * reached the hostname but the server behind it never completed a connection.
 * It is therefore NOT an answer about the company that was asked for — and the
 * company page was saying it was. "No ratio table for this company" over a 522
 * tells a reader that Reliance publishes no ratios. That is the wrong-diagnosis
 * failure this book already names in its conventions: a message that misstates
 * the cause is worse than a blank panel, because the reader acts on it.
 *
 * So the CAUSE decides the headline. A gateway status, a timeout or a dead
 * socket is a fact about the service; only an empty 200 is a fact about the
 * company.
 */

/** Statuses that mean "the request never reached a working server". */
const GATEWAY = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527]);

/** Failure codes our own Functions emit for a request that never got an answer. */
const NO_ANSWER = new Set([
  "UPSTREAM_ERROR",
  "UPSTREAM_NO_RESPONSE",
  "NETWORK",
  "READER_ERROR",
]);

export type UpstreamFailure = {
  failureCode: string;
  upstreamStatus?: number | null;
  detail?: string | null;
};

/**
 * Is this the service being unreachable, rather than an answer about the thing
 * we asked for? Callers use it to pick a headline, so it must be conservative:
 * an unrecognised code is NOT reported as an outage.
 */
export function isOutage(e: UpstreamFailure): boolean {
  if (NO_ANSWER.has(e.failureCode)) return true;
  return typeof e.upstreamStatus === "number" && GATEWAY.has(e.upstreamStatus);
}

/**
 * What the status actually means, in the reader's words.
 *
 * The number stays in the sentence — a family member forwarding this to whoever
 * runs the API needs it — but it is never the whole message. Each of these is
 * the plain-English reading of the status, not a paraphrase of the number.
 */
function statusMeaning(status: number | null | undefined): string | null {
  switch (status) {
    case 522:
    case 523:
      return "its server accepted no connection";
    case 521:
      return "its server refused the connection";
    case 524:
    case 504:
      return "its server accepted the request and never finished answering";
    case 502:
      return "the gateway in front of it got no valid reply";
    case 503:
      return "it reported itself unavailable";
    case 520:
    case 525:
    case 526:
    case 527:
      return "the connection to it failed";
    default:
      return null;
  }
}

/**
 * A headline that describes the SERVICE, for use where the panel would
 * otherwise assert something about the company.
 */
export const outageHeadline = "The market-data service is not responding";

/**
 * The sentence under that headline. `what` names what the panel would have
 * shown, so the reader knows what is missing rather than only that something is.
 */
export function outageSentence(e: UpstreamFailure, what: string): string {
  const meaning = statusMeaning(e.upstreamStatus);
  const code = typeof e.upstreamStatus === "number" ? ` (HTTP ${e.upstreamStatus})` : "";
  const cause = e.failureCode === "NETWORK"
    ? "This browser could not reach the dashboard's own server"
    : meaning
      ? `The data service was reached but ${meaning}${code}`
      : e.failureCode === "UPSTREAM_NO_RESPONSE"
        ? "The data service did not answer in time"
        : `The data service returned an error${code}`;
  return `${cause}, so ${what} could not be fetched. This is the service being down — it is not an answer about this company, `
    + `and nothing on this page has been substituted for it. It fills in on its own once the service answers again; `
    + `every figure sourced from the statements is unaffected.`;
}

/**
 * The one-line version, for a tooltip or a status bar where a paragraph will
 * not fit.
 */
export function outageShort(e: UpstreamFailure): string {
  const meaning = statusMeaning(e.upstreamStatus);
  const code = typeof e.upstreamStatus === "number" ? ` (HTTP ${e.upstreamStatus})` : "";
  if (e.failureCode === "NETWORK") return "This browser could not reach the dashboard's own server.";
  if (meaning) return `The data service was reached but ${meaning}${code}.`;
  if (e.failureCode === "UPSTREAM_NO_RESPONSE") return "The data service did not answer in time.";
  return `The data service returned an error${code}.`;
}
