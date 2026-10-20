"use client";

import { useActionState, useState } from "react";
import { deleteAccount } from "@/app/accountActions";
import { inputClass } from "@/components/ui";

export function DeleteAccountForm({ hasSubscription }: { hasSubscription: boolean }) {
  const [state, action, pending] = useActionState(deleteAccount, undefined);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-danger hover:underline">
        Delete my account…
      </button>
    );
  }
  return (
    <form action={action} className="mt-1 rounded-lg border border-danger/40 bg-danger-soft/40 p-4">
      <p className="text-sm">
        This permanently deletes your account, every manuscript and everything the reader made.
        {hasSubscription ? " Your subscription is cancelled straight away." : ""} It can’t be undone. Download your data first if you want a copy.
      </p>
      <label className="mt-3 block text-sm">
        Type <b>delete</b> to confirm
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className={`${inputClass} mt-1 max-w-xs`}
          aria-describedby={state?.error ? "delete-error" : undefined}
        />
      </label>
      {state?.error && (
        <p id="delete-error" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          disabled={pending || typed.trim().toLowerCase() !== "delete"}
          className="inline-flex items-center rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:text-paper"
        >
          {pending ? "Deleting…" : "Delete everything"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
