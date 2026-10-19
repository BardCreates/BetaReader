"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, signOut } from "@/auth";
import { db } from "@/lib/db";
import { extractText } from "@/lib/manuscript/import";
import { countWords, splitIntoChapters } from "@/lib/manuscript/split";
import { planFor } from "@/lib/plans";
import { PERSONAS } from "@/lib/reader/personas";
import { claimManuscript, readManuscript, rereadChapter } from "@/lib/reader/pipeline";

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
  if (await claimManuscript(manuscriptId, user.id)) {
    if (fresh) {
      // Start over: a new read from chapter 1 with no memory of the previous read.
      await db.$transaction([
        db.chapterReview.deleteMany({ where: { chapter: { manuscriptId } } }),
        db.bookReport.deleteMany({ where: { manuscriptId } }),
      ]);
    }
    // Respond immediately; the read continues after the response is sent.
    after(() => readManuscript(manuscriptId));
  }
  revalidatePath(`/manuscripts/${manuscriptId}`);
}

async function ownedChapter(chapterId: string, userId: string) {
  const chapter = await db.chapter.findFirst({
    where: { id: chapterId, manuscript: { userId } },
    include: { manuscript: { select: { id: true } } },
  });
  if (!chapter) throw new Error("Chapter not found.");
  return chapter;
}

export async function reviseChapter(chapterId: string, content: string) {
  const user = await requireUser();
  const chapter = await ownedChapter(chapterId, user.id);
  const text = content.replace(/\r\n?/g, "\n").trim();
  if (countWords(text) < 20) throw new Error("The revised chapter is too short.");
  await db.$transaction([
    db.chapter.update({ where: { id: chapter.id }, data: { content: text, wordCount: countWords(text) } }),
    db.chapterReview.upsert({
      where: { chapterId: chapter.id },
      update: { status: "QUEUED", error: null },
      create: { chapterId: chapter.id, status: "QUEUED" },
    }),
  ]);
  after(() => rereadChapter(chapter.id));
  revalidatePath(`/manuscripts/${chapter.manuscript.id}/chapters/${chapter.index + 1}`);
}

export async function setNoteStatus(noteId: string, status: "OPEN" | "RESOLVED" | "DISMISSED") {
  const user = await requireUser();
  const note = await db.note.findFirst({
    where: { id: noteId, review: { chapter: { manuscript: { userId: user.id } } } },
    include: { review: { include: { chapter: true } } },
  });
  if (!note) return;
  await db.note.update({ where: { id: noteId }, data: { status } });
  const ch = note.review.chapter;
  revalidatePath(`/manuscripts/${ch.manuscriptId}/chapters/${ch.index + 1}`);
}

export async function deleteManuscript(manuscriptId: string) {
  const user = await requireUser();
  await db.manuscript.deleteMany({ where: { id: manuscriptId, userId: user.id } });
  redirect("/dashboard");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
