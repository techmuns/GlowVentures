#!/usr/bin/env node
// PROBE — the remaining Indian official sources, sorted by how hard each would
// be to read.
//
// WHY THIS RUNS BEFORE ANY OF THEM IS WIRED. Every source below is "published
// monthly by a ministry" and that sentence has already been wrong twice in this
// repo, in opposite directions. data.gov.in looked live — a fresh `updated`
// timestamp every day — and its data stopped in 2023. FRED was declared
// permanently unreachable and answered in under a second from the machine that
// actually matters. Guessing costs more than measuring, and measuring is cheap.
//
// WHAT THIS DECIDES. For each source: is the data behind a SPREADSHEET (a day's
// work), a PDF (a reader, several days), or a LOGIN (a commercial licence, not
// engineering at all). Those three answers lead to completely different plans,
// and no amount of reading documentation distinguishes them reliably.
//
// It writes nothing and commits nothing.

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 25_000;
const CONCURRENCY = 4;

/**
 * Each entry names the SPEC REQUIREMENTS it would close, so the output reads as
 * a worklist rather than a connectivity dump. `items` is the count from the
 * implementation checklist.
 */
const SOURCES = [
  {
    key: "rbi-wss", name: "RBI — Weekly Statistical Supplement", items: 13,
    unblocks: "Credit growth by bank type AND by sector (11), money supply, liquidity",
    url: "https://www.rbi.org.in/Scripts/BS_ViewWSS.aspx",
    // MEASURED 2026-08-12 from a GitHub Actions runner, both controls passing —
    // see `probe-rbi.mjs`, whose whole output is about this entry.
    //
    //   reachable          HTTP 200 in 1,087 ms. NOT geo-blocked from here.
    //   addressable        NO. Every WSS link on every page is a
    //                      WebForm_DoPostBackWithOptions call; there is no href
    //                      to follow and the index sits behind __VIEWSTATE.
    //   drivable by POST   NOT with a plain replay. Posting the page's own
    //                      __VIEWSTATE + __EVENTVALIDATION with the target the
    //                      page itself names (`lnk6`) returns 200, 67 KB, five
    //                      table rows, ZERO figures and none of the WSS table
    //                      names. It probably needs a session cookie and the
    //                      right control, which is a scraper, not a fetch.
    //   the document route the linked .XLSX on rbidocs answers 200 with
    //                      `text/html`, so the workbook is not fetchable by URL
    //                      either. Checked by CONTENT — by status alone it
    //                      passes, which is how it got recorded as OK once.
    //
    // So the reason these 13 are absent is NOT geography, and recording it as
    // geography told a reader to stop looking for something that is one
    // stateful HTTP session away. The real blocker is that the current issue
    // has no URL.
  },
  {
    key: "rbi-dbie", name: "RBI — Database on Indian Economy (DBIE)", items: 13,
    unblocks: "Same as WSS, but DBIE is the queryable front end if it is open",
    url: "https://data.rbi.org.in/",
  },
  {
    key: "rbi-handbook", name: "RBI — Handbook of Statistics on the Indian Economy", items: 4,
    unblocks: "Household financial savings, physical savings, household debt/GDP, financial asset mix",
    url: "https://www.rbi.org.in/Scripts/AnnualPublications.aspx?head=Handbook%20of%20Statistics%20on%20Indian%20Economy",
  },
  {
    key: "mospi-cpi", name: "MoSPI — CPI monthly release", items: 4,
    unblocks: "CURRENT CPI, core CPI, rural and urban inflation — the rows data.gov.in cannot serve",
    url: "https://mospi.gov.in/web/mospi/press-release",
  },
  {
    key: "mospi-iip", name: "MoSPI — IIP monthly release", items: 1,
    unblocks: "CURRENT Industrial Production, which the open-data resource froze in Feb 2023",
    url: "https://mospi.gov.in/iip",
  },
  {
    key: "cga", name: "Controller General of Accounts — monthly accounts", items: 2,
    unblocks: "Fiscal deficit and tax collections, MONTHLY rather than once a year in the Budget",
    url: "https://cga.nic.in/MonthlyReport",
  },
  {
    // The guessed /monthly-generation-report/ path 404s. CEA's monthly
    // generation and PLF are in the EXECUTIVE SUMMARY; renewable generation is
    // published separately and as a spreadsheet.
    key: "cea-exec", name: "CEA — monthly executive summary (generation, PLF)", items: 2,
    unblocks: "Generation and PLF — the spec's 'capacity utilisation' for electricity",
    url: "https://cea.nic.in/executive-summary-report/?lang=en",
  },
  {
    // cea.nic.in answers HTTP 200 in 2,493 ms from the runner (2026-08-12), so
    // this is not geo-blocked either. The open question is the report's own
    // addressing, not the network.
    key: "cea-re", name: "CEA — monthly renewable generation report", items: 1,
    unblocks: "Renewable generation, and a second check on the capacity series already wired",
    url: "https://cea.nic.in/renewable-generation-report/?lang=en",
  },
  {
    key: "vahan", name: "Vahan — vehicle registration dashboard", items: 4,
    unblocks: "Passenger vehicles, two-wheelers, commercial vehicles, tractors — the rows SIAM paywalls",
    url: "https://vahan.parivahan.gov.in/vahan4dashboard/",
  },
  {
    key: "nhb-residex", name: "NHB RESIDEX — house price index", items: 3,
    unblocks: "House price index, registrations, and the city drill-down the spec asks for",
    url: "https://nhb.org.in/residex/",
  },
  {
    key: "dgca", name: "DGCA — monthly domestic traffic", items: 1,
    unblocks: "Airline traffic",
    url: "https://www.dgca.gov.in/digigov-portal/?page=jsp/dgca/InventoryList/dataReports/aviationDataStatistics/domesticTraffic/domesticTraffic.jsp",
  },
  {
    key: "ipa", name: "Indian Ports Association — traffic", items: 1,
    unblocks: "Port traffic",
    url: "https://www.ipa.nic.in/",
  },
  {
    key: "coal", name: "Ministry of Coal — production & supplies", items: 1,
    unblocks: "Indian coal production and despatch (the Coal industry card)",
    url: "https://coal.nic.in/en/major-statistics/production-and-supplies",
    alt: "https://coal.nic.in/en",
  },
  {
    key: "jpc", name: "Joint Plant Committee — steel statistics", items: 1,
    unblocks: "Indian steel capacity and production (the Steel industry card)",
    url: "https://jpcindiansteel.nic.in/",
  },
  {
    key: "railways", name: "Indian Railways — freight statistics", items: 2,
    unblocks: "Rail freight, which the spec asks for twice (commodity and consumption)",
    url: "https://indianrailways.gov.in/railwayboard/view_section.jsp?lang=0&id=0,1,304,366,554",
  },
  {
    key: "gst", name: "GST — monthly collections (PIB release)", items: 2,
    unblocks: "GST collections and e-way bills",
    url: "https://www.gst.gov.in/newsandupdates",
  },
  {
    key: "amfi", name: "AMFI — monthly industry data", items: 8,
    unblocks: "MF flows, SIP flows, folios, ETF flows — you are wiring this from your other dashboard",
    url: "https://www.amfiindia.com/research-information/amfi-monthly",
  },
  {
    key: "nsdl", name: "NSDL — investor / demat statistics", items: 2,
    unblocks: "Demat accounts and active trading accounts",
    url: "https://nsdl.co.in/publications/dpstat.php",
  },
  {
    key: "nse", name: "NSE — market turnover statistics", items: 2,
    unblocks: "Exchange volumes and F&O turnover",
    url: "https://www.nseindia.com/all-reports",
  },
  {
    key: "ppac", name: "PPAC — petroleum consumption", items: 1,
    unblocks: "Fuel consumption. Known PDF-only; re-probed in case a spreadsheet exists alongside",
    url: "https://ppac.gov.in/consumption",
  },
];

