import { test } from "node:test";
import assert from "node:assert/strict";
import { compareDrafts, diffIssues, sameIssue, snapshotChapter, type SnapshotChapter, type SnapshotData, type SnapshotIssue } from "./drafts";

const issue = (quote: string, comment = "c", category = "pacing"): SnapshotIssue => ({ quote, comment, category, severity: 2, status: "OPEN" });

const chapter = (id: string, number: number, over: Partial<SnapshotChapter> = {}): SnapshotChapter => ({
  chapterId: id,
  number,
  title: `Chapter ${number}`,
  wordCount: 1000,
  read: true,
  stale: false,
  engagement: 6,
  confusion: 3,
  issues: [],
  continuity: [],
  verdicts: null,
  ...over,
});

const snap = (chapters: SnapshotChapter[], draft = 1): SnapshotData => ({ version: 1, draft, wordCount: 0, chapters, facts: 0, unanswered: 0, headline: null });

test("same issue: same category and overlapping passage", () => {
  assert.ok(sameIssue(issue("The council voted again, as before."), issue("the council voted again")));
  assert.ok(!sameIssue(issue("The council voted again."), issue("The council voted again.", "c", "clarity")));
  assert.ok(!sameIssue(issue("Rain on the roof all night", "slow"), issue("She drew the knife and ran", "rushed")));
});

test("diffIssues splits gone, kept and added", () => {
  const d = diffIssues([issue("alpha beta gamma delta"), issue("one two three four")], [issue("alpha beta gamma delta"), issue("new problem entirely here")]);
  assert.deepEqual(
    [d.gone.length, d.kept.length, d.added.length],
    [1, 1, 1],
  );
});

test("an unchanged chapter carries over without counting fixes", () => {
  const ch = chapter("a", 1, { issues: [issue("slow opening paragraph here")] });
  const c = compareDrafts(snap([ch]), snap([ch], 2));
  assert.equal(c.chapters[0].kind, "same");
  assert.equal(c.totals.fixed, 0);
  assert.equal(c.totals.introduced, 0);
});

test("a revised, re-read chapter shows fixed and new problems and the engagement change", () => {
  const before = chapter("a", 1, { engagement: 5, issues: [issue("slow opening paragraph here"), issue("the vote repeats itself again")] });
  const after = chapter("a", 1, { engagement: 8, wordCount: 1100, issues: [issue("the vote repeats itself again"), issue("a brand new muddle", "c", "clarity")] });
  const c = compareDrafts(snap([before]), snap([after], 2));
  const row = c.chapters[0];
  assert.equal(row.kind, "revised");
  assert.deepEqual([row.fixed.length, row.remaining.length, row.introduced.length], [1, 1, 1]);
  assert.deepEqual([row.engagementBefore, row.engagementAfter], [5, 8]);
});

test("a revised chapter not read yet is awaiting a read, not fixed", () => {
  const before = chapter("a", 1, { issues: [issue("slow opening paragraph here")] });
  const after = chapter("a", 1, { read: false, stale: true, issues: [issue("slow opening paragraph here")] });
  const c = compareDrafts(snap([before]), snap([after], 2));
  assert.equal(c.chapters[0].awaitingRead, true);
  assert.equal(c.totals.fixed, 0);
  assert.equal(c.totals.awaitingRead, 1);
});

test("new, removed and first-read chapters", () => {
  const c = compareDrafts(
    snap([chapter("a", 1), chapter("b", 2), chapter("c", 3, { read: false, engagement: null })]),
    snap([chapter("a", 1), chapter("c", 2, { issues: [issue("first time read")] }), chapter("d", 3, { issues: [issue("brand new chapter problem")] })], 2),
  );
  const kinds = Object.fromEntries(c.chapters.map((r) => [r.key, r.kind]));
  assert.deepEqual(kinds, { a: "same", b: "removed", c: "firstRead", d: "new" });
  assert.equal(c.totals.introduced, 1); // only the genuinely new chapter's problem
});

test("continuity: resolved, introduced and still there, matched across chapters", () => {
  const eyes = issue("her blue eyes narrowed", "Eyes were green in chapter 2.", "continuity");
  const limp = issue("he ran up the stairs", "His leg was broken in chapter 3.", "continuity");
  const name = issue("Captain Moreau", "Spelled Morrow earlier.", "continuity");
  const c = compareDrafts(
    snap([chapter("a", 1, { continuity: [eyes] }), chapter("b", 2, { continuity: [limp] })]),
    snap([chapter("a", 1, { engagement: 7, continuity: [name] }), chapter("b", 2, { engagement: 7, continuity: [limp] })], 2),
  );
  assert.deepEqual(c.continuity.resolved.map((r) => r.quote), [eyes.quote]);
  assert.deepEqual(c.continuity.introduced.map((r) => r.quote), [name.quote]);
  assert.equal(c.continuity.still, 1);
});

test("snapshotChapter marks edited-after-read chapters stale and drops dismissed notes", () => {
  const readAt = new Date("2026-01-01");
  const s = snapshotChapter({
    id: "a",
    index: 0,
    title: "One",
    wordCount: 10,
    contentUpdatedAt: new Date("2026-02-01"),
    review: {
      status: "DONE",
      readAt,
      updatedAt: readAt,
      engagement: 7,
      confusion: 2,
      revisionCheck: { notes: [{ verdict: "fixed" }, { verdict: "still_there" }] },
      notes: [
        { kind: "ISSUE", category: "pacing", severity: 2, quote: "q", comment: "c", status: "OPEN" },
        { kind: "ISSUE", category: "continuity", severity: 2, quote: "q2", comment: "c", status: "OPEN" },
        { kind: "ISSUE", category: "prose", severity: 1, quote: "q3", comment: "c", status: "DISMISSED" },
        { kind: "PRAISE", category: "voice", severity: 2, quote: "q4", comment: "c", status: "OPEN" },
      ],
    },
  });
  assert.equal(s.stale, true);
  assert.equal(s.read, false);
  assert.deepEqual([s.issues.length, s.continuity.length], [1, 1]);
  assert.deepEqual(s.verdicts, { fixed: 1, partly: 0, stillThere: 1 });
});
