"use client";

import Script from "next/script";
import { startTransition, useActionState, useState } from "react";
import { startTrialRead, type TrialFormState } from "@/app/trialActions";
import { FileDrop } from "@/components/FileDrop";
import { buttonClass, Card, inputClass } from "@/components/ui";

export function TrialForm({ maxWords, turnstileSiteKey }: { maxWords: number; turnstileSiteKey: string | null }) {
  const [state, action, pending] = useActionState<TrialFormState, FormData>(startTrialRead, undefined);
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [words, setWords] = useState(0);

  return (
    <form
      // onSubmit so a returned error doesn't clear a pasted chapter.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-5"
    >
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Chapter title</span> <span className="text-muted">(optional)</span>
            <input name="title" maxLength={200} className={`${inputClass} mt-1`} placeholder="The Orchard" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Genre</span> <span className="text-muted">(optional)</span>
            <input name="genre" maxLength={100} className={`${inputClass} mt-1`} placeholder="Literary thriller" />
          </label>
        </div>

        <div className="flex gap-2 text-sm">
          {(["paste", "file"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 ${mode === m ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"}`}
            >
              {m === "paste" ? "Paste a chapter" : "Upload a file"}
            </button>
          ))}
        </div>
        {mode === "paste" ? (
          <label className="block text-sm">
            <span className="sr-only">Chapter text</span>
            <textarea
              name="text"
              rows={16}
              required
              onChange={(e) => setWords((e.target.value.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) ?? []).length)}
              className={`${inputClass} font-serif text-[0.95rem] leading-relaxed`}
              placeholder="Paste one chapter here…"
            />
            <span className={`mt-1 block text-xs ${words > maxWords ? "text-danger" : "text-muted"}`}>
              {words.toLocaleString()} of {maxWords.toLocaleString()} words
            </span>
          </label>
        ) : (
          <FileDrop
            accept=".docx,.txt,.md,.markdown"
            hint=".docx, .md or .txt. If it’s the whole book, we’ll read the first chapter. From Dabble, export to Word or Markdown."
          />
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="midBook" className="mt-1" />
          <span>
            This chapter is from partway through the book <span className="text-muted">(not the opening)</span>
          </span>
        </label>
      </Card>

      {turnstileSiteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        </>
      )}

      {state?.error && <p className="rounded-lg bg-danger-soft px-4 py-2.5 text-sm text-danger">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <button className={buttonClass} disabled={pending || (mode === "paste" && words > maxWords)}>
          {pending ? "Sending to the reader…" : "Read my chapter"}
        </button>
        <p className="text-sm text-muted">No account, no card. Takes a minute or two.</p>
      </div>
    </form>
  );
}
