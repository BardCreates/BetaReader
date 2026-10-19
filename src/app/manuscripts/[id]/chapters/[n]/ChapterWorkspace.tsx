"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteChapter, renameChapter, rereadChapterNow, saveChapter, setNoteStatus } from "@/app/actions";
import { buttonClass, Card, ghostButtonClass } from "@/components/ui";
import { FEATURES } from "@/lib/features";
import type { DocNode } from "@/lib/manuscript/doc";
import { ChapterEditor, type ChapterEditorHandle } from "./ChapterEditor";

export type NoteView = {
  id: string;
  kind: "REACTION" | "PRAISE" | "ISSUE";
  category: string;
  severity: number;
  quote: string;
  start: number | null;
  comment: string;
  suggestion: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
};

export type ReviewView = {
  status: "QUEUED" | "READING" | "DONE" | "ERROR";
  error: string | null;
  reaction: string | null;
  summary: string | null;
  engagement: number | null;
  strengths: string[];
  questions: string[];
  predictions: string[];
  notes: NoteView[];
};

type Props = {
  manuscriptId: string;
  chapterId: string;
  index: number;
  total: number;
  title: string;
  initialDoc: DocNode;
  wordCount: number;
  review: ReviewView | null;
  stale: boolean;
  reviewBusy: boolean;
  manuscriptBusy: boolean;
  minWords: number;
};

const KIND_LABEL = { REACTION: "Reaction", PRAISE: "Working", ISSUE: "Issue" } as const;
const KIND_STYLE = {
  REACTION: "bg-reaction-soft text-reaction",
  PRAISE: "bg-praise-soft text-praise",
  ISSUE: "bg-issue-soft text-issue",
} as const;
const SEVERITY = ["", "minor", "notable", "major"];

type SaveState = { kind: "saved"; at: Date | null } | { kind: "dirty" } | { kind: "saving" } | { kind: "error"; message: string };

