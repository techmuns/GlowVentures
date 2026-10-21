#!/usr/bin/env python3
"""Parse the FOOS .docx into an ordered, structured outline.

Uses a real XML parser rather than regex: several paragraphs in this document
live inside TEXT BOXES (w:txbxContent), which nests <w:p> inside a run. A
non-greedy regex for <w:p>...</w:p> pairs the outer opening tag with the inner
closing tag and emits raw markup as if it were prose — which is exactly what a
first pass over this file produced.
"""
import json
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SRC = "word/document.xml"


def para_text(p):
    """Visible text of a paragraph.

    - w:del is a TRACKED DELETION and its text is not in the document.
    - w:ins is a tracked insertion and its text IS; this document has many.
    - text inside a nested txbxContent belongs to its own paragraph, which the
      body walk reaches separately, so it is not pulled up into the parent.
    """
    out = []
    for node in p.iter():
        tag = node.tag
        if tag == f"{W}t":
            # Skip if any ancestor is a deletion or a nested text box.
            out.append(node.text or "")
        elif tag == f"{W}tab":
            out.append(" ")
    return "".join(out).strip()


def collect(el, skip_tags):
    """Text of el, skipping subtrees whose tag is in skip_tags."""
    parts = []

    def walk(n):
        if n.tag in skip_tags:
            return
        if n.tag == f"{W}t":
            parts.append(n.text or "")
        elif n.tag == f"{W}tab":
            parts.append(" ")
        for c in n:
            walk(c)

    walk(el)
    return "".join(parts).strip()


def main():
    tree = ET.parse(SRC)
    body = tree.getroot().find(f"{W}body")

    SKIP = {f"{W}delText", f"{W}del", f"{W}txbxContent"}
    items = []

    def emit_para(p, in_textbox=False):
        txt = collect(p, SKIP if not in_textbox else {f"{W}del", f"{W}delText"})
        ppr = p.find(f"{W}pPr")
        style = ""
        ilvl = None
        numid = None
        if ppr is not None:
            ps = ppr.find(f"{W}pStyle")
            if ps is not None:
                style = ps.get(f"{W}val", "")
            npr = ppr.find(f"{W}numPr")
            if npr is not None:
                lv = npr.find(f"{W}ilvl")
                nu = npr.find(f"{W}numId")
                ilvl = lv.get(f"{W}val") if lv is not None else None
                numid = nu.get(f"{W}val") if nu is not None else None
        # Bold-run detection: this document marks most of its structure with
        # bold rather than heading styles.
        bold = False
        runs = p.findall(f"{W}r")
        if runs:
            b = [r.find(f"{W}rPr/{W}b") is not None for r in runs if collect(r, SKIP)]
            bold = bool(b) and all(b)
        if txt:
            items.append({
                "kind": "textbox" if in_textbox else "p",
                "text": txt, "style": style,
                "ilvl": int(ilvl) if ilvl is not None else None,
                "numId": numid, "bold": bold,
            })
        # Any paragraphs nested in a TEXT BOX inside this paragraph.
        #
        # Word writes a floating text box TWICE: once under mc:AlternateContent
        # /mc:Choice (the modern wps: shape) and again under mc:Fallback (a
        # legacy VML copy for old readers). Both carry the same words, so
        # walking every txbxContent emits each text box's content twice — which
        # is why the first parse showed "SOURCES" and its twelve sources listed
        # two times over. Only the Choice branch is read.
        MC = "{http://schemas.openxmlformats.org/markup-compatibility/2006}"
        seen_boxes = []

        def find_boxes(n):
            if n.tag == f"{MC}Fallback":
                return
            if n.tag == f"{W}txbxContent":
                seen_boxes.append(n)
                return
            for c in n:
                find_boxes(c)

        find_boxes(p)
        for tb in seen_boxes:
            for np_ in tb.findall(f"{W}p"):
                emit_para(np_, in_textbox=True)

    def emit_table(tbl):
        rows = []
        for tr in tbl.findall(f"{W}tr"):
            cells = [collect(tc, SKIP) for tc in tr.findall(f"{W}tc")]
            if any(c for c in cells):
                rows.append(cells)
        if rows:
            items.append({"kind": "table", "rows": rows})

    for child in body:
        if child.tag == f"{W}p":
            emit_para(child)
        elif child.tag == f"{W}tbl":
            emit_table(child)

    json.dump(items, open("../foos-outline.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print(f"{len(items)} blocks")
    print(f"  paragraphs : {sum(1 for i in items if i['kind'] == 'p')}")
    print(f"  text boxes : {sum(1 for i in items if i['kind'] == 'textbox')}")
    print(f"  tables     : {sum(1 for i in items if i['kind'] == 'table')}")


if __name__ == "__main__":
    main()
