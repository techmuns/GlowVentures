// Configuration preparation only: never deploys, writes a secret or activates
// production. The resulting config pins its image and audit base to this commit.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const config = JSON.parse(fs.readFileSync('services/statement-processor/wrangler.jsonc', 'utf8'));
config.main = path.join(root, 'services/statement-processor/worker.js');
config.containers[0].image = path.join(root, 'services/statement-processor/Dockerfile');
config.containers[0].image_build_context = root;
config.containers[0].image_vars = { SOURCE_COMMIT: sha };
fs.mkdirSync('.cache/rapid-statement-publications', { recursive: true });
const target = '.cache/rapid-statement-publications/wrangler.json';
fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
console.log(`Prepared ${target} for ${sha}. No service was deployed or activated.`);
