import "server-only";
import { Prisma, type NoteKind } from "@/generated/prisma/client";
import { isLimitError, release, reserve, type Meter, type Reservation } from "@/lib/billing/usage";
import { db } from "@/lib/db";
import { findQuote } from "@/lib/manuscript/anchor";
import { MODEL, callStructured } from "./anthropic";
import { castBlock, castWithPronouns } from "./cast";
import { bookReportUserPrompt, chapterUserPrompt, readerSystemPrompt, type ManuscriptContext } from "./prompts";
import { BookReportSchema, ChapterFeedbackSchema, bookReportTool, chapterFeedbackTool } from "./schemas";

const KIND: Record<"reaction" | "praise" | "issue", NoteKind> = {
  reaction: "REACTION",
  praise: "PRAISE",
  issue: "ISSUE",
};

/** Chapters shorter than this are skipped (e.g. a new chapter the author hasn't written yet). */
export const MIN_WORDS_TO_READ = 20;

/** Notes are out of date when the chapter's text changed after its read started. */
export function isReviewStale(review: { status: string; readAt: Date | null; updatedAt: Date } | null, contentUpdatedAt: Date) {
  if (!review || review.status !== "DONE") return false;
  return contentUpdatedAt.getTime() > (review.readAt ?? review.updatedAt).getTime();
}

/**
 * Claim a manuscript for reading, so double-clicks and concurrent requests don't start two
 * readers. One read at a time per user: "otherBusy" if another of their books is being read.
 */
export async function claimManuscript(manuscriptId: string, userId: string): Promise<"claimed" | "busy" | "otherBusy"> {
  // Lock the user's row so two books started at the same moment can't both be claimed.
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const other = await tx.manuscript.findFirst({
      where: {
        userId,
        id: { not: manuscriptId },
        status: { in: ["QUEUED", "READING"] },
        updatedAt: { gte: new Date(Date.now() - STALE_READ_MS) },
      },
      select: { id: true },
    });
    if (other) return "otherBusy";
    const { count } = await tx.manuscript.updateMany({
      where: {
        id: manuscriptId,
        userId,
        OR: [
          { status: { notIn: ["QUEUED", "READING"] } },
          // A read whose process died (restart, serverless timeout) can be reclaimed.
          { updatedAt: { lt: new Date(Date.now() - STALE_READ_MS) } },
        ],
      },
      data: { status: "QUEUED", error: null, errorCode: null },
    });
    return count === 1 ? "claimed" : "busy";
  });
}

/** A read that hasn't made progress in this long is considered dead. Each chapter touches updatedAt. */
export const STALE_READ_MS = 15 * 60 * 1000;

export function isStale(status: string, updatedAt: Date) {
  return (status === "QUEUED" || status === "READING") && Date.now() - updatedAt.getTime() > STALE_READ_MS;
}

/**
 * Read the manuscript chapter by chapter, in order, carrying the reader's memory forward,
 * then write the whole-book report. Resumable: chapters already DONE are skipped, so
 * re-running after a failure picks up where it stopped. With `rereadChanged`, chapters
 * edited since their read are read again too (the "read changes" flow after a revision).
 *
 * NOTE: this runs in-process (via `after()`). For production at scale move it to a
 * durable job runner (Inngest, Trigger.dev, a queue + worker) — see README.
 */
export async function readManuscript(manuscriptId: string, opts: { rereadChanged?: boolean } = {}) {
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
    cast: castBlock(await castWithPronouns(ms.id)),
  };
  // The system prompt is identical for every chapter, so cache it.
  const system = [{ type: "text" as const, text: readerSystemPrompt(ctx), cache_control: { type: "ephemeral" as const } }];

  const meter = { userId: ms.userId, manuscriptId: ms.id };
  let reservation: Reservation | null = null;
  try {
    let memory: string | null = null;
    for (const { id } of ms.chapters) {
      // Re-fetch each chapter so the read always uses its latest text and review state.
      const chapter = await db.chapter.findUnique({ where: { id }, include: { review: true } });
      if (!chapter) throw new Error("A chapter was removed during the read.");
      const changed = opts.rereadChanged && isReviewStale(chapter.review, chapter.contentUpdatedAt);
      if (chapter.review?.status === "DONE" && !changed) {
        memory = chapter.review.memory;
        continue;
      }
      if (chapter.wordCount < MIN_WORDS_TO_READ) continue; // nothing to read yet
      // Take the chapter's words from the allowance first; stops the read cleanly at the limit.
      reservation = await reserve(ms.userId, "words", chapter.wordCount);
      // Heartbeat so a dead read can be detected and resumed (see claimManuscript).
      await db.manuscript.update({ where: { id: ms.id }, data: { updatedAt: new Date() } });
      memory = await readChapter({ system, chapter, total: ms.chapters.length, memory, meter });
      reservation = null;
      await db.user.update({ where: { id: ms.userId }, data: { wordsReadTotal: { increment: chapter.wordCount } } });
    }
    await writeBookReport(ms.id, ctx, meter);
    await db.manuscript.update({ where: { id: ms.id }, data: { status: "DONE" } });
  } catch (err) {
    await release(reservation).catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    // updateMany: the manuscript may have been deleted mid-read.
    await db.manuscript.updateMany({
      where: { id: ms.id },
      data: { status: "ERROR", error: message, errorCode: isLimitError(err) ? err.code : null },
    });
  }
}

