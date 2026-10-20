"use client";

import { useRef, useState, useTransition } from "react";
import { removeCharacterImage, uploadCharacterImage } from "@/app/characterActions";
import { CharacterAvatar } from "@/components/CharacterAvatar";

const SIZE = 512;

/** Crop to a centred square and shrink to 512px in the browser, so uploads are small and uniform. */
async function prepare(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.86));
  // Browsers without WebP encoding fall back to PNG; use JPEG instead to keep it small.
  if (blob && blob.type === "image/webp") return blob;
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  if (!jpeg) throw new Error("encode failed");
  return jpeg;
}

export function AvatarUpload(props: { characterId: string; name: string; imageUpdatedAt: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const has = !!props.imageUpdatedAt;

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const blob = await prepare(file);
        const form = new FormData();
        form.set("image", new File([blob], "picture", { type: blob.type }));
        const res = await uploadCharacterImage(props.characterId, form);
        if (res?.error) setError(res.error);
      } catch {
        setError("That file couldn't be read as a picture.");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative shrink-0 rounded-full focus-visible:outline-2"
        aria-label={has ? `Change ${props.name}'s picture` : `Add a picture of ${props.name}`}
        disabled={pending}
      >
        <CharacterAvatar id={props.characterId} name={props.name} imageUpdatedAt={props.imageUpdatedAt} size={88} />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/55 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {pending ? "Saving…" : has ? "Change" : "Add picture"}
        </span>
      </button>
      <div className="min-w-0 text-sm">
        <button type="button" className="font-medium text-accent hover:underline" onClick={() => input.current?.click()} disabled={pending}>
          {pending ? "Saving…" : has ? "Change picture" : "Add a picture"}
        </button>
        {has && !pending && (
          <button
            type="button"
            className="ml-3 text-muted hover:text-danger"
            onClick={() => start(async () => void (await removeCharacterImage(props.characterId)))}
          >
            Remove
          </button>
        )}
        <p className="mt-0.5 text-xs text-muted">JPEG, PNG or WebP. Cropped to a square.</p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        data-testid="avatar-input"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </div>
  );
}
