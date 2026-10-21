/** Minimal markdown for note widgets: "# " / "## " headings, "- " bullets, **bold**, blank line = new paragraph. */

export interface Inline {
  text: string;
  bold: boolean;
}

export type NoteBlock =
  | { type: "h1" | "h2"; inline: Inline[] }
  | { type: "p"; lines: Inline[][] }
  | { type: "ul"; items: Inline[][] };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

export function parseNote(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let para: Inline[][] | null = null;
  let list: Inline[][] | null = null;
  const close = () => {
    para = null;
    list = null;
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      close();
    } else if (line.startsWith("## ")) {
      close();
      blocks.push({ type: "h2", inline: parseInline(line.slice(3).trim()) });
    } else if (line.startsWith("# ")) {
      close();
      blocks.push({ type: "h1", inline: parseInline(line.slice(2).trim()) });
    } else if (line.startsWith("- ")) {
      para = null;
      if (!list) {
        list = [];
        blocks.push({ type: "ul", items: list });
      }
      list.push(parseInline(line.slice(2).trim()));
    } else {
      list = null;
      if (!para) {
        para = [];
        blocks.push({ type: "p", lines: para });
      }
      para.push(parseInline(line.trim()));
    }
  }
  return blocks;
}
