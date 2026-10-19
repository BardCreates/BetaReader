/**
 * Convert our descriptive JSON Schema into one the structured-outputs API accepts:
 * every object gets `additionalProperties: false`, and numeric/length/array-size
 * constraints (unsupported) are removed and restated in the description instead.
 * Our zod schemas still enforce those constraints on the response.
 */
export function toStructuredSchema(schema: unknown): Record<string, unknown> {
  const UNSUPPORTED = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems"];
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const src = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const notes: string[] = [];
    for (const [k, v] of Object.entries(src)) {
      if (UNSUPPORTED.includes(k)) {
        notes.push(`${k}: ${String(v)}`);
        continue;
      }
      if (k === "minItems" && typeof v === "number" && v > 1) {
        notes.push(`at least ${v} items`);
        continue;
      }
      out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, walk(pv)])) : walk(v);
    }
    if (out.type === "object") out.additionalProperties = false;
    if (notes.length) out.description = [out.description, `(${notes.join(", ")})`].filter(Boolean).join(" ");
    return out;
  };
  return walk(schema) as Record<string, unknown>;
}
