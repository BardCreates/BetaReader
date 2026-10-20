/**
 * Chapters from a document's own structure (heading styles), rather than guessing from the
 * text. This is how exports from Dabble come in best: its Word and Markdown exports mark each
 * chapter with a heading, scenes with a separator (or scene-title headings), and put a title
 * page in front. Word and Google Docs files that use heading styles benefit the same way.
 *
 * Rules:
 *  - The shallowest heading level that appears at least twice holds the chapters. A lone
 *    heading above it (the book title) is ignored.
 *  - Headings named "Part …" or "Book …" are part dividers, not chapters: the chapters are
 *    the next level down.
 *  - Headings deeper than the chapter level are scene titles: they become scene breaks.
 *  - Separator paragraphs ("#", "* * *", "~", "◆"…) become scene breaks.
 *  - Anything before the first chapter is kept as an "Opening" section only if it's real
 *    prose (150+ words and not a title page).
 *
 * Pure functions only, so they run in tests.
 */

import { SCENE_BREAK } from "./doc";
import { countWords, type SplitChapter } from "./split";

export type Block = { type: "heading"; level: number; text: string } | { type: "para"; text: string } | { type: "break" };

const PART = /^(part|book)\s+(\d+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;
/** A short paragraph made only of separator marks ("#", "* * *", "~~~", "◆"): a scene break. Quotes, dashes in dialogue and ellipses are not. */
const SEPARATOR = /^(?=.*[^\s])[\s#*~_=+◆◇•·⁂§°❧※✦✧-]{1,15}$/u;

// ─── Readers ────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function inlineText(html: string) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t ]+/g, " "),
  )
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

/** Blocks from the simple HTML mammoth produces for a .docx. */
export function blocksFromHtml(html: string): Block[] {
  const blocks: Block[] = [];
  const re = /<(h[1-6]|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>|<hr\b[^>]*>/gi;
  for (const m of html.matchAll(re)) {
    if (!m[1]) {
      blocks.push({ type: "break" });
      continue;
    }
    const tag = m[1].toLowerCase();
    const text = inlineText(m[2]);
    if (!text) continue;
    if (tag[0] === "h") blocks.push({ type: "heading", level: Number(tag[1]), text: text.replace(/\s+/g, " ") });
    else if (SEPARATOR.test(text)) blocks.push({ type: "break" });
    else blocks.push({ type: "para", text });
  }
  return blocks;
}

/** Blocks from Markdown (Dabble's .md export, or any Markdown manuscript). */
export function blocksFromMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    const text = para.join("\n").trim();
    para = [];
    if (!text) return;
    blocks.push(SEPARATOR.test(text) || /^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(text) ? { type: "break" } : { type: "para", text: stripMarkdown(text) });
  };
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      flush();
      blocks.push({ type: "heading", level: h[1].length, text: stripMarkdown(h[2]).trim() });
    } else if (!line.trim()) flush();
    else para.push(line);
  }
  flush();
  return blocks;
}

/** Drop emphasis and escapes; the app stores plain text. */
function stripMarkdown(s: string) {
  return s
    .replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_](?!\s)(.+?)(?<!\s)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/^>\s?/gm, "");
}

// ─── Chapters ───────────────────────────────────────────────────

/** Looks like a title page: author contact details, a word count, "by …". */
export function looksLikeTitlePage(text: string) {
  return (
    /\b\d{1,3}(,\d{3})+\s+words\b|\b(approx(\.|imately)?|about)\s+[\d,]+\s+words\b/i.test(text) ||
    /\S+@\S+\.\S+/.test(text) ||
    /^by\s+[^\n.!?]{1,60}$/im.test(text)
  );
}

/**
 * Chapters from structured blocks, or null when the document has no usable heading structure
 * (then the caller falls back to splitting the plain text).
 */
