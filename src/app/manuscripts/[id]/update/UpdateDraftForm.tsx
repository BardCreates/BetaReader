"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { reimportDraft, type ReimportState } from "@/app/reimportActions";
import { FileDrop } from "@/components/FileDrop";
import { buttonClass, Card, ghostButtonClass, inputClass } from "@/components/ui";
import type { ChapterChange } from "@/lib/manuscript/match";

export function UpdateDraftForm({ manuscriptId }: { manuscriptId: string }) {
  const [state, action, pending] = useActionState<ReimportState, FormData>(reimportDraft.bind(null, manuscriptId), undefined);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState<"preview" | "apply" | null>(null);

  const submit = (m: "preview" | "apply") => {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const data = new FormData(form);
    data.set("mode", m);
    setSubmitting(m);
    startTransition(() => action(data));
  };

  const preview = state?.preview;
  const nothingChanged = preview && preview.summary.changed + preview.summary.added + preview.summary.removed === 0;

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit("preview");
      }}
      className="mt-8 space-y-6"
    >
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
          <FileDrop accept=".docx,.txt,.md,.markdown" hint=".docx, .txt or .md, up to 10 MB. Keep your chapter headings so chapters match up." />
        ) : (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Revised manuscript text</span>
            <textarea name="text" rows={12} required className={`${inputClass} font-serif`} />
          </label>
        )}
        {!preview && (
          <button className={buttonClass} disabled={pending}>
            {pending ? "Comparing…" : "Compare with current draft"}
          </button>
        )}
      </Card>

      {state?.error && <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{state.error}</p>}

      {preview && (
        <Card className="p-0" >
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-serif text-xl font-semibold">What will change</h2>
            <p className="mt-1 text-sm text-muted" data-testid="reimport-summary">
              {nothingChanged
                ? "This draft matches what’s already here. Nothing to update."
                : [
                    preview.summary.changed && `${preview.summary.changed} chapter${preview.summary.changed === 1 ? "" : "s"} edited`,
                    preview.summary.added && `${preview.summary.added} new`,
                    preview.summary.removed && `${preview.summary.removed} removed`,
                    preview.summary.same && `${preview.summary.same} unchanged`,
                  ]
                    .filter(Boolean)
                    .join(", ") + `. ${preview.wordsBefore.toLocaleString()} → ${preview.words.toLocaleString()} words.`}
            </p>
            {preview.looksUnrelated && (
              <p className="mt-3 rounded-lg bg-issue-soft px-3 py-2 text-sm text-issue">
                This file shares almost no text with the current draft. Check it’s the right book before updating.
              </p>
            )}
          </div>
          <ul className="divide-y divide-line">
            {preview.changes.map((c, i) => (
              <ChangeRow key={i} change={c} />
            ))}
          </ul>
          {!nothingChanged && (
            <div className="space-y-3 border-t border-line px-5 py-4">
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>Edited chapters take the text from your file. Notes stay on passages that are still there.</li>
                {preview.summary.removed > 0 && <li>Removed chapters are deleted along with their notes.</li>}
                <li>Nothing is read yet. You choose when to send the changes to the reader.</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass} disabled={pending} onClick={() => submit("apply")}>
                  {pending && submitting === "apply" ? "Updating…" : "Update the draft"}
                </button>
                <button type="button" className={ghostButtonClass} disabled={pending} onClick={() => submit("preview")}>
                  {pending && submitting === "preview" ? "Comparing…" : "Compare again"}
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
    </form>
  );
}

const CHIP = {
  same: ["Unchanged", "bg-line text-muted"],
  changed: ["Edited", "bg-reaction-soft text-reaction"],
  new: ["New", "bg-praise-soft text-praise"],
  removed: ["Removed", "bg-danger-soft text-danger"],
} as const;

function ChangeRow({ change: c }: { change: ChapterChange }) {
  const [label, cls] = CHIP[c.kind];
  const title = c.kind === "removed" ? c.oldTitle : c.title;
  const renamed = (c.kind === "same" || c.kind === "changed") && c.oldTitle !== c.title;
  const detail =
    c.kind === "changed"
      ? `${c.wordsBefore.toLocaleString()} → ${c.words.toLocaleString()} words · about ${c.changedPct}% different`
      : c.kind === "removed"
        ? `${c.wordsBefore.toLocaleString()} words`
        : `${c.words.toLocaleString()} words`;
  return (
    <li className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-sm ${c.kind === "same" ? "text-muted" : ""}`} data-change={c.kind}>
      <span className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${cls}`}>{label}</span>
      <span className={`min-w-0 flex-1 ${c.kind === "removed" ? "line-through decoration-danger/50" : ""}`}>
        {title}
        {renamed && <span className="text-xs text-muted"> (was “{c.oldTitle}”)</span>}
      </span>
      <span className="text-xs text-muted tabular-nums">{detail}</span>
    </li>
  );
}
