import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { readChangedChapters } from "@/app/reimportActions";
import { SubmitButton } from "@/components/SubmitButton";
import { buttonClass, Card, ghostButtonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { checkedLine, compareDraft, parseDraftSummary, type DraftChapterInput, type RevisionCheckData } from "@/lib/manuscript/drafts";
import { isReviewStale, isStale } from "@/lib/reader/pipeline";

export const metadata = { title: "Draft changes" };

const VERDICT = {
  fixed: ["Fixed", "bg-praise-soft text-praise"],
  partly: ["Partly", "bg-issue-soft text-issue"],
  still_there: ["Still there", "bg-danger-soft text-danger"],
} as const;

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function DraftChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      draft: true,
      status: true,
      updatedAt: true,
      drafts: { orderBy: { number: "desc" }, select: { number: true, summary: true, createdAt: true } },
      chapters: {
        orderBy: { index: "asc" },
        select: {
          index: true,
          title: true,
          contentUpdatedAt: true,
          review: {
            select: {
              status: true,
              readAt: true,
              updatedAt: true,
              draft: true,
              engagement: true,
              revisionCheck: true,
              notes: { where: { category: "continuity", status: "OPEN" }, select: { id: true, quote: true, comment: true } },
            },
          },
        },
      },
    },
  });
  if (!ms) notFound();
  const base = `/manuscripts/${ms.id}`;
  const busy = (ms.status === "QUEUED" || ms.status === "READING") && !isStale(ms.status, ms.updatedAt);

  const inputs: DraftChapterInput[] = ms.chapters.map((c) => {
    const r = c.review;
    const done = r?.status === "DONE";
    return {
      number: c.index + 1,
      title: c.title,
      stale: done ? isReviewStale(r, c.contentUpdatedAt) : false,
      review: done
        ? {
            draft: r.draft,
            engagement: r.engagement,
            revisionCheck: (r.revisionCheck as RevisionCheckData | null) ?? null,
            continuity: r.notes,
          }
        : null,
    };
  });
  const latest = ms.drafts.find((d) => d.number === ms.draft);
  const imported = latest ? parseDraftSummary(latest.summary) : null;
  const cmp = compareDraft(ms.draft, inputs, imported);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 lg:px-12">
      <h1 className="font-serif text-3xl font-semibold">Draft changes</h1>
      <p className="mt-2 max-w-3xl text-muted">
        What your latest draft changed for the reader: which earlier issues it fixed, how engagement moved, and the continuity problems the new
        version has.
      </p>

      {ms.draft === 1 ? (
        <Card className="mt-8 text-sm">
          <p>This is your first draft. When you bring in a revised one, this page compares it with this draft’s read.</p>
          <Link href={`${base}/update`} className={`${buttonClass} mt-4`}>
            Update from a new draft
          </Link>
        </Card>
      ) : (
        <>
          <section className="mt-8 grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
            <Card>
              <p className="text-sm text-muted">
                Draft {ms.draft} vs draft {ms.draft - 1}
                {latest ? ` · imported ${fmtDate(latest.createdAt)}` : ""}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="draft-totals">
                <Stat label="Earlier issues fixed" value={cmp.totals.fixed} tone="text-praise" />
                <Stat label="Partly fixed" value={cmp.totals.partly} tone="text-issue" />
                <Stat label="Still there" value={cmp.totals.stillThere} tone="text-danger" />
                <Stat label="Continuity problems" value={cmp.totals.continuity} tone={cmp.totals.continuity ? "text-issue" : "text-muted"} />
              </dl>
              {(cmp.totals.up > 0 || cmp.totals.down > 0) && (
                <p className="mt-4 text-sm text-muted">
                  Engagement went up in {cmp.totals.up} chapter{cmp.totals.up === 1 ? "" : "s"} and down in {cmp.totals.down}.
                </p>
              )}
            </Card>
            {imported && (
              <Card className="text-sm">
                <p className="font-medium">What the import changed</p>
                <ul className="mt-2 space-y-1 text-muted">
                  <li>{imported.changed.length} edited</li>
                  {imported.added.length > 0 && <li>{imported.added.length} new: {imported.added.slice(0, 4).join(", ")}{imported.added.length > 4 ? "…" : ""}</li>}
                  {imported.removed.length > 0 && (
                    <li>
                      {imported.removed.length} removed: {imported.removed.slice(0, 4).join(", ")}
                      {imported.removed.length > 4 ? "…" : ""}
                    </li>
                  )}
                  <li>{imported.unchanged} unchanged, notes kept</li>
                </ul>
              </Card>
            )}
          </section>

          {cmp.waiting.length > 0 && (
            <Card className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-accent/40 bg-accent-soft/60">
              <p className="min-w-0 flex-1 text-sm">
                <b>
                  {cmp.waiting.length} changed chapter{cmp.waiting.length === 1 ? " hasn’t" : "s haven’t"} been read yet
                </b>
                <span className="text-muted">
                  {" "}
                  ({cmp.waiting
                    .slice(0, 6)
                    .map((w) => w.number)
                    .join(", ")}
                  {cmp.waiting.length > 6 ? "…" : ""}). Read {cmp.waiting.length === 1 ? "it" : "them"} to see whether this draft fixed {cmp.waiting.length === 1 ? "its" : "their"} issues.
                </span>
              </p>
              {!busy && (
                <form action={readChangedChapters.bind(null, ms.id)}>
                  <SubmitButton className={buttonClass} pendingLabel="Starting…">
                    Read the changes
                  </SubmitButton>
                </form>
              )}
            </Card>
          )}

          <section className="mt-8 space-y-4" data-testid="draft-chapters">
            {cmp.chapters.length === 0 ? (
              <Card className="text-sm text-muted">Nothing from this draft has been read yet.</Card>
            ) : (
              cmp.chapters.map((c) => (
                <Card key={c.number}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link href={`${base}/chapters/${c.number}`} className="font-serif text-lg font-semibold hover:text-accent">
                      {c.number}. {c.title}
                    </Link>
                    <span className="text-sm text-muted">{c.kind === "revised" ? checkedLine(c.checked, c.unchecked) : "New in this draft"}</span>
                    {c.after != null && (
                      <span className="ml-auto text-sm text-muted">
                        {c.before != null ? (
                          <>
                            Engagement {c.before} →{" "}
                            <b className={c.after > c.before ? "text-praise" : c.after < c.before ? "text-danger" : "text-ink"}>{c.after}</b>
                          </>
                        ) : (
                          <>Engagement {c.after}/10</>
                        )}
                      </span>
                    )}
                  </div>
                  {c.checked.length > 0 && (
                    <ul className="mt-3 space-y-2.5 text-sm">
                      {c.checked.map((n, i) => {
                        const [label, cls] = VERDICT[n.verdict];
                        return (
                          <li key={i}>
                            <div className="flex items-start gap-2">
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
                              <span className="font-serif italic text-muted">“{n.quote}”</span>
                            </div>
                            <p className="mt-1 pl-1">{n.explanation}</p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {c.continuity.length > 0 && (
                    <div className="mt-3 rounded-lg bg-issue-soft/50 px-3 py-2.5 text-sm">
                      <p className="font-medium text-issue">Continuity in this version</p>
                      <ul className="mt-1 space-y-1.5">
                        {c.continuity.map((n) => (
                          <li key={n.id}>
                            <Link href={`${base}/chapters/${c.number}?note=${n.id}`} className="font-serif italic hover:underline">
                              “{n.quote}”
                            </Link>{" "}
                            <span className="text-muted">{n.comment}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              ))
            )}
          </section>

          {ms.drafts.length > 1 && (
            <p className="mt-8 text-sm text-muted">
              Earlier drafts: {ms.drafts
                .filter((d) => d.number !== ms.draft)
                .map((d) => `draft ${d.number} (${fmtDate(d.createdAt)})`)
                .join(", ")}
              , and draft 1.
            </p>
          )}
          <div className="mt-6">
            <Link href={`${base}/update`} className={ghostButtonClass}>
              Update from a new draft
            </Link>
          </div>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-serif text-3xl font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}
