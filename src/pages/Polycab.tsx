import { Link } from "react-router-dom";
import { ChevronLeft, Wallet, Layers, Landmark, Coins, Users, Shield, Lock, Activity } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { Kpi } from "@/components/Kpi";
import { AbsentValue, AbsentCell, AbsentSection } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtCurrency, fmtNum, fmtDate, fmtPct, displaySecurity } from "@/lib/format";

import { sumOrNull } from "@/lib/analytics";
import { BOOK_POLYCAB, BOOK_ACCOUNTS, BOOK_CORPORATE_ACTIONS } from "@/data/glowData";
import { usePolycabLive, POLYCAB_SOURCES } from "@/lib/polycabLive";

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
 * Every number on the page is derived from `BOOK_POLYCAB`, `BOOK_ACCOUNTS` and
 * `BOOK_CORPORATE_ACTIONS` — none is typed in.
 *
 * ── WHAT THE FAMILY ASKED THIS PAGE TO SHOW, AND WHAT THE SOURCE CARRIES ────
 *
 * The ask was the holding "per demat, per holder, pledges, dividends and
 * splits". Measured against the corpus rather than assumed, three of those five
 * are reported and two are not, and the difference is a fact about the DOCUMENT
 * TYPE rather than about the holding:
 *
 *   per demat  — `INE455K01017` appears in exactly ONE document in the whole
 *                archive: the ICICI Bank NSDL `Statement of Holding`. Every
 *                other file that matches "polycab" matches the family's own
 *                `@polycab.com` EMAIL ADDRESS on a statement about something
 *                else, which is the "a document is not what it MENTIONS" rule
 *                arriving through a mail domain. So the per-demat table is one
 *                row, and it is one row because that is what the archive holds.
 *   per holder — the statement prints `Name AJAY T JAISINGHANI`, which
 *                `shared/owners.mjs` resolves on the registry. The rollup is
 *                written over the accounts, so a second promoter statement folds
 *                in without a rewrite.
 *   pledges    — an NSDL `Statement of Holding` has FIVE columns: ISIN Code,
 *                Scrip Name, Account Description, Balance, Value. There is no
 *                pledge, lock-in, earmark or freeze column anywhere on it. The
 *                CDSL statements elsewhere in this book DO carry that breakdown
 *                (`FREE BAL. | PLEDGED SETUP | PLEDGEE | LOCKIN + FREEZE |
 *                SAFE/PENDING DEMAT | REMAT`, printing a measured 0.000 in each)
 *                — so an unpledged balance is a figure this book knows how to
 *                report, and it is absent here because THIS depository's
 *                statement does not print one. Rendering "nil pledged" from a
 *                statement carrying no pledge column would be a fabricated zero
 *                of exactly the kind a promoter holding is worst to invent.
 *   dividends  — the only report type this account has ever issued is
 *                `holdings`. No dividend statement and no corporate-benefits
 *                report covers it, so `dividendReceived` is null on the row.
 *   splits     — `BOOK_CORPORATE_ACTIONS` is real and populated (bonus, spin
 *                off and distribution rows), and it covers the four accounts
 *                whose providers issue a corporate benefits report. This demat
 *                is not one of them, and no row in it names this security.
 *
 * The last three are therefore read FROM THE BOOK rather than declared in prose:
 * `corporateActions` below filters the real record by this holding's own
 * securityKey, and the card renders whatever it finds. A future drop that brings
 * a Polycab bonus or dividend into the archive fills these rows without a code
 * change; until one does, each says what is missing and which document would
 * carry it.
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
   * this changes nothing now — but the whole reason these are sums is a row this
   * book does not yet have, and a value that row's statement did not report must
   * not blend in as zero and quietly shrink the hero figure. That is the one rule
   * this page exists under.
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

  /**
   * PER HOLDER, ROLLED UP OVER THE DEMATS — and never over the positions.
   *
   * A member holding the promoter stock in two depository accounts is one
   * holder with two demats, and counting rows would report them as two. The
   * demat count is therefore the DISTINCT accountIds behind the rows, which is
   * also why `Set` rather than `rows.length`.
   *
   * NOT deduped, deliberately. `dedupedPositions` is for a CONSOLIDATED figure;
   * a per-owner breakdown must show each statement's row as printed, which is
   * the rule this repo has had wrong in both directions before. It does not bite
   * today — a promoter block reported under two members would be a real fact
   * about their affairs rather than a double count — and getting it right now
   * costs nothing.
   */
  const byHolder = (() => {
    const m = new Map<string, { holder: string; accounts: Set<string>; qty: (number | null)[]; mv: (number | null)[] }>();
    for (const { p, a } of rows) {
      const key = a?.ownerId ?? a?.owner ?? p.accountId;
      const e = m.get(key) ?? { holder: a?.owner ?? "", accounts: new Set<string>(), qty: [], mv: [] };
      e.accounts.add(p.accountId);
      e.qty.push(p.quantity ?? null);
      e.mv.push(p.marketValue ?? null);
      m.set(key, e);
    }
    return [...m.values()]
      .map((e) => ({ holder: e.holder, demats: e.accounts.size, shares: sumOrNull(e.qty), mv: sumOrNull(e.mv) }))
      .sort((x, y) => (y.mv ?? 0) - (x.mv ?? 0));
  })();

  /**
   * DIVIDENDS AND CORPORATE ACTIONS, READ FROM THE BOOK'S OWN RECORDS.
   *
   * `BOOK_CORPORATE_ACTIONS` carries bonus issues, spin-offs and distributions
   * for the accounts whose providers publish a corporate benefits report. It is
   * filtered on this holding's own securityKey rather than by name, because
   * `securityKey` is the book's identity for a security (§1) and a name match
   * would catch the family's `@polycab.com` email domain the same way the
   * classifier once did.
   *
   * The split below is the model's own: a cash dividend is `dividendReceived` on
   * the position and a `distribution` row here; a bonus, split or spin-off
   * changes the SHARE COUNT and never carries an amount, which is why
   * `BOOK_CORPORATE_ACTIONS` exists apart from income and is never summed into
   * it.
   */
  const fencedKeys = new Set(BOOK_POLYCAB.map((p) => p.securityKey));
  const corporateActions = BOOK_CORPORATE_ACTIONS.filter((c) => fencedKeys.has(c.securityKey));
  const cashActions = corporateActions.filter((c) => /dividend|distribution|interest/i.test(c.kind ?? ""));
  /**
   * Everything that is not cash, INCLUDING an event whose kind the report did
   * not name. The negation is deliberate: a row dropped for having an
   * unrecognised kind is a corporate action this page silently hides, and the
   * table below prints each row's own `kind` — rendering `AbsentCell` where the
   * report named none — so nothing here asserts that an unnamed event was a
   * bonus.
   */
  const shareActions = corporateActions.filter((c) => !/dividend|distribution|interest/i.test(c.kind ?? ""));
  /**
   * THE TWO CASH RECORDS ARE NOT ADDED TOGETHER.
   *
   * `dividendReceived` on a position and a cash row in `BOOK_CORPORATE_ACTIONS`
   * can describe the SAME event: the dividend statement and the corporate
   * benefits report both carry cash dividends, which is why the ingest matches
   * them on `(date, security, amount)` and lets the dividend statement win. A
   * page that summed both would re-create the double count the ingest exists to
   * remove — Can Fin Homes read ₹1,12,000 against its own 7,000 × ₹8 exactly
   * once before. So the same precedence is applied here: the position's own
   * figure where it has one, and the corporate-actions total only where it does
   * not. Both are null on this holding today, which is precisely when a
   * double-count is cheapest to prevent and impossible to notice.
   */
  const positionDividends = sumOrNull(BOOK_POLYCAB.map((p) => p.dividendReceived ?? null));
  const dividends = positionDividends ?? sumOrNull(cashActions.map((c) => c.amount ?? null));

  /**
   * ── THE COMPANY-LEVEL RECORD, LIVE ─────────────────────────────────────────
   *
   * Everything above this line is what the family's own STATEMENT reports.
   * Everything below is what POLYCAB THE COMPANY declared and what its promoter
   * group disclosed — refreshed daily by `npm run build-polycab` and, while a
   * session is open, by `/api/polycab`.
   *
   * THE TWO ARE NEVER MIXED, and that is the single most important thing about
   * this wiring. A promoter-GROUP encumbrance of 0% is a real measurement about
   * the group this holding belongs to; it is NOT a statement that this demat's
   * balance is unencumbered, and nothing below is allowed to fill the dashes in
   * the statement card above. They are separate cards for that reason.
   */
  const live = usePolycabLive(shares, asOf);

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
                {/*
                  THE TRAILING CLAUSE HAD TO GO, AND SAYING WHY IS THE POINT.
                  It read "no live quote is applied to this holding anywhere",
                  which was true until this page grew a market price and is now
                  false — the stale-caption failure this file records against
                  FRED, the RBI and the release calendar, arriving in a hover.
                  What survives is the claim that is still exactly true: THIS
                  mark, the one the pill dates, is a statement figure and not a
                  quote. The live price is a separate figure on its own tile with
                  its own basis, and the two are never the same number.
                */}
                <span title="The mark is the value the NSDL depository prints, divided by the units it prints — a depository statement carries no rate column. It is a statement figure as of this date, not a live price; the market price is shown separately and is never substituted for this one.">
                  STATEMENT · as of {fmtDate(asOf)}
                </span>
              </Pill>
            )}
            {first?.p.isin && <Pill><span className="mono">{first.p.isin}</span></Pill>}
            {/*
              THE LIVE BASIS, BESIDE THE STATEMENT ONE RATHER THAN INSTEAD OF IT.
              Three states, never two: still fetching is not the same claim as
              the exchange refusing, and neither is a fact about the holding —
              the defect this repo already paid for on Today's movers.
            */}
            {live.state.status === "loading" ? (
              <Pill><span title="The page is asking the exchange for the current price. The figures on screen are the last settled close until it answers.">LIVE · fetching</span></Pill>
            ) : live.state.status === "live" ? (
              <Pill tone="core" icon={<Activity className="h-3 w-3" />}>
                <span title={`Last traded on BSE, polled every 60s through /api/polycab and checked against the ISIN this book carries. Retrieved ${live.state.retrievedAt}.`}>
                  LIVE · BSE
                </span>
              </Pill>
            ) : (
              <Pill>
                <span title={`The committed daily snapshot is on screen: ${live.state.reason}. It is a real figure with its own date, refreshed each morning by the polycab workflow.`}>
                  LAST CLOSE · stored
                </span>
              </Pill>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="mono text-2xl font-semibold text-slate-100">{money(mv)}</div>
          <div className="mt-0.5 text-[10.5px] text-slate-500">excluded from portfolio totals</div>
          {/*
            THE BLOCK AT THE MARKET'S OWN MARK, under the statement's.
            §6 lets a live price move a market value and nothing else — so this
            is the only figure on the page the feed is allowed to change, and it
            says which mark produced it rather than replacing the book's.
          */}
          {live.markedValue !== null && live.quote && (
            <div className="mt-1.5 border-t border-ink-700/60 pt-1.5">
              <div className="mono text-[13px] font-medium text-slate-300">{money(live.markedValue)}</div>
              <div className="text-[10.5px] text-slate-500">
                at {price(live.quote.ltp)} · {live.live ? "live" : "last close"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="Market value"
          value={money(mv)}
          sub={shares === null ? "ring-fenced from the book" : `${fmtNum(shares)} shares · ring-fenced from the book`}
          icon={<Wallet className="h-4 w-4" />}
        />
        <Kpi
          label="Shares held"
          value={shares === null ? <AbsentValue /> : fmtNum(shares)}
          sub={
            rows.length === 1 && first?.a
              ? `${first.a.provider} · ${first.a.accountNo}`
              : `across ${rows.length} demat accounts`
          }
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
        {/*
          THE MARKET'S OWN PRICE — the one tile on this strip the feed may move.
          `delta` is the day change and is NULL rather than 0 where the exchange
          published no previous close: a `▲ 0.0%` reads as a measured flat day,
          which is the fabricated zero this whole page is careful about, one tile
          along from the cost basis that refuses the same thing.
        */}
        <Kpi
          label="Market price"
          value={live.quote ? <span className="mono">{price(live.quote.ltp)}</span> : <AbsentValue />}
          delta={live.quote?.changePct ?? null}
          sub={
            live.quote
              ? live.live
                ? "live · BSE last traded"
                : "last settled close · BSE"
              : live.state.status === "loading"
                ? "asking the exchange"
                : "no price published for this scrip"
          }
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      {/*
        The holding, per demat account.

        ITS SUBTITLE AND ITS FOOTER PARAGRAPH ARE REMOVED at the family's
        request, and every claim they carried is still on this page — checked
        line by line before either went, which is the only thing that makes a
        removal like this safe:

          · "one row per depository account"      the card's own title, and its
                                                  Depository account column
          · "the per-share mark is value ÷ units" the `STATEMENT · as of` pill's
            (and that an NSDL statement has       hover, above, which states the
            no rate column)                       derivation in those words
          · "a statement figure, not a live       the same hover, and the pill
            quote"                                itself
          · "cost is absent because a depository  the Cost basis tile's own sub,
            holds the shares; it did not buy      which is where the em dash is
            them"

        A hover is weaker than a caption and that is said out loud rather than
        glossed: a reader scanning does not read it. It is where these belong
        anyway — a derivation belongs on the figure it derives, and an absence's
        reason belongs on the tile that renders the dash (`Absent.tsx`'s rule).
      */}
      <Card
        className="mt-5"
        pad={false}
        title="Per demat account"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-sm">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Security</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Holder</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Depository account</th>
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
                    {/* The account's own registry entry, and `providerEngagement`
                        VERBATIM underneath it — that field exists to hold the
                        provider's own wording (§5), and here it is the depository,
                        the DP ID and the account type the statement prints. Shown
                        as issued rather than re-parsed into prose: re-deriving it
                        in the presentation layer is how a fact stops matching the
                        document it came from. */}
                    <td className="px-4 py-2.5 text-slate-400">
                      {a ? (
                        <>
                          <div>{a.provider} · <span className="mono">{a.accountNo}</span></div>
                          {a.providerEngagement && (
                            <div className="text-[10.5px] text-slate-500">{a.providerEngagement}</div>
                          )}
                        </>
                      ) : <AbsentCell reason="this row's account is not in the registry" />}
                    </td>
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
      </Card>

      {/* Per holder */}
      <Card
        className="mt-5"
        pad={false}
        title="Per holder"
        subtitle="The same shares grouped by the family member the statement names, across however many demat accounts each holds them in."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-sm">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Holder</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Demat accounts</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Shares</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Market value</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Share of the block</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {byHolder.map((h) => (
                <tr key={h.holder || "unattributed"} className="hover:bg-ink-700/40">
                  <td className="px-4 py-2.5 font-medium text-slate-100">
                    {h.holder || <AbsentCell reason="the statement for this account names no holder the registry resolves" />}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-slate-400">{fmtNum(h.demats)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-300">{h.shares === null ? <AbsentCell reason="no statement here reports a share count for this holder" /> : fmtNum(h.shares)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{money(h.mv)}</td>
                  {/* The weight is against the RING-FENCED BLOCK, which is what
                      this page is about — never against the portfolio, which
                      this holding is deliberately not part of. Absent where
                      either half is, rather than dividing by a total nobody
                      measured. */}
                  <td className="px-4 py-2.5 text-right mono text-slate-400">
                    {h.mv !== null && mv !== null && mv !== 0
                      ? fmtPct((h.mv / mv) * 100)
                      : <AbsentCell reason="a share of the block needs both this holder's value and the block's own total" />}
                  </td>
                </tr>
              ))}
            </tbody>
            {byHolder.length > 1 && (
              <tfoot className="border-t-2 border-ink-600 font-semibold">
                <tr>
                  <td className="px-4 py-2.5 text-left text-slate-200">Total</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{fmtNum(rows.length)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">{shares === null ? <AbsentValue /> : fmtNum(shares)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-100">{money(mv)}</td>
                  <td className="px-4 py-2.5" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Encumbrances, income and corporate actions */}
      <Card
        className="mt-5"
        pad={false}
        title="Pledges, dividends and corporate actions"
        subtitle="What the statements behind this holding report about it beyond the balance itself — and, where they report nothing, which document would."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">What</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Reported</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Which document carries it</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {/*
                PLEDGED / LOCKED-IN SHARES — absent, and NEVER a nil.

                An NSDL `Statement of Holding` prints ISIN Code, Scrip Name,
                Account Description, Balance and Value, and no encumbrance column
                of any kind. The CDSL statements elsewhere in this book DO print
                one, so a nil pledge is a figure this book can carry and report —
                which is exactly what makes writing one here from a statement
                that has no such column a fabricated zero rather than a harmless
                default. On a promoter block it is also the single most
                consequential zero available to invent.
              */}
              <tr className="hover:bg-ink-700/40">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 font-medium text-slate-100">
                    <Lock className="h-3.5 w-3.5 text-slate-500" /> Pledged, locked-in or earmarked
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right mono text-slate-400">
                  <AbsentCell reason="the NSDL holding statement behind this row prints no pledge, lock-in, earmark or freeze column, so neither an encumbrance nor its absence is reported" />
                </td>
                <td className="px-4 py-2.5 text-[12px] leading-relaxed text-slate-500">
                  A depository holding statement carrying the balance-type breakdown — free, pledged, pledgee, lock-in
                  and freeze — which the CDSL statements in this book print and this NSDL one does not. Not reported is
                  not the same as nil, and this row will not print one.
                </td>
              </tr>

              {/*
                DIVIDENDS — read from the position and from the book's own
                income record, so a future drop fills this row without a code
                change. Null today because the only report type this account has
                ever issued is `holdings`.
              */}
              <tr className="hover:bg-ink-700/40">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 font-medium text-slate-100">
                    <Coins className="h-3.5 w-3.5 text-slate-500" /> Dividends received
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right mono text-slate-200">
                  {dividends === null
                    ? <AbsentCell reason="no dividend statement and no corporate-benefits report covers this demat — its only report type in the archive is the holding statement" />
                    : money(dividends)}
                </td>
                <td className="px-4 py-2.5 text-[12px] leading-relaxed text-slate-500">
                  {dividends === null
                    ? "A dividend statement or corporate-benefits report for this demat. The book carries cash dividends for the accounts whose providers issue one; this depository issues a holding statement and nothing else."
                    : positionDividends !== null
                      ? "The dividend statement's own figure for this holding, which the ingest prefers over the corporate benefits report where both carry the same event."
                      : `${fmtNum(cashActions.length)} cash event(s) in the book's corporate-actions record for this security.`}
                </td>
              </tr>

              {/*
                BONUS, SPLITS AND SPIN-OFFS — the same read, against the record
                that already carries them for four other accounts (a 1:1 bonus, a
                1:5 bonus and a five-way spin-off). None names this security, so
                the row is absent rather than reporting "no action" about a
                document that was never issued.
              */}
              <tr className="hover:bg-ink-700/40">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 font-medium text-slate-100">
                    <Users className="h-3.5 w-3.5 text-slate-500" /> Bonus, splits and spin-offs
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right mono text-slate-200">
                  {shareActions.length === 0
                    ? <AbsentCell reason="no corporate-benefits report covers this demat, so no bonus, split or spin-off is reported for this holding either way" />
                    : fmtNum(shareActions.length)}
                </td>
                <td className="px-4 py-2.5 text-[12px] leading-relaxed text-slate-500">
                  {shareActions.length === 0
                    ? "A corporate-benefits report for this demat. The book already carries bonus issues and spin-offs for the accounts whose providers publish one — this depository is not among them, so an unchanged share count here is unreported rather than confirmed. What the COMPANY has declared is a separate question and is answered below, from the exchange's own record."
                    : "The book's own corporate-actions record, filtered to this security."}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* The real rows, wherever the record has any. Absent today, and this
            renders itself the moment a drop supplies one — which is why the
            record is read rather than the absence being declared in prose. */}
        {shareActions.length > 0 && (
          <div className="overflow-x-auto border-t border-ink-700/60">
            <table className="min-w-full whitespace-nowrap text-sm">
              <thead className="border-b border-ink-700">
                <tr>
                  <th className="label-xs px-4 py-2 text-left font-medium">Ex-date</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Action</th>
                  <th className="label-xs px-4 py-2 text-left font-medium">Entitlement</th>
                  <th className="label-xs px-4 py-2 text-right font-medium">Shares</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700/60">
                {shareActions.map((c, i) => (
                  <tr key={`${c.securityKey}-${c.exDate}-${i}`} className="hover:bg-ink-700/40">
                    <td className="px-4 py-2.5 text-slate-400">{c.exDate ? fmtDate(c.exDate) : <AbsentCell reason="the report carries no ex-date for this event" />}</td>
                    <td className="px-4 py-2.5 text-slate-200">{c.kind ?? <AbsentCell reason="the report does not name the action type" />}</td>
                    <td className="px-4 py-2.5 text-slate-400">{c.entitlement ?? <AbsentCell reason="the report states no entitlement ratio" />}</td>
                    <td className="px-4 py-2.5 text-right mono text-slate-300">{typeof c.quantity === "number" ? fmtNum(c.quantity) : <AbsentCell reason="the report states no share count for this event" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-ink-700/60 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
          These three are absent because of what the document behind this holding IS, not because a feed failed. A
          depository reports the balance it holds and the value it marks it at; encumbrances, income and corporate
          actions come from other statements, and none of them has been issued for this demat in any delivery so far.
        </div>
      </Card>

      {/*
        ════════ WHAT THE COMPANY DECLARED — live, and a different fact ════════

        Everything above is what the family's own STATEMENT reports. Everything
        below is what POLYCAB THE COMPANY declared and what its promoter group
        disclosed to the exchange: public, statutory, dated, and refreshed every
        morning by `npm run build-polycab`.

        THE TWO MUST NEVER BE READ AS ONE, which is why they are separate cards
        rather than filled-in rows above. A promoter-GROUP encumbrance of 0% is a
        real measurement about the group this holding belongs to; it is NOT a
        statement that THIS demat's balance is unencumbered, and letting the
        first fill the second's dash would be the most consequential substitution
        available on this page.

        These cards sit AFTER the statement card deliberately: the sweep slices
        the per-holder table between `SHARE OF THE BLOCK` and `Pledges,
        dividends`, and the statement rows between `WHICH DOCUMENT CARRIES IT`
        and `These three are absent`. Inserting between either pair would break a
        check by moving its boundary rather than by changing a figure.
      */}
      <Card
        className="mt-5"
        pad={false}
        title="What Polycab has declared"
        subtitle={
          live.identity
            ? `The exchange's own corporate-action record for ${live.identity.securityId ?? "this scrip"}, whole since listing.`
            : "The exchange's own corporate-action record."
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-sm" data-polycab-dividends>
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Ex-date</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Action</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Per share</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Record</th>
                <th className="label-xs px-4 py-2 text-left font-medium">Paid</th>
                <th className="label-xs px-4 py-2 text-right font-medium">
                  <span title="This holding's share count times the declared amount per share. DERIVED — the statement reports a balance on one date and this book cannot say what was held on an ex-date either side of it, so this is an entitlement rather than income and is in no total on this page.">
                    On this block · derived
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {live.entitlements.map((e, i) => (
                <tr key={`${e.action.exDate}-${i}`} className="hover:bg-ink-700/40" data-polycab-dividend-row>
                  <td className="px-4 py-2.5 text-slate-300">
                    {e.action.exDate ? fmtDate(e.action.exDate) : <AbsentCell reason="the exchange records no ex-date for this action" />}
                  </td>
                  <td className="px-4 py-2.5 text-slate-200">
                    <span title={e.action.purpose}>{e.action.purpose.replace(/\s*-\s*Rs\.?\s*-?\s*[\d.,]+\s*$/i, "")}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">
                    {e.action.amountPerShare === null
                      ? <AbsentCell reason="the exchange's purpose line states no amount per share for this action" />
                      : price(e.action.amountPerShare)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {e.action.recordDate ? fmtDate(e.action.recordDate) : <AbsentCell reason="the exchange publishes no record date for this action" />}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {e.action.paymentDate ? fmtDate(e.action.paymentDate) : <AbsentCell reason="the exchange's payment-date record covers only its most recent actions" />}
                  </td>
                  {/*
                    THE ENTITLEMENT, AND THE ASSUMPTION IT RESTS ON, ON THE CELL.
                    A snapshot is not a history: the share count is what one
                    statement reported on one date, so an ex-date the statement
                    does not span is marked rather than quietly multiplied.
                  */}
                  <td className="px-4 py-2.5 text-right mono text-slate-300">
                    {e.amount === null
                      ? <AbsentCell reason="an entitlement needs both a declared amount per share and a share count" />
                      : (
                        <span
                          className={e.exDateWithinStatement ? "" : "text-slate-500"}
                          title={
                            e.exDateWithinStatement
                              ? `${fmtNum(shares ?? 0)} shares × ${price(e.action.amountPerShare)} per share, on the balance the statement reports at ${asOf ? fmtDate(asOf) : "its own date"}. Derived, and never a figure for cash received — what actually arrived, and what TDS came off it, is a bank record no exchange can answer.`
                              : `This ex-date falls after the statement date (${asOf ? fmtDate(asOf) : "unknown"}), so the balance held on it is NOT reported by any document in this book. The figure is the declared amount applied to the last reported share count, and nothing here says the shares were still held.`
                          }
                        >
                          {money(e.amount)}{e.exDateWithinStatement ? "" : " *"}
                        </span>
                      )}
                  </td>
                </tr>
              ))}
              {live.entitlements.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-[12px] text-slate-500">
                    <AbsentCell reason="the exchange's corporate-action record could not be read on the last refresh, so no declared action is listed" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/*
          BONUS, SPLIT AND SPIN-OFF — A MEASURED NIL, WHICH IS NOT AN ABSENCE.

          The statement card above says a bonus here is "unreported rather than
          confirmed", and that stays true of the DEMAT. This says something
          stronger and about the COMPANY: the exchange's record is complete from
          listing and carries none. The claim is gated on `actionsComplete`,
          which the builder sets only on a run that actually reached the
          exchange — a truncated fetch and a company that never declared one
          produce the identical empty list, and only the fetch knows which.
        */}
        <div className="border-t border-ink-700/60 px-4 py-3" data-polycab-share-actions>
          {live.shareActions.length > 0 ? (
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-ink-700/60">
                {live.shareActions.map((a, i) => (
                  <tr key={`${a.exDate}-${i}`}>
                    <td className="py-2 pr-4 text-slate-300">{a.exDate ? fmtDate(a.exDate) : <AbsentCell reason="the exchange records no ex-date" />}</td>
                    <td className="py-2 pr-4 capitalize text-slate-200">{a.kind}</td>
                    <td className="py-2 pr-4 text-slate-400">{a.ratio ?? <AbsentCell reason="the exchange's purpose line states no ratio" />}</td>
                    <td className="py-2 text-[12px] text-slate-500">{a.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : live.measuredNil ? (
            <div className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-400">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span>
                <span className="font-medium text-slate-300">No bonus, split or spin-off has ever been declared on this scrip.</span>{" "}
                The exchange's record runs from listing and carries {fmtNum(live.dividends.length)} action{live.dividends.length === 1 ? "" : "s"}, every one a dividend — so this is a
                measured nil rather than a gap in reporting, and the share count above has never been changed by a corporate action.
              </span>
            </div>
          ) : (
            <div className="text-[12px] leading-relaxed text-slate-400">
              <AbsentCell reason="the exchange's corporate-action record could not be fetched whole on the last refresh, so no bonus or split can be reported either way — a truncated record and a company that declared none look identical" />
            </div>
          )}
          {live.unclassified.length > 0 && (
            <div className="mt-2 text-[11px] leading-relaxed text-slate-500">
              {fmtNum(live.unclassified.length)} further action(s) the classifier did not place are counted and listed in{" "}
              <span className="mono">docs/POLYCAB-LIVE.md</span> rather than filed under a kind nothing stated.
            </div>
          )}
        </div>
      </Card>

      {/* ── THE PROMOTER GROUP, AS IT DISCLOSES ITSELF ─────────────────────── */}
      <Card
        className="mt-5"
        pad={false}
        title="Promoter group — holding and encumbrance"
        subtitle="What the promoter group discloses each quarter. This is the GROUP, not this demat."
      >
        <div className="grid gap-4 border-b border-ink-700/60 px-4 py-4 sm:grid-cols-3">
          <div>
            <div className="label-xs text-slate-500">Promoter holding</div>
            <div className="mono mt-1 text-xl font-semibold text-slate-100" data-polycab-holding>
              {live.promoter?.holdingPct == null
                ? <AbsentValue />
                : fmtPct(live.promoter.holdingPct)}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {live.promoter?.holdingPct == null
                ? "the two witnesses disagreed, so neither figure is published"
                : `as disclosed at ${live.promoter.asOf ? fmtDate(live.promoter.asOf) : "the latest quarter"} · ${live.promoter.witnesses} independent source${live.promoter.witnesses === 1 ? "" : "s"}`}
            </div>
          </div>
          <div>
            <div className="label-xs text-slate-500">Promoter pledge</div>
            <div className="mono mt-1 text-xl font-semibold text-slate-100" data-polycab-pledge>
              {live.promoter?.pledgePct == null
                ? <AbsentValue />
                : fmtPct(live.promoter.pledgePct)}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {live.promoter?.pledgePct == null
                ? "no source published an encumbrance figure on the last refresh"
                : `of the promoter group's own shares · ${live.promoter.pledgeSource ?? "one source"}`}
            </div>
          </div>
          <div>
            <div className="label-xs text-slate-500">This demat's balance</div>
            <div className="mono mt-1 text-xl font-semibold text-slate-300"><AbsentValue /></div>
            {/*
              THE WHOLE POINT OF THE CARD, STATED WHERE A READER CANNOT MISS IT.
              A group-level nil is not a statement about this account, and a
              reader who takes it for one has learnt something false about a
              ₹12,000 Cr promoter block. It is a third tile rather than a
              footnote for exactly that reason.
            */}
            <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              the NSDL statement behind this holding prints no pledge, lock-in or freeze column — a group figure is not a
              statement about this account
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-sm" data-polycab-quarters>
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-4 py-2 text-left font-medium">Quarter</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Promoter holding</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Pledged</th>
                <th className="label-xs px-4 py-2 text-right font-medium">Sources</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {live.quarters.map((q) => (
                <tr key={q.asOf} className="hover:bg-ink-700/40" data-polycab-quarter-row>
                  <td className="px-4 py-2.5 text-slate-300">{q.quarter ?? fmtDate(q.asOf)}</td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">
                    {q.holdingPct === null
                      ? <AbsentCell reason="the two witnesses disagreed on this quarter by more than 0.05pp, so neither figure is published" />
                      : fmtPct(q.holdingPct)}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-slate-200">
                    {q.pledgePct === null
                      ? <AbsentCell reason="no source published an encumbrance figure for this quarter" />
                      : fmtPct(q.pledgePct)}
                  </td>
                  <td className="px-4 py-2.5 text-right mono text-slate-500">{q.witnesses}</td>
                </tr>
              ))}
              {live.quarters.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-3">
                    <AbsentCell reason="no promoter disclosure could be read on the last refresh, and none is stored" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-ink-700/60 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500">
          The holding is carried by two independent sources and a quarter where they differ by more than 0.05pp publishes
          neither — a dash here is a refusal, not a gap. The pledge has one source and says so. Everything on this card and
          the one above is refreshed daily and is in no total anywhere in this book.
          {POLYCAB_SOURCES.length > 0 && (
            <>
              {" "}Sources:{" "}
              {POLYCAB_SOURCES.map((s, i) => (
                <span key={s.url}>
                  {i > 0 ? ", " : ""}
                  <a className="text-champagne-400 hover:underline" href={s.url} target="_blank" rel="noreferrer" title={s.carries}>{s.name}</a>
                </span>
              ))}
              . Last refreshed {fmtDate(live.retrievedAt.slice(0, 10))}.
            </>
          )}
        </div>
      </Card>

      {/*
        THE SECOND PROMOTER STATEMENT IS NOT MENTIONED HERE, BY REQUEST.

        A second family member's promoter shares sit on an HDFC Bank NSDL
        statement (DP IN301151, business date 10 Jun 2026) that arrived as a
        SCAN — four JPEG pages, zero font objects, so pdfjs returns no text and
        `extract.mjs` reports it as such. That was measured, not assumed, and it
        is recorded where a reader looking for it will find it:
        `docs/EXTRACTION-REPORT.md` and the `august-2026-e` section of CLAUDE.md.

        This page carried a card naming that absence. The family asked for it to
        go, so the page now shows the promoter holding this book can actually
        read and says nothing about the rest. The statement is still in
        `source/`, still unread, and still needs a text PDF from the bank — not
        OCR, whose figures could not be traced to what the document printed.

        It is also why the per-demat and per-holder tables above are built as
        rollups over a collection rather than as a single hard-coded row: that
        statement, re-sent with a text layer, is a second demat and a second
        holder, and both tables and every total on this page fold it in with no
        code change and no hand-merged row.
      */}
    </div>
  );
}
