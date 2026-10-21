# Conventions

<!-- Moved verbatim from CLAUDE.md on 2026-10-15 (lines 3357–3535). CLAUDE.md now carries the condensed rules; this file is the record. -->

## Conventions

These are not style preferences. Each one is here because violating it produced a
figure on screen that was wrong and looked right. **A future session must not
violate any of them.**

### The seven that govern figures

1. **Never fabricate.** If the source carries no number, render `—` with a reason
   through `src/components/Absent.tsx`. Not a zero, not an estimate, not an
   interpolation, not a plausible default.
2. **A measured zero and an absent measurement must never look the same.** Any
   tile, chart, cell or total whose underlying collection is EMPTY renders `—`.
   A *computed* zero is legitimate and stays — but its reason goes in the tile,
   not in a tooltip.
3. **Ingest PRIMITIVES; DERIVE everything else.** Quantity, unit cost, market
   price, accrued income are read. Market value, gain, %gain and %assets are
   computed. A statement's own arithmetic is not internally consistent, and
   ingesting both sides imports the contradiction.
4. **Printed values are a CHECK, never a source.** They live in `printed.*` and
   every delta goes to the reconciliation report classified `rounding`,
   `explained` or `material`. A material delta blocks the golden test.
5. **Never blend a missing value into a total as zero.** Use `sumOrNull`. A
   figure that exists for SOME accounts is shown for those and the rest are
   named — including in the total's own caption.
6. **STATEMENT vs LIVE basis.** Live prices may move market value, day change,
   unrealised P&L and return on cost — and nothing else. Never quantity, cost
   basis, realised gains, dividends, fees or a dated cash flow. Every
   consolidated figure carried a `<BasisPill>` until Stage 10ao, when the family
   asked for it off Morning CIO and off the `/holdings` drill-down, Stage
   10ap, when they asked for it off Private Market too, and Stage 10by, off
   Sector Composition. That last one reads the LIVE book and always has — it
   was never a page a reader checks against a PDF — so what it lost is the
   label and the as-of skew, not a guarantee.

   **THE HALF THAT IS A CORRECTNESS GUARANTEE IS UNCHANGED AND IS NOT
   NEGOTIABLE, and it is the SOURCE rather than the label** — Capital Gains,
   Data Audit, Ledger Insights **and Private Market** all still read
   `statementPortfolio`, because a reader checks those against the PDF and a
   total that drifted with the market could not be checked at all. The first
   three still SAY so; Private Market no longer does, which is weaker and is
   recorded rather than glossed. What makes it cost almost nothing THERE is
   measured, not assumed: no private holding resolves an NSE symbol, so no quote
   could touch those rows even on the live portfolio — and `check:pages` checks
   that premise every run, so a drop that brings a quotable private holding
   fires by name instead of quietly making the reasoning false.

   `check:pages` asserts the three removals AND that the remaining three keep
   their pill, which are separate claims: a build that deleted the component
   everywhere would satisfy every absence and take this with it.
7. **`src/data/glowData.ts` is GENERATED. Never hand-edit it.** It regenerates
   byte-identically from `source/`; an edit is reverted by the next
   `build-book`, and until then the book no longer matches its own archive.

### And five more that have each cost a debugging session

- Identity is `securityKey`, derived from the CLEAN name. If a join fails, fix
  the EXTRACTOR — never re-derive a key in the presentation layer, which hides
  the defect from the reconciler.
- **A consolidated figure counts each `dedupeGroup` ONCE; a per-account or
  per-owner figure does not.** `usePortfolio().consolidated` is the deduped set;
  `portfolio.positions` carries both rows. Getting this backwards fails in both
  directions and both were live in this repo: a raw sum put ₹1.46 Cr into the
  consolidated NAV twice and made an allocation weight read 101.4%, and deduping
  a PER-ACCOUNT breakdown emptied Bharat's 360 ONE row to `0 · ₹0 · ₹0` for an
  account holding ₹1.46 Cr. The helper existed in `analytics.ts` and was wired
  into nothing for as long as no drop contained a duplicate.
