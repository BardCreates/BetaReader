import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksFromHtml, blocksFromMarkdown, chaptersFromBlocks, decodeEntities, looksLikeTitlePage } from "./structure";

const prose = (n: number, w = "word") => Array.from({ length: n }, (_, i) => `${w}${i}`).join(" ");

// Shaped like a Dabble "Manuscript Format" Word export, after mammoth: a title page, chapter
// headings, scene separators.
const manuscriptHtml = `
<p>Jane Writer</p><p>jane@example.com</p><p>About 85,000 words</p>
<h1>The Lantern Road</h1><p>by Jane Writer</p>
<h2>The Orchard</h2><p>She walked out at dawn.</p><p>#</p><p>Later, the &ldquo;rain&rdquo; came &amp; went.</p>
<h2>Ashes</h2><p>The house was burning.<br />Nobody moved.</p>
<h2>The Ferry</h2><p>Across the water.</p>`;

test("Dabble-style Word export: chapters from headings, title page dropped, separators become scene breaks", () => {
  const ch = chaptersFromBlocks(blocksFromHtml(manuscriptHtml));
  assert.ok(ch);
  assert.deepEqual(
    ch.map((c) => c.title),
    ["The Orchard", "Ashes", "The Ferry"],
  );
  assert.equal(ch[0].content, "She walked out at dawn.\n\n* * *\n\nLater, the “rain” came & went.");
  assert.equal(ch[1].content, "The house was burning.\nNobody moved.");
});

test("scene-title headings below the chapter level become scene breaks", () => {
  const html = `<h1>One</h1><h2>Scene A</h2><p>First.</p><h2>Scene B</h2><p>Second.</p><h1>Two</h1><h2>Scene C</h2><p>Third.</p>`;
  const ch = chaptersFromBlocks(blocksFromHtml(html))!;
  assert.deepEqual(
    ch.map((c) => [c.title, c.content]),
    [
      ["One", "First.\n\n* * *\n\nSecond."],
      ["Two", "Third."],
    ],
  );
});

test("Part headings are dividers, chapters are the level below", () => {
  const html = `<h1>Part One</h1><h2>Chapter 1</h2><p>A.</p><h2>Chapter 2</h2><p>B.</p><h1>Part Two</h1><h2>Chapter 3</h2><p>C.</p>`;
  const ch = chaptersFromBlocks(blocksFromHtml(html))!;
  assert.deepEqual(
    ch.map((c) => c.title),
    ["Chapter 1", "Chapter 2", "Chapter 3"],
  );
});

test("a prose prologue before the first heading is kept as Opening", () => {
  const html = `<p>${prose(200)}</p><h1>One</h1><p>A.</p><h1>Two</h1><p>B.</p>`;
  const ch = chaptersFromBlocks(blocksFromHtml(html))!;
  assert.equal(ch[0].title, "Opening");
  assert.equal(ch.length, 3);
});

test("no heading structure returns null so the text splitter takes over", () => {
  assert.equal(chaptersFromBlocks(blocksFromHtml(`<p>Chapter 1</p><p>A.</p><p>Chapter 2</p><p>B.</p>`)), null);
  assert.equal(chaptersFromBlocks(blocksFromHtml(`<h1>Only one</h1><p>A.</p>`)), null);
});

test("Dabble-style Markdown export", () => {
  const md = `# The Lantern Road\n\n## The Orchard\n\nShe walked out *at dawn*.\n\n* * *\n\nLater.\n\n## Ashes\n\nThe house **was** burning.\n`;
  const ch = chaptersFromBlocks(blocksFromMarkdown(md))!;
  assert.deepEqual(
    ch.map((c) => [c.title, c.content]),
    [
      ["The Orchard", "She walked out at dawn.\n\n* * *\n\nLater."],
      ["Ashes", "The house was burning."],
    ],
  );
});

test("title page detection and entity decoding", () => {
  assert.ok(looksLikeTitlePage("Jane Writer\njane@example.com\n85,000 words"));
  assert.ok(!looksLikeTitlePage("The morning the river froze, nobody in the village went to work."));
  assert.equal(decodeEntities("&#8220;Hi&#x201D; &amp; bye&nbsp;"), "“Hi” & bye ");
});

test("an interlude or epilogue above chapter level stays in place as its own section", () => {
  const html = `<h1>Part One</h1><h2>One</h2><p>A.</p><h2>Two</h2><p>B.</p><h1>Interlude</h1><p>${prose(500, "i")}</p><h1>Part Two</h1><h2>Three</h2><p>C.</p><h1>Epilogue</h1><p>The end.</p>`;
  const ch = chaptersFromBlocks(blocksFromHtml(html))!;
  assert.deepEqual(
    ch.map((c) => c.title),
    ["One", "Two", "Interlude", "Three", "Epilogue"],
  );
});

test("a prologue starting 'By the time…' is kept, and a title page with prose after it is kept as front matter", () => {
  const html = `<p>By the time the river froze, nobody went to work. ${prose(200)}</p><h1>One</h1><p>A.</p><h1>Two</h1><p>B.</p>`;
  assert.equal(chaptersFromBlocks(blocksFromHtml(html))![0].title, "Opening");
  const html2 = `<p>jane@example.com</p><p>${prose(200)}</p><h1>One</h1><p>A.</p><h1>Two</h1><p>B.</p>`;
  assert.equal(chaptersFromBlocks(blocksFromHtml(html2))![0].title, "Front matter");
});

test("dialogue made of punctuation is not a scene break", () => {
  const blocks = blocksFromHtml(`<p>“…”</p><p>—</p><p>?!</p><p>* * *</p><p>#</p><p>◆</p>`);
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["para", "para", "para", "break", "break", "break"],
  );
});

test("long unnamed parts are recognised as parts, not chapters", () => {
  const ch = (t: string) => `<h2>${t}</h2><p>${prose(4000)}</p>`;
  const html = `<h1>The Fall</h1>${ch("One")}${ch("Two")}${ch("Three")}${ch("Four")}<h1>The Rise</h1>${ch("Five")}${ch("Six")}${ch("Seven")}${ch("Eight")}`;
  const titles = chaptersFromBlocks(blocksFromHtml(html))!.map((c) => c.title);
  assert.deepEqual(titles, ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"]);
});