export function ChapterWorkspace(p: Props) {
  const router = useRouter();
  const editorRef = useRef<ChapterEditorHandle>(null);
  const base = `/manuscripts/${p.manuscriptId}`;

  // ─── Autosave ──────────────────────────────────────────────────
  const [save, setSave] = useState<SaveState>({ kind: "saved", at: null });
  const [words, setWords] = useState(p.wordCount);
  const pending = useRef<DocNode | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current || !pending.current) return;
    const doc = pending.current;
    pending.current = null;
    inFlight.current = true;
    setSave({ kind: "saving" });
    try {
      const res = await saveChapter(p.chapterId, doc);
      if (res.ok) {
        setWords(res.wordCount);
        setSave(pending.current ? { kind: "dirty" } : { kind: "saved", at: new Date(res.savedAt) });
        router.refresh(); // update the sidebar (word counts, "edited" dot)
      } else {
        pending.current ??= doc; // keep the change so it can be retried
        setSave({ kind: "error", message: res.error });
      }
    } catch {
      pending.current ??= doc;
      setSave({ kind: "error", message: "Couldn’t reach the server. Your changes are kept here; retrying…" });
      timer.current = setTimeout(() => void flush(), 5000);
    } finally {
      inFlight.current = false;
      if (pending.current && !timer.current) timer.current = setTimeout(() => void flush(), 800);
    }
  }, [p.chapterId, router]);

  const onChange = useCallback(
    (doc: DocNode) => {
      pending.current = doc;
      setSave({ kind: "dirty" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 1200);
    },
    [flush],
  );

  // Save before leaving the page; warn if a save is still outstanding when closing the tab.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      void flush();
    };
  }, [flush]);

  // ─── Notes ─────────────────────────────────────────────────────
  // During a re-read the previous notes stay visible until the new ones arrive.
  const notes = useMemo(() => p.review?.notes ?? [], [p.review]);
  const [active, setActive] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | NoteView["kind"]>("ALL");
  const [showClosed, setShowClosed] = useState(false);
  const [anchored, setAnchored] = useState<Set<string> | null>(null);

  const visible = notes.filter((n) => (filter === "ALL" || n.kind === filter) && (showClosed || n.status === "OPEN"));
  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);

  const highlightNotes = useMemo(
    () =>
      notes.map((n) => ({
        id: n.id,
        kind: n.kind,
        quote: n.quote,
        hint: n.start ?? 0,
        dim: !visibleIds.has(n.id),
      })),
    [notes, visibleIds],
  );

  const focusCard = useCallback((id: string) => {
    setActive(id);
    document.getElementById(`note-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  // ─── Re-read ───────────────────────────────────────────────────
  const [rereadError, setRereadError] = useState<string | null>(null);
  const [rereading, startReread] = useTransition();
  const reread = () =>
    startReread(async () => {
      await flush(); // read what's on screen, not the last autosave
      const res = await rereadChapterNow(p.chapterId);
      setRereadError(res?.error ?? null);
      router.refresh();
    });
  const busy = p.reviewBusy || rereading;
  const canRead = !busy && !p.manuscriptBusy && words >= p.minWords;
  const readLabel = p.review?.status === "DONE" ? "Re-read this chapter" : "Read this chapter";

  return (
    <main className="mx-auto max-w-[96rem] px-4 py-6 sm:px-8">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">
            Chapter {p.index + 1} of {p.total} · {words.toLocaleString()} words · <SaveStatus state={save} />
          </p>
          <TitleInput chapterId={p.chapterId} initial={p.title} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={buttonClass} onClick={reread} disabled={!canRead} title={words < p.minWords ? `Write at least ${p.minWords} words first` : undefined}>
            {busy ? "Reading…" : readLabel}
          </button>
          <ChapterMenu chapterId={p.chapterId} title={p.title} />
        </div>
      </div>

      {/* Status banners */}
      {rereadError && <Banner tone="accent">{rereadError}</Banner>}
      {busy && <Banner tone="reaction">The reader is reading this chapter. You can keep writing; new notes will appear when it’s done.</Banner>}
      {!busy && p.review?.status === "ERROR" && <Banner tone="accent">The last read stopped: {p.review.error}</Banner>}
      {!busy && p.stale && (
        <Banner tone="issue">
          You’ve edited this chapter since it was read, so some notes may be out of date. Re-read it when you’re ready for fresh feedback.
        </Banner>
      )}

      {/* Reader's reaction */}
      {p.review?.status === "DONE" && p.review.reaction && (
        <details className="group mb-5 rounded-xl border border-line bg-card" open={!p.stale}>
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 text-sm">
            <span className="text-xs font-medium uppercase tracking-widest text-accent">The reader’s reaction</span>
            {p.review.engagement != null && (
              <span className="text-muted">
                Wanted to keep reading: <b className="text-ink">{p.review.engagement}/10</b>
              </span>
            )}
            <span className="ml-auto text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <div className="grid gap-5 border-t border-line px-5 py-4 md:grid-cols-[1fr_16rem]">
            <div className="font-serif text-[1rem] leading-relaxed whitespace-pre-wrap">{p.review.reaction}</div>
            <div className="text-sm">
              <p className="text-muted">What I understood happened</p>
              <p className="mt-1">{p.review.summary}</p>
            </div>
          </div>
        </details>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Editor */}
        <Card className="px-4 py-4 sm:px-10 sm:py-6">
          <div className="mx-auto max-w-[40rem]">
            <ChapterEditor
              ref={editorRef}
              initialDoc={p.initialDoc}
              notes={highlightNotes}
              activeNoteId={active}
              onChange={onChange}
              onNoteClick={focusCard}
              onAnchors={setAnchored}
            />
          </div>
        </Card>

        {/* Notes */}
        <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pb-8">
          {notes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(["ALL", "ISSUE", "PRAISE", "REACTION"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`rounded-full px-2.5 py-1 ${filter === k ? "bg-ink text-paper" : "bg-line/60 text-muted hover:text-ink"}`}
                >
                  {k === "ALL" ? "All" : KIND_LABEL[k]} ({k === "ALL" ? notes.length : notes.filter((n) => n.kind === k).length})
                </button>
              ))}
              <label className="ml-auto flex items-center gap-1 text-muted">
                <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
                Show resolved
              </label>
            </div>
          ) : (
            !busy && (
              <Card className="text-sm text-muted">
                {words < p.minWords
                  ? "Notes from the reader will appear here once this chapter has been read."
                  : `No notes yet. Click “${readLabel}” for feedback on this chapter.`}
              </Card>
            )
          )}

          {visible.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              active={active === n.id}
              missing={anchored != null && !anchored.has(n.id)}
              onFocus={() => {
                setActive(n.id);
                editorRef.current?.revealNote(n.id);
              }}
              manuscriptId={p.manuscriptId}
              chapterId={p.chapterId}
            />
          ))}
          {notes.length > 0 && visible.length === 0 && <p className="text-sm text-muted">No open notes here. Nice work.</p>}

          {p.review?.status === "DONE" && (
            <>
              {p.review.strengths.length > 0 && <ListCard title="Keep these" items={p.review.strengths} tone="text-praise" />}
              {p.review.questions.length > 0 && <ListCard title="Questions I’m carrying" items={p.review.questions} tone="text-reaction" />}
              {p.review.predictions.length > 0 && <ListCard title="My predictions" items={p.review.predictions} tone="text-muted" />}
            </>
          )}

          <div className="flex justify-between pt-2 text-sm">
            {p.index > 0 ? (
              <Link href={`${base}/chapters/${p.index}`} className={ghostButtonClass}>
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            {p.index + 1 < p.total && (
              <Link href={`${base}/chapters/${p.index + 2}`} className={ghostButtonClass}>
                Next →
              </Link>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────

function SaveStatus({ state }: { state: SaveState }) {
  return (
    <span data-save-state={state.kind} aria-live="polite">
      <SaveLabel state={state} />
    </span>
  );
}

function SaveLabel({ state }: { state: SaveState }) {
  switch (state.kind) {
    case "saving":
      return <span>Saving…</span>;
    case "dirty":
      return <span>Unsaved changes</span>;
    case "error":
      return <span className="text-accent">{state.message}</span>;
    default:
      return <span>{state.at ? "Saved" : "All changes saved"}</span>;
  }
}

function Banner({ tone, children }: { tone: "accent" | "reaction" | "issue"; children: React.ReactNode }) {
  const cls = {
    accent: "border-accent/40 bg-accent-soft/50 text-accent",
    reaction: "border-reaction/40 bg-reaction-soft/50",
    issue: "border-issue/40 bg-issue-soft/50",
  }[tone];
  return <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

function TitleInput({ chapterId, initial }: { chapterId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef(initial);
  const commit = async () => {
    const v = value.trim();
    if (!v) {
      setValue(saved.current);
      return;
    }
    if (v === saved.current) return;
    const res = await renameChapter(chapterId, v);
    if (res?.error) setError(res.error);
    else {
      saved.current = v;
      setError(null);
    }
  };
  return (
    <>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setValue(saved.current);
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label="Chapter title"
        className="w-full rounded-md border border-transparent bg-transparent px-1 -mx-1 font-serif text-3xl font-semibold outline-none hover:border-line focus:border-accent"
      />
      {error && <p className="text-sm text-accent">{error}</p>}
    </>
  );
}

function ChapterMenu({ chapterId, title }: { chapterId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="relative">
      <button className={ghostButtonClass} onClick={() => setOpen((o) => !o)} aria-label="More chapter actions" aria-expanded={open}>
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-line bg-card p-1 text-sm shadow-lg">
            <button
              disabled={pending}
              className="w-full rounded-md px-3 py-2 text-left text-accent hover:bg-accent-soft"
              onClick={() => {
                if (window.confirm(`Delete “${title}” and its notes? This can’t be undone.`)) start(() => deleteChapter(chapterId));
              }}
            >
              {pending ? "Deleting…" : "Delete chapter"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function NoteCard({ note, active, missing, onFocus, manuscriptId, chapterId }: {
  note: NoteView;
  active: boolean;
  missing: boolean;
  onFocus: () => void;
  manuscriptId: string;
  chapterId: string;
}) {
  const [pending, start] = useTransition();
  const set = (status: NoteView["status"]) => start(() => setNoteStatus(note.id, status));
  const ask = `About this passage: "${note.quote}"\n\nYou said: ${note.comment}\n\n`;

  return (
    <div
      id={`note-${note.id}`}
      className={`rounded-xl border bg-card p-4 text-sm transition ${active ? "border-accent shadow-sm" : "border-line"} ${note.status !== "OPEN" ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${KIND_STYLE[note.kind]}`}>{KIND_LABEL[note.kind]}</span>
        <span className="text-muted">{note.category}</span>
        {note.kind === "ISSUE" && <span className="text-muted">· {SEVERITY[note.severity]}</span>}
        {note.status !== "OPEN" && <span className="ml-auto text-muted">{note.status.toLowerCase()}</span>}
      </div>
      <button onClick={onFocus} disabled={missing} className="mt-2 block text-left font-serif text-[0.95rem] italic text-muted enabled:hover:text-ink">
        “{note.quote}”
        {missing && <span className="not-italic"> (this passage has changed)</span>}
      </button>
      <p className="mt-2">{note.comment}</p>
      {note.suggestion && (
        <p className="mt-2 rounded-lg bg-praise-soft/60 p-2.5">
          <b className="text-praise">Try: </b>
          {note.suggestion}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        {note.status === "OPEN" ? (
          <>
            {note.kind === "ISSUE" && (
              <button disabled={pending} onClick={() => set("RESOLVED")} className="hover:text-praise">
                Mark fixed
              </button>
            )}
            <button disabled={pending} onClick={() => set("DISMISSED")} className="hover:text-ink">
              {note.kind === "ISSUE" ? "Disagree" : "Dismiss"}
            </button>
          </>
        ) : (
          <button disabled={pending} onClick={() => set("OPEN")} className="hover:text-ink">
            Reopen
          </button>
        )}
        {FEATURES.editorChat && (
          <Link
            href={`/manuscripts/${manuscriptId}/editor?chapter=${chapterId}&q=${encodeURIComponent(ask)}`}
            className="ml-auto text-accent hover:underline"
          >
            Ask the editor →
          </Link>
        )}
      </div>
    </div>
  );
}

function ListCard({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <Card className="p-4 text-sm">
      <p className={`mb-2 font-medium ${tone}`}>{title}</p>
      <ul className="list-disc space-y-1 pl-4">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </Card>
  );
}
