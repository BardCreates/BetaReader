import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { deleteManuscript, startReading } from "@/app/actions";
import { readChangedChapters } from "@/app/reimportActions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Prose } from "@/components/Prose";
import { SubmitButton } from "@/components/SubmitButton";
import { buttonClass, Card, EngagementStrip, ghostButtonClass, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { personaFor } from "@/lib/reader/personas";
import { MIN_WORDS_TO_READ, isReviewStale, isStale } from "@/lib/reader/pipeline";
import type { BookReportContent } from "@/lib/reader/schemas";

export default async function ManuscriptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const justUpdated = sp.updated !== undefined;
  const notice = typeof sp.notice === "string" ? sp.notice : null;
  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    include: {
      report: true,
      pitchKit: { select: { status: true } },
      _count: { select: { threads: true, characters: true, facts: true } },
      chapters: {
        orderBy: { index: "asc" },
        select: {
          id: true,
          index: true,
          title: true,
          wordCount: true,
          contentUpdatedAt: true,
          review: {
            select: {
              status: true,
              readAt: true,
              updatedAt: true,
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

  const stale = isStale(ms.status, ms.updatedAt);
  const busy = (ms.status === "QUEUED" || ms.status === "READING") && !stale;
  const doneCount = ms.chapters.filter((c) => c.review?.status === "DONE").length;
  const report = ms.report?.status === "DONE" ? (ms.report.content as BookReportContent) : null;
  const base = `/manuscripts/${ms.id}`;
  const openContinuity = await db.note.count({
    where: { category: "continuity", status: "OPEN", review: { chapter: { manuscriptId: ms.id } } },
  });
  // Chapters the reader hasn't seen in their current form: edited since their read, or never read.
  const toRead = ms.chapters.filter(
    (c) => c.wordCount >= MIN_WORDS_TO_READ && (!c.review || c.review.status !== "DONE" || isReviewStale(c.review, c.contentUpdatedAt)),
  );
  const showReadChanges = !busy && doneCount > 0 && toRead.length > 0 && ms.status === "DONE";

  return (
    <>
      <AutoRefresh active={busy} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-3xl font-semibold">{ms.title}</h1>
              <StatusBadge status={ms.status} paused={ms.status === "ERROR" && ms.errorCode === "LIMIT"} />
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
                <SubmitButton className={showReadChanges ? ghostButtonClass : buttonClass} pendingLabel="Starting…" confirm={ms.status === "DONE" ? "Start a fresh read? This replaces the current notes and report." : undefined}>
                  {ms.status === "DRAFT" ? "Start reading" : ms.status === "DONE" ? "Read again" : "Resume reading"}
                </SubmitButton>
              </form>
            )}
            {FEATURES.editorChat && (
              <Link href={`${base}/editor`} className={ghostButtonClass}>
                Talk to the editor
              </Link>
            )}
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
        {showReadChanges && (
          <Card className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-accent/40 bg-accent-soft/60" data-testid="read-changes">
            <p className="min-w-0 flex-1 text-sm">
              {justUpdated ? "Draft updated. " : ""}
              <b>
                {toRead.length} chapter{toRead.length === 1 ? " has" : "s have"} changed
              </b>{" "}
              since the reader last saw {toRead.length === 1 ? "it" : "them"}
              <span className="text-muted">
                {" "}
                ({toRead
                  .slice(0, 6)
                  .map((c) => c.index + 1)
                  .join(", ")}
                {toRead.length > 6 ? "…" : ""}). Read just those and refresh the report, without starting over.
              </span>
            </p>
            <form action={readChangedChapters.bind(null, ms.id)}>
              <SubmitButton className={buttonClass} pendingLabel="Starting…">
                Read the changes
              </SubmitButton>
            </form>
          </Card>
        )}
        {justUpdated && !showReadChanges && !busy && (
          <Card className="mt-6 text-sm text-muted">Draft updated.</Card>
        )}
        {stale && (
          <Card className="mt-6 border-danger/40 bg-danger-soft/60 text-sm text-danger">
            The read stopped making progress (the server may have restarted). Resume to pick up where it left off.
          </Card>
        )}
        {notice === "busy" && !busy && (
          <Card className="mt-6 border-issue/40 bg-issue-soft/60 text-sm text-issue">
            Another of your books is being read right now. The reader works on one book at a time; start this one when that read finishes.
          </Card>
        )}
        {(notice === "limit" || (ms.status === "ERROR" && ms.errorCode === "LIMIT")) && !busy && (
          <LimitCard
            message={
              ms.status === "ERROR" && ms.errorCode === "LIMIT" && ms.error
                ? `The reader paused at chapter ${Math.min(doneCount + 1, ms.chapters.length)}. ${ms.error}`
                : "You don’t have any reading allowance left. Upgrade or buy a book pass to start this read."
            }
            resumeNote={ms.status === "ERROR" && ms.errorCode === "LIMIT"}
          />
        )}
        {ms.status === "ERROR" && ms.error && ms.errorCode !== "LIMIT" && (
          <Card className="mt-6 border-danger/40 bg-danger-soft/60 text-sm text-danger">{ms.error}</Card>
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
            <Card className="p-2">
              <p className="px-3 pt-2 pb-1 text-sm font-medium">Your book</p>
              <ul>
                <Tool href={`${base}/journey`} title="Reader journey" detail={ms._count.threads ? `${ms._count.threads} questions and predictions` : "Built during a read"} />
                <Tool
                  href={`${base}/bible`}
                  title="Story bible"
                  detail={openContinuity ? `${openContinuity} continuity problem${openContinuity === 1 ? "" : "s"}` : ms._count.facts ? `${ms._count.facts} facts, no contradictions` : "Built during a read"}
                  alert={openContinuity > 0}
                />
                {FEATURES.characterChat && (
                  <Tool href={`${base}/characters`} title="Characters" detail={ms._count.characters ? `${ms._count.characters} to talk to` : "Find them in your manuscript"} />
                )}
                <Tool
                  href={`${base}/pitch`}
                  title="Pitch kit"
                  detail={ms.pitchKit?.status === "DONE" ? "Logline, blurb, synopsis, query" : report ? "Ready to write" : "After a full read"}
                />
                <Tool href={`${base}/update`} title="Update from new draft" detail="Upload a fresh export from Dabble or Word" />
              </ul>
            </Card>
            <form action={deleteManuscript.bind(null, ms.id)} className="px-1">
              <SubmitButton className="text-xs text-muted hover:text-danger" confirm="Delete this manuscript and all its feedback?">
                Delete manuscript
              </SubmitButton>
            </form>
          </aside>
        </div>
      </main>
    </>
  );
}

function Tool({ href, title, detail, alert = false }: { href: string; title: string; detail: string; alert?: boolean }) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-line/40">
        <span className="min-w-0 flex-1">
          <span className="block text-[0.95rem] font-medium group-hover:text-accent">{title}</span>
          <span className={`block text-sm ${alert ? "text-issue" : "text-muted"}`}>{detail}</span>
        </span>
        <span aria-hidden className="text-muted transition-transform group-hover:translate-x-0.5">›</span>
      </Link>
    </li>
  );
}

function LimitCard({ message, resumeNote }: { message: string; resumeNote: boolean }) {
  return (
    <Card className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-issue/40 bg-issue-soft/50" data-testid="limit-card">
      <p className="min-w-0 flex-1 text-sm">
        {message}
        {resumeNote && <span className="text-muted"> When you have more, choose Resume reading and it picks up where it stopped.</span>}
      </p>
      <div className="flex gap-2">
        <Link href="/pricing" className={buttonClass}>
          See plans
        </Link>
        <Link href="/account" className={ghostButtonClass}>
          Your usage
        </Link>
      </div>
    </Card>
  );
}

function ReportView({ report, base }: { report: BookReportContent; base: string }) {
  const priorityLabel = ["", "Fix first", "Important", "Polish"];
  return (
    <>
      <Card>
        <p className="text-sm font-medium text-muted">Editorial letter</p>
        <p className="mt-3 font-serif text-xl leading-snug font-semibold">{report.headline}</p>
        <Prose text={report.letter} className="mt-4 max-w-[68ch]" />
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
                  {[...new Set(p.chapters)].map((n) => (
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
                    t.status === "resolved" ? "bg-praise-soft text-praise" : t.status === "dropped" ? "bg-danger-soft text-danger" : "bg-issue-soft text-issue"
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
