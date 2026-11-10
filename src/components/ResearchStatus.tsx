import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { researchLine } from "@/lib/researchLevels";
import { useResearchState, useResearchStatus } from "@/lib/useResearchSync";

// ── WHERE A LEVEL WENT, IN ONE LINE (Stage 10cq) ─────────────────────────────
//
// *"when the user puts target price inside the dashboard, it should
// automatically also go to the Glow Central Research dashboard."* The sending is
// automatic; what the family needs from the screen is to KNOW it arrived — and,
// where it did not, why and what happens next. So the line under a holding's
// alert boxes says exactly one of those, and never "sent" for a level the other
// app has not confirmed holding.
//
// A STATUS ON ITS FACE, THE SENTENCE IN ITS HOVER — main's Stage 10cp rule for
// every page: what a line says is a few words (saved here and there; waiting,
// and until when; held back, and by what), and the sentence that explains it is
// the hover. `researchLine` (in `researchLevels.ts`, pure) picks the words and
// `readsAsSentence` is the rule; the suite holds every face to it.

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");

const ICON = {
  ok: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-gain" aria-hidden />,
  busy: <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" aria-hidden />,
  warn: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />,
  note: <Info className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />,
} as const;

/**
 * Under a holding's alert boxes: whether its levels reached Glow Central
 * Research. The status and the date are two ITEMS of one row — a status, then
 * when the entry last changed — and the sentence behind the status is the row's
 * hover.
 */
export function ResearchStatusLine({ securityKey, updatedAt }: { securityKey: string; updatedAt: string }) {
  const status = useResearchStatus(securityKey);
  const { busy } = useResearchState();
  const line = researchLine(status, busy, origin());
  return (
    <p data-research-status={status.kind} data-research-ticker={"ticker" in status ? status.ticker : ""} title={line.title}
      className="mt-3 flex flex-wrap items-start gap-x-1.5 gap-y-0.5 text-[11.5px] leading-snug text-slate-500">
      {ICON[line.tone]}
      <span className={line.tone === "ok" || line.tone === "warn" ? "text-slate-300" : undefined}>{line.text}</span>
      {updatedAt ? <span>· last changed {fmtDateTime(updatedAt)}</span> : null}
    </p>
  );
}
