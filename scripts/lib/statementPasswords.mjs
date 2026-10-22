// Trusted build/intake only. Keep existing family passwords sealed at rest;
// restore into memory using the intake's existing dashboard-password secret.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { openPrivateBytes, previewKeyBytes } from '../../shared/statementPreviewCrypto.mjs';
export const PASSWORD_VAULT_DOMAIN = createHash('sha256').update('glow-statement-password-vault::v1').digest('hex');
export async function restoreStatementPasswords(env = process.env, vault = new URL('../../config/statement-passwords.bin', import.meta.url)) {
  if (env.GLOW_PDF_PASSWORDS || env.GLOW_PDF_PASSWORD || !env.GLOW_DASHBOARD_PASSWORD || !fs.existsSync(vault)) return;
  try {
    const bytes = await openPrivateBytes(fs.readFileSync(vault), await previewKeyBytes(env.GLOW_DASHBOARD_PASSWORD), PASSWORD_VAULT_DOMAIN);
    const passwords = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(passwords) || passwords.length > 128 || !passwords.length || passwords.some(p => typeof p !== 'string' || !p.length || p.length > 256 || /[\r\n,]/.test(p))) throw Error();
    env.GLOW_PDF_PASSWORDS = [...new Set(passwords)].join('\n');
  } catch { throw Error('Saved statement passwords could not be opened with the dashboard credential'); }
}
