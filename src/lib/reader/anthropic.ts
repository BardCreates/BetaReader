import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { fromApiUsage } from "@/lib/billing/cost";
import { estimateMicros, holdCost, settleCost, type Meter } from "@/lib/billing/usage";
import { toStructuredSchema } from "./structured";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

let client: Anthropic | null = null;
export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
  client ??= new Anthropic({ maxRetries: 4 });
  return client;
}

/**
 * Ask the model for JSON matching `schema` (structured outputs), parse it, and validate it.
 * Retries once on malformed output and once with more room if the answer was cut off.
 */
export async function callStructured<T>(opts: {
  /** Defaults to the reader model. */
  model?: string;
  system: Anthropic.TextBlockParam[];
  user: string;
  schema: unknown;
  maxTokens: number;
  parse: (input: unknown) => T;
  /** Who to bill: checked against their spend ceiling first, and every attempt's cost is recorded. */
  meter: Meter;
}): Promise<{ data: T; usage: { input: number; output: number } }> {
  const model = opts.model ?? MODEL;
  const promptChars = opts.user.length + opts.system.reduce((n, b) => n + b.text.length, 0) + JSON.stringify(opts.schema).length;
  const schema = toStructuredSchema(opts.schema);
  let maxTokens = opts.maxTokens;
  let lastError: unknown;
  const usage = { input: 0, output: 0 };

  for (let attempt = 0; attempt < 3; attempt++) {
    // Each attempt holds its worst-case cost against the spend ceiling first (throws LimitError if it can't).
    const hold = await holdCost(opts.meter.userId, estimateMicros(model, promptChars, maxTokens));
    let res;
    try {
      // Streamed so long reads don't hit the SDK's non-streaming time limit.
      res = await anthropic()
        .messages.stream({
          model,
          max_tokens: maxTokens,
          system: opts.system,
          output_config: { format: { type: "json_schema", schema } },
          messages: [{ role: "user", content: opts.user }],
        })
        .finalMessage();
    } catch (err) {
      await settleCost(hold, opts.meter, model, null).catch(() => {});
      throw err;
    }
    await settleCost(hold, opts.meter, model, fromApiUsage(res.usage));
    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;

    if (res.stop_reason === "refusal") throw new Error("The model declined to read this passage.");
    if (res.stop_reason === "max_tokens") {
      lastError = new Error("The response was cut off before it finished.");
      maxTokens = Math.min(maxTokens * 2, 64_000);
      continue;
    }
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    try {
      return { data: opts.parse(JSON.parse(text)), usage };
    } catch (err) {
      lastError = err; // malformed output — retry
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
