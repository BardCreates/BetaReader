/**
 * Long-form text from the reader (letters, reactions): blank lines become paragraphs with
 * normal spacing, single line breaks stay as line breaks.
 */
export function Prose({ text, className = "" }: { text: string; className?: string }) {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className={`space-y-3.5 font-serif text-[1.02rem] leading-[1.7] ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j, all) => (
            <span key={j}>
              {line}
              {j < all.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
