import Link from "next/link";
import { auth } from "@/auth";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";
import { buttonClass, ghostButtonClass } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { BOOK_PASS, PLANS } from "@/lib/plans";

export const metadata = { title: { absolute: `${BRAND.name}: an honest first reader for your manuscript` } };

export default async function Home() {
  const signedIn = !!(await auth())?.user;
  const start = signedIn ? "/dashboard" : "/signin";
  const startLabel = signedIn ? "Open your manuscripts" : "Start your first read";
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader signedIn={signedIn} />

      <main className="flex-1">
        {/* Hero: the promise, and a page the reader has marked up. */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-8 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <h1 className="font-serif text-[2.6rem] leading-[1.08] font-semibold tracking-[-0.015em] sm:text-[3.4rem]">
              An honest first reader for your manuscript.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              {BRAND.name} reads your book chapter by chapter, the way a real reader would. It tells you where it was hooked, where it drifted,
              what it guessed too early, and how to fix what isn’t working. And when you’re stuck, you can ask your characters.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={start} className={`${buttonClass} px-5 py-2.5 text-base`}>
                {startLabel}
              </Link>
              <Link href="#how-it-works" className={`${ghostButtonClass} px-4 py-2.5 text-base`}>
                How it works
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">Your first {fmt(PLANS.free.allowance.words)} words are free. No card needed.</p>
          </div>

          <AnnotatedPage />
        </section>

        {/* How it works: a real sequence, so it's numbered. */}
        <section id="how-it-works" className="scroll-mt-8 border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
            <h2 className="font-serif text-3xl leading-tight font-semibold sm:text-[2.2rem]">How it works</h2>
            <ol className="mt-10 grid gap-10 md:grid-cols-3">
              {[
                [
                  "Upload your draft",
                  "Export a .docx from Dabble, Word, Scrivener or Google Docs, or paste it in. Your chapter headings split it into chapters.",
                ],
                [
                  "It reads, in order",
                  "Chapter by chapter, carrying what it remembers forward. Each chapter takes a minute or two; close the tab and come back to a full report.",
                ],
                [
                  "Revise, and check it worked",
                  "Edit here or in your usual app and upload the new draft. Only changed chapters are read again, and you see whether each problem got fixed.",
                ],
              ].map(([title, text], i) => (
                <li key={title} className="relative pl-14">
                  <span
                    aria-hidden
                    className="absolute top-0 left-0 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card font-serif text-lg font-semibold text-accent"
                  >
                    {i + 1}
                  </span>
                  <h3 className="font-serif text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-muted">{text}</p>
                </li>
              ))}
            </ol>
          </div>
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

        {/* Character chat: a headline feature of its own. */}
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <h2 className="font-serif text-3xl leading-tight font-semibold sm:text-[2.2rem]">Talk with your characters.</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                Stuck on a scene? Not sure why she’d say that? Ask her. Your characters answer in their own voice, drawing on every page they appear
                on, so you can interview them, test a scene before you write it, or find the backstory you haven’t figured out yet.
              </p>
              <ul className="mt-7 space-y-4">
                {[
                  ["They stay true to your book.", "Each character knows the passages they’re in and the profile you’ve written, and won’t contradict the page."],
                  ["You can see what’s new.", "Anything they invent beyond your manuscript is highlighted, so you always know canon from brainstorm."],
                  ["Meet them at any point in the story.", "Limit what they know to a chapter and talk to who they were back then."],
                  ["Keep what’s useful.", "Save a good answer to their profile in one click, and it becomes part of who they are."],
                ].map(([t, d]) => (
                  <li key={t} className="border-l-2 border-line pl-4">
                    <span className="font-semibold">{t}</span> <span className="text-muted">{d}</span>
                  </li>
                ))}
              </ul>
              <Link href={start} className={`${buttonClass} mt-8 px-5 py-2.5`}>
                {signedIn ? "Talk to your characters" : "Meet your characters"}
              </Link>
            </div>
            <ChatDemo />
          </div>
        </section>

        {/* What sets it apart, said as the choices behind it (no names, no "better than"). */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
            <h2 className="max-w-2xl font-serif text-3xl leading-tight font-semibold sm:text-[2.2rem]">Made the way readers read</h2>
            <p className="mt-4 max-w-2xl text-lg text-muted">A few deliberate choices, so the feedback is worth acting on.</p>
            <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
              {PRINCIPLES.map(([title, text]) => (
                <div key={title}>
                  <h3 className="font-serif text-xl font-semibold">{title}</h3>
                  <p className="mt-2 text-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Everything else in the box. */}
        <section className="border-t border-line bg-card/60">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
          <h2 className="max-w-2xl font-serif text-3xl leading-tight font-semibold sm:text-[2.2rem]">Everything a first read should give you</h2>
          <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["An editorial letter", "A developmental read of the whole book: what it is, what’s working, and the biggest opportunities in priority order, with a revision plan."],
              ["Notes on the page", "Reactions, praise and problems anchored to the exact passage, each problem with a concrete way to fix it. Mark them fixed as you go."],
              ["A story bible", "The facts your book establishes, gathered as it reads: who’s who, injuries, ages, places, timeline and the rules of your world."],
              ["Three kinds of reader", "Choose a devoted genre reader, a developmental editor for structure and stakes, or a line editor for voice and prose."],
              ["A pitch kit", "A logline, back-cover blurb, synopsis and query letter drafted from how the book actually read, plus what made it hard to pitch."],
              ["A place to write", "A clean editor with your chapters in a book outline, the reader’s notes beside the text, and grammar and style suggestions when you want them."],
            ].map(([t, d]) => (
              <div key={t} className="border-l-2 border-line pl-5">
                <h3 className="font-serif text-lg font-semibold">{t}</h3>
                <p className="mt-1.5 text-muted">{d}</p>
              </div>
            ))}
          </div>
          </div>
        </section>

        {/* Fits how authors already work. */}
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-8 md:grid-cols-2">
            <div>
              <h2 className="font-serif text-3xl leading-tight font-semibold">Keep writing where you write.</h2>
              <p className="mt-4 text-lg text-muted">
                Most authors already have a home for their draft. Keep it. Export a .docx whenever you like and {BRAND.name} matches it to your chapters,
                keeps every note on what you didn’t change, and reads only what did.
              </p>
            </div>
            <UpdateDemo />
          </div>
        </section>

        {/* Pricing preview. */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-serif text-3xl leading-tight font-semibold sm:text-[2.2rem]">Simple pricing</h2>
              <p className="mt-3 max-w-xl text-lg text-muted">Start free. Upgrade when you want a full read. No extra charges, ever: if you reach a limit, it simply tells you.</p>
            </div>
            <Link href="/pricing" className={ghostButtonClass}>
              Compare plans
            </Link>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[PLANS.free, PLANS.author, PLANS.pro].map((p) => (
              <div key={p.id} className={`rounded-xl border bg-card p-6 ${p.id === "author" ? "border-accent" : "border-line"}`}>
                <p className="font-serif text-xl font-semibold">{p.name}</p>
                <p className="mt-3">
                  <span className="font-serif text-3xl font-semibold">${p.monthlyPrice}</span>
                  <span className="text-sm text-muted">{p.id === "free" ? " to start" : " a month"}</span>
                </p>
                <p className="mt-3 text-muted">
                  {p.id === "free"
                    ? `${fmt(p.allowance.words)} words read, about your opening chapters.`
                    : `${fmt(p.allowance.words)} words read every month. ${p.tagline}`}
                </p>
                {p.id !== "free" && <p className="mt-2 text-sm text-muted">Or ${p.yearlyPrice} a year, about a third off.</p>}
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-muted">
            Just finished a draft? A one-off book pass is ${BOOK_PASS.price} for a full read of a novel, no subscription.
          </p>
        </section>

        {/* Questions authors ask. */}
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[1fr_1.6fr]">
            <h2 className="font-serif text-3xl leading-tight font-semibold sm:text-[2.2rem]">Questions authors ask</h2>
            <div className="divide-y divide-line border-y border-line">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-serif text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-2 max-w-2xl text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
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
            <Link href={start} className="rounded-lg bg-white px-5 py-2.5 font-medium text-[#24407c] transition hover:opacity-90">
              {startLabel}
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

/** Each one answers a common shortcoming of AI feedback tools without naming anyone. */
const PRINCIPLES: [string, string][] = [
  [
    "It never skims ahead.",
    "It reads in order, knowing only the chapters behind it. That’s how it can tell you the twist you gave away in chapter three, or the promise you never kept. A tool that sees the ending first can’t.",
  ],
  [
    "Your whole book, every chapter.",
    `No chapter caps and no sampling: a ${PLANS.author.allowance.words.toLocaleString("en-US")}-word novel gets every chapter read and one letter about the whole thing.`,
  ],
  [
    "Notes, not scores.",
    "No grades, no readability numbers. Every note quotes the exact passage, says what it did to the reader, and offers a way to fix it.",
  ],
  [
    "Built for the second draft.",
    "Bring back a revised draft and it keeps what you didn’t change, reads what you did, and tells you whether each problem is actually fixed.",
  ],
  [
    "It reads. It never writes your book.",
    "Readthrough doesn’t generate chapters or rewrite your prose. Suggestions stay suggestions, and your book stays in your voice.",
  ],
  [
    "Words, not credits.",
    "Plans are measured in words read, in plain numbers. No credits to decode and no surprise charges: if you reach a limit, it simply tells you.",
  ],
];

const FAQ: [string, string][] = [
  [
    "Who can see my manuscript?",
    "Only you. Manuscripts, notes and reports are private to your account, and you can delete a manuscript and everything about it at any time.",
  ],
  [
    "Is this a replacement for human beta readers or an editor?",
    "It’s a first reader you can use as often as you like: before you share a draft with people, and after every revision. It’s honest and specific, but it’s one reader’s experience. Use it to send people a stronger draft.",
  ],
  [
    "Will it just tell me my book is wonderful?",
    "No. It’s built to be honest: it names what isn’t working, quotes the passage, and suggests a fix, alongside what’s working so you don’t revise it away.",
  ],
  [
    "Does it know what happens later in my book?",
    "Not while it reads. Like a real reader, it only knows the chapters it has read so far, which is how it can tell you what you gave away too early and what never paid off.",
  ],
  [
    "How does talking with my characters work?",
    "Open a character (Readthrough finds them in your manuscript, or you add them) and ask them anything. They answer in their own voice from the pages they appear on and the profile you’ve written, mark anything they invent, and can be limited to what they knew at a given chapter. Start a message with “OOC:” to step outside the story and talk about them as a writer.",
  ],
  [
    "Which files can I upload?",
    "Word (.docx), plain text and Markdown, or paste text in. From Dabble, Scrivener or Google Docs, export a .docx. Start each chapter with a heading like “Chapter 1” so it splits cleanly.",
  ],
  [
    "How long does a read take?",
    "About a minute or two per chapter, so a full novel takes around an hour. You don’t need to keep the page open.",
  ],
  [
    "Can I cancel?",
    "Yes, any time, from your account. You’re never charged more than your plan’s price.",
  ],
];

/** A short conversation with a character, as the chat shows it. Example content. */
function ChatDemo() {
  return (
    <figure>
      <div className="rounded-2xl border border-line bg-card shadow-[0_12px_40px_-12px_rgb(22_29_46/0.18)]" aria-label="Example conversation with a character">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-pen-soft font-serif text-sm font-semibold text-pen">
            MH
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-serif font-semibold leading-tight">Mara Holt</p>
            <p className="text-xs text-muted">she/her, protagonist</p>
          </div>
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">Knows up to chapter 6</span>
        </div>
        <div className="space-y-4 px-5 py-5 text-[0.95rem]">
          <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5">Why haven’t you opened the letter?</p>
          <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-line px-4 py-3 font-serif leading-relaxed">
            Because I know her handwriting. Eleven years of nothing, and now this, on our kitchen table like it belongs there.{" "}
            <mark className="invented">The morning she left, she put a note under the sugar tin.</mark> I’ve never told Tom I kept it. If I open this
            one, I have to decide whether she gets to come back.
            <p className="mt-2 font-sans text-xs text-muted">Save to notes</p>
          </div>
          <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5">What would make you open it?</p>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-muted">
        Example conversation. <mark className="invented">Highlighted</mark> details are invented, not from the manuscript.
      </figcaption>
    </figure>
  );
}

/** Re-importing a revised draft, as the preview shows it. */
function UpdateDemo() {
  const rows = [
    ["Edited", "bg-reaction-soft text-reaction", "Chapter 2: The Orchard", "about 18% different"],
    ["New", "bg-praise-soft text-praise", "Chapter 3: The Visitor", "1,240 words"],
    ["Unchanged", "bg-line text-muted", "Chapter 1: The Letter", "notes kept"],
    ["Unchanged", "bg-line text-muted", "Chapter 4: Ashes", "notes kept"],
  ];
  return (
    <div className="rounded-xl border border-line bg-card shadow-[0_12px_40px_-16px_rgb(22_29_46/0.2)]" aria-label="Example of updating from a new draft">
      <div className="border-b border-line px-5 py-4">
        <p className="font-serif text-lg font-semibold">What will change</p>
        <p className="mt-0.5 text-sm text-muted">1 chapter edited, 1 new, 2 unchanged.</p>
      </div>
      <ul className="divide-y divide-line text-sm">
        {rows.map(([chip, cls, title, detail]) => (
          <li key={title} className="flex items-center gap-3 px-5 py-2.5">
            <span className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${cls}`}>{chip}</span>
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <span className="text-xs text-muted">{detail}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
        <span className="text-sm text-muted">Then read only what changed.</span>
        <span className={buttonClass}>Read the changes</span>
      </div>
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
      <figcaption className="mt-3 text-center text-sm text-muted">Example notes, each anchored to the passage it’s about.</figcaption>
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
