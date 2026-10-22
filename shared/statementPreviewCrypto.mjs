// Server/build only. The dashboard password is never embedded in this module.
// Workerd caps PBKDF2 at 100,000 iterations; use the native supported primitive.
const encoder = new TextEncoder();
export const PREVIEW_COOKIE = 'glow_pdf';
export const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;
export async function previewKeyBytes(password) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-512',
    salt: encoder.encode('glow-statement-previews::v1::6dc91cc7728ae4a5'), iterations: 100000 }, material, 256));
}
export const keyCookieValue = key => btoa(String.fromCharCode(...key)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export function keyFromCookie(cookie) {
  const value = cookie?.split(';').map(p => p.trim()).find(p => p.startsWith(PREVIEW_COOKIE + '='))?.slice(PREVIEW_COOKIE.length + 1);
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='), c => c.charCodeAt(0));
}
export function describePreview(bytes) {
  if (bytes.length < 69 || bytes.length > MAX_PREVIEW_BYTES + 68 || new TextDecoder().decode(bytes.subarray(0, 4)) !== 'GVP1') throw Error('Invalid encrypted preview');
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(36);
  if (size + 68 !== bytes.length) throw Error('Invalid encrypted preview length');
  return { bytes: size, dashboardHash: [...bytes.subarray(4, 36)].map(b => b.toString(16).padStart(2, '0')).join('') };
}
const aad = (hash, header) => {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('Invalid statement digest');
  const bytes = new Uint8Array(64 + 40); bytes.set(encoder.encode(hash)); bytes.set(header.subarray(0, 40), 64); return bytes;
};
export async function sealPrivateBytes(pdf, keyBytes, sourceHash, dashboardHash) {
  if (pdf.length < 1 || pdf.length > MAX_PREVIEW_BYTES || !/^[a-f0-9]{64}$/.test(dashboardHash)) throw Error('Invalid preview inputs');
  const header = new Uint8Array(52); header.set(encoder.encode('GVP1'));
  header.set(dashboardHash.match(/../g).map(h => parseInt(h, 16)), 4);
  new DataView(header.buffer).setUint32(36, pdf.length);
  crypto.getRandomValues(header.subarray(40, 52));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: header.subarray(40), additionalData: aad(sourceHash, header) }, key, pdf);
  const result = new Uint8Array(52 + encrypted.byteLength); result.set(header); result.set(new Uint8Array(encrypted), 52); return result;
}
export async function openPrivateBytes(sealed, keyBytes, sourceHash) {
  describePreview(sealed);
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const pdf = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.subarray(40, 52), additionalData: aad(sourceHash, sealed) }, key, sealed.subarray(52)));
  return pdf;
}
export async function sealPreview(pdf, keyBytes, sourceHash, dashboardHash) {
  if (new TextDecoder().decode(pdf.subarray(0, 5)) !== '%PDF-') throw Error('Invalid preview PDF');
  return sealPrivateBytes(pdf, keyBytes, sourceHash, dashboardHash);
}
export async function openPreview(sealed, keyBytes, sourceHash) {
  const pdf = await openPrivateBytes(sealed, keyBytes, sourceHash);
  if (new TextDecoder().decode(pdf.subarray(0, 5)) !== '%PDF-') throw Error('Invalid preview PDF');
  return pdf;
}
