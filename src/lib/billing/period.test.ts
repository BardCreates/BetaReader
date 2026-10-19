import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonth, applyCost, canSpend, rollPeriod, split, type UsageRow } from "./period";

const row = (over: Partial<UsageRow> = {}): UsageRow => ({
  plan: "author",
  periodStart: new Date("2026-10-01T00:00:00Z"),
  periodEnd: new Date("2026-11-01T00:00:00Z"),
  wordsUsed: 0,
  grammarWordsUsed: 0,
  chatUsed: 0,
  pitchKitsUsed: 0,
  costMicros: 0,
  passWords: 0,
  passGrammarWords: 0,
  passChat: 0,
  passPitchKits: 0,
  passCostMicros: 0,
  ...over,
});

test("addMonth clamps to the end of shorter months", () => {
  assert.equal(addMonth(new Date("2026-01-31T10:00:00Z")).toISOString(), "2026-02-28T10:00:00.000Z");
  assert.equal(addMonth(new Date("2026-12-15T00:00:00Z")).toISOString(), "2027-01-15T00:00:00.000Z");
});

test("free allowances never reset", () => {
  assert.equal(rollPeriod({ plan: "free", periodStart: new Date(0), periodEnd: null }, new Date()), null);
});

test("a paid period inside its window doesn't change", () => {
  assert.equal(rollPeriod(row(), new Date("2026-10-20T00:00:00Z")), null);
});

test("an ended paid period rolls forward whole months and resets usage", () => {
  const r = rollPeriod(row({ wordsUsed: 999 }), new Date("2027-01-10T00:00:00Z"));
  assert.ok(r);
  assert.equal(r.periodStart.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(r.periodEnd.toISOString(), "2027-02-01T00:00:00.000Z");
  assert.equal(r.wordsUsed, 0);
});

test("a paid plan with no period starts one now", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const r = rollPeriod({ plan: "pro", periodStart: new Date(0), periodEnd: null }, now);
  assert.equal(r?.periodStart.toISOString(), now.toISOString());
  assert.equal(r?.periodEnd.toISOString(), "2026-11-19T12:00:00.000Z");
});

test("usage comes from the plan first, then the book pass", () => {
  const u = row({ wordsUsed: 140_000, passWords: 50_000 });
  assert.deepEqual(split(u, "words", 5_000), { fromPlan: 5_000, fromPass: 0 });
  assert.deepEqual(split(u, "words", 30_000), { fromPlan: 10_000, fromPass: 20_000 });
  assert.equal(split(u, "words", 60_001), null);
});

test("free plan: 10,000 words, then nothing without a pass", () => {
  assert.ok(split(row({ plan: "free" }), "words", 10_000));
  assert.equal(split(row({ plan: "free", wordsUsed: 8_000 }), "words", 2_001), null);
});

test("spend ceiling: blocked at the plan cap unless pass credit remains", () => {
  assert.equal(canSpend({ plan: "author", costMicros: 7_999_999, passCostMicros: 0 }), true);
  assert.equal(canSpend({ plan: "author", costMicros: 8_000_000, passCostMicros: 0 }), false);
  assert.equal(canSpend({ plan: "author", costMicros: 8_000_000, passCostMicros: 1 }), true);
});

test("spend over the cap is drawn from pass credit", () => {
  assert.deepEqual(applyCost({ plan: "author", costMicros: 7_500_000, passCostMicros: 6_000_000 }, 1_000_000), {
    costMicros: 8_500_000,
    passCostMicros: 5_500_000,
  });
  assert.deepEqual(applyCost({ plan: "author", costMicros: 1_000_000, passCostMicros: 6_000_000 }, 1_000_000), {
    costMicros: 2_000_000,
    passCostMicros: 6_000_000,
  });
});
