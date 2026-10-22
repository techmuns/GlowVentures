// Resume publication without re-extracting an upload or clearing its inbox bytes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './publication.mjs';
import { publicationGate } from '../finalize-delivery.mjs';
import { verifyAutomaticPublication } from './automaticPublication.mjs';

export function completedBotReview(pr) {
  for (const comment of [...(pr.comments ?? [])].reverse()) {
    if (!/^chatgpt-codex-connector(?:\[bot\])?$/.test(comment.author?.login ?? '')) continue;
    const marker = /codex-review-state:v1 (\{[^\n]+\}) -->/.exec(comment.body ?? '');
    if (!marker) continue;
    let review; try { review = JSON.parse(marker[1]).code_review; } catch { continue; }
    if (review?.commit_sha !== pr.headRefOid) continue;
    if (review.has_unresolved_findings === false && typeof review.has_any_findings === 'boolean' && /^(completed|success|succeeded)$/.test(review.status)) {
      return { commit: pr.headRefOid, kind: 'automated', feedbackAddressed: true };
    }
    return null; // never fall back to an older clean summary over new findings
  }
  return null;
}
export function unresolvedBotFindings(pr) {
  for (const comment of [...(pr.comments ?? [])].reverse()) {
    if (!/^chatgpt-codex-connector(?:\[bot\])?$/.test(comment.author?.login ?? '')) continue;
    const marker = /codex-review-state:v1 (\{[^\n]+\}) -->/.exec(comment.body ?? '');
    let review; try { review = JSON.parse(marker?.[1]).code_review; } catch { continue; }
    // A failed/quota-limited review can set both finding flags true without
    // producing a finding. Only a completed assessment attests to findings;
    // actual inline threads and changes-requested reviews are checked separately.
    if (review?.commit_sha === pr.headRefOid && /^(completed|success|succeeded)$/.test(review.status)) return review.has_unresolved_findings === true;
  }
  return false;
}
/**
 * A ZIP that lands with files a mail server removed says which, at every stage
 * of its publication — the PR, the wait for the deployment, and landed — so
 * somebody asks the sender for them (Stage 10gk). `neverArrived` rides on the
 * inbox file; each stage's own reason comes first.
 */
export const neverArrivedNote = names => names?.length
  ? `${names.length} file(s) inside never arrived — a mail server removed them and left a notice: ${names.join(', ')}. Ask the sender to re-send ${names.length === 1 ? 'it' : 'them'}.`
  : null;
