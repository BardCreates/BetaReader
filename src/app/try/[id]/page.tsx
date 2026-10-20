import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";
import { buttonClass, Card, ghostButtonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { TRIAL_RETENTION_DAYS } from "@/lib/trial";
import type { TrialNote, TrialResult } from "@/lib/trialRead";

export const metadata = { title: "Your sample read", robots: { index: false } };

const TONE = {
  issue: { mark: "bg-issue-soft decoration-issue", chip: "bg-issue-soft text-issue", label: "Problem" },
  praise: { mark: "bg-praise-soft decoration-praise", chip: "bg-praise-soft text-praise", label: "Working" },
  reaction: { mark: "bg-reaction-soft decoration-reaction", chip: "bg-reaction-soft text-reaction", label: "Reaction" },
} as const;

export default async function TrialResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trial = await db.trialRead.findUnique({
    where: { id },
    select: { id: true, title: true, content: true, wordCount: true, status: true, error: true, result: true, createdAt: true },
  });
  if (!trial) notFound();
  const signedIn = !!(await auth())?.user;
  const working = trial.status === "QUEUED" || trial.status === "READING";
  const r = trial.status === "DONE" ? (trial.result as TrialResult | null) : null;
  const start = signedIn ? "/manuscripts/new" : "/signin";
  const expires = new Date(trial.createdAt.getTime() + TRIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader signedIn={signedIn} />
      <AutoRefresh active={working} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-20 sm:px-8">
        <p className="text-sm text-muted">Sample read · {trial.wordCount.toLocaleString()} words</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold">{trial.title || "Your chapter"}</h1>

        {working && (
          <Card className="mt-6 max-w-2xl">
            <p className="font-serif text-lg">The reader is reading your chapter…</p>
            <p className="mt-1 text-sm text-muted">This usually takes a minute or two. This page updates by itself; you can leave and come back to this link.</p>
          </Card>
        )}
        {trial.status === "ERROR" && (
          <Card className="mt-6 max-w-2xl border-danger/40">
            <p className="text-danger">{trial.error ?? "The read didn’t finish."}</p>
            <Link href="/try" className={`${ghostButtonClass} mt-4`}>
              Try again
            </Link>
          </Card>
        )}

        {r && (
          <>
            <section className="mt-6 grid gap-4 sm:grid-cols-3">
              <Card>
                <p className="text-sm text-muted">Wanted to keep reading</p>
                <p className="font-serif text-4xl font-semibold">
                  {r.engagement}
                  <span className="text-lg font-normal text-muted">/10</span>
                </p>
              </Card>
              {r.confusion != null && (
                <Card>
                  <p className="text-sm text-muted">How lost they were</p>
                  <p className="font-serif text-4xl font-semibold">
                    {r.confusion}
                    <span className="text-lg font-normal text-muted">/10</span>
                  </p>
                </Card>
              )}
              <Card>
                <p className="text-sm text-muted">Notes on the page</p>
                <p className="font-serif text-4xl font-semibold">{r.notes.length}</p>
              </Card>
            </section>

            <section className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-6">
                <Card>
                  <h2 className="font-serif text-xl font-semibold">How it read</h2>
                  <div className="mt-3 space-y-3 font-serif leading-relaxed">
                    {r.reaction.split(/\n\s*\n/).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                  {r.drift && (
                    <div className="mt-5 border-t border-line pt-4 text-sm">
                      <p className="text-xs font-medium tracking-wide text-pen uppercase">Where attention slipped</p>
                      <blockquote className="mt-1.5 border-l-2 border-pen/60 pl-3 font-serif">“{r.drift.quote}”</blockquote>
                      <p className="mt-1 pl-3.5 text-muted">{r.drift.reason}</p>
                    </div>
                  )}
                </Card>
                <Card>
                  <h2 className="mb-4 font-serif text-xl font-semibold">Your chapter, marked up</h2>
                  <MarkedText text={trial.content} notes={r.notes} />
                </Card>
              </div>

              <aside className="space-y-4">
                {r.strengths.length > 0 && (
                  <Card>
                    <h2 className="font-serif text-base font-semibold">Keep these</h2>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {r.strengths.map((s, i) => (
                        <li key={i} className="border-l-2 border-praise/50 pl-3">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                <Card className="p-0">
                  <h2 className="px-5 pt-4 font-serif text-base font-semibold">Notes</h2>
                  <ol className="divide-y divide-line">
                    {numbered(r.notes).map(({ n, i }) => (
                      <li key={i} id={`note-${i + 1}`} className="px-5 py-3 text-sm">
                        <p className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-muted tabular-nums">{i + 1}</span>
                          <span className={`rounded-full px-2 py-0.5 font-medium ${TONE[n.kind].chip}`}>{TONE[n.kind].label}</span>
                          <span className="text-muted">{n.category}</span>
                        </p>
                        <p className="mt-1.5 font-serif text-muted">“{n.quote}”</p>
                        <p className="mt-1">{n.comment}</p>
                        {n.suggestion && <p className="mt-1 text-muted">→ {n.suggestion}</p>}
                      </li>
                    ))}
                  </ol>
                </Card>
                {r.questions.length > 0 && (
                  <Card>
                    <h2 className="font-serif text-base font-semibold">What they’re wondering</h2>
                    <ul className="mt-2 space-y-1.5 text-sm text-muted">
                      {r.questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </Card>
                )}
              </aside>
            </section>

            <section className="mt-10 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-[#24407c] px-8 py-8 text-white">
              <div className="max-w-2xl">
                <h2 className="font-serif text-2xl font-semibold">Now let it read the whole book.</h2>
                <p className="mt-2 opacity-85">
                  A full read carries memory from chapter to chapter: dropped threads, continuity errors, where readers would stop, and whether your
                  revisions fixed things. Your first {PLANS.free.allowance.words.toLocaleString()} words are free.
                </p>
              </div>
              <Link href={start} className="rounded-lg bg-white px-5 py-2.5 font-medium text-[#24407c] transition hover:opacity-90">
                {signedIn ? "Upload your manuscript" : "Start free"}
              </Link>
            </section>
          </>
        )}

        <p className="mt-8 text-xs text-muted">
          This sample is kept until {expires.toLocaleDateString("en-US", { month: "long", day: "numeric" })}, then deleted. Anyone with this link
          can see it.
        </p>
        {!r && !working && (
          <Link href="/try" className={`${buttonClass} mt-4`}>
            Read another chapter
          </Link>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

/** Notes in the order they're numbered: located ones by position, then the rest. */
function numbered(notes: TrialNote[]) {
  return notes
    .map((n, k) => ({ n, k }))
    .sort((a, b) => (a.n.start ?? Infinity) - (b.n.start ?? Infinity) || a.k - b.k)
    .map(({ n }, i) => ({ n, i }));
}

/** The chapter as paragraphs, with each located note highlighted and numbered. */
function MarkedText({ text, notes }: { text: string; notes: TrialNote[] }) {
  const located = numbered(notes).filter(({ n }) => n.start != null && n.end != null && n.end > n.start);
  // Drop overlaps: the earlier note wins.
  const marks: { start: number; end: number; num: number; kind: TrialNote["kind"] }[] = [];
  for (const { n, i } of located) {
    if (marks.length && n.start! < marks[marks.length - 1].end) continue;
    marks.push({ start: n.start!, end: n.end!, num: i + 1, kind: n.kind });
  }
  const paragraphs: { start: number; end: number }[] = [];
  const re = /\n\s*\n/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    paragraphs.push({ start: last, end: m.index! });
    last = m.index! + m[0].length;
  }
  paragraphs.push({ start: last, end: text.length });

  return (
    <div className="space-y-4 font-serif text-[1.02rem] leading-relaxed">
      {paragraphs.map((p, pi) => {
        const slice = text.slice(p.start, p.end);
        if (slice.trim() === "* * *") return <p key={pi} className="text-center text-muted">* * *</p>;
        const parts: React.ReactNode[] = [];
        let pos = p.start;
        for (const m of marks) {
          if (m.end <= p.start || m.start >= p.end) continue;
          const s = Math.max(m.start, p.start);
          const e = Math.min(m.end, p.end);
          if (s > pos) parts.push(text.slice(pos, s));
          parts.push(
            <a key={`${pi}-${m.num}`} href={`#note-${m.num}`} className={`rounded-sm underline decoration-2 underline-offset-4 ${TONE[m.kind].mark}`}>
              {text.slice(s, e)}
              {m.start >= p.start && <sup className="ml-0.5 font-sans text-[0.65rem] font-medium text-muted">{m.num}</sup>}
            </a>,
          );
          pos = e;
        }
        if (pos < p.end) parts.push(text.slice(pos, p.end));
        return (
          <p key={pi} className="whitespace-pre-line">
            {parts}
          </p>
        );
      })}
    </div>
  );
}
