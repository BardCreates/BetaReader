import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { planFor } from "@/lib/plans";
import { costMicros, type TokenUsage } from "./cost";
import { PASS_FIELD, USED_FIELD, applyCost, canSpend, remaining, rollPeriod, split, type Metric, type UsageRow } from "./period";

export type { Metric } from "./period";

/** A request was refused because of an allowance, the spend ceiling, or the app-wide budget. */
export class LimitError extends Error {
  readonly code: "LIMIT" | "CAPACITY";
  constructor(message: string, code: "LIMIT" | "CAPACITY" = "LIMIT") {
    super(message);
    this.name = "LimitError";
    this.code = code;
  }
}

export const isLimitError = (e: unknown): e is LimitError => e instanceof LimitError;

const USAGE_SELECT = {
  plan: true,
  periodStart: true,
  periodEnd: true,
  wordsUsed: true,
  grammarWordsUsed: true,
  chatUsed: true,
  pitchKitsUsed: true,
  costMicros: true,
  passWords: true,
  passGrammarWords: true,
  passChat: true,
  passPitchKits: true,
  passCostMicros: true,
} satisfies Prisma.UserSelect;

/** Lock the user's row for the rest of the transaction and roll their period forward if it ended. */
async function lockUsage(tx: Prisma.TransactionClient, userId: string): Promise<UsageRow> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: USAGE_SELECT });
  const roll = rollPeriod(u, new Date());
  if (!roll) return u;
  await tx.user.update({ where: { id: userId }, data: roll });
  return { ...u, ...roll };
}

/** Current usage, with the period rolled forward if needed. */
export async function getUsage(userId: string): Promise<UsageRow> {
  return db.$transaction((tx) => lockUsage(tx, userId));
}

const fmt = (n: number) => n.toLocaleString("en-US");
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

function limitMessage(u: UsageRow, metric: Metric, amount: number) {
  const plan = planFor(u.plan);
  const r = remaining(u, metric);
  const resets = u.periodEnd ? ` It resets on ${fmtDate(u.periodEnd)}.` : "";
  const more = plan.id === "free" ? "Upgrade or buy a book pass to keep going." : "Upgrade or buy a book pass for more.";
  switch (metric) {
    case "words":
      return r.total > 0
        ? `This needs ${fmt(amount)} words of reading, and you have ${fmt(r.total)} left${plan.id === "free" ? " on the free plan" : " this month"}.${resets} ${more}`
        : `You've used ${plan.id === "free" ? `your ${fmt(r.allowance)} free words` : "this month's reading allowance"}.${resets} ${more}`;
    case "grammarWords":
      return `Grammar & style checks are limited to ${fmt(r.allowance)} words ${plan.id === "free" ? "on the free plan" : "a month"}, and this chapter is ${fmt(amount)} words with ${fmt(r.total)} left.${resets} ${more}`;
    case "chat":
      return `You've used your ${fmt(r.allowance)} character chat messages${plan.id === "free" ? "" : " for this month"}.${resets} ${more}`;
    case "pitchKits":
      return `You've written ${plan.id === "free" ? "your free pitch kit" : `this month's ${fmt(r.allowance)} pitch kits`}.${resets} ${more}`;
  }
}

function spendMessage(u: UsageRow) {
  const resets = u.periodEnd ? ` It resets on ${fmtDate(u.periodEnd)}.` : "";
  return `Your account has reached its usage limit for this period.${resets} Upgrade or buy a book pass to keep going.`;
}

export type Reservation = { userId: string; metric: Metric; fromPlan: number; fromPass: number };

/**
 * Take `amount` from the user's allowance (plan first, then book pass) before doing the work.
 * Throws LimitError if there isn't enough, or if the spend ceiling has been reached.
 * Call `release` if the work then fails.
 */
