/**
 * Locate a quote the AI returned inside the chapter text.
 *
 * Models occasionally change curly quotes to straight ones, collapse whitespace,
 * or trim/extend punctuation. We search progressively looser until we find it.
 */

export type Anchor = { start: number; end: number };

const FOLD: Record<string, string> = {
  "‘": "'", "’": "'", "‛": "'", "′": "'",
  "“": '"', "”": '"', "‟": '"', "″": '"',
  "–": "-", "—": "-", "‒": "-", "−": "-",
  "…": ".", // ellipsis folds to a single "."; "..." collapses below
};

/** Folded text plus a map from each folded index back to the original index. */
function fold(text: string): { s: string; map: number[] } {
  let s = "";
  const map: number[] = [];
  let lastWasSpace = false;
  let dots = 0;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    ch = FOLD[ch] ?? ch;
    if (/\s/.test(ch)) {
      dots = 0;
      if (lastWasSpace) continue;
      ch = " ";
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
      if (ch === ".") {
        dots++;
        if (dots > 1) continue; // "..." -> "."
      } else dots = 0;
    }
    s += ch.toLowerCase();
    map.push(i);
  }
  return { s, map };
}

export function findQuote(text: string, quote: string, hint = 0): Anchor | null {
  const q = quote.trim().replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  if (q.length < 3) return null;

  // 1. Exact match (prefer the occurrence nearest the hint).
  const exact = nearestIndexOf(text, q, hint);
  if (exact >= 0) return { start: exact, end: exact + q.length };

  // 2. Folded match: quotes, dashes, whitespace, case.
  const ft = fold(text);
  const fq = fold(q).s.trim();
  if (!fq) return null;
  let idx = nearestIndexOf(ft.s, fq, hint);
  if (idx >= 0) return mapBack(ft.map, idx, fq.length, text.length);

  // 3. Strip ellipses the model used to elide words: match the first and last fragments.
  const parts = fq.split(/\s*\.\s+|\s+\.\s*/).map((p) => p.trim()).filter((p) => p.length >= 8);
  if (parts.length >= 2) {
    const a = ft.s.indexOf(parts[0]);
    const b = a >= 0 ? ft.s.indexOf(parts[parts.length - 1], a) : -1;
    if (a >= 0 && b >= 0 && b - a < 2000) return mapBack(ft.map, a, b + parts[parts.length - 1].length - a, text.length);
  }

  // 4. Longest leading chunk that still matches (min 20 chars) — better a partial highlight than none.
  for (let len = Math.min(fq.length - 1, 120); len >= 20; len -= 5) {
    idx = ft.s.indexOf(fq.slice(0, len));
    if (idx >= 0) return mapBack(ft.map, idx, len, text.length);
  }
  return null;
}

function nearestIndexOf(hay: string, needle: string, hint: number): number {
  let best = -1;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) break;
    if (best < 0 || Math.abs(i - hint) < Math.abs(best - hint)) best = i;
    from = i + 1;
  }
  return best;
}

function mapBack(map: number[], foldedStart: number, foldedLen: number, textLen: number): Anchor {
  const start = map[foldedStart];
  const lastIdx = foldedStart + foldedLen - 1;
  const end = (map[lastIdx] ?? textLen - 1) + 1;
  return { start, end: Math.min(end, textLen) };
}

/**
 * Split text into segments for rendering highlights. Overlapping anchors are
 * resolved by letting the earlier-starting note win the overlap.
 */
export type Segment = { text: string; noteId: string | null; start: number };

export function segmentText(text: string, anchors: { id: string; start: number; end: number }[]): Segment[] {
  const sorted = anchors
    .filter((a) => a.start >= 0 && a.end > a.start && a.end <= text.length)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Segment[] = [];
  let pos = 0;
  for (const a of sorted) {
    if (a.end <= pos) continue;
    const s = Math.max(a.start, pos);
    if (s > pos) out.push({ text: text.slice(pos, s), noteId: null, start: pos });
    out.push({ text: text.slice(s, a.end), noteId: a.id, start: s });
    pos = a.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), noteId: null, start: pos });
  return out;
}
