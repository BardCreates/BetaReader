import "server-only";
import type { NoteKind, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { findQuote } from "@/lib/manuscript/anchor";
import { MODEL, callTool } from "./anthropic";
import { bookReportUserPrompt, chapterUserPrompt, readerSystemPrompt, type ManuscriptContext } from "./prompts";
import { BookReportSchema, ChapterFeedbackSchema, bookReportTool, chapterFeedbackTool } from "./schemas";

const KIND: Record<"reaction" | "praise" | "issue", NoteKind> = {
  reaction: "REACTION",
  praise: "PRAISE",
  issue: "ISSUE",
};

/**
 * Claim a manuscript for reading. Returns false if a read is already running,
 * so double-clicks and concurrent requests don't start two readers.
 */
export async function claimManuscript(manuscriptId: string, userId: string): Promise<boolean> {
  const { count } = await db.manuscript.updateMany({
    where: {
      id: manuscriptId,
      userId,
      OR: [
        { status: { notIn: ["QUEUED", "READING"] } },
        // A read whose process died (restart, serverless timeout) can be reclaimed.
        { updatedAt: { lt: new Date(Date.now() - STALE_READ_MS) } },
      ],
    },
    data: { status: "QUEUED", error: null },
  });
  return count === 1;
}

/** A read that hasn't made progress in this long is considered dead. Each chapter touches updatedAt. */
export const STALE_READ_MS = 15 * 60 * 1000;

export function isStale(status: string, updatedAt: Date) {
  return (status === "QUEUED" || status === "READING") && Date.now() - updatedAt.getTime() > STALE_READ_MS;
}

/**
 * Read the manuscript chapter by chapter, in order, carrying the reader's memory forward,
 * then write the whole-book report. Resumable: chapters already DONE are skipped, so
 * re-running after a failure picks up where it stopped.
 *
 * NOTE: this runs in-process (via `after()`). For production at scale move it to a
 * durable job runner (Inngest, Trigger.dev, a queue + worker) — see README.
 */
export async function readManuscript(manuscriptId: string) {
  const ms = await db.manuscript.findUnique({
    where: { id: manuscriptId },
    include: { chapters: { orderBy: { index: "asc" }, select: { id: true } } },
  });
  if (!ms) return;

  await db.manuscript.update({ where: { id: ms.id }, data: { status: "READING" } });

  const ctx: ManuscriptContext = {
    title: ms.title,
    genre: ms.genre,
    audience: ms.audience,
    authorGoals: ms.authorGoals,
    persona: ms.persona,
    chapterCount: ms.chapters.length,
  };
  // The system prompt is identical for every chapter, so cache it.
  const system = [{ type: "text" as const, text: readerSystemPrompt(ctx), cache_control: { type: "ephemeral" as const } }];

  try {
    let memory: string | null = null;
    for (const { id } of ms.chapters) {
      // Re-fetch each chapter so the read always uses its latest text and review state.
      const chapter = await db.chapter.findUnique({ where: { id }, include: { review: true } });
      if (!chapter) throw new Error("A chapter was removed during the read.");
      if (chapter.review?.status === "DONE") {
        memory = chapter.review.memory;
        continue;
      }
      // Heartbeat so a dead read can be detected and resumed (see claimManuscript).
      await db.manuscript.update({ where: { id: ms.id }, data: { updatedAt: new Date() } });
      memory = await readChapter({ system, chapter, total: ms.chapters.length, memory });
    }
    await writeBookReport(ms.id, ctx);
    await db.$transaction([
      db.manuscript.update({ where: { id: ms.id }, data: { status: "DONE" } }),
      // Usage metering for future billing.
      db.user.update({ where: { id: ms.userId }, data: { wordsReadTotal: { increment: ms.wordCount } } }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // updateMany: the manuscript may have been deleted mid-read.
    await db.manuscript.updateMany({ where: { id: ms.id }, data: { status: "ERROR", error: message } });
  }
}

/**
 * Re-read a single chapter after the author revises it, using the reader memory from
 * the chapter before it. The book report is left as-is (the author can re-run the full read).
 */
export async function rereadChapter(chapterId: string) {
  const chapter = await db.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: { manuscript: { include: { _count: { select: { chapters: true } } } } },
  });
  const ms = chapter.manuscript;
  const previous =
    chapter.index > 0
      ? await db.chapter.findUnique({
          where: { manuscriptId_index: { manuscriptId: ms.id, index: chapter.index - 1 } },
          include: { review: true },
        })
      : null;
  const ctx: ManuscriptContext = {
    title: ms.title,
    genre: ms.genre,
    audience: ms.audience,
    authorGoals: ms.authorGoals,
    persona: ms.persona,
    chapterCount: ms._count.chapters,
  };
  try {
    await readChapter({
      system: [{ type: "text", text: readerSystemPrompt(ctx), cache_control: { type: "ephemeral" } }],
      chapter,
      total: ms._count.chapters,
      memory: previous?.review?.memory ?? null,
    });
  } catch {
    // readChapter already recorded the error on the review.
  }
}

async function readChapter(args: {
  system: { type: "text"; text: string; cache_control: { type: "ephemeral" } }[];
  chapter: { id: string; index: number; title: string; content: string; wordCount: number };
  total: number;
  memory: string | null;
}): Promise<string> {
  const { chapter } = args;
  const review = await db.chapterReview.upsert({
    where: { chapterId: chapter.id },
    update: { status: "READING", error: null },
    create: { chapterId: chapter.id, status: "READING" },
  });

  try {
    const { data, usage } = await callTool({
      system: args.system,
      user: chapterUserPrompt({ index: chapter.index, total: args.total, title: chapter.title, content: chapter.content, memory: args.memory }),
      tool: chapterFeedbackTool,
      // Roughly: notes + reaction + memory. Long chapters get more room.
      maxTokens: Math.min(16_000, 6_000 + Math.round(chapter.wordCount / 2)),
      parse: (input) => ChapterFeedbackSchema.parse(input),
    });

    // Anchor each note to the passage it quotes. Search near the previous note so
    // repeated phrases resolve to the right occurrence.
    let hint = 0;
    const notes: Prisma.NoteCreateManyInput[] = data.notes.map((n) => {
      const anchor = findQuote(chapter.content, n.quote, hint);
      if (anchor) hint = anchor.start;
      return {
        reviewId: review.id,
        kind: KIND[n.kind],
        category: n.category,
        severity: n.severity,
        quote: n.quote,
        startOffset: anchor?.start ?? null,
        endOffset: anchor?.end ?? null,
        comment: n.comment,
        suggestion: n.suggestion ?? null,
      };
    });

    await db.$transaction([
      db.note.deleteMany({ where: { reviewId: review.id } }),
      db.note.createMany({ data: notes }),
      db.chapterReview.update({
        where: { id: review.id },
        data: {
          status: "DONE",
          reaction: data.reaction,
          summary: data.summary,
          engagement: data.engagement,
          strengths: data.strengths,
          questions: data.questions,
          predictions: data.predictions,
          memory: data.memory,
          model: MODEL,
          inputTokens: usage.input,
          outputTokens: usage.output,
        },
      }),
    ]);
    return data.memory;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.chapterReview.updateMany({ where: { id: review.id }, data: { status: "ERROR", error: message } });
    throw new Error(`Reading stopped at "${chapter.title}": ${message}`);
  }
}

async function writeBookReport(manuscriptId: string, ctx: ManuscriptContext) {
  const chapters = await db.chapter.findMany({
    where: { manuscriptId },
    orderBy: { index: "asc" },
    include: { review: { include: { notes: { where: { kind: "ISSUE" }, orderBy: { severity: "desc" } } } } },
  });

  await db.bookReport.upsert({
    where: { manuscriptId },
    update: { status: "READING", error: null },
    create: { manuscriptId, status: "READING" },
  });

  try {
    const { data, usage } = await callTool({
      system: [{ type: "text", text: readerSystemPrompt(ctx) }],
      user: bookReportUserPrompt({
        chapters: chapters.map((c) => ({
          number: c.index + 1,
          title: c.title,
          wordCount: c.wordCount,
          summary: c.review?.summary ?? null,
          engagement: c.review?.engagement ?? null,
          reaction: c.review?.reaction ?? null,
          issues: (c.review?.notes ?? []).map((n) => `[${n.category}, severity ${n.severity}] ${n.comment}`),
          questions: (c.review?.questions as string[] | null) ?? [],
        })),
        finalMemory: chapters.at(-1)?.review?.memory ?? null,
      }),
      tool: bookReportTool,
      maxTokens: 16_000,
      parse: (input) => BookReportSchema.parse(input),
    });
    await db.bookReport.update({
      where: { manuscriptId },
      data: { status: "DONE", content: data, model: MODEL, inputTokens: usage.input, outputTokens: usage.output },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.bookReport.update({ where: { manuscriptId }, data: { status: "ERROR", error: message } });
    throw new Error(`Book report failed: ${message}`);
  }
}
