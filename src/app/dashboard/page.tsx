import Link from "next/link";
import { requireUser } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { buttonClass, Card, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { personaFor } from "@/lib/reader/personas";
import { getSidebar } from "@/lib/sidebar";

export const metadata = { title: "Your manuscripts" };

export default async function Dashboard() {
  const user = await requireUser();
  const manuscripts = await db.manuscript.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { chapters: true } }, report: { select: { content: true, status: true } } },
  });

  const sidebar = (await getSidebar(user.id))!;

  return (
    <AppShell email={user.email} sidebar={sidebar}>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-semibold">Your manuscripts</h1>
            <p className="mt-1 text-muted">Upload a draft and get an honest read, chapter by chapter.</p>
          </div>
          <Link href="/manuscripts/new" className={buttonClass}>
            New manuscript
          </Link>
        </div>

        {manuscripts.length === 0 ? (
          <Card className="py-16 text-center">
            <p className="font-serif text-xl">No manuscripts yet.</p>
            <p className="mt-2 text-muted">Paste a chapter or upload a .docx to get your first read.</p>
            <Link href="/manuscripts/new" className={`${buttonClass} mt-6`}>
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
                    <Card className="h-full transition hover:border-accent/50 hover:shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-serif text-xl font-semibold">{m.title}</h2>
                        <StatusBadge status={m.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {[m.genre, `${m.wordCount.toLocaleString()} words`, `${m._count.chapters} chapters`, personaFor(m.persona).label]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {headline && <p className="mt-4 font-serif text-[0.95rem] italic">“{headline}”</p>}
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
