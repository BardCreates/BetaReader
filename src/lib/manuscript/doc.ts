/**
 * Chapters are edited as a formatted document (ProseMirror/TipTap JSON) but read by the AI
 * — and anchored by notes — as plain text. This module converts between the two.
 *
 * Plain-text rules (keep in sync on both sides):
 *  - top-level blocks are separated by a blank line ("\n\n")
 *  - a paragraph is its text; a hard line break inside it is "\n"
 *  - a scene break (horizontalRule) is "* * *"
 *  - bold/italic marks don't change the text
 *
 * Pure functions only, so they run on the server, in the browser and in tests.
 */

export type DocMark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = {
  type: string;
  text?: string;
  marks?: DocMark[];
  attrs?: Record<string, unknown>;
  content?: DocNode[];
};

export const SCENE_BREAK = "* * *";
const SCENE_BREAK_LINE = /^\s*(\*\s*\*\s*\*|#|~{3,}|-{3,}|\*{3,})\s*$/;

/** Build a document from plain text (imports and chapters created before the editor existed). */
export function plainToDoc(text: string): DocNode {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((b) => b.replace(/^\n+|\n+$/g, ""));
  const content: DocNode[] = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    if (SCENE_BREAK_LINE.test(block)) {
      content.push({ type: "horizontalRule" });
      continue;
    }
    const inline: DocNode[] = [];
    block.split("\n").forEach((line, i) => {
      if (i > 0) inline.push({ type: "hardBreak" });
      if (line) inline.push({ type: "text", text: line });
    });
    content.push(inline.length ? { type: "paragraph", content: inline } : { type: "paragraph" });
  }
  if (!content.length) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

/**
 * Serialise a document to plain text, plus `posAt`: for every character of the text, the
 * ProseMirror position of that character in the document (separators map to the position
 * where the next block's content starts). `posAt` has one extra entry for "end of text".
 */
export function serializeDoc(doc: DocNode): { text: string; posAt: number[] } {
  let text = "";
  const posAt: number[] = [];
  const push = (s: string, pos: number, advance: boolean) => {
    for (let i = 0; i < s.length; i++) {
      text += s[i];
      posAt.push(advance ? pos + i : pos);
    }
  };

  // The doc node itself has no opening token; its first child starts at position 0.
  let pos = 0;
  const blocks = doc.content ?? [];
  blocks.forEach((block, bi) => {
    if (bi > 0) push("\n\n", pos + 1, false);
    if (block.type === "horizontalRule") {
      push(SCENE_BREAK, pos, false);
      pos += 1; // leaf block: one token
      return;
    }
    pos += 1; // opening token of the block
    for (const node of block.content ?? []) {
      if (node.type === "text") {
        const t = node.text ?? "";
        push(t, pos, true);
        pos += t.length;
      } else if (node.type === "hardBreak") {
        push("\n", pos, false);
        pos += 1;
      } else {
        pos += nodeSize(node); // unknown inline node: skip its tokens
      }
    }
    pos += 1; // closing token
  });
  // Empty trailing paragraphs (the editor often keeps one) aren't part of the text.
  while (text.endsWith("\n")) {
    text = text.slice(0, -1);
    posAt.pop();
  }
  posAt.push(pos);
  return { text, posAt };
}

function nodeSize(node: DocNode): number {
  if (node.type === "text") return (node.text ?? "").length;
  if (!node.content) return 1;
  return 2 + node.content.reduce((n, c) => n + nodeSize(c), 0);
}

export function docToPlain(doc: DocNode): string {
  return serializeDoc(doc).text;
}

/** Map a plain-text range to a ProseMirror range. */
export function plainRangeToPos(posAt: number[], start: number, end: number): { from: number; to: number } | null {
  if (start < 0 || end <= start || end > posAt.length - 1) return null;
  const from = posAt[start];
  const to = posAt[end - 1] + 1;
  return to > from ? { from, to } : null;
}

// ─── Validation (server side) ────────────────────────────────────

const ALLOWED_BLOCKS = new Set(["paragraph", "horizontalRule"]);
const ALLOWED_INLINE = new Set(["text", "hardBreak"]);
const ALLOWED_MARKS = new Set(["bold", "italic"]);

/** Keep only the node and mark types the editor supports; drop anything else. */
export function sanitizeDoc(input: unknown): DocNode {
  const doc = input as DocNode;
  if (!doc || typeof doc !== "object" || doc.type !== "doc" || !Array.isArray(doc.content)) {
    throw new Error("Invalid document.");
  }
  const content: DocNode[] = [];
  for (const block of doc.content) {
    if (!block || !ALLOWED_BLOCKS.has(block.type)) continue;
    if (block.type === "horizontalRule") {
      content.push({ type: "horizontalRule" });
      continue;
    }
    const inline: DocNode[] = [];
    for (const n of Array.isArray(block.content) ? block.content : []) {
      if (!n || !ALLOWED_INLINE.has(n.type)) continue;
      if (n.type === "hardBreak") {
        inline.push({ type: "hardBreak" });
        continue;
      }
      if (typeof n.text !== "string" || !n.text) continue;
      const marks = (Array.isArray(n.marks) ? n.marks : [])
        .filter((m) => m && ALLOWED_MARKS.has(m.type))
        .map((m) => ({ type: m.type }));
      inline.push(marks.length ? { type: "text", text: n.text, marks } : { type: "text", text: n.text });
    }
    content.push(inline.length ? { type: "paragraph", content: inline } : { type: "paragraph" });
  }
  if (!content.length) content.push({ type: "paragraph" });
  return { type: "doc", content };
}
