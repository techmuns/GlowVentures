import { Fragment } from "react";
import { parseMarkdown, toSections, orderSections, inlineParts, type Block, type Section } from "@/lib/markdown";

// Renders the research payloads. Tables become real tables (scrollable, with the
// first column pinned so a row stays identifiable when a 12-quarter statement
// scrolls sideways), and screener's "Stock details" list becomes a row of figures
// rather than bullets.

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((p, i) =>
        p.bold ? <span key={i} className="font-semibold text-slate-200">{p.text}</span> : <Fragment key={i}>{p.text}</Fragment>,
      )}
    </>
  );
}

function Table({ b }: { b: Extract<Block, { kind: "table" }> }) {
  const hasHead = b.head.some((h) => h !== "");
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-ink-700">
      {/* ── AN UPSTREAM DOCUMENT'S OWN TABLE ─────────────────────────────
          Exempt, declared. These are screener.in's rendered financial tables:
          the columns are year-ends in chronological order and the rows are a
          balance sheet or a P&L in the order the statement prints them.
          Sorting the rows would scramble a document this app did not compose,
          and moving a period would break its sequence. Every table this app
          BUILDS is sortable and reorderable; this one is passed through. */}
      <table className="min-w-full text-[12px]"
        data-table-static="an upstream financial document rendered as it was published — its rows are a statement's own line order and its columns are periods in sequence">
        {hasHead && (
          <thead className="bg-ink-800">
            <tr>
              {b.head.map((h, i) => (
                <th key={i}
                  className={`label-xs whitespace-nowrap px-3 py-2 font-medium ${b.numeric[i] ? "text-right" : "text-left"} ${i === 0 ? "sticky left-0 z-10 bg-ink-800" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-ink-700/60">
          {b.rows.map((r, ri) => (
            <tr key={ri} className="group hover:bg-ink-700/40">
              {r.map((c, ci) => (
                <td key={ci}
                  className={`whitespace-nowrap px-3 py-1.5 ${b.numeric[ci] ? "mono text-right text-slate-300" : "text-left text-slate-400"} ${ci === 0 ? "sticky left-0 z-10 bg-ink-800 font-medium text-slate-200 group-even:bg-[var(--row-alt)] group-hover:bg-ink-700" : ""}`}>
                  {c || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** screener's Stock details — market cap, P/E, book value — as figures. */
function Facts({ b }: { b: Extract<Block, { kind: "facts" }> }) {
  return (
    <div className="my-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {b.items.map((f) => (
        <div key={f.label} className="card px-3 py-2.5">
          <div className="label-xs truncate" title={f.label}>{f.label}</div>
          <div className="mono mt-1 text-[15px] font-semibold text-slate-100">{f.value}</div>
        </div>
      ))}
    </div>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "table": return <Table key={i} b={b} />;
          case "facts": return <Facts key={i} b={b} />;
          case "list":
            return (
              <ul key={i} className="my-2 space-y-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2 text-[12.5px] leading-relaxed text-slate-400">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                    <span><Inline text={it} /></span>
                  </li>
                ))}
              </ul>
            );
          case "heading":
            return <div key={i} className="mt-4 text-[13px] font-semibold text-slate-200">{b.text}</div>;
          default:
            return <p key={i} className="my-2 text-[12.5px] leading-relaxed text-slate-400"><Inline text={b.text} /></p>;
        }
      })}
    </>
  );
}

/**
 * @param ordered Re-sort sections into reading order (statements first, the
 *   shareholding register last). Off for payloads that are a single table.
 */
export function Markdown({ text, ordered = false }: { text: string; ordered?: boolean }) {
  const blocks = parseMarkdown(text);
  if (!ordered) return <Blocks blocks={blocks} />;
  const sections: Section[] = orderSections(toSections(blocks));
  return (
    <>
      {sections.map((s, i) => (
        <section key={i} className={i > 0 ? "mt-5 border-t border-dashed border-ink-700/70 pt-4" : ""}>
          {s.title && <h3 className="text-[13.5px] font-semibold text-slate-100">{s.title}</h3>}
          <Blocks blocks={s.blocks} />
        </section>
      ))}
    </>
  );
}
