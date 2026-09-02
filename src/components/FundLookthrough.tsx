import { useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { SearchInput } from "@/components/SearchInput";
import { AbsentSection, AbsentCell, DASH } from "@/components/Absent";
import { usePortfolio } from "@/context/PortfolioContext";
import { fmtDate, fmtNum } from "@/lib/format";
import {
  loadLookthrough, familyValue, disclosedWeight,
  type LookthroughState, type LookthroughHolding,
} from "@/lib/lookthrough";

/**
 * ── WHAT THIS FUND HOLDS ────────────────────────────────────────────────────
 *
 * *"We should also be able to see each holding of every mutual fund."*
 *
 * This is the one thing the book could never answer, and the reason was real:
 * no statement issued to this family names the companies inside a fund. What
 * changed is not the family's paperwork but the SOURCE — a mutual fund scheme
 * publishes its portfolio monthly because SEBI requires it, and
 * `npm run build-lookthrough` commits those disclosures per scheme.
 *
 * SO THIS CARD IS THE ONE PLACE ON THE SITE SHOWING FIGURES THAT ARE NOT THE
 * FAMILY'S OWN, and every line of it is written to keep that visible:
 *
 *   • the heading names the AMC's disclosure and the scheme it was matched to,
 *     because a reader who takes these for statement figures would be wrong
 *     about where they came from and about what they can be checked against;
 *   • BOTH dates are printed — the disclosure's and the holding's — since a
 *     monthly portfolio and a statement mark almost never share a date;
 *   • the PLAN is named, with the reason matching across it is legitimate: a
 *     scheme's Direct and Regular plans hold the same portfolio and differ in
 *     expense ratio, and therefore NAV, not in what the fund owns;
 *   • the weight is the AMC's own; the family's exposure beside it is DERIVED
 *     from it and is labelled every time it appears;
 *   • and the footer states plainly that none of it is in any book total,
 *     because the fund's own value already is — adding both would count the
 *     same money twice, which is the failure the whole book is built against.
 */
export function FundLookthrough({ securityKey, name, holdingValue, asOfHolding }: {
  securityKey: string;
  name: string;
  /** What the family's units are worth, for the derived exposure column. */
  holdingValue: number;
  /** The account's own report date — not the book's newest. */
  asOfHolding: string;
}) {
  const { fmtFromBase } = usePortfolio();
  const [state, setState] = useState<LookthroughState>({ status: "loading" });
  const [q, setQ] = useState("");
  const [sleeve, setSleeve] = useState<"equity" | "debt" | "cash" | "misc">("equity");

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    loadLookthrough(securityKey).then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, [securityKey]);

  const money = (n: number) => fmtFromBase(n, { compact: true });

  const rows = useMemo<LookthroughHolding[]>(
    () => (state.status === "ok" ? state.portfolio[sleeve] ?? [] : []),
    [state, sleeve],
  );
  const term = q.trim().toLowerCase();
  const shown = term ? rows.filter((r) => r.name.toLowerCase().includes(term)) : rows;

  if (state.status === "loading") {
    return (
      <Card className="mt-5" title="What this fund holds">
        <p className="text-[12.5px] text-slate-500">Reading the scheme's disclosed portfolio…</p>
      </Card>
    );
  }

  // A STORE THAT DID NOT ANSWER IS A FACT ABOUT THE FETCH, worded as one. The
  // company page has been fixed once for telling a reader their session expired
  // over an unreachable archive; a wrong diagnosis is worse than a blank panel.
  if (state.status === "unreachable") {
    return (
      <Card className="mt-5" title="What this fund holds">
        <AbsentSection
          what="The look-through store did not respond"
          needs="This scheme's disclosed portfolio is committed under public/lookthrough/ and is read when the page opens. The request did not come back, so nothing is shown rather than a partial list — reload, and if it persists the store may not have been built for this deployment (npm run build-lookthrough)." />
      </Card>
    );
  }

  if (state.status === "none") {
    return (
      <Card className="mt-5" title="What this fund holds">
        <AbsentSection
          what={`No scheme disclosure resolves for ${name}`}
          needs={`${state.reason ?? "This holding is not matched to a scheme in the look-through store."} A scheme is matched from its ISIN through AMFI's official scheme-name map and then to the disclosure by name; anything that matches nothing, or matches more than one scheme, is left unresolved rather than shown against a nearest guess — the companies listed would be some other fund's. docs/FUND-LOOKTHROUGH.md names every one.`} />
      </Card>
    );
  }

  const { match, portfolio: pf } = state;
  const totalPct = disclosedWeight(pf);
  const sleeves = ([
    ["equity", "Companies", pf.counts.equity],
    ["debt", "Debt", pf.counts.debt],
    ["cash", "Cash & equivalent", pf.counts.cash],
    ["misc", "Other", pf.counts.misc],
  ] as const).filter(([, , n]) => n > 0);

  return (
    <Card className="mt-5"
      title="What this fund holds"
      subtitle={`The scheme's own portfolio as ${match.scheme} disclosed it${pf.asOf ? ` on ${fmtDate(pf.asOf)}` : ""} — the AMC's monthly disclosure, not a statement issued to this family.`}
      right={<Pill tone="info"><span title="Every figure in this card comes from the scheme's published portfolio. Nothing here is in the book's totals — the fund's own value already is.">{fmtNum(pf.counts.equity + pf.counts.debt + pf.counts.cash + pf.counts.misc)} disclosed holdings</span></Pill>}>

      {/* THE TWO DATES AND THE PLAN, ON THE FACE OF THE CARD. A reader
          comparing this against the holding above needs to know the two are
          measured on different days and that the plan differs by cost and not
          by contents. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[11.5px]">
        <Pill>
          <span title="A scheme discloses its portfolio monthly; the family's units are valued on their own statement's date. The two rarely coincide, so both are shown rather than one standing for the other.">
            portfolio {pf.asOf ? fmtDate(pf.asOf) : DASH} · holding {fmtDate(asOfHolding)}
          </span>
        </Pill>
        <Pill>
          <span title="rupeevest lists one entry per scheme. A scheme's Direct and Regular plans hold the SAME portfolio — they differ in expense ratio, and therefore NAV, not in what the fund owns — so matching across the plan changes nothing about the companies below.">
            matched on the {match.plan} plan · same portfolio, different expense ratio
          </span>
        </Pill>
        {pf.classification && <Pill>{pf.classification}</Pill>}
        {pf.fundAumCr != null && (
          <span className="text-slate-500" title="The whole scheme's assets under management, across every investor in it — not this family's holding.">
            scheme AUM ₹{fmtNum(pf.fundAumCr, 1)} Cr
          </span>
        )}
      </div>

      {sleeves.length > 1 && (
        <div className="mb-3 inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-ink-700 bg-ink-800/60 p-0.5">
          {sleeves.map(([key, label, n]) => (
            <button key={key} type="button" onClick={() => setSleeve(key)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                sleeve === key ? "bg-champagne-500 text-ink-950" : "text-slate-400 hover:bg-ink-700/60 hover:text-slate-200"}`}>
              {label} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
      )}

      {rows.length > 30 && (
        <div className="mb-3">
          <SearchInput value={q} onChange={setQ} placeholder="Filter these holdings…" className="w-64"
            suggestions={rows.map((r) => r.name)} />
        </div>
      )}

      {shown.length === 0 ? (
        <AbsentSection
          what={term ? "Nothing matches that filter" : "This sleeve is empty in the disclosure"}
          needs={term
            ? `The scheme discloses ${rows.length} holdings in this sleeve; none contains "${q.trim()}".`
            : "The scheme's disclosure carries no holding under this heading for the month shown."} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full whitespace-nowrap text-sm">
            <thead className="border-b border-ink-700">
              <tr>
                <th className="label-xs px-3 py-2 text-left font-medium">Holding</th>
                <th className="label-xs px-3 py-2 text-right font-medium">
                  <span title="The scheme's own disclosed weight — a share of the FUND, across every investor in it.">% of fund</span>
                </th>
                <th className="label-xs px-3 py-2 text-right font-medium">
                  <span title="DERIVED, not disclosed: this family's holding value times the weight beside it. Nobody published a figure about this family here, and it is in no total on this site.">Your look-through</span>
                </th>
                <th className="label-xs px-3 py-2 text-right font-medium">
                  <span title="Shares the FUND holds across every investor in it — not this family's.">Shares (fund)</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/60">
              {shown.map((h, i) => (
                <tr key={`${h.name}-${i}`} className="hover:bg-ink-700/40">
                  <td className="px-3 py-2 text-slate-200">{h.name}</td>
                  <td className="px-3 py-2 text-right mono text-slate-300">{h.pctAum.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right mono text-slate-400">{money(familyValue(holdingValue, h.pctAum))}</td>
                  <td className="px-3 py-2 text-right mono text-slate-500">
                    {h.shares == null
                      ? <AbsentCell reason="The disclosure reports no share count for this row — debt and cash holdings are published by weight only." />
                      : fmtNum(h.shares)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink-600 font-semibold">
                <td className="px-3 py-2 text-slate-200">
                  {fmtNum(shown.length)} of {fmtNum(rows.length)} shown
                </td>
                <td className="px-3 py-2 text-right mono text-slate-300">
                  {shown.reduce((a, h) => a + h.pctAum, 0).toFixed(2)}%
                </td>
                <td className="px-3 py-2 text-right mono text-slate-300">
                  {money(shown.reduce((a, h) => a + familyValue(holdingValue, h.pctAum), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* THE TWO THINGS A READER MUST NOT INFER FROM THIS TABLE. */}
      <p className="mt-4 text-[11.5px] leading-relaxed text-slate-500">
        <span className="font-medium text-slate-400">None of this is in any total on this site.</span> The fund&rsquo;s
        own value — {money(holdingValue)} — is what the book carries, and it already stands for everything below;
        counting both would count the same money twice. The look-through column is this holding&rsquo;s value times the
        scheme&rsquo;s published weight, so it is an estimate of exposure and not a position the family can sell, and it
        moves with a disclosure the AMC updates monthly.
        {" "}The disclosed weights add to <span className="mono">{totalPct.toFixed(1)}%</span> of the scheme —
        {Math.abs(100 - totalPct) < 0.05
          ? " the whole of it."
          : " the remainder is the fund's own rounding and any sleeve this disclosure does not break out, and it is left as the gap it is rather than spread across the rows above."}
      </p>
    </Card>
  );
}
