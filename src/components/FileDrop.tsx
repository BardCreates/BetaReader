"use client";

import { useState } from "react";

/**
 * A drop area for a manuscript file. The real file input covers the whole area (invisibly),
 * so clicking and dragging a file onto it both work natively, including keyboard focus.
 */
export function FileDrop({ name = "file", accept, hint }: { name?: string; accept: string; hint: string }) {
  const [file, setFile] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`relative rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-within:border-accent ${
        over ? "border-accent bg-accent-soft/60" : file ? "border-praise/50 bg-praise-soft/40" : "border-line hover:border-muted"
      }`}
    >
      <input
        name={name}
        type="file"
        accept={accept}
        required
        aria-label="Manuscript file"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)}
        onDragEnter={() => setOver(true)}
        onDragLeave={() => setOver(false)}
        onDrop={() => setOver(false)}
      />
      {file ? (
        <>
          <p className="font-medium text-ink">{file}</p>
          <p className="mt-1 text-sm text-muted">Ready. Choose a different file to replace it.</p>
        </>
      ) : (
        <>
          <p className="font-medium text-ink">
            Drop your manuscript here, or <span className="text-accent underline underline-offset-2">choose a file</span>
          </p>
          <p className="mt-1 text-sm text-muted">{hint}</p>
        </>
      )}
    </div>
  );
}
