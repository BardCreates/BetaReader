import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { UpdateDraftForm } from "./UpdateDraftForm";

export const metadata = { title: "Update from a new draft" };

export default async function UpdateDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const ms = await db.manuscript.findFirst({ where: { id, userId: user.id }, select: { id: true, title: true } });
  if (!ms) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8 lg:px-12">
      <Link href={`/manuscripts/${ms.id}`} className="text-sm text-muted hover:text-ink">
        ← {ms.title}
      </Link>
      <h1 className="mt-2 font-serif text-3xl font-semibold">Update from a new draft</h1>
      <p className="mt-2 text-muted">
        Revised the book in Dabble, Word or Google Docs? Export the whole manuscript and upload it here. We’ll match it to your chapters,
        show you what changed, and keep the reader’s notes on everything you didn’t touch. Afterwards the reader only needs to read
        the chapters that changed.
      </p>
      <p className="mt-2 text-sm text-muted">From Dabble, export the whole book to Word (.docx) or Markdown, the same way as last time. Chapters are matched by their text and titles, so renamed, added and reordered chapters line up.</p>
      <UpdateDraftForm manuscriptId={ms.id} />
    </main>
  );
}
