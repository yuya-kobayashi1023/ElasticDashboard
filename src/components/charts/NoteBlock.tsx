import { parseNote, type Inline } from "../../core/note";

function Text({ inline }: { inline: Inline[] }) {
  return (
    <>
      {inline.map((t, i) => (t.bold ? <strong key={i}>{t.text}</strong> : <span key={i}>{t.text}</span>))}
    </>
  );
}

/** Free text with minimal markdown. Built as React elements, so nothing typed can inject markup. */
export function NoteBlock({ text }: { text: string }) {
  const blocks = parseNote(text);
  if (blocks.length === 0) return <div className="widget-state">メモが空です</div>;
  return (
    <div className="note">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h1":
            return (
              <h3 key={i} className="note-h1">
                <Text inline={b.inline} />
              </h3>
            );
          case "h2":
            return (
              <h4 key={i} className="note-h2">
                <Text inline={b.inline} />
              </h4>
            );
          case "ul":
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Text inline={it} />
                  </li>
                ))}
              </ul>
            );
          case "p":
            return (
              <p key={i}>
                {b.lines.map((l, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    <Text inline={l} />
                  </span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
