/**
 * Match the chapters of a revised draft (e.g. a fresh export from Dabble or Word) to the
 * chapters already in the app, so a re-import keeps notes and reads for chapters that didn't
 * change and only replaces what did.
 *
 * Chapters are aligned in order (like a diff), scoring each pair by how much text they share
 * plus whether their titles agree. Chapters added or removed in the middle shift the rest
 * correctly; a chapter moved far from its old position shows up as removed + new.
 *
 * Pure functions only, so they run in tests.
 */

import { docToPlain, plainToDoc } from "./doc";
import { countWords, normalizeManuscript } from "./split";

export type ExistingChapter = { id: string; index: number; title: string; content: string };
export type IncomingChapter = { title: string; content: string };

export type ChapterChange =
  | { kind: "same"; id: string; oldIndex: number; newIndex: number; oldTitle: string; title: string; words: number }
  | {
      kind: "changed";
      id: string;
      oldIndex: number;
      newIndex: number;
      oldTitle: string;
      title: string;
      wordsBefore: number;
      words: number;
      /** Rough share of the chapter's text that differs, 0–100. */
      changedPct: number;
    }
  | { kind: "new"; newIndex: number; title: string; words: number }
  | { kind: "removed"; id: string; oldIndex: number; oldTitle: string; wordsBefore: number };

/** The form the app stores chapter text in, so imported text compares equal to edited text. */
export function canonicalText(text: string): string {
  return docToPlain(plainToDoc(normalizeManuscript(text)));
}

function comparable(text: string): string {
  return canonicalText(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[ \t]+/g, " ")
    .trim();
}

function shingles(text: string, n = 4): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const out = new Set<string>();
  if (words.length < n) {
    if (words.length) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

/** Share of text in common, 0–1 (Jaccard similarity of 4-word runs). */
export function textSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let common = 0;
  for (const s of small) if (large.has(s)) common++;
  return common / (a.size + b.size - common);
}

/** The descriptive part of a title: "Chapter 12: The Fall" → "the fall"; "Chapter 12" → "". */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(chapter|ch\.|part)\s+[\w-]+\s*[:.\-–—]?\s*/i, "")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_SCORE = 0.12;

export function matchChapters(existing: ExistingChapter[], incoming: IncomingChapter[]): ChapterChange[] {
  const old = [...existing].sort((a, b) => a.index - b.index);
  const oldText = old.map((c) => comparable(c.content));
  const newText = incoming.map((c) => comparable(c.content));
  const oldSh = oldText.map((t) => shingles(t));
  const newSh = newText.map((t) => shingles(t));
  const oldKey = old.map((c) => titleKey(c.title));
  const newKey = incoming.map((c) => titleKey(c.title));

  const sim = old.map((_, i) => incoming.map((_, j) => textSimilarity(oldSh[i], newSh[j])));
  const score = (i: number, j: number) => {
    let s = sim[i][j];
    if (oldKey[i] && oldKey[i] === newKey[j]) s += 0.5; // same named chapter, even if rewritten
    if (!oldText[i] && !newText[j]) s += 0.3; // two empty placeholders
    return s >= MIN_SCORE ? s : 0;
  };

  // Order-preserving alignment that maximises the total match score.
  const n = old.length;
  const m = incoming.length;
  const best = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const s = score(i, j);
      best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], s > 0 ? s + best[i + 1][j + 1] : 0);
    }
  }

  const changes: ChapterChange[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m) {
      const s = score(i, j);
      if (s > 0 && best[i][j] === s + best[i + 1][j + 1]) {
        const o = old[i];
        const inc = incoming[j];
        const words = countWords(inc.content);
        if (oldText[i] === newText[j]) {
          changes.push({ kind: "same", id: o.id, oldIndex: o.index, newIndex: j, oldTitle: o.title, title: inc.title, words });
        } else {
          changes.push({
            kind: "changed",
            id: o.id,
            oldIndex: o.index,
            newIndex: j,
            oldTitle: o.title,
            title: inc.title,
            wordsBefore: countWords(o.content),
            words,
            changedPct: Math.max(1, Math.round((1 - sim[i][j]) * 100)),
          });
        }
        i++;
        j++;
        continue;
      }
      if (best[i][j] === best[i + 1][j]) {
        changes.push({ kind: "removed", id: old[i].id, oldIndex: old[i].index, oldTitle: old[i].title, wordsBefore: countWords(old[i].content) });
        i++;
        continue;
      }
      changes.push({ kind: "new", newIndex: j, title: incoming[j].title, words: countWords(incoming[j].content) });
      j++;
      continue;
    }
    if (i < n) {
      changes.push({ kind: "removed", id: old[i].id, oldIndex: old[i].index, oldTitle: old[i].title, wordsBefore: countWords(old[i].content) });
      i++;
    } else {
      changes.push({ kind: "new", newIndex: j, title: incoming[j].title, words: countWords(incoming[j].content) });
      j++;
    }
  }
  return changes;
}

export function summarizeChanges(changes: ChapterChange[]) {
  return {
    same: changes.filter((c) => c.kind === "same").length,
    changed: changes.filter((c) => c.kind === "changed").length,
    added: changes.filter((c) => c.kind === "new").length,
    removed: changes.filter((c) => c.kind === "removed").length,
  };
}
