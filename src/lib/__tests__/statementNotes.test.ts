// A NOTE ABOUT A MARK MUST STILL BE TRUE OF ITS STATEMENT.   npm run test:family
//
// VD-16 and VD-18. `STATEMENT_NOTES` says what basis two funds' marks are on and
// that one cash line is pledged. Each is a transcription, so each is held to the
// committed archive: the cited words must be in that document's pages.json, the
// holding must be in the book, and the note must be about a figure the book
// shows. An entry the next drop makes false fails here rather than going on
// asserting it on screen.
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_ACCOUNTS } from "@/data/glowData";
// THE BOOK THE PAGE READS. A note is drawn beside a figure on screen, and since
// Stage 10cy the pledged ABSL Liquid line is on the LIVE basis only: the Motilal
// statement's Rate and Value for it are its last depository movement, not a
// valuation, so the statement basis carries its units and no value, and the page
// values them at AMFI's NAV (`unpricedStatementUnits`). The note is still true
// of the statement — every unit pledged — and of the row it is drawn beside.
import { LIVE_POSITIONS } from "./liveBook";
import { holdingBucket } from "@/lib/analytics";
import { STATEMENT_NOTES, statementNoteFor } from "@/lib/statementNotes";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

for (const n of STATEMENT_NOTES) {
  const file = path.resolve("public/audit", n.cite.docKey, "pages.json");
  let text = "";
  try { text = JSON.stringify(JSON.parse(readFileSync(file, "utf8"))).replace(/\\n/g, " ").replace(/\s+/g, " "); } catch { /* reported below */ }
  ok(`the cited statement is in the archive — ${n.cite.docKey}`, text.length > 0);
  for (const c of n.cite.text) ok(`it prints "${c}"`, text.includes(c), n.cite.docKey);
  const held = LIVE_POSITIONS.filter((p) => n.securityKeys.includes(p.securityKey) && (!n.accountId || p.accountId === n.accountId));
  ok(`the book holds what the note is about — ${n.short}`, held.length > 0 && held.some((p) => p.marketValue > 0), `${held.length} position(s)`);
  ok("the note carries no figure of its own", !/[₹]|\d[\d,]*\.\d/.test(n.note) && !/\d/.test(n.short), n.note);
}

// VD-18 MATTERS BECAUSE OF WHERE THE LINE IS FILED: a pledged balance shown as
// cash is the reading the note exists to correct. If the book ever stops
// filing it as Cash, the note's second sentence is wrong.
{
  const eng = (p: { accountId: string }) => BOOK_ACCOUNTS.find((a) => a.accountId === p.accountId)?.engagement ?? null;
  const absl = LIVE_POSITIONS.filter((p) => p.securityKey === "absl-liqf-d-growth" && p.accountId === "motilal-oswal-financial-services-demat-1201090012838320");
  ok("the pledged ABSL Liquid line is filed under Cash", absl.length === 1 && holdingBucket(absl[0], eng(absl[0])) === "Cash", absl.map((p) => holdingBucket(p, eng(p))).join(","));
  ok("the pledge note is the ABSL line's on that account", statementNoteFor("absl-liqf-d-growth", absl[0]?.accountId)?.short === "all units pledged / earmarked");
  const other = LIVE_POSITIONS.find((p) => p.securityKey === "absl-liqf-d-growth" && p.accountId !== absl[0]?.accountId);
  ok("…and not on another account's line of the same fund", !other || statementNoteFor(other.securityKey, other.accountId) === null, other?.accountId ?? "no other account holds it");
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
if (fails) process.exit(1);
