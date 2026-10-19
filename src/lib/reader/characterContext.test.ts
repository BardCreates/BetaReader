import { test } from "node:test";
import assert from "node:assert/strict";
import { characterExcerpts, mentionRegex, searchTerms } from "./characterContext";

const chapters = [
  { index: 0, title: "The Letter", content: "Rain all night.\n\nMara Holt found the letter.\n\nShe left it on the table.\n\nThe house was quiet." },
  { index: 1, title: "The Orchard", content: "Trees.\n\nHer brother Tom waited.\n\nNobody spoke.\n\nLater, Holt walked alone." },
  { index: 2, title: "Ashes", content: "Mara read it twice.\n\nThe end." },
];

test("search terms include name parts but not titles", () => {
  assert.deepEqual(searchTerms("Dr. Mara Holt", ["Mrs. Holt"]).sort(), ["Dr. Mara Holt", "Holt", "Mara", "Mrs. Holt"].sort());
});

test("names match whole words only", () => {
  const re = mentionRegex(["Tom"]);
  assert.ok(re.test("Tom waited."));
  assert.ok(!re.test("Tomorrow came."));
  assert.ok(!re.test("atomic"));
});

test("excerpts include the mention and a paragraph either side, grouped by chapter", () => {
  const { text, mentions, chaptersWithMentions } = characterExcerpts(chapters, "Mara Holt", []);
  assert.equal(mentions, 3);
  assert.deepEqual(chaptersWithMentions, [1, 2, 3]);
  assert.match(text, /## Chapter 1: The Letter\n\nRain all night\.\n\nMara Holt found the letter\.\n\nShe left it on the table\./);
  assert.doesNotMatch(text, /The house was quiet/);
});

test("as-of limits what the character knows", () => {
  const { text } = characterExcerpts(chapters, "Mara Holt", [], { asOfChapter: 2 });
  assert.doesNotMatch(text, /Ashes/);
  assert.match(text, /Later, Holt walked alone/);
});

test("a word budget keeps the first and last appearances", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    index: i,
    title: `C${i + 1}`,
    content: Array.from({ length: 5 }, (_, j) => `Mara thing ${i}-${j} ${"word ".repeat(40)}`).join("\n\n"),
  }));
  const { text } = characterExcerpts(many, "Mara", [], { maxWords: 2000 });
  const count = text.split(/\s+/).length;
  assert.ok(count <= 2300, `kept ${count} words`);
  assert.match(text, /Chapter 1: C1/);
  assert.match(text, /Chapter 30: C30/);
});
