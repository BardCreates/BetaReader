import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";

export const metadata = { title: "Reader journey" };

type Thread = {
  id: string;
  kind: "QUESTION" | "PREDICTION";
  text: string;
  outcome: "OPEN" | "ANSWERED" | "CONFIRMED" | "REFUTED";
  resolution: string | null;
  raised: number; // 1-based chapter
  resolved: number | null;
};

export default async function JourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      chapters: { orderBy: { index: "asc" }, select: { index: true, title: true, review: { select: { status: true, engagement: true } } } },
      threads: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          kind: true,
          text: true,
          outcome: true,
          resolution: true,
          raisedChapter: { select: { index: true } },
          resolvedChapter: { select: { index: true } },
        },
      },
    },
  });
  if (!ms) notFound();

  const base = `/manuscripts/${ms.id}`;
  const total = ms.chapters.length;
  const threads: Thread[] = ms.threads
    .map((t) => ({
      id: t.id,
      kind: t.kind,
      text: t.text,
      outcome: t.outcome,
      resolution: t.resolution,
      raised: t.raisedChapter.index + 1,
      resolved: t.resolvedChapter ? t.resolvedChapter.index + 1 : null,
    }))
    .sort((a, b) => a.raised - b.raised);

  const questions = threads.filter((t) => t.kind === "QUESTION");
  const predictions = threads.filter((t) => t.kind === "PREDICTION");
  const unanswered = questions.filter((t) => t.outcome === "OPEN");
  const guessed = predictions.filter((t) => t.outcome === "CONFIRMED");
  const surprises = predictions.filter((t) => t.outcome === "REFUTED");
  const engagement = ms.chapters.map((c) => (c.review?.status === "DONE" ? c.review.engagement : null));
  const readCount = engagement.filter((v) => v != null).length;

  return (
    <main className="max-w-6xl px-4 py-10 sm:px-8 lg:px-12">
      <h1 className="font-serif text-3xl font-semibold">Reader journey</h1>
      {threads.length > 0 ? (
        <p className="mt-2 max-w-3xl text-muted">
          Across {readCount} chapters the reader raised <b className="text-ink">{questions.length} questions</b> and made{" "}
          <b className="text-ink">{predictions.length} predictions</b>. {unanswered.length} question{unanswered.length === 1 ? " was" : "s were"} never answered,{" "}
          {guessed.length} prediction{guessed.length === 1 ? "" : "s"} came true, and {surprises.length} {surprises.length === 1 ? "was" : "were"} overturned.
        </p>
      ) : (
        <p className="mt-2 max-w-3xl text-muted">
          The journey shows what the reader wondered and predicted as they read, and when your book answered it. It’s built during a read, so
          start one from <Link href={base} className="text-accent underline">Overview</Link>. Reads from before this feature need a fresh read.
        </p>
      )}

      {readCount > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-xl font-semibold">How much they wanted to keep reading</h2>
          <Card>
            <EngagementLine values={engagement} base={base} titles={ms.chapters.map((c) => c.title)} />
          </Card>
        </section>
      )}

      {threads.length > 0 && (
        <>
          <section className="mt-10 grid gap-6 lg:grid-cols-3">
            <Stat
              tone="danger"
              title="Never answered"
              value={unanswered.length}
              note="Questions the reader raised that the book didn’t settle. Each is either a deliberate open end or a dropped thread."
            />
            <Stat
              tone="issue"
              title="Saw it coming"
              value={guessed.length}
              note="Predictions that came true. Guessed long before the reveal can mean a twist is telegraphed."
            />
            <Stat tone="praise" title="Surprised them" value={surprises.length} note="Predictions the story overturned: turns the reader didn’t see coming." />
          </section>

          {predictions.length > 0 && (
            <section className="mt-10">
              <h2 className="font-serif text-xl font-semibold">Predictions</h2>
              <p className="mt-1 mb-3 text-sm text-muted">What the reader expected, and what your book did with it.</p>
              <ThreadMap threads={predictions} total={total} base={base} />
            </section>
          )}

          {questions.length > 0 && (
            <section className="mt-10">
              <h2 className="font-serif text-xl font-semibold">Questions</h2>
              <p className="mt-1 mb-3 text-sm text-muted">What the reader was wondering, from the chapter it came up to the chapter it was answered.</p>
              <ThreadMap threads={questions} total={total} base={base} />
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ title, value, note, tone }: { title: string; value: number; note: string; tone: "danger" | "issue" | "praise" }) {
  const color = { danger: "text-danger", issue: "text-issue", praise: "text-praise" }[tone];
  return (
    <Card>
      <p className="text-sm text-muted">{title}</p>
      <p className={`font-serif text-4xl font-semibold ${color}`}>{value}</p>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </Card>
  );
}

const OUTCOME_LABEL = {
  OPEN: "Never settled",
  ANSWERED: "Answered",
  CONFIRMED: "Came true",
  REFUTED: "Overturned",
} as const;
const OUTCOME_BAR = {
  OPEN: "border-2 border-dashed border-danger/70 bg-danger-soft/40",
  ANSWERED: "bg-reaction",
  CONFIRMED: "bg-issue",
  REFUTED: "bg-praise",
} as const;
const OUTCOME_CHIP = {
  OPEN: "bg-danger-soft text-danger",
  ANSWERED: "bg-reaction-soft text-reaction",
  CONFIRMED: "bg-issue-soft text-issue",
  REFUTED: "bg-praise-soft text-praise",
} as const;

/** Each thread as a bar from the chapter it was raised in to the chapter that settled it. */
function ThreadMap({ threads, total, base }: { threads: Thread[]; total: number; base: string }) {
  const pct = (chapter: number) => ((chapter - 1) / total) * 100;
  const ticks = Array.from({ length: total }, (_, i) => i + 1).filter((n) => total <= 20 || n === 1 || n % 5 === 0 || n === total);
  return (
    <Card className="p-0">
      <div className="hidden border-b border-line px-4 py-2 text-xs text-muted md:grid md:grid-cols-[minmax(0,22rem)_1fr] md:gap-4">
        <span>Chapter</span>
        <div className="relative h-4">
          {ticks.map((n) => (
            <span key={n} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pct(n) + 50 / total}%` }}>
              {n}
            </span>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-line">
        {threads.map((t) => {
          const end = t.resolved ?? total;
          const span = t.resolved ? t.resolved - t.raised : null;
          return (
            <li key={t.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,22rem)_1fr] md:items-center md:gap-4">
              <div className="min-w-0">
                <p className="font-serif">{t.text}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${OUTCOME_CHIP[t.outcome]}`}>{OUTCOME_LABEL[t.outcome]}</span>
                  <Link href={`${base}/chapters/${t.raised}`} className="underline hover:text-ink">
                    ch. {t.raised}
                  </Link>
                  {t.resolved && (
                    <>
                      →
                      <Link href={`${base}/chapters/${t.resolved}`} className="underline hover:text-ink">
                        ch. {t.resolved}
                      </Link>
                      {span != null && span > 0 && <span>({span} chapter{span === 1 ? "" : "s"})</span>}
                    </>
                  )}
                </p>
                {t.resolution && <p className="mt-1 text-xs text-muted">{t.resolution}</p>}
              </div>
              <div className="relative h-3 rounded-full bg-line/50" aria-hidden>
                <div
                  className={`absolute top-0 h-3 rounded-full ${OUTCOME_BAR[t.outcome]}`}
                  style={{ left: `${pct(t.raised)}%`, width: `${Math.max(((end - t.raised + 1) / total) * 100, 100 / total)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Engagement (1–10) per chapter as a line, with gaps for chapters not read. */
function EngagementLine({ values, base, titles }: { values: (number | null)[]; base: string; titles: string[] }) {
  const W = 800;
  const H = 180;
  const pad = { l: 28, r: 12, t: 12, b: 26 };
  const n = values.length;
  const x = (i: number) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + ((10 - v) / 9) * (H - pad.t - pad.b);
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${d && values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const step = n <= 20 ? 1 : 5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Reader engagement by chapter, 1 to 10">
      {[2, 4, 6, 8, 10].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)">
            {v}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} strokeLinejoin="round" />
      {values.map((v, i) =>
        v == null ? null : (
          <a key={i} href={`${base}/chapters/${i + 1}`}>
            <title>{`Chapter ${i + 1}: ${titles[i]} (${v}/10)`}</title>
            <circle cx={x(i)} cy={y(v)} r={4.5} fill="var(--color-card)" stroke="var(--color-accent)" strokeWidth={2} />
          </a>
        ),
      )}
      {values.map((_, i) =>
        (i + 1) % step === 0 || i === 0 ? (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
            {i + 1}
          </text>
        ) : null,
      )}
    </svg>
  );
}
