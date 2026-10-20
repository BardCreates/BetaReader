"use client";

import { useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";

type Msg = { id: string; role: "user" | "assistant"; content: string };

const STARTERS = ["Why did this pull you out?", "This is deliberate. Does that change your read?", "What would a fix need to do?"];

/** A short conversation with the reader about one of its notes. */
export function NoteThread({ noteId }: { noteId: string }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/notes/${noteId}/ask`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Couldn't load the conversation."))))
      .then((d: { messages: Msg[] }) => live && setMessages(d.messages))
      .catch((e: Error) => live && (setMessages([]), setError(e.message)));
    return () => {
      live = false;
    };
  }, [noteId]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setError(null);
    setDraft("");
    setStreaming(true);
    const reply: Msg = { id: `a-${Date.now()}`, role: "assistant", content: "" };
    setMessages((m) => [...(m ?? []), { id: `u-${Date.now()}`, role: "user", content: message }, reply]);
    try {
      const res = await fetch(`/api/notes/${noteId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `Request failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => (m ?? []).map((x) => (x.id === reply.id ? { ...x, content: x.content + chunk } : x)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages((m) => (m ?? []).filter((x) => x.id !== reply.id || x.content));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="note-thread">
      {messages === null ? (
        <p className="animate-pulse text-xs text-muted">Loading…</p>
      ) : (
        <>
          {messages.length === 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={streaming} className="rounded-full border border-line px-2.5 py-1 text-left text-xs hover:bg-line/40">
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2.5">
            {messages.map((m) =>
              m.role === "user" ? (
                <p key={m.id} className="ml-6 whitespace-pre-wrap rounded-lg bg-accent-soft px-3 py-2 text-ink">
                  {m.content}
                </p>
              ) : (
                <div key={m.id} className="mr-2 rounded-lg bg-paper/70 px-3 py-2">
                  {m.content ? <Markdown text={m.content} /> : <span className="animate-pulse text-muted">…</span>}
                </div>
              ),
            )}
          </div>
          {error && <p className="mt-2 rounded-md bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{error}</p>}
          <form
            className="mt-2 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={Math.min(5, Math.max(1, draft.split("\n").length))}
              placeholder="Ask the reader about this note…"
              aria-label="Ask the reader about this note"
              className="min-w-0 flex-1 resize-none rounded-md border border-line bg-card px-2.5 py-1.5 outline-none focus:border-accent"
            />
            <button disabled={streaming || !draft.trim()} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:text-paper">
              {streaming ? "…" : "Ask"}
            </button>
          </form>
          <p className="mt-1.5 text-[0.7rem] text-muted">The reader explains and re-checks its note. It won’t write the fix for you. Re-reading the chapter replaces its notes, and this conversation with them.</p>
        </>
      )}
    </div>
  );
}
