"use client";

import { useActionState, useState, useTransition } from "react";
import { addCharacter, findCharacters, type CharacterFormState } from "@/app/characterActions";
import { buttonClass, ghostButtonClass, inputClass } from "@/components/ui";

export function FindCharactersButton({ manuscriptId, hasAny }: { manuscriptId: string; hasAny: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CharacterFormState>();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className={hasAny ? ghostButtonClass : buttonClass}
        disabled={pending}
        onClick={() => start(async () => setResult(await findCharacters(manuscriptId)))}
      >
        {pending ? "Reading your manuscript…" : hasAny ? "Find more characters" : "Find characters in my manuscript"}
      </button>
      {result?.error && <p className="text-sm text-accent">{result.error}</p>}
      {result?.message && <p className="text-sm text-muted">{result.message}</p>}
    </div>
  );
}

export function AddCharacterForm({ manuscriptId }: { manuscriptId: string }) {
  const [state, action, pending] = useActionState<CharacterFormState, FormData>(addCharacter.bind(null, manuscriptId), undefined);
  return (
    <form action={action}>
      <label className="text-sm font-medium" htmlFor="new-character">
        Add a character by hand
      </label>
      <div className="mt-1.5 flex gap-2">
        <input id="new-character" name="name" required placeholder="Name" className={inputClass} />
        <button className={ghostButtonClass} disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {state?.error && <p className="mt-1 text-sm text-accent">{state.error}</p>}
    </form>
  );
}
