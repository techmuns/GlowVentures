// Capital-in is positive here. End-of-day convention; weights are elapsed
// calendar days actually invested, never the timestamp a file was received.
export function weightedCapital(flows, from, to) {
  const parse = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? Date.parse(`${value}T00:00:00Z`) : NaN;
  const start = parse(from), end = parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  let total = 0;
  for (const flow of flows) {
    const on = parse(flow.date);
    if (!Number.isFinite(on) || !Number.isFinite(flow.amount)) return null;
    if (on > start && on <= end) total += flow.amount * (end - on) / (end - start);
  }
  return Number.isFinite(total) ? total : null;
}
