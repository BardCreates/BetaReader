import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

let client: Anthropic | null = null;
export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
  client ??= new Anthropic({ maxRetries: 4 });
  return client;
}

/**
 * Call the model and force it to answer through one tool, returning the tool input.
 * This is how we get reliable structured output.
 */
export async function callTool<T>(opts: {
  system: Anthropic.TextBlockParam[];
  user: string;
  tool: { name: string; description: string; input_schema: Anthropic.Tool.InputSchema };
  maxTokens: number;
  parse: (input: unknown) => T;
}): Promise<{ data: T; usage: { input: number; output: number } }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens,
      system: opts.system,
      tools: [opts.tool],
      tool_choice: { type: "tool", name: opts.tool.name },
      messages: [{ role: "user", content: opts.user }],
    });
    const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      lastError = new Error(`Model did not call ${opts.tool.name} (stop_reason: ${res.stop_reason}).`);
      continue;
    }
    try {
      return { data: opts.parse(block.input), usage };
    } catch (err) {
      lastError = err; // malformed output — retry once
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
