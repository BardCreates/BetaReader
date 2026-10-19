import { test } from "node:test";
import assert from "node:assert/strict";
import { splitIntoChapters, countWords, FALLBACK_SECTION_WORDS } from "./split";

const para = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

test("counts words including contractions and hyphenates", () => {
  assert.equal(countWords("It's a well-known fact — isn't it?"), 6);
});

test("splits on Chapter N headings and keeps subtitles", () => {
  const text = `Chapter 1\nThe Arrival\n\nShe stepped off the train.\n\nCHAPTER TWO: Smoke\n\nThe house was burning.\n\nChapter 3 - Ashes\n\nNothing was left.`;
  const ch = splitIntoChapters(text);
  assert.deepEqual(ch.map((c) => c.title), ["Chapter 1: The Arrival", "CHAPTER TWO: Smoke", "Chapter 3 - Ashes"]);
  assert.equal(ch[0].content, "She stepped off the train.");
});

test("does not swallow a first sentence as a subtitle", () => {
  const text = `Chapter 1\nShe ran.\n\nMore text here.\n\nChapter 2\n\nOther text.`;
  const ch = splitIntoChapters(text);
  assert.equal(ch[0].title, "Chapter 1");
  assert.match(ch[0].content, /^She ran\./);
});

test("handles prologue, epilogue and markdown headings", () => {
  const text = `# Prologue\n\nLong ago.\n\n# The Middle\n\nThings happen.\n\nEpilogue\n\nThe end.`;
  const ch = splitIntoChapters(text);
  assert.deepEqual(ch.map((c) => c.title), ["Prologue", "The Middle", "Epilogue"]);
});

test("keeps a substantial preamble as an Opening section", () => {
  const text = `${para(200)}\n\nChapter 1\n\nA.\n\nChapter 2\n\nB.`;
  const ch = splitIntoChapters(text);
  assert.equal(ch[0].title, "Opening");
  assert.equal(ch.length, 3);
});

test("uses bare numbered headings when repeated", () => {
  const text = `1\n\nFirst part.\n\n2\n\nSecond part.\n\n3\n\nThird part.`;
  const ch = splitIntoChapters(text);
  assert.equal(ch.length, 3);
  assert.equal(ch[2].content, "Third part.");
});

test("falls back to size-based sections with no headings", () => {
  const paragraphs = Array.from({ length: 30 }, () => para(500)).join("\n\n");
  const ch = splitIntoChapters(paragraphs);
  assert.ok(ch.length >= 3);
  for (const c of ch) assert.ok(c.wordCount <= FALLBACK_SECTION_WORDS + 500);
  assert.equal(ch.reduce((s, c) => s + c.wordCount, 0), 15000);
});

test("recognises 'Chapter 3 Ashes' headings without punctuation", () => {
  const ch = splitIntoChapters("Chapter 1 The Arrival\n\nA.\n\nChapter 2 Smoke\n\nB.");
  assert.deepEqual(ch.map((c) => c.title), ["Chapter 1 The Arrival", "Chapter 2 Smoke"]);
});

test("does not treat 'Chapter mix' or a sentence as a heading", () => {
  const ch = splitIntoChapters(`Chapter mix\n\n${para(50)}\n\nChapter 1 was the hardest to write.\n\nMore.`);
  assert.equal(ch.length, 1);
});

test("splits single-newline text with no headings into sections", () => {
  const text = Array.from({ length: 40 }, () => para(300)).join("\n");
  const ch = splitIntoChapters(text);
  assert.ok(ch.length >= 2, `expected several sections, got ${ch.length}`);
  for (const c of ch) assert.ok(c.wordCount <= FALLBACK_SECTION_WORDS + 300);
});

test("normalises Windows line endings", () => {
  const ch = splitIntoChapters("Chapter 1\r\n\r\nHello.\r\n\r\nChapter 2\r\n\r\nBye.");
  assert.equal(ch.length, 2);
  assert.equal(ch[1].content, "Bye.");
});
