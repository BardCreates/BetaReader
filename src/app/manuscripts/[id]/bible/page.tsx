import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";

export const metadata = { title: "Story bible" };

const CATEGORY_LABEL: Record<string, string> = {
  character: "Characters",
  place: "Places",
  object: "Objects",
  timeline: "Timeline",
  world: "World & rules",
};
const CATEGORY_ORDER = ["character", "place", "object", "timeline", "world"];

export default async function StoryBiblePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      facts: {
        select: { id: true, subject: true, category: true, fact: true, chapter: { select: { index: true } } },
        orderBy: [{ chapter: { index: "asc" } }, { createdAt: "asc" }],
      },
    },
  });
  if (!ms) notFound();
  const base = `/manuscripts/${ms.id}`;

  const issues = await db.note.findMany({
    where: { category: "continuity", review: { chapter: { manuscriptId: ms.id } } },
    select: {
      id: true,
      quote: true,
      comment: true,
      suggestion: true,
      status: true,
      review: { select: { chapter: { select: { index: true, title: true } } } },
    },
  });
  issues.sort((a, b) => a.review.chapter.index - b.review.chapter.index);
  const open = issues.filter((i) => i.status === "OPEN");
  const closed = issues.length - open.length;

  // Category → subject → facts. Subjects with the most facts first.
  const byCategory = new Map<string, Map<string, { name: string; facts: typeof ms.facts }>>();
  for (const f of ms.facts) {
    const cat = CATEGORY_LABEL[f.category] ? f.category : "world";
    const subjects = byCategory.get(cat) ?? new Map();
    const key = f.subject.trim().toLowerCase();
    const entry = subjects.get(key) ?? { name: f.subject.trim(), facts: [] };
    entry.facts.push(f);
    subjects.set(key, entry);
    byCategory.set(cat, subjects);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 lg:px-12">
      <h1 className="font-serif text-3xl font-semibold">Story bible</h1>
      <p className="mt-2 max-w-3xl text-muted">
        What the reader picked up as concrete fact while reading: who’s who, injuries, ages, places, timeline and the rules of your world.
        Each chapter is checked against everything established before it, so contradictions show up as notes on the passage.
      </p>

      <section className="mt-8">
        <h2 className="font-serif text-xl font-semibold">Continuity problems</h2>
        {issues.length === 0 ? (
          <Card className="mt-3 text-sm text-muted">
            {ms.facts.length
              ? "The reader didn’t find any contradictions."
              : "Nothing yet. Continuity is checked during a read; reads from before this feature need a fresh read."}
          </Card>
        ) : (
          <>
            <p className="mt-1 mb-3 text-sm text-muted">
              {open.length} open{closed ? `, ${closed} marked fixed or dismissed` : ""}.
            </p>
            <ul className="space-y-3">
              {open.map((i) => (
                <li key={i.id}>
                  <Card className="p-4" data-testid="continuity-issue">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-serif italic text-ink">“{i.quote}”</p>
                      <Link href={`${base}/chapters/${i.review.chapter.index + 1}?note=${i.id}`} className="shrink-0 text-sm text-accent hover:underline">
                        Chapter {i.review.chapter.index + 1}
                      </Link>
                    </div>
                    <p className="mt-2 text-sm">{i.comment}</p>
                    {i.suggestion && (
                      <p className="mt-2 rounded-lg bg-praise-soft/60 px-3 py-2 text-sm">
                        <b className="text-praise">Try:</b> {i.suggestion}
                      </p>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {ms.facts.length > 0 && (
        <section className="mt-10">
          <h2 className="font-serif text-xl font-semibold">What the book has established</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            {ms.facts.length} facts, in the order the reader learned them. Use this as a quick reference while you revise.
          </p>
          <div className="space-y-8">
            {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((cat) => {
              const subjects = [...byCategory.get(cat)!.values()].sort((a, b) => b.facts.length - a.facts.length);
              return (
                <div key={cat}>
                  <h3 className="mb-3 text-sm font-medium text-muted">{CATEGORY_LABEL[cat]}</h3>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {subjects.map((s) => (
                      <Card key={s.name} className="p-4">
                        <p className="font-serif text-lg font-semibold">{s.name}</p>
                        <ul className="mt-2 space-y-1.5 text-sm">
                          {s.facts.map((f) => (
                            <li key={f.id} className="flex gap-2">
                              <Link
                                href={`${base}/chapters/${f.chapter.index + 1}`}
                                className="w-10 shrink-0 text-xs leading-5 text-muted tabular-nums hover:text-accent"
                                title={`Established in chapter ${f.chapter.index + 1}`}
                              >
                                ch. {f.chapter.index + 1}
                              </Link>
                              <span>{f.fact}</span>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
