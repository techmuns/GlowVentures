// THE STATEMENT UPLOAD — the Function, the inbox and the client, end to end.
//   npm run test:family
//
// *"After uploading the file/folder it will automatically be saved in github …"*
//
// The Function (`functions/api/statement-uploads.js`) stores each uploaded
// statement as a git blob and files an upload as ONE commit on the repository's
// `statement-inbox` branch (`shared/statementInbox.mjs`), then starts the intake
// run. It is driven here against a FAKE GitHub — the git data API it calls,
// with GitHub's own rule that a ref update which is not a fast-forward is
// refused (422) — so every branch that decides whether a statement is kept or
// lost runs:
//
//   · bytes survive the trip, past the chunk size of the base64 encoder;
//   · the first upload makes the branch: one commit, no parent, [skip ci];
//   · two uploads at once both land — the second re-reads and lays its own on;
//   · a path a folder upload carries cannot climb out of its batch;
//   · a file being read cannot be removed; a held one can be retried;
//   · and the client names each failure's cause, and what each status means.
import { onRequest } from "../../../functions/api/statement-uploads.js";
import {
  githubInbox, cleanUploadPath, checkUpload, isJunkPath, newBatchId, isBatchId, withBatch, makeBatch,
  applyUpdates, requeue, withoutFile, uniqueNames, serializeLog, parseLog, emptyLog, inboxPath,
  INBOX_DEFAULTS, MAX_FILE_BYTES, MAX_SETTLED_BATCHES, type InboxLog,
} from "../../../shared/statementInbox.mjs";
import { readAnswer, planUpload, fileView, inFlight, uploadDocumentKeys, REASONS, type PickedFile } from "@/lib/statementUploads";

let fails = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) { fails++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
  else console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
};

const REPO = INBOX_DEFAULTS.repo, BRANCH = INBOX_DEFAULTS.branch;
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** A fake of the slice of GitHub's REST API the inbox calls. */
function fakeGitHub() {
  let n = 0;
  const id = () => (++n).toString(16).padStart(40, "0");
  const blobs = new Map<string, Uint8Array>();
  const trees = new Map<string, Map<string, string>>();
  const commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  let head: string | null = null;
  let dispatches = 0;
  /** Set to a function to let "somebody else" commit just before the next ref update. */
  let interloper: (() => void) | null = null;
  const reply = (status: number, body: unknown) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const addBlob = (bytes: Uint8Array) => { const s = id(); blobs.set(s, bytes); return s; };
  const commitTree = (files: Map<string, string>, message: string) => {
    const t = id(); trees.set(t, files);
    const c = id(); commits.set(c, { tree: t, parents: head ? [head] : [], message });
    head = c;
  };

  const fetchImpl = async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    const p = decodeURIComponent(u.pathname.replace(`/repos/${REPO}`, ""));
    if (!String((init?.headers as Record<string, string>)?.authorization ?? "").startsWith("Bearer ")) return reply(401, {});
    const raw = init?.body instanceof Blob ? await init.body.text() : (init?.body as string | undefined);
    const body = raw ? JSON.parse(raw) : null;

    if (method === "GET" && p === `/git/ref/heads/${BRANCH}`) return head ? reply(200, { object: { sha: head } }) : reply(404, {});
    if (method === "GET" && p.startsWith("/git/commits/")) {
      const c = commits.get(p.slice("/git/commits/".length));
      return c ? reply(200, { sha: p.split("/").pop(), tree: { sha: c.tree } }) : reply(404, {});
    }
    if (method === "GET" && p === `/contents/${INBOX_DEFAULTS.log}`) {
      const c = commits.get(u.searchParams.get("ref") ?? "");
      const blob = c ? trees.get(c.tree)?.get(INBOX_DEFAULTS.log) : undefined;
      return blob ? reply(200, { sha: blob, content: b64(blobs.get(blob)!) }) : reply(404, {});
    }
    if (method === "POST" && p === "/git/blobs") {
      if (body.encoding !== "base64") return reply(422, {});
      return reply(201, { sha: addBlob(new Uint8Array(Buffer.from(body.content, "base64"))) });
    }
    if (method === "POST" && p === "/git/trees") {
      const files = new Map(body.base_tree ? trees.get(body.base_tree) : []);
      for (const e of body.tree) {
        if (e.content !== undefined) files.set(e.path, addBlob(new TextEncoder().encode(e.content)));
        else if (e.sha === null) { if (!files.delete(e.path)) return reply(422, { message: "path not in tree" }); }
        else if (blobs.has(e.sha)) files.set(e.path, e.sha);
        else return reply(422, { message: "no such blob" });
      }
      const t = id(); trees.set(t, files);
      return reply(201, { sha: t });
    }
    if (method === "POST" && p === "/git/commits") {
      const c = id(); commits.set(c, { tree: body.tree, parents: body.parents, message: body.message });
      return reply(201, { sha: c });
    }
    if (method === "PATCH" && p === `/git/refs/heads/${BRANCH}`) {
      if (interloper) { const f = interloper; interloper = null; f(); }
      const c = commits.get(body.sha);
      if (!c || (!body.force && c.parents[0] !== head)) return reply(422, { message: "Update is not a fast forward" });
      head = body.sha;
      return reply(200, {});
    }
    if (method === "POST" && p === "/git/refs") {
      if (head) return reply(422, { message: "Reference already exists" });
      head = body.sha;
      return reply(201, {});
    }
    if (method === "POST" && p === "/dispatches") {
      if (body.event_type !== INBOX_DEFAULTS.event) return reply(422, {});
      dispatches++;
      return reply(204, null);
    }
    return reply(404, {});
  };

  const files = () => (head ? trees.get(commits.get(head)!.tree)! : new Map<string, string>());
  return {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    files,
    bytesAt: (path: string) => { const s = files().get(path); return s ? blobs.get(s)! : null; },
    log: (): InboxLog => { const s = files().get(INBOX_DEFAULTS.log); return s ? parseLog(new TextDecoder().decode(blobs.get(s)!)) : emptyLog(); },
    head: () => (head ? { sha: head, ...commits.get(head)! } : null),
    dispatches: () => dispatches,
    /** Somebody else's upload, committed just before ours updates the ref. */
    interlope: (batchId: string) => {
      interloper = () => {
        const next = new Map(files());
        const blob = addBlob(new TextEncoder().encode("theirs"));
        next.set(inboxPath(batchId, "theirs.pdf"), blob);
        const log = withBatch(parseLog(new TextDecoder().decode(blobs.get(files().get(INBOX_DEFAULTS.log)!)!)), makeBatch(batchId, [{ name: "theirs.pdf", size: 6, blob }]));
        next.set(INBOX_DEFAULTS.log, addBlob(new TextEncoder().encode(serializeLog(log))));
        commitTree(next, "their upload [skip ci]");
      };
    },
  };
}

