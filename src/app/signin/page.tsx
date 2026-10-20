import { redirect } from "next/navigation";
import { auth, authProviders, signIn } from "@/auth";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { buttonClass, Card, ghostButtonClass, inputClass } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plans";

export const metadata = { title: "Sign in" };

/** Only same-site paths, so the sign-in page can't be used to bounce people elsewhere. */
function safeNext(v: unknown) {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/dashboard";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).callbackUrl);
  if ((await auth())?.user) redirect(next);
  const oauth = authProviders.filter((p) => p.id !== "dev");
  const dev = authProviders.some((p) => p.id === "dev");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8" aria-label={`${BRAND.name} home`}>
        <Logo size="lg" />
      </Link>
      <Card className="w-full max-w-sm p-7 shadow-[0_12px_40px_-16px_rgb(22_29_46/0.2)]">
        <h1 className="font-serif text-2xl font-semibold">Sign in to {BRAND.name}</h1>
        <p className="mt-1.5 text-sm text-muted">Your manuscripts stay private to your account.</p>

        <div className="mt-6 space-y-2">
          {oauth.map((p) => (
            <form
              key={p.id}
              action={async () => {
                "use server";
                await signIn(p.id, { redirectTo: next });
              }}
            >
              <button className={`${ghostButtonClass} w-full py-2`}>Continue with {p.name}</button>
            </form>
          ))}
        </div>

        {dev && (
          <form
            className={`mt-6 space-y-2 ${oauth.length ? "border-t border-line pt-6" : ""}`}
            action={async (form: FormData) => {
              "use server";
              await signIn("dev", { email: form.get("email"), redirectTo: next });
            }}
          >
            <label className="text-sm font-medium text-muted">Dev login (local only)</label>
            <input name="email" type="email" required placeholder="you@example.com" className={inputClass} />
            <button className={`${buttonClass} w-full`}>Sign in with email</button>
          </form>
        )}

        {!oauth.length && !dev && (
          <p className="mt-6 text-sm text-danger">
            No sign-in providers are configured. Set AUTH_GITHUB_ID / AUTH_GOOGLE_ID, or AUTH_DEV_LOGIN=true for local development.
          </p>
        )}
      </Card>
      <p className="mt-6 text-sm text-muted">
        New here? Your first {PLANS.free.allowance.words.toLocaleString("en-US")} words are free.{" "}
        <Link href="/pricing" className="text-accent hover:underline">
          See pricing
        </Link>
      </p>
    </main>
  );
}
