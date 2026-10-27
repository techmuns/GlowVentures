// Exact originals in THIS deployment. A name, folio or amount never proves a
// duplicate; the Git blob digest binds the upload to the original file bytes.
export function publishedStatementDuplicates(manifest, index) {
  const byBlob = new Map();
  if (!Array.isArray(manifest) || !index?.files) return byBlob;
  for (const doc of manifest) {
    const file = index.files[doc.docKey];
    if (!/^[a-f0-9]{40}$/.test(file?.blob ?? "")) continue;
    const group = byBlob.get(file.blob) ?? [];
    group.push({ doc, file });
    byBlob.set(file.blob, group);
  }
  const matches = new Map();
  for (const [blob, group] of byBlob) {
    // A bundled PDF is ready only when ALL of its source documents were read.
    const paths = new Set(group.map(({ doc }) => doc.sourcePath));
    const sourceDocs = manifest.filter(doc => paths.has(doc.sourcePath));
    if (sourceDocs.length !== group.length || group.some(({ doc, file }) =>
      doc.status !== "ok" || !doc.provider || !doc.sourcePath?.startsWith("source/")
      || !/^[a-z0-9-]+$/.test(doc.docKey) || !file.file
      || !Number.isSafeInteger(file.bytes) || file.bytes <= 0
      || file.bytes !== group[0].file.bytes)) continue;
    matches.set(blob, {
      bytes: group[0].file.bytes,
      sourcePaths: [...paths],
      docKeys: group.map(({ doc }) => doc.docKey),
      providers: [...new Set(group.map(({ doc }) => doc.provider))],
    });
  }
  return matches;
}

export function recognisePublishedDuplicates(log, matches) {
  return { ...log, batches: log.batches.map(batch => ({ ...batch, files: batch.files.map(file => {
    if (!["queued", "processing", "duplicate"].includes(file.status)) return file;
    const match = matches.get(file.blob);
    if (!match || match.bytes !== file.size) return file;
    return { ...file, status: "duplicate", hold: null,
      reason: `Already in the library — byte-identical to ${match.sourcePaths[0]}.`,
      landedAs: match.sourcePaths, docKeys: match.docKeys, providers: match.providers };
  }) })) };
}
