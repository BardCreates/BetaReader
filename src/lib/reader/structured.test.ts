import { test } from "node:test";
import assert from "node:assert/strict";
import { toStructuredSchema } from "./structured";
import { BookReportSchema, ChapterFeedbackSchema, bookReportTool, chapterFeedbackTool } from "./schemas";

const FORBIDDEN = ["minimum", "maximum", "minLength", "maxLength", "maxItems", "multipleOf"];

function walk(node: unknown, visit: (n: Record<string, unknown>) => void) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (!node || typeof node !== "object") return;
  visit(node as Record<string, unknown>);
  for (const [k, v] of Object.entries(node)) {
    if (k === "properties") Object.values(v as object).forEach((p) => walk(p, visit));
    else walk(v, visit);
  }
}

for (const tool of [chapterFeedbackTool, bookReportTool]) {
  test(`${tool.name}: schema only uses structured-output features`, () => {
    const s = toStructuredSchema(tool.input_schema);
    let objects = 0;
    walk(s, (n) => {
      for (const k of FORBIDDEN) assert.ok(!(k in n), `${k} should be removed`);
      if (typeof n.minItems === "number") assert.ok(n.minItems <= 1);
      if (n.type === "object") {
        objects++;
        assert.equal(n.additionalProperties, false);
      }
    });
    assert.ok(objects >= 2);
  });
}

test("constraints are restated in descriptions", () => {
  const s = toStructuredSchema(chapterFeedbackTool.input_schema) as { properties: { engagement: { description: string } } };
  assert.match(s.properties.engagement.description, /minimum: 1, maximum: 10/);
});

test("chapter feedback parses with odd casing and out-of-range scores", () => {
  const parsed = ChapterFeedbackSchema.parse({
    reaction: "r", summary: "s", engagement: 12.4, strengths: [], questions: [], predictions: [], memory: "m",
    notes: [{ kind: "Issue", category: "PROSE", severity: 0, quote: "abcdef", comment: "c", suggestion: null }],
  });
  assert.equal(parsed.engagement, 10);
  assert.equal(parsed.notes[0].kind, "issue");
  assert.equal(parsed.notes[0].category, "prose");
  assert.equal(parsed.notes[0].severity, 1);
});

test("book report parses with capitalised thread status", () => {
  const r = BookReportSchema.parse({
    headline: "h", letter: "l", working: [], characters: [], pacing: "p", revisionPlan: [],
    notWorking: [{ title: "t", detail: "d", chapters: [1], fix: "f", priority: 5 }],
    threads: [{ thread: "x", status: "Dropped", note: "n" }],
  });
  assert.equal(r.threads[0].status, "dropped");
  assert.equal(r.notWorking[0].priority, 3);
});