/**
 * Re-read a single chapter after the author revises it, using the reader memory from
 * the chapter before it. The book report is left as-is (the author can re-run the full read).
 */
export async function rereadChapter(chapterId: string, reservation: Reservation | null) {
  try {
    await rereadChapterInner(chapterId);
  } catch {
    // The read failed (readChapter recorded why on the review); give the words back.
    await release(reservation).catch(() => {});
  }
}

async function rereadChapterInner(chapterId: string) {
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
    cast: castBlock(await castWithPronouns(ms.id)),
  };
  await readChapter({
    system: [{ type: "text", text: readerSystemPrompt(ctx), cache_control: { type: "ephemeral" } }],
    chapter,
    total: ms._count.chapters,
    memory: previous?.review?.memory ?? null,
    meter: { userId: ms.userId, manuscriptId: ms.id },
  });
  await db.user.update({ where: { id: ms.userId }, data: { wordsReadTotal: { increment: chapter.wordCount } } });
}

type ChapterToRead = {
  id: string;
  manuscriptId: string;
  index: number;
  title: string;
  content: string;
  wordCount: number;
  intent: string | null;
};

const AUTHOR_STATUS = { OPEN: "open", RESOLVED: "marked fixed", DISMISSED: "author disagreed" } as const;
const OUTCOME = { answered: "ANSWERED", confirmed: "CONFIRMED", refuted: "REFUTED" } as const;
/** Cap on carried questions/predictions shown to the reader, newest kept. */
const MAX_OPEN_THREADS = 40;
/** Cap on story-bible facts shown to the reader (~6k tokens), newest kept. */
const MAX_BIBLE_FACTS = 300;

