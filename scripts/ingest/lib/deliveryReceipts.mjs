// Delivery receipts attest to an exact published document version. Re-reading
// statements rebuilds their archive, but must retain those immutable attestations.
import fs from 'node:fs';
import path from 'node:path';

export function readDeliveryReceipts(archives) {
  const receipts = new Map();
  for (const archive of new Set(archives.map(p => path.resolve(p)))) {
    const directory = path.join(archive, 'deliveries');
    if (!fs.existsSync(directory)) continue;
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Delivery receipts must be a regular directory');
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name), entry = fs.lstatSync(file);
      if (!/^[a-f0-9]{64}\.json$/.test(name) || !entry.isFile() || entry.isSymbolicLink()) {
        throw new Error('Unsafe delivery receipt: ' + name);
      }
      const bytes = fs.readFileSync(file);
      if (receipts.has(name) && !receipts.get(name).equals(bytes)) throw new Error('Conflicting delivery receipt: ' + name);
      receipts.set(name, bytes);
    }
  }
  return receipts;
}

export function writeDeliveryReceipts(archive, receipts) {
  if (!receipts.size) return;
  const directory = path.join(archive, 'deliveries');
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, bytes] of receipts) fs.writeFileSync(path.join(directory, name), bytes);
}
