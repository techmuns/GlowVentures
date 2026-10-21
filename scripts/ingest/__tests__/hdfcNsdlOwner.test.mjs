// THE BENEFICIAL-OWNER JOIN ON THE HDFC NSDL STATEMENTS.
// Run: node scripts/ingest/__tests__/hdfcNsdlOwner.test.mjs
//
//   "Bharat Jaisinghani Trust looks empty on holdings, so check that as well
//    since the client has provided half of the statements already."
//
// Both statements print `AJAY T JAISINGHANI` on the holder line — he is the
// TRUSTEE — and the family's own investment register records the 347 Swapeco
// preference shares each one holds under a family trust. `hdfcNsdl.mjs` carries
// that join, keyed on the DP account number the page prints.
//
// ── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────────
//
// This is the ONE field in that reader that does not come from the page in
// front of it, and a re-attribution is the most dangerous kind of edit here: it
// moves a holding from one taxpayer to another and nothing on the rendered page
// could catch it. So the cases are about the JOIN'S BOUNDARIES —
//
//   • it fires on the mapped accounts and yields the trust;
//   • it does NOT fire on any other DP account, which is every other statement
//     any reader in this pipeline handles;
//   • it never fires on a PARTIAL or a near-miss account number, because
//     `67786547` and `677865470` are different accounts;
//   • the printed holder still reaches the archive, in the warning, so the
//     re-attribution can be traced to the document it is made against.
//
// Written against a SYNTHETIC statement in the real layout, so it exercises the
// reader rather than the committed archive — the archive would pass whatever
// the map said, being the thing the map was written for.
import { extract, BENEFICIAL_OWNER_BY_DP_ACCOUNT } from "../providers/hdfcNsdl.mjs";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("hdfcNsdlOwner");

/**
 * A statement in the real layout, as the reader receives it: a grid of pages of
 * rows of cells. `flatten` joins the cells with spaces and the rows with
 * newlines, which is what the header regexes run against.
 */
function statement(dpAccount, holder = "AJAY T JAISINGHANI") {
  const line = (...cells) => ({ cells: cells.map((text) => ({ text })) });
  return {
    grid: {
      pages: [{
        rows: [
          line("(A Depository Participant of NSDL)DP ID IN301549"),
          line("Holding Statement as on : 29/08/2026 Business Date: 31/08/2026"),
          line(`DP Account No : ${dpAccount}`),
          line(holder),
          line("AARTI AJAY JAISINGHANI"),
          line("MUMBAI"),
          line("Account Type : Free Balance"),
          line("ISIN Company Name Scrip Type Market Value"),
          line("INE2DT103015 SWAPECO SOLUTIONS PRIVATE LIMITED 347.000 100.000 34,700.000"),
          line("Total Valuation (Rs.) : 34,700.00"),
          line("HDFC Bank Limited"),
        ],
      }],
    },
    meta: { source: "test" },
  };
}

const ownerWarning = (d) => (d.warnings ?? []).find((w) => w.code === "owner-from-register") ?? null;

// ── 1. IT FIRES ON EACH MAPPED ACCOUNT, and yields that account's trust ──────
for (const [acct, entry] of Object.entries(BENEFICIAL_OWNER_BY_DP_ACCOUNT)) {
  const d = extract(statement(acct));
  ok(`${acct} resolves to ${entry.owner}`, d.owner === entry.owner, `got ${d.owner}`);
  ok(`${acct} still reads its own account number`, d.accountNo === acct, `got ${d.accountNo}`);
  const w = ownerWarning(d);
  ok(`${acct} records the join as a warning`, !!w);
  // THE PRINTED HOLDER SURVIVES IN THE RECORD. A re-attribution nobody can
  // trace is worse than none, and the archive is where it has to be traceable.
  ok(`${acct}'s warning names the holder the page prints`, !!w && w.detail.includes("AJAY T JAISINGHANI"));
  ok(`${acct}'s warning cites the register`, !!w && /register/i.test(w.detail));
  // AND THE HOLDING IS UNTOUCHED — this join moves an owner, never a figure.
  ok(`${acct} still reads its holding`, (d.holdings ?? []).length === 1);
  ok(`${acct}'s holding is still quantity-only`,
    d.holdings?.[0]?.quantity === 347 && d.holdings?.[0]?.marketValue == null);
}

// ── 2. IT DOES NOT FIRE ANYWHERE ELSE ───────────────────────────────────────
//
// The boundary that matters. Every other statement in this pipeline keeps the
// holder its own page prints, and a map that fired on an unmapped account would
// hand somebody else's holding to a trust.
{
  const d = extract(statement("12345678"));
  ok("an unmapped account keeps its printed holder", d.owner === "AJAY T JAISINGHANI", `got ${d.owner}`);
  ok("an unmapped account records no join", ownerWarning(d) === null);
}

// ── 3. A NEAR-MISS ACCOUNT NUMBER IS A DIFFERENT ACCOUNT ────────────────────
//
// `67786547` and `677865470` are not the same DP account, and a prefix or
// substring match would quietly claim both. The map is keyed numerically and
// the lookup is exact; these two cases are what say so.
{
  const mapped = Object.keys(BENEFICIAL_OWNER_BY_DP_ACCOUNT)[0];
  for (const near of [`${mapped}0`, mapped.slice(0, -1)]) {
    const d = extract(statement(near));
    ok(`${near} does not borrow ${mapped}'s owner`,
      d.owner === "AJAY T JAISINGHANI" && ownerWarning(d) === null, `got ${d.owner}`);
  }
}

// ── 4. A DIFFERENT PRINTED HOLDER IS STILL OVERRIDDEN, AND STILL RECORDED ───
//
// The join is about the ACCOUNT, not about who the page happens to name — the
// whole point is that the holder line names a trustee. But the warning must
// carry whatever it did name, or the next reader cannot see what was replaced.
{
  const acct = Object.keys(BENEFICIAL_OWNER_BY_DP_ACCOUNT)[0];
  const d = extract(statement(acct, "SOMEONE ELSE ENTIRELY"));
  ok("the join keys on the account, not the printed name",
    d.owner === BENEFICIAL_OWNER_BY_DP_ACCOUNT[acct].owner);
  ok("and the warning names whoever WAS printed",
    ownerWarning(d)?.detail.includes("SOMEONE ELSE ENTIRELY") === true);
}

// ── 5. THE MAP IS A ONE-TO-ONE ONTO THE TRUSTS ──────────────────────────────
//
// Two statements, two trusts. A map that named one trust twice would give it
// both holdings and leave the other empty — which is the state this change
// exists to end, arriving through a typo.
{
  const owners = Object.values(BENEFICIAL_OWNER_BY_DP_ACCOUNT).map((e) => e.owner);
  ok("no two accounts map to one owner", new Set(owners).size === owners.length, owners.join(", "));
  ok("every entry cites its evidence",
    Object.values(BENEFICIAL_OWNER_BY_DP_ACCOUNT).every((e) => e.via && e.via.length > 80));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