async function readChapter(args: {
  system: { type: "text"; text: string; cache_control: { type: "ephemeral" } }[];
  chapter: ChapterToRead;
  total: number;
  memory: string | null;
  meter: Meter;
}): Promise<string> {
  const { chapter } = args;
  const readAt = new Date();

  // What the reader thought last time, for the revision check (a re-read after edits).
  const before = await db.chapterReview.findUnique({
    where: { chapterId: chapter.id },
    include: { notes: { where: { kind: "ISSUE" }, orderBy: { startOffset: "asc" } } },
  });
  const previousIssues =
    before?.status === "DONE" || (before?.notes.length ?? 0) > 0
      ? (before?.notes ?? []).map((n, i) => ({
          id: `N${i + 1}`,
          quote: n.quote,
          comment: n.comment,
          authorStatus: AUTHOR_STATUS[n.status],
        }))
      : [];
  const previousEngagement = before?.engagement ?? null;

  const review = await db.chapterReview.upsert({
    where: { chapterId: chapter.id },
    update: { status: "READING", error: null },
    create: { chapterId: chapter.id, status: "READING" },
  });

  try {
    // Reader journey: forget what this chapter raised or settled last time, then gather
    // everything the reader is carrying into it (raised earlier, not settled before it).
    await db.$transaction([
      db.storyFact.deleteMany({ where: { chapterId: chapter.id } }),
      db.readerThread.deleteMany({ where: { raisedChapterId: chapter.id } }),
      db.readerThread.updateMany({
        where: { resolvedChapterId: chapter.id },
        data: { resolvedChapterId: null, outcome: "OPEN", resolution: null },
      }),
    ]);
    const carried = (
      await db.readerThread.findMany({
        where: { manuscriptId: chapter.manuscriptId, raisedChapter: { index: { lt: chapter.index } } },
        include: { raisedChapter: { select: { index: true } }, resolvedChapter: { select: { index: true } } },
        orderBy: { createdAt: "asc" },
      })
    )
      .filter((t) => t.outcome === "OPEN" || (t.resolvedChapter && t.resolvedChapter.index > chapter.index))
      .slice(-MAX_OPEN_THREADS);
    let q = 0;
    let pr = 0;
    const openThreads = carried.map((t) => ({
      id: t.kind === "QUESTION" ? `Q${++q}` : `P${++pr}`,
      threadId: t.id,
      kind: t.kind === "QUESTION" ? ("question" as const) : ("prediction" as const),
      text: t.text,
      raisedIn: t.raisedChapter.index + 1,
    }));

    // Story bible: facts from earlier chapters only (the reader never sees ahead).
    const bible = (
      await db.storyFact.findMany({
        where: { manuscriptId: chapter.manuscriptId, chapter: { index: { lt: chapter.index } } },
        include: { chapter: { select: { index: true } } },
        orderBy: [{ chapter: { index: "asc" } }, { createdAt: "asc" }],
      })
    )
      .slice(-MAX_BIBLE_FACTS)
      .map((f, i) => ({ id: `F${i + 1}`, subject: f.subject, fact: f.fact, chapter: f.chapter.index + 1 }));

    const { data, usage } = await callStructured({
      system: args.system,
      user: chapterUserPrompt({
        index: chapter.index,
        total: args.total,
        title: chapter.title,
        content: chapter.content,
        memory: args.memory,
        openThreads,
        bible,
        intent: chapter.intent,
        previous: previousIssues.length ? { engagement: previousEngagement, issues: previousIssues } : null,
      }),
      schema: chapterFeedbackTool.input_schema,
      // Headroom for the model's reasoning plus notes, reaction and memory.
      maxTokens: Math.min(32_000, 16_000 + Math.round(chapter.wordCount / 2)),
      parse: (input) => ChapterFeedbackSchema.parse(input),
      meter: { ...args.meter, kind: "read" },
    });

    // Anchor each note to the passage it quotes, in the chapter's text as it is *now*
    // (the author may have kept editing while the reader worked). Search near the previous
    // note so repeated phrases resolve to the right occurrence.
    const current = await db.chapter.findUnique({ where: { id: chapter.id }, select: { content: true } });
    const text = current?.content ?? chapter.content;
    let hint = 0;
    const notes: Prisma.NoteCreateManyInput[] = data.notes.map((n) => {
      const anchor = findQuote(text, n.quote, hint);
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

    const factById = new Map(bible.map((f) => [f.id, f]));
    for (const c of data.continuity) {
      const earlier = c.conflictsWith ? factById.get(c.conflictsWith.trim().toUpperCase()) : undefined;
      const anchor = findQuote(text, c.quote, 0);
      notes.push({
        reviewId: review.id,
        kind: "ISSUE",
        category: "continuity",
        severity: 2,
        quote: c.quote,
        startOffset: anchor?.start ?? null,
        endOffset: anchor?.end ?? null,
        comment: c.explanation,
        suggestion: c.suggestion ?? null,
        // Kept apart from the comment so the continuity ledger can show "established → contradicted".
        conflictFact: earlier?.fact ?? null,
        conflictChapter: earlier?.chapter ?? null,
      });
    }
    const facts: Prisma.StoryFactCreateManyInput[] = data.facts.map((f) => ({
      manuscriptId: chapter.manuscriptId,
      chapterId: chapter.id,
      subject: f.subject.trim().slice(0, 120),
      category: f.category,
      fact: f.fact.trim(),
    }));

    const byLabel = new Map(openThreads.map((t) => [t.id.toUpperCase(), t.threadId]));
    const resolutions = data.resolvedThreads.flatMap((r) => {
      const threadId = byLabel.get(r.id.trim().toUpperCase());
      return threadId ? [{ threadId, outcome: OUTCOME[r.outcome], resolution: r.resolution }] : [];
    });
    const newThreads: Prisma.ReaderThreadCreateManyInput[] = [
      ...data.questions.map((t) => ({ manuscriptId: chapter.manuscriptId, kind: "QUESTION" as const, text: t, raisedChapterId: chapter.id })),
      ...data.predictions.map((t) => ({ manuscriptId: chapter.manuscriptId, kind: "PREDICTION" as const, text: t, raisedChapterId: chapter.id })),
    ];

    const prevById = new Map(previousIssues.map((i) => [i.id, i]));
    const revisionCheck =
      previousIssues.length && data.revisionCheck?.length
        ? {
            previousEngagement,
            notes: data.revisionCheck.flatMap((r) => {
              const prev = prevById.get(r.id.trim().toUpperCase());
              return prev
                ? [{ quote: prev.quote, comment: prev.comment, authorStatus: prev.authorStatus, verdict: r.verdict, explanation: r.explanation }]
                : [];
            }),
          }
        : // A re-read (the chapter had a finished read before) always gets a revision check, even with
          // no earlier issues, so the engagement change and "revised, not new" show up for drafts.
          previousIssues.length || before?.status === "DONE"
          ? { previousEngagement, notes: [] }
          : null;
    const intentCheck = chapter.intent?.trim() && data.intentCheck ? { intent: chapter.intent.trim(), ...data.intentCheck } : null;
    // Only keep a drop-off point we can find on the page; a paraphrase can't be shown on the reader map.
    const dropOff = data.dropOff && findQuote(text, data.dropOff.quote, 0) ? { quote: data.dropOff.quote, why: data.dropOff.why } : null;
    const draft = (await db.manuscript.findUnique({ where: { id: chapter.manuscriptId }, select: { draft: true } }))?.draft ?? null;

    await db.$transaction([
      db.note.deleteMany({ where: { reviewId: review.id } }),
      db.note.createMany({ data: notes }),
      db.readerThread.createMany({ data: newThreads }),
      db.storyFact.createMany({ data: facts }),
      ...resolutions.map((r) =>
        db.readerThread.update({
          where: { id: r.threadId },
          data: { outcome: r.outcome, resolution: r.resolution, resolvedChapterId: chapter.id },
        }),
      ),
      db.chapterReview.update({
        where: { id: review.id },
        data: {
          status: "DONE",
          readAt,
          reaction: data.reaction,
          summary: data.summary,
          engagement: data.engagement,
          strengths: data.strengths,
          questions: data.questions,
          predictions: data.predictions,
          memory: data.memory,
          intentCheck: intentCheck ?? Prisma.DbNull,
          revisionCheck: revisionCheck ?? Prisma.DbNull,
          dropOff: dropOff ?? Prisma.DbNull,
          draft,
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
    if (isLimitError(err)) throw err; // keep the type so the read stops as "limit reached"
    throw new Error(`Reading stopped at "${chapter.title}": ${message}`);
  }
}

async function writeBookReport(manuscriptId: string, ctx: ManuscriptContext, meter: Omit<Meter, "kind">) {
  const chapters = await db.chapter.findMany({
    where: { manuscriptId },
    orderBy: { index: "asc" },
    include: { review: { include: { notes: { where: { kind: "ISSUE" }, orderBy: { severity: "desc" } } } } },
  });

  const threads = await db.readerThread.findMany({ where: { manuscriptId }, select: { kind: true, outcome: true, text: true } });

  await db.bookReport.upsert({
    where: { manuscriptId },
    update: { status: "READING", error: null },
    create: { manuscriptId, status: "READING" },
  });

  try {
    const { data, usage } = await callStructured({
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
        finalMemory: chapters.findLast((c) => c.review?.memory)?.review?.memory ?? null,
        ledger: {
          unanswered: threads.filter((t) => t.kind === "QUESTION" && t.outcome === "OPEN").map((t) => t.text),
          guessed: threads.filter((t) => t.outcome === "CONFIRMED").map((t) => t.text),
          surprises: threads.filter((t) => t.outcome === "REFUTED").map((t) => t.text),
        },
      }),
      schema: bookReportTool.input_schema,
      maxTokens: 32_000,
      parse: (input) => BookReportSchema.parse(input),
      meter: { ...meter, kind: "report" },
    });
    await db.bookReport.update({
      where: { manuscriptId },
      data: { status: "DONE", content: data, model: MODEL, inputTokens: usage.input, outputTokens: usage.output },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.bookReport.update({ where: { manuscriptId }, data: { status: "ERROR", error: message } });
    if (isLimitError(err)) throw err;
    throw new Error(`Book report failed: ${message}`);
  }
}
