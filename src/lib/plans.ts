/**
 * Plans and what each one allows. Allowances are per month for paid plans (yearly plans
 * too) and one-off for Free. A book pass adds credit on top that never expires.
 *
 * Words read are the main cost driver (about $2.50 per 120k-word novel on Sonnet), so
 * they're the main allowance. `costCapUsd` is a backstop on real AI spend per period,
 * in case any estimate is off.
 */
export type PlanId = "free" | "author" | "pro";

export type Allowance = {
  /** Words the reader reads (full reads, re-reads, reading changes). */
  words: number;
  /** Words run through grammar & style. */
  grammarWords: number;
  /** Character chat messages. */
  chat: number;
  /** Pitch kits written (or rewritten). */
  pitchKits: number;
  /** Hard ceiling on AI spend, in dollars. */
  costCapUsd: number;
};

export type Plan = {
  id: PlanId;
  name: string;
  /** Display prices in dollars; the real prices live in Stripe. */
  monthlyPrice: number;
  yearlyPrice: number;
  tagline: string;
  maxManuscripts: number;
  maxWordsPerManuscript: number;
  allowance: Allowance;
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    tagline: "Try the reader on your opening chapters.",
    maxManuscripts: 1,
    maxWordsPerManuscript: 250_000,
    allowance: { words: 10_000, grammarWords: 10_000, chat: 20, pitchKits: 1, costCapUsd: 1 },
  },
  author: {
    id: "author",
    name: "Author",
    monthlyPrice: 19,
    yearlyPrice: 149,
    tagline: "One book at a time, every draft.",
    maxManuscripts: 10,
    maxWordsPerManuscript: 250_000,
    allowance: { words: 150_000, grammarWords: 300_000, chat: 200, pitchKits: 5, costCapUsd: 8 },
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 39,
    yearlyPrice: 299,
    tagline: "For series authors and several books at once.",
    maxManuscripts: 50,
    maxWordsPerManuscript: 400_000,
    allowance: { words: 500_000, grammarWords: 1_000_000, chat: 1_000, pitchKits: 20, costCapUsd: 25 },
  },
};

/** One-off purchase: one full read of a novel up to `credit.words`, with questions about its notes. */
export const BOOK_PASS = {
  name: "Book pass",
  price: 29,
  credit: { words: 150_000, grammarWords: 150_000, chat: 50, pitchKits: 2, costCapUsd: 6 } satisfies Allowance,
};

/** Percent saved by paying yearly, rounded down (Author and Pro are both about a third). */
export function yearlySavingPct(plan: Plan) {
  return plan.monthlyPrice ? Math.floor((1 - plan.yearlyPrice / (plan.monthlyPrice * 12)) * 100) : 0;
}

export function planFor(plan: string | null | undefined): Plan {
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : "free"];
}

export const isPaidPlan = (plan: string | null | undefined) => planFor(plan).id !== "free";
