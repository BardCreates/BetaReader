/**
 * Picking the passages a character appears in, for grounding character chat.
 * Pure functions (no database or network) so they can be unit-tested.
 */

export type ChapterText = { index: number; title: string; content: string };

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Names to search for: the full name, each alias, and each part of the full name that looks like a name. */
export function searchTerms(name: string, aliases: string[]): string[] {
  const parts = name
    .split(/\s+/)
    .filter((p) => p.length >= 3 && /^\p{Lu}/u.test(p) && !/^(Mr|Mrs|Ms|Dr|Sir|Lady|Lord|The)\.?$/i.test(p));
  return [...new Set([name, ...aliases, ...parts].map((t) => t.trim()).filter((t) => t.length >= 2))];
}

export function mentionRegex(terms: string[]): RegExp {
  // Longest first so "Mara Holt" wins over "Mara"; word boundaries that work with accents.
  const alts = [...terms].sort((a, b) => b.length - a.length).map(escapeRe);
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?![\\p{L}\\p{N}])`, "u");
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Paragraphs that mention the character, with one paragraph of context either side,
 * grouped by chapter. If there's more than `maxWords`, keep an even spread across the
 * book, always including the first and last appearances.
 */
export function characterExcerpts(
  chapters: ChapterText[],
  name: string,
  aliases: string[],
  opts: { asOfChapter?: number | null; maxWords?: number } = {},
): { text: string; mentions: number; chaptersWithMentions: number[] } {
  const maxWords = opts.maxWords ?? 20_000;
  const re = mentionRegex(searchTerms(name, aliases));
  const visible = chapters.filter((c) => !opts.asOfChapter || c.index < opts.asOfChapter);

  type Block = { chapter: number; title: string; text: string; words: number };
  const blocks: Block[] = [];
  let mentions = 0;
  for (const ch of visible) {
    const paras = ch.content.split(/\n\s*\n/);
    const keep = new Set<number>();
    paras.forEach((p, i) => {
      if (re.test(p)) {
        mentions++;
        keep.add(i - 1).add(i).add(i + 1);
      }
    });
    // Merge kept paragraphs into contiguous runs.
    const idx = [...keep].filter((i) => i >= 0 && i < paras.length).sort((a, b) => a - b);
    let run: string[] = [];
    let last = -2;
    const flush = () => {
      if (run.length) {
        const text = run.join("\n\n");
        blocks.push({ chapter: ch.index, title: ch.title, text, words: words(text) });
      }
      run = [];
    };
    for (const i of idx) {
      if (i !== last + 1) flush();
      run.push(paras[i]);
      last = i;
    }
    flush();
  }

  let chosen = blocks;
  const total = blocks.reduce((n, b) => n + b.words, 0);
  if (total > maxWords && blocks.length > 2) {
    // Even spread: always keep first and last, then every k-th block until the budget is used.
    const picked = new Set<number>([0, blocks.length - 1]);
    let budget = maxWords - blocks[0].words - blocks[blocks.length - 1].words;
    const order = spreadOrder(blocks.length);
    for (const i of order) {
      if (picked.has(i)) continue;
      if (blocks[i].words > budget) continue;
      picked.add(i);
      budget -= blocks[i].words;
    }
    chosen = blocks.filter((_, i) => picked.has(i));
  }

  const out: string[] = [];
  let current = -1;
  for (const b of chosen) {
    if (b.chapter !== current) {
      out.push(`## Chapter ${b.chapter + 1}: ${b.title}`);
      current = b.chapter;
    }
    out.push(b.text, "…");
  }
  return { text: out.join("\n\n"), mentions, chaptersWithMentions: [...new Set(blocks.map((b) => b.chapter + 1))] };
}

/** Indices 0..n-1 ordered so that early picks are spread evenly (midpoints first). */
function spreadOrder(n: number): number[] {
  const order: number[] = [];
  const seen = new Set<number>();
  for (let step = n; step >= 1; step = Math.floor(step / 2)) {
    for (let i = Math.floor(step / 2); i < n; i += step) {
      if (!seen.has(i)) {
        seen.add(i);
        order.push(i);
      }
    }
    if (step === 1) break;
  }
  for (let i = 0; i < n; i++) if (!seen.has(i)) order.push(i);
  return order;
}
