/**
 * Draft-over-draft comparison. When a revised draft replaces the current one (or a fresh read
 * starts over), the state of the read is kept as a snapshot. Comparing a snapshot with how the
 * read stands now shows what the revision did: engagement per chapter, which problems went away
 * and which are new, and which continuity errors were fixed or introduced.
 *
 * Chapter ids survive a re-import (see reimportDraft), so chapters are matched by id.
 * Pure functions only, so they run in tests.
 */

export type SnapshotIssue = { quote: string; comment: string; category: string; severity: number; status: string };

export type SnapshotChapter = {
  chapterId: string;
  number: number; // 1-based
  title: string;
  wordCount: number;
  /** A finished read whose text hasn't changed since. */
  read: boolean;
  /** Read, but the text has been edited since (the notes describe an older version). */
  stale: boolean;
  engagement: number | null;
  confusion: number | null;
  issues: SnapshotIssue[]; // ISSUE notes other than continuity, not dismissed
  continuity: SnapshotIssue[];
  /** The reader's own verdicts on the previous version's issues, from a re-read. */
  verdicts: { fixed: number; partly: number; stillThere: number } | null;
};

export type SnapshotData = {
  version: 1;
  draft: number;
  wordCount: number;
  chapters: SnapshotChapter[];
  facts: number;
  unanswered: number;
  headline: string | null;
};

type ReviewLike = {
  status: string;
  readAt: Date | null;
  updatedAt: Date;
  engagement: number | null;
  confusion: number | null;
  revisionCheck: unknown;
  notes: { kind: string; category: string; severity: number; quote: string; comment: string; status: string }[];
} | null;

export function snapshotChapter(c: {
  id: string;
  index: number;
  title: string;
  wordCount: number;
  contentUpdatedAt: Date;
  review: ReviewLike;
}): SnapshotChapter {
  const r = c.review?.status === "DONE" ? c.review : null;
  const stale = !!r && c.contentUpdatedAt.getTime() > (r.readAt ?? r.updatedAt).getTime();
  const issues = (r?.notes ?? [])
    .filter((n) => n.kind === "ISSUE" && n.status !== "DISMISSED")
    .map((n) => ({ quote: n.quote, comment: n.comment, category: n.category, severity: n.severity, status: n.status }));
  return {
    chapterId: c.id,
    number: c.index + 1,
    title: c.title,
    wordCount: c.wordCount,
    read: !!r && !stale,
    stale,
    engagement: r?.engagement ?? null,
    confusion: r?.confusion ?? null,
    issues: issues.filter((n) => n.category !== "continuity"),
    continuity: issues.filter((n) => n.category === "continuity"),
    verdicts: verdictsOf(r?.revisionCheck),
  };
}

function verdictsOf(check: unknown): SnapshotChapter["verdicts"] {
  const notes = (check as { notes?: { verdict?: string }[] } | null)?.notes;
  if (!Array.isArray(notes) || !notes.length) return null;
  const count = (v: string) => notes.filter((n) => n.verdict === v).length;
  return { fixed: count("fixed"), partly: count("partly"), stillThere: count("still_there") };
}

// ─── Comparison ─────────────────────────────────────────────────

/** Loose key for "the same problem": same kind of note about the same passage, or saying the same thing. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function wordsOf(s: string) {
  return new Set(norm(s).split(" ").filter((w) => w.length > 2));
}

function overlap(a: string, b: string) {
  const A = wordsOf(a);
  const B = wordsOf(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

export function sameIssue(a: SnapshotIssue, b: SnapshotIssue) {
  if (a.category !== b.category) return false;
  const qa = norm(a.quote);
  const qb = norm(b.quote);
  if (qa && qb && (qa.includes(qb) || qb.includes(qa))) return true;
  return overlap(a.quote, b.quote) >= 0.6 || overlap(a.comment, b.comment) >= 0.6;
}

/** Split two lists of issues into gone (only before), kept (both) and new (only after). */
export function diffIssues(before: SnapshotIssue[], after: SnapshotIssue[]) {
  const used = new Set<number>();
  const gone: SnapshotIssue[] = [];
  const kept: SnapshotIssue[] = [];
  for (const b of before) {
    const j = after.findIndex((a, i) => !used.has(i) && sameIssue(b, a));
    if (j >= 0) {
      used.add(j);
      kept.push(after[j]);
    } else gone.push(b);
  }
  const added = after.filter((_, i) => !used.has(i));
  return { gone, kept, added };
}

export type ChapterComparison = {
  key: string;
  number: number | null; // in the current draft
  oldNumber: number | null;
  title: string;
  kind: "same" | "revised" | "new" | "removed" | "firstRead";
  /** Revised but not read again yet: issue changes can't be judged. */
  awaitingRead: boolean;
  engagementBefore: number | null;
  engagementAfter: number | null;
  confusionBefore: number | null;
  confusionAfter: number | null;
  fixed: SnapshotIssue[];
  remaining: SnapshotIssue[];
  introduced: SnapshotIssue[];
  verdicts: SnapshotChapter["verdicts"];
};

export type DraftComparison = {
  chapters: ChapterComparison[];
  totals: {
    engagementBefore: number | null;
    engagementAfter: number | null;
    issuesBefore: number;
    issuesAfter: number;
    fixed: number;
    introduced: number;
    awaitingRead: number;
  };
  continuity: { resolved: (SnapshotIssue & { chapter: number | null })[]; introduced: (SnapshotIssue & { chapter: number | null })[]; still: number };
};

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

/**
 * Compare a snapshot (the earlier draft) with the read as it stands now. A chapter only counts
 * as revised when it was edited after the earlier read, or read again since; chapters whose
 * read is the same one in both just carry over.
 */
