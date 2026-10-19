import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { CharacterChat } from "./CharacterChat";
import { CharacterProfile } from "./CharacterProfile";

export default async function CharacterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; cid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!FEATURES.characterChat) notFound();
  const user = await requireUser();
  const { id, cid } = await params;
  const raw = await searchParams;
  const convId = Array.isArray(raw.c) ? raw.c[0] : raw.c;

  const c = await db.character.findFirst({
    where: { id: cid, manuscriptId: id, manuscript: { userId: user.id } },
    include: {
      manuscript: { select: { id: true, _count: { select: { chapters: true } } } },
      conversations: { orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, asOfChapter: true } },
    },
  });
  if (!c) notFound();

  const current = convId ? c.conversations.find((x) => x.id === convId) : undefined;
  const messages = current
    ? await db.message.findMany({ where: { conversationId: current.id }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true } })
    : [];
  const base = `/manuscripts/${c.manuscript.id}/characters/${c.id}`;

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-8 lg:px-12 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="space-y-6">
        <Link href={`/manuscripts/${c.manuscript.id}/characters`} className="text-sm text-muted hover:text-ink">
          ← All characters
        </Link>
        <CharacterProfile
          characterId={c.id}
          name={c.name}
          role={c.role ?? ""}
          aliases={((c.aliases as string[] | null) ?? []).join(", ")}
          summary={c.summary ?? ""}
          notes={c.notes ?? ""}
        />
        <section>
          <h2 className="mb-2 font-serif text-base font-semibold">Conversations</h2>
          <Link href={base} className="mb-1 block rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-line/40">
            + New conversation
          </Link>
          {c.conversations.map((x) => (
            <Link
              key={x.id}
              href={`${base}?c=${x.id}`}
              className={`block truncate rounded-lg px-3 py-2 text-sm ${x.id === current?.id ? "bg-line/60" : "text-muted hover:bg-line/30 hover:text-ink"}`}
            >
              {x.title || "Conversation"}
              {x.asOfChapter ? <span className="text-xs"> · to ch. {x.asOfChapter}</span> : null}
            </Link>
          ))}
        </section>
      </div>

      <CharacterChat
        key={current?.id ?? "new"}
        manuscriptId={c.manuscript.id}
        characterId={c.id}
        name={c.name}
        totalChapters={c.manuscript._count.chapters}
        conversationId={current?.id ?? null}
        asOfChapter={current?.asOfChapter ?? null}
        initialMessages={messages.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }))}
      />
    </main>
  );
}
