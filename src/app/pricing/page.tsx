import { ManuscriptPromise } from "@/components/ManuscriptPromise";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";
import { auth } from "@/auth";
import { billingEnabled } from "@/lib/billing/stripe";
import { db } from "@/lib/db";
import { PricingPlans } from "./PricingPlans";

export const metadata = { title: "Pricing" };

export default async function PricingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  const account = userId ? await db.user.findUnique({ where: { id: userId }, select: { plan: true, billingInterval: true } }) : null;
  const billingOff = (await searchParams).billing === "off";

  return (
    <div className="flex min-h-screen flex-col">
    <PublicHeader signedIn={!!account} />
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-8">

      <header className="max-w-2xl pt-8">
        <h1 className="font-serif text-4xl font-semibold leading-tight">Pricing</h1>
        <p className="mt-3 text-lg text-muted">
          Pay for the reading you need, counted in words, not credits. Every plan includes the full reader: chapter notes, the editorial
          report, the reader map and journey, and the continuity ledger.
        </p>
      </header>

      {billingOff && (
        <p className="mt-6 rounded-lg bg-issue-soft px-4 py-2.5 text-sm text-issue">Payments aren’t switched on yet. Check back soon.</p>
      )}

      <PricingPlans loggedIn={!!account} currentPlan={account?.plan ?? null} currentInterval={account?.billingInterval ?? null} billingOn={billingEnabled()} />

      <ManuscriptPromise className="mt-12 border-t border-line pt-12" />

      <section className="mt-12 grid gap-8 border-t border-line py-12 text-sm md:grid-cols-3">
        <div>
          <h2 className="font-serif text-lg font-semibold">No surprise charges</h2>
          <p className="mt-2 text-muted">
            You only ever pay your plan’s price. If you reach a limit, the reader pauses and tells you; nothing is billed on top.
          </p>
        </div>
        <div>
          <h2 className="font-serif text-lg font-semibold">What counts as a word read</h2>
          <p className="mt-2 text-muted">
            Each word the reader reads: a full read, a re-read of one chapter, or reading just the changes after you revise. Unchanged
            chapters aren’t read again.
          </p>
        </div>
        <div>
          <h2 className="font-serif text-lg font-semibold">Yearly plans</h2>
          <p className="mt-2 text-muted">Same monthly allowance, billed once a year for about a third off. Cancel any time.</p>
        </div>
      </section>
    </main>
    <PublicFooter />
    </div>
  );
}
