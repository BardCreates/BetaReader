"use client";

import { useState, useTransition } from "react";
import { deleteCharacter, updateCharacter, type CharacterFields } from "@/app/characterActions";
import { ghostButtonClass, inputClass } from "@/components/ui";

type Key = keyof CharacterFields;
type FieldSpec = { key: Key; label: string; kind: "input" | "text"; placeholder?: string; hint?: string; wide?: boolean };

const PRONOUN_OPTIONS = ["she/her", "he/him", "they/them", "she/they", "he/they", "xe/xem", "it/its"];

/** Saves only the fields it shows, so the identity card and the profile tab never overwrite each other. */
function FieldsForm({
  characterId,
  specs,
  initial,
  columns = 1,
  footer,
  testId,
}: {
  characterId: string;
  specs: FieldSpec[];
  initial: Partial<Record<Key, string>>;
  columns?: 1 | 2;
  footer?: React.ReactNode;
  testId?: string;
}) {
  const start0 = Object.fromEntries(specs.map((s) => [s.key, initial[s.key] ?? ""])) as Record<Key, string>;
  const [fields, setFields] = useState(start0);
  const [saved, setSaved] = useState(start0);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(fields) !== JSON.stringify(saved);

  const save = () =>
    start(async () => {
      const res = await updateCharacter(characterId, fields);
      if (res?.error) setStatus(res.error);
      else {
        setSaved(fields);
        setStatus("Saved");
      }
    });

  return (
    <form
      data-testid={testId}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-4 text-sm"
    >
      <div className={columns === 2 ? "grid gap-x-5 gap-y-4 md:grid-cols-2" : "space-y-4"}>
        {specs.map((s) => (
          <label key={s.key} className={`block space-y-1 ${s.wide && columns === 2 ? "md:col-span-2" : ""}`}>
            <span className="text-sm font-medium text-muted">{s.label}</span>
            {s.kind === "input" ? (
              <input
                name={s.key}
                value={fields[s.key]}
                placeholder={s.placeholder}
                list={s.key === "pronouns" ? "pronoun-options" : undefined}
                onChange={(e) => {
                  setFields((f) => ({ ...f, [s.key]: e.target.value }));
                  setStatus(null);
                }}
                className={inputClass}
              />
            ) : (
              <textarea
                name={s.key}
                value={fields[s.key]}
                placeholder={s.placeholder}
                onChange={(e) => {
                  setFields((f) => ({ ...f, [s.key]: e.target.value }));
                  setStatus(null);
                }}
                className={`${inputClass} grow-field max-h-[28rem] min-h-20 resize-y`}
              />
            )}
            {s.hint && <span className="block text-xs text-muted">{s.hint}</span>}
          </label>
        ))}
      </div>
      <datalist id="pronoun-options">
        {PRONOUN_OPTIONS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="flex items-center gap-3">
        <button className={ghostButtonClass} disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {status && <span className="text-muted">{status}</span>}
        {footer}
      </div>
    </form>
  );
}

/** Name-level facts, always visible beside the conversation. */
export function CharacterBasics(props: { characterId: string; name: string; initial: Partial<Record<Key, string>> }) {
  const [, start] = useTransition();
  return (
    <FieldsForm
      characterId={props.characterId}
      initial={props.initial}
      testId="character-basics"
      specs={[
        { key: "pronouns", label: "Pronouns", kind: "input", placeholder: "she/her", hint: "Used whenever the reader or other characters mention them." },
        { key: "role", label: "Role", kind: "input", placeholder: "protagonist, mentor…" },
        { key: "age", label: "Age", kind: "input", placeholder: "17, late forties…" },
        { key: "aliases", label: "Also called", kind: "input", placeholder: "Comma-separated" },
      ]}
      footer={
        <button
          type="button"
          className="ml-auto text-xs text-muted hover:text-danger"
          onClick={() => {
            if (window.confirm(`Delete ${props.name} and their conversations?`)) start(() => deleteCharacter(props.characterId));
          }}
        >
          Delete character
        </button>
      }
    />
  );
}

/** The fuller profile: what the manuscript shows, plus the author's own canon. */
export function CharacterProfileForm(props: { characterId: string; name: string; initial: Partial<Record<Key, string>> }) {
  const first = props.name.split(" ")[0];
  return (
    <FieldsForm
      characterId={props.characterId}
      initial={props.initial}
      columns={2}
      testId="character-profile"
      specs={[
        { key: "summary", label: "From the manuscript", kind: "text", wide: true, hint: "Filled in by Find characters; edit freely." },
        { key: "appearance", label: "Appearance", kind: "text", placeholder: "How they look, what people notice first" },
        { key: "personality", label: "Personality", kind: "text", placeholder: "Temperament, habits, contradictions" },
        { key: "wants", label: "What they want", kind: "text", placeholder: "What they're after, and why" },
        { key: "fears", label: "What they fear", kind: "text", placeholder: "What stands in their way, inside or out" },
        { key: "voice", label: "How they talk", kind: "text", placeholder: "Rhythm, vocabulary, a line only they would say" },
        { key: "backstory", label: "Backstory", kind: "text", placeholder: "What happened before the book starts" },
        {
          key: "notes",
          label: "Your notes",
          kind: "text",
          wide: true,
          placeholder: "Secrets, relationships, anything else",
          hint: `Everything on this page is treated as true when you talk with ${first}. Save useful chat replies here.`,
        },
      ]}
    />
  );
}
