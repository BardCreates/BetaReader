import { test } from "node:test";
import assert from "node:assert/strict";
import { checkedLine, compareDraft, draftSummary, parseDraftSummary, type DraftChapterInput } from "./drafts";

test("a draft summary lists chapter titles by what happened to them", () => {
  const s = draftSummary([
    { kind: "same", id: "a", oldIndex: 0, newIndex: 0, oldTitle: "One", title: "One", words: 900 },
    { kind: "changed", id: "b", oldIndex: 1, newIndex: 1, oldTitle: "Two", title: "Two: The Orchard", wordsBefore: 900, words: 1000, changedPct: 18 },
    { kind: "new", newIndex: 2, title: "Three", words: 1200 },
    { kind: "removed", id: "c", oldIndex: 2, oldTitle: "Old Three", wordsBefore: 800 },
  ]);
  assert.deepEqual(s, { changed: ["Two: The Orchard"], added: ["Three"], removed: ["Old Three"], unchanged: 1 });
});

test("a stored summary that's missing fields reads as empty, not an error", () => {
  assert.deepEqual(parseDraftSummary(null), { changed: [], added: [], removed: [], unchanged: 0 });
  assert.deepEqual(parseDraftSummary({ changed: ["A", 3] }).changed, ["A"]);
});

const review = (over: Partial<NonNullable<DraftChapterInput["review"]>>) => ({
  draft: 2,
  engagement: 7,
  revisionCheck: null,
  continuity: [],
  ...over,
});

test("compareDraft covers re-read chapters, skips unchanged ones, and lists what's still waiting", () => {
  const result = compareDraft(2, [
    { number: 1, title: "One", stale: false, review: review({ draft: 1 }) }, // unchanged since draft 1
    {
      number: 2,
      title: "Two",
      stale: false,
      review: review({
        engagement: 8,
        revisionCheck: {
          previousEngagement: 5,
          notes: [
            { quote: "a", comment: "c", verdict: "fixed", explanation: "e" },
            { quote: "b", comment: "c", verdict: "still_there", explanation: "e" },
          ],
        },
        continuity: [{ id: "n1", quote: "blue eyes", comment: "Her eyes were green in chapter 1." }],
      }),
    },
    { number: 3, title: "Three", stale: false, review: review({ engagement: 6 }) }, // new in draft 2, read
    { number: 4, title: "Four", stale: true, review: review({ draft: 1 }) }, // changed, not re-read yet
    { number: 5, title: "Five", stale: false, review: null }, // new, not read yet
  ]);
  assert.deepEqual(
    result.chapters.map((c) => [c.number, c.kind, c.before, c.after]),
    [
      [2, "revised", 5, 8],
      [3, "new", null, 6],
    ],
  );
  assert.deepEqual(result.waiting, [
    { number: 4, title: "Four" },
    { number: 5, title: "Five" },
  ]);
  assert.deepEqual(result.totals, { fixed: 1, partly: 0, stillThere: 1, continuity: 1, up: 1, down: 0 });
});

test("draft 1 has nothing waiting just because a chapter hasn't been read", () => {
  assert.deepEqual(compareDraft(1, [{ number: 1, title: "One", stale: false, review: null }]).waiting, []);
});

test("checkedLine", () => {
  assert.equal(checkedLine([]), "No earlier issues to check");
  assert.equal(checkedLine([{ verdict: "fixed" }]), "1 of 1 earlier issue fixed");
  assert.equal(checkedLine([{ verdict: "fixed" }, { verdict: "partly" }]), "1 of 2 earlier issues fixed");
});
