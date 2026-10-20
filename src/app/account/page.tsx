import Link from "next/link";
import { signOutAction } from "@/app/actions";
import { openBillingPortal, startCheckout } from "@/app/billingActions";
import { requireUser } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { SubmitButton } from "@/components/SubmitButton";
import { buttonClass, Card, ghostButtonClass } from "@/components/ui";
import { usageSummary } from "@/lib/billing/usage";
import { db } from "@/lib/db";
import { getSidebar } from "@/lib/sidebar";
import { BOOK_PASS } from "@/lib/plans";
import { MODEL_VENDOR } from "@/lib/trust";
import { DeleteAccountForm } from "./DeleteAccountForm";
import { FEATURES } from "@/lib/features";

export const metadata = { title: "Account" };

const fmt = (n: number) => n.toLocaleString("en-US");
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const account = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      email: true,
      wordsReadTotal: true,
      createdAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      billingInterval: true,
      cancelAtPeriodEnd: true,
      _count: { select: { manuscripts: true } },
    },
  });
  const usage = await usageSummary(user.id);
  const plan = usage.plan;
  const justPaid = (await searchParams).checkout === "success";
  const isFree = plan.id === "free";
  const per = isFree ? "" : " this month";

  return (
    <AppShell email={user.email} sidebar={(await getSidebar(user.id))!}>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8 lg:px-12">
        <h1 className="font-serif text-3xl font-semibold">Account</h1>

        {justPaid && (
          <p className="mt-6 rounded-lg bg-praise-soft px-4 py-2.5 text-sm text-praise">
            Thank you! Your payment went through. It can take a few seconds to show here; refresh if it hasn’t.
          </p>
        )}
        {account.subscriptionStatus === "past_due" && (
          <p className="mt-6 rounded-lg bg-danger-soft px-4 py-2.5 text-sm text-danger">
            Your last payment didn’t go through. Update your card in billing to keep your plan.
          </p>
        )}

        <Card className="mt-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Plan</p>
              <p className="mt-1 font-serif text-2xl font-semibold" data-testid="plan-name">
                {plan.name}
              </p>
              <p className="mt-1 text-sm text-muted">
                {isFree
                  ? "Your free words don’t reset. Upgrade or buy a book pass when you need more."
                  : [
                      account.billingInterval === "year" ? `$${plan.yearlyPrice} a year` : account.billingInterval === "month" ? `$${plan.monthlyPrice} a month` : null,
                      usage.periodEnd ? `allowance resets ${fmtDate(usage.periodEnd)}` : null,
                      account.cancelAtPeriodEnd ? "cancels at the end of the billing period" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/pricing" className={isFree ? buttonClass : ghostButtonClass}>
                {isFree ? "Upgrade" : "Change plan"}
              </Link>
              {account.stripeCustomerId && (
                <form action={openBillingPortal}>
                  <SubmitButton className={ghostButtonClass} pendingLabel="Opening…">
                    Billing &amp; invoices
                  </SubmitButton>
                </form>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
            <Meter label={`Words read${per}`} m={usage.words} />
            <Meter label={`Grammar & style${per}`} m={usage.grammarWords} unit="words" />
            <Meter label={`Character chat${per}`} m={usage.chat} unit="messages" />
            {FEATURES.pitchKit && <Meter label={`Pitch kits${per}`} m={usage.pitchKits} />}
          </div>
          {usage.spendBlocked && (
            <p className="mt-5 rounded-lg bg-issue-soft px-3 py-2 text-sm text-issue">
              Your account has reached its usage limit for this period. Upgrade or buy a book pass to keep going.
            </p>
          )}
        </Card>

        <Card className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Book pass</p>
            <p className="mt-0.5 text-sm text-muted">
              {usage.words.pass > 0
                ? `You have ${fmt(usage.words.pass)} words of pass credit. It never expires and is used after your plan’s allowance.`
                : `A full read of a novel${FEATURES.pitchKit ? " and a pitch kit" : ""} for $${BOOK_PASS.price}, on any plan. Never expires.`}
            </p>
          </div>
          <form action={startCheckout.bind(null, "pass")}>
            <SubmitButton className={ghostButtonClass} pendingLabel="Opening checkout…">
              Buy a book pass
            </SubmitButton>
          </form>
        </Card>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="text-sm text-muted">Signed in as</p>
            <p className="mt-1 font-medium">{account.email}</p>
            <p className="mt-3 text-sm text-muted">Member since {fmtDate(account.createdAt)}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Manuscripts</p>
            <p className="mt-1 font-serif text-2xl font-semibold">
              {account._count.manuscripts} <span className="text-base font-normal text-muted">of {plan.maxManuscripts}</span>
            </p>
            <p className="mt-2 text-sm text-muted">{fmt(account.wordsReadTotal)} words read in total</p>
          </Card>
        </div>

        <Card className="mt-4">
          <p className="font-medium">Your data</p>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Your manuscripts are private to you, encrypted, and never used to train AI: not by us, and not by {MODEL_VENDOR.company}, who make the
            reader. <Link href="/privacy" className="text-accent underline">How your writing is handled</Link>.
          </p>
          <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3">
            <a href="/api/account/export" className={ghostButtonClass} download>
              Download all my data
            </a>
            <div className="pt-1.5">
              <DeleteAccountForm hasSubscription={!!account.stripeSubscriptionId && account.subscriptionStatus !== "canceled"} />
            </div>
          </div>
        </Card>

        <form action={signOutAction} className="mt-8">
          <button className={ghostButtonClass}>Sign out</button>
        </form>
      </main>
    </AppShell>
  );
}

function Meter({ label, m, unit }: { label: string; m: { used: number; allowance: number; pass: number; left: number }; unit?: string }) {
  const pct = m.allowance ? Math.min(100, (m.used / m.allowance) * 100) : 100;
  const tone = pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-issue" : "bg-accent";
  return (
    <div data-meter={label}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted tabular-nums">
          {fmt(Math.min(m.used, m.allowance))} of {fmt(m.allowance)}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={m.allowance} aria-valuenow={m.used} aria-label={label}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {m.pass > 0 && <p className="mt-1 text-xs text-muted">+ {fmt(m.pass)} from book pass</p>}
    </div>
  );
}
