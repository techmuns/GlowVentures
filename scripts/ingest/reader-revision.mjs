import fs from 'node:fs/promises';
import path from 'node:path';
import { digest } from './lib/publication.mjs';
export async function readerRevisionFor(root = process.cwd()) {
  const pipelineFiles = [];
  async function pipelineTree(dir) {
    for (const entry of (await fs.readdir(path.join(root, dir), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { if (!['__tests__', 'reference'].includes(entry.name)) await pipelineTree(name); }
      else if (entry.isFile() && /\.(mjs|ts)$/.test(name)) pipelineFiles.push([name, digest(await fs.readFile(path.join(root, name), 'utf8'))]);
    }
  }
  await pipelineTree('scripts/ingest'); await pipelineTree('scripts/lib'); await pipelineTree('shared'); await pipelineTree('src/lib');
  pipelineFiles.push(['scripts/build-book.mjs', digest(await fs.readFile(path.join(root, 'scripts/build-book.mjs'), 'utf8'))]);
  return digest(pipelineFiles);
}
