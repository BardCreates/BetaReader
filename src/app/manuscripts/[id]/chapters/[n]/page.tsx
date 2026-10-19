import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AutoRefresh } from "@/components/AutoRefresh";
import { db } from "@/lib/db";
import { plainToDoc, type DocNode } from "@/lib/manuscript/doc";
import { MIN_WORDS_TO_READ, isReviewStale, isStale } from "@/lib/reader/pipeline";
import { ChapterWorkspace, type IntentCheck, type RevisionCheck } from "./ChapterWorkspace";

export default async function ChapterPage({ params }: { params: Promise<{ id: string; n: string }> }) {
  const user = await requireUser();
  const { id, n } = await params;
  const index = Number.parseInt(n, 10) - 1;
  if (!Number.isInteger(index) || index < 0) notFound();

  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true, updatedAt: true, _count: { select: { chapters: true } } },
  });
  if (!ms) notFound();
  const chapter = await db.chapter.findUnique({
    where: { manuscriptId_index: { manuscriptId: ms.id, index } },
    include: { review: { include: { notes: { orderBy: [{ startOffset: "asc" }, { createdAt: "asc" }] } } } },
  });
  if (!chapter) notFound();

  const r = chapter.review;
  const reviewBusy = r != null && (r.status === "QUEUED" || r.status === "READING") && !isStale(r.status, r.updatedAt);
  const manuscriptBusy = (ms.status === "QUEUED" || ms.status === "READING") && !isStale(ms.status, ms.updatedAt);

  return (
    <>
      <AutoRefresh active={reviewBusy || manuscriptBusy} />
      <ChapterWorkspace
        // Remount the editor when moving between chapters.
        key={chapter.id}
        manuscriptId={ms.id}
        chapterId={chapter.id}
        index={index}
        total={ms._count.chapters}
        title={chapter.title}
        intent={chapter.intent ?? ""}
        initialDoc={(chapter.doc as DocNode | null) ?? plainToDoc(chapter.content)}
        wordCount={chapter.wordCount}
        stale={isReviewStale(r, chapter.contentUpdatedAt)}
        reviewBusy={reviewBusy}
        manuscriptBusy={manuscriptBusy}
        minWords={MIN_WORDS_TO_READ}
        review={
          r && (r.status === "QUEUED" || r.status === "READING" || r.status === "DONE" || r.status === "ERROR")
            ? {
                status: r.status,
                error: r.error,
                reaction: r.reaction,
                summary: r.summary,
                engagement: r.engagement,
                strengths: (r.strengths as string[] | null) ?? [],
                questions: (r.questions as string[] | null) ?? [],
                predictions: (r.predictions as string[] | null) ?? [],
                intentCheck: (r.intentCheck as IntentCheck | null) ?? null,
                revisionCheck: (r.revisionCheck as RevisionCheck | null) ?? null,
                notes: r.notes.map((note) => ({
                  id: note.id,
                  kind: note.kind,
                  category: note.category,
                  severity: note.severity,
                  quote: note.quote,
                  start: note.startOffset,
                  comment: note.comment,
                  suggestion: note.suggestion,
                  status: note.status,
                })),
              }
            : null
        }
      />
    </>
  );
}