export function compareDrafts(before: SnapshotData, after: SnapshotData): DraftComparison {
  const prev = new Map(before.chapters.map((c) => [c.chapterId, c]));
  const seen = new Set<string>();
  const chapters: ChapterComparison[] = [];

  for (const a of after.chapters) {
    const b = prev.get(a.chapterId);
    seen.add(a.chapterId);
    if (!b) {
      chapters.push({
        key: a.chapterId,
        number: a.number,
        oldNumber: null,
        title: a.title,
        kind: "new",
        awaitingRead: !a.read,
        engagementBefore: null,
        engagementAfter: a.read ? a.engagement : null,
        confusionBefore: null,
        confusionAfter: a.read ? a.confusion : null,
        fixed: [],
        remaining: [],
        introduced: a.read ? a.issues : [],
        verdicts: null,
      });
      continue;
    }
    const unchanged =
      !a.stale && a.read === b.read && a.engagement === b.engagement && a.wordCount === b.wordCount && sameList(a.issues, b.issues);
    if (unchanged) {
      chapters.push({
        key: a.chapterId,
        number: a.number,
        oldNumber: b.number,
        title: a.title,
        kind: "same",
        awaitingRead: false,
        engagementBefore: b.engagement,
        engagementAfter: a.engagement,
        confusionBefore: b.confusion,
        confusionAfter: a.confusion,
        fixed: [],
        remaining: a.issues,
        introduced: [],
        verdicts: null,
      });
      continue;
    }
    if (!b.read && !b.stale) {
      // Not read in the earlier draft: nothing to compare against, so nothing counts as new.
      chapters.push({
        key: a.chapterId,
        number: a.number,
        oldNumber: b.number,
        title: a.title,
        kind: "firstRead",
        awaitingRead: !a.read,
        engagementBefore: null,
        engagementAfter: a.read ? a.engagement : null,
        confusionBefore: null,
        confusionAfter: a.read ? a.confusion : null,
        fixed: [],
        remaining: a.read ? a.issues : [],
        introduced: [],
        verdicts: null,
      });
      continue;
    }
    const awaitingRead = !a.read;
    const d = awaitingRead ? { gone: [], kept: b.issues, added: [] } : diffIssues(b.issues, a.issues);
    chapters.push({
      key: a.chapterId,
      number: a.number,
      oldNumber: b.number,
      title: a.title,
      kind: "revised",
      awaitingRead,
      engagementBefore: b.engagement,
      engagementAfter: awaitingRead ? null : a.engagement,
      confusionBefore: b.confusion,
      confusionAfter: awaitingRead ? null : a.confusion,
      // Gone from the new read = fixed, whatever the author marked: the reader is the judge.
      fixed: d.gone,
      remaining: d.kept,
      introduced: d.added,
      verdicts: awaitingRead ? null : a.verdicts,
    });
  }
  for (const b of before.chapters) {
    if (seen.has(b.chapterId)) continue;
    chapters.push({
      key: b.chapterId,
      number: null,
      oldNumber: b.number,
      title: b.title,
      kind: "removed",
      awaitingRead: false,
      engagementBefore: b.engagement,
      engagementAfter: null,
      confusionBefore: b.confusion,
      confusionAfter: null,
      fixed: [],
      remaining: [],
      introduced: [],
      verdicts: null,
    });
  }

  // Continuity across the whole book: a contradiction can move chapters, so match book-wide.
  const contBefore = before.chapters.flatMap((c) => c.continuity.map((i) => ({ ...i, chapter: c.number })));
  const stillThere = new Set(after.chapters.map((c) => c.chapterId));
  const removedNumbers = new Set(before.chapters.filter((c) => !stillThere.has(c.chapterId)).map((c) => c.number));
  // Chapters still awaiting a read keep their earlier continuity notes; don't call those resolved.
  const contAfter = after.chapters.flatMap((c) => {
    const old = prev.get(c.chapterId);
    const list = !c.read && old ? old.continuity : c.continuity;
    return list.map((i) => ({ ...i, chapter: c.number }));
  });
  const used = new Set<number>();
  const resolved: (SnapshotIssue & { chapter: number | null })[] = [];
  for (const b of contBefore) {
    const j = contAfter.findIndex((a, i) => !used.has(i) && sameIssue(b, a));
    if (j >= 0) used.add(j);
    // chapter: null when the chapter it was in was cut from the book.
    else resolved.push({ ...b, chapter: removedNumbers.has(b.chapter ?? -1) ? null : b.chapter });
  }
  const introduced = contAfter.filter((_, i) => !used.has(i));

  const live = chapters.filter((c) => c.kind !== "removed");
  return {
    // Removed chapters sit just before the chapter that now holds their old position.
    chapters: chapters.sort((x, y) => position(x) - position(y)),
    totals: {
      engagementBefore: avg(before.chapters.filter((c) => c.read || c.stale).map((c) => c.engagement)),
      engagementAfter: avg(after.chapters.filter((c) => c.read).map((c) => c.engagement)),
      issuesBefore: before.chapters.reduce((n, c) => n + c.issues.length, 0),
      issuesAfter: after.chapters.reduce((n, c) => n + c.issues.length, 0),
      fixed: live.reduce((n, c) => n + c.fixed.length, 0),
      introduced: live.reduce((n, c) => n + c.introduced.length, 0),
      awaitingRead: live.filter((c) => c.awaitingRead).length,
    },
    continuity: { resolved, introduced, still: used.size },
  };
}

function position(c: ChapterComparison) {
  return c.number ?? (c.oldNumber ?? 0) - 0.5;
}

function sameList(a: SnapshotIssue[], b: SnapshotIssue[]) {
  return a.length === b.length && a.every((x, i) => x.quote === b[i].quote && x.comment === b[i].comment);
}
