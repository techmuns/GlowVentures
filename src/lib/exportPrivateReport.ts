// ── THE PRIVATE MARKET REPORT PDF (client #418) ─────────────────────────────
//
// A branded, vector PDF of the private book, built from `privateReportSnapshot`.
// It reuses the look of the Morning CIO report (Munshot: "we'll start from our
// template") — the same cover, fonts, tables and bar charts — but focuses on the
// private investments and their capital, multiples and money-weighted return.
//
// Isolated from `exportCioReport` on purpose: the established CIO report is left
// exactly as it is, so this cannot change a figure or a page in it.
import { jsPDF } from "jspdf";
import { fmtDate } from "./format";
import { REPORT_COLORS } from "./cioReport";
import type { PrivateReportSnapshot } from "./privateReport";

const W = 841.89, H = 595.28, M = 36, RIGHT = W - M, BOTTOM = H - 48;
const INK = "#183338", MUTED = "#63787a", RULE = "#d6dfde", TEAL = REPORT_COLORS[0];
type Cell = string | number | null;
type Column = { label: string; width: number; right?: boolean; signed?: boolean };
type Entry = { title: string; page: number };
type Assets = { regular: string; bold: string; cover: Uint8Array };
let assets: Promise<Assets> | undefined;

async function loadAssets(): Promise<Assets> {
  if (!assets) assets = (async () => {
    const get = async (name: string) => {
      const r = await fetch(`${import.meta.env.BASE_URL}report-assets/${name}`);
      if (!r.ok) throw new Error("Report artwork or fonts could not be loaded. Please try again.");
      return new Uint8Array(await r.arrayBuffer());
    };
    const [regular, bold, cover] = await Promise.all([get("NotoSans-Regular.ttf"), get("NotoSans-Bold.ttf"), get("yacht-cover.jpg")]);
    const base64 = (bytes: Uint8Array) => {
      let value = "";
      for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(value);
    };
    return { regular: base64(regular), bold: base64(bold), cover };
  })().catch((e) => { assets = undefined; throw e; });
  return assets;
}

