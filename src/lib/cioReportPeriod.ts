/** Inclusive reporting dates; return engines use the close of the preceding day. */
export type ReportPeriod = { key: string; label: string; title: string; from: string | null; to: string; opening: string | null };
export const REPORT_PERIODS = [
  ['qtd', 'Quarter to date'], ['quarter', 'Quarter (choose year)'], ['last-quarter', 'Previous quarter'],
  ['mtd', 'Month to date'], ['last-month', 'Previous month'],
  ['fytd', 'Financial year to date (Apr–Mar)'], ['fy', 'Financial year (choose year)'], ['last-fy', 'Previous financial year'],
  ['ytd', 'Year to date (Jan–Dec)'], ['year', 'Calendar year (choose year)'], ['last-year', 'Previous calendar year'],
  ['3m', 'Last 3 months'], ['6m', 'Last 6 months'], ['1y', 'Last 12 months'], ['2y', 'Last 2 years'],
  ['3y', 'Last 3 years'], ['5y', 'Last 5 years'], ['history', 'All available history'], ['custom', 'Custom dates'],
] as const;
const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const day = (date: string, delta: number) => iso(new Date(Date.parse(date + 'T00:00:00Z') + delta * 864e5));
const at = (y: number, m: number, d: number) => iso(new Date(Date.UTC(y, m, d)));
const moveMonths = (date: string, months: number) => {
  const d = new Date(date + 'T00:00:00Z'), target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  return at(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()));
};
export const reportToday = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export const validReportDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && iso(new Date(s + 'T00:00:00Z')) === s;

export function reportPeriod(key: string, { today = reportToday(), year = Number(today.slice(0, 4)), quarter = Math.ceil(Number(today.slice(5, 7)) / 3), from = '', to = today }: {
  today?: string; year?: number; quarter?: number; from?: string; to?: string;
} = {}): ReportPeriod {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1, q = Math.floor(m / 3), fy = y - (m < 3 ? 1 : 0);
  let first: string | null = null, end = today, label = '', title = '';
  switch (key) {
    case 'qtd': first = at(y, q * 3, 1); label = `Q${q + 1} ${y} to date`; title = 'Quarterly Review'; break;
    case 'quarter': first = at(year, (quarter - 1) * 3, 1); end = at(year, quarter * 3, 0); label = `Q${quarter} ${year}`; title = 'Quarterly Review'; break;
    case 'last-quarter': first = at(y, (q - 1) * 3, 1); end = at(y, q * 3, 0); label = `Q${Math.floor((Number(first.slice(5, 7)) - 1) / 3) + 1} ${first.slice(0, 4)}`; title = 'Quarterly Review'; break;
    case 'mtd': first = at(y, m, 1); label = 'Month to date'; title = 'Month-to-Date Review'; break;
    case 'last-month': first = at(y, m - 1, 1); end = at(y, m, 0); label = new Date(first + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }); title = 'Monthly Review'; break;
    case 'fytd': first = at(fy, 3, 1); label = `FY ${fy}-${String(fy + 1).slice(2)} to date`; title = 'Financial Year Review'; break;
    case 'fy': first = at(year, 3, 1); end = at(year + 1, 2, 31); label = `FY ${year}-${String(year + 1).slice(2)}`; title = 'Financial Year Review'; break;
    case 'last-fy': first = at(fy - 1, 3, 1); end = at(fy, 2, 31); label = `FY ${fy - 1}-${String(fy).slice(2)}`; title = 'Financial Year Review'; break;
    case 'ytd': first = at(y, 0, 1); label = 'Year to date'; title = 'Year-to-Date Review'; break;
    case 'year': first = at(year, 0, 1); end = at(year, 11, 31); label = `Calendar year ${year}`; title = 'Annual Review'; break;
    case 'last-year': first = at(y - 1, 0, 1); end = at(y - 1, 11, 31); label = `Calendar year ${y - 1}`; title = 'Annual Review'; break;
    case '3m': case '6m': case '1y': case '2y': case '3y': case '5y': {
      const months = key.endsWith('m') ? Number(key.slice(0, -1)) : Number(key.slice(0, -1)) * 12;
      first = day(moveMonths(today, -months), 1); label = REPORT_PERIODS.find(p => p[0] === key)![1]; title = 'Portfolio Review'; break;
    }
    case 'history': label = 'All available history'; title = 'Portfolio Review'; break;
    case 'custom': first = from; end = to; label = 'Custom period'; title = 'Portfolio Review'; break;
    default: throw Error('Choose a reporting period.');
  }
  if (end > today && key !== 'custom') { end = today; label += ' to date'; }
  if (!validReportDate(end) || (first != null && !validReportDate(first)) || (first && first > end) || end > today)
    throw Error('Choose valid reporting dates, with the start on or before the end and no future dates.');
  return { key, label, title, from: first, to: end, opening: first ? day(first, -1) : null };
}
