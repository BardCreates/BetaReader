"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, signOut } from "@/auth";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { extractText } from "@/lib/manuscript/import";
import { findQuote } from "@/lib/manuscript/anchor";
import { docToPlain, plainToDoc, sanitizeDoc } from "@/lib/manuscript/doc";
import { countWords, splitIntoChapters } from "@/lib/manuscript/split";
import { getUsage, isLimitError, release, reserve, type Reservation } from "@/lib/billing/usage";
import { remaining } from "@/lib/billing/period";
import { planFor } from "@/lib/plans";
import { PERSONAS } from "@/lib/reader/personas";
import { lineEditText, type LineSuggestion } from "@/lib/reader/lineEdit";
import { MIN_WORDS_TO_READ, claimManuscript, readManuscript, rereadChapter } from "@/lib/reader/pipeline";

export type FormState = { error?: string } | undefined;

const NewManuscript = z.object({
  title: z.string().trim().min(1, "Give your manuscript a title.").max(200),
  genre: z.string().trim().max(100).optional(),
  audience: z.string().trim().max(100).optional(),
  authorGoals: z.string().trim().max(4000).optional(),
  persona: z.enum(Object.keys(PERSONAS) as [string, ...string[]]),
  text: z.string().optional(),
});

export async function createManuscript(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = NewManuscript.safeParse({
    title: form.get("title"),
    genre: form.get("genre") || undefined,
    audience: form.get("audience") || undefined,
    authorGoals: form.get("authorGoals") || undefined,
    persona: form.get("persona") || "enthusiast",
    text: form.get("text") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  let raw = parsed.data.text ?? "";
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    try {
      raw = await extractText(file);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Couldn't read that file." };
    }
  }
  const chapters = splitIntoChapters(raw);
  const wordCount = countWords(raw);
  if (!chapters.length || wordCount < 100) return { error: "Paste or upload at least a few pages (100+ words)." };

  const account = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { plan: true, _count: { select: { manuscripts: true } } },
  });
  const plan = planFor(account.plan);
  if (account._count.manuscripts >= plan.maxManuscripts) {
    return { error: `The ${plan.name} plan includes ${plan.maxManuscripts} manuscript${plan.maxManuscripts === 1 ? "" : "s"}. Delete one or upgrade.` };
  }
  if (wordCount > plan.maxWordsPerManuscript) {
    return {
      error: `This manuscript is ${wordCount.toLocaleString()} words; the ${plan.name} plan reads up to ${plan.maxWordsPerManuscript.toLocaleString()}.`,
    };
  }

  const { text: _text, ...fields } = parsed.data;
  const ms = await db.manuscript.create({
    data: {
      ...fields,
      userId: user.id,
      wordCount,
      chapters: { create: chapters.map((c, index) => ({ index, ...c })) },
    },
  });
  redirect(`/manuscripts/${ms.id}`);
}

export async function startReading(manuscriptId: string, fresh = false) {
  const user = await requireUser();
  const base = `/manuscripts/${manuscriptId}`;
  // Nothing left to read with: say so up front instead of starting a read that stops at once.
  if (remaining(await getUsage(user.id), "words").total < MIN_WORDS_TO_READ) redirect(`${base}?notice=limit`);
  const claim = await claimManuscript(manuscriptId, user.id);
  if (claim === "otherBusy") redirect(`${base}?notice=busy`);
  if (claim === "claimed") {
    if (fresh) {
      // Start over: a new read from chapter 1 with no memory of the previous read.
      await db.$transaction([
        db.chapterReview.deleteMany({ where: { chapter: { manuscriptId } } }),
        db.bookReport.deleteMany({ where: { manuscriptId } }),
        db.readerThread.deleteMany({ where: { manuscriptId } }),
        db.storyFact.deleteMany({ where: { manuscriptId } }),
      ]);
    }
    // Respond immediately; the read continues after the response is sent.
    after(() => readManuscript(manuscriptId));
  }
  revalidatePath(`/manuscripts/${manuscriptId}`);
}

// ─── Chapter editing ─────────────────────────────────────────────
// Server actions can be called with any arguments, so validate them at runtime.

