import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { buildDropoff, type DropoffRow } from "@/lib/reader/dropoff";

export const metadata = { title: "Drop-off map" };

const FALLBACK_CATEGORIES = ["pacing", "tension", "clarity"];

export default async function DropoffPage({ params }: { params: Promise<{ id: string }> }) {
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
          review: {
            select: {
              status: true,
              engagement: true,
              confusion: true,
              driftQuote: true,
              driftReason: true,
              notes: {
                where: { kind: "ISSUE", category: { in: FALLBACK_CATEGORIES }, status: { not: "DISMISSED" } },
                orderBy: [{ severity: "desc" }, { startOffset: "asc" }],
                take: 1,
                select: { id: true, quote: true, comment: true },
              },
            },
          },
        },
      },
    },
  });
  if (!ms) notFound();

  const base = `/manuscripts/${ms.id}`;
  const { rows, hotspots } = buildDropoff(
    ms.chapters.map((c) => {
      const r = c.review?.status === "DONE" ? c.review : null;
      const note = r?.notes[0];
      return {
        number: c.index + 1,
        title: c.title,
        read: !!r,
        engagement: r?.engagement ?? null,
        confusion: r?.confusion ?? null,
        drift: r?.driftQuote ? { quote: r.driftQuote, reason: r.driftReason ?? "" } : null,
        fallback: note ? { quote: note.quote, reason: note.comment, noteId: note.id } : null,
      };
    }),
  );
  const read = rows.filter((r) => r.read);
  const olderReads = read.some((r) => r.confusion == null);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 lg:px-12">
      <h1 className="font-serif text-3xl font-semibold">Drop-off map</h1>
      {read.length === 0 ? (
        <p className="mt-2 max-w-3xl text-muted">
          Where a reader would be likeliest to put your book down, chapter by chapter, with the passage where their attention slipped. It’s built
          during a read, so start one from{" "}
          <Link href={base} className="text-accent underline">
            Overview
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-3xl text-muted">
            {hotspots.length === 0
              ? `Across ${read.length} chapters the reader never seriously cooled. No chapter stands out as a place to stop.`
              : `Across ${read.length} chapters, ${hotspots.length === 1 ? "one place stands" : `${hotspots.length} places stand`} out where a reader would be likeliest to stop. Start revising there.`}
          </p>

          {hotspots.length > 0 && (
            <section className="mt-8 grid gap-4 lg:grid-cols-3">
              {hotspots.map((h, i) => (
                <Card key={h.number} className={i === 0 ? "border-pen/50" : ""}>
                  <p className="text-xs font-medium tracking-wide text-muted uppercase">
                    {i === 0 ? "Likeliest to stop" : "Also at risk"} · ch. {h.number}
                  </p>
                  <h2 className="mt-1 font-serif text-lg font-semibold">
                    <Link href={chapterHref(base, h)} className="hover:underline">
                      {h.title}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted">{describe(h)}</p>
                  {h.passage && <Passage passage={h.passage} />}
                </Card>
              ))}
            </section>
          )}

          <section className="mt-10">
            <h2 className="font-serif text-xl font-semibold">Chapter by chapter</h2>
            <p className="mt-1 mb-3 text-sm text-muted">
              <Legend className="bg-accent" /> how much they wanted to keep reading · <Legend className="bg-issue" /> how lost they were
            </p>
            <Card className="p-0">
              <ol className="divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.number} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,15rem)_9rem_1fr] md:items-start md:gap-5">
                    <div className="min-w-0">
                      <Link href={chapterHref(base, r)} className="font-serif hover:underline">
                        <span className="mr-1.5 text-sm text-muted tabular-nums">{r.number}.</span>
                        {r.title}
                      </Link>
                      {r.drop != null && r.drop >= 2 && (
                        <p className="mt-0.5 text-xs font-medium text-pen">
                          ↓ {r.drop} from the chapter before
                        </p>
                      )}
                    </div>
                    {r.read ? (
                      <div className="space-y-1.5 pt-1" aria-label={`Engagement ${r.engagement}/10${r.confusion != null ? `, confusion ${r.confusion}/10` : ""}`}>
                        <Bar value={r.engagement} className="bg-accent" />
                        <Bar value={r.confusion} className="bg-issue" />
                      </div>
                    ) : (
                      <p className="text-sm text-muted">Not read yet</p>
                    )}
                    <div className="min-w-0 text-sm">{r.passage ? <Passage passage={r.passage} compact /> : r.read && <span className="text-muted">Attention held throughout.</span>}</div>
                  </li>
                ))}
              </ol>
            </Card>
            {olderReads && (
              <p className="mt-3 text-xs text-muted">
                Some chapters were read before the drop-off map existed, so they have no confusion score and show their biggest pacing or clarity note
                instead. Re-read them to fill the map in.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function chapterHref(base: string, r: DropoffRow) {
  const noteId = r.passage && "noteId" in r.passage ? r.passage.noteId : undefined;
  return `${base}/chapters/${r.number}${noteId ? `?note=${noteId}` : ""}`;
}

function describe(r: DropoffRow) {
  const parts = [`Wanted to keep reading: ${r.engagement}/10`];
  if (r.drop != null && r.drop >= 2) parts.push(`down ${r.drop} from the chapter before`);
  if (r.confusion != null && r.confusion >= 5) parts.push(`lost: ${r.confusion}/10`);
  return parts.join(" · ");
}

function Bar({ value, className }: { value: number | null; className: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-line/60">
        {value != null && <div className={`h-2 rounded-full ${className}`} style={{ width: `${value * 10}%` }} />}
      </div>
      <span className="w-5 text-right text-xs text-muted tabular-nums">{value ?? "–"}</span>
    </div>
  );
}

function Legend({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-3 rounded-full align-middle ${className}`} aria-hidden />;
}

function Passage({ passage, compact = false }: { passage: { quote: string; reason: string }; compact?: boolean }) {
  return (
    <div className={compact ? "" : "mt-3 text-sm"}>
      <blockquote className="border-l-2 border-pen/60 pl-3 font-serif text-ink">“{passage.quote}”</blockquote>
      {passage.reason && <p className="mt-1 pl-3.5 text-muted">{passage.reason}</p>}
    </div>
  );
}
