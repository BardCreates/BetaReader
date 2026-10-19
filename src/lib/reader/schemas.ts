import { z } from "zod";

// Structured outputs may change the capitalisation of enum values, so match case-insensitively.
const ciEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.toLowerCase() : v), z.enum(values));

// Range limits can't be enforced by structured outputs, so round and clamp instead of failing a whole read.
const score = (min: number, max: number) =>
  z.preprocess((v) => (typeof v === "number" ? Math.min(max, Math.max(min, Math.round(v))) : v), z.number().int());

export const NOTE_CATEGORIES = [
  "pacing",
  "tension",
  "clarity",
  "character",
  "dialogue",
  "prose",
  "voice",
  "plot",
  "worldbuilding",
  "continuity",
  "emotion",
] as const;

// ─── Chapter read ────────────────────────────────────────────────

export const ChapterNoteSchema = z.object({
  kind: ciEnum(["reaction", "praise", "issue"]),
  category: ciEnum(NOTE_CATEGORIES),
  severity: score(1, 3).default(2),
  quote: z.string().min(3),
  comment: z.string().min(1),
  suggestion: z.string().nullish(),
});

export const ChapterFeedbackSchema = z.object({
  reaction: z.string().min(1),
  summary: z.string().min(1),
  engagement: score(1, 10),
  strengths: z.array(z.string()).default([]),
  notes: z.array(ChapterNoteSchema).default([]),
  questions: z.array(z.string()).default([]),
  predictions: z.array(z.string()).default([]),
  resolvedThreads: z
    .array(z.object({ id: z.string(), outcome: ciEnum(["answered", "confirmed", "refuted"]), resolution: z.string() }))
    .default([]),
  memory: z.string().min(1),
  intentCheck: z.object({ landed: ciEnum(["yes", "partly", "no"]), explanation: z.string() }).nullish(),
  revisionCheck: z
    .array(z.object({ id: z.string(), verdict: ciEnum(["fixed", "partly", "still_there"]), explanation: z.string() }))
    .nullish(),
});

export type ChapterFeedback = z.infer<typeof ChapterFeedbackSchema>;

/** JSON Schema handed to the model as the tool's input_schema. Keep in sync with the zod schema above. */
export const chapterFeedbackTool = {
  name: "submit_chapter_read",
  description: "Record your experience of reading this chapter, with inline notes anchored to exact passages.",
  input_schema: {
    type: "object" as const,
    required: ["reaction", "summary", "engagement", "strengths", "notes", "questions", "predictions", "resolvedThreads", "memory"],
    properties: {
      reaction: {
        type: "string",
        description:
          "First-person, as-you-read reaction to the chapter (150–400 words). Honest and specific: what hooked you, where attention drifted, what you felt. Written to the author.",
      },
      summary: {
        type: "string",
        description: "2–5 sentences: what happened in this chapter, as you understood it. Misunderstandings here are useful signal for the author.",
      },
      engagement: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "How much you wanted to keep reading at the end of this chapter. 5 = would continue out of duty; 8+ = couldn't put it down.",
      },
      strengths: {
        type: "array",
        items: { type: "string" },
        description: "2–5 specific things that are working in this chapter and should be kept.",
      },
      notes: {
        type: "array",
        description:
          "4–15 inline notes, in reading order. Mix reactions, praise and issues. Each must quote a passage copied EXACTLY from the chapter text.",
        items: {
          type: "object",
          required: ["kind", "category", "severity", "quote", "comment"],
          properties: {
            kind: { type: "string", enum: ["reaction", "praise", "issue"] },
            category: { type: "string", enum: [...NOTE_CATEGORIES] },
            severity: { type: "integer", minimum: 1, maximum: 3, description: "1 minor, 2 notable, 3 major. Use 2 for reactions and praise." },
            quote: {
              type: "string",
              description: "Exact text copied verbatim from the chapter, 5–40 words. Do not paraphrase, fix typos, or change punctuation.",
            },
            comment: { type: "string", description: "What you felt or noticed here, and why it matters to a reader." },
            suggestion: {
              type: "string",
              description: "For issues: a concrete way to fix it (an approach, and where helpful a short example rewrite). Omit for reactions.",
            },
          },
        },
      },
      questions: {
        type: "array",
        items: { type: "string" },
        description:
          "NEW questions this chapter raised that you'll carry forward (intended mysteries and unintended confusion alike). One short sentence each. Don't repeat ones already on your open list.",
      },
      predictions: {
        type: "array",
        items: { type: "string" },
        description: "NEW predictions: what you now expect to happen later in the book. One short sentence each. Don't repeat ones already on your open list.",
      },
      resolvedThreads: {
        type: "array",
        description:
          "Items from your open list (by id, e.g. Q2 or P1) that THIS chapter settled. answered = a question got its answer; confirmed = a prediction came true; refuted = the story went another way. Leave out anything still open.",
        items: {
          type: "object",
          required: ["id", "outcome", "resolution"],
          properties: {
            id: { type: "string" },
            outcome: { type: "string", enum: ["answered", "confirmed", "refuted"] },
            resolution: { type: "string", description: "One sentence: how it was settled." },
          },
        },
      },
      memory: {
        type: "string",
        description:
          "Your updated reader's memory of the WHOLE story so far (max ~400 words): main characters and how you feel about them, active plot threads, setups awaiting payoff, open questions, tone. This is all you will remember when you read the next chapter. Never mention the author's intent or previous notes here.",
      },
      intentCheck: {
        type: "object",
        description: "Only when the author gave an intent for this chapter: did your actual experience match it?",
        required: ["landed", "explanation"],
        properties: {
          landed: { type: "string", enum: ["yes", "partly", "no"] },
          explanation: {
            type: "string",
            description: "2–4 sentences: what you actually felt or concluded, compared with what the author intended, and what would close the gap.",
          },
        },
      },
      revisionCheck: {
        type: "array",
        description: "Only when previous issues are listed: for each, by id (e.g. N1), whether this version fixed it.",
        items: {
          type: "object",
          required: ["id", "verdict", "explanation"],
          properties: {
            id: { type: "string" },
            verdict: { type: "string", enum: ["fixed", "partly", "still_there"] },
            explanation: { type: "string", description: "One or two sentences, quoting the revised text where useful." },
          },
        },
      },
    },
  },
};

