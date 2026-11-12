// The same canonical bytes bind a publication and its edge-side compatibility
// check. Object key order is irrelevant; missing values and array order are not.
export const canonicalJson = value => JSON.stringify(canonical(value));
function canonical(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite number in statement data');
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
}

export async function jsonFingerprint(value) {
  const json = canonicalJson(value);
  if (json === undefined) throw Error('Missing statement data');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
