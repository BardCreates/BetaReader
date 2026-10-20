import { test } from "node:test";
import assert from "node:assert/strict";
import { isMechanical, toSuggestions } from "./lineSuggestions";

test("only spelling, grammar and punctuation are one-click fixes", () => {
  assert.ok(isMechanical("spelling") && isMechanical("grammar") && isMechanical("punctuation"));
  assert.ok(!isMechanical("style") && !isMechanical("clarity") && !isMechanical("word_choice") && !isMechanical("repetition"));
});

test("flags never carry a rewrite, and no-op fixes are dropped", () => {
  const out = toSuggestions([
    { quote: "teh", replacement: "the", type: "spelling", explanation: "Typo." },
    { quote: "same", replacement: "same", type: "grammar", explanation: "No change." },
    { quote: "She walked slowly and quietly", replacement: "She crept", type: "style", explanation: "Two adverbs." },
    { quote: "the the", replacement: "", type: "punctuation", explanation: "Doubled word." },
  ]);
  assert.deepEqual(
    out.map((s) => [s.id, s.type, s.replacement, s.flag]),
    [
      ["s1", "spelling", "the", false],
      ["s2", "style", "", true],
      ["s3", "punctuation", "", false],
    ],
  );
});
