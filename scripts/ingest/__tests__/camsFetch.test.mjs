// CAMS auto-intake: the transport-agnostic core — discovery, the statement-type
// filter, SHA-256 dedup against the cursor, the dry run, and the inbox commit —
// all driven through the local transport with the GitHub side mocked. The live
// SFTP handshake is the one part no unit test can reach; it is isolated in
// `sftpTransport` and validated against the family's own endpoint (docs/CAMS-INTAKE.md).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { camsFetch, localTransport, transportFor, CURSOR_KEY } from "../cams-fetch.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
const silent = { info: () => {}, warn: () => {} };

async function fixture(files) {
  const dir = await mkdtemp(path.join(tmpdir(), "cams-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  return dir;
}

function mockInbox() {
  const calls = { blobs: [], commits: [], dispatches: [] };
  return {
    calls,
    async putBlob(bytes) { const id = sha(Buffer.from(bytes)); calls.blobs.push(id); return id; },
    async commit(c) { calls.commits.push(c); c.mutate({ version: 1, batches: [] }); /* mutate must not throw */ },
    async dispatch(p) { calls.dispatches.push(p); return true; },
  };
}

function mockStore(initial = null) {
  let rec = initial;
  return { _rec: () => rec, async get() { return rec; }, async put(_k, v) { rec = JSON.parse(v); }, async flush() {} };
}

test("queues every statement file and skips non-statements", async () => {
  const dir = await fixture({ "a.pdf": "AAA", "b.xlsx": "BBB", "notes.txt": "skip me", "sub/c.pdf": "CCC" });
  try {
    const inbox = mockInbox(), store = mockStore();
    const r = await camsFetch({ transport: await localTransport({ dir }), inbox, store, log: silent, now: () => new Date("2026-11-18T00:00:00Z") });
    assert.equal(r.added, 3, "txt is not a statement format");
    assert.deepEqual([...r.names].sort(), ["a.pdf", "b.xlsx", "c.pdf"]);
    assert.equal(inbox.calls.blobs.length, 3);
    assert.equal(inbox.calls.commits.length, 1, "one batch commit");
    assert.equal(inbox.calls.dispatches.length, 1, "intake kicked once");
    assert.equal(store._rec().seen.length, 3, "three hashes recorded in the cursor");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("never re-fetches a file whose bytes are already in the cursor", async () => {
  const dir = await fixture({ "a.pdf": "AAA", "b.xlsx": "BBB" });
  try {
    const store = mockStore({ seen: [sha("AAA"), sha("BBB")] });
    const inbox = mockInbox();
    const r = await camsFetch({ transport: await localTransport({ dir }), inbox, store, log: silent });
    assert.equal(r.added, 0, "both already seen");
    assert.equal(inbox.calls.commits.length, 0, "nothing committed");
    assert.equal(inbox.calls.dispatches.length, 0, "intake not kicked");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a reissued filename with new bytes is still fetched (name is not identity)", async () => {
  const dir = await fixture({ "statement.pdf": "NOVEMBER" });
  try {
    const store = mockStore({ seen: [sha("OCTOBER")] }); // last month's same-named file
    const inbox = mockInbox();
    const r = await camsFetch({ transport: await localTransport({ dir }), inbox, store, log: silent });
    assert.equal(r.added, 1, "different bytes under the same name are new");
    assert.deepEqual(r.names, ["statement.pdf"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("two files with the same basename both land, de-duplicated by name", async () => {
  const dir = await fixture({ "stmt.pdf": "ONE", "sub/stmt.pdf": "TWO" });
  try {
    const inbox = mockInbox();
    const r = await camsFetch({ transport: await localTransport({ dir }), inbox, store: mockStore(), log: silent });
    assert.equal(r.added, 2);
    assert.deepEqual([...r.names].sort(), ["stmt (2).pdf", "stmt.pdf"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a dry run reports what is new and writes nothing", async () => {
  const dir = await fixture({ "a.pdf": "AAA" });
  try {
    const r = await camsFetch({ transport: await localTransport({ dir }), inbox: null, store: null, dryRun: true, log: silent });
    assert.equal(r.dryRun, true);
    assert.equal(r.added, 0);
    assert.deepEqual(r.names, ["a.pdf"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the cursor grows across runs, so a second run adds only the new file", async () => {
  const dir1 = await fixture({ "a.pdf": "AAA" });
  const store = mockStore();
  try {
    await camsFetch({ transport: await localTransport({ dir: dir1 }), inbox: mockInbox(), store, log: silent });
    assert.equal(store._rec().seen.length, 1);
  } finally { await rm(dir1, { recursive: true, force: true }); }
  const dir2 = await fixture({ "a.pdf": "AAA", "b.pdf": "BBB" }); // a.pdf unchanged, b.pdf new
  try {
    const inbox = mockInbox();
    const r = await camsFetch({ transport: await localTransport({ dir: dir2 }), inbox, store, log: silent });
    assert.equal(r.added, 1, "only the new file");
    assert.deepEqual(r.names, ["b.pdf"]);
    assert.equal(store._rec().seen.length, 2);
  } finally { await rm(dir2, { recursive: true, force: true }); }
});

test("no CAMS feed configured yields no transport (the job is inert)", async () => {
  assert.equal(await transportFor({}), null);
  assert.equal(await transportFor({ CAMS_LOCAL_DIR: "" }), null);
  assert.ok(await transportFor({ CAMS_LOCAL_DIR: "/tmp" }), "a local dir configures the local transport");
  assert.equal(CURSOR_KEY, "cams:cursor");
});

console.log("cams-fetch: 7 passed, 0 failed");
