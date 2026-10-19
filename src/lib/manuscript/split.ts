/**
 * Turn a raw manuscript into chapters.
 *
 * Strategy:
 *  1. Normalise line endings and whitespace.
 *  2. Look for heading lines: "Chapter 1", "CHAPTER TWELVE: The Fall", "Prologue",
 *     "Epilogue", "Part One", markdown "# Heading", or "1." / "I." on their own line.
 *  3. If fewer than two headings are found, fall back to ~4,000-word sections split
 *     on paragraph boundaries so long single-file drafts still get read in pieces.
 */

export type SplitChapter = { title: string; content: string; wordCount: number };

const NUMBER_WORDS =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred";

const HEADING_PATTERNS: RegExp[] = [
  // Chapter 1 / Chapter One / Chapter Twenty-Three / Chapter IV, optional ":" / "-" / "." + title
  new RegExp(
    `^(chapter|ch\\.)\\s+(\\d+|[ivxlc]{1,7}|(?:${NUMBER_WORDS})(?:[-\\s](?:${NUMBER_WORDS}))*)\\b\\s*([:.\\-–—]\\s*.*)?$`,
    "i",
  ),
  /^(prologue|epilogue|interlude|afterword|foreword|introduction)\b\s*([:.\-–—]\s*.*)?$/i,
  new RegExp(`^part\\s+(\\d+|[ivxlc]{1,7}|(?:${NUMBER_WORDS}))\\b\\s*([:.\\-–—]\\s*.*)?$`, "i"),
  /^#{1,2}\s+\S.*$/, // markdown H1/H2
];

// "1." "12" "IV." alone on a line — only trusted when it appears several times.
const BARE_NUMBER = /^(\d{1,3}|[IVXLC]{1,7})\.?$/;

export const FALLBACK_SECTION_WORDS = 4000;

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu);
  return m ? m.length : 0;
}

export function normalizeManuscript(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

// "Chapter 3 Ashes" — number followed directly by a capitalised title (checked case-sensitively below).
const CHAPTER_WITH_BARE_TITLE = /^(chapter|ch\.)\s+(\d+|[ivxlc]{1,7})\s+(\S.*)$/i;

function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 120) return false;
  if (HEADING_PATTERNS.some((re) => re.test(t))) return true;
  const m = t.match(CHAPTER_WITH_BARE_TITLE);
  return !!m && /^\p{Lu}/u.test(m[3]) && t.length <= 80 && !/[.!?,;]$/.test(t);
}

function cleanTitle(line: string): string {
  return line.trim().replace(/^#{1,2}\s+/, "").replace(/\s+/g, " ");
}

export function splitIntoChapters(raw: string): SplitChapter[] {
  const text = normalizeManuscript(raw);
  if (!text) return [];
  const lines = text.split("\n");

  let headingIdx = lines.map((l, i) => (isHeading(l) ? i : -1)).filter((i) => i >= 0);

  if (headingIdx.length < 2) {
    const bare = lines
      .map((l, i) => {
        const t = l.trim();
        const blankAround = (lines[i - 1] ?? "").trim() === "" && (lines[i + 1] ?? "").trim() === "";
        return BARE_NUMBER.test(t) && blankAround ? i : -1;
      })
      .filter((i) => i >= 0);
    if (bare.length >= 3) headingIdx = bare;
  }

  if (headingIdx.length < 2) return splitBySize(text);

  const chapters: SplitChapter[] = [];

  // Anything before the first heading (title page, epigraph, opening scene) becomes its own section if substantial.
  const preamble = lines.slice(0, headingIdx[0]).join("\n").trim();
  if (countWords(preamble) >= 150) {
    chapters.push({ title: "Opening", content: preamble, wordCount: countWords(preamble) });
  }

  headingIdx.forEach((start, n) => {
    const end = headingIdx[n + 1] ?? lines.length;
    let title = cleanTitle(lines[start]);
    let bodyStart = start + 1;
    // "Chapter 3" followed by a short subtitle line -> "Chapter 3: The Subtitle"
    const next = lines[bodyStart]?.trim() ?? "";
    const after = lines[bodyStart + 1]?.trim() ?? "";
    if (/^(chapter|ch\.|part)\s/i.test(title) && !/[:.\-–—]/.test(title.replace(/^ch\./i, "")) && next && next.length <= 60 && after === "" && !/[.!?"”]$/.test(next)) {
      title = `${title}: ${next}`;
      bodyStart += 1;
    }
    const content = lines.slice(bodyStart, end).join("\n").trim();
    if (!content) return;
    chapters.push({ title, content, wordCount: countWords(content) });
  });

  return chapters.length ? chapters : splitBySize(text);
}

export function splitBySize(text: string, target = FALLBACK_SECTION_WORDS): SplitChapter[] {
  // Text with single line breaks between paragraphs has no blank lines; fall back to
  // single newlines (and finally sentences) so no "paragraph" is bigger than a section.
  const paragraphs = text.split(/\n\s*\n/).flatMap((p) => {
    if (countWords(p) <= target) return [p];
    const lines = p.split("\n");
    return lines.flatMap((l) => (countWords(l) <= target ? [l] : l.split(/(?<=[.!?…]["”’']?)\s+/)));
  });
  const out: SplitChapter[] = [];
  let buf: string[] = [];
  let words = 0;
  const flush = () => {
    if (!buf.length) return;
    const content = buf.join("\n\n").trim();
    out.push({ title: `Section ${out.length + 1}`, content, wordCount: countWords(content) });
    buf = [];
    words = 0;
  };
  for (const p of paragraphs) {
    const w = countWords(p);
    // Prefer breaking at scene breaks once we're past ~70% of the target.
    const sceneBreak = /^\s*(\*\s*\*\s*\*|#|~+|-{3,})\s*$/.test(p);
    if (sceneBreak && words >= target * 0.7) {
      flush();
      continue;
    }
    buf.push(p);
    words += w;
    if (words >= target) flush();
  }
  flush();
  // Merge a tiny tail into the previous section.
  if (out.length >= 2 && out[out.length - 1].wordCount < target * 0.25) {
    const tail = out.pop()!;
    const prev = out[out.length - 1];
    prev.content += "\n\n" + tail.content;
    prev.wordCount += tail.wordCount;
  }
  return out;
}
