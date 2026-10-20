"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { appendCharacterNote } from "@/app/characterActions";
import { Markdown } from "@/components/Markdown";
import { buttonClass, Card, inputClass } from "@/components/ui";

type Msg = { id: string; role: "user" | "assistant"; content: string };

export function CharacterChat(props: {
  manuscriptId: string;
  characterId: string;
  name: string;
  totalChapters: number;
  conversationId: string | null;
  asOfChapter: number | null;
  initialMessages: Msg[];
}) {
  const router = useRouter();
  const first = props.name.split(" ")[0];
  const [messages, setMessages] = useState<Msg[]>(props.initialMessages);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [asOf, setAsOf] = useState<number | null>(props.asOfChapter);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const bottom = useRef<HTMLDivElement>(null);

  // Block body on purpose: scrollIntoView may return a Promise, and effects must return nothing.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const starters = [
    `What do you want more than anything?`,
    `What are you afraid the others will find out?`,
    `Tell me about the day before the story starts.`,
    `OOC: Where does ${first}'s arc feel thin?`,
  ];

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    setError(null);
    setDraft("");
    setStreaming(true);
    const reply: Msg = { id: `a-${Date.now()}`, role: "assistant", content: "" };
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: message }, reply]);
    try {
      const res = await fetch(`/api/manuscripts/${props.manuscriptId}/characters/${props.characterId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, asOfChapter: asOf, message }),
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
        window.history.replaceState(null, "", `/manuscripts/${props.manuscriptId}/characters/${props.characterId}?c=${newId}`);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages((m) => m.filter((x) => x.id !== reply.id || x.content));
    } finally {
      setStreaming(false);
    }
  }

  async function saveToNotes(m: Msg) {
    const res = await appendCharacterNote(props.characterId, m.content);
    if (!res?.error) {
      setSavedIds((s) => new Set(s).add(m.id));
      router.refresh();
    } else setError(res.error);
  }

  return (
    <div className="flex min-h-[75vh] flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{first} knows:</span>
        {conversationId ? (
          <span className="font-medium">{asOf ? `up to chapter ${asOf}` : "the whole book"}</span>
        ) : (
          <select
            value={asOf ?? ""}
            onChange={(e) => setAsOf(e.target.value ? Number(e.target.value) : null)}
            className={`${inputClass} w-auto py-1`}
            aria-label="What the character knows"
          >
            <option value="">The whole book</option>
            {Array.from({ length: Math.max(0, props.totalChapters - 1) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Up to chapter {n}
              </option>
            ))}
          </select>
        )}
        <span className="ml-auto text-xs text-muted">
          <mark className="invented">Highlighted</mark> = invented, not in your manuscript
        </span>
      </div>

      <div className="space-y-4">
        {messages.length === 0 && (
          <Card>
            <p className="font-serif text-lg">Ask {first} anything.</p>
            <p className="mt-1 text-sm text-muted">
              They answer in character. Start a message with <code className="rounded bg-line/60 px-1">OOC:</code> to step out of character and talk
              about {first} as a writer.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {starters.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-3 py-1.5 text-left text-sm hover:bg-line/40">
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-4 py-3 text-sm text-ink">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="max-w-[92%] rounded-2xl rounded-bl-sm border border-line bg-card px-5 py-4">
              <p className="mb-1 text-xs font-medium text-accent">{first}</p>
              {m.content ? <Markdown text={m.content} /> : <span className="animate-pulse text-sm text-muted">…</span>}
              {m.content && !(streaming && m === messages.at(-1)) && (
                <button
                  onClick={() => saveToNotes(m)}
                  disabled={savedIds.has(m.id)}
                  className="mt-2 text-xs text-muted hover:text-accent disabled:text-praise"
                >
                  {savedIds.has(m.id) ? "✓ Saved to notes" : "Save to notes"}
                </button>
              )}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>

      {error && <p className="mt-4 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger">{error}</p>}

      {/* The composer sits right under the conversation and stays in view while it grows. */}
      <form
        className="sticky bottom-0 mt-4 bg-paper pt-2 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <div className="rounded-xl border border-line bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)] focus-within:border-accent">
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
          placeholder={`Ask ${first} something…`}
          className="block w-full resize-none bg-transparent px-4 pt-3 text-[0.95rem] outline-none placeholder:text-muted/70"
          aria-label={`Message ${first}`}
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-2.5">
          <span className="text-xs text-muted">Enter to send, Shift+Enter for a new line</span>
          <button className={buttonClass} disabled={streaming || !draft.trim()}>
            {streaming ? "Replying…" : "Send"}
          </button>
        </div>
        </div>
      </form>
    </div>
  );
}
