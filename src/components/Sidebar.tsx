"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { addChapter, signOutAction } from "@/app/actions";
import { FEATURES } from "@/lib/features";
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
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <Link href="/dashboard" className="font-serif text-lg font-semibold tracking-tight text-ink">
          Beta Reader
        </Link>
        <button className="rounded p-1 text-muted hover:bg-line/60 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {ms ? (
          <>
            <p className="truncate px-2.5 pb-2 font-serif text-[0.95rem] font-semibold text-ink" title={ms.title}>
              {ms.title}
            </p>
            <NavLink href={base} active={pathname === base}>
              Overview &amp; report
              {ms.reading && <Dot state="reading" />}
            </NavLink>
            <NavLink href={`${base}/journey`} active={pathname === `${base}/journey`}>
              Reader journey
            </NavLink>
            <NavLink href={`${base}/bible`} active={pathname === `${base}/bible`}>
              Story bible
              {ms.continuityIssues > 0 && (
                <span className="ml-auto rounded-full bg-issue-soft px-1.5 text-xs font-medium text-issue tabular-nums" title="Open continuity problems">
                  {ms.continuityIssues}
                </span>
              )}
            </NavLink>
            {FEATURES.characterChat && (
              <NavLink href={`${base}/characters`} active={pathname.startsWith(`${base}/characters`)}>
                Characters
              </NavLink>
            )}
            <NavLink href={`${base}/pitch`} active={pathname === `${base}/pitch`}>
              Pitch kit
            </NavLink>
            <Divider />
            <p className="flex items-baseline justify-between px-2.5 pb-1 text-xs font-medium text-muted">
              Chapters <span className="tabular-nums">{ms.chapters.length}</span>
            </p>
            <ol>
              {(() => {
                // Books whose chapters are all just "Chapter N" list them as written; otherwise
                // show the number in its own column and the chapter's own title beside it.
                const subtitles = ms.chapters.map((c) => chapterSubtitle(c.title));
                const numbered = subtitles.some(Boolean);
                return ms.chapters.map((c, i) => {
                  const href = `${base}/chapters/${c.index + 1}`;
                  return (
                    <li key={c.index}>
                      <NavLink href={href} active={pathname === href}>
                        {numbered && <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">{c.index + 1}</span>}
                        <span className={`min-w-0 flex-1 truncate ${numbered && !subtitles[i] ? "text-muted" : ""}`} title={c.title}>
                          {numbered ? subtitles[i] ?? "Untitled" : c.title}
                        </span>
                        <ChapterBadge state={c.state} engagement={c.engagement} />
                      </NavLink>
                    </li>
                  );
                });
              })()}
            </ol>
            <form action={addChapter.bind(null, ms.id)}>
              <button className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted hover:bg-line/50 hover:text-ink">
                + Add chapter
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
              <ul className="mt-1 mb-2 ml-3 border-l border-line pl-1.5">
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

      <div className="border-t border-line px-3 py-3">
        <NavLink href="/account" active={pathname === "/account"}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span>Account</span>
            {email && <span className="truncate text-xs text-muted">{email}</span>}
          </span>
        </NavLink>
        <form action={signOutAction}>
          <button className="w-full rounded-lg px-2.5 py-1.5 text-left text-muted hover:bg-line/50 hover:text-ink">Sign out</button>
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
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Phones/tablets: a slide-in drawer. Desktop: a full-height column whose menu stays put while the page scrolls. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-card transition-transform lg:static lg:z-auto lg:w-[17rem] lg:shrink-0 lg:translate-x-0 ${
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
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
        active ? "bg-accent-soft font-medium text-ink" : "text-ink/80 hover:bg-line/50 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

function Divider() {
  return <div className="mx-2.5 my-3 border-t border-line" />;
}

/** "Chapter 3: The Orchard" → "The Orchard"; "Chapter 3" → null (the title is just its number). */
function chapterSubtitle(title: string): string | null {
  const rest = title.replace(/^(chapter|ch\.)\s+[\w-]+\s*[:.\-–—]?\s*/i, "").trim();
  return rest && rest !== title ? rest : /^(chapter|ch\.)\s/i.test(title) ? null : title;
}

function Dot({ state }: { state: "reading" | "stale" | "error" }) {
  const cls = { reading: "bg-reaction animate-pulse", stale: "bg-issue", error: "bg-danger" }[state];
  const label = { reading: "Reading", stale: "Edited since last read", error: "Read stopped" }[state];
  return <span title={label} aria-label={label} className={`ml-auto inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

function ChapterBadge({ state, engagement }: { state: ChapterState; engagement: number | null }) {
  if (state === "reading" || state === "stale" || state === "error") return <Dot state={state} />;
  if (state === "read" && engagement != null) {
    const tone = engagement >= 8 ? "text-praise" : engagement >= 6 ? "text-muted" : "text-issue";
    return (
      <span className={`text-xs tabular-nums ${tone}`} title={`Wanted to keep reading: ${engagement}/10`}>
        {engagement}
      </span>
    );
  }
  return null;
}
