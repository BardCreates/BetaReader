/**
 * Allowance periods and the split between plan allowance and book-pass credit.
 * Pure functions so they can be tested without a database.
 */
import { isPaidPlan, planFor, type Allowance } from "@/lib/plans";

export type Metric = "words" | "grammarWords" | "chat" | "pitchKits";

export const USED_FIELD = {
  words: "wordsUsed",
  grammarWords: "grammarWordsUsed",
  chat: "chatUsed",
  pitchKits: "pitchKitsUsed",
} as const satisfies Record<Metric, string>;

export const PASS_FIELD = {
  words: "passWords",
  grammarWords: "passGrammarWords",
  chat: "passChat",
  pitchKits: "passPitchKits",
} as const satisfies Record<Metric, string>;

export type UsageRow = {
  plan: string;
  periodStart: Date;
  periodEnd: Date | null;
  wordsUsed: number;
  grammarWordsUsed: number;
  chatUsed: number;
  pitchKitsUsed: number;
  costMicros: number;
  passWords: number;
  passGrammarWords: number;
  passChat: number;
  passPitchKits: number;
  passCostMicros: number;
};

/** Same day next month, clamped to the month's last day (Jan 31 → Feb 28). */
export function addMonth(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}

const RESET = { wordsUsed: 0, grammarWordsUsed: 0, chatUsed: 0, pitchKitsUsed: 0, costMicros: 0 };

/**
 * If a paid user's period has ended (or was never set), the fields to update to start the
 * current one. Free allowances never reset. Returns null when nothing changes.
 */
export function rollPeriod(u: Pick<UsageRow, "plan" | "periodStart" | "periodEnd">, now: Date) {
  if (!isPaidPlan(u.plan)) return null;
  if (!u.periodEnd) return { periodStart: now, periodEnd: addMonth(now), ...RESET };
  if (now < u.periodEnd) return null;
  let start = u.periodEnd;
  let end = addMonth(start);
  while (end <= now) {
    start = end;
    end = addMonth(start);
  }
  return { periodStart: start, periodEnd: end, ...RESET };
}

/** Fields for a fresh period starting now (used when someone subscribes or changes plan). */
export function freshPeriod(now: Date) {
  return { periodStart: now, periodEnd: addMonth(now), ...RESET };
}

export function remaining(u: UsageRow, metric: Metric) {
  const allowance = planFor(u.plan).allowance[metric as keyof Allowance] as number;
  const plan = Math.max(0, allowance - u[USED_FIELD[metric]]);
  const pass = Math.max(0, u[PASS_FIELD[metric]]);
  return { plan, pass, total: plan + pass, allowance };
}

/** How much of `amount` comes from the plan allowance and how much from pass credit; null if not enough. */
export function split(u: UsageRow, metric: Metric, amount: number): { fromPlan: number; fromPass: number } | null {
  const r = remaining(u, metric);
  if (amount > r.total) return null;
  const fromPlan = Math.min(amount, r.plan);
  return { fromPlan, fromPass: amount - fromPlan };
}

export function costCapMicros(plan: string) {
  return Math.round(planFor(plan).allowance.costCapUsd * 1_000_000);
}

/** Spend allowed: under the plan's ceiling, or pass credit left to absorb the overflow. */
export function canSpend(u: Pick<UsageRow, "plan" | "costMicros" | "passCostMicros">) {
  return u.costMicros < costCapMicros(u.plan) || u.passCostMicros > 0;
}

/** Record spend: anything above the plan's ceiling is drawn from pass credit. */
export function applyCost(u: Pick<UsageRow, "plan" | "costMicros" | "passCostMicros">, micros: number) {
  const cap = costCapMicros(u.plan);
  const before = u.costMicros;
  const after = before + micros;
  const overflow = Math.max(0, after - Math.max(before, cap));
  return { costMicros: after, passCostMicros: Math.max(0, u.passCostMicros - overflow) };
}
