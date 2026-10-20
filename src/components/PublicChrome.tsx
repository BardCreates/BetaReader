import Link from "next/link";
import { Logo } from "@/components/Logo";
import { buttonClass } from "@/components/ui";
import { BRAND } from "@/lib/brand";

/** Header for the public pages (landing, pricing). */
export function PublicHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
      <Link href={signedIn ? "/dashboard" : "/"} aria-label={`${BRAND.name} home`}>
        <Logo />
      </Link>
      <nav className="flex items-center gap-1 text-[0.95rem] sm:gap-2">
        {!signedIn && (
          <Link href="/try" className="hidden rounded-lg px-3 py-1.5 whitespace-nowrap text-muted transition-colors hover:text-ink md:inline">
            Try a chapter
          </Link>
        )}
        <Link href="/pricing" className="rounded-lg px-3 py-1.5 whitespace-nowrap text-muted transition-colors hover:text-ink">
          Pricing
        </Link>
        {signedIn ? (
          <Link href="/dashboard" className={buttonClass}>
            Your manuscripts
          </Link>
        ) : (
          <>
            <Link href="/signin" className="rounded-lg px-3 py-1.5 whitespace-nowrap text-muted transition-colors hover:text-ink">
              Sign in
            </Link>
            {/* Wrapped so "hidden" isn't overridden by the button's own display style. */}
            <span className="hidden sm:inline">
              <Link href="/signin" className={buttonClass}>
                Start free
              </Link>
            </span>
          </>
        )}
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-8">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="hidden sm:inline">{BRAND.tagline}</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/pricing" className="hover:text-ink">
            Pricing
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <span>© {new Date().getFullYear()} {BRAND.name}</span>
        </nav>
      </div>
    </footer>
  );
}
