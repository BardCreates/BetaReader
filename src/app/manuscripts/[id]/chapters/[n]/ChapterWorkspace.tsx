"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { checkGrammar, deleteChapter, renameChapter, rereadChapterNow, saveChapter, setChapterIntent, setNoteStatus } from "@/app/actions";
import { buttonClass, Card, ghostButtonClass } from "@/components/ui";
import { Prose } from "@/components/Prose";
import { FEATURES } from "@/lib/features";
import type { DocNode } from "@/lib/manuscript/doc";
import { isMechanical } from "@/lib/reader/lineSuggestions";
import { ChapterEditor, type ChapterEditorHandle, type Suggestion } from "./ChapterEditor";
import { NoteThread } from "./NoteThread";

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
  /** For continuity notes: the earlier fact this passage contradicts. */
  conflict: { fact: string; chapter: number } | null;
  /** The author has already asked the reader about this note. */
  discussed: boolean;
};

export type IntentCheck = { intent: string; landed: "yes" | "partly" | "no"; explanation: string };
export type RevisionCheck = {
  previousEngagement: number | null;
  notes: { quote: string; comment: string; authorStatus: string; verdict: "fixed" | "partly" | "still_there"; explanation: string }[];
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
  intentCheck: IntentCheck | null;
  revisionCheck: RevisionCheck | null;
  dropOff: { quote: string; why: string } | null;
};

