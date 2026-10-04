// HELD, AND VALUED BY NO STATEMENT — `BOOK_UNVALUED_HOLDINGS` held to the archive (A-17).
//
// docs/BOOK-REPORT.md has always NAMED the rows an account's holdings document
// reports with units and no market value; nothing on screen could read them, so
// an account holding some unvalued rows showed only the valued ones and an
// account holding nothing BUT unvalued rows showed an empty account. The export
// carries every one of them as a QUANTITY. This suite holds it to the archive:
//
//   · every quantity-only row in each account's AUTHORITATIVE holdings document
//     (the precedence table's report type, newest issue — re-expressed here, not
//     imported from the builder) appears exactly once, and nothing else does;
//   · no row carries a value, and none is also a valued position;
//   · the reason is the row's own — a custodian's face value, a custodian's
//     missing rate, or a fund that publishes no NAV;
//   · where a custodian's row names the same owner's fund account as reporting
//     the same units, that account really does carry them, to the printed
//     precision — so a screen can list the holding once.
import fs from "node:fs";
import path from "node:path";
import { BOOK_ACCOUNTS, BOOK_POSITIONS, BOOK_POLYCAB, BOOK_UNVALUED_HOLDINGS } from "@/data/glowData";
// @ts-ignore — precedence.mjs is a plain-JS committed decision table with no
// declaration file; the suite reads the decision itself, not the builder's use of it.
import { sourceFor } from "../../../scripts/ingest/precedence.mjs";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

type Row = Record<string, any>;
type Doc = { docKey: string; provider: string; accountNo: string; reportType: string; asOf: string | null; status?: string; holdings?: Row[] };
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const AUDIT = path.resolve("public/audit");
const docs: Doc[] = fs.readdirSync(AUDIT).sort()
  .map((dir) => path.join(AUDIT, dir, "document.json"))
  .filter((f) => fs.existsSync(f))
  .map((f) => JSON.parse(fs.readFileSync(f, "utf8")) as Doc)
  .filter((d) => d.status !== "failed" && d.accountNo);

// The fence is a decision about a security, read off the book's own fenced rows.
const FENCED = new Set(BOOK_POLYCAB.map((p) => p.securityKey));

// ── WHAT THE ARCHIVE SAYS EACH ACCOUNT HOLDS AND NOTHING VALUES ──────────────
const expected: { accountId: string; securityKey: string; quantity: number | null; faceValue: number | null; custody: boolean;
  lastMovementRate: number | null; lastMovementValue: number | null }[] = [];
for (const a of BOOK_ACCOUNTS) {
  const mine = docs.filter((d) => d.provider === a.provider && d.accountNo === a.accountNo);
  const rule = sourceFor(a.provider, "holdings") as { reportTypes: string[] } | null;
  if (!rule) continue;
  let doc: Doc | null = null;
  for (const rt of rule.reportTypes) {
    // The newest issue of the first authoritative type present; ties on docKey,
    // exactly as a snapshot supersedes.
    const issues = mine.filter((d) => d.reportType === rt)
      .sort((x, y) => (y.asOf ?? "").localeCompare(x.asOf ?? "") || x.docKey.localeCompare(y.docKey));
    if (issues.length) { doc = issues[0]; break; }
  }
  for (const h of doc?.holdings ?? []) {
    if (num(h.marketValue) || !h.securityKey || FENCED.has(h.securityKey)) continue;
    expected.push({
      accountId: a.accountId, securityKey: h.securityKey, quantity: num(h.quantity) ? h.quantity : null,
      faceValue: num(h.faceValue) ? h.faceValue : null, custody: /demat/i.test(a.provider),
      // The Motilal Oswal statements print, where they print a rate at all, the
      // price of the holding's LAST DEPOSITORY MOVEMENT and that price times the
      // movement's own units (Stage 10cz) — archived as such, never as a mark.
      lastMovementRate: num(h.lastMovementRate) && h.lastMovementRate > 0 ? h.lastMovementRate : null,
      lastMovementValue: num(h.lastMovementValue) ? h.lastMovementValue : null,
    });
  }
}

const key = (r: { accountId: string; securityKey: string; quantity: number | null }) => `${r.accountId}|${r.securityKey}|${r.quantity}`;
const count = <T,>(xs: T[], k: (x: T) => string) => { const m = new Map<string, number>(); for (const x of xs) m.set(k(x), (m.get(k(x)) ?? 0) + 1); return m; };
const want = count(expected, key);
const got = count(BOOK_UNVALUED_HOLDINGS, key);
const short = [...want].filter(([k, n]) => (got.get(k) ?? 0) !== n).map(([k]) => k);
const surplus = [...got].filter(([k]) => !want.has(k)).map(([k]) => k);
ok("every quantity-only row in an authoritative holdings document appears exactly once", expected.length > 0 && short.length === 0,
  short.slice(0, 5).join("; ") || `${expected.length} row(s) across ${new Set(expected.map((e) => e.accountId)).size} account(s)`);
