import { auth } from "@/auth";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";

/** Shell for the privacy policy and terms: public chrome, a readable column. */
export async function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  const signedIn = !!(await auth())?.user;
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader signedIn={signedIn} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-8 pb-20 sm:px-8">
        <h1 className="font-serif text-4xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="legal mt-8 space-y-4 leading-relaxed [&_a]:text-accent [&_a]:underline [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
