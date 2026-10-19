import { test } from "node:test";
import assert from "node:assert/strict";
import { matchChapters, summarizeChanges, titleKey } from "./match";

// Distinct, deterministic prose per chapter.
const words = ["river", "lantern", "orchard", "letter", "smoke", "glass", "knife", "tower", "winter", "harbor", "ember", "salt"];
const prose = (seed: number, n = 300) =>
  Array.from({ length: n }, (_, i) => words[(i * (seed + 3) + seed * 7 + Math.floor(i / 5)) % words.length] + (i % 11 === 10 ? "." : "")).join(" ");

const existing = [0, 1, 2, 3].map((i) => ({ id: `c${i}`, index: i, title: `Chapter ${i + 1}`, content: prose(i) }));

test("identical draft: everything matches as unchanged", () => {
  const changes = matchChapters(existing, existing.map((c) => ({ title: c.title, content: c.content })));
  assert.deepEqual(summarizeChanges(changes), { same: 4, changed: 0, added: 0, removed: 0 });
});

test("whitespace and quote style differences don't count as changes", () => {
  const incoming = existing.map((c) => ({ title: c.title, content: c.content.replace(/\. /g, ".\r\n\r\n") }));
  // Paragraph breaks are a real edit; quotes alone are not.
  const quotes = existing.map((c) => ({ title: c.title, content: `“${c.content}”` }));
  const q = matchChapters(
    existing.map((c) => ({ ...c, content: `"${c.content}"` })),
    quotes,
  );
  assert.equal(summarizeChanges(q).same, 4);
  assert.equal(summarizeChanges(matchChapters(existing, incoming)).changed, 4);
});

test("an edited chapter is matched and marked changed", () => {
  const incoming = existing.map((c) => ({ title: c.title, content: c.content }));
  incoming[1] = { title: "Chapter 2", content: existing[1].content.replace(/lantern/g, "candle") + " A new closing line." };
  const changes = matchChapters(existing, incoming);
  const c = changes.find((x) => x.kind === "changed");
  assert.ok(c && c.kind === "changed");
  assert.equal(c.id, "c1");
  assert.ok(c.changedPct > 0 && c.changedPct < 100);
});

test("a chapter inserted in the middle shifts the rest without breaking matches", () => {
  const incoming = existing.map((c, i) => ({ title: `Chapter ${i + (i >= 2 ? 2 : 1)}`, content: c.content }));
  incoming.splice(2, 0, { title: "Chapter 3", content: prose(9) });
  const changes = matchChapters(existing, incoming);
  assert.deepEqual(summarizeChanges(changes), { same: 4, changed: 0, added: 1, removed: 0 });
  const added = changes.find((c) => c.kind === "new");
  assert.equal(added?.kind === "new" && added.newIndex, 2);
  const third = changes.find((c) => c.kind === "same" && c.id === "c2");
  assert.equal(third?.kind === "same" && third.newIndex, 3);
});

test("a removed chapter is reported, the others still match", () => {
  const incoming = existing.filter((_, i) => i !== 1).map((c) => ({ title: c.title, content: c.content }));
  const changes = matchChapters(existing, incoming);
  assert.deepEqual(summarizeChanges(changes), { same: 3, changed: 0, added: 0, removed: 1 });
  assert.equal(changes.find((c) => c.kind === "removed")?.kind === "removed" && changes.find((c) => c.kind === "removed")!.oldIndex, 1);
});

test("a heavily rewritten chapter still matches when its title is the same", () => {
  const old = [
    { id: "a", index: 0, title: "Chapter 1: The Letter", content: prose(1) },
    { id: "b", index: 1, title: "Chapter 2: Smoke", content: prose(2) },
  ];
  const incoming = [
    { title: "Chapter 1: The Letter", content: prose(1) },
    { title: "Chapter 2: Smoke", content: prose(11) }, // completely new text
  ];
  const changes = matchChapters(old, incoming);
  assert.deepEqual(summarizeChanges(changes), { same: 1, changed: 1, added: 0, removed: 0 });
});

test("title keys ignore chapter numbers", () => {
  assert.equal(titleKey("Chapter 12: The Fall"), "the fall");
  assert.equal(titleKey("CHAPTER TWO - Smoke"), "smoke");
  assert.equal(titleKey("Chapter 3"), "");
  assert.equal(titleKey("Prologue"), "prologue");
});