export const withNotice = (reason, file) => [reason, neverArrivedNote(file?.neverArrived)].filter(Boolean).join(' ') || null;
export function deploymentContains(manifest, versions) {
  return Array.isArray(versions) && versions.length > 0 && versions.every(v => manifest.statementDocuments?.some(d => d.document === v.document && d.revision === v.revision));
}
export async function readDeployedPublication({ credential, baseURL = 'https://glowventures-1xw.pages.dev', fetchImpl = fetch }) {
  if (!credential) return null;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const middleware = fs.readFileSync(path.join(root, 'functions/_middleware.js'), 'utf8');
  const pepper = JSON.parse(/const PEPPER = ("[^"\n]+");/.exec(middleware)[1]);
  const session = digest(`session::v1\n${digest(`${pepper}\n${credential}`)}`);
  const get = async relative => {
    const response = await fetchImpl(new URL(relative, baseURL).href, { method: 'GET', redirect: 'error',
      headers: { Cookie: `glow_auth=${session}`, 'Cache-Control': 'no-cache' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
    return response.json();
  };
  const pointer = await get('/publication.json');
  if (!pointer || !/^\/views\/[a-f0-9]{20}\/publication\.json$/.test(pointer.manifest)) return null;
  return get(pointer.manifest);
}
export async function monitorPublication(file, { gh, currentBase, credential, baseURL, fetchImpl, verifyData = verifyAutomaticPublication } = {}) {
  const metadata = Object.fromEntries(['pullRequest', 'branch', 'ciDispatched', 'commit', 'baseCommit', 'archiveRevision', 'documentVersions', 'landedAs', 'providers', 'docKeys', 'neverArrived'].map(k => [k, file[k] ?? null]));
  if (!metadata.pullRequest) {
    if (!/^codex\/statement-delivery-[a-f0-9]{16}$/.test(file.branch)) throw new Error('Invalid saved publication branch.');
    const previous = JSON.parse(gh(['pr', 'list', '--head', file.branch, '--state', 'all', '--json', 'url']));
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const body = path.join(root, '.cache', `publication-${digest(file.branch)}.md`);
    fs.mkdirSync(path.dirname(body), { recursive: true });
    fs.writeFileSync(body, `Resume a verified statement publication. Source/identity, generated-file, CI and repository protection gates apply; clean data publishes automatically.\n\nArchive revision: ${file.archiveRevision}\n`);
    metadata.pullRequest = previous[0]?.url ?? gh(['pr', 'create', '--base', 'main', '--head', file.branch, '--title', 'Publish verified statement delivery', '--body-file', body]);
  }
  const pending = detail => ({ ...metadata, status: 'processing', hold: null,
    reason: withNotice('Your statement is verified and waiting to appear on the dashboard.', metadata), publicationDetail: detail });
  const held = detail => ({ ...metadata, status: 'held', hold: 'check-failed',
    reason: 'This statement needs an administrator’s review before it can update the dashboard.', publicationDetail: detail });
  const url = metadata.pullRequest;
  const pr = JSON.parse(gh(['pr', 'view', metadata.pullRequest, '--json', 'number,state,headRefOid,mergeCommit,reviewDecision,statusCheckRollup,reviews,comments']));
  if (pr.state === 'MERGED') {
    const manifest = await readDeployedPublication({ credential, baseURL, fetchImpl });
    if (!manifest || !deploymentContains(manifest, file.documentVersions)) return pending('Merged; waiting for the live publication to contain the verified document versions.');
    return { ...metadata, status: 'landed', hold: null, reason: withNotice(null, metadata), commit: pr.mergeCommit?.oid ?? file.commit };
  }
  if (pr.state !== 'OPEN') return held(`The publication PR is closed without merging: ${url}`);
  if (pr.headRefOid !== file.commit) return held(`The publication branch changed after validation; inspect ${url}.`);
  if (currentBase !== file.baseCommit) {
    gh(['pr', 'close', metadata.pullRequest]);
    return { status: 'queued', hold: null, reason: 'The dashboard changed while processing this statement. It is being checked again.', pullRequest: null, branch: null, ciDispatched: null,
      commit: null, baseCommit: null, archiveRevision: null, documentVersions: null, landedAs: null, providers: null, docKeys: null };
  }
  if (file.branch && !metadata.ciDispatched) {
    try { gh(['workflow', 'run', 'ci.yml', '--ref', file.branch, '-f', `baseline=${file.baseCommit}`]); metadata.ciDispatched = true; }
    catch { return pending(`CI dispatch will retry; verified source bytes remain in the inbox. ${metadata.pullRequest}`); }
    return pending(`CI requested for the saved publication commit: ${url}`);
  }
  if (!pr.statusCheckRollup?.length || pr.statusCheckRollup.some(c => (c.status && c.status !== 'COMPLETED') || c.state === 'PENDING')) return pending(`Publication checks are running: ${url}`);
  if (pr.statusCheckRollup.some(c => !['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(c.conclusion ?? c.state))) return held(`Required publication checks failed; inspect ${url}.`);
  if (unresolvedBotFindings(pr)) return held(`Unresolved review findings require attention: ${url}`);
  try { publicationGate(pr, { commit: file.commit }); }
  catch (error) { return held(`${error.message} ${url}`); }
  const { nameWithOwner } = JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner']));
  const [owner, name] = nameWithOwner.split('/');
  const threads = JSON.parse(gh(['api', 'graphql', '-f', 'query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved} pageInfo{hasNextPage}}}}}',
    '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${pr.number}`])).data.repository.pullRequest.reviewThreads;
  pr.unresolvedThreads = threads.pageInfo.hasNextPage || threads.nodes.some(t => !t.isResolved);
  try {
    publicationGate(pr, { commit: file.commit });
    verifyData(file);
  }
  catch (error) { return held(`${error.message} ${url}`); }
  gh(['pr', 'merge', url, '--squash', '--match-head-commit', file.commit]);
  return pending('Verified PR merged; waiting for the existing deployment and live data-version check.');
}
