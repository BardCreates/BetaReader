import { requireUser } from "@/auth";
import { AppHeader } from "@/components/AppHeader";
import { PERSONAS } from "@/lib/reader/personas";
import { NewManuscriptForm } from "./NewManuscriptForm";

export const metadata = { title: "New manuscript" };

export default async function NewManuscriptPage() {
  const user = await requireUser();
  const personas = Object.entries(PERSONAS).map(([id, p]) => ({ id, label: p.label, short: p.short }));
  return (
    <>
      <AppHeader email={user.email} crumbs={[{ href: "/manuscripts/new", label: "New manuscript" }]} />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-serif text-3xl font-semibold">New manuscript</h1>
        <p className="mt-1 text-muted">
          Upload your draft or paste it in. We’ll split it into chapters using your chapter headings.
        </p>
        <NewManuscriptForm personas={personas} />
      </main>
    </>
  );
}
