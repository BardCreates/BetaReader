import type Stripe from "stripe";
import { Prisma } from "@/generated/prisma/client";
import { stripe } from "@/lib/billing/stripe";
import { creditBookPass, syncSubscription } from "@/lib/billing/subscription";
import { db } from "@/lib/db";

/**
 * Stripe webhook. Configure the endpoint in the Stripe dashboard for:
 * checkout.session.completed, customer.subscription.created / updated / deleted.
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

  // Stripe can deliver an event more than once; handle each id once. If handling fails,
  // forget the id so Stripe's retry gets another go.
  try {
    await db.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return Response.json({ received: true, duplicate: true });
    throw err;
  }

  try {
    await handle(event);
  } catch (err) {
    await db.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    console.error("stripe webhook failed", event.type, err);
    return new Response("Webhook handler failed", { status: 500 });
  }
  return Response.json({ received: true });
}

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId || session.client_reference_id;
      const customerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
      if (session.mode === "payment" && session.metadata?.product === "pass") {
        if (session.payment_status === "paid" && userId) await creditBookPass(userId, customerId);
        return;
      }
      if (session.mode === "subscription" && session.subscription) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(await stripe().subscriptions.retrieve(subId));
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      return;
    default:
      return;
  }
}
