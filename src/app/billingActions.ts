"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { billingEnabled, isProductKey, PRODUCTS, priceId, stripe, type ProductKey } from "@/lib/billing/stripe";
import { LIVE_STATUSES } from "@/lib/billing/subscription";
import { db } from "@/lib/db";

async function origin() {
  const fixed = process.env.APP_URL || process.env.AUTH_URL;
  if (fixed) return fixed.replace(/\/$/, "");
  // Headers can be spoofed; production must set APP_URL.
  if (process.env.NODE_ENV === "production") throw new Error("Set APP_URL to the app's public address.");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function customerFor(user: { id: string; email?: string | null }) {
  const account = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeCustomerId: true, email: true, name: true } });
  if (account.stripeCustomerId) return account.stripeCustomerId;
  // Idempotency key: two quick clicks get the same customer instead of two.
  const customer = await stripe().customers.create(
    { email: account.email ?? undefined, name: account.name ?? undefined, metadata: { userId: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/** Send the author to Stripe Checkout for a plan or a book pass. */
export async function startCheckout(product: ProductKey) {
  const user = await requireUser();
  if (!isProductKey(product) || !billingEnabled()) redirect("/pricing?billing=off");
  const price = priceId(product)!;
  const base = await origin();

  const isPass = product === "pass";
  const customer = await customerFor(user);

  // Already subscribed (by Stripe's own records, not just ours, which wait on the webhook):
  // plan changes and cancellations happen in the billing portal, with proration.
  if (!isPass) {
    const account = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeSubscriptionId: true } });
    const subs = await stripe().subscriptions.list({ customer, status: "all", limit: 20 });
    if (account.stripeSubscriptionId || subs.data.some((s) => LIVE_STATUSES.has(s.status))) return openBillingPortal();
  }

  const session = await stripe().checkout.sessions.create(
    {
      mode: isPass ? "payment" : "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      metadata: { userId: user.id, product },
      // Pass metadata reaches the charge too, so a refund can take the credit back.
      ...(isPass ? { payment_intent_data: { metadata: { userId: user.id, product } } } : { subscription_data: { metadata: { userId: user.id } } }),
      allow_promotion_codes: true,
      success_url: `${base}/account?checkout=success`,
      cancel_url: `${base}/pricing`,
    },
    // Repeat clicks within ten minutes reuse the same checkout page, so they can't subscribe twice.
    isPass ? undefined : { idempotencyKey: `checkout-${user.id}-${product}-${Math.floor(Date.now() / 600_000)}` },
  );
  if (!session.url) throw new Error("Stripe didn't return a checkout page.");
  redirect(session.url);
}

/** Stripe's billing portal: change plan, update card, see invoices, cancel. */
export async function openBillingPortal() {
  const user = await requireUser();
  if (!process.env.STRIPE_SECRET_KEY) redirect("/pricing?billing=off");
  const account = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeCustomerId: true } });
  if (!account.stripeCustomerId) redirect("/pricing");
  const session = await stripe().billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: `${await origin()}/account`,
  });
  redirect(session.url);
}
