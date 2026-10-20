"use client";

import Link from "next/link";
import { useState } from "react";
import { startCheckout } from "@/app/billingActions";
import { SubmitButton } from "@/components/SubmitButton";
import { buttonClass, ghostButtonClass } from "@/components/ui";
import { BOOK_PASS, PLANS, yearlySavingPct, type Plan } from "@/lib/plans";

const fmt = (n: number) => n.toLocaleString("en-US");

function features(plan: Plan): string[] {
  const a = plan.allowance;
  const per = plan.id === "free" ? "" : " a month";
  return [
    plan.id === "free"
      ? `${fmt(a.words)} words read, about your first three chapters`
      : `${fmt(a.words)} words read${per}${plan.id === "author" ? ": a full novel, or many rounds of revision" : ""}`,
    `Grammar & style on ${fmt(a.grammarWords)} words${per}`,
    `${fmt(a.chat)} character chat messages${per}`,
    `${a.pitchKits} pitch kit${a.pitchKits === 1 ? "" : "s"}${per}`,
    `${plan.maxManuscripts} manuscript${plan.maxManuscripts === 1 ? "" : "s"}, up to ${fmt(plan.maxWordsPerManuscript)} words each`,
  ];
}

export function PricingPlans(props: { loggedIn: boolean; currentPlan: string | null; currentInterval: string | null; billingOn: boolean }) {
  const [yearly, setYearly] = useState(props.currentInterval === "year");
  const plans = [PLANS.free, PLANS.author, PLANS.pro];

  return (
    <>
      <div className="mt-10 inline-flex rounded-full border border-line bg-card p-1 text-sm" role="group" aria-label="Billing period">
        {[false, true].map((y) => (
          <button
            key={String(y)}
            type="button"
            aria-pressed={yearly === y}
            onClick={() => setYearly(y)}
            className={`rounded-full px-4 py-1.5 transition ${yearly === y ? "bg-accent font-medium text-white dark:text-paper" : "text-muted hover:text-ink"}`}
          >
            {y ? `Yearly · save ${yearlySavingPct(PLANS.author)}%` : "Monthly"}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const current = props.currentPlan === plan.id;
          const price = yearly ? Math.round((plan.yearlyPrice / 12) * 100) / 100 : plan.monthlyPrice;
          const product = `${plan.id}_${yearly ? "year" : "month"}` as "author_month" | "author_year" | "pro_month" | "pro_year";
          return (
            <div
              key={plan.id}
              data-plan={plan.id}
              className={`flex flex-col rounded-xl border bg-card p-6 ${plan.id === "author" ? "border-accent shadow-sm" : "border-line"}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-serif text-2xl font-semibold">{plan.name}</h2>
                {plan.id === "author" && <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">Most authors</span>}
              </div>
              <p className="mt-1 min-h-10 text-sm text-muted">{plan.tagline}</p>
              <p className="mt-5">
                <span className="font-serif text-4xl font-semibold tabular-nums">${price % 1 ? price.toFixed(2) : price}</span>
                <span className="text-sm text-muted">{plan.id === "free" ? " forever" : " / month"}</span>
              </p>
              <p className="h-5 text-xs text-muted">{plan.id !== "free" && yearly ? `$${plan.yearlyPrice} billed yearly, save ${yearlySavingPct(plan)}%` : ""}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {features(plan).map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="text-praise">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {current ? (
                  <p className="rounded-lg border border-line px-4 py-2 text-center text-sm text-muted">Your current plan</p>
                ) : plan.id === "free" ? (
                  props.loggedIn ? null : (
                    <Link href="/signin" className={`${ghostButtonClass} w-full`}>
                      Start free
                    </Link>
                  )
                ) : !props.loggedIn ? (
                  <Link href="/signin?callbackUrl=/pricing" className={`${buttonClass} w-full`}>
                    Get {plan.name}
                  </Link>
                ) : (
                  <form action={startCheckout.bind(null, product)}>
                    <SubmitButton className={`${plan.id === "author" ? buttonClass : ghostButtonClass} w-full`} pendingLabel="Opening checkout…">
                      {props.billingOn ? `Get ${plan.name}` : "Coming soon"}
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-line bg-card p-6" data-plan="pass">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-xl font-semibold">
            {BOOK_PASS.name} <span className="ml-1 font-sans text-base font-normal text-muted">${BOOK_PASS.price} once</span>
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Just finished a draft and don’t want a subscription? A pass adds {fmt(BOOK_PASS.credit.words)} words of reading (a full novel), a pitch
            kit, and some grammar checks and character chat. It never expires and works on any plan, including Free.
          </p>
        </div>
        {props.loggedIn ? (
          <form action={startCheckout.bind(null, "pass")}>
            <SubmitButton className={ghostButtonClass} pendingLabel="Opening checkout…">
              {props.billingOn ? "Buy a book pass" : "Coming soon"}
            </SubmitButton>
          </form>
        ) : (
          <Link href="/signin?callbackUrl=/pricing" className={ghostButtonClass}>
            Buy a book pass
          </Link>
        )}
      </div>
    </>
  );
}