const FILE_RE = /https?:\/\/[^\s"'<>]+?\.(xlsx|xls|csv|pdf|zip)(\?[^\s"'<>]*)?/gi;
const REL_RE = /(?:href|src)\s*=\s*["']([^"']+?\.(?:xlsx|xls|csv|pdf|zip)(?:\?[^"']*)?)["']/gi;
const GATE_RE = /\b(sign in|signin|login|log in|subscribe|subscription|member(?:s)? (?:only|login)|register to)\b/gi;

async function probe(src) {
  const started = Date.now();
  const out = { ...src, ms: 0, status: null, type: "", bytes: 0, files: {}, gated: 0, sample: [], error: null };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const r = await fetch(src.url, { headers: { "User-Agent": UA, accept: "text/html,*/*" }, signal: ctl.signal, redirect: "follow" });
    clearTimeout(timer);
    out.status = r.status;
    out.type = (r.headers.get("content-type") || "").split(";")[0];
    const body = await r.text();
    out.bytes = body.length;

    // Absolute links, plus relative ones resolved against the page.
    const found = new Set();
    for (const m of body.matchAll(FILE_RE)) found.add(m[0]);
    for (const m of body.matchAll(REL_RE)) {
      try { found.add(new URL(m[1], r.url).href); } catch { /* unparseable href */ }
    }
    for (const u of found) {
      const ext = (u.split("?")[0].split(".").pop() || "").toLowerCase();
      out.files[ext] = (out.files[ext] || 0) + 1;
    }
    // SAMPLE THE TYPE THE VERDICT IS ABOUT. A first pass printed whichever
    // dated link sorted first, so AMFI — correctly classified SPREADSHEET on
    // 100 .xls links — displayed a PDF underneath it and read as a
    // contradiction. Sheets are sampled for a sheet verdict, PDFs for a PDF
    // one, and a year in the URL breaks the tie because that is how these
    // sites name a monthly release.
    const dated = (a, b) => (/20\d\d/.test(b) ? 1 : 0) - (/20\d\d/.test(a) ? 1 : 0);
    const isSheet = (u) => /\.(xlsx?|csv)(\?|$)/i.test(u.split("?")[0] + (u.includes("?") ? "?" : ""));
    const sheets = [...found].filter((u) => /\.(xlsx?|csv)$/i.test(u.split("?")[0])).sort(dated);
    const pdfs = [...found].filter((u) => /\.pdf$/i.test(u.split("?")[0])).sort(dated);
    out.sheetSample = sheets.slice(0, 2);
    out.pdfSample = pdfs.slice(0, 2);
    out.sample = (sheets.length ? sheets : pdfs).slice(0, 3);
    void isSheet;
    out.gated = (body.match(GATE_RE) || []).length;
  } catch (e) {
    out.error = String(e?.message || e).slice(0, 120);
  }
  out.ms = Date.now() - started;
  return out;
}

