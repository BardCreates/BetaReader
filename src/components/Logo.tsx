import { BRAND } from "@/lib/brand";

/**
 * The mark: a manuscript page with a red margin bar beside one line, the way an editor
 * flags a passage. Fixed colours so it reads the same on light and dark pages and as a favicon.
 */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect x="1" y="1" width="30" height="30" rx="7.5" fill="#24407c" />
      <rect x="12.5" y="9" width="12" height="2.6" rx="1.3" fill="#f7f8fb" />
      <rect x="12.5" y="14.7" width="13.5" height="2.6" rx="1.3" fill="#f7f8fb" />
      <rect x="12.5" y="20.4" width="8.5" height="2.6" rx="1.3" fill="#f7f8fb" opacity="0.7" />
      <rect x="7" y="13.2" width="2.8" height="5.6" rx="1.4" fill="#f0625a" />
    </svg>
  );
}

/** Mark + wordmark. */
export function Logo({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: { mark: 22, text: "text-[1.05rem]" }, md: { mark: 26, text: "text-[1.2rem]" }, lg: { mark: 34, text: "text-[1.6rem]" } }[size];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark size={s.mark} />
      <span className={`font-serif font-semibold tracking-[-0.01em] text-ink ${s.text}`}>{BRAND.name}</span>
    </span>
  );
}
