/** A character's picture, or their initials on a soft tint chosen from their name. */
const TINTS = [
  "bg-accent-soft text-accent",
  "bg-reaction-soft text-reaction",
  "bg-praise-soft text-praise",
  "bg-issue-soft text-issue",
  "bg-pen-soft text-pen",
];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase() || "?";
}

export function imageUrl(id: string, imageUpdatedAt: Date | string | null | undefined) {
  if (!imageUpdatedAt) return null;
  return `/api/characters/${id}/image?v=${new Date(imageUpdatedAt).getTime()}`;
}

export function CharacterAvatar({
  id,
  name,
  imageUpdatedAt,
  size = 40,
  className = "",
}: {
  id: string;
  name: string;
  imageUpdatedAt?: Date | string | null;
  size?: number;
  className?: string;
}) {
  const src = imageUrl(id, imageUpdatedAt);
  const tint = TINTS[[...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % TINTS.length];
  const style = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- private, auth-checked image route
    return <img src={src} alt={name} width={size} height={size} style={style} className={`shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.max(11, size * 0.38) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-serif font-semibold ${tint} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
