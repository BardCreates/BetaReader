import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";
import { buttonClass, ghostButtonClass } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plans";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero: the promise, and a page the reader has marked up. */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-8 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <h1 className="font-serif text-[2.6rem] leading-[1.08] font-semibold tracking-[-0.015em] sm:text-[3.4rem]">
              An honest first reader for your manuscript.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              {BRAND.name} reads your book chapter by chapter, the way a real reader would. It tells you where it was hooked, where it drifted,
              what it guessed too early, and how to fix what isn’t working.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signin" className={`${buttonClass} px-5 py-2.5 text-base`}>
                Start your first read
              </Link>
              <Link href="/pricing" className={`${ghostButtonClass} px-4 py-2.5 text-base`}>
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">Your first {PLANS.free.allowance.words.toLocaleString("en-US")} words are free. No card needed.</p>
          </div>

          <AnnotatedPage />
        </section>

        {/* What a read gives you, shown as the product shows it. */}
        <section className="border-t border-line bg-card/60">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
            <h2 className="max-w-2xl font-serif text-3xl leading-tight font-semibold sm:text-[2.2rem]">Not a grammar checker. A reader.</h2>
            <p className="mt-4 max-w-2xl text-lg text-muted">
              Most tools score your prose. {BRAND.name} experiences your story: it carries what it knows from chapter to chapter, so it can tell you
              what a reader actually felt.
            </p>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              <Feature title="The reader’s journey" text="Every question it wondered and every twist it guessed, from the chapter it came up to the chapter you settled it. And the ones you never did.">
                <JourneyDemo />
              </Feature>
              <Feature title="Continuity, checked" text="It keeps a story bible as it reads, and flags the passage when a later chapter contradicts an earlier one.">
                <ContinuityDemo />
              </Feature>
              <Feature title="Proof a revision worked" text="Revise a chapter and it reads it again, checks each problem it raised, and tells you whether it wants to keep reading now.">
                <RevisionDemo />
              </Feature>
            </div>
          </div>
        </section>

        {/* Fits how authors already work. */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-8 md:grid-cols-2">
          <div>
            <h2 className="font-serif text-3xl leading-tight font-semibold">Keep writing where you write.</h2>
            <p className="mt-4 text-lg text-muted">
              Draft in Dabble, Word, Scrivener or Google Docs. Export a .docx whenever you like: {BRAND.name} matches it to your chapters, keeps
              every note on what you didn’t change, and only reads what did. Or write right here, with notes beside the text.
            </p>
          </div>
          <ul className="space-y-4 self-center text-[1.02rem]">
            {[
              ["Editorial letter", "A developmental read of the whole book: what’s working, what isn’t, in priority order."],
              ["Notes on the page", "Every reaction and issue anchored to the exact passage, with a concrete way to fix it."],
              ["Pitch kit", "A logline, blurb, synopsis and query letter drafted from how the book actually read."],
              ["Talk to your characters", "Ask them about scenes you haven’t written yet. Anything they invent is marked."],
            ].map(([t, d]) => (
              <li key={t} className="border-l-2 border-line pl-4">
                <span className="font-semibold">{t}.</span> <span className="text-muted">{d}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
          {/* The brand's ink blue in both themes, like the mark. */}
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-[#24407c] px-8 py-10 text-white">
            <div>
              <h2 className="font-serif text-2xl font-semibold sm:text-3xl">Find out how your book reads.</h2>
              <p className="mt-2 opacity-85">
                Free for your opening chapters. ${PLANS.author.monthlyPrice} a month for a full read every month.
              </p>
            </div>
            <Link
              href="/signin"
              className="rounded-lg bg-white px-5 py-2.5 font-medium text-[#24407c] transition hover:opacity-90"
            >
              Start your first read
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

function Feature({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex-1 rounded-xl border border-line bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">{children}</div>
      <h3 className="mt-5 font-serif text-xl font-semibold">{title}</h3>
      <p className="mt-1.5 text-muted">{text}</p>
    </div>
  );
}

/** A manuscript page with the reader's marks and margin notes. */
function AnnotatedPage() {
  return (
    <figure className="relative">
      <div className="rounded-2xl border border-line bg-card p-6 shadow-[0_12px_40px_-12px_rgb(22_29_46/0.18)] sm:p-8">
        <p className="mb-4 text-sm text-muted">Chapter 1: The Letter</p>
        <p className="font-serif text-[1.05rem] leading-[1.85]">
          The letter had been waiting on the table for three days.{" "}
          <mark className="note" data-kind="REACTION">
            Nobody in the house would touch it.
          </mark>{" "}
          Mara walked past it twice before breakfast, and once more after, her coffee going cold in her hand.{" "}
          <mark className="note" data-kind="ISSUE">
            She felt a deep sense of dread about what it might say.
          </mark>
        </p>
        <div className="mt-6 space-y-3 text-[0.95rem]">
          <MarginNote kind="Reaction" tone="reaction">
            Great hook. I immediately want to know who it’s from and why everyone is afraid of it.
          </MarginNote>
          <MarginNote kind="Issue" tone="issue">
            The cold coffee already shows her dread, so naming it tells me what I just felt. Try cutting the line, or give her one physical action.
          </MarginNote>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-muted">Notes from a real read, anchored to the passage.</figcaption>
    </figure>
  );
}

function MarginNote({ kind, tone, children }: { kind: string; tone: "reaction" | "issue"; children: React.ReactNode }) {
  const cls = tone === "reaction" ? "bg-reaction-soft [&_b]:text-reaction" : "bg-issue-soft [&_b]:text-issue";
  return (
    <p className={`rounded-lg px-3.5 py-2.5 ${cls}`}>
      <b className="font-semibold">{kind}.</b> {children}
    </p>
  );
}

function JourneyDemo() {
  const rows = [
    { q: "Who sent the letter?", from: 1, to: 3, tone: "bg-reaction", label: "Answered in ch. 3" },
    { q: "Tom knows more than he says.", from: 2, to: 9, tone: "bg-issue", label: "Saw it coming" },
    { q: "Why did her sister leave?", from: 2, to: null, tone: "", label: "Never answered" },
  ];
  const total = 12;
  return (
    <div className="space-y-4 text-sm" aria-label="Example reader journey">
      {rows.map((r) => (
        <div key={r.q}>
          <p className="font-serif">{r.q}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="relative h-2.5 flex-1 rounded-full bg-line/60">
              <div
                className={`absolute top-0 h-2.5 rounded-full ${r.to ? r.tone : "border-2 border-dashed border-danger/70"}`}
                style={{ left: `${((r.from - 1) / total) * 100}%`, width: `${(((r.to ?? total) - r.from + 1) / total) * 100}%` }}
              />
            </div>
            <span className={`w-28 shrink-0 text-right text-xs ${r.to ? "text-muted" : "text-danger"}`}>{r.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContinuityDemo() {
  return (
    <div className="text-sm">
      <p className="font-serif italic">“Saul took the tower stairs two at a time.”</p>
      <p className="mt-2 text-muted">Chapter 12</p>
      <p className="mt-3 rounded-lg bg-issue-soft px-3 py-2.5">
        <b className="text-issue">Continuity.</b> Saul’s leg was badly wounded in chapter 9, and nothing since says it healed.
      </p>
    </div>
  );
}

function RevisionDemo() {
  return (
    <div className="text-sm">
      <p className="text-muted">Chapter 7, after your revision</p>
      <p className="mt-2 font-serif text-2xl">
        5 <span className="text-muted">→</span> <span className="text-praise">8</span>
        <span className="ml-2 font-sans text-sm text-muted">wanted to keep reading</span>
      </p>
      <ul className="mt-3 space-y-1.5">
        <li className="flex justify-between gap-3">
          The middle repeats beats <span className="rounded-full bg-praise-soft px-2 text-xs font-medium text-praise">Fixed</span>
        </li>
        <li className="flex justify-between gap-3">
          Emotions named after shown <span className="rounded-full bg-issue-soft px-2 text-xs font-medium text-issue">Still there</span>
        </li>
      </ul>
    </div>
  );
}
