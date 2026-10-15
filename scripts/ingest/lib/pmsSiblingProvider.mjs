import path from 'node:path';
import { resolveOwner } from '../../../shared/owners.mjs';
import { trimPersonName } from './classify.mjs';
import { PROVIDERS } from '../providers/pmsStatements.mjs';

const issuers = new Set(Object.values(PROVIDERS).map(p => p.name));

// Friendly exports omit the issuer. A holding named HDFC Asset Management is
// not an AMC letterhead. Recover only from this folder's independently labelled
// reports, with both the printed account AND the canonical holder agreeing.
export function pmsSiblingProvider(doc, text, documents) {
  if (!/^\s*(?:CURRENT PORTFOLIO|PORTFOLIO PERFORMANCE SUMMARY)\b/i.test(text)) return null;
  const identity = /\bAccount\s*:\s*(\d+)\s+([^\n]+)/i.exec(text);
  if (!identity) return null;
  const holder = resolveOwner(trimPersonName(identity[2])).owner?.ownerId;
  if (!holder) return null;
  const candidates = documents.filter(d => d !== doc && d.status === 'ok'
    && issuers.has(d.provider) && d.accountNo === identity[1] && d.ownerId === holder
    && path.dirname(d.sourcePath) === path.dirname(doc.sourcePath));
  const found = new Set(candidates.map(d => d.provider));
  return found.size === 1 ? [...found][0] : null;
}
