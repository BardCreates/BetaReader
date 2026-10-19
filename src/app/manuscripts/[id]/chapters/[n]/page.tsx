import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Card, ghostButtonClass, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { ChapterReader } from "./ChapterReader";

export default async function ChapterPage({ params }: { params: Promise<{ id: string; n: string }> }) {
  const user = await requireUser();
  const { id, n } = await params;
  const index = Number.parseInt(n, 10) - 1;
  if (!Number.isInteger(index) || index < 0) notFound();

  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    select: { id: true, title: true, status: true, _count: { select: { chapters: true } } },
  });
  if (!ms) notFound();
  const chapter = await db.chapter.findUnique({
    where: { manuscriptId_index: { manuscriptId: ms.id, index } },
    include: { review: { include: { notes: { orderBy: [{ startOffset: "asc" }, { createdAt: "asc" }] } } } },
  });
  if (!chapter) notFound();

  const review = chapter.review;
  const busy = review?.status === "QUEUED" || review?.status === "READING";
  const base = `/manuscripts/${ms.id}`;
  const total = ms._count.chapters;

  return (
    <>
      <AutoRefresh active={busy || ms.status === "READING"} />
      <AppHeader
        email={user.email}
        crumbs={[
          { href: base, label: ms.title },
          { href: `${base}/chapters/${index + 1}`, label: `Ch. ${index + 1}` },
        ]}
      />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted">
              Chapter {index + 1} of {total} · {chapter.wordCount.toLocaleString()} words
            </p>
            <h1 className="font-serif text-3xl font-semibold">{chapter.title}</h1>
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <Link href={`${base}/chapters/${index}`} className={ghostButtonClass}>
                ← Previous
              </Link>
            )}
            {index + 1 < total && (
              <Link href={`${base}/chapters/${index + 2}`} className={ghostButtonClass}>
                Next →
              </Link>
            )}
          </div>
        </div>

        {review?.status === "DONE" && (
          <div className="mb-6 grid gap-4 md:grid-cols-[1fr_16rem]">
            <Card>
              <p className="text-xs font-medium uppercase tracking-widest text-accent">The reader’s reaction</p>
              <div className="manuscript mt-2 text-[1rem]">{review.reaction}</div>
            </Card>
            <Card className="space-y-4 text-sm">
              <div>
                <p className="text-muted">Wanted to keep reading</p>
                <p className="font-serif text-3xl font-semibold">
                  {review.engagement}
                  <span className="text-base text-muted">/10</span>
                </p>
              </div>
              <div>
                <p className="text-muted">What I understood happened</p>
                <p className="mt-1">{review.summary}</p>
              </div>
            </Card>
          </div>
        )}
        {review && review.status !== "DONE" && (
          <Card className="mb-6 flex items-center gap-3 text-sm">
            <StatusBadge status={review.status} />
            {review.status === "ERROR" ? <span className="text-accent">{review.error}</span> : <span className="text-muted">The reader is on this chapter now.</span>}
          </Card>
        )}

        <ChapterReader
          manuscriptId={ms.id}
          chapterId={chapter.id}
          content={chapter.content}
          busy={busy}
          strengths={(review?.strengths as string[] | null) ?? []}
          questions={(review?.questions as string[] | null) ?? []}
          predictions={(review?.predictions as string[] | null) ?? []}
          notes={(review?.status === "DONE" ? review.notes : []).map((note) => ({
            id: note.id,
            kind: note.kind,
            category: note.category,
            severity: note.severity,
            quote: note.quote,
            start: note.startOffset,
            end: note.endOffset,
            comment: note.comment,
            suggestion: note.suggestion,
            status: note.status,
          }))}
        />
      </main>
    </>
  );
}
