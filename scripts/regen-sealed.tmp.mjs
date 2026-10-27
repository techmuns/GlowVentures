// TEMPORARY — deleted before this branch merges (Stage 10hv).
//
// The statement intake's own sequence for a sealed delivery, run once on CI:
// restore the saved statement passwords IN MEMORY from the vault
// (`config/statement-passwords.bin`, opened with GLOW_DASHBOARD_PASSWORD, as
// `intake-uploads.mjs` does), then read `source/` and rebuild the book and the
// encrypted previews. Nothing here prints a password or a statement's text.
import { spawnSync } from "node:child_process";
import { restoreStatementPasswords } from "./lib/statementPasswords.mjs";

await restoreStatementPasswords();
if (!process.env.GLOW_PDF_PASSWORDS) throw new Error("The saved statement passwords were not restored");

let failed = false;
for (const script of ["inventory", "extract", "build-book", "build:statement-files"]) {
  const r = spawnSync("npm", ["run", script], { stdio: "inherit", env: process.env });
  console.log(`npm run ${script} exited ${r.status}`);
  if (r.status !== 0) { failed = true; if (script === "inventory" || script === "extract") break; }
}
process.exit(failed ? 1 : 0);
