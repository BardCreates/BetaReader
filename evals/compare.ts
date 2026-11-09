/**
 * Compare two eval runs (e.g. before/after a prompt change, or Sonnet vs Haiku):
 *   npm run eval:compare -- evals/results/<before>.json evals/results/<after>.json
 */
import { readFileSync } from "node:fs";

type Run = {
  label: string;
  score: number;
  costMicros: number;
  summary: Record<string, { checkRates: Record<string, number>; metrics: { quoteFidelity: number; fixRate: number; engagement: number } }>;
};

const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, "utf8")) as Run);
if (!a || !b) {
  console.error("Usage: npm run eval:compare -- <before.json> <after.json>");
  process.exit(1);
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const arrow = (x: number, y: number) => (y > x ? "▲" : y < x ? "▼" : " ");

console.log(`${a.label}  →  ${b.label}\n`);
for (const id of Object.keys({ ...a.summary, ...b.summary })) {
  const sa = a.summary[id];
  const sb = b.summary[id];
  console.log(id);
  for (const label of Object.keys({ ...sa?.checkRates, ...sb?.checkRates })) {
    const x = sa?.checkRates[label] ?? 0;
    const y = sb?.checkRates[label] ?? 0;
    console.log(`   ${arrow(x, y)} ${pct(x).padStart(4)} → ${pct(y).padEnd(4)}  ${label}`);
  }
  if (sa && sb) {
    const qa = sa.metrics.quoteFidelity, qb = sb.metrics.quoteFidelity;
    console.log(`   ${arrow(qa, qb)} quote fidelity ${pct(qa)} → ${pct(qb)}`);
  }
}
console.log(`\nOverall ${pct(a.score)} → ${pct(b.score)}   cost $${(a.costMicros / 1e6).toFixed(2)} → $${(b.costMicros / 1e6).toFixed(2)}`);
