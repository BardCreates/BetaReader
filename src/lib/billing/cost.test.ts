import { test } from "node:test";
import assert from "node:assert/strict";
import { costMicros } from "./cost";

test("Sonnet: $2 in / $10 out per million tokens", () => {
  assert.equal(costMicros("claude-sonnet-5-5", { input: 1_000_000, output: 0 }), 2_000_000);
  assert.equal(costMicros("claude-sonnet-5-5", { input: 0, output: 100_000 }), 1_000_000);
});

test("cache reads are cheap, cache writes cost a bit more", () => {
  assert.equal(costMicros("claude-sonnet-5-5", { input: 0, output: 0, cacheRead: 1_000_000 }), 100_000);
  assert.equal(costMicros("claude-sonnet-5-5", { input: 0, output: 0, cacheWrite: 1_000_000 }), 2_500_000);
});

test("Haiku has a higher tier for prompts over 100k tokens", () => {
  assert.equal(costMicros("claude-haiku-5-5", { input: 100_000, output: 0 }), 10_000);
  assert.equal(costMicros("claude-haiku-5-5", { input: 100_001, output: 0 }), Math.ceil(100_001 * 0.5));
});

test("unknown models are priced conservatively (as Opus)", () => {
  assert.equal(costMicros("some-new-model", { input: 1_000_000, output: 0 }), 4_000_000);
});

test("a typical chapter read costs cents", () => {
  // ~4k-word chapter: ~9k tokens in (incl. system prompt), ~5k out.
  const c = costMicros("claude-sonnet-5-5", { input: 9_000, output: 5_000 });
  assert.ok(c > 50_000 && c < 100_000, String(c));
});
