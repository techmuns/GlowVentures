/**
 * ── THE STATEMENT LIBRARY: SOURCE DOCUMENTS, ONE FOLDER PER PROVIDER ─────────
 *
 * The family receives statements from several dozen wealth platforms and wanted
 * one place that shows, by provider, exactly which documents feed this book and
 * what KIND of file each provider sends — so a new Motilal Oswal statement has
 * an obvious home and nobody has to guess the format.
 *
 * This module is PURE GROUPING over `public/audit/manifest.json`, which the
 * ingest pipeline already writes and ships. It invents nothing: every provider,
 * account, date, report type and status below is read straight off the manifest
 * the book was built from. There is no second generated artifact to drift — the
 * Statement Library page reads the same manifest the Data Audit viewer does.
 *
 * The one piece of presentation furniture here is `REPORT_LABELS` — a map from
 * the pipeline's report-type slugs to human words, the same license CLAUDE.md
 * grants icon maps and sector tables. An unknown slug is title-cased rather than
 * dropped, so a report type a future reader adds still reads sensibly.
 */

/** One row of `public/audit/manifest.json`, the ingest pipeline's own index. */
export interface ManifestEntry {
  docKey: string;
  provider: string;
  accountNo: string | null;
  owner: string | null;
  ownerId: string | null;
  familyGroup: string | null;
  strategy: string | null;
  asOf: string | null;
  reportType: string;
  sourcePath: string;
  pages: number;
  status: "ok" | "partial" | "failed" | "encrypted";
  warnings: number;
  fileKey: string;
  label: string;
  fy: string;
  sheets?: { key: string; name: string; rows: number; cols: number }[];
}

/** One document inside a provider folder, flattened for display. */
export interface LibraryDoc {
  fileKey: string;
  reportType: string;
  reportLabel: string;
  owner: string | null;
  accountNo: string | null;
  asOf: string | null;
  /** Upper-cased source extension — PDF, XLSX, XLS, CSV. */
  format: string;
  /**
   * The manifest's status, with one display distinction: a source the pipeline
   * READ PERFECTLY and holds out by decision (the family's review and register,
   * filed under a "… (not a statement)" provider) is `held-out`. The archive
   * keeps it `failed` — build-book, the reconcile and source-coverage all key on
   * that — but on this page "Failed" would say it could not be read.
   */
  status: ManifestEntry["status"] | "held-out";
  warnings: number;
  /** Where this file arrived — the delivery folder or archive it came in. */
  delivery: string;
  /** The original filename the client sent, for provenance on hover. */
  fileName: string;
  /** True when the Data Audit viewer can open this document's sheets. */
  hasSheets: boolean;
}

/** A count of documents of one report type, for the folder's "what it holds" line. */
export interface ReportTypeTally {
  type: string;
  label: string;
  count: number;
}

/** Everything one provider has sent — one folder in the library. */
export interface ProviderFolder {
  provider: string;
  docCount: number;
  /** Distinct source formats present, e.g. ["PDF", "XLSX"]. */
  formats: string[];
  /** The report types this provider sends, each with its count — the "type" statement. */
  reportTypes: ReportTypeTally[];
  owners: string[];
  accounts: string[];
  asOfFrom: string | null;
  asOfTo: string | null;
  status: Record<LibraryDoc["status"], number>;
  docs: LibraryDoc[];
}

export interface LibraryIndex {
  folders: ProviderFolder[];
  totalDocs: number;
  totalProviders: number;
  formats: string[];
  deliveries: string[];
}

/**
 * Report-type slug → human words. Presentation furniture, like the icon maps and
 * sector tables CLAUDE.md excepts from "nothing hardcoded that isn't derived".
 * A slug not listed here is title-cased by `reportLabel` rather than dropped.
 */
const REPORT_LABELS: Record<string, string> = {
  holdings: "Holding statement",
  "transaction-statement": "Transaction statement",
  "demat-transactions": "Demat transactions",
  "demat-statement": "Demat statement",
  "capital-gain": "Capital gains",
  "capital-register": "Capital register",
  "dividend-statement": "Dividend statement",
  "fact-sheet": "Fact sheet",
  appraisal: "Appraisal",
  "bank-book": "Bank book",
  "performance-summary": "Performance summary",
  "performance-history": "Performance history",
  "performance-benchmark": "Benchmark comparison",
  "corporate-benefits": "Corporate benefits",
  "expense-statement": "Expense statement",
  "investor-report": "Investor report",
  "income-expense": "Income & expense",
  "profit-and-loss": "Profit & loss",
  "portfolio-snap": "Portfolio snapshot",
  "scheme-portfolio": "Scheme portfolio disclosure",
  "distribution-notice": "Distribution notice",
  "statement-of-earnings": "Statement of earnings",
  "payment-advice": "Payment advice",
  "performance-by-security": "Performance by security",
  "trial-balance": "Trial balance",
  "open-lots": "Open lots",
  unknown: "Unclassified",
};

const titleCase = (slug: string): string =>
  slug.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

