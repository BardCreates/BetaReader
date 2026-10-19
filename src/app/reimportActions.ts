"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { findQuote } from "@/lib/manuscript/anchor";
import { plainToDoc } from "@/lib/manuscript/doc";
import { extractText } from "@/lib/manuscript/import";
import { canonicalText, matchChapters, summarizeChanges, type ChapterChange } from "@/lib/manuscript/match";
import { countWords, splitIntoChapters } from "@/lib/manuscript/split";
import { planFor } from "@/lib/plans";
import { claimManuscript, readManuscript } from "@/lib/reader/pipeline";

export type ReimportPreview = {
  changes: ChapterChange[];
  summary: ReturnType<typeof summarizeChanges>;
  words: number;
  wordsBefore: number;
  /** Set when the file shares almost nothing with the current draft. */
  looksUnrelated: boolean;
};
export type ReimportState = { error?: string; preview?: ReimportPreview } | undefined;

async function readUpload(form: FormData): Promise<string> {
  const file = form.get("file");
  if (file instanceof File && file.size > 0) return extractText(file);
  const text = form.get("text");
  return typeof text === "string" ? text : "";
}

/**
 * Update a manuscript from a revised draft. `mode=preview` shows what would change;
 * `mode=apply` (sent with the same file) makes the change. Unchanged chapters keep their
 * notes and reads; changed chapters keep their notes (re-anchored) and are marked out of date.
 */
export async function reimportDraft(manuscriptId: string, _prev: ReimportState, form: FormData): Promise<ReimportState> {
  const user = await requireUser();
  const ms = await db.manuscript.findFirst({
    where: { id: manuscriptId, userId: user.id },
    select: {
      id: true,
      status: true,
      wordCount: true,
      user: { select: { plan: true } },
      chapters: { orderBy: { index: "asc" }, select: { id: true, index: true, title: true, content: true, review: { select: { id: true } } } },
    },
  });
  if (!ms) return { error: "Manuscript not found." };
  if (ms.status === "QUEUED" || ms.status === "READING") {
    return { error: "The reader is partway through this book. Update the draft when the read finishes." };
  }

  let raw: string;
  try {
    raw = await readUpload(form);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't read that file." };
  }
  const incoming = splitIntoChapters(raw);
  // Same measure as the manuscript's stored total: chapter text only, headings excluded.
  const words = incoming.reduce((sum, c) => sum + countWords(canonicalText(c.content)), 0);
  if (!incoming.length || words < 100) return { error: "That file looks empty. Upload the full draft (100+ words)." };
  const plan = planFor(ms.user.plan);
  if (words > plan.maxWordsPerManuscript) {
    return { error: `This draft is ${words.toLocaleString()} words; the ${plan.name} plan reads up to ${plan.maxWordsPerManuscript.toLocaleString()}.` };
  }

  const changes = matchChapters(ms.chapters, incoming);
  const summary = summarizeChanges(changes);

  if (form.get("mode") !== "apply") {
    return {
      preview: {
        changes,
        summary,
        words,
        wordsBefore: ms.wordCount,
        looksUnrelated: ms.chapters.length > 0 && summary.same + summary.changed === 0,
      },
    };
  }

  const now = new Date();
  const byId = new Map(ms.chapters.map((c) => [c.id, c]));
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  // 1. Drop removed chapters, and park the rest on temporary indexes so renumbering can't clash.
  const removed = changes.flatMap((c) => (c.kind === "removed" ? [c.id] : []));
  if (removed.length) ops.push(db.chapter.deleteMany({ where: { id: { in: removed } } }));
  const kept = changes.filter((c): c is Extract<ChapterChange, { kind: "same" | "changed" }> => c.kind === "same" || c.kind === "changed");
  kept.forEach((c, k) => ops.push(db.chapter.update({ where: { id: c.id }, data: { index: -1 - k } })));

  // 2. Final positions, titles and (for changed chapters) the new text.
  for (const c of kept) {
    const inc = incoming[c.newIndex];
    if (c.kind === "same") {
      ops.push(db.chapter.update({ where: { id: c.id }, data: { index: c.newIndex, title: inc.title } }));
      continue;
    }
    const text = canonicalText(inc.content);
    ops.push(
      db.chapter.update({
        where: { id: c.id },
        data: {
          index: c.newIndex,
          title: inc.title,
          content: text,
          doc: plainToDoc(text) as object,
          wordCount: countWords(text),
          contentUpdatedAt: now,
        },
      }),
    );
    // Keep existing notes pointing at their passages where those passages survived.
    const reviewId = byId.get(c.id)?.review?.id;
    if (reviewId) {
      const notes = await db.note.findMany({ where: { reviewId }, select: { id: true, quote: true, startOffset: true } });
      for (const n of notes) {
        const a = findQuote(text, n.quote, n.startOffset ?? 0);
        ops.push(db.note.update({ where: { id: n.id }, data: { startOffset: a?.start ?? null, endOffset: a?.end ?? null } }));
      }
    }
  }

  // 3. New chapters.
  const added = changes.flatMap((c) => (c.kind === "new" ? [c] : []));
  if (added.length) {
    ops.push(
      db.chapter.createMany({
        data: added.map((c) => {
          const text = canonicalText(incoming[c.newIndex].content);
          return {
            manuscriptId: ms.id,
            index: c.newIndex,
            title: incoming[c.newIndex].title,
            content: text,
            doc: plainToDoc(text) as object,
            wordCount: countWords(text),
          };
        }),
      }),
    );
  }

  ops.push(db.manuscript.update({ where: { id: ms.id }, data: { wordCount: words } }));
  await db.$transaction(ops);

  revalidatePath(`/manuscripts/${ms.id}`, "layout");
  redirect(`/manuscripts/${ms.id}?updated=${summary.changed + summary.added}`);
}

/**
 * Read only what changed since the last read: chapters never read, and chapters edited after
 * their read. Then refresh the book report. Much cheaper than a fresh read of the whole book.
 */
export async function readChangedChapters(manuscriptId: string) {
  const user = await requireUser();
  if (await claimManuscript(manuscriptId, user.id)) {
    after(() => readManuscript(manuscriptId, { rereadChanged: true }));
  }
  revalidatePath(`/manuscripts/${manuscriptId}`, "layout");
}
