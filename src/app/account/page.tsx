import { signOutAction } from "@/app/actions";
import { requireUser } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { Card, ghostButtonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { planFor } from "@/lib/plans";
import { getSidebar } from "@/lib/sidebar";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();
  const account = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { email: true, name: true, plan: true, wordsReadTotal: true, createdAt: true, _count: { select: { manuscripts: true } } },
  });
  const plan = planFor(account.plan);

  return (
    <AppShell email={user.email} sidebar={(await getSidebar(user.id))!}>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <h1 className="font-serif text-3xl font-semibold">Account</h1>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="text-sm text-muted">Signed in as</p>
            <p className="mt-1 font-medium">{account.email}</p>
            <p className="mt-3 text-sm text-muted">Member since {account.createdAt.toLocaleDateString()}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Plan</p>
            <p className="mt-1 font-serif text-2xl font-semibold">{plan.name}</p>
            <p className="mt-2 text-sm text-muted">
              {account._count.manuscripts} of {plan.maxManuscripts} manuscripts · up to {plan.maxWordsPerManuscript.toLocaleString()} words each
            </p>
          </Card>
          <Card className="sm:col-span-2">
            <p className="text-sm text-muted">Words read so far</p>
            <p className="mt-1 font-serif text-2xl font-semibold">{account.wordsReadTotal.toLocaleString()}</p>
          </Card>
        </div>
        <form action={signOutAction} className="mt-8">
          <button className={ghostButtonClass}>Sign out</button>
        </form>
      </main>
    </AppShell>
  );
}
