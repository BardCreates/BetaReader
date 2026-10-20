import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { isLimitError } from "@/lib/billing/usage";
import { findQuote } from "@/lib/manuscript/anchor";
import { callStructured } from "@/lib/reader/anthropic";
import { chapterUserPrompt, readerSystemPrompt } from "@/lib/reader/prompts";
import { ChapterFeedbackSchema, chapterFeedbackTool } from "@/lib/reader/schemas";
import { TRIAL_PER_VISITOR, TRIAL_RETENTION_DAYS } from "./trial";

/**
 * Free sample reads: one chapter, no account. They share a small daily AI budget
 * (TRIAL_DAILY_BUDGET_USD, enforced in holdCost) and a daily count (TRIAL_DAILY_LIMIT),
 * each visitor gets TRIAL_PER_VISITOR a day, and everything is deleted after
 * TRIAL_RETENTION_DAYS. The visitor's address is only ever stored as a salted hash.
 */

export type TrialNote = {
  kind: "reaction" | "praise" | "issue";
  category: string;
  severity: number;
  quote: string;
  comment: string;
  suggestion: string | null;
  start: number | null;
  end: number | null;
};

export type TrialResult = {
  reaction: string;
  summary: string;
  engagement: number;
  confusion: number | null;
  drift: { quote: string; reason: string } | null;
  strengths: string[];
  questions: string[];
  notes: TrialNote[];
};

export function hashVisitor(address: string) {
  const salt = process.env.AUTH_SECRET ?? "readthrough";
  return createHash("sha256").update(`trial:${salt}:${address.trim().toLowerCase()}`).digest("hex");
}

export function trialDailyLimit() {
  const n = Number(process.env.TRIAL_DAILY_LIMIT ?? "150");
  return Number.isFinite(n) && n >= 0 ? n : 150;
}

/** Why this visitor can't start a sample read right now, or null if they can. */
export async function trialRefusal(ipHash: string, client: Pick<typeof db, "trialRead"> = db): Promise<string | null> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const mine = await client.trialRead.count({ where: { ipHash, createdAt: { gte: dayAgo } } });
  const all = await client.trialRead.count({ where: { createdAt: { gte: dayAgo } } });
  if (mine >= TRIAL_PER_VISITOR) {
    return `You’ve had ${TRIAL_PER_VISITOR} free sample reads today. Sign up free to keep going: your first chapters are on us.`;
  }
  if (all >= trialDailyLimit()) return "Free sample reads are full for today. Sign up free to read your opening chapters now.";
  return null;
}

/** The read itself, run as a background job. */
export async function runTrialRead(trialId: string) {
  const trial = await db.trialRead.findUnique({ where: { id: trialId } });
  if (!trial || trial.status === "DONE") return;
  await db.trialRead.update({ where: { id: trial.id }, data: { status: "READING", error: null } });
  try {
    const system = readerSystemPrompt({
      title: trial.title || "Untitled",
      genre: trial.genre,
      audience: null,
      authorGoals: null,
      persona: "enthusiast",
      chapterCount: 1,
    });
    const { data } = await callStructured({
      system: [{ type: "text", text: system }],
      user: chapterUserPrompt({ index: 0, total: null, midBook: trial.midBook, title: trial.title || "Sample chapter", content: trial.content, memory: null }),
      schema: chapterFeedbackTool.input_schema,
      maxTokens: Math.min(24_000, 16_000 + Math.round(trial.wordCount / 2)),
      parse: (input) => ChapterFeedbackSchema.parse(input),
      meter: { userId: null, kind: "trial" },
    });
    let hint = 0;
    const notes: TrialNote[] = data.notes.map((n) => {
      const a = findQuote(trial.content, n.quote, hint);
      if (a) hint = a.start;
      return { kind: n.kind, category: n.category, severity: n.severity, quote: n.quote, comment: n.comment, suggestion: n.suggestion ?? null, start: a?.start ?? null, end: a?.end ?? null };
    });
    const result: TrialResult = {
      reaction: data.reaction,
      summary: data.summary,
      engagement: data.engagement,
      confusion: data.confusion ?? null,
      drift: data.driftPoint ?? null,
      strengths: data.strengths,
      questions: data.questions,
      notes,
    };
    await db.trialRead.updateMany({ where: { id: trial.id }, data: { status: "DONE", result } });
  } catch (err) {
    console.error("trial read failed", err);
    const message = isLimitError(err) ? err.message : "The reader couldn’t finish this chapter. Please try again in a little while.";
    await db.trialRead.updateMany({ where: { id: trial.id }, data: { status: "ERROR", error: message } });
  }
}

/** Delete sample reads past their retention. */
export async function pruneTrials() {
  await db.trialRead.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - TRIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000) } } });
}
