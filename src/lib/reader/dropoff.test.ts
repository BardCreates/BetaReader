import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDropoff, dropoffRisk, type DropoffInput } from "./dropoff";

const ch = (number: number, engagement: number | null, confusion: number | null = null, extra: Partial<DropoffInput> = {}): DropoffInput => ({
  number,
  title: `Chapter ${number}`,
  read: engagement != null,
  engagement,
  confusion,
  drift: null,
  fallback: null,
  ...extra,
});

test("drop is measured from the previous chapter that was read", () => {
  const { rows } = buildDropoff([ch(1, 8), ch(2, null), ch(3, 5)]);
  assert.equal(rows[0].drop, null);
  assert.equal(rows[1].drop, null);
  assert.equal(rows[2].drop, 3);
});

test("risk rises with low engagement, a fall and confusion", () => {
  assert.ok(dropoffRisk(4, 3, 7) > dropoffRisk(4, 0, null));
  assert.ok(dropoffRisk(4, 0, null) > dropoffRisk(8, 0, null));
});

test("hotspots are the riskiest flagged chapters, at most three", () => {
  const { hotspots } = buildDropoff([ch(1, 9), ch(2, 8), ch(3, 4, 7), ch(4, 8), ch(5, 6), ch(6, 3), ch(7, 9)]);
  assert.deepEqual(
    hotspots.map((h) => h.number),
    [3, 6, 5],
  );
});

test("a gripping book has no hotspots", () => {
  assert.equal(buildDropoff([ch(1, 9), ch(2, 8), ch(3, 9)]).hotspots.length, 0);
});

test("the drift passage is preferred over the fallback note", () => {
  const { rows } = buildDropoff([
    ch(1, 5, 2, { drift: { quote: "q", reason: "r" }, fallback: { quote: "f", reason: "x", noteId: "n" } }),
    ch(2, 5, 2, { fallback: { quote: "f", reason: "x", noteId: "n" } }),
  ]);
  assert.equal(rows[0].passage?.quote, "q");
  assert.equal(rows[1].passage?.noteId, "n");
});