/**
 * The classification the whole probe exists to produce.
 *
 * A spreadsheet is a day's work, a PDF is a reader, a login is a commercial
 * licence. Only the first is cheap, and only measurement tells them apart.
 */
function verdict(o) {
  if (o.error) return ["UNREACHABLE", "could not be fetched from here — retry from the Actions runner before concluding"];
  if (o.status !== 200) return ["UNREACHABLE", `HTTP ${o.status}`];
  const sheets = (o.files.xlsx || 0) + (o.files.xls || 0) + (o.files.csv || 0);
  const pdfs = o.files.pdf || 0;
  if (sheets > 0) return ["SPREADSHEET", `${sheets} spreadsheet link(s) on the page — the cheap case`];
  if (pdfs > 0) return ["PDF ONLY", `${pdfs} PDF link(s), no spreadsheet — needs a reader for that layout`];
  if (o.gated >= 3) return ["GATED", `${o.gated} login/subscription markers and no data links`];
  return ["NO LINKS", "page loads but carries no data links — probably rendered by script, needs a browser"];
}

const RANK = { SPREADSHEET: 0, "PDF ONLY": 1, "NO LINKS": 2, UNREACHABLE: 3, GATED: 4 };

/**
 * SOME OF THESE PAGES ARE BUILT BY SCRIPT, and a fetch can never see their
 * links. MoSPI, the CGA, the GST portal, RBI's DBIE and Vahan all return a
 * 200 with an empty shell; classifying them "no data links" from a fetch would
 * write off five sources on a limitation of the probe rather than of the
 * source. This pass loads them in a real browser and re-reads the DOM.
 */
