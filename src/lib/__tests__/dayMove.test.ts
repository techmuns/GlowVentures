// A DAY MOVE IS STRUCK OVER THE LINES THAT HAVE ONE (Stage 10fz).
//   npm run test:family
//
// The Monitor's mandate rows summed `dayChange ?? 0` over every live share and
// divided by every live share's value, so a share on its split's ex-date (whose
// move `applyCorporateActionReturns` nulls) added ₹0 to the move and its whole
// value to the base. `dayMoveOf` strikes both over one set and names the rest.
import { dayMoveOf, dayMoveLeftNote, DAY_NO_PREV_CLOSE, DAY_OTHER_SESSION } from "@/lib/quotes";
import { LIVE_POSITIONS } from "./liveBook";
import type { Position } from "@/lib/types";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};
const near = (a: number | null, b: number, tol = 1e-9) => a !== null && Math.abs(a - b) <= tol;

const line = (security: string, marketValue: number, dayChange: number | null, live = true) =>
  ({ security, securityKey: security.toLowerCase(), marketValue, dayChange, live } as unknown as Position);

// ── THE CONSTRUCTED CASE ────────────────────────────────────────────────────
// Two shares moved +₹2 on ₹102 and −₹1 on ₹99 (prior ₹100 each); a third,
// ₹800, is live with no move. Struck over the two: +₹1 on a ₹200 prior = 0.50%.
// The old construction read +₹1 ÷ (₹1,001 − ₹1) = 0.10%.
{
  const ps = [line("A", 102, 2), line("B", 99, -1), line("C", 800, null), line("D", 500, 3, false)];
  const dm = dayMoveOf(ps);
  ok("the move is the struck lines' move", dm.change === 1);
  ok("the base is the struck lines' value alone", dm.base === 201, `${dm.base}`);
  ok("the percentage is over their prior value — 0.50%", near(dm.pct, 0.5), `${dm.pct}`);
  const oldLiveMV = 102 + 99 + 800, oldMove = 2 - 1 + 0;
  ok("…where the old blend read 0.10%", near((oldMove / (oldLiveMV - oldMove)) * 100, 0.1));
  ok("every live line is still in liveMV", dm.liveMV === 1001);
  ok("the live line with no move is named, with its reason",
    dm.left.length === 1 && dm.left[0].position.security === "C" && dm.left[0].reason === DAY_NO_PREV_CLOSE);
  ok("a line off the feed is neither struck nor left out", !dm.left.some((l) => l.position.security === "D") && dm.struck === 2);
  ok("the hover names it", /C — no measurable day change/.test(dayMoveLeftNote(dm.left)));
}
// ── NONE STRUCK IS ABSENT, NOT 0.00% ────────────────────────────────────────
{
  const dm = dayMoveOf([line("C", 800, null)]);
  ok("with no line struck the move is null", dm.change === null && dm.pct === null);
  ok("…and the line is still named", dm.left.length === 1);
  const none = dayMoveOf([line("D", 500, 3, false)]);
  ok("with nothing live there is nothing to name", none.change === null && none.left.length === 0 && dayMoveLeftNote(none.left) === "");
}
// A MEASURED ZERO MOVE STAYS A ZERO.
{
  const dm = dayMoveOf([line("Z", 100, 0)]);
  ok("a line that did not move is a measured 0%", dm.change === 0 && dm.pct === 0);
}
// ── THE SESSION GATE ────────────────────────────────────────────────────────
{
  const ps = [line("A", 102, 2), line("Old", 210, 10)];
  const dm = dayMoveOf(ps, (p) => p.security !== "Old");
  ok("a quote from another session is left out of both halves", dm.change === 2 && dm.base === 102);
  ok("…and named with that reason", dm.left.length === 1 && dm.left[0].reason === DAY_OTHER_SESSION);
}
// ── ON THE LIVE FIXTURE BOOK: ONE QUOTE'S LINES REPRODUCE ITS OWN PERCENTAGE ──
{
  const quoted = LIVE_POSITIONS.filter((p) => p.live && Number.isFinite(p.dayChange) && Number.isFinite(p.dayChangePct) && p.marketValue > 0);
  const bad = quoted.filter((p) => !near(dayMoveOf([p]).pct, p.dayChangePct!, 1e-6));
  ok("a single live line's move reproduces its quote's percentage", bad.length === 0,
    quoted.length ? `${quoted.length} lines` : "the fixture book carries no live line with a move — checked on the constructed case only");
}

console.log(fails ? `\n${fails} FAILED` : "\nall day-move checks passed");
process.exit(fails ? 1 : 0);
