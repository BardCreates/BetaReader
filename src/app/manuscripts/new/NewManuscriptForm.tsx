"use client";

import { startTransition, useActionState, useState } from "react";
import { createManuscript, type FormState } from "@/app/actions";
import { buttonClass, Card, inputClass } from "@/components/ui";

export function NewManuscriptForm({ personas }: { personas: { id: string; label: string; short: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createManuscript, undefined);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [persona, setPersona] = useState(personas[0]?.id ?? "enthusiast");

  return (
    <form
      // Submit via onSubmit (not the `action` prop) so React doesn't reset the form when the
      // server returns an error — authors shouldn't lose a pasted manuscript to a typo.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="mt-8 space-y-6"
    >
      <Card className="space-y-4">
        <Field label="Title">
          <input name="title" required className={inputClass} placeholder="The Orchard at Night" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Genre">
            <input name="genre" className={inputClass} placeholder="Literary thriller" />
          </Field>
          <Field label="Audience">
            <select name="audience" className={inputClass} defaultValue="Adult">
              {["Adult", "New adult", "Young adult", "Middle grade", "Children's"].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="What do you most want feedback on?" hint="Optional. E.g. “Is the middle too slow? Does Elena’s turn in chapter 9 feel earned?”">
          <textarea name="authorGoals" rows={3} className={inputClass} />
        </Field>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium">Who should read it?</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {personas.map((p) => (
            <label
              key={p.id}
              className={`cursor-pointer rounded-lg border p-3 text-sm transition ${
                persona === p.id ? "border-accent bg-accent-soft" : "border-line hover:border-muted"
              }`}
            >
              <input type="radio" name="persona" value={p.id} checked={persona === p.id} onChange={() => setPersona(p.id)} className="sr-only" />
              <span className="font-medium">{p.label}</span>
              <span className="mt-1 block text-muted">{p.short}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex gap-2 text-sm">
          {(["file", "paste"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 ${mode === m ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"}`}
            >
              {m === "file" ? "Upload a file" : "Paste text"}
            </button>
          ))}
        </div>
        {mode === "file" ? (
          <Field label="Manuscript file" hint=".docx, .txt or .md, up to 10 MB. From Google Docs or Scrivener, export to .docx.">
            <input name="file" type="file" accept=".docx,.txt,.md,.markdown" required className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-line file:px-3 file:py-2 file:text-ink" />
          </Field>
        ) : (
          <Field label="Manuscript text" hint="Start each chapter with a heading line like “Chapter 1” so we can split it.">
            <textarea name="text" rows={14} required className={`${inputClass} font-serif`} />
          </Field>
        )}
      </Card>

      {state?.error && <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{state.error}</p>}

      <button className={buttonClass} disabled={pending}>
        {pending ? "Uploading…" : "Create manuscript"}
      </button>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}
