import "server-only";
import { db } from "@/lib/db";
import { snapshotChapter, type SnapshotData } from "./drafts";

/** How the read of a manuscript stands right now, in the form kept for draft comparisons. */
export async function currentSnapshot(manuscriptId: string): Promise<SnapshotData | null> {
  const ms = await db.manuscript.findUnique({
    where: { id: manuscriptId },
    select: {
      draft: true,
      wordCount: true,
      report: { select: { status: true, content: true } },
      _count: { select: { facts: true } },
      chapters: {
        orderBy: { index: "asc" },
        select: {
          id: true,
          index: true,
          title: true,
          wordCount: true,
          contentUpdatedAt: true,
          review: {
            select: {
              status: true,
              readAt: true,
              updatedAt: true,
              engagement: true,
              confusion: true,
              revisionCheck: true,
              notes: {
                where: { kind: "ISSUE" },
                orderBy: { startOffset: "asc" },
                select: { kind: true, category: true, severity: true, quote: true, comment: true, status: true },
              },
            },
          },
        },
      },
    },
  });
  if (!ms) return null;
  const unanswered = await db.readerThread.count({ where: { manuscriptId, kind: "QUESTION", outcome: "OPEN" } });
  const report = ms.report?.status === "DONE" ? (ms.report.content as { headline?: string } | null) : null;
  return {
    version: 1,
    draft: ms.draft,
    wordCount: ms.wordCount,
    chapters: ms.chapters.map(snapshotChapter),
    facts: ms._count.facts,
    unanswered,
    headline: report?.headline ?? null,
  };
}

/**
 * The write that keeps how the read stands before it's replaced (a revised draft coming in, or
 * a fresh read starting over), to run in the same transaction as the change itself so a failed
 * change never leaves a snapshot behind. Null when nothing has been read yet.
 */
export async function snapshotWrite(manuscriptId: string, reason: "reimport" | "fresh_read") {
  const data = await currentSnapshot(manuscriptId);
  if (!data || !data.chapters.some((c) => c.read || c.stale)) return null;
  // Wrapped: a Prisma query runs as soon as it's awaited, and returning it from an async
  // function would await it here, outside the caller's transaction.
  return { op: db.draftSnapshot.create({ data: { manuscriptId, draft: data.draft, reason, data } }) };
}