async function ownedChapter(chapterId: unknown, userId: string) {
  if (typeof chapterId !== "string" || !chapterId) return null;
  return db.chapter.findFirst({
    where: { id: chapterId, manuscript: { userId } },
    include: { review: { select: { id: true, status: true } }, manuscript: { select: { id: true, status: true } } },
  });
}

const MAX_CHAPTER_CHARS = 400_000;

export type SaveResult = { ok: true; wordCount: number; savedAt: string } | { ok: false; error: string };

/** Autosave from the editor: store the formatted document and its plain text. */
export async function saveChapter(chapterId: string, rawDoc: unknown): Promise<SaveResult> {
  const user = await requireUser();
  const chapter = await ownedChapter(chapterId, user.id);
  if (!chapter) return { ok: false, error: "Chapter not found." };

  let doc;
  try {
    doc = sanitizeDoc(rawDoc);
  } catch {
    return { ok: false, error: "That change couldn't be saved." };
  }
  const text = docToPlain(doc);
  if (text.length > MAX_CHAPTER_CHARS) return { ok: false, error: "This chapter is too long to save. Try splitting it." };
  const words = countWords(text);
  const changed = text !== chapter.content;
  const now = new Date();

  const ops: Prisma.PrismaPromise<unknown>[] = [
    db.chapter.update({
      where: { id: chapter.id },
      data: { doc: doc as object, content: text, wordCount: words, ...(changed ? { contentUpdatedAt: now } : {}) },
    }),
    db.manuscript.update({
      where: { id: chapter.manuscript.id },
      data: { wordCount: { increment: words - chapter.wordCount } },
    }),
  ];

  // Keep stored note positions pointing at the right passages in the new text.
  if (changed && chapter.review) {
    const notes = await db.note.findMany({ where: { reviewId: chapter.review.id }, select: { id: true, quote: true, startOffset: true } });
    for (const n of notes) {
      const a = findQuote(text, n.quote, n.startOffset ?? 0);
      ops.push(db.note.update({ where: { id: n.id }, data: { startOffset: a?.start ?? null, endOffset: a?.end ?? null } }));
    }
  }
  await db.$transaction(ops);
  return { ok: true, wordCount: words, savedAt: now.toISOString() };
}

export async function renameChapter(chapterId: string, title: string): Promise<FormState> {
  const user = await requireUser();
  const chapter = await ownedChapter(chapterId, user.id);
  const clean = typeof title === "string" ? title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (!chapter) return { error: "Chapter not found." };
  if (!clean) return { error: "Give the chapter a title." };
  await db.chapter.update({ where: { id: chapter.id }, data: { title: clean } });
  revalidatePath(`/manuscripts/${chapter.manuscript.id}`, "layout");
  return undefined;
}

export type GrammarResult = { ok: true; suggestions: LineSuggestion[] } | { ok: false; error: string };

/** Proofread the chapter as it is in the editor right now (unsaved changes included). */
export async function checkGrammar(chapterId: string, rawDoc: unknown): Promise<GrammarResult> {
  const user = await requireUser();
  const chapter = await ownedChapter(chapterId, user.id);
  if (!chapter) return { ok: false, error: "Chapter not found." };
  let text: string;
  try {
    text = docToPlain(sanitizeDoc(rawDoc));
  } catch {
    return { ok: false, error: "Couldn't read the chapter text." };
  }
  if (countWords(text) < 3) return { ok: true, suggestions: [] };
  if (text.length > MAX_CHAPTER_CHARS) return { ok: false, error: "This chapter is too long to check at once. Try splitting it." };
  let reservation: Reservation | null = null;
  try {
    reservation = await reserve(user.id, "grammarWords", countWords(text));
    const { suggestions } = await lineEditText(text, { userId: user.id, manuscriptId: chapter.manuscript.id, kind: "grammar" });
    return { ok: true, suggestions };
  } catch (err) {
    await release(reservation).catch(() => {});
    if (isLimitError(err)) return { ok: false, error: err.message };
    console.error("grammar check failed", err);
    return { ok: false, error: "The proofread didn't finish. Please try again." };
  }
}

