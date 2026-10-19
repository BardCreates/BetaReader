import "server-only";
import Stripe from "stripe";
import type { PlanId } from "@/lib/plans";

/**
 * Stripe products are configured by price id in the environment, so test and live mode
 * (or a new price) need no code change. See README → Billing.
 */
export const PRODUCTS = {
  author_month: { env: "STRIPE_PRICE_AUTHOR_MONTHLY", plan: "author", interval: "month" },
  author_year: { env: "STRIPE_PRICE_AUTHOR_YEARLY", plan: "author", interval: "year" },
  pro_month: { env: "STRIPE_PRICE_PRO_MONTHLY", plan: "pro", interval: "month" },
  pro_year: { env: "STRIPE_PRICE_PRO_YEARLY", plan: "pro", interval: "year" },
  pass: { env: "STRIPE_PRICE_BOOK_PASS", plan: null, interval: null },
} as const satisfies Record<string, { env: string; plan: PlanId | null; interval: "month" | "year" | null }>;

export type ProductKey = keyof typeof PRODUCTS;

export const isProductKey = (v: unknown): v is ProductKey => typeof v === "string" && Object.hasOwn(PRODUCTS, v);

export function priceId(product: ProductKey): string | null {
  return process.env[PRODUCTS[product].env] || null;
}

/** Which plan a subscription price is for. */
export function planForPrice(price: string): { plan: PlanId; interval: "month" | "year" } | null {
  for (const p of Object.values(PRODUCTS)) {
    if (p.plan && process.env[p.env] === price) return { plan: p.plan, interval: p.interval };
  }
  return null;
}

/** Billing is switched on once the secret key and every price are configured. */
export function billingEnabled() {
  return !!process.env.STRIPE_SECRET_KEY && (Object.keys(PRODUCTS) as ProductKey[]).every((k) => priceId(k));
}

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  if (!client) {
    // STRIPE_API_BASE points the client at a local mock in tests only.
    const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
    client = new Stripe(key, {
      maxNetworkRetries: 2,
      appInfo: { name: "Beta Reader" },
      ...(base ? { host: base.hostname, port: Number(base.port), protocol: base.protocol.replace(":", "") as "http" | "https" } : {}),
    });
  }
  return client;
}
