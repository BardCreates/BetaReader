import "server-only";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { BOOK_PASS, isPaidPlan } from "@/lib/plans";
import { freshPeriod } from "./period";
import { planForPrice } from "./stripe";

/** Subscription statuses that keep the paid plan (past_due: Stripe is still retrying the card). */
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);
/** Still waiting on the first payment: don't change the plan yet. */
const PENDING_STATUSES = new Set(["incomplete"]);

async function userForCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer, userIdHint?: string | null) {
  const customerId = typeof customer === "string" ? customer : customer.id;
  if (userIdHint) {
    const byId = await db.user.findUnique({ where: { id: userIdHint }, select: { id: true, plan: true, stripeCustomerId: true } });
    if (byId) return { ...byId, customerId };
  }
  const byCustomer = await db.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true, plan: true, stripeCustomerId: true } });
  return byCustomer ? { ...byCustomer, customerId } : null;
}

/** Make the user's plan match their Stripe subscription. */
export async function syncSubscription(sub: Stripe.Subscription) {
  const user = await userForCustomer(sub.customer, sub.metadata?.userId);
  if (!user) {
    console.warn("stripe: no user for subscription", sub.id);
    return;
  }
  if (PENDING_STATUSES.has(sub.status)) return;

  const price = sub.items.data[0]?.price?.id;
  const mapped = price ? planForPrice(price) : null;
  const paid = PAID_STATUSES.has(sub.status) && mapped;
  const newPlan = paid ? mapped.plan : "free";
  const now = new Date();

  await db.user.update({
    where: { id: user.id },
    data: {
      plan: newPlan,
      stripeCustomerId: user.customerId,
      stripeSubscriptionId: paid ? sub.id : null,
      subscriptionStatus: sub.status,
      billingInterval: paid ? mapped.interval : null,
      cancelAtPeriodEnd: paid ? !!sub.cancel_at_period_end : false,
      // Coming from Free: start a fresh monthly allowance now. Switching between paid plans keeps
      // the current period and what's been used (so plan-hopping can't reset usage).
      ...(paid && !isPaidPlan(user.plan) ? freshPeriod(now) : {}),
      // Back to Free: allowances stop resetting; usage so far still counts.
      ...(!paid ? { periodEnd: null } : {}),
    },
  });
}

/** Add one book pass of credit. */
export async function creditBookPass(userId: string, customerId: string | null) {
  const c = BOOK_PASS.credit;
  await db.user.update({
    where: { id: userId },
    data: {
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      passWords: { increment: c.words },
      passGrammarWords: { increment: c.grammarWords },
      passChat: { increment: c.chat },
      passPitchKits: { increment: c.pitchKits },
      passCostMicros: { increment: Math.round(c.costCapUsd * 1_000_000) },
    },
  });
}