async function probeInBrowser(sources) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    console.log("\n(browser pass skipped — playwright-core not installed)");
    return new Map();
  }
  // On the runner, `playwright install` puts Chromium in its own cache and
  // playwright-core resolves it itself, so no executablePath is given there.
  // In this dev container the browser is pre-installed at a fixed path.
  const EXEC = process.env.CHROMIUM_PATH
    || (process.env.GITHUB_ACTIONS ? null : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome");
  // A dev container reaches the internet through an egress proxy that Chromium
  // does not pick up from the environment the way fetch does. Passed through
  // explicitly so a local run is at least attempted; on the Actions runner
  // there is no proxy and this is simply absent.
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  let browser;
  try {
    browser = await chromium.launch({ ...(EXEC ? { executablePath: EXEC } : {}), ...(proxy ? { proxy: { server: proxy } } : {}) });
  } catch (e) {
    console.log(`\n(browser pass skipped — ${String(e.message).slice(0, 90)})`);
    return new Map();
  }
  const out = new Map();
  for (const src of sources) {
    const page = await browser.newPage({ userAgent: UA });
    try {
      await page.goto(src.url, { waitUntil: "networkidle", timeout: TIMEOUT_MS });
      const links = await page.evaluate(() =>
        [...document.querySelectorAll("a[href]")].map((a) => a.href));
      const files = {};
      for (const u of links) {
        const m = /\.(xlsx|xls|csv|pdf|zip)(\?|$)/i.exec(u.split("?")[0] + (u.includes("?") ? "?" : ""));
        if (m) files[m[1].toLowerCase()] = (files[m[1].toLowerCase()] || 0) + 1;
      }
      out.set(src.key, { links: links.length, files });
    } catch (e) {
      out.set(src.key, { error: String(e.message).slice(0, 90) });
    } finally {
      await page.close();
    }
  }
  await browser.close();
  return out;
}

(async () => {
  console.log("=== remaining official sources — what would each cost to wire? ===\n");
  const results = [];
  for (let i = 0; i < SOURCES.length; i += CONCURRENCY) {
    const batch = await Promise.all(SOURCES.slice(i, i + CONCURRENCY).map(probe));
    for (const o of batch) {
      const [v, why] = verdict(o);
      console.log(`  ${v.padEnd(12)} ${String(o.status ?? "---").padEnd(4)} ${String(o.ms).padStart(5)}ms  ${o.name}`);
      console.log(`               ${why}`);
      const ex = v === "SPREADSHEET" ? o.sheetSample?.[0] : v === "PDF ONLY" ? o.pdfSample?.[0] : o.sample?.[0];
      if (ex) console.log(`               e.g. ${ex.slice(0, 118)}`);
      if (o.error) console.log(`               error: ${o.error}`);
      results.push({ o, v, why });
    }
  }

  // Anything the fetch pass could not classify gets a second look in a browser.
  const needsBrowser = results.filter(({ v }) => v === "NO LINKS" || v === "UNREACHABLE").map(({ o }) => o);
  if (needsBrowser.length) {
    console.log(`\n\n========== BROWSER PASS (${needsBrowser.length} sources a fetch could not read) ==========`);
    const bres = await probeInBrowser(needsBrowser);
    for (const { o } of results) {
      const b = bres.get(o.key);
      if (!b) continue;
      if (b.error) { console.log(`  ${o.name}\n      still failed: ${b.error}`); continue; }
      const sheets = (b.files.xlsx || 0) + (b.files.xls || 0) + (b.files.csv || 0);
      const pdfs = b.files.pdf || 0;
      const nv = sheets ? "SPREADSHEET" : pdfs ? "PDF ONLY" : "NO LINKS";
      console.log(`  ${nv.padEnd(12)} ${o.name} — ${b.links} links, ${sheets} sheet(s), ${pdfs} pdf(s)`);
      // Promote the verdict: what the browser sees is what a reader would get.
      const row = results.find((r) => r.o.key === o.key);
      if (nv !== "NO LINKS") { row.v = nv; row.why = `${nv} (seen only in a browser — the page is script-rendered)`; }
    }
  }

  console.log("\n\n========== WORKLIST, EASIEST FIRST ==========");
  console.log("items = how many checklist requirements the source would close.\n");
  results.sort((a, b) => RANK[a.v] - RANK[b.v] || b.o.items - a.o.items);
  let closable = 0;
  for (const { o, v } of results) {
    if (v === "SPREADSHEET" || v === "PDF ONLY") closable += o.items;
    console.log(`${String(o.items).padStart(3)} items  ${v.padEnd(12)}  ${o.name}`);
    console.log(`            ${o.unblocks}`);
  }
  console.log(`\nReachable-and-readable sources would close ${closable} checklist items.`);
  console.log("UNREACHABLE from a dev container is NOT a finding — re-run this job on the");
  console.log("Actions runner before writing any source off, which is the mistake FRED cost us.");
})();
