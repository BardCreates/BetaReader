import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { dropPoints, parseDropOff } from "@/lib/reader/dropOff";
import { isReviewStale } from "@/lib/reader/pipeline";

export const metadata = { title: "Reader map" };

const barTone = (v: number) => (v >= 7 ? "bg-praise" : v >= 5 ? "bg-issue" : "bg-danger");

export default async function ReaderMapPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
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
              engagement: true,
              dropOff: true,
              draft: true,
              notes: { where: { kind: "ISSUE", status: "OPEN" }, select: { category: true } },
            },
          },
        },
      },
    },
  });
  if (!ms) notFound();
  const base = `/manuscripts/${ms.id}`;

  const rows = ms.chapters.map((c) => {
    const read = c.review?.status === "DONE";
    const issues = read ? (c.review?.notes ?? []) : [];
    return {
      number: c.index + 1,
      title: c.title,
      engagement: read ? (c.review?.engagement ?? null) : null,
      dropOff: read ? parseDropOff(c.review?.dropOff) : null,
      // Reads from before the map existed never recorded a drop-off (they have no draft number).
      tracked: read && c.review?.draft != null,
      edited: read && isReviewStale(c.review, c.contentUpdatedAt),
      issues: issues.length,
      confusing: issues.filter((n) => n.category === "clarity").length,
    };
  });
  const read = rows.filter((r) => r.engagement != null);
  const drops = dropPoints(rows);
  const dropSet = new Set(drops.map((d) => d.number));
  const untracked = rows.filter((r) => r.engagement != null && !r.tracked).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 lg:px-12">
      <h1 className="font-serif text-3xl font-semibold">Reader map</h1>
      <p className="mt-2 max-w-3xl text-muted">
        How much the reader wanted to keep going at the end of each chapter, and the passage where its attention dipped most, quoted from your
        page. Chapters where a reader is most likely to put the book down are marked.
      </p>

      {read.length === 0 ? (
        <Card className="mt-8 text-sm text-muted">The map fills in as the reader works through your chapters.</Card>
      ) : (
        <>
          {drops.length > 0 && (
            <Card className="mt-6 border-issue/40 bg-issue-soft/40 text-sm" data-testid="drop-points">
              <p className="font-medium">Where a reader might stop</p>
              <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                {drops.map((d) => (
                  <li key={d.number}>
                    <Link href={`${base}/chapters/${d.number}`} className="underline hover:text-ink">
                      Chapter {d.number}
                    </Link>
                    <span className="text-muted"> · {d.from != null ? `${d.from} → ${d.to}` : `${d.to}/10`}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {untracked > 0 && (
            <p className="mt-4 text-sm text-muted">
              {untracked} chapter{untracked === 1 ? " was" : "s were"} read before the map recorded drop-off passages. Re-read{" "}
              {untracked === 1 ? "it" : "them"} to fill in where the reader’s attention dipped.
            </p>
          )}

          <ol className="mt-6 divide-y divide-line rounded-xl border border-line bg-card" data-testid="reader-map">
            {rows.map((r) => (
              <li key={r.number} className="grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <div className="min-w-0">
                  <Link href={`${base}/chapters/${r.number}`} className="flex items-baseline gap-2 hover:text-accent">
                    <span className="w-6 shrink-0 text-right text-xs text-muted tabular-nums">{r.number}</span>
                    <span className="truncate font-medium" title={r.title}>
                      {r.title}
                    </span>
                    {dropSet.has(r.number) && (
                      <span className="shrink-0 rounded-full bg-issue-soft px-1.5 text-xs font-medium text-issue" title="A reader might stop here">
                        drop
                      </span>
                    )}
                  </Link>
                  <div className="mt-2 flex items-center gap-2 pl-8">
                    {r.engagement != null ? (
                      <>
                        <div className="h-2 flex-1 rounded-full bg-line/60" aria-hidden>
                          <div className={`h-2 rounded-full ${barTone(r.engagement)}`} style={{ width: `${r.engagement * 10}%` }} />
                        </div>
                        <span className="w-9 text-right text-xs tabular-nums">{r.engagement}/10</span>
                        {r.edited && (
                          <span className="text-xs text-muted" title="You’ve edited this chapter since it was read">
                            · edited
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted">Not read yet</span>
                    )}
                  </div>
                </div>
                <div className="min-w-0 text-sm sm:pt-0.5">
                  {r.dropOff ? (
                    <>
                      <p className="font-serif italic text-ink">“{r.dropOff.quote}”</p>
                      <p className="mt-1 text-muted">{r.dropOff.why}</p>
                    </>
                  ) : (
                    r.tracked &&
                    r.engagement != null &&
                    r.engagement >= 7 && <p className="text-muted">No dip: the reader stayed with it.</p>
                  )}
                  {(r.issues > 0 || r.confusing > 0) && (
                    <p className="mt-1.5 text-xs text-muted">
                      {r.issues} open issue{r.issues === 1 ? "" : "s"}
                      {r.confusing > 0 && <span className="text-issue"> · {r.confusing} where the reader was confused</span>}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
