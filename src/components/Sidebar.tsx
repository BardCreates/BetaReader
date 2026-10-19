"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { addChapter, signOutAction } from "@/app/actions";
import type { ChapterState, SidebarData } from "@/lib/sidebar";

export function Sidebar({ email, data }: { email: string | null; data: SidebarData }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer after navigating (small screens).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const ms = data.manuscript;
  const base = ms ? `/manuscripts/${ms.id}` : "";

  const nav = (
    <nav className="flex h-full flex-col text-sm">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Link href="/dashboard" className="font-serif text-lg font-semibold tracking-tight">
          Beta Reader
        </Link>
        <button className="rounded p-1 text-muted hover:bg-line/60 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {ms ? (
          <>
            <p className="truncate px-2 pt-2 pb-1 font-serif text-base font-semibold" title={ms.title}>
              {ms.title}
            </p>
            <NavLink href={base} active={pathname === base}>
              Overview &amp; report
              {ms.reading && <Dot state="reading" />}
            </NavLink>
            <Divider />
            <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted">Chapters</p>
            <ol>
              {ms.chapters.map((c) => {
                const href = `${base}/chapters/${c.index + 1}`;
                return (
                  <li key={c.index}>
                    <NavLink href={href} active={pathname === href}>
                      <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">{c.index + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      <ChapterBadge state={c.state} engagement={c.engagement} />
                    </NavLink>
                  </li>
                );
              })}
            </ol>
            <form action={addChapter.bind(null, ms.id)}>
              <button className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-muted hover:bg-line/50 hover:text-ink">
                <span className="w-5 text-right">+</span> Add chapter
              </button>
            </form>
            <Divider />
            <NavLink href="/dashboard" active={false}>
              All manuscripts
            </NavLink>
          </>
        ) : (
          <>
            <NavLink href="/dashboard" active={pathname === "/dashboard"}>
              All manuscripts
            </NavLink>
            {data.manuscripts.length > 0 && (
              <ul className="mt-1 mb-1 border-l border-line ml-3 pl-1">
                {data.manuscripts.map((m) => (
                  <li key={m.id}>
                    <NavLink href={`/manuscripts/${m.id}`} active={false}>
                      <span className="truncate">{m.title}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <NavLink href="/manuscripts/new" active={pathname === "/manuscripts/new"}>
          + New manuscript
        </NavLink>
      </div>

      <div className="border-t border-line px-2 py-3">
        <NavLink href="/account" active={pathname === "/account"}>
          <span className="min-w-0 flex-1 truncate">Account{email ? <span className="text-muted"> · {email}</span> : null}</span>
        </NavLink>
        <form action={signOutAction}>
          <button className="w-full rounded-md px-2 py-1.5 text-left text-muted hover:bg-line/50 hover:text-ink">Sign out</button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      {/* Small screens: top bar with a menu button */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-card/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-md border border-line px-2.5 py-1 text-sm" aria-label="Open menu">
          ☰ Menu
        </button>
        <span className="truncate font-serif font-semibold">{ms?.title ?? "Beta Reader"}</span>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Phones/tablets: a slide-in drawer. Desktop: a full-height column whose menu stays put while the page scrolls. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-card transition-transform lg:static lg:z-auto lg:w-64 lg:shrink-0 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full lg:sticky lg:top-0 lg:h-screen">{nav}</div>
      </aside>
    </>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${active ? "bg-accent-soft font-medium text-ink" : "text-ink/85 hover:bg-line/50"}`}
    >
      {children}
    </Link>
  );
}

function Divider() {
  return <div className="mx-2 my-2 border-t border-line" />;
}

function Dot({ state }: { state: "reading" | "stale" | "error" }) {
  const cls = { reading: "bg-reaction animate-pulse", stale: "bg-issue", error: "bg-accent" }[state];
  const label = { reading: "Reading", stale: "Edited since last read", error: "Read stopped" }[state];
  return <span title={label} aria-label={label} className={`ml-auto inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

function ChapterBadge({ state, engagement }: { state: ChapterState; engagement: number | null }) {
  if (state === "reading" || state === "stale" || state === "error") return <Dot state={state} />;
  if (state === "read" && engagement != null) return <span className="text-xs text-muted tabular-nums">{engagement}/10</span>;
  return null;
}
