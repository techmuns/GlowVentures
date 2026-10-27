/**
 * THE DEMAT ACCOUNT A STATEMENT NAMES (Stage 10ic).
 *
 * A fund position held in the family's own name sat on the drill-down as
 * "via own account" and nothing more, so a reader asking WHICH demat holds the
 * units had to open the statement. Most statements print it:
 *
 *   • a depository's own statement prints its participant's DP ID and the
 *     account's Client ID (NSDL) or 16-digit BO ID (CDSL) in its header;
 *   • an AIF's statement of account prints the demat its units are credited
 *     to — Sky Capital, Carnelian, Baring, ASK, 3P and Motilal Oswal's funds
 *     each in their own layout.
 *
 * Each layout below is DECLARED, named, and matched on the statement's own
 * archived page text (`pages.json`); a statement no layout matches names no
 * demat, and the book says so rather than guessing one. A reading is kept only
 * where its DP ID has a depository's own shape — NSDL `IN` + six digits, CDSL
 * eight digits — and agrees with the depository a layout prints beside it.
 *
 * A CDSL BO ID IS ITS DP ID FOLLOWED BY ITS CLIENT ID, eight digits each; the
 * split is the depository's definition, and the statements that print both
 * forms (`DP ID: 12010900 Client ID: 12838316` beside `Client ID:
 * 1201090012838316`) show it.
 */

const NSDL_DP = /^IN\d{6}$/;
const CDSL_DP = /^\d{8}$/;
const depositoryOfDp = (dpId) => (NSDL_DP.test(dpId) ? "NSDL" : CDSL_DP.test(dpId) ? "CDSL" : null);
/** A printed participant name, as one line of words. */
const nameOf = (s) => (s ?? "").replace(/\s+/g, " ").trim() || null;

/**
 * Declared layouts, most specific first. `read` returns the printed parts, or
 * null where the match is not one.
 */
