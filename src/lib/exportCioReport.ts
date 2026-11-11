import { jsPDF } from 'jspdf';
import { REPORT_COLORS, type CioReportSnapshot, type ReportHolding } from './cioReport';
import { fmtDate } from './format';
import { DEFAULT_BENCHMARK, benchmarkIdentity } from './benchmarks';
import { settledPriceHistory, closeOnOrBefore } from './prices';
import { compareToIndex } from './cardBenchmark';
import { bucketLabel as bucketLabelFor } from './analytics';

const W = 841.89, H = 595.28, M = 36, RIGHT = W - M, BOTTOM = H - 48;
const INK = '#183338', MUTED = '#63787a', RULE = '#d6dfde', TEAL = REPORT_COLORS[0];
type Cell = string | number | null;
type Column = { label: string; width: number; right?: boolean; signed?: boolean };
type Entry = { title: string; page: number };
type Assets = { regular: string; bold: string; cover: Uint8Array };
let assets: Promise<Assets> | undefined;

async function loadAssets(): Promise<Assets> {
  if (!assets) assets = (async () => {
    const get = async (name: string) => {
      const r = await fetch(`${import.meta.env.BASE_URL}report-assets/${name}`);
      if (!r.ok) throw new Error('Report artwork or fonts could not be loaded. Please try again.');
      return new Uint8Array(await r.arrayBuffer());
    };
    const [regular, bold, cover] = await Promise.all([get('NotoSans-Regular.ttf'), get('NotoSans-Bold.ttf'), get('yacht-cover.jpg')]);
    const base64 = (bytes: Uint8Array) => {
      let value = '';
      for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(value);
    };
    return { regular: base64(regular), bold: base64(bold), cover };
  })().catch(e => { assets = undefined; throw e; });
  return assets;
}

