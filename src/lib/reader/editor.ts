import "server-only";
import { db } from "@/lib/db";
import { editorSystemPrompt } from "./prompts";
import type { BookReportContent } from "./schemas";

/**
 * Build the editor's system prompt: what it knows about the book (its chapter-by-chapter
 * read and the book report) plus, when the conversation is about one chapter, that
 * chapter's full text and notes.
 */
export async function buildEditorSystem(manuscriptId: string, chapterId: string | null) {
  const ms = await db.manuscript.findUniqueOrThrow({
    where: { id: manuscriptId },
    include: {
      report: true,
      chapters: { orderBy: { index: "asc" }, include: { review: true } },
    },
  });

  const parts: string[] = [];

  const report = ms.report?.status === "DONE" ? (ms.report.content as BookReportContent) : null;
  if (report) {
    parts.push(`<your_book_report>
Headline: ${report.headline}

${report.letter}

Biggest problems:
${report.notWorking.map((p) => `- (${p.priority}) ${p.title}: ${p.detail} Fix: ${p.fix}`).join("\n")}
</your_book_report>`);
  }

  const read = ms.chapters
    .filter((c) => c.review?.status === "DONE")
    .map((c) => `Chapter ${c.index + 1} "${c.title}" (engagement ${c.review!.engagement}/10): ${c.review!.summary}`);
  if (read.length) parts.push(`<chapters_you_have_read>\n${read.join("\n")}\n</chapters_you_have_read>`);
  else parts.push("You have not read any chapters yet. You can still discuss the author's goals and any passages they paste.");

  if (chapterId) {
    const chapter = ms.chapters.find((c) => c.id === chapterId);
    if (chapter) {
      const notes = chapter.review
        ? await db.note.findMany({ where: { reviewId: chapter.review.id }, orderBy: { startOffset: "asc" } })
        : [];
      parts.push(`The author wants to discuss chapter ${chapter.index + 1}, "${chapter.title}".

<chapter_text>
${chapter.content}
</chapter_text>

<your_notes_on_this_chapter>
${chapter.review?.reaction ?? ""}
${notes.map((n) => `- [${n.kind.toLowerCase()} · ${n.category}${n.status !== "OPEN" ? ` · ${n.status.toLowerCase()} by author` : ""}] "${n.quote}" — ${n.comment}${n.suggestion ? ` Suggestion: ${n.suggestion}` : ""}`).join("\n")}
</your_notes_on_this_chapter>`);
    }
  }

  return editorSystemPrompt(
    {
      title: ms.title,
      genre: ms.genre,
      audience: ms.audience,
      authorGoals: ms.authorGoals,
      persona: ms.persona,
      chapterCount: ms.chapters.length,
    },
    parts.join("\n\n"),
  );
}
