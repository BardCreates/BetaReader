import "server-only";

export const ACCEPTED_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Extract plain text from an uploaded manuscript file. */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 10 MB.");

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  if (ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return await file.text();
  }
  throw new Error("Upload a .docx, .txt or .md file. (For Google Docs or Scrivener, export to .docx first.)");
}
