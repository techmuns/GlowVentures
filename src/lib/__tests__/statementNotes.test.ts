// A NOTE ABOUT A MARK MUST STILL BE TRUE OF ITS STATEMENT.   npm run test:family
//
// VD-16 and VD-18. `STATEMENT_NOTES` says what tax basis six funds' marks are on
// and that one cash line is pledged. Each is a transcription, so each is held to
// the committed archive: the cited words must be in that document's pages.json,
// the holding must be in the book, and the note must be about a figure the book
// shows. An entry the next drop makes false fails here rather than going on
// asserting it on screen.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BOOK_ACCOUNTS, BOOK_POSITIONS } from "@/data/glowData";
// THE BOOK THE PAGE READS. A note is drawn beside a figure on screen, and since
// Stage 10cz the pledged ABSL Liquid line is on the LIVE basis only: the Motilal
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

// A NOTE MUST SAY WHAT ITS STATEMENT SAYS, NOT A NEIGHBOURING THING. Sanshi's
// footnote reads "The NAV has been calculated without accounting for the
// applicable Investment Manager's annual performance fees" — a FEE, and the note
// once told a reader the NAV was calculated without accounting for TAX. A
// transcription that swaps the object passes every cite check above, because the
// cited words are still on the page; so the object is asserted.
{
  const sanshi = statementNoteFor("sanshi-fund-i-open-ended-aif-cat-iii-class-e");
  ok("the Sanshi note names the performance fee its NAV is before, as the statement does",
    !!sanshi && /performance fee/.test(sanshi.note) && !/without accounting for tax/i.test(sanshi.note), sanshi?.note ?? "no note");
  const basis = STATEMENT_NOTES.filter((n) => /-tax (NAV|value)$/.test(n.short));
  ok("every tax-basis note is on one of the two bases, in the words its chip prints",
    basis.length >= 2 && basis.every((n) => /^(pre|post)-tax (NAV|value)$/.test(n.short) && n.note.includes(n.short.split(" ")[0])), basis.map((n) => n.short).join(", "));
}

// THE FAMILY'S DEFAULT IS PRE-TAX (28 Sep 2026): *"keep them pre tax only by
// default, whatever is in the review file we will follow the same rule and
// calculation across the dashboard."* Sanshi is the fund that prints both, and
// each of its statements names the post-tax NAV in a footnote. The book's mark
// must be the PRE-tax NAV the statement values the holding at, and above that
// post-tax one: a reader switched to the post-tax figure lands exactly on it,
// and every figure on screen would still look right. A statement with no
// footnote to read is a failure, never a pass over nothing.
{
  const docs = readdirSync("public/audit").filter((d) => /^sanshi-fund-/.test(d));
  let compared = 0;
  for (const d of docs) {
    const text = JSON.stringify(JSON.parse(readFileSync(path.resolve("public/audit", d, "pages.json"), "utf8"))).replace(/\\n/g, " ").replace(/\s+/g, " ");
    const post = /The Post Tax Nav is ([\d,.]+)\/-/.exec(text);
    const doc = JSON.parse(readFileSync(path.resolve("public/audit", d, "document.json"), "utf8"));
    ok(`${d} prints its post-tax NAV`, !!post);
    if (!post) continue;
    const postNav = Number(post[1].replace(/,/g, ""));
    const acc = BOOK_ACCOUNTS.find((a) => a.provider === "Sanshi Fund" && a.accountNo === doc.accountNo);
    for (const h of doc.holdings ?? []) {
      const p = BOOK_POSITIONS.find((q) => q.accountId === acc?.accountId && q.securityKey === h.securityKey);
      if (!p || acc?.asOf !== doc.asOf) continue;
      compared++;
      ok(`${doc.accountNo} ${h.securityKey}: marked at the statement's pre-tax NAV, above its post-tax ${postNav}`,
        p.currentPrice === h.marketPrice && (p.currentPrice ?? 0) > postNav, `book ${p.currentPrice}, statement ${h.marketPrice}`);
    }
  }
  ok("every Sanshi holding the book marks was compared", compared === BOOK_POSITIONS.filter((p) => /^sanshi-fund-i/.test(p.securityKey)).length && compared > 0, String(compared));
}

console.log(fails ? `\n${fails} failed` : "\nall passed");
if (fails) process.exit(1);
