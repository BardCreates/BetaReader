import type { ChapterChange } from "./match";

/** What a re-import changed, by chapter title. Stored on `Draft.summary`. */
export type DraftSummary = { changed: string[]; added: string[]; removed: string[]; unchanged: number };

export function draftSummary(changes: ChapterChange[]): DraftSummary {
  return {
    changed: changes.flatMap((c) => (c.kind === "changed" ? [c.title] : [])),
    added: changes.flatMap((c) => (c.kind === "new" ? [c.title] : [])),
    removed: changes.flatMap((c) => (c.kind === "removed" ? [c.oldTitle] : [])),
    unchanged: changes.filter((c) => c.kind === "same").length,
  };
}

export function parseDraftSummary(value: unknown): DraftSummary {
  const v = (value ?? {}) as Partial<DraftSummary>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((t): t is string => typeof t === "string") : []);
  return { changed: list(v.changed), added: list(v.added), removed: list(v.removed), unchanged: typeof v.unchanged === "number" ? v.unchanged : 0 };
}

type Verdict = "fixed" | "partly" | "still_there";

/** `ChapterReview.revisionCheck`, as the pipeline stores it. */
export type RevisionCheckData = {
  previousEngagement: number | null;
  notes: { quote: string; comment: string; verdict: Verdict; explanation: string }[];
  /** There were earlier issues, but the reader didn't report on them. */
  unchecked?: boolean;
};

export type DraftChapterInput = {
  number: number;
  title: string;
  /** True when the chapter's text changed after its last read. */
  stale: boolean;
  review: {
    draft: number | null;
    engagement: number | null;
    revisionCheck: RevisionCheckData | null;
    /** Open continuity notes on this version of the chapter. */
    continuity: { id: string; quote: string; comment: string }[];
  } | null;
};

export type DraftChapterResult = {
  number: number;
  title: string;
  /** "revised": re-read with a check of its earlier issues; "new": read for the first time in this draft. */
  kind: "revised" | "new";
  before: number | null;
  after: number | null;
  checked: { quote: string; comment: string; verdict: Verdict; explanation: string }[];
  unchecked: boolean;
  continuity: { id: string; quote: string; comment: string }[];
};

export type DraftComparison = {
  chapters: DraftChapterResult[];
  /** Chapters changed in this draft that the reader hasn't read yet. */
  waiting: { number: number; title: string }[];
  totals: { fixed: number; partly: number; stillThere: number; continuity: number; up: number; down: number };
};

/**
 * Draft-over-draft: for the current draft, which earlier issues each re-read chapter fixed,
 * how engagement moved, and which continuity problems the new version has. Built from what each read
 * already recorded (revisionCheck, continuity notes), so it costs nothing to show.
 */
export function compareDraft(draft: number, chapters: DraftChapterInput[], summary?: DraftSummary | null): DraftComparison {
  // With the import's summary, only chapters it changed or added count (plus any edited in the app
  // since), so a full re-read or a chapter that was simply never read isn't mistaken for a revision.
  const touched = summary ? new Set([...summary.changed, ...summary.added]) : null;
  const out: DraftChapterResult[] = [];
  const waiting: DraftComparison["waiting"] = [];
  for (const c of chapters) {
    const r = c.review;
    const inDraft = touched ? touched.has(c.title) : true;
    if (!r || r.draft !== draft || c.stale) {
      // Changed (or new) in this draft but not read in its current form yet.
      if (c.stale || (r === null && draft > 1 && inDraft)) waiting.push({ number: c.number, title: c.title });
      continue;
    }
    if (!inDraft && !r.revisionCheck) continue; // read for the first time now, but not part of this draft's changes
    out.push({
      number: c.number,
      title: c.title,
      kind: r.revisionCheck ? "revised" : "new",
      before: r.revisionCheck?.previousEngagement ?? null,
      after: r.engagement,
      checked: r.revisionCheck?.notes ?? [],
      unchecked: r.revisionCheck?.unchecked === true,
      continuity: r.continuity,
    });
  }
  const all = out.flatMap((c) => c.checked);
  return {
    chapters: out,
    waiting,
    totals: {
      fixed: all.filter((n) => n.verdict === "fixed").length,
      partly: all.filter((n) => n.verdict === "partly").length,
      stillThere: all.filter((n) => n.verdict === "still_there").length,
      continuity: out.reduce((n, c) => n + c.continuity.length, 0),
      up: out.filter((c) => c.before != null && c.after != null && c.after > c.before).length,
      down: out.filter((c) => c.before != null && c.after != null && c.after < c.before).length,
    },
  };
}

/** "2 of 3 earlier issues fixed", "nothing to check" — one line per chapter for the changes page. */
export function checkedLine(checked: { verdict: Verdict }[], unchecked = false): string {
  if (unchecked) return "Earlier issues weren’t checked on this read";
  if (!checked.length) return "No earlier issues to check";
  const fixed = checked.filter((n) => n.verdict === "fixed").length;
  return `${fixed} of ${checked.length} earlier issue${checked.length === 1 ? "" : "s"} fixed`;
}
