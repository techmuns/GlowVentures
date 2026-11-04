// DEPOSITORY PARTICIPANT IDS → THE PROVIDER THIS BOOK FILES THAT DEPOSITORY UNDER.
//
// A broker's export names the demat account a trade settles into as
// `<DP ID>-<client id>` and nothing else: no bank, no holder. The DP ID is the
// depository's own identifier for the participant, printed on that
// participant's holding statement beside its name, so it is the one fact on
// such a file that says which account in this book the rows belong to.
//
// Only an ID a statement in `source/` prints on its own letterhead is listed —
// an ID nobody's letterhead carries names no provider, and a row settling into
// it is refused rather than filed under a guess.
export const DEPOSITORY_PARTICIPANTS = Object.freeze({
  // `ICICI BANK LIMITED DP ID : IN302902` — the letterhead of every ICICI Bank
  // Statement of Holding in this book (`providers/nsdlDemat.mjs`).
  IN302902: "ICICI Bank (NSDL demat)",
});

/** `IN302902-49794950` → `{ dpId, clientId, provider }`, or null. */
export function dematAccountOf(raw) {
  const m = /^\s*(IN\d{6})\s*-\s*(\d{6,})\s*$/i.exec(String(raw ?? ""));
  if (!m) return null;
  const dpId = m[1].toUpperCase();
  return { dpId, clientId: m[2], provider: DEPOSITORY_PARTICIPANTS[dpId] ?? null };
}
