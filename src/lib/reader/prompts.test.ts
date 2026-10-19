import { test } from "node:test";
import assert from "node:assert/strict";
import { chapterUserPrompt } from "./prompts";

const base = { index: 2, total: 10, title: "Ashes", content: "She opened the letter.", memory: "Mara, a letter." };

test("open questions and predictions are listed with ids before the chapter", () => {
  const p = chapterUserPrompt({
    ...base,
    openThreads: [
      { id: "Q1", kind: "question", text: "Who sent the letter?", raisedIn: 1 },
      { id: "P1", kind: "prediction", text: "The sister returns.", raisedIn: 2 },
    ],
  });
  assert.match(p, /Q1 \(question, from chapter 1\): Who sent the letter\?/);
  assert.ok(p.indexOf("<open_list>") < p.indexOf("<chapter>"));
});

test("the author's intent comes after the chapter, never before", () => {
  const p = chapterUserPrompt({ ...base, intent: "The reader should suspect the brother." });
  assert.ok(p.indexOf("<author_intent>") > p.indexOf("</chapter>"));
  assert.match(p, /Do NOT let it change your reaction/);
});

test("previous issues are listed for a revision check", () => {
  const p = chapterUserPrompt({
    ...base,
    previous: { engagement: 5, issues: [{ id: "N1", quote: "deep sense of dread", comment: "Telling.", authorStatus: "marked fixed" }] },
  });
  assert.match(p, /you gave it 5\/10 then/);
  assert.match(p, /N1 \[marked fixed\] "deep sense of dread"/);
  assert.ok(p.indexOf("<previous_issues>") > p.indexOf("</chapter>"));
});

test("without intent or previous issues, the optional checks are skipped", () => {
  const p = chapterUserPrompt(base);
  assert.match(p, /Leave out intentCheck and revisionCheck/);
  assert.doesNotMatch(p, /<open_list>/);
});
