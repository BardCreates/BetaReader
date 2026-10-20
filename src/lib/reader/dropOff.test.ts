import { test } from "node:test";
import assert from "node:assert/strict";
import { dropPoints, parseDropOff } from "./dropOff";

test("parseDropOff accepts a stored drop-off and rejects anything else", () => {
  assert.deepEqual(parseDropOff({ quote: "The council met.", why: "We know the vote." }), { quote: "The council met.", why: "We know the vote." });
  assert.equal(parseDropOff(null), null);
  assert.equal(parseDropOff({ quote: "", why: "x" }), null);
  assert.equal(parseDropOff({ quote: "x" }), null);
});

test("dropPoints finds the biggest falls and the low chapters, most severe first", () => {
  const points = dropPoints([
    { number: 1, engagement: 8 },
    { number: 2, engagement: 8 },
    { number: 3, engagement: 5 }, // falls 3
    { number: 4, engagement: null }, // unread: skipped, and doesn't break the chain
    { number: 5, engagement: 3 }, // falls 2 from ch. 3, and is low
    { number: 6, engagement: 7 },
    { number: 7, engagement: 6 }, // falls 1: not a drop
  ]);
  assert.deepEqual(points, [
    { number: 3, from: 8, to: 5 },
    { number: 5, from: 5, to: 3 },
  ]);
});

test("a low first chapter counts, with nothing to fall from", () => {
  assert.deepEqual(dropPoints([{ number: 1, engagement: 4 }]), [{ number: 1, from: null, to: 4 }]);
  assert.deepEqual(dropPoints([{ number: 1, engagement: 9 }]), []);
});
