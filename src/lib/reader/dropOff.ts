/** Where the reader's attention dipped most in a chapter (`ChapterReview.dropOff`). */
export type DropOff = { quote: string; why: string };

export function parseDropOff(value: unknown): DropOff | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return typeof v.quote === "string" && typeof v.why === "string" && v.quote.trim() ? { quote: v.quote, why: v.why } : null;
}

/**
 * The chapters where a reader is most likely to put the book down: the biggest falls in
 * engagement from one chapter to the next, and any chapter at 4/10 or below. Most severe first.
 */
export function dropPoints(chapters: { number: number; engagement: number | null }[], max = 3): { number: number; from: number | null; to: number }[] {
  const out: { number: number; from: number | null; to: number; score: number }[] = [];
  let prev: number | null = null;
  for (const c of chapters) {
    if (c.engagement == null) continue;
    const fall = prev != null ? prev - c.engagement : 0;
    if (fall >= 2 || c.engagement <= 4) out.push({ number: c.number, from: prev, to: c.engagement, score: Math.max(fall, 5 - c.engagement) });
    prev = c.engagement;
  }
  return out
    .sort((a, b) => b.score - a.score || a.number - b.number)
    .slice(0, max)
    .map(({ number, from, to }) => ({ number, from, to }));
}