export async function reserve(userId: string, metric: Metric, amount: number): Promise<Reservation> {
  await assertCapacity();
  return db.$transaction(async (tx) => {
    const u = await lockUsage(tx, userId);
    if (!canSpend(u)) throw new LimitError(spendMessage(u));
    const s = split(u, metric, amount);
    if (!s) throw new LimitError(limitMessage(u, metric, amount));
    await tx.user.update({
      where: { id: userId },
      data: { [USED_FIELD[metric]]: { increment: s.fromPlan }, [PASS_FIELD[metric]]: { decrement: s.fromPass } },
    });
    return { userId, metric, ...s };
  });
}

/** Give back a reservation whose work didn't happen. */
export async function release(r: Reservation | null | undefined) {
  if (!r || (!r.fromPlan && !r.fromPass)) return;
  await db.$transaction(async (tx) => {
    const u = await lockUsage(tx, r.userId);
    await tx.user.update({
      where: { id: r.userId },
      data: {
        [USED_FIELD[r.metric]]: Math.max(0, u[USED_FIELD[r.metric]] - r.fromPlan),
        [PASS_FIELD[r.metric]]: { increment: r.fromPass },
      },
    });
  });
}

/** Refuse new AI work when the user is over their spend ceiling or the app is over its daily budget. */
export async function assertCanSpend(userId: string) {
  await assertCapacity();
  const u = await getUsage(userId);
  if (!canSpend(u)) throw new LimitError(spendMessage(u));
}

// ─── App-wide daily budget ──────────────────────────────────────

let budgetCache: { day: string; micros: number; at: number } | null = null;

export function dailyBudgetMicros() {
  const usd = Number(process.env.AI_DAILY_BUDGET_USD ?? "100");
  return Number.isFinite(usd) && usd > 0 ? Math.round(usd * 1_000_000) : Infinity;
}

async function spentTodayMicros() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  // A few seconds of staleness is fine for a budget; avoids a sum query per call.
  if (budgetCache && budgetCache.day === day && Date.now() - budgetCache.at < 15_000) return budgetCache.micros;
  const since = new Date(`${day}T00:00:00Z`);
  const agg = await db.aiUsage.aggregate({ where: { createdAt: { gte: since } }, _sum: { costMicros: true } });
  budgetCache = { day, micros: agg._sum.costMicros ?? 0, at: Date.now() };
  return budgetCache.micros;
}

async function assertCapacity() {
  const budget = dailyBudgetMicros();
  if (budget === Infinity) return;
  if ((await spentTodayMicros()) >= budget) {
    throw new LimitError("Beta Reader is at capacity for today. Please try again tomorrow; nothing you've used was charged.", "CAPACITY");
  }
}

// ─── Cost ledger ────────────────────────────────────────────────

export type Meter = { userId: string; kind?: string; manuscriptId?: string | null };

/** Log an AI call with its real cost and count it against the user's spend ceiling. */
export async function recordAiUsage(meter: Meter, model: string, usage: TokenUsage) {
  const micros = costMicros(model, usage);
  await db.$transaction(async (tx) => {
    const u = await lockUsage(tx, meter.userId);
    await tx.aiUsage.create({
      data: {
        userId: meter.userId,
        manuscriptId: meter.manuscriptId ?? null,
        kind: meter.kind ?? "other",
        model,
        inputTokens: usage.input,
        outputTokens: usage.output,
        cacheReadTokens: usage.cacheRead ?? 0,
        cacheWriteTokens: usage.cacheWrite ?? 0,
        costMicros: micros,
      },
    });
    await tx.user.update({ where: { id: meter.userId }, data: applyCost(u, micros) });
  });
  if (budgetCache) budgetCache.micros += micros;
  return micros;
}

/** Usage for the account page. */
export async function usageSummary(userId: string) {
  const u = await getUsage(userId);
  const plan = planFor(u.plan);
  const metric = (m: Metric) => {
    const r = remaining(u, m);
    return { used: u[USED_FIELD[m]], allowance: r.allowance, pass: r.pass, left: r.total };
  };
  return {
    plan,
    periodStart: u.periodStart,
    periodEnd: u.periodEnd,
    words: metric("words"),
    grammarWords: metric("grammarWords"),
    chat: metric("chat"),
    pitchKits: metric("pitchKits"),
    spendBlocked: !canSpend(u),
  };
}
