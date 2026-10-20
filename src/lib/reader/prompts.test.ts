import { test } from "node:test";
import assert from "node:assert/strict";
import { castBlock, chapterUserPrompt, noteDiscussionPrompt, readerSystemPrompt } from "./prompts";

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

test("story bible is grouped by subject, given ids, and placed before the chapter", () => {
  const p = chapterUserPrompt({
    ...base,
    bible: [
      { id: "F1", subject: "Saul", fact: "Saul is injured in the left leg.", chapter: 1 },
      { id: "F2", subject: "Mara", fact: "Mara has grey eyes.", chapter: 1 },
      { id: "F3", subject: "saul", fact: "Saul is a Ghost Knight.", chapter: 2 },
    ],
  });
  assert.ok(p.indexOf("<story_bible>") < p.indexOf("<chapter>"));
  assert.match(p, /Saul\n {2}F1 \(ch\. 1\) Saul is injured in the left leg\.\n {2}F3 \(ch\. 2\) Saul is a Ghost Knight\./);
});

test("no story bible section for the first chapter", () => {
  assert.ok(!chapterUserPrompt({ ...base, index: 0, bible: [] }).includes("<story_bible>"));
});

test("pronoun guidance lists each character and goes in the reader's brief", () => {
  const cast = castBlock([
    { name: "Mara Holt", aliases: ["Mara"], pronouns: "she/her" },
    { name: "Ash", aliases: [], pronouns: "they/them" },
  ]);
  assert.match(cast, /- Mara Holt \(also "Mara"\): she\/her/);
  assert.match(cast, /- Ash: they\/them/);
  assert.match(cast, /tells you nothing about the story/);
  assert.equal(castBlock([]), "");
  const system = readerSystemPrompt({ title: "T", genre: null, audience: null, authorGoals: null, persona: "enthusiast", chapterCount: 3, cast });
  assert.ok(system.includes(`Mara Holt (also "Mara"): she/her`));
});

test("the reader never writes replacement prose", () => {
  const system = readerSystemPrompt({ title: "T", genre: null, audience: null, authorGoals: null, persona: "enthusiast", chapterCount: 3 });
  assert.match(system, /You read; you never write/);
  assert.doesNotMatch(system, /short example rewrite is fine/);
});

test("a note discussion is anchored to the note and the chapter, and keeps the reader in order", () => {
  const p = noteDiscussionPrompt(
    { title: "T", genre: "Fantasy", audience: null, authorGoals: null, persona: "enthusiast", chapterCount: 20 },
    {
      chapterNumber: 19,
      chapterTitle: "The Tower",
      content: "Saul took the tower stairs two at a time.",
      memoryBefore: "Saul was wounded in the ambush.",
      reaction: "I was thrown by Saul running.",
      intent: "Show Saul pushing through pain.",
      note: {
        kind: "ISSUE",
        category: "continuity",
        quote: "Saul took the tower stairs two at a time.",
        comment: "His leg was wounded.",
        suggestion: "Establish the healing, or show the limp.",
        status: "DISMISSED",
        conflict: { fact: "Saul's left leg is badly wounded.", chapter: 3 },
      },
    },
  );
  assert.match(p, /while reading chapter 19 you left the note below/);
  assert.match(p, /Passage: "Saul took the tower stairs two at a time\."/);
  assert.match(p, /status: the author disagreed with it/);
  assert.match(p, /contradicts \(chapter 3\): Saul's left leg is badly wounded\./);
  assert.match(p, /only know the book up to the end of chapter 19/);
  assert.match(p, /don't draft replacement sentences/);
  assert.ok(p.indexOf("<author_intent>") > -1 && p.indexOf("<chapter>") > p.indexOf("<your_note>"));
});

test("a note discussion for chapter 1 has no reader memory block", () => {
  const p = noteDiscussionPrompt(
    { title: "T", genre: null, audience: null, authorGoals: null, persona: "enthusiast", chapterCount: 3 },
    {
      chapterNumber: 1,
      chapterTitle: "One",
      content: "Text.",
      memoryBefore: null,
      reaction: null,
      intent: null,
      note: { kind: "PRAISE", category: "voice", quote: "Text.", comment: "Lovely.", suggestion: null, status: "OPEN" },
    },
  );
  assert.doesNotMatch(p, /<reader_memory>/);
  assert.doesNotMatch(p, /<author_intent>/);
});
