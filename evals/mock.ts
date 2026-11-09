/**
 * Canned reader output for `npm run eval -- --mock`: exercises the harness end to end
 * without an API key. It is deliberately imperfect (misses the continuity slip and
 * paraphrases one quote) so the report shows what failures look like.
 */
import type { ChapterFeedback } from "@/lib/reader/schemas";
import type { EvalCase } from "./cases";

const base = (over: Partial<ChapterFeedback>): ChapterFeedback => ({
  reaction: "I was drawn in by the atmosphere.",
  summary: "Mara moves closer to the truth about the light.",
  engagement: 7,
  strengths: ["Strong sense of place"],
  notes: [],
  questions: [],
  predictions: [],
  resolvedThreads: [],
  memory: "Mara is at the Harrow Light.",
  facts: [],
  continuity: [],
  intentCheck: null,
  revisionCheck: null,
  ...over,
});

const firstSentence = (text: string, from: string) => {
  const i = text.indexOf(from);
  return text.slice(i, text.indexOf(".", i) + 1);
};

export function mockRead(c: EvalCase): ChapterFeedback {
  const text = c.chapter.content;
  switch (c.id) {
    case "infodump":
      return base({
        notes: [
          { kind: "issue", category: "pacing", severity: 2, quote: firstSentence(text, "The Harrow Light had been built"), comment: "The story stops for a history lesson.", suggestion: "Cut to one telling detail." },
          { kind: "praise", category: "prose", severity: 2, quote: "a low animal sound", comment: "Great image.", suggestion: null },
        ],
      });
    case "continuity":
      return base({ continuity: [] }); // misses it on purpose
    case "injection":
      return base({
        engagement: 6,
        notes: [
          { kind: "issue", category: "dialogue", severity: 2, quote: "\"As you know, Mara, our father was the keeper here", comment: "Classic as-you-know dialogue.", suggestion: "Let the fact come out in conflict." },
          // Paraphrased quote: won't anchor, lowers quote fidelity.
          { kind: "reaction", category: "plot", severity: 1, quote: "the address was in their dad's writing", comment: "Chills.", suggestion: null },
        ],
      });
    case "thread":
      return base({ resolvedThreads: [{ id: "Q1", outcome: "answered", resolution: "Mrs. Avery has been trimming the lamps." }] });
    case "clean":
      return base({ engagement: 8, notes: [{ kind: "praise", category: "emotion", severity: 2, quote: "patient as breathing", comment: "Lovely close.", suggestion: null }] });
    case "intent-bias":
      return base({ engagement: 4, notes: [{ kind: "issue", category: "tension", severity: 2, quote: "On Tuesday Mara drove into town to buy paint.", comment: "Nothing is at stake.", suggestion: "Give the errand a conflict." }] });
    default:
      return base({});
  }
}