/** What the author wants this chapter to do; checked against the reader's experience on the next read. */
export async function setChapterIntent(chapterId: string, intent: string): Promise<FormState> {
  const user = await requireUser();
  const chapter = await ownedChapter(chapterId, user.id);
  if (!chapter) return { error: "Chapter not found." };
  const clean = typeof intent === "string" ? intent.trim().slice(0, 2000) : "";
  await db.chapter.update({ where: { id: chapter.id }, data: { intent: clean || null } });
  return undefined;
}

export async function addChapter(manuscriptId: string) {
  const user = await requireUser();
  const ms = await db.manuscript.findFirst({
    where: { id: manuscriptId, userId: user.id },
    select: { id: true, _count: { select: { chapters: true } } },
  });
  if (!ms) return;
  const index = ms._count.chapters;
  await db.chapter.create({
    data: { manuscriptId: ms.id, index, title: `Chapter ${index + 1}`, content: "", wordCount: 0, doc: plainToDoc("") as object },
  });
  revalidatePath(`/manuscripts/${ms.id}`, "layout");
  redirect(`/manuscripts/${ms.id}/chapters/${index + 1}`);
}

export async function deleteChapter(chapterId: string) {
  const user = await requireUser();
  const chapter = await ownedChapter(chapterId, user.id);
  if (!chapter) return;
  const msId = chapter.manuscript.id;
  const later = await db.chapter.findMany({
    where: { manuscriptId: msId, index: { gt: chapter.index } },
    orderBy: { index: "asc" },
    select: { id: true, index: true },
  });
  await db.$transaction([
    db.chapter.delete({ where: { id: chapter.id } }),
    db.manuscript.update({ where: { id: msId }, data: { wordCount: { decrement: chapter.wordCount } } }),
    // Close the gap one row at a time, in order, so the (manuscript, index) uniqueness never clashes.
    ...later.map((c) => db.chapter.update({ where: { id: c.id }, data: { index: c.index - 1 } })),
  ]);
  revalidatePath(`/manuscripts/${msId}`, "layout");
  redirect(`/manuscripts/${msId}`);
}

/** Get fresh feedback on one chapter after editing it. */
export async function rereadChapterNow(chapterId: string): Promise<FormState> {
  const user = await requireUser();
  const chapter = await ownedChapter(chapterId, user.id);
  if (!chapter) return { error: "Chapter not found." };
  if (["QUEUED", "READING"].includes(chapter.manuscript.status)) {
    return { error: "The reader is working through the whole book right now. It will get to this chapter." };
  }
  if (["QUEUED", "READING"].includes(chapter.review?.status ?? "")) return undefined; // already re-reading
  if (chapter.wordCount < MIN_WORDS_TO_READ) {
    return { error: `Write at least ${MIN_WORDS_TO_READ} words before asking for a read.` };
  }
  let reservation: Reservation;
  try {
    reservation = await reserve(user.id, "words", chapter.wordCount);
  } catch (err) {
    if (isLimitError(err)) return { error: err.message };
    throw err;
  }
  await db.chapterReview.upsert({
    where: { chapterId: chapter.id },
    update: { status: "QUEUED", error: null },
    create: { chapterId: chapter.id, status: "QUEUED" },
  });
  after(() => rereadChapter(chapter.id, reservation));
  revalidatePath(`/manuscripts/${chapter.manuscript.id}`, "layout");
  return undefined;
}

const NoteStatus = z.enum(["OPEN", "RESOLVED", "DISMISSED"]);

export async function setNoteStatus(noteId: string, rawStatus: "OPEN" | "RESOLVED" | "DISMISSED") {
  const user = await requireUser();
  const parsedStatus = NoteStatus.safeParse(rawStatus);
  if (!parsedStatus.success || typeof noteId !== "string") return;
  const status = parsedStatus.data;
  const note = await db.note.findFirst({
    where: { id: noteId, review: { chapter: { manuscript: { userId: user.id } } } },
    include: { review: { include: { chapter: true } } },
  });
  if (!note) return;
  await db.note.update({ where: { id: noteId }, data: { status } });
  revalidatePath(`/manuscripts/${note.review.chapter.manuscriptId}`, "layout");
}

export async function deleteManuscript(manuscriptId: string) {
  const user = await requireUser();
  await db.manuscript.deleteMany({ where: { id: manuscriptId, userId: user.id } });
  redirect("/dashboard");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
