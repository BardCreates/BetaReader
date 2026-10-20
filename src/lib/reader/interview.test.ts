import { test } from "node:test";
import assert from "node:assert/strict";
import { INTERVIEW_MODES, factsAbout, interviewMode, isInterviewMode } from "./interview";

test("interview modes: unknown values fall back to an open interview", () => {
  assert.ok(isInterviewMode("motivation"));
  assert.ok(!isInterviewMode("constructor") && !isInterviewMode("toString") && !isInterviewMode(null));
  assert.equal(interviewMode("nope"), INTERVIEW_MODES.open);
  assert.equal(INTERVIEW_MODES.open.prompt, "");
  assert.match(INTERVIEW_MODES.backstory.prompt, /stress-testing a backstory/);
});

test("factsAbout matches full name, aliases and first name, never part of another subject", () => {
  const facts = [
    { subject: "Mara Holt", fact: "grey eyes" },
    { subject: "mara", fact: "left-handed" },
    { subject: "Mrs. Holt", fact: "a widow" },
    { subject: "Mara's sister", fact: "left at 17" },
    { subject: "Tom", fact: "Mara's husband" },
  ];
  assert.deepEqual(
    factsAbout(facts, "Mara Holt", ["Mrs. Holt"]).map((f) => f.fact),
    ["grey eyes", "left-handed", "a widow"],
  );
  // Very short first names aren't matched on their own.
  assert.deepEqual(factsAbout([{ subject: "Al", fact: "x" }], "Al Jones", []), []);
});
