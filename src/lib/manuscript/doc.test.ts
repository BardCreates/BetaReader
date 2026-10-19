import { test } from "node:test";
import assert from "node:assert/strict";
import { Schema, Node } from "@tiptap/pm/model";
import { docToPlain, plainRangeToPos, plainToDoc, sanitizeDoc, serializeDoc, type DocNode } from "./doc";

// A ProseMirror schema matching the editor, to check positions against the real thing.
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    horizontalRule: { group: "block" },
    text: { group: "inline" },
    hardBreak: { group: "inline", inline: true },
  },
  marks: { bold: {}, italic: {} },
});

const sample = `“I don’t know,” she said.\nThen, quieter: “Maybe.”\n\n* * *\n\nThe wind moved through the orchard.`;

test("plain → doc → plain round-trips", () => {
  const doc = plainToDoc(sample);
  assert.equal(docToPlain(doc), sample);
  assert.deepEqual(doc.content!.map((b) => b.type), ["paragraph", "horizontalRule", "paragraph"]);
});

test("other scene-break styles become a scene break", () => {
  assert.equal(docToPlain(plainToDoc("A.\n\n#\n\nB.")), "A.\n\n* * *\n\nB.");
});

test("empty text gives a single empty paragraph", () => {
  assert.deepEqual(plainToDoc("   "), { type: "doc", content: [{ type: "paragraph" }] });
  assert.equal(docToPlain(plainToDoc("")), "");
});

test("trailing empty paragraphs don't add text", () => {
  const doc = plainToDoc("Hello.");
  doc.content!.push({ type: "paragraph" }, { type: "paragraph" });
  assert.equal(docToPlain(doc), "Hello.");
});

test("marks don't change the text", () => {
  const doc: DocNode = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "She " }, { type: "text", text: "ran", marks: [{ type: "italic" }] }, { type: "text", text: "." }] }],
  };
  assert.equal(docToPlain(doc), "She ran.");
});

test("posAt matches real ProseMirror positions for every character", () => {
  const json = plainToDoc(sample);
  json.content![2].content = [
    { type: "text", text: "The " },
    { type: "text", text: "wind", marks: [{ type: "italic" }] },
    { type: "text", text: " moved through the orchard." },
  ];
  const pm = Node.fromJSON(schema, json);
  const { text, posAt } = serializeDoc(json);
  let checked = 0;
  for (let i = 0; i < text.length; i++) {
    // Separators ("\n") and the scene-break marker ("*") aren't characters in the document.
    if (text[i] === "\n" || text[i] === "*") continue;
    if (text[i] === " " && (text[i - 1] === "*" || text[i + 1] === "*")) continue;
    assert.equal(pm.textBetween(posAt[i], posAt[i] + 1), text[i], `char ${i} (${JSON.stringify(text[i])})`);
    checked++;
  }
  assert.ok(checked > 80);
  assert.equal(posAt.at(-1), pm.content.size);
});

test("plain ranges map to the right text in the document", () => {
  const json = plainToDoc(sample);
  const pm = Node.fromJSON(schema, json);
  const { text, posAt } = serializeDoc(json);
  for (const phrase of ["she said", "Maybe.", "orchard"]) {
    const s = text.indexOf(phrase);
    const r = plainRangeToPos(posAt, s, s + phrase.length)!;
    assert.equal(pm.textBetween(r.from, r.to), phrase);
  }
  // A range spanning a hard break
  const s = text.indexOf("said.");
  const e = text.indexOf("quieter") + "quieter".length;
  const r = plainRangeToPos(posAt, s, e)!;
  assert.equal(pm.textBetween(r.from, r.to, "\n", "\n"), "said.\nThen, quieter");
});

test("sanitizeDoc strips unsupported nodes and marks", () => {
  const dirty = {
    type: "doc",
    content: [
      { type: "heading", content: [{ type: "text", text: "nope" }] },
      { type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: "bold" }, { type: "link", attrs: { href: "x" } }] }, { type: "image" }] },
      { type: "horizontalRule", attrs: { evil: 1 } },
    ],
  };
  assert.deepEqual(sanitizeDoc(dirty), {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "hi", marks: [{ type: "bold" }] }] }, { type: "horizontalRule" }],
  });
  assert.throws(() => sanitizeDoc({ type: "nope" }));
});
