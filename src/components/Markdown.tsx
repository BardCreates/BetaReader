import { Fragment } from "react";

/**
 * Minimal, safe markdown for editor replies: paragraphs, headings, bullet and numbered
 * lists, block quotes, **bold**, *italic* / _italic_ and `code`. No raw HTML is rendered.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[0.95rem] leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>)}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>)}
            </ol>
          );
        }
        if (lines.every((l) => l.startsWith(">"))) {
          return (
            <blockquote key={i} className="border-l-2 border-accent/50 pl-4 font-serif italic text-muted">
              {lines.map((l, j) => (
                <Fragment key={j}>
                  {inline(l.replace(/^>\s?/, ""))}
                  {j < lines.length - 1 && <br />}
                </Fragment>
              ))}
            </blockquote>
          );
        }
        const h = block.match(/^(#{1,4})\s+(.*)$/);
        if (h && lines.length === 1) return <p key={i} className="font-serif text-lg font-semibold">{inline(h[2])}</p>;
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {inline(l)}
                {j < lines.length - 1 && <br />}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k++} className="rounded bg-line/60 px-1 text-[0.9em]">{t.slice(1, -1)}</code>);
    else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
