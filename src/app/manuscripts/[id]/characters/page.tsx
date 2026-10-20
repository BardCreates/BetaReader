import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { AddCharacterForm, FindCharactersButton } from "./CharacterForms";

export const metadata = { title: "Your cast" };

export default async function CharactersPage({ params }: { params: Promise<{ id: string }> }) {
  if (!FEATURES.characterChat) notFound();
  const user = await requireUser();
  const { id } = await params;
  const ms = await db.manuscript.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      title: true,
      characters: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          pronouns: true,
          summary: true,
          notes: true,
          imageUpdatedAt: true,
          _count: { select: { conversations: true } },
        },
      },
    },
  });
  if (!ms) notFound();
  const base = `/manuscripts/${ms.id}/characters`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8 lg:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Your cast</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Interview your characters to find the gaps in motivation and backstory. They answer in their own voice from the scenes they appear in
            and what the reader’s ledger has on them, and highlight anything the page doesn’t establish, so you can see what’s still missing.
          </p>
        </div>
        <FindCharactersButton manuscriptId={ms.id} hasAny={ms.characters.length > 0} />
      </div>

      {ms.characters.length === 0 ? (
        <Card className="mt-8 text-center">
          <p className="font-serif text-lg">No characters yet.</p>
          <p className="mt-1 text-sm text-muted">Find them in your manuscript, or add one by hand.</p>
        </Card>
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {ms.characters.map((c) => (
            <li key={c.id}>
              <Link href={`${base}/${c.id}`} className="block h-full">
                <Card className="h-full transition hover:border-accent/50 hover:shadow-sm">
                  <div className="flex items-center gap-3.5">
                    <CharacterAvatar id={c.id} name={c.name} imageUpdatedAt={c.imageUpdatedAt} size={48} />
                    <div className="min-w-0">
                      <h2 className="truncate font-serif text-xl font-semibold">{c.name}</h2>
                      {(c.pronouns || c.role) && <p className="text-sm text-muted">{[c.pronouns, c.role].filter(Boolean).join(", ")}</p>}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-muted">{c.summary || c.notes || "No description yet."}</p>
                  <p className="mt-3 text-xs text-accent">
                    {c._count.conversations ? `${c._count.conversations} conversation${c._count.conversations === 1 ? "" : "s"} · ` : ""}Interview {c.name.split(" ")[0]}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 max-w-md">
        <AddCharacterForm manuscriptId={ms.id} />
      </div>
    </main>
  );
}
