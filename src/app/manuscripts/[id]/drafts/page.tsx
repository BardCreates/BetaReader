import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { readChangedChapters } from "@/app/reimportActions";
import { SubmitButton } from "@/components/SubmitButton";
import { buttonClass, Card } from "@/components/ui";
import { db } from "@/lib/db";
import { currentSnapshot } from "@/lib/reader/draftHistory";
import { compareDrafts, type ChapterComparison, type SnapshotData, type SnapshotIssue } from "@/lib/reader/drafts";

export const metadata = { title: "Draft comparison" };

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function DraftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const against = (await searchParams).against;
  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      draft: true,
      status: true,
      snapshots: { orderBy: { createdAt: "desc" }, select: { id: true, draft: true, reason: true, createdAt: true } },
    },
  });
  if (!ms) notFound();
  const base = `/manuscripts/${ms.id}`;

  if (!ms.snapshots.length) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 lg:px-12">
        <h1 className="font-serif text-3xl font-semibold">Draft comparison</h1>
        <p className="mt-2 max-w-3xl text-muted">
          When you bring in a revised draft, the read of this one is kept so you can see what the revision did: whether the reader stayed with it
          longer, which problems went away, which are new, and which continuity errors you fixed or introduced.{" "}
          <Link href={`${base}/update`} className="text-accent underline">
            Update from a new draft
          </Link>{" "}
          after a read to start comparing.
        </p>
      </main>
    );
  }

  const chosen = ms.snapshots.find((s) => s.id === against) ?? ms.snapshots[0];
  const [row, now] = await Promise.all([
    db.draftSnapshot.findUniqueOrThrow({ where: { id: chosen.id }, select: { data: true } }),
    currentSnapshot(ms.id),
  ]);
  if (!now) notFound();
  const before = row.data as unknown as SnapshotData;
  const cmp = compareDrafts(before, now);
  const t = cmp.totals;
  const busy = ms.status === "QUEUED" || ms.status === "READING";
  const sameDraft = chosen.draft === ms.draft;
  const label = (s: { draft: number; reason: string }) => (s.reason === "fresh_read" ? `earlier read of draft ${s.draft}` : `draft ${s.draft}`);
  const changed = cmp.chapters.filter((c) => c.kind !== "same");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 lg:px-12">
      <h1 className="font-serif text-3xl font-semibold">
        {sameDraft ? "This read" : `Draft ${ms.draft}`} <span className="font-normal text-muted">compared with {label(chosen)}</span>
      </h1>
      {ms.snapshots.length > 1 && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          Compare with:
          {ms.snapshots.map((s) => (
            <Link
              key={s.id}
              href={`${base}/drafts?against=${s.id}`}
              className={`rounded-full border px-2.5 py-0.5 ${s.id === chosen.id ? "border-accent bg-accent-soft text-ink" : "border-line hover:bg-line/50"}`}
            >
              {label(s)} · {fmtDate(s.createdAt)}
            </Link>
          ))}
        </p>
      )}

      {t.awaitingRead > 0 && (
        <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 border-issue/40">
          <p className="text-sm">
            <b>
              {t.awaitingRead} revised chapter{t.awaitingRead === 1 ? " hasn’t" : "s haven’t"} been read yet.
            </b>{" "}
            <span className="text-muted">Until they are, their problems can’t be judged fixed or not.</span>
          </p>
          {!busy && (
            <form action={readChangedChapters.bind(null, ms.id)}>
              <SubmitButton className={buttonClass} pendingLabel="Starting…">
                Read the changes
              </SubmitButton>
            </form>
          )}
          {busy && <span className="text-sm text-muted">Reading now…</span>}
        </Card>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          title="Wanted to keep reading"
          value={t.engagementAfter != null ? `${t.engagementAfter}` : "–"}
          delta={t.engagementBefore != null && t.engagementAfter != null ? Math.round((t.engagementAfter - t.engagementBefore) * 10) / 10 : null}
          note={t.engagementBefore != null ? `Average per chapter, was ${t.engagementBefore}` : "Average per chapter"}
        />
        <Stat title="Problems fixed" value={`${t.fixed}`} tone="praise" note="Raised before, gone from the new read" />
        <Stat title="New problems" value={`${t.introduced}`} tone={t.introduced ? "issue" : undefined} note="In revised or new chapters" />
        <Stat
          title="Continuity"
          value={`${cmp.continuity.resolved.length} fixed`}
          tone={cmp.continuity.introduced.length ? "issue" : "praise"}
          note={`${cmp.continuity.introduced.length} introduced · ${cmp.continuity.still} still there`}
        />
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-xl font-semibold">Chapters</h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          {changed.length === 0
            ? "Nothing has changed since then."
            : `${changed.length} chapter${changed.length === 1 ? "" : "s"} changed. Open one to see which problems went away and which are new.`}
        </p>
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {cmp.chapters.map((c) => (
              <ChapterRow key={c.key} c={c} base={base} />
            ))}
          </ul>
        </Card>
      </section>

      {(cmp.continuity.resolved.length > 0 || cmp.continuity.introduced.length > 0) && (
        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <IssueList
            title="Continuity errors fixed"
            empty="None fixed."
            items={cmp.continuity.resolved}
            tone="praise"
            where={(i) => (i.chapter == null ? "chapter cut" : `was in ch. ${i.chapter}`)}
          />
          <IssueList
            title="Continuity errors introduced"
            empty="None introduced."
            items={cmp.continuity.introduced}
            tone="issue"
            where={(i) => `ch. ${i.chapter}`}
            href={(i) => `${base}/chapters/${i.chapter}`}
          />
        </section>
      )}
    </main>
  );
}

