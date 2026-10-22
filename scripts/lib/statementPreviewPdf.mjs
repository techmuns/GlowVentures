// Build-time only. Saved statement passwords never enter a public file or URL.
// qpdf runs in an in-memory filesystem; even its diagnostics are suppressed so
// a provider's password cannot appear in a failed build's output.
import { createHash } from 'node:crypto';
import createQpdf from '@neslinesli93/qpdf-wasm';

export const previewKey = bytes => createHash('sha256').update(bytes).digest('hex') + '.pdf';
let qpdf;
export async function unlockPdf(bytes, passwords) {
  if (!passwords.length) return null;
  if (!qpdf) {
    qpdf = await createQpdf({ noInitialRun: true, noFSInit: true });
    qpdf.FS.init(() => null, () => {}, () => {});
  }
  const { FS } = qpdf;
  FS.writeFile('/statement.pdf', bytes);
  try {
    for (const password of passwords) {
      FS.writeFile('/password', new TextEncoder().encode(password + '\n'));
      let code;
      const previousExitCode = process.exitCode;
      try {
        code = qpdf.callMain(['/statement.pdf', '--password-file=/password', '--decrypt', '--deterministic-id', '/preview.pdf']);
      } catch { code = 2; }
      finally { process.exitCode = previousExitCode; }
      if (code === 0 || code === 3) return Buffer.from(FS.readFile('/preview.pdf'));
    }
    return null;
  } finally {
    for (const file of ['/statement.pdf', '/password', '/preview.pdf']) {
      try { FS.unlink(file); } catch { /* no output after an unsuccessful attempt */ }
    }
  }
}
