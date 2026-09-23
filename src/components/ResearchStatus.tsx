import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { RESEARCH_NAME, failSentence, type SyncStatus } from "@/lib/researchLevels";
import { useResearchState, useResearchStatus, useResearchSummary } from "@/lib/useResearchSync";

// ── WHERE A LEVEL WENT, IN ONE LINE (Stage 10cg) ─────────────────────────────
//
// *"when the user puts target price inside the dashboard, it should
// automatically also go to the Glow Central Research dashboard."* The sending is
// automatic; what the family needs from the screen is to KNOW it arrived — and,
// where it did not, why and what happens next. So the line under a holding's
// alert boxes says exactly one of those, in plain words, and never "sent" for a
// level the other app has not confirmed holding.

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

/** The sentence and its tone for one saved entry. */
export function researchLine(s: SyncStatus, busy: boolean): { tone: "ok" | "busy" | "warn" | "note"; text: string } {
  switch (s.kind) {
    case "sent":
      return { tone: "ok", text: `Saved here and in ${RESEARCH_NAME}, which alerts there too when a level is reached` };
    case "sending":
      return { tone: "busy", text: `Saved in this browser · sending to ${RESEARCH_NAME}…` };
    case "failed":
      return busy
        ? { tone: "busy", text: `Saved in this browser · sending to ${RESEARCH_NAME}…` }
        : { tone: "warn", text: `Saved in this browser · not in ${RESEARCH_NAME} yet: ${failSentence(s.code, origin())}` };
    case "declined":
      return {
        tone: "warn",
        text: s.why === "elsewhere"
          ? `Saved in this browser · not sent: ${RESEARCH_NAME} already has levels for ${s.ticker} from another device. Change a level here to replace them with these`
          : `Saved in this browser · not sent: the levels for ${s.ticker} were removed in ${RESEARCH_NAME} from another device. Change a level here to send these again`,
      };
    case "refused":
      return { tone: "warn", text: `Saved in this browser · not sent: ${RESEARCH_NAME}'s list of companies is full` };
    case "shadowed":
      return { tone: "note", text: `Saved in this browser · ${RESEARCH_NAME} keeps one set of levels per company, and the ones saved on ${s.byName} were sent for ${s.ticker}` };
    case "local":
      return { tone: "note", text: `Saved in this browser only · ${s.why}` };
    default:
      return { tone: "note", text: "Saved in this browser only" };
  }
}

const ICON = {
  ok: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-gain" aria-hidden />,
  busy: <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" aria-hidden />,
  warn: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />,
  note: <Info className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />,
} as const;

/** Under a holding's alert boxes: whether its levels reached Glow Central Research. */
export function ResearchStatusLine({ securityKey, updatedAt }: { securityKey: string; updatedAt: string }) {
  const status = useResearchStatus(securityKey);
  const { busy } = useResearchState();
  const line = researchLine(status, busy);
  return (
    <p data-research-status={status.kind} data-research-ticker={"ticker" in status ? status.ticker : ""}
      className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-snug text-slate-500">
      {ICON[line.tone]}
      <span>
        <span className={line.tone === "ok" ? "text-slate-300" : line.tone === "warn" ? "text-slate-300" : undefined}>{line.text}</span>
        {updatedAt ? ` · last changed ${fmtDateTime(updatedAt)}` : ""}.
      </span>
    </p>
  );
}

/**
 * Under the All alerts table: how many companies' levels are in Glow Central
 * Research, counted rather than claimed, and the one reason any are not.
 */
export function ResearchSummaryText() {
  const s = useResearchSummary();
  const { busy } = useResearchState();
  if (s.companies === 0 && s.local === 0) return null;
  const parts: string[] = [];
  if (s.companies > 0) {
    parts.push(`${s.sent} of ${s.companies} ${s.companies === 1 ? "company" : "companies"} sent`);
    if (s.waiting > 0) {
      parts.push(busy || !s.code ? `${s.waiting} sending` : `${s.waiting} not sent yet — ${failSentence(s.code, origin())}`);
    }
    if (s.declined > 0) parts.push(`${s.declined} held back because ${RESEARCH_NAME} already had levels from another device`);
    if (s.refused > 0) parts.push(`${s.refused} refused because its list is full`);
  }
  if (s.local > 0) parts.push(`${s.local} ${s.local === 1 ? "stays" : "stay"} here only (no NSE symbol)`);
  return (
    <span data-research-summary data-sent={s.sent} data-companies={s.companies} data-waiting={s.waiting}
      data-declined={s.declined} data-local={s.local} data-code={s.code ?? ""}>
      {" "}Alerts on listed shares also go to {RESEARCH_NAME}, which alerts there when a level is reached: {parts.join(" · ")}.
    </span>
  );
}
