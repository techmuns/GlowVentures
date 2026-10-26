const cell = v => String(v ?? '—').replaceAll('|','/').replaceAll('\n',' ');

export function returnCoverageReport(book, docs) {
  const records = book.accountReturnRecords;
  const parts = Object.values(records).filter(c => c.record);
  const lines = ['# Return source coverage', '',
    `${parts.length} of ${book.accounts.length} accounts have verified opening values, dated external capital and a closing valuation.`, '',
    'Each account ends at its own verified valuation date. The consolidated return must not include an uncovered account’s closing value without its opening stake and cash history.', '',
    'Latest delivery: two Helios Mutual Fund account statements dated 26 October 2026 (folios 10355977 and 10056128), under `source/october-2026-d/`. Before it, the September statements received from Glow on 9–13 October 2026, under `source/october-2026-c/`. Original PDFs/ZIPs remain private.', '',
    'Historical opening NAVs come from AMFI’s [31 March 2026 published file](https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=31-Mar-2026&todt=31-Mar-2026), joined by exact ISIN. 3P’s opening uses its own 31 March reclassification NAV and reconciled unit balance. These values only establish return openings; they do not alter current statement holdings.', '',
    '| Manager | Account | Holder | Latest received source | Verified return through | Remaining input |',
    '| --- | --- | --- | --- | --- | --- |'];
  const gaps = [];
  for (const a of book.accounts) {
    const c = records[a.accountId];
    const received = docs.filter(d => d.provider === a.provider && d.accountNo === a.accountNo && !d.excludedFromBook);
    const date = received.map(d => d.periodTo ?? d.asOf).filter(Boolean).sort().at(-1);
    let reason = c?.notApplicable ?? c?.gap ?? (!c?.record ? 'Opening valuation and complete dated external capital are missing' : 'Complete through the selected date');
    if (a.noPositionsReason && !c?.record && !c?.notApplicable) reason = a.noPositionsReason;
    lines.push(`| ${[a.provider,a.accountNo,a.owner,date,c?.record?.asOf,reason].map(cell).join(' | ')} |`);
    if (!c?.notApplicable && (!c?.record || c.gap)) gaps.push({ accountId:a.accountId, provider:a.provider, accountNo:a.accountNo, owner:a.owner,
      latestReceived:date ?? null, returnThrough:c?.record?.asOf ?? null, missing:reason });
  }
  lines.push('', '## Follow-up records needed', '',
    'For every unresolved investment account, request its opening portfolio value as of 1 April 2026 (or 31 March closing NAV with units), all dated investor contributions, withdrawals, in-kind transfers and distributions through the latest closing valuation, and that closing valuation. Manager security trades and internal class switches are not external capital.', '',
    'For consolidated-review/custody accounts, request the underlying investment statements and identify which custody rows duplicate those investments before calculating a family return. Unvalued funds need an actual manager NAV; cost is not a substitute.', '',
    'The LKP Excel attachments in this email are mail-server removal notices, not workbooks. Request the original exports. Any failed or unsupported reports are retained and listed in `EXTRACTION-REPORT.md`; receiving a newer file alone does not establish completeness.', '');
  return { markdown:lines.join('\n'), gaps };
}
