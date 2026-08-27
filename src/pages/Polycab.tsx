import { Link } from "react-router-dom";
import { ChevronLeft, Wallet, Layers, Landmark, Coins, User, Shield } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { AbsentValue, AbsentCell, AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtCurrency, fmtNum, fmtDate, displaySecurity } from "@/lib/format";

import { sumOrNull } from "@/lib/analytics";
import { BOOK_POLYCAB, BOOK_ACCOUNTS } from "@/data/glowData";

/**
 * THE RING-FENCED PROMOTER HOLDING, ON ITS OWN PAGE.
 *
 * Polycab India is the family's promoter stock. The ICICI NSDL statement says the
 * account holds it, so it is ingested — refusing a measured holding for being
 * inconveniently large is the fabrication rule run backwards — but the family
 * asked for it OUT of every consolidated total, split, allocation, sector, entity
 * and holdings table, and shown here alone. `build-book.mjs` peels it into
 * `BOOK_POLYCAB` (see RINGFENCED_SECURITY_KEYS); this page is its only reader, and
 * it deliberately reads that export DIRECTLY rather than the portfolio context, so
 * nothing here can leak back into a portfolio figure.
 *
 * Every number on the page is derived from `BOOK_POLYCAB` — none is typed in.
 */
export function Polycab() {
  const { fmtFromBase, convertFromBase, displayCurrency } = usePortfolio();
  const money = (n: number | null | undefined) => fmtFromBase(n, { compact: true });
  const price = (n: number | null | undefined) =>
    typeof n === "number" && Number.isFinite(n) ? fmtCurrency(convertFromBase(n), displayCurrency) : null;

  const accById = new Map(BOOK_ACCOUNTS.map((a) => [a.accountId, a]));
  const rows = BOOK_POLYCAB.map((p) => ({ p, a: accById.get(p.accountId) }));

  /**
   * The holding is one security across (today) one account, and every total here
   * is written to fold a second promoter row in without a rewrite.
   *
   * `sumOrNull`, NOT `sum(… ?? 0)`. `Position.marketValue` is `number` today, so
   * this changes nothing now — but the whole reason these are sums is the row
   * this book does not yet have (see the scan card at the foot of the page), and
   * a value that row's statement did not report must not blend in as zero and
   * quietly shrink the hero figure. That is the one rule this page exists under.
   */
  const mv = sumOrNull(BOOK_POLYCAB.map((p) => p.marketValue));
  const shares = sumOrNull(BOOK_POLYCAB.map((p) => p.quantity));
  // The mark, derived: a depository prints value and units, not a rate, so the
  // per-share figure is value ÷ quantity — and only where both are present.
  const first = rows[0];
  const markPerShare =
    first && typeof first.p.marketValue === "number" && typeof first.p.quantity === "number" && first.p.quantity > 0
      ? first.p.marketValue / first.p.quantity
      : null;
  const asOf = first?.a?.asOf ?? null;
  const holder = first?.a?.owner ?? null;
  const name = first ? displaySecurity(first.p.security) : "Polycab";

  if (!BOOK_POLYCAB.length) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-slate-100">Polycab</h1>
        <AbsentSection
          what="No ring-fenced Polycab holding in this book"
          needs="The promoter stock is folded into the main book — remove or check RINGFENCED_SECURITY_KEYS in build-book.mjs. When it is ring-fenced, it is carried in BOOK_POLYCAB and shown here."
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 text-[12px] text-slate-500">
        <Link to="/monitor" className="text-champagne-400 hover:underline">Portfolio Monitor</Link>
        <span className="mx-1.5">›</span>Polycab
      </div>

      {/* Hero */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/monitor" className="mb-1 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-300">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to holdings
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{name}</h1>
          <div className="mt-1 text-[13px] text-slate-400">
            The family's promoter stock{holder ? <> · held by <span className="font-medium text-slate-300">{holder}</span></> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone="core" icon={<Shield className="h-3 w-3" />}>
              <span title="Promoter stock, ring-fenced out of every consolidated total, allocation and holdings table — the family are Polycab's promoters and track this separately from the managed book.">
                Promoter holding · ring-fenced
              </span>
            </Pill>
            {/*
              NOT `<BasisPill>`, and the reason is the DATE. That component states
              the basis for a CONSOLIDATED figure and dates it `portfolio.asOf` —
              the newest report date across all 49 accounts, 2026-08-13. This page
              carries one holding from one statement struck 2026-03-31, and it is
              not in `portfolio` at all. A pill reading "as of 2026-08-13" over a
              March mark would be wrong by four and a half months, and its
              "N accounts behind" companion would be about accounts this page does
              not show. The basis is stated the same way, on this holding's own
              date, which is the thing BasisPill exists to get right.
            */}
            {asOf && (
              <Pill tone="info">
                <span title="The mark is the value the NSDL depository prints, divided by the units it prints — a depository statement carries no rate column. It is a statement figure as of this date, not a live price: no live quote is applied to this holding anywhere.">
                  STATEMENT · as of {fmtDate(asOf)}
                </span>
              </Pill>
            )}
            {first?.p.isin && <Pill><span className="mono">{first.p.isin}</span></Pill>}
          </div>
        </div>
        <div className="text-right">
          <div className="mono text-2xl font-semibold text-slate-100">{money(mv)}</div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">excluded from portfolio totals</div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Market value"
          value={money(mv)}
          sub={shares === null ? "ring-fenced from the book" : `${fmtNum(shares)} shares · ring-fenced from the book`}
          icon={<Wallet className="h-4 w-4" />}
        />
        <Kpi
          label="Shares held"
          value={shares === null ? <AbsentValue /> : fmtNum(shares)}
          sub={first?.a ? `${first.a.provider} · ${first.a.accountNo}` : "depository holding"}
          icon={<Layers className="h-4 w-4" />}
        />
        <Kpi
          label="Statement mark"
          value={markPerShare === null ? <AbsentValue /> : <span className="mono">{price(markPerShare)}</span>}
          sub={asOf ? `per share · ${fmtDate(asOf)}` : "per share"}
          icon={<Landmark className="h-4 w-4" />}
        />
        <Kpi
          label="Cost basis"
          value={<AbsentValue />}
          sub="a depository reports no acquisition cost"
          icon={<Coins className="h-4 w-4" />}
        />
      </div>

      {/* Why it is on its own page */}
      {/* The holding, as the depository reports it */}
      <Card className="mt-5" pad={false} title="The holding, as the depository reports it" subtitle="Quantity and value are the depository's; the per-share mark is value ÷ units.">
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-sm">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Holder</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Account</th>
                <th className="label-xs px-4 py-2 text-left font-medium">As of</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Shares</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Mark / share</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Market value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {rows.map(({ p, a }) => {
                const rowMark = typeof p.marketValue === "number" && typeof p.quantity === "number" && p.quantity > 0 ? p.marketValue / p.quantity : null;
                return (
                  <tr key={`${p.securityKey}-${p.accountId}`} className="hover:bg-ink-700/40">
                    {/* NOT a link to /stock/<key>. That route is this page — a
                        ring-fenced security redirects back here (see
                        `StockRoute` in App.tsx), because with the holding out of
                        `BOOK_POSITIONS` the company page would render it as
                        fully exited at ₹0. A link that returns the reader to the
                        page they are already on is noise; the security's page IS
                        this one. */}
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-100">{displaySecurity(p.security)}</div>
                      {p.isin && <div className="mono text-[10.5px] text-slate-500">{p.isin}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{a?.owner ?? <AbsentCell reason="no holder on the statement" />}</td>
                    <td className="px-4 py-2.5 text-slate-400">{a ? `${a.provider} · ${a.accountNo}` : <AbsentCell />}</td>
                    <td className="px-4 py-2.5 text-slate-400">{a?.asOf ? fmtDate(a.asOf) : <AbsentCell />}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{typeof p.quantity === "number" ? fmtNum(p.quantity) : <AbsentCell />}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-400">{price(rowMark) ?? <AbsentCell reason="this row reports no quantity, so a per-share mark cannot be derived from its value" />}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-200">
                      {money(p.marketValue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 1 && (
              <tfoot className="border-t-2 border-ink-600 font-semibold">
                <tr>
                  <td className="px-4 py-2.5 text-left text-slate-200" colSpan={4}>Total</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{shares === null ? <AbsentValue /> : fmtNum(shares)}</td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-right mono text-slate-100">{money(mv)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="border-t border-ink-700/60 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
          The mark is the value the NSDL depository prints divided by the units it prints — an NSDL statement has no rate
          column{asOf ? <> — so it is a {fmtDate(asOf)} statement figure, not a live quote</> : ""}. Cost is absent because a
          depository holds the shares; it did not buy them.
        </div>
      </Card>

      {/*
        THE SECOND PROMOTER STATEMENT IS NOT MENTIONED HERE, BY REQUEST.

        A second family member's promoter shares sit on an HDFC Bank NSDL
        statement (DP IN301151, business date 10 Jun 2026) that arrived as a
        SCAN — four JPEG pages, zero font objects, so pdfjs returns no text and
        `extract.mjs` reports `no-text-layer`. That was measured, not assumed,
        and it is recorded where a reader looking for it will find it:
        `docs/EXTRACTION-REPORT.md` and the `august-2026-e` section of CLAUDE.md.

        This page carried a card naming that absence. The family asked for it to
        go, so the page now shows the promoter holding this book can actually
        read and says nothing about the rest. The statement is still in
        `source/`, still unread, and still needs a text PDF from the bank — not
        OCR, whose figures could not be traced to what the document printed.
      */}
    </div>
  );
}
