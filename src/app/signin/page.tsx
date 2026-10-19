import { redirect } from "next/navigation";
import { auth, authProviders, signIn } from "@/auth";
import { buttonClass, Card, ghostButtonClass, inputClass } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  if ((await auth())?.user) redirect("/dashboard");
  const oauth = authProviders.filter((p) => p.id !== "dev");
  const dev = authProviders.some((p) => p.id === "dev");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="font-serif text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Your manuscripts stay private to your account.</p>

        <div className="mt-6 space-y-2">
          {oauth.map((p) => (
            <form
              key={p.id}
              action={async () => {
                "use server";
                await signIn(p.id, { redirectTo: "/dashboard" });
              }}
            >
              <button className={`${ghostButtonClass} w-full py-2`}>Continue with {p.name}</button>
            </form>
          ))}
        </div>

        {dev && (
          <form
            className="mt-6 space-y-2 border-t border-line pt-6"
            action={async (form: FormData) => {
              "use server";
              await signIn("dev", { email: form.get("email"), redirectTo: "/dashboard" });
            }}
          >
            <label className="text-xs font-medium uppercase tracking-wide text-muted">Dev login (local only)</label>
            <input name="email" type="email" required placeholder="you@example.com" className={inputClass} />
            <button className={`${buttonClass} w-full`}>Sign in with email</button>
          </form>
        )}

        {!oauth.length && !dev && (
          <p className="mt-6 text-sm text-accent">
            No sign-in providers are configured. Set AUTH_GITHUB_ID / AUTH_GOOGLE_ID, or AUTH_DEV_LOGIN=true for local development.
          </p>
        )}
      </Card>
    </main>
  );
}
