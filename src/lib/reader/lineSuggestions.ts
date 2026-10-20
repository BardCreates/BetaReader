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

/** Number the suggestions, drop no-op fixes, and strip any rewrite the model offered on a flag. */
export function toSuggestions(raw: { quote: string; replacement: string; type: SuggestionType; explanation: string }[]): LineSuggestion[] {
  let n = 0;
  return raw.flatMap((s) => {
    const flag = !isMechanical(s.type);
    if (!flag && s.quote === s.replacement) return [];
    return [{ id: `s${++n}`, quote: s.quote, type: s.type, explanation: s.explanation, replacement: flag ? "" : s.replacement, flag }];
  });
}
