"use client";

import { useState, useTransition } from "react";
import { deleteCharacter, updateCharacter } from "@/app/characterActions";
import { Card, ghostButtonClass, inputClass } from "@/components/ui";

export function CharacterProfile(props: { characterId: string; name: string; role: string; aliases: string; summary: string; notes: string }) {
  const [fields, setFields] = useState({ role: props.role, aliases: props.aliases, summary: props.summary, notes: props.notes });
  const [saved, setSaved] = useState(fields);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(fields) !== JSON.stringify(saved);

  // Keep the notes box in step when a chat reply is saved into it.
  if (props.notes !== saved.notes && !dirty) {
    setFields((f) => ({ ...f, notes: props.notes }));
    setSaved((s) => ({ ...s, notes: props.notes }));
  }

  const save = () =>
    start(async () => {
      const res = await updateCharacter(props.characterId, fields);
      if (res?.error) setStatus(res.error);
      else {
        setSaved(fields);
        setStatus("Saved");
      }
    });

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
    setStatus(null);
  };

  return (
    <Card className="space-y-3 text-sm">
      <h1 className="font-serif text-2xl font-semibold">{props.name}</h1>
      <Field label="Role">
        <input value={fields.role} onChange={set("role")} placeholder="protagonist, mentor…" className={inputClass} />
      </Field>
      <Field label="Also called">
        <input value={fields.aliases} onChange={set("aliases")} placeholder="Comma-separated" className={inputClass} />
      </Field>
      <Field label="From the manuscript">
        <textarea value={fields.summary} onChange={set("summary")} rows={4} className={`${inputClass} resize-y`} />
      </Field>
      <Field label="Your notes" hint="Treated as true in every conversation. Save useful chat replies here.">
        <textarea value={fields.notes} onChange={set("notes")} rows={6} className={`${inputClass} resize-y`} />
      </Field>
      <div className="flex items-center gap-3">
        <button className={ghostButtonClass} onClick={save} disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {status && <span className="text-muted">{status}</span>}
        <button
          className="ml-auto text-xs text-muted hover:text-accent"
          onClick={() => {
            if (window.confirm(`Delete ${props.name} and their conversations?`)) start(() => deleteCharacter(props.characterId));
          }}
        >
          Delete
        </button>
      </div>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}
