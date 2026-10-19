import Link from "next/link";
import { signOutAction } from "@/app/actions";

export function AppHeader({ email, crumbs = [] }: { email?: string | null; crumbs?: { href: string; label: string }[] }) {
  return (
    <header className="border-b border-line bg-card/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 text-sm">
        <Link href="/dashboard" className="font-serif text-lg font-semibold tracking-tight">
          Beta Reader
        </Link>
        {crumbs.map((c) => (
          <span key={c.href} className="flex min-w-0 items-center gap-3 text-muted">
            <span aria-hidden>/</span>
            <Link href={c.href} className="truncate hover:text-ink">
              {c.label}
            </Link>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-3 text-muted">
          {email && <span className="hidden sm:inline">{email}</span>}
          <form action={signOutAction}>
            <button className="rounded px-2 py-1 hover:bg-line/60 hover:text-ink">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
