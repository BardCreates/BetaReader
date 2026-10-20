import Link from "next/link";
import { requireUser } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { buttonClass, Card, StatusBadge } from "@/components/ui";
import { Mark } from "@/components/Logo";
import { BRAND } from "@/lib/brand";
import { db } from "@/lib/db";
import { personaFor } from "@/lib/reader/personas";
import { getSidebar } from "@/lib/sidebar";

export const metadata = { title: "Your manuscripts" };

export default async function Dashboard() {
  const user = await requireUser();
  const manuscripts = await db.manuscript.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { chapters: true } },
      report: { select: { content: true, status: true } },
      chapters: { orderBy: { index: "asc" }, select: { review: { select: { status: true, engagement: true } } } },
    },
  });

  const sidebar = (await getSidebar(user.id))!;

  return (
    <AppShell email={user.email} sidebar={sidebar}>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8 lg:px-12">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-serif text-3xl font-semibold">Your manuscripts</h1>
            <p className="mt-1 text-muted">Upload a draft and get an honest read, chapter by chapter.</p>
          </div>
          <Link href="/manuscripts/new" className={buttonClass}>
            New manuscript
          </Link>
        </div>

        {manuscripts.length === 0 ? (
          <Card className="px-8 py-14 text-center">
            <Mark size={44} className="mx-auto" />
            <p className="mt-5 font-serif text-2xl font-semibold">Welcome to {BRAND.name}.</p>
            <p className="mx-auto mt-2 max-w-md text-muted">
              Upload your draft (a Word or Markdown export from Dabble, or a .docx from Word, Scrivener or Google Docs) or paste it in. The reader starts with chapter one.
            </p>
            <Link href="/manuscripts/new" className={`${buttonClass} mt-7 px-5 py-2.5`}>
              Upload your draft
            </Link>
          </Card>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {manuscripts.map((m) => {
              const headline =
                m.report?.status === "DONE" ? (m.report.content as { headline?: string } | null)?.headline : null;
              return (
                <li key={m.id}>
                  <Link href={`/manuscripts/${m.id}`} className="block h-full">
                    <Card className="flex h-full flex-col transition hover:border-accent/50 hover:shadow-[0_6px_24px_-12px_rgb(22_29_46/0.25)]">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-serif text-xl font-semibold">{m.title}</h2>
                        <StatusBadge status={m.status} paused={m.status === "ERROR" && m.errorCode === "LIMIT"} />
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {[m.genre, `${m.wordCount.toLocaleString()} words`, `${m._count.chapters} chapters`, personaFor(m.persona).label]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-4 flex-1 font-serif text-[0.98rem] leading-relaxed">
                        {headline ? <span className="italic">“{headline}”</span> : <span className="text-muted">{STATUS_HINT[m.status]}</span>}
                      </p>
                      <div className="mt-5 flex items-end justify-between gap-4 border-t border-line pt-4">
                        <MiniEngagement values={m.chapters.map((c) => (c.review?.status === "DONE" ? c.review.engagement : null))} />
                        <span className="shrink-0 text-xs text-muted">Edited {relative(m.updatedAt)}</span>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </AppShell>
  );
}

const STATUS_HINT: Record<string, string> = {
  DRAFT: "Not read yet. Open it to start the read.",
  QUEUED: "Starting the read…",
  READING: "The reader is working through it now.",
  ERROR: "The read paused. Open it to see why and pick it back up.",
  DONE: "Read.",
};

function relative(d: Date) {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** How much the reader wanted to keep going, chapter by chapter, as tiny bars. */
function MiniEngagement({ values }: { values: (number | null)[] }) {
  if (!values.some((v) => v != null)) return <span className="text-xs text-muted">No chapters read yet</span>;
  const shown = values.slice(0, 60);
  return (
    <div className="flex h-7 min-w-0 flex-1 items-end gap-[2px]" role="img" aria-label="Reader engagement by chapter">
      {shown.map((v, i) => (
        <span
          key={i}
          className={`w-1.5 max-w-2 flex-1 rounded-sm ${v == null ? "bg-line" : v >= 7 ? "bg-praise/80" : v >= 5 ? "bg-issue/80" : "bg-danger/80"}`}
          style={{ height: `${((v ?? 1.5) / 10) * 100}%` }}
        />
      ))}
    </div>
  );
}
