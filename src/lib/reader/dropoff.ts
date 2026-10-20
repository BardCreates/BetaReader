/**
 * Reader drop-off map: where in the book a real reader would be likeliest to stop.
 * Pure functions only, so they run in tests.
 */

export type DropoffInput = {
  number: number; // 1-based
  title: string;
  read: boolean;
  engagement: number | null;
  confusion: number | null;
  /** Where attention slipped most (newer reads). */
  drift: { quote: string; reason: string } | null;
  /** For reads from before the drop-off map: the biggest pacing/tension/clarity problem. */
  fallback: { quote: string; reason: string; noteId: string } | null;
};

export type DropoffRow = DropoffInput & {
  /** Fall in engagement from the previous read chapter (positive = it dropped). */
  drop: number | null;
  /** 0–10ish: how likely a reader is to put the book down here. */
  risk: number | null;
  passage: { quote: string; reason: string; noteId?: string } | null;
};

export function dropoffRisk(engagement: number, drop: number | null, confusion: number | null): number {
  const low = 10 - engagement; // 0 (gripping) … 9 (dull)
  const fall = Math.max(0, drop ?? 0);
  const lost = confusion == null ? 0 : Math.max(0, confusion - 3);
  return Math.round((low * 0.6 + fall * 0.8 + lost * 0.5) * 10) / 10;
}

export function buildDropoff(chapters: DropoffInput[]): { rows: DropoffRow[]; hotspots: DropoffRow[] } {
  let prev: number | null = null;
  const rows = chapters.map((c): DropoffRow => {
    if (!c.read || c.engagement == null) return { ...c, drop: null, risk: null, passage: null };
    const drop = prev == null ? null : prev - c.engagement;
    prev = c.engagement;
    return { ...c, drop, risk: dropoffRisk(c.engagement, drop, c.confusion), passage: c.drift ?? c.fallback };
  });
  // Worth flagging: the reader cooled noticeably, was lost, or was barely holding on.
  const hotspots = rows
    .filter((r) => r.risk != null && ((r.engagement ?? 10) <= 6 || (r.drop ?? 0) >= 2 || (r.confusion ?? 0) >= 6))
    .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0) || a.number - b.number)
    .slice(0, 3);
  return { rows, hotspots };
}
