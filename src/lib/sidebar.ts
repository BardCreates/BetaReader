import "server-only";
import { db } from "@/lib/db";
import { isReviewStale, isStale } from "@/lib/reader/pipeline";

export type ChapterState = "unread" | "reading" | "read" | "stale" | "error";

export type SidebarManuscript = {
  id: string;
  title: string;
  reading: boolean;
  /** Open continuity problems across the book. */
  continuityIssues: number;
  chapters: { index: number; title: string; wordCount: number; state: ChapterState; engagement: number | null }[];
};

export type SidebarData = {
  manuscript: SidebarManuscript | null;
  manuscripts: { id: string; title: string }[];
};

/** Everything the left menu needs. Returns null if the manuscript isn't the user's. */
export async function getSidebar(userId: string, manuscriptId?: string): Promise<SidebarData | null> {
  const manuscripts = await db.manuscript.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true },
  });
  if (!manuscriptId) return { manuscript: null, manuscripts };

  const ms = await db.manuscript.findFirst({
    where: { id: manuscriptId, userId },
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      chapters: {
        orderBy: { index: "asc" },
        select: {
          index: true,
          title: true,
          wordCount: true,
          contentUpdatedAt: true,
          review: { select: { status: true, engagement: true, readAt: true, updatedAt: true } },
        },
      },
    },
  });
  if (!ms) return null;
  const continuityIssues = await db.note.count({
    where: { category: "continuity", status: "OPEN", review: { chapter: { manuscriptId: ms.id } } },
  });

  const reading = (ms.status === "QUEUED" || ms.status === "READING") && !isStale(ms.status, ms.updatedAt);
  return {
    manuscripts,
    manuscript: {
      id: ms.id,
      title: ms.title,
      reading,
      continuityIssues,
      chapters: ms.chapters.map((c) => {
        const r = c.review;
        let state: ChapterState = "unread";
        if (r?.status === "QUEUED" || r?.status === "READING") state = "reading";
        else if (r?.status === "ERROR") state = "error";
        else if (r?.status === "DONE") state = isReviewStale(r, c.contentUpdatedAt) ? "stale" : "read";
        return { index: c.index, title: c.title, wordCount: c.wordCount, state, engagement: r?.engagement ?? null };
      }),
    },
  };
}
