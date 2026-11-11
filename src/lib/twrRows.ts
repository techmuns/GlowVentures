import { UNSPLIT_RETURNS, type SelectedLine } from './selectedSegmentReturns';

/** Keep the selected-period figures, while exposing sold contributors that
 * belong to a different fixed horizon, including children of existing rows.
 */
export function mergeTwrRows(original: SelectedLine[], peers: SelectedLine[][]): SelectedLine[] {
  const isExited = (r: SelectedLine) => {
    const ps = r.positions.length ? r.positions : r.units.flatMap(u => u.positions);
    return ps.length > 0 && ps.every(p => p.marketValue === 0 && (p.quantity == null || p.quantity === 0));
  };
  const unmeasured = (r: SelectedLine, top = false): SelectedLine => ({ ...r,
    label: top && isExited(r) ? `${r.label} · exited` : r.label, exited: isExited(r) ? true : undefined,
    units: [], measured: null, gain: null, invested: null, returnPct: null, periodPct: null, contribution: null,
    missing: [{ accountId: r.positions[0]?.accountId ?? '', label: r.label, plainReason: true,
      reason: `${isExited(r) ? 'This investment is fully exited.' : 'The selected-period return is not available for this row.'} Its fixed-horizon TWR is shown where the purchase and sale records support it.` }],
    children: r.children.map(c => unmeasured(c)),
  });
  const rows = new Map(original.map(r => [r.key, r]));
  for (const list of peers) for (const r of list) {
    if (!rows.has(r.key) && (isExited(r) || r.key === UNSPLIT_RETURNS)) rows.set(r.key, unmeasured(r, true));
  }
  return [...rows.values()].map(r => {
    const matches = peers.flatMap(list => list.filter(other => other.key === r.key));
    return { ...r, children: mergeTwrRows(r.children, matches.map(other => other.children)) };
  });
}