export function chaptersFromBlocks(blocks: Block[]): SplitChapter[] | null {
  const headings = blocks.filter((b): b is Extract<Block, { type: "heading" }> => b.type === "heading");
  const levels = [...new Set(headings.map((h) => h.level))].sort((a, b) => a - b);
  const count = (l: number) => headings.filter((h) => h.level === l).length;

  // Words under each heading of a level, up to the next heading at that level or above.
  const avgWords = (l: number) => {
    let total = 0;
    let open = false;
    for (const b of blocks) {
      if (b.type === "heading" && b.level <= l) open = b.level === l;
      else if (open && b.type === "para") total += countWords(b.text);
    }
    return total / Math.max(1, count(l));
  };

  let chapterLevel: number | undefined;
  for (const l of levels) {
    if (count(l) < 2) continue; // a book title
    const named = headings.filter((h) => h.level === l);
    const deeper = levels.find((d) => d > l && count(d) >= 2);
    if (deeper !== undefined) {
      // Parts, not chapters: named "Part …"/"Book …", or a few very long sections each holding
      // several headings (no chapter runs 12,000 words; a part usually does).
      const parts = named.filter((h) => PART.test(h.text)).length;
      if (parts >= 2 && parts >= named.length / 2) continue; // "Part One"… with the odd interlude between
      if (avgWords(l) > 12_000 && count(deeper) >= 2 * count(l)) continue;
    }
    chapterLevel = l;
    break;
  }
  if (chapterLevel === undefined) return null;

  const chapters: SplitChapter[] = [];
  let preamble: string[] = [];
  let current: { title: string; parts: string[] } | null = null;
  const push = (text: string) => (current ? current.parts.push(text) : preamble.push(text));
  const close = () => {
    if (!current) return;
    const content = tidy(current.parts);
    if (countWords(content) > 0) chapters.push({ title: current.title, content, wordCount: countWords(content) });
    current = null;
  };

  let seenHeading = false;
  for (const b of blocks) {
    if (b.type === "heading") {
      const firstHeading = !seenHeading;
      seenHeading = true;
      if (b.level > chapterLevel) {
        push(SCENE_BREAK); // scene title
        continue;
      }
      close();
      if (b.level === chapterLevel && !PART.test(b.text)) {
        current = { title: b.text.slice(0, 200), parts: [] };
      } else if (firstHeading && !chapters.length) {
        // The book title (or a first part divider) at the very top: what follows it until the
        // first chapter is front matter, kept with anything before it.
      } else if (chapters.length || !firstHeading) {
        // A part divider, interlude or epilogue above chapter level: anything under it is part
        // of the book, so keep it, in order, as its own section (empty dividers vanish).
        current = { title: b.text.slice(0, 200), parts: [] };
      }
    } else if (b.type === "break") push(SCENE_BREAK);
    else push(b.text);
  }
  close();
  if (chapters.length < 2) return null;

  // Before the first chapter: a short title page is left out; anything substantial is kept.
  const opening = tidy(preamble);
  if (countWords(opening) >= 150) {
    chapters.unshift({ title: looksLikeTitlePage(opening.slice(0, 1500)) ? "Front matter" : "Opening", content: opening, wordCount: countWords(opening) });
  }
  return chapters;
}

/** Join blocks, keeping scene breaks only between text (never leading, trailing or doubled). */
function tidy(parts: string[]) {
  const out: string[] = [];
  for (const p of parts) {
    if (p === SCENE_BREAK && (!out.length || out.at(-1) === SCENE_BREAK)) continue;
    out.push(p);
  }
  while (out.at(-1) === SCENE_BREAK) out.pop();
  return out.join("\n\n").trim();
}

/** Plain text from blocks, for the text-based splitter when there's no heading structure. */
export function textFromBlocks(blocks: Block[]) {
  return blocks.map((b) => (b.type === "heading" ? b.text : b.type === "break" ? SCENE_BREAK : b.text)).join("\n\n");
}
