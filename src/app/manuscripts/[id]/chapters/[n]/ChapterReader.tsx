"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { reviseChapter, setNoteStatus } from "@/app/actions";
import { buttonClass, Card, ghostButtonClass } from "@/components/ui";
import { segmentText } from "@/lib/manuscript/anchor";

type NoteView = {
  id: string;
  kind: "REACTION" | "PRAISE" | "ISSUE";
  category: string;
  severity: number;
  quote: string;
  start: number | null;
  end: number | null;
  comment: string;
  suggestion: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
};

const KIND_LABEL = { REACTION: "Reaction", PRAISE: "Working", ISSUE: "Issue" } as const;
const KIND_STYLE = {
  REACTION: "bg-reaction-soft text-reaction",
  PRAISE: "bg-praise-soft text-praise",
  ISSUE: "bg-issue-soft text-issue",
} as const;
const SEVERITY = ["", "minor", "notable", "major"];

export function ChapterReader(props: {
  manuscriptId: string;
  chapterId: string;
  content: string;
  busy: boolean;
  notes: NoteView[];
  strengths: string[];
  questions: string[];
  predictions: string[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | NoteView["kind"]>("ALL");
  const [showClosed, setShowClosed] = useState(false);
  const [editing, setEditing] = useState(false);

  const visible = props.notes.filter(
    (n) => (filter === "ALL" || n.kind === filter) && (showClosed || n.status === "OPEN"),
  );
  const visibleIds = new Set(visible.map((n) => n.id));
  const byId = useMemo(() => new Map(props.notes.map((n) => [n.id, n])), [props.notes]);

  const segments = useMemo(
    () =>
      segmentText(
        props.content,
        props.notes.filter((n) => n.start != null && n.end != null).map((n) => ({ id: n.id, start: n.start!, end: n.end! })),
      ),
    [props.content, props.notes],
  );

  function focus(id: string, target: "note" | "text") {
    setActive(id);
    document.getElementById(target === "note" ? `note-${id}` : `mark-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (editing) {
    return <ReviseForm chapterId={props.chapterId} initial={props.content} onCancel={() => setEditing(false)} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <Card className="px-6 py-8 sm:px-10">
        <div className="mb-6 flex justify-end">
          <button className={ghostButtonClass} onClick={() => setEditing(true)} disabled={props.busy}>
            Revise this chapter
          </button>
        </div>
        <div className="manuscript mx-auto max-w-[38rem]">
          {segments.map((s, i) => {
            if (!s.noteId) return <span key={i}>{s.text}</span>;
            const note = byId.get(s.noteId)!;
            return (
              <mark
                key={i}
                id={`mark-${note.id}`}
                className="note"
                data-kind={note.kind}
                data-dim={!visibleIds.has(note.id)}
                data-active={active === note.id}
                onClick={() => focus(note.id, "note")}
              >
                {s.text}
              </mark>
            );
          })}
        </div>
      </Card>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pb-8">
        {props.notes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(["ALL", "ISSUE", "PRAISE", "REACTION"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full px-2.5 py-1 ${filter === k ? "bg-ink text-paper" : "bg-line/60 text-muted hover:text-ink"}`}
              >
                {k === "ALL" ? "All" : KIND_LABEL[k]} ({k === "ALL" ? props.notes.length : props.notes.filter((n) => n.kind === k).length})
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1 text-muted">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
              Show resolved
            </label>
          </div>
        )}

        {visible.map((n) => (
          <NoteCard key={n.id} note={n} active={active === n.id} manuscriptId={props.manuscriptId} chapterId={props.chapterId} onFocus={() => focus(n.id, "text")} />
        ))}

        {props.notes.length > 0 && visible.length === 0 && (
          <p className="text-sm text-muted">No open notes here. Nice work.</p>
        )}

        {props.strengths.length > 0 && <ListCard title="Keep these" items={props.strengths} tone="text-praise" />}
        {props.questions.length > 0 && <ListCard title="Questions I’m carrying" items={props.questions} tone="text-reaction" />}
        {props.predictions.length > 0 && <ListCard title="My predictions" items={props.predictions} tone="text-muted" />}
      </aside>
    </div>
  );
}

function NoteCard({ note, active, manuscriptId, chapterId, onFocus }: {
  note: NoteView;
  active: boolean;
  manuscriptId: string;
  chapterId: string;
  onFocus: () => void;
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
      <button onClick={onFocus} className="mt-2 block text-left font-serif text-[0.95rem] italic text-muted hover:text-ink">
        “{note.quote}”{note.start == null && <span className="not-italic"> (passage not found in current text)</span>}
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
        <Link
          href={`/manuscripts/${manuscriptId}/editor?chapter=${chapterId}&q=${encodeURIComponent(ask)}`}
          className="ml-auto text-accent hover:underline"
        >
          Ask the editor →
        </Link>
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

function ReviseForm({ chapterId, initial, onCancel, onDone }: { chapterId: string; initial: string; onCancel: () => void; onDone: () => void }) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold">Revise this chapter</h2>
        <p className="text-sm text-muted">
          Paste or edit your revised chapter. The reader will read it again, remembering everything up to the previous chapter.
        </p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={28}
        className="manuscript w-full rounded-lg border border-line bg-paper p-4 outline-none focus:border-accent"
      />
      {error && <p className="text-sm text-accent">{error}</p>}
      <div className="flex gap-2">
        <button
          className={buttonClass}
          disabled={pending || text.trim() === initial.trim()}
          onClick={() =>
            start(async () => {
              try {
                await reviseChapter(chapterId, text);
                onDone();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't save the revision.");
              }
            })
          }
        >
          {pending ? "Saving…" : "Save and re-read"}
        </button>
        <button className={ghostButtonClass} onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </Card>
  );
}
