#!/usr/bin/env node
// Bug-reintroduction pass for the client-ID join on the Motilal Oswal demat
// statements (Stage 10db).  node scripts/dev/motilal-owner-bug.mjs
//
// Each case puts ONE defect back into `scripts/ingest/providers/motilalDemat.mjs`,
// runs `motilalOwner.test.mjs`, and restores the file from memory — verified byte
// for byte before the next case runs. A patch whose anchor is not found exactly
// once is NOT A RESULT, never a clean run: a case that changes nothing proves
// nothing. A no-patch control runs first and must pass.
//
// Edits use split/join, never String.replace: a `$$` or `$&` in a replacement is
// a pattern there, and this repo has lost a probe to that twice.
//
// `CASES=3,7` re-runs chosen cases; the control always runs.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FILE = path.join(ROOT, "scripts/ingest/providers/motilalDemat.mjs");
const SUITE = path.join(ROOT, "scripts/ingest/__tests__/motilalOwner.test.mjs");
const ORIGINAL = fs.readFileSync(FILE);

const CASES = [
  {
    name: "an entry naming no canonical owner is applied anyway",
    from: 'if (!owner || matchedBy !== "alias") return refuse(`"${entry.owner}" is not a canonical owner in shared/owners.mjs`);',
    to: "if (!owner) return { owner: entry.owner, ownerId: null, named: entry.owner, via: entry.via, refused: null };",
  },
  {
    name: "the owner need not be a trust",
    from: 'if (owner.kind !== "trust") return refuse(',
    to: "if (false) return refuse(",
  },
  {
    name: "an unread account type is not a refusal",
    from: "if (!acType) return refuse(",
    to: "if (false) return refuse(",
  },
  {
    name: "a person's account type is accepted",
    from: "if (/^individual/i.test(acType)) return refuse(",
    to: "if (/^nobody/i.test(acType)) return refuse(",
  },
  {
    name: "a page with no masked PAN is accepted",
    from: "if (!maskedPan) return refuse(",
    to: "if (false) return refuse(",
  },
  {
    name: "a mask that fits another taxpayer is accepted",
    from: "if (others.length) return refuse(",
    to: "if (false) return refuse(",
  },
  {
    name: "a mask that does not fit the trust's own PAN is accepted",
    from: "if (own.length && !own.some(Boolean)) return refuse(",
    to: "if (false) return refuse(",
  },
  {
    name: "the reader ignores the join",
    from: "if (joined?.owner) {",
    to: "if (false && joined?.owner) {",
  },
  {
    name: "a near-miss client ID borrows the entry",
    from: "const entry = clientId ? joins[clientId] ?? null : null;",
    to: "const entry = clientId ? Object.entries(joins).find(([k]) => clientId.startsWith(k.slice(0, -1)))?.[1] ?? null : null;",
  },
  {
    name: "a refused join drops the exclusion instead of reading the page as printed",
    from: "if (joined?.refused) {",
    to: "if (joined?.refused) { return { ...printed, owner: null, ownerId: null, excludedFromBook: null, warnings };",
  },
  {
    name: "the replay's list of identity warnings forgets the join's code",
    from: '"client-id-not-read", "owner-from-register", "beneficial-owner-refused",',
    to: '"client-id-not-read", "beneficial-owner-refused",',
  },
  {
    name: "the join's warning stops citing its evidence",
    from: 'the page prints as its first holder: ${joined.via}`);',
    to: 'the page prints as its first holder`);',
  },
  {
    name: "extract() takes the printed holder rather than the joined owner",
    from: "    owner: id.owner,",
    to: "    owner: id.holderName,",
  },
  {
    name: "an entry cites a contact detail",
    from: 'The holder lines print the trust\'s trustees.",',
    to: 'The holder lines print the trust\'s trustees. Contact on the page matches.",',
  },
];

function runSuite() {
  const r = spawnSync(process.execPath, [SUITE], { encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const fails = out.split("\n").filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim());
  const crashed = r.status !== 0 && fails.length === 0;
  return { status: r.status, fails, crashed, tail: out.trim().split("\n").slice(-2).join(" | ") };
}

function restore() {
  fs.writeFileSync(FILE, ORIGINAL);
  if (!fs.readFileSync(FILE).equals(ORIGINAL)) {
    console.error("RESTORE FAILED — the reader is not back to its committed bytes. Stop.");
    process.exit(3);
  }
}

process.on("exit", () => { if (!fs.readFileSync(FILE).equals(ORIGINAL)) fs.writeFileSync(FILE, ORIGINAL); });
process.on("SIGINT", () => { restore(); process.exit(130); });

const only = process.env.CASES ? new Set(process.env.CASES.split(",").map((s) => Number(s.trim()))) : null;

console.log("control (no patch)");
const control = runSuite();
if (control.status !== 0) {
  console.log(`  CONTROL FAILED — ${control.tail}`);
  for (const f of control.fails) console.log(`    ${f}`);
  process.exit(1);
}
console.log(`  clean — ${control.tail}`);

let fired = 0, clean = 0, notResult = 0;
CASES.forEach((c, i) => {
  const n = i + 1;
  if (only && !only.has(n)) return;
  const text = ORIGINAL.toString("utf8");
  const hits = text.split(c.from).length - 1;
  console.log(`\n${String(n).padStart(2)}. ${c.name}`);
  if (hits !== 1) {
    notResult++;
    console.log(`    NOT A RESULT — the anchor is found ${hits} times, not once`);
    return;
  }
  fs.writeFileSync(FILE, text.split(c.from).join(c.to));
  try {
    const r = runSuite();
    if (r.crashed) {
      notResult++;
      console.log(`    NOT A RESULT — the suite crashed rather than failing a check: ${r.tail}`);
    } else if (r.fails.length) {
      fired++;
      console.log(`    fires ${r.fails.length} check(s):`);
      for (const f of r.fails.slice(0, 6)) console.log(`      ${f}`);
      if (r.fails.length > 6) console.log(`      … and ${r.fails.length - 6} more`);
    } else {
      clean++;
      console.log("    CLEAN — no check fired");
    }
  } finally {
    restore();
  }
});

console.log(`\n${fired} fired · ${clean} clean · ${notResult} not a result`);
process.exit(clean || notResult ? 1 : 0);
