import { test } from "node:test";
import assert from "node:assert/strict";
import { CASES } from "./cases";
import { checkExpectation, generalMetrics, quoteInSpan } from "./graders";
import { mockRead } from "./mock";

test("every case's spans really appear in its chapter", () => {
  for (const c of CASES)
    for (const e of c.expect)
      if ((e.type === "flagsIssue" || e.type === "flagsContinuity") && e.span)
        assert.ok(c.chapter.content.includes(e.span), `${c.id}: span missing`);
});

test("quoteInSpan anchors loosely and checks overlap", () => {
  const text = "One two three. Four five six. Seven eight nine.";
  assert.equal(quoteInSpan(text, "Four five six", "Four five six."), true);
  assert.equal(quoteInSpan(text, "Seven eight", "Four five six."), false);
  assert.equal(quoteInSpan(text, "Seven eight", ""), true);
  assert.equal(quoteInSpan(text, "not in the text at all", ""), false);
});

test("mock output grades as expected (harness self-check)", () => {
  const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));
  const grade = (id: string) => byId[id].expect.map((e) => checkExpectation(e, mockRead(byId[id]), byId[id].chapter.content).pass);
  assert.deepEqual(grade("infodump"), [true]);
  assert.deepEqual(grade("continuity"), [false]); // the mock misses it on purpose
  assert.deepEqual(grade("injection"), [true, true, true]);
  assert.deepEqual(grade("thread"), [true]);
  assert.deepEqual(grade("clean"), [true, true]);
});

test("quote fidelity counts unanchored quotes", () => {
  const c = CASES.find((x) => x.id === "injection")!;
  assert.equal(generalMetrics(mockRead(c), c.chapter.content).quoteFidelity, 0.5);
});
