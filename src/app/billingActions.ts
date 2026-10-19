"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { billingEnabled, isProductKey, PRODUCTS, priceId, stripe, type ProductKey } from "@/lib/billing/stripe";
import { db } from "@/lib/db";

async function origin() {
  const fixed = process.env.APP_URL || process.env.AUTH_URL;
  if (fixed) return fixed.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function customerFor(user: { id: string; email?: string | null }) {
  const account = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeCustomerId: true, email: true, name: true } });
  if (account.stripeCustomerId) return account.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: account.email ?? undefined,
    name: account.name ?? undefined,
    metadata: { userId: user.id },
  });
  await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/** Send the author to Stripe Checkout for a plan or a book pass. */
export async function startCheckout(product: ProductKey) {
  const user = await requireUser();
  if (!isProductKey(product) || !billingEnabled()) redirect("/pricing?billing=off");
  const price = priceId(product)!;
  const base = await origin();

  // Already subscribed: plan changes and cancellations happen in the billing portal (with proration).
  const account = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeSubscriptionId: true } });
  if (PRODUCTS[product].plan && account.stripeSubscriptionId) return openBillingPortal();

  const customer = await customerFor(user);
  const isPass = product === "pass";
  const session = await stripe().checkout.sessions.create({
    mode: isPass ? "payment" : "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    metadata: { userId: user.id, product },
    ...(isPass ? {} : { subscription_data: { metadata: { userId: user.id } } }),
    allow_promotion_codes: true,
    success_url: `${base}/account?checkout=success`,
    cancel_url: `${base}/pricing`,
  });
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
