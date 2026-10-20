/**
 * Create Readthrough's Stripe products and prices, and print the env lines for them.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup
 *
 * Safe to run again: prices are found by lookup key, so nothing is duplicated. Prices come
 * from src/lib/plans.ts. Use a test-mode key first; run it again with the live key at launch.
 * Also turns on the customer portal (plan switching between the four subscription prices,
 * cancelling at period end, invoice history).
 */
import "dotenv/config";
import Stripe from "stripe";
import { BOOK_PASS, PLANS } from "../src/lib/plans";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY (sk_test_… to start).");
  process.exit(1);
}
const stripe = new Stripe(key);
const mode = key.startsWith("sk_live") || key.startsWith("rk_live") ? "LIVE" : "test";

type Spec = { env: string; lookup: string; product: string; description: string; cents: number; interval?: "month" | "year" };

const specs: Spec[] = [
  { env: "STRIPE_PRICE_AUTHOR_MONTHLY", lookup: "readthrough_author_month", product: "Readthrough Author", description: PLANS.author.tagline, cents: PLANS.author.monthlyPrice * 100, interval: "month" },
  { env: "STRIPE_PRICE_AUTHOR_YEARLY", lookup: "readthrough_author_year", product: "Readthrough Author", description: PLANS.author.tagline, cents: PLANS.author.yearlyPrice * 100, interval: "year" },
  { env: "STRIPE_PRICE_PRO_MONTHLY", lookup: "readthrough_pro_month", product: "Readthrough Pro", description: PLANS.pro.tagline, cents: PLANS.pro.monthlyPrice * 100, interval: "month" },
  { env: "STRIPE_PRICE_PRO_YEARLY", lookup: "readthrough_pro_year", product: "Readthrough Pro", description: PLANS.pro.tagline, cents: PLANS.pro.yearlyPrice * 100, interval: "year" },
  { env: "STRIPE_PRICE_BOOK_PASS", lookup: "readthrough_book_pass", product: "Readthrough Book pass", description: "A full read of one novel. Never expires.", cents: BOOK_PASS.price * 100 },
];

const products = new Map<string, string>();
async function productId(name: string, description: string) {
  if (products.has(name)) return products.get(name)!;
  const found = (await stripe.products.search({ query: `name:'${name}' AND active:'true'` })).data[0];
  const id = found?.id ?? (await stripe.products.create({ name, description, metadata: { app: "readthrough" } })).id;
  products.set(name, id);
  return id;
}

console.log(`Stripe ${mode} mode\n`);
const lines: string[] = [];
const subscriptionPrices: { product: string; prices: string[] }[] = [];
for (const s of specs) {
  let price: Stripe.Price | undefined = (await stripe.prices.list({ lookup_keys: [s.lookup], active: true, limit: 1 })).data[0];
  if (price && price.unit_amount !== s.cents) {
    console.warn(`  ${s.lookup}: Stripe has ${(price.unit_amount ?? 0) / 100}, plans.ts says ${s.cents / 100}. Moving the lookup key to a new price.`);
    price = undefined;
  }
  if (!price) {
    price = await stripe.prices.create({
      product: await productId(s.product, s.description),
      currency: "usd",
      unit_amount: s.cents,
      lookup_key: s.lookup,
      transfer_lookup_key: true,
      ...(s.interval ? { recurring: { interval: s.interval } } : {}),
    });
    console.log(`  created ${s.lookup} (${price.id})`);
  } else console.log(`  found   ${s.lookup} (${price.id})`);
  lines.push(`${s.env}="${price.id}"`);
  if (s.interval) {
    const product = typeof price.product === "string" ? price.product : price.product.id;
    const entry = subscriptionPrices.find((e) => e.product === product) ?? subscriptionPrices[subscriptionPrices.push({ product, prices: [] }) - 1];
    entry.prices.push(price.id);
  }
}

// Customer portal: switch between the subscription prices, cancel at period end, see invoices.
const appUrl = process.env.APP_URL || "http://localhost:3000";
const portal = {
  business_profile: { headline: "Manage your Readthrough plan" },
  default_return_url: `${appUrl}/account`,
  features: {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" as const },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price" as const],
      proration_behavior: "create_prorations" as const,
      products: subscriptionPrices,
    },
  },
};
const existing = (await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })).data[0];
if (existing) await stripe.billingPortal.configurations.update(existing.id, portal);
else await stripe.billingPortal.configurations.create(portal);
console.log("  customer portal configured");

console.log(`\nAdd to .env${mode === "LIVE" ? " (production)" : ""}:\n\n${lines.join("\n")}\n`);
console.log(`Then add a webhook endpoint at ${appUrl}/api/stripe/webhook (events in README → Setting up Stripe).`);
