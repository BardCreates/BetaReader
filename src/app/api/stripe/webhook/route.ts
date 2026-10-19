import type Stripe from "stripe";
import { Prisma } from "@/generated/prisma/client";
import { stripe } from "@/lib/billing/stripe";
import { adjustBookPass, syncSubscription } from "@/lib/billing/subscription";
import { db } from "@/lib/db";

/**
 * Stripe webhook. Subscribe the endpoint to: checkout.session.completed,
 * checkout.session.async_payment_succeeded, customer.subscription.created / updated / deleted,
 * and charge.refunded.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return new Response("Billing is not configured", { status: 503 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const result = await handle(event);
    return Response.json({ received: true, ...(result === "duplicate" ? { duplicate: true } : {}) });
  } catch (err) {
    console.error("stripe webhook failed", event.type, err);
    return new Response("Webhook handler failed", { status: 500 }); // Stripe retries
  }
}

/**
 * Credit or debit once per key, in the same transaction as the change, so a retry after a
 * crash can neither double-apply nor lose it. Returns "duplicate" if already applied.
 */
async function once(key: string, type: string, apply: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await db.$transaction(async (tx) => {
      await tx.stripeEvent.create({ data: { id: key, type } });
      await apply(tx);
    });
    return "applied" as const;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "duplicate" as const;
    throw err;
  }
}

async function handle(event: Stripe.Event): Promise<"applied" | "duplicate" | "ignored"> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const userId = session.metadata?.userId || session.client_reference_id;
      const customerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
      if (session.mode === "payment" && session.metadata?.product === "pass") {
        // Paid now, or nothing to pay (100% promotion code). Delayed methods arrive later as async_payment_succeeded.
        if (!userId || (session.payment_status !== "paid" && session.payment_status !== "no_payment_required")) return "ignored";
        return once(`pass:${session.id}`, "book_pass", (tx) => adjustBookPass(tx, userId, 1, customerId));
      }
      if (session.mode === "subscription" && session.subscription) {
        await syncSubscription(typeof session.subscription === "string" ? session.subscription : session.subscription.id);
        return "applied";
      }
      return "ignored";
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      // Idempotent: always syncs to the subscription's current state in Stripe.
      await syncSubscription(event.data.object.id);
      return "applied";
    case "charge.refunded": {
      const charge = event.data.object;
      const userId = charge.metadata?.userId;
      // Only a full refund of a book pass takes the credit back.
      if (charge.metadata?.product !== "pass" || !userId || !charge.refunded) return "ignored";
      return once(`refund:${charge.id}`, "book_pass_refund", (tx) => adjustBookPass(tx, userId, -1));
    }
    default:
      return "ignored";
  }
}
