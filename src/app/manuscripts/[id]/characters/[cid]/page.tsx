import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { AvatarUpload } from "./AvatarUpload";
import { CharacterChat } from "./CharacterChat";
import { CharacterBasics, CharacterProfileForm } from "./CharacterProfile";

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
  const tab = raw.tab === "profile" ? "profile" : "talk";

  const c = await db.character.findFirst({
    where: { id: cid, manuscriptId: id, manuscript: { userId: user.id } },
    include: {
      manuscript: { select: { id: true, _count: { select: { chapters: true } } } },
      conversations: { orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, asOfChapter: true, mode: true } },
    },
  });
  if (!c) notFound();

  const current = convId ? c.conversations.find((x) => x.id === convId) : undefined;
  const messages = current
    ? await db.message.findMany({ where: { conversationId: current.id }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true } })
    : [];
  const base = `/manuscripts/${c.manuscript.id}/characters/${c.id}`;
  const first = c.name.split(" ")[0];
  const v = (s: string | null) => s ?? "";
  const imageUpdatedAt = c.imageUpdatedAt?.toISOString() ?? null;

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:px-12">
      <div className="space-y-6">
        <Link href={`/manuscripts/${c.manuscript.id}/characters`} className="text-sm text-muted hover:text-ink">
          ← All characters
        </Link>
        <Card className="space-y-5">
          <div>
            <h1 className="font-serif text-2xl leading-tight font-semibold">{c.name}</h1>
            {(c.pronouns || c.role) && <p className="mt-0.5 text-sm text-muted">{[c.pronouns, c.role].filter(Boolean).join(", ")}</p>}
          </div>
          <AvatarUpload characterId={c.id} name={c.name} imageUpdatedAt={imageUpdatedAt} />
          <CharacterBasics
            key={`basics-${c.updatedAt.getTime()}`}
            characterId={c.id}
            name={c.name}
            initial={{ pronouns: v(c.pronouns), role: v(c.role), age: v(c.age), aliases: ((c.aliases as string[] | null) ?? []).join(", ") }}
          />
        </Card>
        {tab === "talk" && (
          <section>
            <h2 className="mb-2 font-serif text-base font-semibold">Conversations</h2>
            <Link href={base} className="mb-1 block rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-line/40">
              + New interview
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
        )}
      </div>

      <div className="min-w-0">
        <nav className="mb-5 flex gap-1 border-b border-line" aria-label="Character sections">
          {(
            [
              ["talk", `Interview ${first}`, current ? `${base}?c=${current.id}` : base],
              ["profile", "Profile", `${base}?tab=profile`],
            ] as const
          ).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              aria-current={tab === key ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-[0.95rem] transition-colors ${
                tab === key ? "border-pen font-medium text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {tab === "profile" ? (
          <Card>
            <p className="mb-5 max-w-2xl text-sm text-muted">
              Who {first} is. Anything you write here is canon: the reader uses the pronouns, and {first} draws on all of it in interviews.
            </p>
            <CharacterProfileForm
              key={`profile-${c.updatedAt.getTime()}`}
              characterId={c.id}
              name={c.name}
              initial={{
                summary: v(c.summary),
                appearance: v(c.appearance),
                personality: v(c.personality),
                wants: v(c.wants),
                fears: v(c.fears),
                voice: v(c.voice),
                backstory: v(c.backstory),
                notes: v(c.notes),
              }}
            />
          </Card>
        ) : (
          <CharacterChat
            key={current?.id ?? "new"}
            manuscriptId={c.manuscript.id}
            characterId={c.id}
            name={c.name}
            imageUpdatedAt={imageUpdatedAt}
            totalChapters={c.manuscript._count.chapters}
            conversationId={current?.id ?? null}
            asOfChapter={current?.asOfChapter ?? null}
            mode={current?.mode ?? null}
            initialMessages={messages.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }))}
          />
        )}
      </div>
    </main>
  );
}
