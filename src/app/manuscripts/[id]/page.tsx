import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { deleteManuscript, startReading } from "@/app/actions";
import { AppHeader } from "@/components/AppHeader";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SubmitButton } from "@/components/SubmitButton";
import { buttonClass, Card, EngagementStrip, ghostButtonClass, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { personaFor } from "@/lib/reader/personas";
import type { BookReportContent } from "@/lib/reader/schemas";

export default async function ManuscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    include: {
      report: true,
      chapters: {
        orderBy: { index: "asc" },
        select: {
          id: true,
          index: true,
          title: true,
          wordCount: true,
          review: {
            select: {
              status: true,
              engagement: true,
              summary: true,
              error: true,
              _count: { select: { notes: { where: { kind: "ISSUE", status: "OPEN" } } } },
            },
          },
        },
      },
    },
  });
  if (!ms) notFound();

  const busy = ms.status === "QUEUED" || ms.status === "READING";
  const doneCount = ms.chapters.filter((c) => c.review?.status === "DONE").length;
  const report = ms.report?.status === "DONE" ? (ms.report.content as BookReportContent) : null;
  const base = `/manuscripts/${ms.id}`;

  return (
    <>
      <AutoRefresh active={busy} />
      <AppHeader email={user.email} crumbs={[{ href: base, label: ms.title }]} />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-3xl font-semibold">{ms.title}</h1>
              <StatusBadge status={ms.status} />
            </div>
            <p className="mt-1 text-muted">
              {[ms.genre, ms.audience, `${ms.wordCount.toLocaleString()} words`, `Read by: ${personaFor(ms.persona).label}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!busy && (
              <form action={startReading.bind(null, ms.id, ms.status === "DONE")}>
                <SubmitButton className={buttonClass} pendingLabel="Starting…" confirm={ms.status === "DONE" ? "Start a fresh read? This replaces the current notes and report." : undefined}>
                  {ms.status === "DRAFT" ? "Start reading" : ms.status === "ERROR" ? "Resume reading" : "Read again"}
                </SubmitButton>
              </form>
            )}
            <Link href={`${base}/editor`} className={ghostButtonClass}>
              Talk to the editor
            </Link>
          </div>
        </div>

        {busy && (
          <Card className="mt-6 border-reaction/40 bg-reaction-soft/40">
            <p className="text-sm">
              Reading chapter {Math.min(doneCount + 1, ms.chapters.length)} of {ms.chapters.length}…{" "}
              <span className="text-muted">Each chapter takes a minute or two. You can leave this page; the read keeps going.</span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-reaction transition-all" style={{ width: `${(doneCount / ms.chapters.length) * 100}%` }} />
            </div>
          </Card>
        )}
        {ms.status === "ERROR" && ms.error && (
          <Card className="mt-6 border-accent/40 bg-accent-soft/50 text-sm text-accent">{ms.error}</Card>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-8">
            {report ? <ReportView report={report} base={base} /> : (
              <Card className="text-sm text-muted">
                {busy
                  ? "The full-book report will appear here when the reader finishes the last chapter."
                  : "Start a read to get chapter-by-chapter notes and a full editorial report."}
              </Card>
            )}
          </div>

          <aside className="space-y-4">
            {doneCount > 0 && (
              <Card>
                <p className="mb-3 text-sm font-medium">Engagement by chapter</p>
                <EngagementStrip
                  values={ms.chapters.map((c) => ({
                    label: c.title,
                    value: c.review?.status === "DONE" ? c.review.engagement : null,
                    href: `${base}/chapters/${c.index + 1}`,
                  }))}
                />
              </Card>
            )}
            <Card className="p-0">
              <p className="border-b border-line px-5 py-3 text-sm font-medium">Chapters</p>
              <ol className="divide-y divide-line">
                {ms.chapters.map((c) => (
                  <li key={c.id}>
                    <Link href={`${base}/chapters/${c.index + 1}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-line/30">
                      <span className="w-6 text-right text-muted tabular-nums">{c.index + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      {c.review?.status === "DONE" ? (
                        <span className="flex items-center gap-2 text-xs text-muted tabular-nums">
                          {c.review._count.notes > 0 && <span className="text-issue">{c.review._count.notes} open</span>}
                          <span>{c.review.engagement}/10</span>
                        </span>
                      ) : c.review ? (
                        <StatusBadge status={c.review.status} />
                      ) : (
                        <span className="text-xs text-muted tabular-nums">{c.wordCount.toLocaleString()}w</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ol>
            </Card>
            <form action={deleteManuscript.bind(null, ms.id)}>
              <SubmitButton className="text-xs text-muted hover:text-accent" confirm="Delete this manuscript and all its feedback?">
                Delete manuscript
              </SubmitButton>
            </form>
          </aside>
        </div>
      </main>
    </>
  );
}

function ReportView({ report, base }: { report: BookReportContent; base: string }) {
  const priorityLabel = ["", "Fix first", "Important", "Polish"];
  return (
    <>
      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-accent">Editorial letter</p>
        <p className="mt-3 font-serif text-xl leading-snug font-semibold">{report.headline}</p>
        <div className="manuscript mt-4 text-[1rem]">{report.letter}</div>
      </Card>

      <section>
        <h2 className="mb-3 font-serif text-xl font-semibold">What isn’t working yet</h2>
        <div className="space-y-3">
          {[...report.notWorking].sort((a, b) => a.priority - b.priority).map((p, i) => (
            <Card key={i}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-issue-soft px-2 py-0.5 text-xs font-medium text-issue">{priorityLabel[p.priority]}</span>
                <h3 className="font-medium">{p.title}</h3>
              </div>
              <p className="mt-2 text-sm">{p.detail}</p>
              <p className="mt-3 rounded-lg bg-praise-soft/60 p-3 text-sm">
                <b className="text-praise">How to fix it: </b>
                {p.fix}
              </p>
              {p.chapters.length > 0 && (
                <p className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted">
                  Most visible in:
                  {p.chapters.map((n) => (
                    <Link key={n} href={`${base}/chapters/${n}`} className="underline hover:text-ink">
                      ch. {n}
                    </Link>
                  ))}
                </p>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-xl font-semibold">What’s working</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {report.working.map((w, i) => (
            <Card key={i}>
              <h3 className="font-medium text-praise">{w.title}</h3>
              <p className="mt-1 text-sm">{w.detail}</p>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 font-serif text-xl font-semibold">Characters</h2>
          <Card className="space-y-3 text-sm">
            {report.characters.map((c, i) => (
              <p key={i}>
                <b>{c.name}.</b> {c.assessment}
              </p>
            ))}
          </Card>
        </section>
        <section>
          <h2 className="mb-3 font-serif text-xl font-semibold">Threads & promises</h2>
          <Card className="space-y-3 text-sm">
            {report.threads.map((t, i) => (
              <p key={i}>
                <span
                  className={`mr-2 rounded px-1.5 py-0.5 text-xs ${
                    t.status === "resolved" ? "bg-praise-soft text-praise" : t.status === "dropped" ? "bg-accent-soft text-accent" : "bg-issue-soft text-issue"
                  }`}
                >
                  {t.status}
                </span>
                <b>{t.thread}.</b> {t.note}
              </p>
            ))}
          </Card>
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-serif text-xl font-semibold">Pacing</h2>
        <Card className="text-sm">{report.pacing}</Card>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-xl font-semibold">Revision plan</h2>
        <Card>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {report.revisionPlan.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Card>
      </section>
    </>
  );
}
