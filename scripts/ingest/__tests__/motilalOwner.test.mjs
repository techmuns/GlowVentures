// THE CLIENT-ID JOIN ON THE MOTILAL OSWAL DEMAT STATEMENTS (Stage 10db).
// Run: node scripts/ingest/__tests__/motilalOwner.test.mjs
//
// Demat 1201090032387399 prints Aarti as its first holder, Ajay and Aarti as
// the second and third, `A/C Type: NIN`, and a masked PAN that fits nobody in
// the registry. It was excluded from the book because those identifiers gave
// three answers. The family's own investment register and their 30 June review
// both name its holder — the Bharat Jaisinghani Family Trust — and
// `motilalDemat.mjs` carries that join, keyed on the client ID the page prints.
//
// ── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────────
//
// A re-attribution moves a holding from one taxpayer to another, and nothing on
// a rendered page could catch it being wrong. So the cases are the join's
// BOUNDARIES, and every way it refuses:
//
//   • on the real archived pages it yields the trust, and without the entry the
//     same pages read exactly as they did before — excluded, with the reason;
//   • it fires on no other Motilal document in the archive, and on no
//     near-miss client ID;
//   • each check the reader makes on the page refuses the join on its own: an
//     owner that is not canonical, an owner that is not a trust, a missing or
//     a person's account type, a missing masked PAN, a mask that fits another
//     registered taxpayer, and a mask that does not fit the trust's own PAN;
//   • a refusal reads the page as printed and says why.
//
// The refusal cases run on SYNTHETIC page text in the real layout, against a
// joins table passed in, so they exercise the reader rather than the archive.
// No PAN is written here: a mask that must fit a registered PAN is derived from
// the registry at run time, and a failure never prints one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extract, identityOf, beneficialOwnerOn, maskedPanMatches,
  BENEFICIAL_OWNER_BY_CLIENT_ID, IDENTITY_WARNING_CODES, PROVIDER,
} from "../providers/motilalDemat.mjs";
import { OWNERS, resolveOwner } from "../../../shared/owners.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const AUDIT = path.join(ROOT, "public/audit");

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) pass++; else { fail++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("motilalOwner");

const TRUST_ID = "1201090032387399";
const TRUST = "Bharat Jaisinghani Family Trust";
const code = (id, c) => (id.warnings ?? []).find((w) => w.code === c) ?? null;

/** A mask in the statement's own form, built from a registry PAN. Never printed. */
const maskOf = (pan) => `${pan.slice(0, 2)}XXX-XX-${pan.slice(8)}`;
const panOf = (ownerId) => (OWNERS.find((o) => o.ownerId === ownerId)?.pans ?? [])[0] ?? null;

/** `extract()`'s own text, from the committed pages — the same join the replay uses. */
function archivedText(docKey) {
  const p = path.join(AUDIT, docKey, "pages.json");
  if (!fs.existsSync(p)) return null;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return (j.pages ?? []).map((x) => x.text ?? "").join("\n").replace(/[ \t]+/g, " ");
}

/**
 * A holding statement's identity block in the real layout. The contact line the
 * real page carries is left out: it is not read, and it is a contact detail.
 */
function page({
  clientId = TRUST_ID, acType = "NIN", holder = "AARTI AJAY JAISINGHANI",
  maskedPan = "ZZXXX-XX-0Z", second = "AJAY T JAISINGHANI", third = "AARTI AJAY JAISINGHANI",
} = {}) {
  const acTypePart = acType == null ? "" : ` A/C Type: ${acType}`;
  const panPart = maskedPan == null ? "PAN No:" : `PAN No: ${maskedPan}`;
  return [
    "Motilal Oswal Financial Services Limited",
    "CDSL AND NSDL : IN-DP-16-2015,AMFI:ARN 146822",
    `Client ID: ${clientId} A/C Status: Active${acTypePart} UCC Code: H00000`,
    `Client Name: ${holder} ${panPart}`,
    `Address: 1 TEST ROAD Second Holder: ${second}`,
    "MUMBAI",
    `Third Holder: ${third}`,
    "DP Holdings As On: 31/07/2026",
    "ISIN ISIN NAME FREE BAL. PLEDGE / EARMARK SAFE / PENDING TOTAL Rs Rs",
  ].join("\n").replace(/[ \t]+/g, " ");
}

// ── 0. THE PREMISES THE SYNTHETIC CASES REST ON ──────────────────────────────
//
// The default mask must fit NOBODY, or every refusal below is decided by a
// collision rather than by the check it is written for.
{
  const fitsSomebody = OWNERS.some((o) => (o.pans ?? []).some((p) => maskedPanMatches("ZZXXX-XX-0Z", p) === true));
  ok("the synthetic mask fits no registered PAN", !fitsSomebody);
  const trust = resolveOwner(TRUST);
  ok("the trust is a canonical owner", trust.owner?.ownerId === "bharat-jaisinghani-family-trust" && trust.matchedBy === "alias",
    `got ${trust.owner?.ownerId} by ${trust.matchedBy}`);
  ok("…of kind trust", trust.owner?.kind === "trust");
  ok("the replay recognises both of the join's warning codes",
    IDENTITY_WARNING_CODES.includes("owner-from-register") && IDENTITY_WARNING_CODES.includes("beneficial-owner-refused"));
}

// ── 1. THE REAL PAGES: THE TRUST WITH THE ENTRY, EXCLUDED WITHOUT IT ─────────
//
// Both archived documents of the account. Without the entry they must read as
// they did before it existed — that is what makes the join LOAD-BEARING rather
// than decorative: drop it and the account leaves the book again, with its
// reason.
const manifest = JSON.parse(fs.readFileSync(path.join(AUDIT, "manifest.json"), "utf8"));
const motilalDocs = manifest.filter((e) => e.provider === PROVIDER);
const trustDocs = motilalDocs.filter((e) => e.accountNo === TRUST_ID);
ok("the archive carries both of the account's documents", trustDocs.length === 2, `got ${trustDocs.length}`);

for (const entry of trustDocs) {
  const text = archivedText(entry.docKey);
  ok(`${entry.reportType}: its page text is in the archive`, !!text);
  if (!text) continue;
  const now = identityOf(text);
  const pre = identityOf(text, {});
  const label = entry.reportType;

  ok(`${label}: the page is read as client ${TRUST_ID}`, now.clientId === TRUST_ID, `got ${now.clientId}`);
  ok(`${label}: with the entry it is the trust's`, now.owner === TRUST && now.ownerId === "bharat-jaisinghani-family-trust",
    `got ${now.owner} (${now.ownerId})`);
  ok(`${label}: …and it is in the book`, now.excludedFromBook === null);
  const w = code(now, "owner-from-register");
  ok(`${label}: …and the join is recorded as a warning`, !!w);
  ok(`${label}: the warning names the holder the page prints`, !!w && w.detail.includes("AARTI AJAY JAISINGHANI"));
  ok(`${label}: the warning cites the register and the review`, !!w && /register/i.test(w.detail) && /review/i.test(w.detail));
  ok(`${label}: no refusal or contradiction is recorded beside it`,
    !code(now, "beneficial-owner-refused") && !code(now, "pan-contradicts-name") && !code(now, "owner-unresolved"));

  // WITHOUT THE ENTRY: the reading this account had before Stage 10db.
  ok(`${label}: without the entry it is nobody's`, pre.owner === null && pre.ownerId === null, `got ${pre.owner}`);
  ok(`${label}: …it is held out of the book, with the reason`, typeof pre.excludedFromBook === "string" && pre.excludedFromBook.length > 40);
  ok(`${label}: …because the PAN contradicts the printed name`, !!code(pre, "pan-contradicts-name"));
  ok(`${label}: …and no join is recorded`, !code(pre, "owner-from-register") && !code(pre, "beneficial-owner-refused"));
  // THE PAGE'S OWN FIELDS ARE THE SAME EITHER WAY. The join moves an owner and
  // never re-reads the page.
  for (const f of ["clientId", "ucc", "holderName", "maskedPan", "acType", "second", "third"]) {
    ok(`${label}: \`${f}\` reads the same with or without the entry`, now[f] === pre[f]);
  }
  ok(`${label}: the account type the page prints is not a person's`, !!now.acType && !/^individual/i.test(now.acType),
    `got ${now.acType}`);

  // AND THE ARCHIVE CARRIES WHAT THE READER NOW PRODUCES — the replay landed it.
  const doc = JSON.parse(fs.readFileSync(path.join(AUDIT, entry.docKey, "document.json"), "utf8"));
  ok(`${label}: the archived document is the trust's`, doc.owner === TRUST && doc.ownerId === "bharat-jaisinghani-family-trust",
    `got ${doc.owner} (${doc.ownerId})`);
  ok(`${label}: …and is not excluded`, (doc.excludedFromBook ?? null) === null);
  ok(`${label}: the manifest agrees`, entry.owner === TRUST && entry.ownerId === "bharat-jaisinghani-family-trust");
}

// ── 2. THE JOIN FIRES ON NO OTHER MOTILAL DOCUMENT ───────────────────────────
//
// Every other demat in this drop keeps the reading its own page gives. A table
// that fired elsewhere would hand somebody's holdings to a trust.
{
  let others = 0, moved = [];
  for (const entry of motilalDocs) {
    if (entry.accountNo === TRUST_ID) continue;
    const text = archivedText(entry.docKey);
    if (!text) continue;
    others += 1;
    const now = identityOf(text), pre = identityOf(text, {});
    const same = now.owner === pre.owner && now.ownerId === pre.ownerId
      && now.excludedFromBook === pre.excludedFromBook
      && JSON.stringify(now.warnings) === JSON.stringify(pre.warnings);
    if (!same || code(now, "owner-from-register") || code(now, "beneficial-owner-refused")) moved.push(entry.docKey);
  }
  ok("the archive carries other Motilal documents to compare", others >= 10, `got ${others}`);
  ok("no other Motilal document reads differently with the entry", moved.length === 0, moved.join(", "));
}

// ── 3. A NEAR-MISS CLIENT ID IS A DIFFERENT ACCOUNT ─────────────────────────
for (const near of [`${TRUST_ID}0`, TRUST_ID.slice(0, -1), `${TRUST_ID.slice(0, -1)}8`]) {
  const id = identityOf(page({ clientId: near }));
  ok(`${near} does not borrow ${TRUST_ID}'s owner`,
    id.clientId === near && id.owner !== TRUST && !code(id, "owner-from-register") && !code(id, "beneficial-owner-refused"),
    `got ${id.owner}`);
}

// ── 4. THE SAME PAGE IN THE SYNTHETIC LAYOUT RESOLVES ────────────────────────
//
// The positive control for every refusal below: the synthetic page, as it is,
// passes every check. A refusal case then changes ONE thing.
{
  const id = identityOf(page());
  ok("the synthetic page resolves to the trust", id.owner === TRUST && id.excludedFromBook === null, `got ${id.owner}`);
  const doc = extract({ grid: { pages: [{ text: page() }] }, meta: { docKey: "test" } });
  ok("extract() carries the trust into the document", doc?.owner === TRUST && doc?.ownerId === "bharat-jaisinghani-family-trust",
    `got ${doc?.owner}`);
  ok("…keyed on the client ID, not the file name", doc?.accountNo === TRUST_ID);
  ok("…and in the book", doc?.excludedFromBook === null);
  ok("…with the depository's own account type in its engagement", /NIN/.test(doc?.providerEngagement ?? ""));
  ok("…and the trustees as joint holders", JSON.stringify(doc?.jointHolders) === JSON.stringify(["AJAY T JAISINGHANI", "AARTI AJAY JAISINGHANI"]),
    JSON.stringify(doc?.jointHolders));
}

// ── 5. EVERY CHECK REFUSES THE JOIN ON ITS OWN ───────────────────────────────
//
// Each case changes one thing from section 4 and must refuse — the warning says
// which check failed, and the page is read as printed.
function refused(label, text, joins, why, { owner, excluded }) {
  const id = identityOf(text, joins);
  const w = code(id, "beneficial-owner-refused");
  ok(`${label}: the join is refused`, !!w && !code(id, "owner-from-register"));
  ok(`${label}: …naming the check that failed`, !!w && why.test(w.detail));
  ok(`${label}: …and the page is read as printed`, id.owner === owner, `got ${id.owner}`);
  ok(`${label}: …${excluded ? "held out of the book" : "in the book under that reading"}`,
    excluded ? typeof id.excludedFromBook === "string" : id.excludedFromBook === null);
}

refused("an owner the registry does not carry", page(),
  { [TRUST_ID]: { owner: "Somebody Not In The Registry", via: "test" } },
  /is not a canonical owner/, { owner: null, excluded: true });

refused("an owner who is a person", page(),
  { [TRUST_ID]: { owner: "Ajay Jaisinghani", via: "test" } },
  /is not a trust/, { owner: null, excluded: true });

refused("a page with no account type", page({ acType: null }),
  BENEFICIAL_OWNER_BY_CLIENT_ID,
  /A\/C Type.*was not read/, { owner: null, excluded: true });

refused("a page that is a person's account", page({ acType: "Individual-Resident" }),
  BENEFICIAL_OWNER_BY_CLIENT_ID,
  /a person's account/, { owner: null, excluded: true });

// No mask: the name cannot be contradicted either, so the page reads as the
// printed holder's — unchecked, not failed, which is how the reader has always
// treated a missing PAN.
refused("a page with no masked PAN", page({ maskedPan: null }),
  BENEFICIAL_OWNER_BY_CLIENT_ID,
  /no masked PAN/, { owner: "Aarti Jaisinghani", excluded: false });

// A mask that fits the PRINTED holder's own PAN: the account is hers, and the
// join must not take it from her.
{
  const pan = panOf("aarti-jaisinghani");
  ok("the registry carries the printed holder's PAN", !!pan);
  if (pan) {
    refused("a mask that fits the printed holder's PAN", page({ maskedPan: maskOf(pan) }),
      BENEFICIAL_OWNER_BY_CLIENT_ID,
      /fits Aarti Jaisinghani's PAN/, { owner: "Aarti Jaisinghani", excluded: false });
  }
}

// A mask that fits a THIRD taxpayer: neither the trust nor the printed holder.
{
  const pan = panOf("ajay-jaisinghani");
  ok("the registry carries a third taxpayer's PAN", !!pan);
  if (pan) {
    refused("a mask that fits another registered taxpayer", page({ maskedPan: maskOf(pan) }),
      BENEFICIAL_OWNER_BY_CLIENT_ID,
      /fits Ajay Jaisinghani's PAN/, { owner: null, excluded: true });
  }
}

// A trust the registry carries a PAN for: the mask must fit THAT PAN.
{
  const t2 = "Bharat Jaisinghani Family Trust 2";
  const pan = panOf("bharat-jaisinghani-family-trust-2");
  ok("the registry carries a PAN for a trust", !!pan);
  refused("a mask that does not fit the trust's own PAN", page(),
    { [TRUST_ID]: { owner: t2, via: "test" } },
    /does not fit Bharat Jaisinghani Family Trust 2's own PAN/, { owner: null, excluded: true });
  if (pan) {
    const id = identityOf(page({ maskedPan: maskOf(pan) }), { [TRUST_ID]: { owner: t2, via: "test" } });
    ok("a mask that fits the trust's own PAN is accepted", id.owner === t2 && id.excludedFromBook === null && !!code(id, "owner-from-register"),
      `got ${id.owner}`);
  }
}

// ── 6. THE TABLE ITSELF ──────────────────────────────────────────────────────
{
  const entries = Object.entries(BENEFICIAL_OWNER_BY_CLIENT_ID);
  ok("every key is a whole client ID", entries.every(([k]) => /^\d{16}$/.test(k)), entries.map(([k]) => k).join(", "));
  ok("every entry passes on its own terms with nothing to check against",
    entries.every(([k]) => beneficialOwnerOn({ clientId: k, acType: "NIN", maskedPan: "ZZXXX-XX-0Z" })?.refused === null));
  ok("every entry names a canonical trust", entries.every(([, e]) => {
    const r = resolveOwner(e.owner);
    return r.matchedBy === "alias" && r.owner?.kind === "trust";
  }));
  const owners = entries.map(([, e]) => e.owner);
  ok("no two client IDs name one owner", new Set(owners).size === owners.length, owners.join(", "));
  ok("every entry cites its evidence", entries.every(([, e]) => typeof e.via === "string" && e.via.length > 80
    && /register/i.test(e.via) && /review/i.test(e.via)));
  // THE CITATION IS A DOCUMENT'S OWN ROWS, NOT A CONTACT DETAIL. A masked
  // phone number or address in the reason would put a personal detail into the
  // archive on every read.
  ok("no entry cites a contact detail", entries.every(([, e]) => !/@|\d{2}X{3}|Contact/i.test(e.via)));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