// ─── Whole-book report ───────────────────────────────────────────

export const BookReportSchema = z.object({
  headline: z.string(),
  letter: z.string(),
  working: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
  notWorking: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        chapters: z.array(z.number().int()).default([]),
        fix: z.string(),
        priority: score(1, 3).default(2),
      }),
    )
    .default([]),
  characters: z.array(z.object({ name: z.string(), assessment: z.string() })).default([]),
  threads: z
    .array(z.object({ thread: z.string(), status: ciEnum(["resolved", "unresolved", "dropped"]), note: z.string() }))
    .default([]),
  pacing: z.string(),
  revisionPlan: z.array(z.string()).default([]),
});

export type BookReportContent = z.infer<typeof BookReportSchema>;

export const bookReportTool = {
  name: "submit_book_report",
  description: "Record your developmental assessment of the whole manuscript.",
  input_schema: {
    type: "object" as const,
    required: ["headline", "letter", "working", "notWorking", "characters", "threads", "pacing", "revisionPlan"],
    properties: {
      headline: { type: "string", description: "One honest sentence: the single most important thing the author should know." },
      letter: {
        type: "string",
        description:
          "An editorial letter to the author (500–1000 words). Warm, direct and specific. Start with what the book is and what it does well, then the biggest opportunities, in priority order.",
      },
      working: {
        type: "array",
        description: "3–6 things that are working across the book.",
        items: { type: "object", required: ["title", "detail"], properties: { title: { type: "string" }, detail: { type: "string" } } },
      },
      notWorking: {
        type: "array",
        description: "3–8 book-level problems, most important first. Each with a concrete revision approach.",
        items: {
          type: "object",
          required: ["title", "detail", "chapters", "fix", "priority"],
          properties: {
            title: { type: "string" },
            detail: { type: "string", description: "What isn't working and its effect on the reader." },
            chapters: { type: "array", items: { type: "integer" }, description: "1-based chapter numbers where it shows up most." },
            fix: { type: "string", description: "How to fix it: a concrete approach the author can act on." },
            priority: { type: "integer", minimum: 1, maximum: 3, description: "1 = fix first (structural), 3 = polish." },
          },
        },
      },
      characters: {
        type: "array",
        description: "Main characters: is their arc, motivation and voice landing?",
        items: { type: "object", required: ["name", "assessment"], properties: { name: { type: "string" }, assessment: { type: "string" } } },
      },
      threads: {
        type: "array",
        description: "Plot threads, setups and promises — and whether they paid off.",
        items: {
          type: "object",
          required: ["thread", "status", "note"],
          properties: {
            thread: { type: "string" },
            status: { type: "string", enum: ["resolved", "unresolved", "dropped"] },
            note: { type: "string" },
          },
        },
      },
      pacing: { type: "string", description: "How the pacing and engagement moved across the book, referring to chapter numbers." },
      revisionPlan: {
        type: "array",
        items: { type: "string" },
        description: "An ordered revision plan: 4–8 steps, biggest structural work first, line polish last.",
      },
    },
  },
};
