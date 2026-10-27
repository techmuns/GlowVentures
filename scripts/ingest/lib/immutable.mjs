/** Freeze a published JSON graph so cached evidence fingerprints cannot outlive
 * a mutation. A new reconciliation always uses a separate mutable candidate. */
export function immutable(value, seen = new WeakSet()) {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) immutable(child, seen);
    Object.freeze(value);
  }
  return value;
}
