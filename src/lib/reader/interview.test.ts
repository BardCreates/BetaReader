import { test } from "node:test";
import assert from "node:assert/strict";
import { INTERVIEW_MODES, MODE_IDS, interviewPrompt, modeFor } from "./interview";

test("unknown or missing modes fall back to open conversation", () => {
  assert.equal(modeFor(null), "open");
  assert.equal(modeFor("nonsense"), "open");
  assert.equal(modeFor("canon"), "canon");
});

test("open conversation adds nothing; guided modes name the character and ask for gaps", () => {
  assert.equal(interviewPrompt("open", "Mara"), "");
  const p = interviewPrompt("motivation", "Mara");
  assert.match(p, /as Mara would/);
  assert.doesNotMatch(p, /\{name\}/);
  for (const id of MODE_IDS.filter((m) => m !== "open")) assert.match(INTERVIEW_MODES[id].prompt, /_Gaps:_/);
});

test("canon mode forbids invention", () => {
  assert.match(interviewPrompt("canon", "Mara"), /do NOT invent/);
});

test("every mode has starters", () => {
  for (const id of MODE_IDS) assert.ok(INTERVIEW_MODES[id].starters("Mara").length >= 3);
});
