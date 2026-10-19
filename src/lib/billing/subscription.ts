import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { BOOK_PASS, isPaidPlan } from "@/lib/plans";
import { freshPeriod } from "./period";
import { planForPrice, stripe } from "./stripe";

/** Subscription statuses that keep the paid plan (past_due: Stripe is still retrying the card). */
export const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);
/** Statuses that mean the customer already has (or is starting) a subscription. */
export const LIVE_STATUSES = new Set(["active", "trialing", "past_due", "incomplete", "unpaid"]);

/**
 * Make the user's plan match a subscription. Always re-reads the subscription from Stripe,
 * because webhook events can arrive out of order and their snapshot may be stale.
 */
export async function syncSubscription(subscriptionId: string) {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const select = { id: true, plan: true, stripeSubscriptionId: true } as const;
  const user =
    (sub.metadata?.userId ? await db.user.findUnique({ where: { id: sub.metadata.userId }, select }) : null) ??
    (await db.user.findUnique({ where: { stripeCustomerId: customerId }, select }));
  if (!user) {
    console.warn("stripe: no user for subscription", sub.id);
    return;
  }
  if (sub.status === "incomplete") return; // first payment still pending

  const paidStatus = PAID_STATUSES.has(sub.status);
  // A subscription that isn't the user's current one can't take their plan away
  // (e.g. a stale duplicate being cancelled while the real one is active).
  if (!paidStatus && user.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id) return;

  const price = sub.items.data[0]?.price?.id;
  const mapped = price ? planForPrice(price) : null;
  if (paidStatus && !mapped) {
    // Paying, but for a price this app doesn't know: never downgrade a paying customer over config.
    console.error("stripe: subscription price not configured", sub.id, price);
    await db.user.update({ where: { id: user.id }, data: { subscriptionStatus: sub.status, stripeCustomerId: customerId } });
    return;
  }

  if (paidStatus && mapped) {
    await db.user.update({
      where: { id: user.id },
      data: {
        plan: mapped.plan,
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        subscriptionStatus: sub.status,
        billingInterval: mapped.interval,
        cancelAtPeriodEnd: !!sub.cancel_at_period_end || !!sub.cancel_at,
        // Coming from Free: start a fresh monthly allowance now. Switching between paid plans keeps
        // the current period and what's been used (so plan-hopping can't reset usage).
        ...(!isPaidPlan(user.plan) ? freshPeriod(new Date()) : {}),
      },
    });
    return;
  }

  // Ended (canceled, unpaid, incomplete_expired): back to Free. Allowances stop resetting; usage so far counts.
  await db.user.update({
    where: { id: user.id },
    data: {
      plan: "free",
      stripeCustomerId: customerId,
      stripeSubscriptionId: null,
      subscriptionStatus: sub.status,
      billingInterval: null,
      cancelAtPeriodEnd: false,
      periodEnd: null,
    },
  });
}

/** Add (or, for a refund, remove) one book pass of credit. Never goes below zero. */
export async function adjustBookPass(tx: Prisma.TransactionClient, userId: string, direction: 1 | -1, customerId?: string | null) {
  const c = BOOK_PASS.credit;
  const credit = {
    passWords: c.words,
    passGrammarWords: c.grammarWords,
    passChat: c.chat,
    passPitchKits: c.pitchKits,
    passCostMicros: Math.round(c.costCapUsd * 1_000_000),
  };
  if (direction === 1) {
    await tx.user.update({
      where: { id: userId },
      data: {
        ...(customerId ? { stripeCustomerId: customerId } : {}),
        ...Object.fromEntries(Object.entries(credit).map(([k, v]) => [k, { increment: v }])),
      },
    });
    return;
  }
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const u = await tx.user.findUnique({ where: { id: userId }, select: Object.fromEntries(Object.keys(credit).map((k) => [k, true])) as Record<keyof typeof credit, true> });
  if (!u) return;
  await tx.user.update({
    where: { id: userId },
    data: Object.fromEntries(Object.entries(credit).map(([k, v]) => [k, Math.max(0, (u as Record<string, number>)[k] - v)])),
  });
}
