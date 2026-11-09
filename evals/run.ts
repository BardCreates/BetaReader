/**
 * Run the chapter-reader eval suite against the real prompts and schema.
 *
 *   npm run eval                          # all cases, 3 trials each, ANTHROPIC_MODEL or the app default
 *   npm run eval -- --trials 5 --case continuity,injection
 *   npm run eval -- --model claude-haiku-5-5 --label haiku-baseline
 *   npm run eval -- --mock                # offline dry run of the harness (no API key needed)
 *
 * Results are written to evals/results/<timestamp>-<label>.json; compare two runs with
 *   npm run eval:compare -- evals/results/A.json evals/results/B.json
 *
 * This calls the API directly (not callStructured) so it doesn't touch billing or the DB,
 * but it uses the same system prompt, user prompt, JSON schema and zod parser as the app.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { costMicros, formatUsd, fromApiUsage } from "@/lib/billing/cost";
import { chapterUserPrompt, readerSystemPrompt } from "@/lib/reader/prompts";
import { ChapterFeedbackSchema, chapterFeedbackTool, type ChapterFeedback } from "@/lib/reader/schemas";
import { toStructuredSchema } from "@/lib/reader/structured";
import { CASES, type EvalCase } from "./cases";
import { gradeCase, type CheckResult } from "./graders";
import { mockRead } from "./mock";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const MOCK = args.includes("--mock");
const MODEL = flag("model") ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
const TRIALS = Number(flag("trials") ?? 3);
const LABEL = flag("label") ?? (MOCK ? "mock" : MODEL);
const only = flag("case")?.split(",");
const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;

const schema = toStructuredSchema(chapterFeedbackTool.input_schema);
let client: Anthropic | null = null;

async function read(c: EvalCase, intent?: string): Promise<{ out: ChapterFeedback; micros: number }> {
  if (MOCK) return { out: mockRead(c), micros: 0 };
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY, or run with --mock.");
  client ??= new Anthropic({ maxRetries: 4 });
  const user = chapterUserPrompt({
    ...c.chapter,
    memory: c.memory ?? null,
    openThreads: c.openThreads,
    bible: c.bible,
    intent: intent ?? c.intent ?? null,
  });
  const res = await client.messages
    .stream({
      model: MODEL,
      max_tokens: 16_000,
      system: [{ type: "text", text: readerSystemPrompt(c.ctx) }],
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: user }],
    } as Anthropic.MessageStreamParams)
    .finalMessage();
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { out: ChapterFeedbackSchema.parse(JSON.parse(text)), micros: costMicros(MODEL, fromApiUsage(res.usage)) };
}

type Trial = { checks: CheckResult[]; metrics: ReturnType<typeof gradeCase>["metrics"]; biasDelta?: number; error?: string };

async function main() {
  console.log(`Readthrough reader evals: ${cases.length} cases × ${TRIALS} trials, model ${MOCK ? "(mock)" : MODEL}\n`);
  let spent = 0;
  const results: Record<string, Trial[]> = {};

  for (const c of cases) {
    results[c.id] = [];
    for (let t = 0; t < TRIALS; t++) {
      try {
        const { out, micros } = await read(c);
        spent += micros;
        const g = gradeCase(c, out);
        const trial: Trial = { ...g };
        if (c.biasCheck) {
          const biased = await read(c, c.biasCheck.intent);
          spent += biased.micros;
          const delta = Math.abs(biased.out.engagement - out.engagement);
          trial.biasDelta = delta;
          trial.checks.push({
            label: `intent doesn't move score > ${c.biasCheck.maxDelta}`,
            pass: delta <= c.biasCheck.maxDelta,
            detail: `${out.engagement} → ${biased.out.engagement} with intent`,
          });
        }
        results[c.id].push(trial);
      } catch (err) {
        results[c.id].push({ checks: [], metrics: { quoteFidelity: 0, fixRate: 0, notes: 0, issues: 0, praise: 0, engagement: 0 }, error: String(err) });
      }
      process.stdout.write(".");
    }
  }
  console.log("\n");

  // Report: pass rate per check, plus averages of the general metrics.
  const summary: Record<string, unknown> = {};
  let passed = 0;
  let total = 0;
  for (const c of cases) {
    const trials = results[c.id];
    const ok = trials.filter((t) => !t.error);
    console.log(`${c.id}  ${c.description}`);
    const labels = [...new Set(ok.flatMap((t) => t.checks.map((x) => x.label)))];
    const checkRates: Record<string, number> = {};
    for (const label of labels) {
      const runs = ok.map((t) => t.checks.find((x) => x.label === label)).filter(Boolean) as CheckResult[];
      const p = runs.filter((r) => r.pass).length;
      passed += p;
      total += trials.length; // errored trials count as failures
      checkRates[label] = p / trials.length;
      console.log(`   ${p === trials.length ? "PASS" : p === 0 ? "FAIL" : "FLAKY"}  ${p}/${trials.length}  ${label}  (${runs.map((r) => r.detail).join(" | ")})`);
    }
    const errors = trials.filter((t) => t.error);
    for (const e of errors) console.log(`   ERROR  ${e.error}`);
    const avg = (k: keyof Trial["metrics"]) => (ok.length ? ok.reduce((s, t) => s + t.metrics[k], 0) / ok.length : 0);
    const m = { quoteFidelity: avg("quoteFidelity"), fixRate: avg("fixRate"), engagement: avg("engagement"), notes: avg("notes") };
    console.log(`   quote fidelity ${(m.quoteFidelity * 100).toFixed(0)}%  fix rate ${(m.fixRate * 100).toFixed(0)}%  avg engagement ${m.engagement.toFixed(1)}  avg notes ${m.notes.toFixed(1)}\n`);
    summary[c.id] = { checkRates, metrics: m, errors: errors.length };
  }

  const score = total ? passed / total : 0;
  console.log(`Overall: ${passed}/${total} checks passed (${(score * 100).toFixed(0)}%)${MOCK ? "" : `, cost ${formatUsd(spent)}`}`);

  const dir = join(process.cwd(), "evals", "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${LABEL.replace(/[^\w.-]/g, "_")}.json`);
  writeFileSync(file, JSON.stringify({ label: LABEL, model: MOCK ? "mock" : MODEL, trials: TRIALS, score, costMicros: spent, summary, results }, null, 2));
  console.log(`Saved ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
