import type { TokenUsage } from "./cost";

type UsageFields = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};
type StreamEvent = { type: string; message?: { usage?: UsageFields }; usage?: UsageFields };

/**
 * Collect token usage from a streaming response as it arrives, so a reply that's cut short
 * (the author closes the tab) is still billed for what it used.
 */
export function streamUsageTracker() {
  const u: Required<TokenUsage> = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const take = (src: UsageFields | undefined) => {
    if (!src) return;
    if (src.input_tokens) u.input = src.input_tokens;
    if (src.output_tokens) u.output = src.output_tokens; // cumulative in message_delta
    if (src.cache_read_input_tokens) u.cacheRead = src.cache_read_input_tokens;
    if (src.cache_creation_input_tokens) u.cacheWrite = src.cache_creation_input_tokens;
  };
  return {
    onEvent(e: unknown) {
      const ev = e as StreamEvent;
      onEvent(ev);
    },
    get usage(): TokenUsage {
      return u;
    },
    get any() {
      return u.input + u.output + u.cacheRead + u.cacheWrite > 0;
    },
  };
  function onEvent(e: StreamEvent) {
    if (e.type === "message_start") take(e.message?.usage);
    else if (e.type === "message_delta") take(e.usage);
  }
}
