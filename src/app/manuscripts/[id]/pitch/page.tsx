import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { generatePitchKit } from "@/app/pitchActions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CopyButton } from "@/components/CopyButton";
import { Prose } from "@/components/Prose";
import { SubmitButton } from "@/components/SubmitButton";
import { buttonClass, Card, ghostButtonClass } from "@/components/ui";
import { limitMessageFor } from "@/lib/billing/usage";
import { db } from "@/lib/db";
import { STALE_READ_MS } from "@/lib/reader/pipeline";
import type { PitchKitContent } from "@/lib/reader/schemas";

export const metadata = { title: "Pitch kit" };

export default async function PitchKitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  // The reason is worked out here, never taken from the URL.
  const limit = (await searchParams).limit ? await limitMessageFor(user.id, "pitchKits") : null;
  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      report: { select: { status: true, updatedAt: true } },
      pitchKit: { select: { status: true, content: true, error: true, updatedAt: true } },
    },
  });
  if (!ms) notFound();
  const base = `/manuscripts/${ms.id}`;
  const kit = ms.pitchKit;
  const readDone = ms.report?.status === "DONE";
  const writing = !!kit && (kit.status === "QUEUED" || kit.status === "READING") && Date.now() - kit.updatedAt.getTime() < STALE_READ_MS;
  const content = kit?.status === "DONE" ? (kit.content as PitchKitContent) : null;
  // The book was re-read after this kit was written.
  const outdated = !!content && !!ms.report && ms.report.updatedAt > kit!.updatedAt;

  return (
    <>
      <AutoRefresh active={writing} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold">Pitch kit</h1>
            <p className="mt-2 max-w-3xl text-muted">
              A logline, back-cover blurb, synopsis and query letter, written from the reader’s experience of your book. They’re first drafts
              to make your own, and if the book was hard to pitch, you’ll see why.
            </p>
          </div>
          {readDone && !writing && (
            <form action={generatePitchKit.bind(null, ms.id)}>
              <SubmitButton
                className={content ? ghostButtonClass : buttonClass}
                pendingLabel="Starting…"
                confirm={content ? "Write a new pitch kit? This replaces the current one." : undefined}
              >
                {content ? "Rewrite pitch kit" : "Write my pitch kit"}
              </SubmitButton>
            </form>
          )}
        </div>

        {typeof limit === "string" && !writing && (
          <p className="mt-6 rounded-lg bg-issue-soft px-4 py-2.5 text-sm text-issue" data-testid="limit-card">
            {limit}{" "}
            <Link href="/pricing" className="font-medium underline">
              See plans
            </Link>
          </p>
        )}
        {!readDone && (
          <Card className="mt-8 text-sm text-muted">
            The pitch kit is written from a full read of the book. <Link href={base} className="text-accent underline">Finish a read</Link> first,
            then come back here.
          </Card>
        )}
        {writing && (
          <Card className="mt-8 border-reaction/40 bg-reaction-soft/40 text-sm">
            Writing your pitch kit… <span className="text-muted">This takes a minute or two. You can leave this page.</span>
          </Card>
        )}
        {kit?.status === "ERROR" && !writing && (
          <Card className="mt-8 border-danger/40 bg-danger-soft/60 text-sm text-danger">The pitch kit didn’t finish: {kit.error}</Card>
        )}
        {readDone && !kit && (
          <Card className="mt-8 text-sm text-muted">Ready when you are. It takes a minute or two and uses the read you already have.</Card>
        )}

        {content && (
          <>
            {outdated && (
              <p className="mt-6 rounded-lg bg-issue-soft px-4 py-2.5 text-sm text-issue">
                The reader has re-read your book since this was written. Rewrite it to pick up the changes.
              </p>
            )}
            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-6">
                <Section title="Logline" copy={content.logline}>
                  <p className="font-serif text-xl leading-snug" data-testid="logline">
                    {content.logline}
                  </p>
                </Section>
                <Section title="Back-cover blurb" copy={content.blurb}>
                  <Prose text={content.blurb} className="max-w-[68ch]" />
                </Section>
                <Section title="Query letter" copy={content.queryLetter} note="Fill in the [bracketed] parts.">
                  <Prose text={content.queryLetter} className="max-w-[68ch]" />
                </Section>
                <Section title="Synopsis" copy={content.synopsis} note="Includes the ending, as agents expect.">
                  <Prose text={content.synopsis} className="max-w-[68ch]" />
                </Section>
              </div>

              <aside className="space-y-4">
                {content.pitchNotes.length > 0 && (
                  <Card className="border-issue/40">
                    <h2 className="font-serif text-base font-semibold">What made it hard to pitch</h2>
                    <ul className="mt-2 space-y-2 text-sm">
                      {content.pitchNotes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </Card>
                )}
                {content.sellingPoints.length > 0 && (
                  <Card>
                    <h2 className="font-serif text-base font-semibold">Selling points</h2>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                      {content.sellingPoints.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </Card>
                )}
                {content.comps.length > 0 && (
                  <Card>
                    <h2 className="font-serif text-base font-semibold">Comparable titles</h2>
                    <ul className="mt-2 space-y-2.5 text-sm">
                      {content.comps.map((c, i) => (
                        <li key={i}>
                          <span className="font-medium italic">{c.title}</span> <span className="text-muted">by {c.author}</span>
                          <span className="mt-0.5 block text-muted">{c.why}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-muted">Suggestions only. Check each one exists, fits, and is recent before you use it.</p>
                  </Card>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Section({ title, copy, note, children }: { title: string; copy: string; note?: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold">
          {title}
          {note && <span className="ml-2 font-sans text-xs font-normal text-muted">{note}</span>}
        </h2>
        <CopyButton text={copy} />
      </div>
      {children}
    </Card>
  );
}
