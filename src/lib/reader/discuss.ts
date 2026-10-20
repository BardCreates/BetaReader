import "server-only";
import { db } from "@/lib/db";
import { castBlock, castWithPronouns } from "./cast";
import { noteDiscussionPrompt } from "./prompts";

/** A note the signed-in user owns, with what the discussion needs. Null if it isn't theirs. */
export async function ownedNote(noteId: string, userId: string) {
  return db.note.findFirst({
    where: { id: noteId, review: { chapter: { manuscript: { userId } } } },
    select: {
      id: true,
      kind: true,
      category: true,
      quote: true,
      comment: true,
      suggestion: true,
      status: true,
      conflictFact: true,
      conflictChapter: true,
      review: {
        select: {
          reaction: true,
          chapter: {
            select: {
              id: true,
              index: true,
              title: true,
              content: true,
              intent: true,
              manuscript: {
                select: {
                  id: true,
                  title: true,
                  genre: true,
                  audience: true,
                  authorGoals: true,
                  persona: true,
                  _count: { select: { chapters: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

/** The reader's system prompt for talking about one of its notes. */
export async function noteDiscussionSystem(note: NonNullable<Awaited<ReturnType<typeof ownedNote>>>) {
  const chapter = note.review.chapter;
  const ms = chapter.manuscript;
  // What the reader remembered going in: the memory written at the end of the chapter before.
  const previous =
    chapter.index > 0
      ? await db.chapter.findUnique({
          where: { manuscriptId_index: { manuscriptId: ms.id, index: chapter.index - 1 } },
          select: { review: { select: { memory: true } } },
        })
      : null;
  return noteDiscussionPrompt(
    {
      title: ms.title,
      genre: ms.genre,
      audience: ms.audience,
      authorGoals: ms.authorGoals,
      persona: ms.persona,
      chapterCount: ms._count.chapters,
      cast: castBlock(await castWithPronouns(ms.id)),
    },
    {
      chapterNumber: chapter.index + 1,
      chapterTitle: chapter.title,
      content: chapter.content,
      memoryBefore: previous?.review?.memory ?? null,
      reaction: note.review.reaction,
      intent: chapter.intent,
      note: {
        kind: note.kind,
        category: note.category,
        quote: note.quote,
        comment: note.comment,
        suggestion: note.suggestion,
        status: note.status,
        conflict: note.conflictFact && note.conflictChapter ? { fact: note.conflictFact, chapter: note.conflictChapter } : null,
      },
    },
  );
}