- **THE DATA AUDIT DEEP-LINKS ARE GONE — every one of them, at the family's
  request.** A figure used to hyperlink to its source document (`holdingHref`
  built `<accountId>-<asOf>-appraisal`, exactly as `extract.mjs` composes the
  docKey) and a consolidated one to the archive index with its search
  pre-filled. All 42 of those links were removed across 12 pages, along with the
  `to`/`title` props on `<Auditable>`, the "See the source numbers in Data Audit"
  link inside the formula popover, `FormulaDef.auditHref`, and the builders that
  made the URLs (`auditHref`, `AUDIT_INDEX`, `LEDGER`, `ledgerHref`,
  `holdingHref`, `appraisalDocKey`, `privateHref`). They were DELETED rather
  than left exported and uncalled: a builder nothing calls is the
  dead-code-that-looks-alive failure this file keeps naming, and the next
  session would wire it back believing it load-bearing.
  **The FORMULA popovers stay, EXCEPT on Morning CIO** — a dashed figure still
  opens the arithmetic behind it elsewhere in the app, which is an explanation
  rather than a hyperlink. Morning CIO has none left, at the family's request:
  the KPI tiles went in Stage 10y and the allocation table's rows and footer in
  Stage 10ac, and in both cases the arithmetic is rendered on the page the
  figure opens instead. Nothing on that page is underlined. **And the Data
  Audit PAGE is untouched and still in the nav**: only the links pointing INTO
  it were removed, its own document chips are `<button>`s, and the provenance it
  serves is unchanged. A future session that wants a figure traceable again
  should read this paragraph first rather than reinventing `holdingHref`.
- Nothing on screen may be hardcoded that isn't derived from the book. No
  security names, entity names, dates, amounts, document titles or sample rows.
  Icon maps, sector tables and statutory tax rates are the legitimate exceptions.
- **Every new `ink-*`/`slate-*` utility needs a light-mode remap in
  `index.css`** — including each opacity variant, which Tailwind emits as its own
  class. And `divide-*` remaps must mirror Tailwind's
  `> :not([hidden]) ~ :not([hidden])` selector or they lose on specificity and
  silently do nothing. `npm run check:pages` resolves computed colour and catches
  both.
- A failure message must diagnose the ACTUAL failure. "Your session expired" for
  an unreachable archive is worse than a blank panel, because the reader acts
  on it. **The CAUSE picks the headline, and `src/lib/upstreamStatus.ts` is the
  one place that decides which.** A gateway status is a fact about the SERVICE;
  only an empty 200 is a fact about the company. The company page said "No ratio
  table for this company" over an HTTP 522 — a status that means Cloudflare
  reached the hostname and the server behind it never completed a connection —
  so a reader learnt that Reliance publishes no ratios. Measured on the live
  deployment 2026-08-13, with the site's own cache-bypassing control failing
  alongside: `fastapi.muns.io` (quotes, street estimates, `/financials`,
  `ratio_source`, `web-reader`, `market_data`) and `devde.muns.io`
  (`financial_tables`, filings, DRHP) both 522; `birdnest.muns.io`
  (announcements) and `hostapi.muns.io` (news) answering normally. **A partial
  outage across four hosts is why every panel must name its own cause rather
  than the page asserting one for all of them.**
- **And a card that can NEVER be filled must not look like one that is waiting.**
  The company page's Business segments, Operating metrics, Value chain and
  Calendar cards are permanent, decided absences — no wired source publishes
  them for any company — and they render the same dashed `AbsentSection` as a
  panel whose feed is momentarily down. During the outage above that is eight
  empty boxes reading as eight failures. `CompanyResearchPreview` states, once,
  above that group, that those four are absent by decision and not by failure.
  *(Those four cards were removed at the family's request, and
  `CompanyResearchPreview` itself is DELETED since Stage 10cn, when the position
  page became tabs. The decided absence is recorded in `InsiderDeals.tsx`'s
  header, the file its last live table moved into.)*

