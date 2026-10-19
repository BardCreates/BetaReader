"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buttonClass, Card, inputClass } from "@/components/ui";
import { Markdown } from "@/components/Markdown";

type Msg = { id: string; role: "user" | "assistant"; content: string };

const STARTERS = [
  "What's the single biggest thing holding this back?",
  "Where did you start losing interest, and why?",
  "Is my main character's motivation clear? How do I strengthen it?",
  "Help me rethink the opening so it hooks faster.",
];

export function EditorChat(props: {
  manuscriptId: string;
  conversationId: string | null;
  chapterId: string | null;
  chapters: { id: string; label: string }[];
  contextLabel: string;
  initialMessages: Msg[];
  initialDraft: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(props.initialMessages);
  const [draft, setDraft] = useState(props.initialDraft);
  const [chapterId, setChapterId] = useState(props.chapterId);
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setError(null);
    setDraft("");
    setStreaming(true);
    const reply: Msg = { id: `a-${Date.now()}`, role: "assistant", content: "" };
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: message }, reply]);

    try {
      const res = await fetch(`/api/manuscripts/${props.manuscriptId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, chapterId, message }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `Request failed (${res.status})`);
      const newId = res.headers.get("X-Conversation-Id");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, content: x.content + chunk } : x)));
      }
      if (newId && newId !== conversationId) {
        setConversationId(newId);
        // Put the conversation in the URL and refresh the sidebar without remounting the chat.
        window.history.replaceState(null, "", `/manuscripts/${props.manuscriptId}/editor?c=${newId}`);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages((m) => m.filter((x) => x.id !== reply.id || x.content));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Talking about:</span>
        {conversationId ? (
          <span className="font-medium">{props.contextLabel}</span>
        ) : (
          <select
            value={chapterId ?? ""}
            onChange={(e) => setChapterId(e.target.value || null)}
            className={`${inputClass} w-auto py-1`}
          >
            <option value="">The whole manuscript</option>
            {props.chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 space-y-4">
        {messages.length === 0 && (
          <Card>
            <p className="font-serif text-lg">Ask your editor anything about the book.</p>
            <p className="mt-1 text-sm text-muted">
              It has read your manuscript and its own notes. Ask why something isn’t working, talk through a fix, or paste a
              revised passage for a second look.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-3 py-1.5 text-left text-sm hover:bg-line/40">
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-ink px-4 py-3 text-sm text-paper">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="max-w-[92%] rounded-2xl rounded-bl-sm border border-line bg-card px-5 py-4">
              {m.content ? <Markdown text={m.content} /> : <span className="animate-pulse text-sm text-muted">Thinking about your book…</span>}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>

      {error && <p className="mt-4 rounded-lg bg-accent-soft px-4 py-2 text-sm text-accent">{error}</p>}

      <form
        className="sticky bottom-0 mt-6 flex gap-2 bg-paper py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={Math.min(8, Math.max(2, draft.split("\n").length))}
          placeholder="Ask about a scene, a character, or paste a revision…"
          className={`${inputClass} resize-none`}
        />
        <button className={`${buttonClass} self-end`} disabled={streaming || !draft.trim()}>
          {streaming ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
