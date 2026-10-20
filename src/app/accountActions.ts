"use server";

import { requireUser, signOut } from "@/auth";
import { stripe } from "@/lib/billing/stripe";
import { db } from "@/lib/db";

export type DeleteAccountState = { error?: string } | undefined;

/**
 * Delete the signed-in user's account and everything in it: manuscripts, reads, characters,
 * conversations and usage. Any subscription is cancelled at Stripe first, so nobody is billed
 * for an account that no longer exists.
 */
export async function deleteAccount(_prev: DeleteAccountState, form: FormData): Promise<DeleteAccountState> {
  const user = await requireUser();
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== "delete") return { error: "Type “delete” to confirm." };

  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { stripeSubscriptionId: true, subscriptionStatus: true },
  });
  if (!account) return { error: "Account not found." };

  if (account.stripeSubscriptionId && account.subscriptionStatus !== "canceled" && process.env.STRIPE_SECRET_KEY) {
    try {
      await stripe().subscriptions.cancel(account.stripeSubscriptionId);
    } catch (err) {
      // Already gone at Stripe is fine; anything else means it might still bill, so stop.
      const code = (err as { code?: string }).code;
      if (code !== "resource_missing") {
        console.error("account deletion: couldn't cancel subscription", err);
        return { error: "We couldn’t cancel your subscription just now, so nothing was deleted. Please try again in a minute." };
      }
    }
  }

  // Cascades to manuscripts and everything made from them (see prisma/schema.prisma). AI usage
  // rows are kept for the day's spend totals, but unlinked from the user and their books.
  await db.$transaction([
    db.aiUsage.updateMany({ where: { userId: user.id }, data: { manuscriptId: null } }),
    db.user.delete({ where: { id: user.id } }),
  ]);
  await signOut({ redirectTo: "/?deleted=1" });
  return undefined;
}
