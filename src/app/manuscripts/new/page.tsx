import { requireUser } from "@/auth";
import { AppShell } from "@/components/AppShell";
import { PERSONAS } from "@/lib/reader/personas";
import { getSidebar } from "@/lib/sidebar";
import { NewManuscriptForm } from "./NewManuscriptForm";

export const metadata = { title: "New manuscript" };

export default async function NewManuscriptPage() {
  const user = await requireUser();
  const personas = Object.entries(PERSONAS).map(([id, p]) => ({ id, label: p.label, short: p.short }));
  return (
    <AppShell email={user.email} sidebar={(await getSidebar(user.id))!}>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <h1 className="font-serif text-3xl font-semibold">New manuscript</h1>
        <p className="mt-1 text-muted">
          Upload your draft or paste it in. We’ll split it into chapters using your chapter headings.
        </p>
        <NewManuscriptForm personas={personas} />
      </main>
    </AppShell>
  );
}
