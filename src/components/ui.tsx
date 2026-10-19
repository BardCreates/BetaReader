import type { ReadingStatus } from "@/generated/prisma/client";

export function StatusBadge({ status }: { status: ReadingStatus }) {
  const map: Record<ReadingStatus, [string, string]> = {
    DRAFT: ["Not read yet", "bg-line text-muted"],
    QUEUED: ["Starting…", "bg-reaction-soft text-reaction"],
    READING: ["Reading…", "bg-reaction-soft text-reaction animate-pulse"],
    DONE: ["Read", "bg-praise-soft text-praise"],
    ERROR: ["Stopped", "bg-danger-soft text-danger"],
  };
  const [label, cls] = map[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-xl border border-line bg-card p-5 ${className}`}>{children}</div>;
}

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:text-paper";

export const ghostButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-line/50 disabled:opacity-50";

export const inputClass =
  "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-accent";

/** Engagement across chapters as a compact bar strip. */
export function EngagementStrip({ values }: { values: { label: string; value: number | null; href?: string }[] }) {
  return (
    <div className="flex h-24 items-end gap-1" role="img" aria-label="Reader engagement by chapter">
      {values.map((v, i) => (
        <a
          key={i}
          href={v.href}
          title={`${v.label}: ${v.value ?? "not read"}${v.value ? "/10" : ""}`}
          className="group flex h-full flex-1 flex-col items-center justify-end"
        >
          <div
            className={`w-full max-w-6 rounded-t transition group-hover:opacity-80 ${
              v.value == null ? "bg-line" : v.value >= 7 ? "bg-praise" : v.value >= 5 ? "bg-issue" : "bg-danger"
            }`}
            style={{ height: `${((v.value ?? 1) / 10) * 100}%` }}
          />
        </a>
      ))}
    </div>
  );
}