const SITE = "https://glow.example";
const ENV = { GLOW_GITHUB_TOKEN: "t" };
const call = (gh: ReturnType<typeof fakeGitHub>, init: RequestInit = {}, env: Record<string, unknown> = ENV) =>
  onRequest({ env, request: new Request(`${SITE}/api/statement-uploads`, { ...init, headers: { origin: SITE, ...(init.headers ?? {}) } }) }, gh.fetchImpl);
const jsonBody = async (r: Response) => (await r.json()) as Record<string, any>;
const postJson = (gh: ReturnType<typeof fakeGitHub>, body: unknown) =>
  call(gh, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const postFile = (gh: ReturnType<typeof fakeGitHub>, name: string, bytes: Uint8Array) => {
  const form = new FormData();
  form.append("name", name);
  form.append("file", new File([bytes as BlobPart], name.split("/").pop()!));
  return call(gh, { method: "POST", body: form });
};

async function run() {
  // ── 1. WHAT MAY BE UPLOADED, AND UNDER WHAT PATH ──────────────────────────
  console.log("── paths and types ──");
  ok("a folder upload keeps its folders", cleanUploadPath("Ajay/Sep 2026/Buoyant.pdf") === "Ajay/Sep 2026/Buoyant.pdf");
  ok("a path cannot climb out of its batch", cleanUploadPath("../../etc/x.pdf") === "etc/x.pdf" && cleanUploadPath("/abs/x.pdf") === "abs/x.pdf",
    String(cleanUploadPath("../../etc/x.pdf")));
  ok("Windows separators and characters a file system refuses are cleaned", cleanUploadPath("a\\b\\c:d?.pdf") === "a/b/c_d_.pdf",
    String(cleanUploadPath("a\\b\\c:d?.pdf")));
  ok("a hidden name cannot become a dot-file", !String(cleanUploadPath(".git/config.pdf")).split("/").some((s) => s.startsWith(".")),
    String(cleanUploadPath(".git/config.pdf")));
  ok("macOS and Windows furniture is junk", isJunkPath("x/.DS_Store") && isJunkPath("__MACOSX/a.pdf") && isJunkPath("Thumbs.db") && !isJunkPath("a/b.pdf"));
  ok("only what the pipeline reads is accepted", !!checkUpload({ name: "a.docx", size: 10 }).error && !!checkUpload({ name: "a.csv", size: 10 }).error
    && checkUpload({ name: "A.PDF", size: 10 }).name === "A.PDF" && checkUpload({ name: "b.xls", size: 1 }).name === "b.xls" && checkUpload({ name: "c.zip", size: 1 }).name === "c.zip");
  ok("an empty or an oversized file is refused", !!checkUpload({ name: "a.pdf", size: 0 }).error && !!checkUpload({ name: "a.pdf", size: MAX_FILE_BYTES + 1 }).error);
  const bid = newBatchId(new Date("2026-10-21T10:15:03.456Z"), () => "AB12cd34-ffff");
  ok("a batch id is sortable and safe as a folder name", bid === "20261021T101503Z-ab12cd34" && isBatchId(bid) && !isBatchId("../x"), bid);
  ok("two files of one batch never share a path", uniqueNames([{ name: "a.pdf" }, { name: "A.pdf" }, { name: "a.pdf" }]).map((f) => f.name).join("|") === "a.pdf|A (2).pdf|a (3).pdf",
    uniqueNames([{ name: "a.pdf" }, { name: "A.pdf" }, { name: "a.pdf" }]).map((f) => f.name).join("|"));

  // ── 2. NO TOKEN: SAID, NEVER AN EMPTY INBOX ───────────────────────────────
  console.log("── no token ──");
  const none = fakeGitHub();
  const nc = await call(none, {}, {});
  ok("a site with no token answers NOT_CONFIGURED", nc.status === 503 && (await jsonBody(nc)).code === "NOT_CONFIGURED");
  const ncA = await readAnswer(await call(none, {}, {}));
  ok("…which the client names as not-configured", !ncA.ok && ncA.cause === "not-configured" && ncA.reason === REASONS.notConfigured);

  // ── 3. ONE FILE: ITS BYTES SURVIVE THE TRIP ────────────────────────────────
  console.log("── upload ──");
  const gh = fakeGitHub();
  const empty = await jsonBody(await call(gh));
  ok("an inbox nobody has uploaded to lists nothing", empty.ok === true && Array.isArray(empty.batches) && empty.batches.length === 0);
  // Past 3 × 32 KiB, so the base64 encoder's chunk seams are crossed — behind a
  // real PDF header, because the upload checks a file's bytes against its type.
  const big = new Uint8Array(200_003).map((_, i) => (i * 7919 + 13) % 256);
  big.set(new TextEncoder().encode("%PDF-1.4\n"), 0);
  const s1 = await jsonBody(await postFile(gh, "Ajay/September/Buoyant 103473.pdf", big));
  ok("a file is stored as a blob", s1.ok === true && /^[0-9a-f]{40}$/.test(s1.staged?.blob) && s1.staged?.name === "Ajay/September/Buoyant 103473.pdf");
  const s2 = await jsonBody(await postFile(gh, "Ajay/September/SVAN.zip", new Uint8Array([80, 75, 5, 6, 0, 0])));
  const bad = await postFile(gh, "notes.docx", new Uint8Array([1, 2, 3]));
  ok("a file the pipeline cannot read is refused with the reason", bad.status === 400 && /PDF, Excel/.test((await jsonBody(bad)).message));
  // LKP's October workbooks, as the mail server left them.
  const notice = await postFile(gh, "LKP/519_06102026124925.xls", new TextEncoder().encode("This attachment was removed because it contains data that could pose a security risk."));
  const noticeBody = await jsonBody(notice);
  ok("a mail server's removal notice is refused at the door, saying the statement never arrived",
    notice.status === 400 && noticeBody.code === "NOT_A_STATEMENT" && /never arrived/i.test(noticeBody.message));
  const htmlPdf = await postFile(gh, "statement.pdf", new TextEncoder().encode("<!DOCTYPE html><html><body>Sign in</body></html>"));
  ok("a web page saved as .pdf is refused for what it is", htmlPdf.status === 400 && /web page/i.test((await jsonBody(htmlPdf)).message));
  const cross = await onRequest({ env: ENV, request: new Request(`${SITE}/api/statement-uploads`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }) }, gh.fetchImpl);
  ok("a cross-site write is refused", cross.status === 403);

  // ── 4. COMMIT: ONE COMMIT, THE BRANCH MADE, THE RUN STARTED ────────────────
  const c1 = await jsonBody(await postJson(gh, { op: "commit", files: [s1.staged, s2.staged] }));
  const h1 = gh.head();
  ok("the upload is filed as one batch", c1.ok === true && isBatchId(c1.batch) && c1.batches.length === 1 && c1.batches[0].files.length === 2);
  ok("the first upload makes the branch: one commit, no parent, [skip ci]", !!h1 && h1.parents.length === 0 && /\[skip ci\]/.test(h1.message));
  const at = inboxPath(c1.batch, "Ajay/September/Buoyant 103473.pdf");
  const back = gh.bytesAt(at);
  ok("the bytes on the branch are the bytes uploaded", !!back && back.length === big.length && back.every((x, i) => x === big[i]), at);
  ok("every file is queued", gh.log().batches[0].files.every((f) => f.status === "queued" && f.blob));
  ok("the intake run is started", c1.started === true && gh.dispatches() === 1);
  const forged = await postJson(gh, { op: "commit", files: [{ name: "x.pdf", size: 3, blob: "not-a-sha" }] });
  ok("a file that was not stored first cannot be filed", forged.status === 400);

  // ── 5. TWO UPLOADS AT ONCE BOTH LAND ──────────────────────────────────────
  const s3 = await jsonBody(await postFile(gh, "HDFC.pdf", new TextEncoder().encode("%PDF-1.4\n")));
  gh.interlope("20261021T090000Z-theirs1");
  const c2 = await jsonBody(await postJson(gh, { op: "commit", files: [s3.staged] }));
  const ids = gh.log().batches.map((b) => b.id);
  ok("an upload racing another is laid over it, and neither is lost",
    c2.ok === true && ids.length === 3 && ids.includes("20261021T090000Z-theirs1") && ids.includes(c2.batch) && ids.includes(c1.batch), ids.join(","));
  ok("…and the other upload's file is still on the branch", gh.files().has(inboxPath("20261021T090000Z-theirs1", "theirs.pdf")));

  // ── 6. REMOVE AND RETRY ───────────────────────────────────────────────────
  console.log("── remove and retry ──");
  const rm = await jsonBody(await postJson(gh, { op: "remove", batch: c2.batch, name: "HDFC.pdf" }));
  ok("a queued file can be removed — from the log and the branch",
    rm.ok === true && !gh.log().batches.some((b) => b.id === c2.batch) && !gh.files().has(inboxPath(c2.batch, "HDFC.pdf")));
  // The intake run claims one file and holds the other.
  const inbox = githubInbox({ token: "t", repo: REPO, branch: BRANCH }, gh.fetchImpl);
  await inbox.commit({ message: "Intake", mutate: (log) => applyUpdates(log, [
    { batch: c1.batch, name: "Ajay/September/Buoyant 103473.pdf", status: "processing" },
    { batch: c1.batch, name: "Ajay/September/SVAN.zip", status: "held", hold: "needs-reader", reason: "no reader" },
  ]) });
  const busy = await postJson(gh, { op: "remove", batch: c1.batch, name: "Ajay/September/Buoyant 103473.pdf" });
  ok("a file being read cannot be removed", busy.status === 409 && /being read/.test((await jsonBody(busy)).message));
  const before = gh.dispatches();
  const rt = await jsonBody(await postJson(gh, { op: "retry", batch: c1.batch }));
  const svan = gh.log().batches.find((b) => b.id === c1.batch)!.files.find((f) => f.name.endsWith("SVAN.zip"))!;
  ok("Retry puts a held file back in the queue and starts the run", rt.ok === true && svan.status === "queued" && svan.hold === null && svan.reason === null && gh.dispatches() === before + 1);
  const again = await postJson(gh, { op: "retry", batch: c1.batch });
  ok("Retry with nothing held says so", again.status === 409);

  // ── 7. THE LOG ────────────────────────────────────────────────────────────
  console.log("── the log ──");
  let log = emptyLog();
  for (let i = 0; i < MAX_SETTLED_BATCHES + 5; i++) {
    const id = `202610${String(1 + Math.floor(i / 24)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}0000Z-s${i}`;
    log = withBatch(log, { ...makeBatch(id, [{ name: "a.pdf", size: 1, blob: "0".repeat(40) }]), files: [{ ...makeBatch(id, [{ name: "a.pdf", size: 1, blob: "0".repeat(40) }]).files[0], status: "landed" }] });
  }
  log = withBatch(log, makeBatch("20250101T000000Z-open", [{ name: "old.pdf", size: 1, blob: "0".repeat(40) }]));
  ok("settled batches are capped; an open one is never dropped, however old",
    log.batches.length === MAX_SETTLED_BATCHES + 1 && log.batches.some((b) => b.id === "20250101T000000Z-open"), String(log.batches.length));
  ok("an update for a file somebody removed is dropped, not resurrected",
    applyUpdates(log, [{ batch: "nope", name: "x.pdf", status: "landed" }]).batches.every((b) => b.files.every((f) => f.name !== "x.pdf")));
  ok("only queued or held files can be removed", !!withoutFile(applyUpdates(log, [{ batch: "20250101T000000Z-open", name: "old.pdf", status: "landed" }]), "20250101T000000Z-open", "old.pdf").error);
  ok("requeue touches held files only", requeue(log, "20250101T000000Z-open").count === 0);

  // ── 8. THE CLIENT ─────────────────────────────────────────────────────────
  console.log("── the client ──");
  const signedOut = await readAnswer(new Response('<!doctype html><a href="/__auth/login">', { headers: { "content-type": "text/html" } }));
  ok("the login page reads as signed-out, never an empty inbox", !signedOut.ok && signedOut.cause === "signed-out");
  const noFn = await readAnswer(new Response("<!doctype html><div id=root></div>", { headers: { "content-type": "text/html" } }));
  ok("the app shell (a local preview) reads as no-function", !noFn.ok && noFn.cause === "no-function");
  const pick = (path: string, size = 10): PickedFile => ({ file: new File([new Uint8Array(size)], path.split("/").pop()!), path });
  const plan = planUpload([pick("Sep/.DS_Store"), pick("Sep/a.pdf"), pick("Sep/notes.docx"), pick("Sep/b.xlsx"), pick("Sep/empty.pdf", 0)]);
  ok("a folder's system files are ignored, its other non-statements named, its statements sent",
    plan.ignored === 1 && plan.accepted.map((a) => a.name).join("|") === "Sep/a.pdf|Sep/b.xlsx"
    && plan.skipped.map((s) => s.path).join("|") === "Sep/notes.docx|Sep/empty.pdf");
  const landed = { ...makeBatch("20261021T000000Z-x", [{ name: "a.pdf", size: 1, blob: "0".repeat(40) }]).files[0], status: "landed" as const, docKeys: ["k1", "k2"], commit: "abcdef1234" };
  ok("a landed file is in the library only once the site serves its documents",
    fileView(landed, new Set(["k1", "k2"])).key === "in-library" && fileView(landed, new Set(["k1"])).key === "publishing");
  const sealed = { ...landed, status: "held" as const, hold: "needs-password" as const, reason: "Sealed" };
  ok("a held file says what it needs", fileView(sealed, new Set()).label === "Needs password" && fileView(sealed, new Set()).title.includes("unlocked copy"));
  const queued = { ...landed, status: "queued" as const };
  const reading = { ...landed, status: "processing" as const };
  const duplicate = { ...landed, status: "duplicate" as const, docKeys: null, reason: "Already in the library — byte-identical to source/october/original.pdf." };
  ok("a waiting job never claims analysis has started", fileView(queued, new Set()).label === "Preparing analysis" && !fileView(queued, new Set()).title.includes("being analysed now"));
  ok("analysis is named only after the worker starts", fileView(reading, new Set()).label === "Analysing" && fileView(reading, new Set()).title.includes("being analysed now"));
  ok("an exact duplicate is a completed green outcome", fileView(duplicate, new Set()).tone === "gain" && !fileView(duplicate, new Set()).title.includes("source/"));
  const manifest = [{ docKey: "exact", sourcePath: "source/october/original.pdf" }, { docKey: "same-name-elsewhere", sourcePath: "source/august/original.pdf" }];
  ok("duplicate receipts decorate only the exact original document", uploadDocumentKeys(duplicate, manifest).join() === "exact");
  ok("an unrecognised duplicate receipt never guesses from its filename", uploadDocumentKeys({ ...duplicate, reason: "original.pdf" }, manifest).length === 0);
  ok("customer status copy contains no infrastructure details", [queued, reading, landed, duplicate, sealed].every(f => !/GitHub|commit|source\/|redeploy|intake run/.test(fileView(f, new Set()).title)));
  ok("the page keeps polling while anything is queued or being read",
    inFlight([makeBatch("20261021T000000Z-y", [{ name: "a.pdf", size: 1, blob: "0".repeat(40) }])]) && !inFlight([{ id: "x", uploadedAt: "", files: [landed] }]));

  console.log(fails ? `\n${fails} FAILED` : `\nall passed`);
  process.exit(fails ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