type Props = {
  manuscriptId: string;
  chapterId: string;
  index: number;
  total: number;
  title: string;
  intent: string;
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

  // Deep link from elsewhere (story bible, report): ?note=<id> opens the chapter at that note.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("note");
    if (!id || !notes.some((n) => n.id === id)) return;
    setShowClosed(true);
    const t = setTimeout(() => {
      focusCard(id);
      editorRef.current?.revealNote(id);
    }, 300);
    return () => clearTimeout(t);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Proofread ─────────────────────────────────────────────────
  const [tab, setTab] = useState<"notes" | "grammar">("notes");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [liveIds, setLiveIds] = useState<string[]>([]);
  const [activeSug, setActiveSug] = useState<string | null>(null);
  const [grammar, setGrammar] = useState<{ state: "idle" | "checking" | "done" | "error"; message?: string; found?: number }>({ state: "idle" });
  const liveSuggestions = useMemo(() => {
    const live = new Set(liveIds);
    return suggestions.filter((sug) => live.has(sug.id));
  }, [suggestions, liveIds]);

  const runGrammar = async () => {
    const doc = editorRef.current?.getDoc();
    if (!doc) return;
    setTab("grammar");
    setGrammar({ state: "checking" });
    const res = await checkGrammar(p.chapterId, doc);
    if (!res.ok) {
      setGrammar({ state: "error", message: res.error });
      return;
    }
    setSuggestions(res.suggestions);
    editorRef.current?.setSuggestions(res.suggestions);
    setGrammar({ state: "done", found: res.suggestions.length });
  };
  // Only mechanical fixes can be applied; flags are for the author to rewrite.
  const accept = (sug: Suggestion) => {
    if (!sug.flag) editorRef.current?.acceptSuggestion(sug.id, sug.replacement);
  };
  const dismiss = (sug: Suggestion) => editorRef.current?.dismissSuggestion(sug.id);
  const acceptAll = (types: string[]) => {
    // Back to front, so earlier replacements don't shift later ones.
    [...liveSuggestions].reverse().filter((sug) => !sug.flag && types.includes(sug.type)).forEach(accept);
  };

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
    <main className="mx-auto max-w-[96rem] px-4 py-6 sm:px-8 lg:px-12">
      {/* Header */}
      <div className="mb-4 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">
            Chapter {p.index + 1} of {p.total} · {words.toLocaleString()} words · <SaveStatus state={save} />
          </p>
          <TitleInput chapterId={p.chapterId} initial={p.title} />
          <IntentInput chapterId={p.chapterId} initial={p.intent} />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button className={buttonClass} onClick={reread} disabled={!canRead} title={words < p.minWords ? `Write at least ${p.minWords} words first` : undefined}>
            {busy ? "Reading…" : readLabel}
          </button>
          <ChapterMenu chapterId={p.chapterId} title={p.title} />
        </div>
      </div>

      {/* Status banners */}
      {rereadError && <Banner tone="danger">{rereadError}</Banner>}
      {busy && <Banner tone="reaction">The reader is reading this chapter. You can keep writing; new notes will appear when it’s done.</Banner>}
      {!busy && p.review?.status === "ERROR" && <Banner tone="danger">The last read stopped: {p.review.error}</Banner>}
      {!busy && p.stale && (
        <Banner tone="issue">
          You’ve edited this chapter since it was read, so some notes may be out of date. Re-read it when you’re ready for fresh feedback.
        </Banner>
      )}

      {/* Reader's reaction */}
      {p.review?.status === "DONE" && p.review.reaction && (
        <details className="group mb-5 rounded-xl border border-line bg-card" open={!p.stale}>
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 text-sm">
            <span className="font-serif text-base font-semibold">The reader’s reaction</span>
            {p.review.engagement != null && (
              <span className="text-muted">
                Wanted to keep reading: <b className="text-ink">{p.review.engagement}/10</b>
              </span>
            )}
            <span className="ml-auto text-muted transition group-open:rotate-180">▾</span>
          </summary>
          <div className="grid border-t border-line xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="px-5 py-5 sm:px-10">
              <Prose text={p.review.reaction} className="mx-auto max-w-[46rem]" />
            </div>
            <aside className="border-t border-line bg-paper/60 px-5 py-5 text-sm xl:rounded-br-xl xl:border-t-0 xl:border-l">
              <p className="font-medium text-muted">What I understood happened</p>
              <p className="mt-2 leading-relaxed">{p.review.summary}</p>
              {p.review.dropOff && (
                <div className="mt-4 border-t border-line pt-4" data-testid="drop-off">
                  <p className="font-medium text-muted">Where my attention dipped</p>
                  <p className="mt-2 font-serif italic">“{p.review.dropOff.quote}”</p>
                  <p className="mt-1 leading-relaxed">{p.review.dropOff.why}</p>
                </div>
              )}
            </aside>
          </div>
        </details>
      )}

      {p.review?.status === "DONE" && (p.review.intentCheck || p.review.revisionCheck) && (
        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          {p.review.intentCheck && <IntentCheckCard check={p.review.intentCheck} />}
          {p.review.revisionCheck && <RevisionCheckCard check={p.review.revisionCheck} engagement={p.review.engagement} />}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Editor */}
        <Card className="px-4 py-4 sm:px-10 sm:py-6">
          <div className="mx-auto max-w-[46rem]">
            <ChapterEditor
              ref={editorRef}
              initialDoc={p.initialDoc}
              notes={highlightNotes}
              activeNoteId={active}
              onChange={onChange}
              onNoteClick={(id) => {
                setTab("notes");
                focusCard(id);
              }}
              onAnchors={setAnchored}
              onSuggestions={setLiveIds}
              onSuggestionClick={(id) => {
                setTab("grammar");
                setActiveSug(id);
                document.getElementById(`sug-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}
              toolbarExtra={
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={runGrammar}
                  disabled={grammar.state === "checking"}
                  className="h-8 rounded-md px-2 text-sm hover:bg-line/60 disabled:opacity-50"
                  title="Fix spelling, grammar and punctuation, and flag lines worth a second look"
                >
                  {grammar.state === "checking" ? "Checking…" : "✓ Proofread"}
                </button>
              }
            />
          </div>
        </Card>

        {/* Notes / grammar */}
        <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pb-8">
          <div className="flex rounded-lg border border-line bg-card p-1 text-sm" role="tablist">
            {(
              [
                ["notes", `Reader notes${notes.length ? ` (${notes.length})` : ""}`],
                ["grammar", `Proofread${grammar.state === "done" ? ` (${liveSuggestions.length})` : ""}`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`flex-1 rounded-md px-3 py-1.5 ${tab === k ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "grammar" ? (
            <GrammarPanel
              state={grammar}
              suggestions={liveSuggestions}
              active={activeSug}
              onRun={runGrammar}
              onAccept={accept}
              onDismiss={dismiss}
              onAcceptAll={acceptAll}
              onFocus={(sug) => {
                setActiveSug(sug.id);
                editorRef.current?.revealSuggestion(sug.id);
              }}
            />
          ) : (
          <>
          {notes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(["ALL", "ISSUE", "PRAISE", "REACTION"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`rounded-full px-2.5 py-1 ${filter === k ? "bg-accent-soft font-medium text-accent" : "bg-line/60 text-muted hover:text-ink"}`}
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
      return <span className="text-danger">{state.message}</span>;
    default:
      return <span>{state.at ? "Saved" : "All changes saved"}</span>;
  }
}

function Banner({ tone, children }: { tone: "danger" | "reaction" | "issue"; children: React.ReactNode }) {
  const cls = {
    danger: "border-danger/40 bg-danger-soft/60 text-danger",
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
      {/* A one-line textarea so long titles wrap on small screens instead of being cut off. */}
      <textarea
        value={value}
        rows={1}
        onChange={(e) => setValue(e.target.value.replace(/\n/g, " "))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
          if (e.key === "Escape") {
            setValue(saved.current);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        aria-label="Chapter title"
        className="grow-field -mx-1 block w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1 font-serif text-[1.75rem] leading-tight font-semibold tracking-[-0.01em] outline-none hover:border-line focus:border-accent sm:text-3xl"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </>
  );
}

const SUG_LABEL: Record<string, string> = {
  spelling: "Spelling",
  grammar: "Grammar",
  punctuation: "Punctuation",
  word_choice: "Word choice",
  repetition: "Repetition",
  clarity: "Clarity",
  style: "Style",
};
const MECHANICAL = Object.keys(SUG_LABEL).filter(isMechanical);

function GrammarPanel(props: {
  state: { state: "idle" | "checking" | "done" | "error"; message?: string; found?: number };
  suggestions: Suggestion[];
  active: string | null;
  onRun: () => void;
  onAccept: (s: Suggestion) => void;
  onDismiss: (s: Suggestion) => void;
  onAcceptAll: (types: string[]) => void;
  onFocus: (s: Suggestion) => void;
}) {
  const { state, suggestions } = props;
  if (state.state === "idle") {
    return (
      <Card className="text-sm">
        <p>
          Fix spelling, grammar and punctuation, and flag a few lines worth a second look. Typos can be fixed in one click; flagged lines are
          yours to rewrite. Your voice and dialogue are left alone.
        </p>
        <button onClick={props.onRun} className={`${buttonClass} mt-3`}>
          Proofread this chapter
        </button>
      </Card>
    );
  }
  if (state.state === "checking") return <Card className="animate-pulse text-sm text-muted">Checking the chapter…</Card>;
  if (state.state === "error") {
    return (
      <Card className="text-sm">
        <p className="text-danger">{state.message}</p>
        <button onClick={props.onRun} className={`${ghostButtonClass} mt-3`}>
          Try again
        </button>
      </Card>
    );
  }
  const mechanical = suggestions.filter((sug) => !sug.flag && MECHANICAL.includes(sug.type)).length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>
          {suggestions.length === 0
            ? state.found
              ? "All suggestions handled."
              : "No issues found."
            : `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}`}
        </span>
        {mechanical > 1 && (
          <button onClick={() => props.onAcceptAll(MECHANICAL)} className="rounded-full bg-line/60 px-2.5 py-1 hover:text-ink">
            Accept all spelling &amp; grammar ({mechanical})
          </button>
        )}
        <button onClick={props.onRun} className="ml-auto hover:text-ink">
          Check again
        </button>
      </div>
      {suggestions.map((sug) => (
        <div
          key={sug.id}
          id={`sug-${sug.id}`}
          className={`rounded-xl border bg-card p-4 text-sm transition ${props.active === sug.id ? "border-accent shadow-sm" : "border-line"}`}
        >
          <button onClick={() => props.onFocus(sug)} className="block w-full text-left">
            <span className="text-xs font-medium text-reaction">
              {SUG_LABEL[sug.type] ?? sug.type}
              {sug.flag && <span className="font-normal text-muted"> · worth a second look</span>}
            </span>
            {sug.flag ? (
              <span className="mt-1 block font-serif italic text-ink">“{sug.quote}”</span>
            ) : (
              <span className="mt-1 block font-serif">
                <del className="text-muted decoration-danger/60">{sug.quote}</del>{" "}
                <span aria-hidden>→</span> <ins className="no-underline text-ink">{sug.replacement || "(remove)"}</ins>
              </span>
            )}
          </button>
          <p className="mt-1.5 text-muted">{sug.explanation}</p>
          <div className="mt-2 flex gap-3 text-xs">
            {sug.flag ? (
              <button onClick={() => props.onDismiss(sug)} className="font-medium text-accent hover:underline">
                Got it
              </button>
            ) : (
              <>
                <button onClick={() => props.onAccept(sug)} className="font-medium text-praise hover:underline">
                  Accept
                </button>
                <button onClick={() => props.onDismiss(sug)} className="text-muted hover:text-ink">
                  Dismiss
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function IntentInput({ chapterId, initial }: { chapterId: string; initial: string }) {
  const [open, setOpen] = useState(Boolean(initial));
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const saved = useRef(initial);
  const commit = async () => {
    if (value.trim() === saved.current.trim()) return;
    setState("saving");
    await setChapterIntent(chapterId, value);
    saved.current = value;
    setState("saved");
  };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-1 text-sm text-muted hover:text-accent">
        + What should this chapter do for the reader?
      </button>
    );
  }
  return (
    <div className="mt-2 max-w-3xl">
      <label className="flex items-baseline justify-between text-sm font-medium text-muted">
        Your intent for this chapter
        <span className="text-xs font-normal">
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved. The reader checks it on the next read." : "Checked on the next read"}
        </span>
      </label>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        onBlur={commit}
        rows={2}
        placeholder="e.g. The reader should start to suspect Elena, and feel dread when the lights go out."
        className="mt-1 w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </div>
  );
}

const LANDED = {
  yes: ["Landed", "bg-praise-soft text-praise"],
  partly: ["Partly landed", "bg-issue-soft text-issue"],
  no: ["Didn’t land", "bg-danger-soft text-danger"],
} as const;

function IntentCheckCard({ check }: { check: IntentCheck }) {
  const [label, cls] = LANDED[check.landed];
  return (
    <Card className="text-sm">
      <div className="flex items-center gap-2">
        <span className="font-serif text-base font-semibold">Intent check</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
      </div>
      <p className="mt-2 text-muted">
        You wanted: <span className="text-ink">{check.intent}</span>
      </p>
      <p className="mt-2">{check.explanation}</p>
    </Card>
  );
}

const VERDICT = {
  fixed: ["Fixed", "bg-praise-soft text-praise"],
  partly: ["Partly", "bg-issue-soft text-issue"],
  still_there: ["Still there", "bg-danger-soft text-danger"],
} as const;

function RevisionCheckCard({ check, engagement }: { check: RevisionCheck; engagement: number | null }) {
  const fixed = check.notes.filter((n) => n.verdict === "fixed").length;
  const delta = check.previousEngagement != null && engagement != null ? engagement - check.previousEngagement : null;
  return (
    <Card className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-serif text-base font-semibold">Revision check</span>
        {check.notes.length > 0 && (
          <span className="text-muted">
            {fixed} of {check.notes.length} earlier issues fixed
          </span>
        )}
        {delta != null && (
          <span className="ml-auto text-muted">
            Engagement {check.previousEngagement} → <b className={delta > 0 ? "text-praise" : delta < 0 ? "text-danger" : "text-ink"}>{engagement}</b>
          </span>
        )}
      </div>
      {check.notes.length === 0 ? (
        <p className="mt-2 text-muted">No earlier issues to check.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {check.notes.map((n, i) => {
            const [label, cls] = VERDICT[n.verdict];
            return (
              <li key={i}>
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
                  <span className="font-serif italic text-muted">“{n.quote}”</span>
                </div>
                <p className="mt-1 pl-1">{n.explanation}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
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
              className="w-full rounded-md px-3 py-2 text-left text-danger hover:bg-danger-soft"
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
  const [asking, setAsking] = useState(false);
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
      {note.conflict && (
        <p className="mt-2 text-xs text-muted">
          Established in{" "}
          <Link href={`/manuscripts/${manuscriptId}/chapters/${note.conflict.chapter}`} className="underline hover:text-ink">
            chapter {note.conflict.chapter}
          </Link>
          : <span className="text-ink">{note.conflict.fact}</span>
        </p>
      )}
      <p className="mt-2">{note.comment}</p>
      {note.suggestion && (
        <p className="mt-2 rounded-lg bg-praise-soft/60 p-2.5">
          <b className="text-praise">How to approach it: </b>
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
        {FEATURES.noteChat ? (
          <button onClick={() => setAsking((a) => !a)} className="ml-auto text-accent hover:underline" aria-expanded={asking}>
            {asking ? "Close" : note.discussed ? "Your questions" : "Ask about this"}
          </button>
        ) : (
          FEATURES.editorChat && (
            <Link
              href={`/manuscripts/${manuscriptId}/editor?chapter=${chapterId}&q=${encodeURIComponent(ask)}`}
              className="ml-auto text-accent hover:underline"
            >
              Ask the editor
            </Link>
          )
        )}
      </div>
      {asking && <NoteThread noteId={note.id} />}
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
