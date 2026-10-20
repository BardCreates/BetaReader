import "server-only";
import { blocksFromHtml, blocksFromMarkdown, chaptersFromBlocks, textFromBlocks } from "./structure";
import { splitIntoChapters, type SplitChapter } from "./split";

export const ACCEPTED_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type ImportedManuscript = {
  /** Plain text of the whole file. */
  text: string;
  chapters: SplitChapter[];
  /** How chapters were found: from the document's headings, or guessed from the text. */
  method: "headings" | "text";
};

// Paragraph styles that writing apps use for chapter and scene titles, beyond Word's own
// "Heading 1–3" (which mammoth maps already). A book's Title style is not a chapter.
const STYLE_MAP = [
  "p[style-name='Title'] => p.book-title:fresh",
  "p[style-name='Chapter Title'] => h1:fresh",
  "p[style-name='Chapter Heading'] => h1:fresh",
  "p[style-name='Chapter'] => h1:fresh",
  "p[style-name='Part Title'] => h1:fresh",
  "p[style-name='Scene Title'] => h3:fresh",
  "p[style-name='Scene Heading'] => h3:fresh",
];

/**
 * Read an uploaded manuscript and split it into chapters. Word (.docx) and Markdown files
 * use their heading structure when they have one, which is how exports from Dabble (and
 * Word or Google Docs files with heading styles) come in chapter for chapter; otherwise
 * chapters are found from "Chapter 1"-style lines in the text.
 */
export async function importFile(file: File): Promise<ImportedManuscript> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 10 MB.");

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(await file.arrayBuffer());
    let html: string;
    try {
      ({ value: html } = await mammoth.convertToHtml({ buffer }, { styleMap: STYLE_MAP, ignoreEmptyParagraphs: true }));
    } catch {
      throw new Error("That .docx file couldn't be opened. Try exporting it again.");
    }
    const blocks = blocksFromHtml(html);
    return fromBlocks(blocks);
  }
  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    return fromBlocks(blocksFromMarkdown(await file.text()));
  }
  if (name.endsWith(".txt")) return fromText(await file.text());
  throw new Error("Upload a .docx, .md or .txt file. (From Dabble, export to Word or Markdown; from Google Docs or Scrivener, export a .docx.)");
}

/** Pasted text (or a .txt file): chapters come from the text alone. */
export function fromText(text: string): ImportedManuscript {
  return { text, chapters: splitIntoChapters(text), method: "text" };
}

function fromBlocks(blocks: ReturnType<typeof blocksFromHtml>): ImportedManuscript {
  const text = textFromBlocks(blocks);
  const structured = chaptersFromBlocks(blocks);
  return structured ? { text, chapters: structured, method: "headings" } : fromText(text);
}
