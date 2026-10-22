#!/usr/bin/env node
// The upload coordinator calls this after collecting CI and reviewer feedback.
// There is deliberately no merge-on-PR-creation shortcut.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { argsOf, git, ROOT } from './verify-publication.mjs';
import { atomicJson } from './prepare-delivery.mjs';

export function finalizationGate(pr, review, publication) {
  if (pr.headRefOid !== publication.commit || review.commit !== publication.commit) throw new Error('Review and checks must cover the exact prepared commit.');
  if (!['automated', 'local'].includes(review.kind)) throw new Error('Record the completed review before merging.');
  if (review.feedbackAddressed !== true || pr.unresolvedThreads) throw new Error('Reviewer feedback and unresolved threads must be addressed before merging.');
  if (review.kind === 'local' && !review.automatedUnavailableReason) throw new Error('A local review must name why automated review was unavailable.');
  publicationGate(pr, publication);
}
// Shared CI and repository protection gates. Data-only intake independently
// verifies the sealed source/archive before calling this; code changes still
// require the completed review receipt above.
export function publicationGate(pr, publication) {
  if (pr.headRefOid !== publication.commit) throw new Error('Checks must cover the exact prepared commit.');
  if (pr.unresolvedThreads) throw new Error('Reviewer feedback and unresolved threads must be addressed before merging.');
  if (pr.reviewDecision && pr.reviewDecision !== 'APPROVED') throw new Error(`Review gate is ${pr.reviewDecision}.`);
  const latestReviews = new Map();
  for (const r of [...(pr.reviews ?? [])].sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))) latestReviews.set(r.author?.login ?? 'reviewer', r);
  if ([...latestReviews.values()].some(r => r.state === 'CHANGES_REQUESTED')) throw new Error('Changes-requested feedback must be resolved before merging.');
  if (!pr.statusCheckRollup?.length) throw new Error('No CI checks have reported yet.');
  for (const check of pr.statusCheckRollup) {
    if (check.status && check.status !== 'COMPLETED') throw new Error('CI is still running.');
    const result = check.conclusion ?? check.state;
    if (!['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(result)) throw new Error(`CI is not green: ${check.name ?? check.context}`);
  }
  for (const required of ['build', 'statements']) {
    if (!pr.statusCheckRollup.some(c => c.name === required && c.conclusion === 'SUCCESS')) throw new Error(`The required ${required} checks have not passed.`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = argsOf(process.argv.slice(2));
    if (!args.publication || !args.review) throw new Error('Use --publication job/publication.json --review job/completed-review.json.');
    const publication = JSON.parse(fs.readFileSync(args.publication, 'utf8')), review = JSON.parse(fs.readFileSync(args.review, 'utf8'));
    if (!publication.pullRequest || !publication.branch.startsWith('codex/statement-delivery-')) throw new Error('This is not a prepared statement PR.');
    const gh = args => {
      const r = spawnSync('gh', args, { cwd: ROOT, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`GitHub finalization failed: ${r.stderr?.trim()}`);
      return r.stdout.trim();
    };
    const pr = JSON.parse(gh(['pr', 'view', publication.pullRequest, '--json', 'number,headRefOid,reviewDecision,statusCheckRollup,reviews']));
    const { nameWithOwner } = JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner']));
    const [owner, name] = nameWithOwner.split('/');
    const threads = JSON.parse(gh(['api', 'graphql', '-f', 'query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved} pageInfo{hasNextPage}}}}}',
      '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${pr.number}`])).data.repository.pullRequest.reviewThreads;
    pr.unresolvedThreads = threads.pageInfo.hasNextPage || threads.nodes.some(t => !t.isResolved);
    finalizationGate(pr, review, publication);
    const seal = JSON.parse(fs.readFileSync(path.join(path.dirname(args.publication), 'seal.json'), 'utf8'));
    git(['fetch', 'origin', 'main']);
    if (git(['rev-parse', 'origin/main']).trim() !== seal.baseCommit) throw new Error('STALE_BASE: reprepare against the latest verified book.');
    gh(['pr', 'merge', publication.pullRequest, '--squash', '--match-head-commit', publication.commit]);
    atomicJson(args.publication, { ...publication, state: 'merged_awaiting_deployment', review });
    console.log(JSON.stringify({ state: 'merged_awaiting_deployment', pullRequest: publication.pullRequest, archiveRevision: publication.archiveRevision }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
