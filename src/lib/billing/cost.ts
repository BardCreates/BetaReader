/**
 * What an AI call costs, from its token usage. Prices in dollars per million tokens
 * (platform.claude.com/docs/en/about-claude/pricing). Unknown models are priced as Opus,
 * so a misconfigured model can only make the backstop stricter, never looser.
 */

type Price = { input: number; cacheWrite: number; cacheRead: number; output: number };

const SONNET: Price = { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 };
const OPUS: Price = { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 };
const HAIKU: Price = { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 };
const HAIKU_LONG: Price = { input: 0.5, cacheWrite: 0.625, cacheRead: 0.05, output: 2.5 }; // prompts over 100k tokens

export type TokenUsage = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

export function priceFor(model: string, promptTokens: number): Price {
  const m = model.toLowerCase();
  if (m.includes("haiku")) return promptTokens > 100_000 ? HAIKU_LONG : HAIKU;
  if (m.includes("sonnet")) return SONNET;
  return OPUS;
}

/** Cost in millionths of a dollar (integer, so it adds up exactly). */
export function costMicros(model: string, u: TokenUsage): number {
  const cacheRead = u.cacheRead ?? 0;
  const cacheWrite = u.cacheWrite ?? 0;
  const p = priceFor(model, u.input + cacheRead + cacheWrite);
  // $/MTok × tokens = micro-dollars.
  return Math.ceil(u.input * p.input + cacheWrite * p.cacheWrite + cacheRead * p.cacheRead + u.output * p.output);
}

/** Token counts from an Anthropic response's `usage`. */
export function fromApiUsage(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): TokenUsage {
  return {
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
}

export const formatUsd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;
