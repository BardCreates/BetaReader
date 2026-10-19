import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { db } from "@/lib/db";
import { EditorChat } from "./EditorChat";

export const metadata = { title: "Editor" };

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const sp = { c: one(raw.c), chapter: one(raw.chapter), q: one(raw.q) };

  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      chapters: { orderBy: { index: "asc" }, select: { id: true, index: true, title: true } },
      conversations: {
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: { id: true, title: true, chapterId: true, updatedAt: true },
      },
    },
  });
  if (!ms) notFound();

  const current = sp.c
    ? (ms.conversations.find((c) => c.id === sp.c) ??
      (await db.conversation.findFirst({
        where: { id: sp.c, manuscriptId: ms.id },
        select: { id: true, title: true, chapterId: true, updatedAt: true },
      })) ??
      undefined)
    : undefined;
  const messages = current
    ? await db.message.findMany({ where: { conversationId: current.id }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true } })
    : [];
  const chapterId = current?.chapterId ?? (sp.chapter && ms.chapters.some((c) => c.id === sp.chapter) ? sp.chapter : null);
  const chapter = ms.chapters.find((c) => c.id === chapterId);
  const base = `/manuscripts/${ms.id}`;

  return (
    <>
      <AppHeader email={user.email} crumbs={[{ href: base, label: ms.title }, { href: `${base}/editor`, label: "Editor" }]} />
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-1 text-sm">
          <Link href={`${base}/editor`} className="mb-3 block rounded-lg border border-line px-3 py-2 font-medium hover:bg-line/40">
            + New conversation
          </Link>
          {ms.conversations.map((c) => (
            <Link
              key={c.id}
              href={`${base}/editor?c=${c.id}`}
              className={`block truncate rounded-lg px-3 py-2 ${c.id === current?.id ? "bg-line/60" : "text-muted hover:bg-line/30 hover:text-ink"}`}
            >
              {c.title || "Conversation"}
            </Link>
          ))}
        </aside>

        <EditorChat
          key={current?.id ?? `new-${chapterId ?? "book"}`}
          manuscriptId={ms.id}
          conversationId={current?.id ?? null}
          chapterId={chapterId}
          chapters={ms.chapters.map((c) => ({ id: c.id, label: `${c.index + 1}. ${c.title}` }))}
          contextLabel={chapter ? `Chapter ${chapter.index + 1}: ${chapter.title}` : "The whole manuscript"}
          initialMessages={messages.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }))}
          initialDraft={current ? "" : sp.q ?? ""}
        />
      </main>
    </>
  );
}
