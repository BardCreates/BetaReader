/**
 * Plan limits. Billing isn't wired yet; these are enforced on upload so the
 * Stripe integration only has to flip `User.plan`.
 */
export type PlanId = "free" | "author" | "pro";

export const PLANS: Record<PlanId, { name: string; maxManuscripts: number; maxWordsPerManuscript: number }> = {
  free: { name: "Free", maxManuscripts: 1, maxWordsPerManuscript: 30_000 },
  author: { name: "Author", maxManuscripts: 5, maxWordsPerManuscript: 150_000 },
  pro: { name: "Pro", maxManuscripts: 50, maxWordsPerManuscript: 250_000 },
};

export function planFor(plan: string | null | undefined) {
  return PLANS[(plan as PlanId) in PLANS ? (plan as PlanId) : "free"];
}