ok("…and nothing else does", surplus.length === 0, surplus.slice(0, 5).join("; ") || "none");

// LOAD-BEARING: the partly-valued accounts are the case the page could not see.
const valuedAccounts = new Set(BOOK_POSITIONS.map((p) => p.accountId));
const partly = [...new Set(BOOK_UNVALUED_HOLDINGS.map((u) => u.accountId))].filter((a) => valuedAccounts.has(a));
ok("rows from accounts that ALSO hold valued positions are carried, not only wholly-unvalued accounts", partly.length > 0,
  partly.join(", "));

// ── A QUANTITY, NEVER A VALUE ────────────────────────────────────────────────
const VALUE_KEYS = ["marketValue", "value", "costBasis", "currentPrice", "unrealizedPnL"];
ok("no row carries a value field", BOOK_UNVALUED_HOLDINGS.every((u) => VALUE_KEYS.every((k) => !(k in u))));
const posKeys = new Set(BOOK_POSITIONS.map((p) => `${p.accountId}|${p.securityKey}`));
const alsoPos = BOOK_UNVALUED_HOLDINGS.filter((u) => posKeys.has(`${u.accountId}|${u.securityKey}`));
ok("no unvalued row is also a valued position of the same account", alsoPos.length === 0, alsoPos.map((u) => u.security).join("; "));
ok("no ring-fenced security is named", BOOK_UNVALUED_HOLDINGS.every((u) => !FENCED.has(u.securityKey)));

// ── THE REASON IS THE ROW'S OWN ──────────────────────────────────────────────
const wrongReason: string[] = [];
for (const e of expected) {
  const u = BOOK_UNVALUED_HOLDINGS.find((x) => key(x) === key(e));
  if (!u) continue;
  const r = u.reason;
  const rupees = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 3 })}`;
  const right = e.custody
    ? (e.faceValue !== null ? /face value of/.test(r) && r.includes(String(e.faceValue))
      : e.lastMovementRate !== null ? /depository movement/.test(r) && r.includes(rupees(e.lastMovementRate))
        && /not a valuation/.test(r) && /quantity and no value/.test(r)
      : /prints no rate/.test(r))
    : /no NAV/.test(r);
  if (!right || u.faceValue !== e.faceValue || (u.lastMovementRate ?? null) !== e.lastMovementRate
    || (u.lastMovementValue ?? null) !== e.lastMovementValue) wrongReason.push(`${u.accountId} ${u.security}: ${r.slice(0, 60)}`);
}
ok("each reason names the row's own cause — face value, a last movement's price, no rate, or no NAV",
  wrongReason.length === 0, wrongReason.slice(0, 4).join("; "));
// LOAD-BEARING: the last-movement branch must have a subject, or the check above
// passes over the three Motilal statements without ever reading one.
const movedRows = expected.filter((e) => e.custody && e.faceValue === null && e.lastMovementRate !== null);
ok("…and the last-movement cause is in use — the Motilal statements' printed rate reaches the book as a movement, never as a mark",
  movedRows.length > 0 && movedRows.every((e) => !BOOK_POSITIONS.some((p) => p.accountId === e.accountId && p.securityKey === e.securityKey)),
  `${movedRows.length} row(s)`);

// ── THE SAME UNITS SEEN FROM TWO SIDES ARE NAMED AS SUCH ─────────────────────
const tie = (q: number | null | undefined, w: number) => num(q) && Math.abs(q - w) <= 0.0005 + Math.abs(w) * 1e-9;
const ownerOf = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a.ownerId]));
const pairProblems: string[] = [];
const paired = BOOK_UNVALUED_HOLDINGS.filter((u) => u.sameUnitsReportedBy);
for (const u of paired) {
  const other = u.sameUnitsReportedBy!;
  const carries = [...BOOK_POSITIONS, ...BOOK_UNVALUED_HOLDINGS].some((x) => x.accountId === other && num(u.quantity) && tie(x.quantity, u.quantity));
  if (ownerOf.get(other) !== u.ownerId || !carries || other === u.accountId) pairProblems.push(`${u.accountId} ${u.security} -> ${other}`);
}
ok("a custodian row names its fund account only where that account carries the same units for the same owner",
  paired.length > 0 && pairProblems.length === 0, pairProblems.join("; ") || `${paired.length} paired`);

console.log(`\n${fails ? `${fails} FAILED` : "all passed"}`);
process.exit(fails ? 1 : 0);
