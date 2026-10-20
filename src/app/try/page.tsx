import Link from "next/link";
import { auth } from "@/auth";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";
import { BRAND } from "@/lib/brand";
import { TRIAL_MAX_WORDS, TRIAL_RETENTION_DAYS } from "@/lib/trial";
import { MODEL_VENDOR } from "@/lib/trust";
import { TrialForm } from "./TrialForm";

export const metadata = { title: "Read a chapter free" };

export default async function TryPage() {
  const signedIn = !!(await auth())?.user;
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader signedIn={signedIn} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-20 sm:px-8">
        <h1 className="font-serif text-4xl leading-tight font-semibold">Read a chapter free</h1>
        <p className="mt-3 text-lg text-muted">
          Paste one chapter and {BRAND.name} reads it the way a first reader would: where it hooked them, where their attention slipped, what
          confused them, and how to fix what isn’t working. Every note quotes your passage. Nothing is rewritten.
        </p>
        <div className="mt-8">
          <TrialForm maxWords={TRIAL_MAX_WORDS} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null} />
        </div>
        <p className="mt-8 text-sm text-muted">
          Your chapter is kept for {TRIAL_RETENTION_DAYS} days so you can come back to the notes, then deleted. It’s never used to train AI, by
          us or by {MODEL_VENDOR.company}. <Link href="/privacy" className="text-accent underline">Privacy</Link>
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