export const DEMAT_LAYOUTS = [
  {
    // Motilal Oswal's AIF statements: a "Client Demat Details" table.
    name: "participant-table",
    re: /Depository\s+Participant\s+Name\s+Depository\s*\(NSDL\/\s*CDSL\)\s+DP\s+Number\s+Client\s+ID\s*\n\s*([^\n]+?)\s+(NSDL|CDSL)\s+(IN\d{6}|\d{8})\s+(\d{8})(?!\d)/i,
    read: (m) => ({ participant: nameOf(m[1]), depository: m[2].toUpperCase(), dpId: m[3], clientId: m[4] }),
  },
  {
    // 3P's statement: "Demat Details" — DP ID, DP Name, Client ID.
    name: "dp-name-table",
    re: /DP\s+ID\s+DP\s+Name\s+Client\s+ID\s*\n\s*(IN\d{6}|\d{8})\s+([^\n]+?)\s+(\d{8})[ \t]*(?:\n|$)/i,
    read: (m) => ({ dpId: m[1], participant: nameOf(m[2]), clientId: m[3] }),
  },
  {
    // The common header pair, on one line or two: "DP ID : IN302902 … Client
    // Id 49794950", "DP ID – 12010900 … Client ID – 12838316", HDFC's "DP ID
    // IN301549 … DP Account No : 67786137". The gap may not hold a second DP ID.
    name: "dp-client-pair",
    re: /DP\s*ID\s*[:–-]?\s*(IN\d{6}|\d{8})(?![\dA-Z])((?:(?!DP\s*ID)[\s\S]){0,160}?)(?:Client\s*ID|DP\s*Account\s*No\.?)\s*[:–-]?\s*(\d{8})(?!\d)/i,
    read: (m) => ({ dpId: m[1], clientId: m[3] }),
  },
  {
    // A CDSL statement's 16-digit BO ID, printed as "Client ID" (Motilal Oswal)
    // or "BO ID" (LKP).
    name: "bo-id",
    re: /(?:Client\s*ID|BO\s*ID)\s*:?\s*(\d{16})(?!\d)/i,
    read: (m) => ({ depository: "CDSL", dpId: m[1].slice(0, 8), clientId: m[1].slice(8) }),
  },
  {
    // NSDL's own Statement of Holdings header, "NSDL DP: HDFC BANK LIMITED
    // [IN301151]". Its Client Id is the account number the reader keyed the
    // statement on (a scan's, read by vote — providers/nsdlScan.mjs); nothing
    // else on the page is one.
    name: "nsdl-participant-header",
    re: /NSDL\s+DP:\s*([^[\n]+?)\s*\[(IN\d{6})\]/,
    read: (m, doc) => (/^\d{8}$/.test(doc.accountNo ?? "")
      ? { participant: nameOf(m[1]), depository: "NSDL", dpId: m[2], clientId: doc.accountNo }
      : null),
  },
];

/**
 * The demat one statement names, or null. `own` is true where the statement is
 * the depository's own for this account: its Client ID (NSDL) or BO ID (CDSL)
 * is the account number — or the client code — the reader keyed it on.
 */
export function dematPrintedOn(text, doc) {
  if (!text) return null;
  for (const layout of DEMAT_LAYOUTS) {
    const m = layout.re.exec(text);
    if (!m) continue;
    const r = layout.read(m, doc);
    if (!r) continue;
    const depository = depositoryOfDp(r.dpId);
    if (!depository || (r.depository && r.depository !== depository)) continue;
    const bo = `${r.dpId}${r.clientId}`;
    const own = depository === "NSDL"
      ? r.clientId === doc.accountNo
      : bo === doc.accountNo || bo === doc.clientCode;
    return { depository, dpId: r.dpId, clientId: r.clientId, participant: r.participant ?? null, layout: layout.name, own };
  }
  return null;
}

const sameDemat = (a, b) => a.depository === b.depository && a.dpId === b.dpId && a.clientId === b.clientId;
/** "ICICI Bank (NSDL demat)" → "ICICI Bank": the registry's label, without the account kind. */
const participantOfProvider = (provider) => provider.replace(/\s*\((?:NSDL |CDSL )?demat\)\s*$/i, "");

/**
 * `Account.demat` for every account whose statements the archive holds.
 *
 * `issuesByAccountId` — every archived document of each account, all issues;
 * `pageText(docKey)` — that document's archived page text, or null.
 *
 * THE NEWEST STATEMENT THAT NAMES ONE IS THE RECORD (the standing rule); an
 * older one naming another demat is written to `notes`, never blended. The
 * participant is named by the book's own depository statement for the same
 * DP ID where it has one, else as the statement printed it; `accountId` is the
 * book's account for that very demat, where the book reads its statement.
 */
export function dematAccountsFor(accounts, issuesByAccountId, pageText, notes = []) {
  const readings = new Map();
  for (const a of accounts) {
    const docs = [...(issuesByAccountId.get(a.accountId) ?? [])]
      .sort((x, y) => (y.asOf ?? "").localeCompare(x.asOf ?? "") || x.docKey.localeCompare(y.docKey));
    let read = 0;
    const found = [];
    for (const d of docs) {
      const text = pageText(d.docKey);
      if (text == null) continue;
      read++;
      const r = dematPrintedOn(text, d);
      if (r) found.push({ ...r, document: d.docKey, asOf: d.asOf ?? null });
    }
    if (read) readings.set(a.accountId, { read, found });
  }

  const ownDemats = [];
  for (const [accountId, { found }] of readings) {
    const own = found.find((r) => r.own);
    if (own) ownDemats.push({ ...own, accountId, provider: accounts.find((a) => a.accountId === accountId).provider });
  }

  for (const a of accounts) {
    const r = readings.get(a.accountId);
    if (!r) continue;
    if (!r.found.length) {
      a.demat = {
        printed: null,
        reason: r.read === 1
          ? `the statement read for ${a.provider} ${a.accountNo} prints no DP ID or Client ID`
          : `none of the ${r.read} statements read for ${a.provider} ${a.accountNo} prints a DP ID and Client ID`,
      };
      continue;
    }
    const newest = r.found[0];
    const agreeing = r.found.filter((x) => sameDemat(x, newest));
    for (const other of r.found.filter((x) => !sameDemat(x, newest))) {
      notes.push(`account ${a.accountNo} (${a.provider}): ${other.document} names ${other.depository} ${other.dpId}/${other.clientId}, `
        + `the newer ${newest.document} names ${newest.depository} ${newest.dpId}/${newest.clientId} — the newer is the record`);
    }
    const book = ownDemats.find((o) => sameDemat(o, newest));
    const sameParticipant = ownDemats.find((o) => o.depository === newest.depository && o.dpId === newest.dpId);
    a.demat = {
      printed: {
        depository: newest.depository,
        dpId: newest.dpId,
        clientId: newest.clientId,
        participant: sameParticipant ? participantOfProvider(sameParticipant.provider) : agreeing.map((x) => x.participant).find(Boolean) ?? null,
        accountId: book?.accountId ?? null,
        asOf: newest.asOf,
        documents: agreeing.map((x) => x.document),
      },
    };
  }
  return accounts;
}