/** Vector text, tables and charts stay sharp and searchable in the saved colour PDF. */
export async function exportPrivateReport(s: PrivateReportSnapshot) {
  const a = await loadAssets();
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
  pdf.addFileToVFS("NotoSans-Regular.ttf", a.regular); pdf.addFont("NotoSans-Regular.ttf", "Noto", "normal");
  pdf.addFileToVFS("NotoSans-Bold.ttf", a.bold); pdf.addFont("NotoSans-Bold.ttf", "Noto", "bold");
  pdf.setProperties({ title: `${s.brand.name} - Private Market Review - ${s.date}`,
    author: s.brand.provider, subject: `${s.scope} | ${s.currency} | ${s.period.label}`, creator: s.brand.provider });
  const entries: Entry[] = [];
  const clean = (v: Cell) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/ /g, " ");
  const text = (v: Cell, x: number, y: number, size = 9, color = INK, bold = false, align: "left" | "right" | "center" = "left") => {
    pdf.setFont("Noto", bold ? "bold" : "normal"); pdf.setFontSize(size); pdf.setTextColor(color);
    pdf.text(clean(v), x, y, { align });
  };
  const line = (x: number, y: number, x2: number, y2: number, color = RULE) => {
    pdf.setDrawColor(color); pdf.setLineWidth(.5); pdf.line(x, y, x2, y2);
  };
  const para = (v: string, x: number, y: number, width: number, size = 9, color = MUTED) => {
    pdf.setFont("Noto", "normal"); pdf.setFontSize(size); pdf.setTextColor(color);
    const lines: string[] = pdf.splitTextToSize(clean(v), width);
    pdf.text(lines, x, y, { lineHeightFactor: 1.55 });
    return y + lines.length * size * 1.55;
  };
  const logo = (x: number, y: number, light = false) => {
    pdf.setFillColor("#c3a962"); pdf.roundedRect(x, y, 26, 26, 6, 6, "F");
    text(s.brand.mark, x + 13, y + 19, 17, "#14272b", true, "center");
    text(s.brand.name.toUpperCase(), x + 36, y + 11, 11, light ? "#ffffff" : TEAL, true);
    text("FAMILY OFFICE", x + 36, y + 24, 6.5, light ? "#d8e3df" : MUTED);
  };
  const header = (title: string, continued = false) => {
    logo(M, 23);
    text(s.scope, RIGHT, 33, 8, MUTED, false, "right");
    text(`${s.period.label} | To ${fmtDate(s.date)} | ${s.currency}`, RIGHT, 47, 8, MUTED, false, "right");
    text(`${title}${continued ? " (continued)" : ""}`, M, 83, 16, TEAL);
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
    const widths = columns.map((c) => c.width * width);
    const head = () => {
      pdf.setFillColor("#edf2f1"); pdf.rect(x, y - 12, width, 27, "F");
      let cx = x;
      columns.forEach((c, i) => {
        pdf.setFont("Noto", "bold"); pdf.setFontSize(7);
        const ls: string[] = pdf.splitTextToSize(c.label.toUpperCase(), widths[i] - 12);
        ls.forEach((l, n) => text(l, c.right ? cx + widths[i] - 6 : cx + 6, y + n * 9, 7, MUTED, true, c.right ? "right" : "left"));
        cx += widths[i];
      });
      y += 25;
    };
    head();
    rows.forEach((row, ri) => {
      pdf.setFont("Noto", "normal"); pdf.setFontSize(8);
      const cells = columns.map((c, i) => pdf.splitTextToSize(clean(row[i]), widths[i] - 12) as string[]);
      const height = Math.max(23, Math.max(...cells.map((ls) => ls.length)) * 10 + 10);
      if (y + height > BOTTOM) { page(title, true); y = 122; head(); }
      if (ri % 2 === 1) { pdf.setFillColor("#f4f6f5"); pdf.rect(x, y - 11, width, height, "F"); }
      let cx = x;
      columns.forEach((c, i) => {
        const raw = clean(row[i]);
        const color = c.signed && /^[+-]?\d/.test(raw) ? raw.startsWith("-") ? "#a74654" : TEAL : INK;
        cells[i].forEach((l, n) => text(l, c.right ? cx + widths[i] - 6 : cx + 6, y + n * 10, 8, color, false, c.right ? "right" : "left"));
        cx += widths[i];
      });
      y += height; line(x, y - 11, x + width, y - 11, "#e4e9e8");
    });
    return y;
  };
  const bars = (data: { label: string; value: number; display: string }[], x: number, y: number, width: number, height: number, signed = false) => {
    if (!data.length) return;
    const max = Math.max(...data.map((r) => Math.abs(r.value)), .01);
    const labelW = width * .42, plotW = width - labelW - 52;
    const rowH = Math.min(26, height / data.length);
    const zero = x + labelW + (signed ? plotW / 2 : 0), scale = (signed ? plotW / 2 : plotW) / max;
    line(zero, y - 7, zero, y + rowH * data.length - 7);
    data.forEach((r, i) => {
      const yy = y + rowH * i;
      const label: string[] = pdf.splitTextToSize(r.label, labelW - 12);
      label.slice(0, 2).forEach((l, n) => text(l, x + labelW - 9, yy + n * 8, 7, MUTED, false, "right"));
      const length = Math.abs(r.value * scale);
      pdf.setFillColor(REPORT_COLORS[i % REPORT_COLORS.length]);
      pdf.rect(r.value < 0 ? zero - length : zero, yy - 7, Math.max(.8, length), Math.max(4, rowH - 11), "F");
      text(r.display, x + width, yy + 1, 7.5, r.value < 0 ? "#a74654" : TEAL, false, "right");
    });
  };

  // ── Cover: the same split yacht / forest-green cover as the family report ──
  pdf.addImage(a.cover, "JPEG", 0, 0, W / 2, H, undefined, "FAST");
  pdf.setFillColor("#102522"); pdf.rect(W / 2, 0, W / 2, H, "F");
  logo(42, 63, true);
  text("Private Market Review", W / 2 + 32, 108, 27, "#ffffff");
  para("Your private companies and funds: capital deployed, current value, multiples and money-weighted return, from the records on file.", W / 2 + 32, 160, 320, 11, "#dce7e3");
  text("REPORTING PERIOD", W / 2 + 32, 360, 8, "#b9cdca");
  text(s.period.label, W / 2 + 32, 382, 13, "#ffffff");
  text(`${s.period.from ? fmtDate(s.period.from) : "First available record"} - ${fmtDate(s.date)}`, W / 2 + 32, 406, 11, "#ffffff");
  text(s.scope, W / 2 + 32, 444, 11, "#ffffff", true);
  text(`Prepared by ${s.brand.provider}`, W / 2 + 32, 482, 11, "#d4c28e", true);
  para(`Confidential | ${s.brand.name} | ${s.currency} | Exported ${fmtDate(s.exportedOn)}`, W / 2 + 32, 536, 320, 7, "#b9cdca");
  pdf.addPage(); header("Table of Contents");

  // ── Overview: narrative, capital & multiples, and a top-investments donut ──
  const t = s.totals;
  page("Private Market Overview");
  heading("Private Portfolio", M, 122, 351);
  let oy = para(`${s.brand.name}' private book is worth ${s.money(t.value)} across ${s.count} ${s.count === 1 ? "investment" : "investments"}. ${s.scope}.`, M, 149, 351, 10, INK);
  oy = para(`${t.invested != null ? `Recorded invested cost ${s.money(t.invested)} across ${s.investedOf} of ${s.count} ${s.investedOf === 1 ? "investment that reports" : "investments that report"} a cost` : "No investment here reports a cost"}. ${s.atCostCount ? `${s.atCostCount} ${s.atCostCount === 1 ? "investment is" : "investments are"} held at what was paid (${s.money(s.atCostValue)}) with no later valuation, so they carry no return. ` : ""}Figures are the same consolidated records the Private Market page shows.`, M, oy + 12, 351, 8.5);
  heading("Capital & Multiples", 431, 122, RIGHT - 431);
  const metrics: Cell[][] = [
    ["Current value", s.money(t.value)],
    ["Recorded invested cost", s.money(t.invested)],
    ["Unrealised gain / loss (valued holdings)", s.money(t.unrealised)],
    ["Committed", s.money(t.committed)],
    ["Capital called", s.money(t.called)],
    ["Undrawn capital", s.money(t.undrawn)],
    ["Capital paid in", s.money(t.paidIn)],
    ["Distributions received", s.money(t.distributed)],
    ["TVPI (value + distributions / paid in)", s.multiple(t.tvpi)],
    ["DPI (distributions / paid in)", s.multiple(t.dpi)],
    ["RVPI (value / paid in)", s.multiple(t.rvpi)],
  ].filter((r) => r[1] !== "");
  table("Private Market Overview", [{ label: "Measure", width: .64 }, { label: s.currency, width: .36, right: true }], metrics, 149, 431, RIGHT - 431);
  // Top investments by value, as a donut with its own legend.
  const top = s.rows.filter((r) => r.value > 0).slice(0, 7);
  if (top.length) {
    heading("Largest Investments by Value", M, oy + 28, 351);
    const cy = oy + 150;
    const donutRows = top.map((r) => ({ label: r.name, value: r.value }));
    const tot = donutRows.reduce((x, r) => x + r.value, 0);
    let ang = -Math.PI / 2;
    donutRows.forEach((r, i) => {
      const end = ang + r.value / tot * 2 * Math.PI, step = (end - ang) / Math.max(2, Math.ceil((end - ang) * 30));
      const pts: [number, number][] = [[Math.cos(ang) * 60, Math.sin(ang) * 60]];
      let prev = ang;
      for (let cur = ang + step; cur <= end + .0001; cur += step) { pts.push([(Math.cos(cur) - Math.cos(prev)) * 60, (Math.sin(cur) - Math.sin(prev)) * 60]); prev = cur; }
      pts.push([-Math.cos(prev) * 60, -Math.sin(prev) * 60]);
      pdf.setFillColor(REPORT_COLORS[i % REPORT_COLORS.length]); pdf.lines(pts, M + 70, cy, [1, 1], "F", true); ang = end;
    });
    pdf.setFillColor("#ffffff"); pdf.circle(M + 70, cy, 40, "F");
    text("PRIVATE", M + 70, cy - 2, 7, MUTED, false, "center"); text("100%", M + 70, cy + 14, 14, TEAL, true, "center");
    top.forEach((r, i) => {
      const yy = cy - 54 + i * 16;
      pdf.setFillColor(REPORT_COLORS[i % REPORT_COLORS.length]); pdf.rect(M + 150, yy - 6, 6, 6, "F");
      const nm: string[] = pdf.splitTextToSize(r.name, 150); text(nm[0], M + 162, yy, 7.5);
      text(`${(r.value / tot * 100).toFixed(1)}%`, M + 351, yy, 7.5, MUTED, false, "right");
    });
  }
  para(`Multiples pool the ${s.multiplesOf} ${s.multiplesOf === 1 ? "investment" : "investments"} whose capital paid in is on record. Valuation dates: ${s.valuedSpan || "not available"}. Missing figures are left blank throughout.`, M, 520, RIGHT - M, 7.5);

  // ── Investments detail table ──
  page("Investments");
  para("One row per investment. Invested cost and current value are the dashboard's consolidated figures. TVPI and IRR are shown where the fund's dated capital calls, distributions and a valuation are on record; IRR is the money-weighted return from the first call to the latest valuation, annualised over a year (p.a.).", M, 120, RIGHT - M, 8);
  table("Investments", [
    { label: "Investment", width: .24 }, { label: "Invested", width: .11, right: true },
    { label: "Value", width: .11, right: true }, { label: "Unrealised", width: .11, right: true, signed: true },
    { label: "Paid in", width: .1, right: true }, { label: "Distributed", width: .1, right: true },
    { label: "TVPI", width: .07, right: true }, { label: "IRR", width: .09, right: true, signed: true },
    { label: "Valued", width: .07 },
  ], s.rows.map((r) => [
    r.name + (r.atCost ? " [at cost]" : ""), s.money(r.invested), s.money(r.value), s.money(r.unrealised),
    s.money(r.paidIn), s.money(r.distributed), s.multiple(r.tvpi),
    r.irrPct != null ? `${s.percent(r.irrPct)}${r.irrAnnualised ? " p.a." : ""}` : "", r.valuedAt ? fmtDate(r.valuedAt) : "",
  ]), 164);

  // ── Allocation bars (top 12 by value) ──
  const barsTop = s.rows.filter((r) => r.value > 0).slice(0, 12);
  if (barsTop.length) {
    page("Allocation by Investment");
    bars(barsTop.map((r) => ({ label: r.name, value: r.value, display: s.money(r.value) })), M, 128, RIGHT - M, 320);
    para("Current value of each investment. Investments held at what was paid are included at that cost until a later valuation is on record.", M, 470, RIGHT - M, 8);
  }

  // ── Notes ──
  page("Report Notes");
  const notes = [
    `${s.brand.name} | ${s.scope}. Prepared by ${s.brand.provider}. Amounts are shown in ${s.currency}; the source book is recorded in INR and converted at the dashboard's selected rate. Presentation currency does not establish the underlying currency exposure.`,
    `Reporting period: ${s.period.from ? fmtDate(s.period.from) : "first available record"} to ${fmtDate(s.date)} (${s.period.label}). Exported ${fmtDate(s.exportedOn)}. Figures are the same consolidated private-market records the dashboard shows: each holding and its capital account counted once.`,
    "IRR is the money-weighted return over each fund's own first-call-to-latest-valuation window, the only window its records can measure today; a period-specific IRR fills in as the funds file their quarterly valuations. TVPI, DPI and RVPI (ILPA) are shown only where capital paid in and the inputs are on record. A distribution of return of capital reduces paid-in and is never counted as income.",
    "Blank cells mean a figure is unavailable or cannot be measured from the records. An investment the family's consolidated review records at what was paid is marked [at cost] and shows no return. No valuation, multiple or return is inferred for an investment without the dated records behind it.",
    "This report is confidential and intended for the family office. Past performance does not guarantee future results. Investment values may rise or fall. It provides information from the available records and is not investment, tax or legal advice.",
  ];
  let ny = 126;
  notes.forEach((n) => { ny = para(n, M, ny, RIGHT - M, 9) + 20; });

  // ── Contents (resolved after pagination) and footers ──
  pdf.setPage(2);
  entries.forEach((e, i) => {
    const y = 130 + i * 22;
    text(e.title, M, y, 9); text(e.page, M + 600, y, 9, MUTED, false, "right");
    pdf.link(M, y - 12, 600, 19, { pageNumber: e.page });
    line(M, y + 7, M + 600, y + 7, "#edf1f0");
  });
  for (let i = 2; i <= pdf.getNumberOfPages(); i++) {
    pdf.setPage(i); line(M, H - 31, RIGHT, H - 31);
    text(`CONFIDENTIAL | ${s.brand.name} | Prepared by ${s.brand.provider}`, M, H - 17, 6.5, MUTED);
    text(`${i} / ${pdf.getNumberOfPages()}`, RIGHT, H - 17, 7, MUTED, false, "right");
  }
  return { blob: pdf.output("blob"), pages: pdf.getNumberOfPages(),
    filename: `${s.brand.name.replace(/\s+/g, "-")}-Private-Market-${s.period.from ?? "available-history"}-to-${s.date}.pdf` };
}
