import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { buttonClass } from "@/components/ui";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <nav className="flex items-center justify-between py-6">
        <span className="font-serif text-xl font-semibold">Beta Reader</span>
        <Link href="/signin" className="text-sm text-muted hover:text-ink">
          Sign in
        </Link>
      </nav>

      <section className="grid flex-1 items-center gap-12 py-12 md:grid-cols-2">
        <div>
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-accent">For authors with a draft</p>
          <h1 className="font-serif text-4xl leading-tight font-semibold md:text-5xl">
            An honest first reader for your manuscript.
          </h1>
          <p className="mt-6 text-lg text-muted">
            Upload your draft. Beta Reader reads it chapter by chapter, the way a real reader would, and tells you where it
            was hooked, where it drifted, what confused it, and how to fix what isn’t working. Revise a chapter and it
            reads it again.
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/signin" className={buttonClass}>
              Get your first read
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
          <p className="manuscript text-[0.95rem]">
            The letter had been waiting on the table for three days.{" "}
            <mark className="note" data-kind="REACTION">
              Nobody in the house would touch it.
            </mark>{" "}
            Mara walked past it twice before breakfast, and once more after, her coffee going cold in her hand.{" "}
            <mark className="note" data-kind="ISSUE">
              She felt a deep sense of dread and fear about what it might say.
            </mark>
          </p>
          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-lg bg-reaction-soft p-3">
              <b className="text-reaction">Reaction ·</b> Great hook. I immediately want to know who it’s from and why
              everyone is afraid of it.
            </div>
            <div className="rounded-lg bg-issue-soft p-3">
              <b className="text-issue">Issue · prose ·</b> The cold coffee already shows her dread, so naming it
              tells me what I just felt. Try cutting this line, or replace it with one physical action.
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 border-t border-line py-12 text-sm md:grid-cols-3">
        {[
          ["Reads in order", "Carries a memory of the story forward, so it notices broken setups, dropped threads and what it’s dying to know."],
          ["Notes on the page", "Every reaction and issue is anchored to the exact passage, with a concrete suggestion for the fix."],
          ["A full editorial report", "When it finishes the book: what’s working, what isn’t, which threads it dropped, and a revision plan in priority order."],
        ].map(([t, d]) => (
          <div key={t}>
            <h3 className="font-serif text-lg font-semibold">{t}</h3>
            <p className="mt-2 text-muted">{d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