/** Vector text, tables and charts stay sharp and searchable in the saved colour PDF. */
export async function exportCioReport(s: CioReportSnapshot) {
  const a = await loadAssets();
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true, putOnlyUsedFonts: true });
  pdf.addFileToVFS('NotoSans-Regular.ttf', a.regular); pdf.addFont('NotoSans-Regular.ttf', 'Noto', 'normal');
  pdf.addFileToVFS('NotoSans-Bold.ttf', a.bold); pdf.addFont('NotoSans-Bold.ttf', 'Noto', 'bold');
  pdf.setProperties({ title: `${s.brand.name} - ${s.period.title} - ${s.date}`,
    author: s.brand.provider, subject: `${s.scope} | ${s.currency} | ${s.period.label}`, creator: s.brand.provider });
  const entries: Entry[] = [];
  const clean = (v: Cell) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\u00a0/g, ' ');
  const text = (v: Cell, x: number, y: number, size = 9, color = INK, bold = false, align: 'left' | 'right' | 'center' = 'left') => {
    pdf.setFont('Noto', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(color);
    pdf.text(clean(v), x, y, { align });
  };
  const line = (x: number, y: number, x2: number, y2: number, color = RULE) => {
    pdf.setDrawColor(color); pdf.setLineWidth(.5); pdf.line(x, y, x2, y2);
  };
  const para = (v: string, x: number, y: number, width: number, size = 9, color = MUTED) => {
    pdf.setFont('Noto', 'normal'); pdf.setFontSize(size); pdf.setTextColor(color);
    const lines: string[] = pdf.splitTextToSize(clean(v), width);
    pdf.text(lines, x, y, { lineHeightFactor: 1.55 });
    return y + lines.length * size * 1.55;
  };
  const logo = (x: number, y: number, light = false) => {
    pdf.setFillColor('#c3a962'); pdf.roundedRect(x, y, 26, 26, 6, 6, 'F');
    text(s.brand.mark, x + 13, y + 19, 17, '#14272b', true, 'center');
    text(s.brand.name.toUpperCase(), x + 36, y + 11, 11, light ? '#ffffff' : TEAL, true);
    text('FAMILY OFFICE', x + 36, y + 24, 6.5, light ? '#d8e3df' : MUTED);
  };
  const header = (title: string, continued = false) => {
    logo(M, 23);
    text(s.scope, RIGHT, 33, 8, MUTED, false, 'right');
    text(`${s.period.label} | To ${fmtDate(s.date)} | ${s.currency}`, RIGHT, 47, 8, MUTED, false, 'right');
    text(`${title}${continued ? ' (continued)' : ''}`, M, 83, 16, TEAL);
    line(M, 94, RIGHT, 94);
  };
  const page = (title: string, continued = false) => {
    pdf.addPage(); header(title, continued);
    if (!continued) entries.push({ title, page: pdf.getNumberOfPages() });
  };
  const heading = (title: string, x: number, y: number, width: number) => {
    text(title, x, y, 10, TEAL, true); line(x, y + 8, x + width, y + 8);
  };
  const table = (title: string, columns: Column[], rows: Cell[][], start = 122, x = M, width = RIGHT - M) => {
    let y = start;
    const widths = columns.map(c => c.width * width);
    const head = () => {
      pdf.setFillColor('#edf2f1'); pdf.rect(x, y - 12, width, 27, 'F');
      let cx = x;
      columns.forEach((c, i) => {
        pdf.setFont('Noto', 'bold'); pdf.setFontSize(7);
        const ls: string[] = pdf.splitTextToSize(c.label.toUpperCase(), widths[i] - 12);
        ls.forEach((l, n) => text(l, c.right ? cx + widths[i] - 6 : cx + 6, y + n * 9, 7, MUTED, true, c.right ? 'right' : 'left'));
        cx += widths[i];
      });
      y += 25;
    };
    head();
    rows.forEach((row, ri) => {
      pdf.setFont('Noto', 'normal'); pdf.setFontSize(8);
      const cells = columns.map((c, i) => pdf.splitTextToSize(clean(row[i]), widths[i] - 12) as string[]);
      const height = Math.max(23, Math.max(...cells.map(ls => ls.length)) * 10 + 10);
      if (y + height > BOTTOM) { page(title, true); y = 122; head(); }
      if (ri % 2 === 1) { pdf.setFillColor('#f4f6f5'); pdf.rect(x, y - 11, width, height, 'F'); }
      let cx = x;
      columns.forEach((c, i) => {
        const raw = clean(row[i]);
        const color = c.signed && /^[+-]?\d/.test(raw) ? raw.startsWith('-') ? '#a74654' : TEAL : INK;
        cells[i].forEach((l, n) => text(l, c.right ? cx + widths[i] - 6 : cx + 6, y + n * 10, 8, color, false, c.right ? 'right' : 'left'));
        cx += widths[i];
      });
      y += height; line(x, y - 11, x + width, y - 11, '#e4e9e8');
    });
    return y;
  };
  const bars = (rows: { label: string; value: number; display: string }[], x: number, y: number, width: number, height: number, signed = false) => {
    if (!rows.length) return;
    const max = Math.max(...rows.map(r => Math.abs(r.value)), .01);
    const labelW = width * .40, plotW = width - labelW - 50;
    const rowH = Math.min(29, height / rows.length);
    const zero = x + labelW + (signed ? plotW / 2 : 0), scale = (signed ? plotW / 2 : plotW) / max;
    line(zero, y - 7, zero, y + rowH * rows.length - 7);
    rows.forEach((r, i) => {
      const yy = y + rowH * i;
      pdf.setFont('Noto', 'normal'); pdf.setFontSize(7);
      const label: string[] = pdf.splitTextToSize(r.label, labelW - 12);
      label.slice(0, 2).forEach((l, n) => text(l, x + labelW - 9, yy + n * 8, 7, MUTED, false, 'right'));
      const length = Math.abs(r.value * scale);
      pdf.setFillColor(REPORT_COLORS[i % REPORT_COLORS.length]);
      pdf.rect(r.value < 0 ? zero - length : zero, yy - 7, Math.max(.8, length), Math.max(4, rowH - 11), 'F');
      text(r.display, x + width, yy + 1, 7.5, r.value < 0 ? '#a74654' : TEAL, false, 'right');
    });
  };
  const donut = (rows: { label: string; value: number }[], x: number, y: number, radius: number) => {
    const total = rows.reduce((t, r) => t + r.value, 0);
    if (total <= 0) return;
    let angle = -Math.PI / 2;
    rows.forEach((r, i) => {
      const end = angle + r.value / total * 2 * Math.PI, step = (end - angle) / Math.max(2, Math.ceil((end - angle) * 30));
      const points: [number, number][] = [[Math.cos(angle) * radius, Math.sin(angle) * radius]];
      let previous = angle;
      for (let current = angle + step; current <= end + .0001; current += step) {
        points.push([(Math.cos(current) - Math.cos(previous)) * radius, (Math.sin(current) - Math.sin(previous)) * radius]); previous = current;
      }
      points.push([-Math.cos(previous) * radius, -Math.sin(previous) * radius]);
      pdf.setFillColor(REPORT_COLORS[i % REPORT_COLORS.length]); pdf.lines(points, x, y, [1, 1], 'F', true); angle = end;
    });
    pdf.setFillColor('#ffffff'); pdf.circle(x, y, radius * .66, 'F');
    text('ALLOCATION', x, y - 2, 7, MUTED, false, 'center');
    text('100%', x, y + 15, 15, TEAL, true, 'center');
  };
  const holdingTable = (title: string, rows: ReportHolding[], start = 122) => table(title, [
    { label: 'Security / investment', width: .29 }, { label: 'Category', width: .17 },
    { label: `Value (${s.currency})`, width: .14, right: true }, { label: 'Cost of units held', width: .14, right: true },
    { label: 'Unrealised return', width: .12, right: true, signed: true }, { label: '% of portfolio', width: .14, right: true },
  ], rows.map(h => [h.name + (h.atCost ? ' [at cost]' : ''), h.category, s.money(h.value), s.money(h.cost), s.percent(h.pct), `${h.weight.toFixed(2)}%`]), start);

  // The screenshot's split yacht / forest-green cover, with the client's own identity.
  pdf.addImage(a.cover, 'JPEG', 0, 0, W / 2, H, undefined, 'FAST');
  pdf.setFillColor('#102522'); pdf.rect(W / 2, 0, W / 2, H, 'F');
  logo(42, 63, true);
  text('Family Office', W / 2 + 32, 105, 29, '#ffffff');
  text(s.period.title, W / 2 + 32, 148, s.period.title.length > 20 ? 24 : 29, '#ffffff');
  para('A clear view of your family office: asset allocation, investment performance and capital deployment, based on the records available for your portfolio.', W / 2 + 32, 205, 320, 11, '#dce7e3');
  text('REPORTING PERIOD', W / 2 + 32, 368, 8, '#b9cdca');
  text(s.period.label, W / 2 + 32, 390, 13, '#ffffff');
  text(`${s.period.from ? fmtDate(s.period.from) : 'First available record'} - ${fmtDate(s.date)}`, W / 2 + 32, 414, 11, '#ffffff');
  text(s.scope, W / 2 + 32, 450, 11, '#ffffff', true);
  text(`Prepared by ${s.brand.provider}`, W / 2 + 32, 488, 11, '#d4c28e', true);
  para(`Confidential | ${s.brand.name} | ${s.currency} | Exported ${fmtDate(s.exportedOn)}`, W / 2 + 32, 541, 320, 7, '#b9cdca');
  pdf.addPage(); header('Table of Contents');

  if (!s.historical) {
  page('Portfolio Overview');
  heading('Portfolio Update', M, 122, 351);
  let overviewY = para(`${s.brand.name}' portfolio value is ${s.money(s.summary.totalValue)}, across ${s.accountCount} accounts and ${s.holdings.length} investment lines. ${s.scope}.`, M, 149, 351, 10, INK);
  overviewY = para(`Recorded invested capital: ${s.money(s.summary.totalInvested) || 'not available'}. ${s.summary.noCostCount ? `${s.summary.noCostCount} holdings (${s.money(s.summary.noCostMV)}) have no recorded purchase cost. ` : ''}Invested capital and portfolio value can cover different sets of holdings.`, M, overviewY + 12, 351, 8.5);
  heading('Asset Allocation', M, overviewY + 25, 351);
  const chartY = overviewY + 122;
  const positive = s.buckets.filter(b => b.current > 0);
  donut(positive.map(b => ({ label: bucketLabelFor(b.key), value: b.current })), M + 88, chartY, 68);
  positive.forEach((b, i) => {
    const yy = chartY - 54 + i * 18;
    pdf.setFillColor(REPORT_COLORS[i % REPORT_COLORS.length]); pdf.rect(M + 177, yy - 6, 6, 6, 'F');
    text(bucketLabelFor(b.key), M + 190, yy, 7.5);
    text(`${(b.current / positive.reduce((t, r) => t + r.current, 0) * 100).toFixed(1)}%`, M + 351, yy, 7.5, MUTED, false, 'right');
  });
  heading('Activity & Returns', 431, 122, RIGHT - 431);
  const metrics: Cell[][] = [['Portfolio value', s.money(s.summary.totalValue)],
    ['Recorded invested capital', s.money(s.summary.totalInvested)], ['Gain / loss in report period', s.money(s.selected.total.gain)],
    [`Period return${s.selected.total.measured?.basis === 'annual' ? ' (p.a.)' : ''}`, s.percent(s.selected.total.returnPct)],
    ['Closing value - covered records', s.money(s.selected.records ? s.selected.closingValue : null)]];
  table('Portfolio Overview', [{ label: 'Measure', width: .64 }, { label: s.currency, width: .36, right: true }], metrics, 153, 431, RIGHT - 431);
  para(`Returns use the same available records and holding assumptions as Morning CIO. Valuation dates: ${s.markSpan}. Exported ${new Date(s.generatedAt).toLocaleString('en-IN')}.`, 431, 350, RIGHT - 431, 8);
  para('Allocation uses positive holding values; any negative balances remain in the asset table and portfolio value. Missing figures are left blank throughout this report.', M, 518, RIGHT - M, 7);
  page('Asset Table');
  table('Asset Table', [{ label: 'Asset class / mandate', width: .30 }, { label: 'Recorded invested', width: .21, right: true },
    { label: 'Current value', width: .21, right: true }, { label: '% of portfolio', width: .17, right: true }, { label: 'Holdings', width: .11, right: true }],
    s.buckets.map(b => [bucketLabelFor(b.key), s.money(b.invested), s.money(b.current), s.summary.totalValue ? `${(b.current / s.summary.totalValue * 100).toFixed(2)}%` : '', b.count]));
  } else {
    page('Period Overview');
    heading(s.period.label, M, 122, RIGHT - M);
    para(`Requested period: ${s.period.from ? fmtDate(s.period.from) : 'first available record'} to ${fmtDate(s.period.to)}. ${s.scope}.`, M, 150, RIGHT - M, 11, INK);
    table('Period Overview', [{ label: 'Measure', width: .65 }, { label: s.currency, width: .35, right: true }], [
      ['Closing value - covered records only', s.money(s.selected.records ? s.selected.closingValue : null)],
      ['Gain / loss in report period', s.money(s.selected.total.gain)],
      [`Period return${s.selected.total.measured?.basis === 'annual' ? ' (p.a.)' : ''}`, s.percent(s.selected.total.returnPct)],
      ['Supported investment / account records', s.selected.records],
      ['First measured date', s.selected.from ? fmtDate(s.selected.from) : ''],
      ['Last measured date', s.selected.to ? fmtDate(s.selected.to) : ''],
    ], 200);
    para(s.selected.records
      ? 'Historical figures cover the supported records only. Records starting later than the requested start or last valued before the end retain their actual dates. Current holdings, live prices and current private capital accounts are excluded from historical allocation pages because they do not establish the portfolio held on that earlier date.'
      : 'No supported return records are available for this period. The report retains your requested dates; later holdings and today\'s portfolio value have not been substituted for missing historical records.', M, 435, RIGHT - M, 9);
  }

  const performance = s.selected.rows.filter(r => r.units.length > 0);
  if (performance.length) {
    page('Performance by Asset Class & Mandate');
    heading('Return over the selected reporting period', M, 122, 351);
    bars(performance.filter(r => r.returnPct != null).map(r => ({ label: r.label, value: r.returnPct!, display: s.percent(r.returnPct) })), M, 156, 351, 220, true);
    heading('Gain / loss over the selected period', 431, 122, RIGHT - 431);
    bars(performance.filter(r => r.gain != null).map(r => ({ label: r.label, value: r.gain!, display: s.money(r.gain) })), 431, 156, RIGHT - 431, 220, true);
    para('The requested dates filter opening and closing values and dated money movements. Where a complete period is unavailable, the first and last supported values are used and their dates are disclosed. Annualised returns are marked p.a.; returns under one year are shown as period returns.', M, 391, RIGHT - M, 8);
    table('Performance by Asset Class & Mandate', [{ label: 'Asset class / mandate', width: .29 }, { label: 'Opening + additions', width: .18, right: true },
      { label: 'Covered closing value', width: .18, right: true }, { label: 'Gain / loss', width: .18, right: true }, { label: 'Return / basis', width: .17, right: true }],
    performance.map(r => [r.label, s.money(r.invested), s.money(r.units.reduce((t, u) => t + u.close, 0)), s.money(r.gain), `${s.percent(r.returnPct)}${r.measured?.basis === 'annual' ? ' p.a.' : ''}`]), 450);
  }

  // Only draw benchmark comparisons when the same identity-checked history is already available in CIO.
  const index = settledPriceHistory(DEFAULT_BENCHMARK.symbol);
  if (index && benchmarkIdentity(index, DEFAULT_BENCHMARK).ok) {
    const comparisons = s.periods.filter(p => !p.card.selection.inception).map(p => ({ ...p,
      comparison: compareToIndex(p.card, d => closeOnOrBefore(index, d)?.value ?? null, null) })).filter(p => p.comparison.index != null);
    if (comparisons.length) {
      page('Portfolio Performance vs. Benchmark');
      heading(`Portfolio vs. ${DEFAULT_BENCHMARK.label}`, M, 122, RIGHT - M);
      bars(comparisons.flatMap(p => [
        { label: `${p.label} - portfolio`, value: p.comparison.book!, display: s.percent(p.comparison.book) },
        { label: `${p.label} - ${DEFAULT_BENCHMARK.label}`, value: p.comparison.index!, display: s.percent(p.comparison.index) },
      ]), M, 160, RIGHT - M, 205, true);
      table('Portfolio Performance vs. Benchmark', [{ label: 'Period', width: .25 }, { label: 'Portfolio', width: .19, right: true },
        { label: DEFAULT_BENCHMARK.label, width: .19, right: true }, { label: 'Difference (pp)', width: .18, right: true },
        { label: 'Basis', width: .19 }], comparisons.map(p => [p.label, s.percent(p.comparison.book), s.percent(p.comparison.index),
          p.comparison.gap?.toFixed(2) ?? '', p.comparison.annual ? 'Annualised' : 'Period return']), 387);
      para('Each rupee is invested into the index on the same date it moved in the portfolio and closes on the same date, using the same formula. Price index: dividends are excluded. Each period retains the coverage and assumptions shown in Returns & Coverage.', M, 518, RIGHT - M, 7.5);
    }
  }

  if (!s.historical) {
  if (s.equity.length) {
    page('Equity');
    heading('Top 10 Holdings by Value', M, 122, 351);
    bars(s.equity.slice(0, 10).map(h => ({ label: h.name, value: h.value, display: s.money(h.value) })), M, 157, 351, 285);
    heading('Top 10 by Unrealised Return', 431, 122, RIGHT - 431);
    bars(s.equity.filter(h => h.pct != null).sort((a, b) => b.pct! - a.pct!).slice(0, 10)
      .map(h => ({ label: h.name, value: h.pct!, display: s.percent(h.pct) })), 431, 157, RIGHT - 431, 285, true);
    para('Direct and managed listed equity. Unrealised return is the unrealised gain divided by the cost of units currently held, wherever every line has a verified cost and gain. It is neither YTD nor an annualised return. Holdings with missing costs are omitted from the return ranking.', M, 490, RIGHT - M, 8.5);
    page('Equity Holdings'); holdingTable('Equity Holdings', s.equity);
  }

  // Categories without holdings produce no page, no zero-valued chart and no contents entry.
  const cash = s.holdings.filter(h => /cash/i.test(h.category));
  const privateHoldings = s.holdings.filter(h => h.private);
  const equitySet = new Set(s.equity), cashSet = new Set(cash), privateSet = new Set(privateHoldings);
  const other = s.holdings.filter(h => !equitySet.has(h) && !cashSet.has(h) && !privateSet.has(h));
  for (const category of [...new Set(other.map(h => h.category))]) {
    const rows = other.filter(h => h.category === category);
    page(category); holdingTable(category, rows);
  }
  if (privateHoldings.length || s.privateRows.length) {
    page('Private Equity & Venture Capital');
    heading('Private Investments Allocation', M, 122, 351);
    bars(privateHoldings.slice(0, 10).map(h => ({ label: h.name, value: h.value, display: s.money(h.value) })), M, 156, 351, 280);
    heading('Capital Deployment', 431, 122, RIGHT - 431);
    const d = s.summary.deploy;
    table('Private Equity & Venture Capital', [{ label: 'Measure', width: .65 }, { label: s.currency, width: .35, right: true }],
      [['Commitments', s.money(d.committed)], ['Capital called', s.money(d.drawn)], ['Undrawn capital', s.money(d.unfunded)],
        ['Distributions received', s.money(d.distributed)]].filter(r => r[1] !== ''), 155, 431, RIGHT - 431);
    para('Each holding and its capital account is counted once under the same consolidation rules as Private Market. An investment recorded only at purchase cost is marked [at cost]; no performance is inferred from it.', 431, 345, RIGHT - 431, 8);
    if (privateHoldings.length) { page('Private Investments - Holdings'); holdingTable('Private Investments - Holdings', privateHoldings); }
    if (s.privateRows.length) {
      page('Private Investments - Activity Overview');
      table('Private Investments - Activity Overview', [{ label: 'Fund / owner', width: .29 }, { label: 'As at', width: .10 },
        { label: 'Commitment', width: .13, right: true }, { label: 'Called', width: .12, right: true },
        { label: 'Undrawn', width: .12, right: true }, { label: 'Distributions', width: .12, right: true },
        { label: 'Value', width: .12, right: true }], s.privateRows.map(r => [r.name + '\n' + r.owner, r.date ? fmtDate(r.date) : '',
          s.money(r.figures.committed), s.money(r.figures.called), s.money(r.figures.uncalled), s.money(r.figures.distributed), s.money(r.figures.value)]));
    }
  }
  if (cash.length) {
    page('Cash Holdings');
    bars(cash.slice(0, 8).map(h => ({ label: h.name, value: h.value, display: s.money(h.value) })), M, 126, RIGHT - M, 192);
    holdingTable('Cash Holdings', cash, 348);
  }
  }
  const windows = s.selected.total.units.filter(u => u.window).map(u => ({ label: u.label, w: u.window! }));
  if (windows.length) {
    page('Cash Flows - Selected Period');
    para('Only supported account and holding windows within the selected reporting dates are shown. Opening value is a valuation, not a cash contribution. Holdings measured by other methods are excluded from this activity table.', M, 120, RIGHT - M, 8);
    table('Cash Flows - Selected Period', [{ label: 'Account / investment', width: .28 }, { label: 'Window', width: .18 },
      { label: 'Opening value', width: .135, right: true }, { label: 'Capital added', width: .135, right: true },
      { label: 'Capital withdrawn', width: .135, right: true }, { label: 'Closing value', width: .135, right: true }],
    windows.map(({ label, w }) => [label, `${fmtDate(w.openDate)} - ${fmtDate(w.closeDate)}`, s.money(w.openValue),
      s.money(w.capitalIn), s.money(w.capitalOut), s.money(w.closeValue)]), 177);
  }
  page('Returns & Coverage');
  table('Returns & Coverage', [{ label: 'Period', width: .18 }, { label: 'Return', width: .13, right: true },
    { label: 'Gain / loss', width: .15, right: true }, { label: 'Measured dates', width: .22 },
    { label: s.historical ? 'Supported records' : 'Holdings covered', width: .14, right: true }, { label: 'Basis', width: .18 }],
  s.periods.filter(p => p.card.total.returnPct != null).map(({ label, card }) => [label, s.percent(card.total.returnPct), s.money(card.total.gain),
    card.from && card.to ? `${fmtDate(card.from)} - ${fmtDate(card.to)}` : '', s.historical ? card.records : `${card.coveredHoldings} / ${card.totalHoldings}`,
    card.total.measured?.basis === 'annual' ? 'Annualised' : 'Cumulative / period']), 122);
  heading('What the return covers', M, 315, RIGHT - M);
  let yy = 342;
  for (const { label, card } of s.periods) {
    const assumed = card.total.units.filter(u => u.assumption).length;
    const held = card.total.units.filter(u => u.held).length;
    yy = para(`${label}: ${s.historical ? `${card.records} supported investment / account records` : `${card.coveredHoldings} of ${card.totalHoldings} holdings`}; ${s.money(card.coveredValue)} covered. ${assumed} records assume the holding continues; ${held} records are held flat at their last value. ${card.total.missing.length} return records are unavailable.`, M, yy, RIGHT - M, 8) + 14;
  }
  page('Report Notes');
  const notes = [
    `${s.brand.name} | ${s.scope}. Prepared by ${s.brand.provider}. All amounts are displayed in ${s.currency}; the source book is recorded in INR and uses the dashboard's selected display exchange rate. Presentation currency does not establish the underlying currency exposure.`,
    `Requested reporting period: ${s.period.from ? fmtDate(s.period.from) : 'first available record'} to ${fmtDate(s.date)} (${s.period.label}). Exported ${fmtDate(s.exportedOn)}. ${s.historical ? 'Historical figures use supported records ending on or before the selected end date; later money movements, current holdings and live valuations are excluded.' : `Holdings use the selected Morning CIO snapshot: live prices where available and source marks elsewhere. Valuation dates span ${s.markSpan}.`} Returns measured over a shorter available window retain their actual measurement dates.`,
    'Consolidation follows the dashboard: duplicate reports of the same holding are counted once. Holdings below the dashboard threshold are excluded from the detailed holdings in the same way as Morning CIO. Recorded invested capital includes only supported costs and capital records and may cover a different set from current value; the difference must not be treated as profit.',
    'Returns and gains reuse Morning CIO calculations. Available-history returns, cumulative returns, annualised money-weighted returns and holding-period returns have different bases and are labelled separately. Continuation assumptions and investments held flat are included only under the dashboard rules and disclosed in Returns & Coverage. Holdings detail shows unrealised return on units held, excluding realised gains and income.',
    'Blank cells mean a figure is unavailable or cannot be measured reliably. Sections with no supported holdings or records are omitted. In particular, no geography, underlying currency exposure, duration, projected income, liabilities or historical monthly return is inferred from a current holding statement. Private holdings without a later valuation remain marked at cost.',
    'This report is confidential and intended for the family office. Past performance does not guarantee future results. Investment values may rise or fall. This report provides information from the available records and does not constitute investment, tax or legal advice.',
  ];
  let noteY = 126;
  notes.forEach(n => { noteY = para(n, M, noteY, RIGHT - M, 9) + 22; });

  // Resolve the contents only after conditional sections and table pagination are complete.
  pdf.setPage(2);
  const contentsColumns = entries.length > 18 ? 2 : 1;
  entries.forEach((e, i) => {
    const col = Math.floor(i / 18), row = i % 18;
    const width = contentsColumns === 2 ? 355 : 600, x = M + col * 405, y = 130 + row * 22;
    text(e.title, x, y, 9); text(e.page, x + width, y, 9, MUTED, false, 'right');
    pdf.link(x, y - 12, width, 19, { pageNumber: e.page });
    line(x, y + 7, x + width, y + 7, '#edf1f0');
  });
  for (let i = 2; i <= pdf.getNumberOfPages(); i++) {
    pdf.setPage(i); line(M, H - 31, RIGHT, H - 31);
    text(`CONFIDENTIAL | ${s.brand.name} | Prepared by ${s.brand.provider}`, M, H - 17, 6.5, MUTED);
    text(`${i} / ${pdf.getNumberOfPages()}`, RIGHT, H - 17, 7, MUTED, false, 'right');
  }
  return { blob: pdf.output('blob'), pages: pdf.getNumberOfPages(),
    filename: `${s.brand.name.replace(/\s+/g, '-')}-${s.period.title.replace(/\s+/g, '-')}-${s.period.from ?? 'available-history'}-to-${s.date}.pdf` };
}