const KIND_CHIP: Record<ChapterComparison["kind"], [string, string]> = {
  same: ["Unchanged", "bg-line text-muted"],
  revised: ["Revised", "bg-reaction-soft text-reaction"],
  new: ["New", "bg-accent-soft text-accent"],
  removed: ["Cut", "bg-line text-muted line-through"],
  firstRead: ["First read", "bg-accent-soft text-accent"],
};

function ChapterRow({ c, base }: { c: ChapterComparison; base: string }) {
  const [label, cls] = KIND_CHIP[c.kind];
  const delta = c.engagementBefore != null && c.engagementAfter != null ? c.engagementAfter - c.engagementBefore : null;
  const hasDetail = c.fixed.length + c.introduced.length + (c.kind === "revised" ? c.remaining.length : 0) > 0;
  const summary = (
    <div className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_9rem_12rem] sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
        <span className="truncate font-serif">
          {c.number != null && <span className="mr-1 text-muted tabular-nums">{c.number}.</span>}
          {c.title}
        </span>
      </div>
      <div className="tabular-nums text-muted">
        {c.awaitingRead ? (
          <span className="text-issue">Not read yet</span>
        ) : c.engagementAfter != null || c.engagementBefore != null ? (
          <>
            {c.engagementBefore ?? "–"} → <span className="text-ink">{c.engagementAfter ?? "–"}</span>
            {delta != null && delta !== 0 && (
              <span className={`ml-1.5 font-medium ${delta > 0 ? "text-praise" : "text-pen"}`}>
                {delta > 0 ? "+" : ""}
                {delta}
              </span>
            )}
          </>
        ) : (
          "–"
        )}
      </div>
      <div className="text-xs text-muted">
        {c.kind === "revised" && !c.awaitingRead && (
          <>
            <span className="text-praise">{c.fixed.length} fixed</span> · <span className={c.introduced.length ? "text-issue" : ""}>{c.introduced.length} new</span> ·{" "}
            {c.remaining.length} remain
          </>
        )}
        {c.kind === "new" && !c.awaitingRead && `${c.introduced.length} problem${c.introduced.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
  if (!hasDetail) return <li>{summary}</li>;
  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none hover:bg-line/30 [&::-webkit-details-marker]:hidden">{summary}</summary>
        <div className="grid gap-5 border-t border-line bg-paper/50 px-4 py-4 text-sm md:grid-cols-2">
          {c.verdicts && (
            <p className="text-muted md:col-span-2">
              On its re-read the reader judged the earlier notes: {c.verdicts.fixed} fixed, {c.verdicts.partly} partly, {c.verdicts.stillThere} still there.
            </p>
          )}
          {c.fixed.length > 0 && <Issues title="Gone from this draft" items={c.fixed} tone="praise" />}
          {c.introduced.length > 0 && <Issues title={c.kind === "new" ? "Problems" : "New in this draft"} items={c.introduced} tone="issue" />}
          {c.kind === "revised" && c.remaining.length > 0 && <Issues title="Still there" items={c.remaining} />}
          {c.number != null && (
            <Link href={`${base}/chapters/${c.number}`} className="text-accent hover:underline md:col-span-2">
              Open chapter {c.number}
            </Link>
          )}
        </div>
      </details>
    </li>
  );
}

function Issues({ title, items, tone }: { title: string; items: SnapshotIssue[]; tone?: "praise" | "issue" }) {
  const color = tone === "praise" ? "text-praise" : tone === "issue" ? "text-issue" : "text-muted";
  return (
    <div>
      <p className={`mb-2 text-xs font-medium tracking-wide uppercase ${color}`}>{title}</p>
      <ul className="space-y-2.5">
        {items.map((i, k) => (
          <li key={k}>
            <p className="font-serif">“{i.quote}”</p>
            <p className="text-muted">
              <span className="mr-1 text-xs">{i.category}</span>
              {i.comment}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IssueList<T extends SnapshotIssue>(props: {
  title: string;
  empty: string;
  items: T[];
  tone: "praise" | "issue";
  where: (i: T) => string;
  href?: (i: T) => string;
}) {
  return (
    <div>
      <h2 className={`mb-3 font-serif text-xl font-semibold`}>{props.title}</h2>
      <Card className="p-0">
        {props.items.length === 0 ? (
          <p className="p-4 text-sm text-muted">{props.empty}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {props.items.map((i, k) => (
              <li key={k} className="px-4 py-3">
                <p className="font-serif">“{i.quote}”</p>
                <p className="mt-0.5 text-muted">{i.comment}</p>
                <p className={`mt-1 text-xs ${props.tone === "praise" ? "text-praise" : "text-issue"}`}>
                  {props.href ? (
                    <Link href={props.href(i)} className="hover:underline">
                      {props.where(i)}
                    </Link>
                  ) : (
                    props.where(i)
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ title, value, note, tone, delta }: { title: string; value: string; note: string; tone?: "praise" | "issue"; delta?: number | null }) {
  const color = tone === "praise" ? "text-praise" : tone === "issue" ? "text-issue" : "text-ink";
  return (
    <Card>
      <p className="text-sm text-muted">{title}</p>
      <p className={`font-serif text-3xl font-semibold ${color}`}>
        {value}
        {delta != null && delta !== 0 && (
          <span className={`ml-2 font-sans text-base font-medium ${delta > 0 ? "text-praise" : "text-pen"}`}>
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </p>
      <p className="mt-1 text-sm text-muted">{note}</p>
    </Card>
  );
}
