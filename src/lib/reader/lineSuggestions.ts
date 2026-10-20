/**
 * Proofreading suggestions: shared by the server (lineEdit.ts) and the editor UI.
 *
 * Mechanical fixes can be applied in one click. Everything else is a flag: the author reads why
 * and rewrites it themselves, because the app reads and never writes their prose.
 */
export const SUGGESTION_TYPES = ["spelling", "grammar", "punctuation", "word_choice", "repetition", "clarity", "style"] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];

export const MECHANICAL_TYPES: readonly SuggestionType[] = ["spelling", "grammar", "punctuation"];
export const isMechanical = (type: string) => (MECHANICAL_TYPES as readonly string[]).includes(type);

/** `replacement` is "" for flags (non-mechanical types); `flag` says which kind it is. */
export type LineSuggestion = { id: string; quote: string; replacement: string; type: SuggestionType; explanation: string; flag: boolean };

/** Most words a one-click fix may change. More than this is a rewrite, whatever the model labelled it. */
export const MAX_FIX_WORDS = 2;

/** Word-level edit distance: how many words were inserted, removed or swapped. */
export function wordsChanged(a: string, b: string): number {
  const x = a.split(/\s+/).filter(Boolean);
  const y = b.split(/\s+/).filter(Boolean);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/** Number the suggestions, drop no-op fixes, and strip any rewrite the model offered on a flag. */
export function toSuggestions(raw: { quote: string; replacement: string; type: SuggestionType; explanation: string }[]): LineSuggestion[] {
  let n = 0;
  return raw.flatMap((s) => {
    // A "grammar" fix that rewrites the sentence is still a rewrite: show it as a flag.
    const flag = !isMechanical(s.type) || wordsChanged(s.quote, s.replacement) > MAX_FIX_WORDS;
    if (!flag && s.quote === s.replacement) return [];
    return [{ id: `s${++n}`, quote: s.quote, type: s.type, explanation: s.explanation, replacement: flag ? "" : s.replacement, flag }];
  });
}
