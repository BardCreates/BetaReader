import { test } from "node:test";
import assert from "node:assert/strict";
import { findQuote, segmentText } from "./anchor";

const text = `“I don’t know,” she said—and then, quieter: “Maybe I never did.”\n\nThe   wind   moved through the orchard like a held breath.`;

test("finds an exact quote", () => {
  const a = findQuote(text, "like a held breath")!;
  assert.equal(text.slice(a.start, a.end), "like a held breath");
});

test("matches straight quotes and hyphens against curly quotes and em dashes", () => {
  const a = findQuote(text, `"I don't know," she said-and then`)!;
  assert.equal(text.slice(a.start, a.end), "I don’t know,” she said—and then");
});

test("tolerates collapsed whitespace and case", () => {
  const a = findQuote(text, "the wind moved through")!;
  assert.equal(text.slice(a.start, a.end), "The   wind   moved through");
});

test("handles an ellipsis eliding the middle of a passage", () => {
  const a = findQuote(text, "The wind moved through... like a held breath")!;
  assert.equal(text.slice(a.start, a.end), "The   wind   moved through the orchard like a held breath");
});

test("returns null for text that isn't there", () => {
  assert.equal(findQuote(text, "dragons circled the castle"), null);
});

test("prefers the occurrence nearest the hint", () => {
  const t = "He waited. Later, he waited.";
  assert.equal(findQuote(t, "he waited", 20)!.start, 18);
});

test("segments text, resolving overlaps", () => {
  const t = "abcdefghij";
  const segs = segmentText(t, [
    { id: "b", start: 4, end: 8 },
    { id: "a", start: 2, end: 6 },
  ]);
  assert.deepEqual(
    segs.map((s) => [s.text, s.noteId]),
    [["ab", null], ["cdef", "a"], ["gh", "b"], ["ij", null]],
  );
  assert.equal(segs.map((s) => s.text).join(""), t);
});
