import { test } from "node:test";
import assert from "node:assert/strict";
import { ChapterFeedbackSchema, PitchKitSchema } from "./schemas";

const read = { reaction: "r", summary: "s", engagement: 7, memory: "m" };

test("facts and continuity default to empty for older-style responses", () => {
  const d = ChapterFeedbackSchema.parse(read);
  assert.deepEqual(d.facts, []);
  assert.deepEqual(d.continuity, []);
});

test("fact categories are case-insensitive and unknown ones fall back to world", () => {
  const d = ChapterFeedbackSchema.parse({
    ...read,
    facts: [
      { subject: "Mara", category: "Character", fact: "Grey eyes." },
      { subject: "The war", category: "history", fact: "Started ten years ago." },
    ],
  });
  assert.deepEqual(
    d.facts.map((f) => f.category),
    ["character", "world"],
  );
});

test("pitch kit lists default to empty", () => {
  const k = PitchKitSchema.parse({ logline: "l", blurb: "b", synopsis: "s", queryLetter: "q" });
  assert.deepEqual([k.sellingPoints, k.comps, k.pitchNotes], [[], [], []]);
});
