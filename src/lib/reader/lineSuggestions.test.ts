import { test } from "node:test";
import assert from "node:assert/strict";
import { isMechanical, toSuggestions, wordsChanged } from "./lineSuggestions";

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

test("a mechanical fix that changes more than two words becomes a flag", () => {
  assert.equal(wordsChanged("their going home", "they're going home"), 1);
  assert.equal(wordsChanged("the the cat", "the cat"), 1);
  const [fix, rewrite] = toSuggestions([
    { quote: "their going", replacement: "they're going", type: "grammar", explanation: "Wrong word." },
    { quote: "Him and me went to the store quickly", replacement: "We hurried to the store", type: "grammar", explanation: "Pronoun case." },
  ]);
  assert.equal(fix.flag, false);
  assert.deepEqual([rewrite.flag, rewrite.replacement], [true, ""]);
});