### Formatting and layout

- All monetary values are INR at the model layer; format with `fmtFromBase`,
  never hard-code currency symbols. Compact suffixes follow the SELECTED
  currency (Cr/L for INR, M/B for USD), not the base. Statutory figures (the
  ₹1.25L LTCG exemption) and the FX rate itself are denominated in rupees by
  definition and correctly do not convert.
- Wide tables scroll inside their own `overflow-x-auto` container. The page body
  must never scroll horizontally at any width.
- **THE DATA AUDIT DEEP-LINKS ARE GONE — every one of them, at the family's
  request.** A figure used to hyperlink to its source document (`holdingHref`
  built `<accountId>-<asOf>-appraisal`, exactly as `extract.mjs` composes the
  docKey) and a consolidated one to the archive index with its search
  pre-filled. All 42 of those links were removed across 12 pages, along with the
  `to`/`title` props on `<Auditable>`, the "See the source numbers in Data Audit"
  link inside the formula popover, `FormulaDef.auditHref`, and the builders that
  made the URLs (`auditHref`, `AUDIT_INDEX`, `LEDGER`, `ledgerHref`,
  `holdingHref`, `appraisalDocKey`, `privateHref`). They were DELETED rather
  than left exported and uncalled: a builder nothing calls is the
  dead-code-that-looks-alive failure this file keeps naming, and the next
  session would wire it back believing it load-bearing.
  **The FORMULA popovers stay, EXCEPT on Morning CIO** — a dashed figure still
  opens the arithmetic behind it elsewhere in the app, which is an explanation
  rather than a hyperlink. Morning CIO has none left, at the family's request:
  the KPI tiles went in Stage 10y and the allocation table's rows and footer in
  Stage 10ac, and in both cases the arithmetic is rendered on the page the
  figure opens instead. Nothing on that page is underlined. **And the Data
  Audit PAGE is untouched and still in the nav**: only the links pointing INTO
  it were removed, its own document chips are `<button>`s, and the provenance it
  serves is unchanged. A future session that wants a figure traceable again
  should read this paragraph first rather than reinventing `holdingHref`.
- Large holdings lists get a `SearchInput` (filter by security name or ISIN).
- Pages that must RECONCILE to a source document read `statementPortfolio`, and
  the three that a reader checks against a PDF carrying quotable rows also SAY so
  with a `<BasisPill statement>` — Capital Gains, Data Audit, Ledger Insights.
  Morning CIO and `/holdings` lost theirs at Stage 10ao, Private Market at
  Stage 10ap and Sector Composition at Stage 10by, all at the family's request; those are the places this file's own
  §6 has been narrowed rather than upheld, and what each costs is recorded there
  rather than softened here. **The source never moved on any of them.**
- An absent figure goes through `src/components/Absent.tsx` with a reason. Never
  type a bare `—` inline, and never let an empty collection reach a formatter.
- **No explainer lines.** *"Why do i need all this garbage written please remove
  its obvious from the table what it is."* No page carries a card subtitle, a
  footnote, a line under a figure or a fold of working under a table. A sentence
  a reader ACTS ON is the hover on the figure it qualifies — `title`, `Card`'s
  `subtitle` (the title's hover now), `StatTile`'s `hint`, `PageHeader`'s
  `subtitle`, `AbsentSection`'s `needs`, `TreeNameCell`'s `hint`, `SortHeader`'s
  `coverage` — and is asserted there. What stays on the face is a figure, a
  count, a status word, a fence ("DERIVED", "in no total") or a guard ("not
  annualised"); a line a reader must SEE says why at the element with
  `data-prose-ok="<reason>"`. Checked on structure by the `prose` probe in
  `check:pages`, on every route, rather than on wording. See Stages 10co and
  10cp.