/** The human name for a report-type slug — mapped, or title-cased as a fallback. */
export function reportLabel(type: string): string {
  return REPORT_LABELS[type] ?? titleCase(type);
}

/** The source file's extension, upper-cased (PDF, XLSX, …) or "—" when none. */
function formatOf(sourcePath: string): string {
  const base = sourcePath.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "—";
  return base.slice(dot + 1).toUpperCase();
}

/**
 * Where a file arrived — the delivery folder or archive the client sent it in.
 * The inventory expands every archive under `source/_extracted/<delivery>/…`, so
 * the first segment after `_extracted` names the delivery. A file that was not
 * zipped keeps its own path: one inside a dated drop folder (`source/
 * september-2026/…`) names that folder; one sitting directly in `source/` came
 * in the original drop.
 */
function deliveryOf(sourcePath: string): string {
  const rest = sourcePath.replace(/^source\//, "");
  const segments = rest.split("/");
  if (segments[0] === "_extracted") return segments[1] ?? "(unknown delivery)";
  if (segments.length > 1) return segments[0];
  return "(initial drop)";
}

const basenameOf = (sourcePath: string): string => sourcePath.split("/").pop() ?? sourcePath;

/** A provider the pipeline files a non-statement under — see `sortKey`. */
const isNotAStatement = (provider: string): boolean => provider.toLowerCase().includes("not a statement");

/** The status a document shows — see `LibraryDoc.status`. */
function displayStatus(e: ManifestEntry): LibraryDoc["status"] {
  return e.status === "failed" && isNotAStatement(e.provider ?? "") ? "held-out" : e.status;
}

/** A provider name sorts after real statements when it is a bracketed placeholder. */
function sortKey(provider: string): string {
  const lower = provider.toLowerCase();
  // "(unidentified)" and "… (not a statement)" belong at the end of the list,
  // after every provider that actually issues statements.
  const demoted = lower.startsWith("(") || isNotAStatement(lower);
  return `${demoted ? "1" : "0"}${lower}`;
}

/**
 * Group the manifest into one folder per provider. Deterministic: providers are
 * ordered alphabetically (placeholders last), documents inside each by date
 * then report type, so the same manifest always renders the same library.
 */
export function buildLibrary(manifest: readonly ManifestEntry[]): LibraryIndex {
  const byProvider = new Map<string, LibraryDoc[]>();
  const allFormats = new Set<string>();
  const allDeliveries = new Set<string>();

  for (const e of manifest) {
    const provider = e.provider || "(unidentified)";
    const doc: LibraryDoc = {
      fileKey: e.fileKey,
      reportType: e.reportType,
      reportLabel: reportLabel(e.reportType),
      owner: e.familyGroup || e.owner || null,
      accountNo: e.accountNo || null,
      asOf: e.asOf || null,
      format: formatOf(e.sourcePath),
      status: displayStatus(e),
      warnings: e.warnings ?? 0,
      delivery: deliveryOf(e.sourcePath),
      fileName: basenameOf(e.sourcePath),
      hasSheets: Array.isArray(e.sheets) && e.sheets.length > 0,
    };
    allFormats.add(doc.format);
    allDeliveries.add(doc.delivery);
    const list = byProvider.get(provider);
    if (list) list.push(doc);
    else byProvider.set(provider, [doc]);
  }

  const folders: ProviderFolder[] = [];
  for (const [provider, docs] of byProvider) {
    docs.sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? "") || a.reportLabel.localeCompare(b.reportLabel));

    const typeCounts = new Map<string, number>();
    const formats = new Set<string>();
    const owners = new Set<string>();
    const accounts = new Set<string>();
    const status = { ok: 0, partial: 0, failed: 0, encrypted: 0, "held-out": 0 };
    let asOfFrom: string | null = null;
    let asOfTo: string | null = null;

    for (const d of docs) {
      typeCounts.set(d.reportType, (typeCounts.get(d.reportType) ?? 0) + 1);
      formats.add(d.format);
      if (d.owner) owners.add(d.owner);
      if (d.accountNo) accounts.add(d.accountNo);
      status[d.status] += 1;
      if (d.asOf) {
        if (asOfFrom == null || d.asOf < asOfFrom) asOfFrom = d.asOf;
        if (asOfTo == null || d.asOf > asOfTo) asOfTo = d.asOf;
      }
    }

    const reportTypes = [...typeCounts.entries()]
      .map(([type, count]) => ({ type, label: reportLabel(type), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    folders.push({
      provider,
      docCount: docs.length,
      formats: [...formats].sort(),
      reportTypes,
      owners: [...owners].sort(),
      accounts: [...accounts].sort(),
      asOfFrom,
      asOfTo,
      status,
      docs,
    });
  }

  folders.sort((a, b) => sortKey(a.provider).localeCompare(sortKey(b.provider)));

  return {
    folders,
    totalDocs: manifest.length,
    totalProviders: folders.length,
    formats: [...allFormats].sort(),
    deliveries: [...allDeliveries].sort(),
  };
}
