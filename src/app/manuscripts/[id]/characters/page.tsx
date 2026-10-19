import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { AddCharacterForm, FindCharactersButton } from "./CharacterForms";

export const metadata = { title: "Characters" };

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
        select: { id: true, name: true, role: true, summary: true, notes: true, _count: { select: { conversations: true } } },
      },
    },
  });
  if (!ms) notFound();
  const base = `/manuscripts/${ms.id}/characters`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Characters</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Talk with your characters to fill gaps and brainstorm. They answer in their own voice, drawing on the scenes they appear in, and mark
            anything they invent ⟦like this⟧ so you can tell it apart from what’s on the page.
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
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-serif text-xl font-semibold">{c.name}</h2>
                    {c.role && <span className="text-sm text-muted">{c.role}</span>}
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-muted">{c.summary || c.notes || "No description yet."}</p>
                  <p className="mt-3 text-xs text-accent">
                    {c._count.conversations ? `${c._count.conversations} conversation${c._count.conversations === 1 ? "" : "s"} · ` : ""}Talk to {c.name.split(" ")[0]}
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
