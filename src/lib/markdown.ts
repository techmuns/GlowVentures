// A small markdown reader for the research payloads.
//
// This is deliberately not a general markdown library. It handles exactly what
// the two upstreams emit — screener.in's scraped company page and the pandas-style
// pipe tables the estimates endpoint returns — and it does two things a generic
// renderer wouldn't:
//
//   • drops pandas' artefacts (an "Unnamed: 10" header, columns that are empty in
//     every row) so a 10-column estimates table doesn't waste a third of its width
//     on nothing, and
//   • splits the document into titled sections so the caller can order them.
//     screener emits its tables in whatever order it scraped them; a reader wants
//     quarterly results before the shareholding register, not after.

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "table"; head: string[]; rows: string[][]; numeric: boolean[] }
  | { kind: "list"; items: string[] }
  | { kind: "facts"; items: { label: string; value: string }[] }
  | { kind: "para"; text: string };

export type Section = { title: string | null; level: number; blocks: Block[] };

const isDivider = (c: string) => /^:?-{2,}:?$/.test(c) || c === "";
const isRow = (s: string) => {
  const t = s.trim();
  return t.startsWith("|") && t.indexOf("|", 1) > 0;
};
const cells = (s: string) => s.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** Does this cell read as a number? Used for column alignment, nothing else. */
const numericish = (s: string) =>
  s === "" || s === "-" || s === "—" || /^[₹$]?\s*-?[\d,]+(\.\d+)?\s*%?$/.test(s) ||
  /^-?[\d,.]+\s*\([^)]*\)$/.test(s);

function makeTable(rows: string[][]): Block | null {
  if (!rows.length) return null;
  let [head, ...body] = rows;
  if (!body.length) { body = [head]; head = head.map(() => ""); }
  const width = Math.max(head.length, ...body.map((r) => r.length));
  const at = (r: string[], i: number) => (i < r.length ? r[i] : "");

  // Keep a column only if it carries something. The estimates table arrives ten
  // columns wide with two that are blank in every row — pandas' index, exported
  // as "Unnamed: 10", and a "Summary" column the upstream never fills — and on a
  // table this wide that's a third of the space spent on nothing. A "-" is a real
  // value ("no target given") and keeps its column alive; genuinely empty doesn't.
  const keep: number[] = [];
  for (let i = 0; i < width; i++) {
    const header = at(head, i);
    if (body.every((r) => at(r, i) === "")) continue;
    const junkHeader = /^unnamed:?\s*\d*$/i.test(header);
    if (junkHeader && !body.some((r) => at(r, i) !== "" && at(r, i) !== "-")) continue;
    keep.push(i);
  }
  if (!keep.length) return null;

  const outHead = keep.map((i) => at(head, i));
  const outRows = body.map((r) => keep.map((i) => at(r, i)));
  const numeric = keep.map((_, ci) => {
    const vals = outRows.map((r) => r[ci]).filter((v) => v !== "");
    return vals.length > 0 && vals.every(numericish);
  });
  return { kind: "table", head: outHead, rows: outRows, numeric };
}

/**
 * A run of `- **Label**: value` lines — screener's "Stock details" block. Worth
 * recognising because a reader wants those as figures, not as a bullet list.
 */
function asFacts(items: string[]): Block | null {
  const out: { label: string; value: string }[] = [];
  for (const raw of items) {
    const m = raw.match(/^\*\*(.+?)\*\*\s*:\s*(.+)$/) || raw.match(/^(.{1,40}?)\s*:\s*(.+)$/);
    if (!m) return null;
    const value = m[2].trim().replace(/\*\*/g, "");
    if (!value) return null;
    out.push({ label: m[1].trim().replace(/\*\*/g, ""), value });
  }
  return out.length >= 3 ? { kind: "facts", items: out } : null;
}

export function parseMarkdown(src: string): Block[] {
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (isRow(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isRow(lines[i])) {
        const c = cells(lines[i]);
        if (!c.every(isDivider)) rows.push(c);
        i++;
      }
      const t = makeTable(rows);
      if (t) blocks.push(t);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (h) { blocks.push({ kind: "heading", level: h[1].length, text: h[2].replace(/\*\*/g, "") }); i++; continue; }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, "").trim());
        i++;
      }
      blocks.push(asFacts(items) ?? { kind: "list", items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isRow(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^\s*[-*•]\s+/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) blocks.push({ kind: "para", text: para.join(" ") });
    else i++;   // blank line
  }
  return blocks;
}

/** Split a block list at its headings. Anything before the first heading is untitled. */
export function toSections(blocks: Block[]): Section[] {
  const out: Section[] = [];
  let cur: Section = { title: null, level: 0, blocks: [] };
  for (const b of blocks) {
    if (b.kind === "heading") {
      if (cur.blocks.length || cur.title) out.push(cur);
      cur = { title: b.text, level: b.level, blocks: [] };
    } else cur.blocks.push(b);
  }
  if (cur.blocks.length || cur.title) out.push(cur);
  return out.filter((s) => s.title || s.blocks.length);
}

// Reading order for a company page. screener returns its tables in scrape order,
// which puts the shareholding register in the middle of the financials; a reader
// wants the story first (what the company is, what it's worth), then the results
// in statement order, then peers, then the register last.
const RANK: [RegExp, number][] = [
  [/stock\s*detail/i, 100],
  [/^about/i, 110],
  [/^pros/i, 120],
  [/^cons/i, 130],
  [/quarterly\s*result|quarterly/i, 200],
  [/profit\s*(&|and)?\s*loss|p\s*&\s*l\b|income\s*statement/i, 300],
  [/balance\s*sheet/i, 400],
  [/cash\s*flow/i, 420],
  [/^ratio|key\s*ratio/i, 440],
  [/peer/i, 600],
  [/shareholding/i, 900],
];

export function rankSection(title: string | null, level = 2): number {
  if (!title) return 90;               // the preamble, before any heading
  for (const [re, r] of RANK) if (re.test(title)) return r;
  // A lone `#` is the company name, not a data section — it stays at the top
  // instead of being sorted into the middle of the statements.
  return level <= 1 ? 95 : 500;
}

/** Order sections for reading; ties keep their original order. */
export function orderSections(sections: Section[]): Section[] {
  return sections
    .map((s, i) => ({ s, i, r: rankSection(s.title, s.level) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.s);
}

/** Split `**bold**` runs for inline rendering. */
export function inlineParts(text: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.length ? out : [{ text, bold: false }];
}
