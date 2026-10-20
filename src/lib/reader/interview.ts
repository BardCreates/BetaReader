/**
 * Interview modes for talking with a character. Character chat is editorial research: the
 * author interviews their cast to find gaps in motivation and backstory, not to co-write
 * scenes. Safe to import from client components (labels and starters) and the server (prompts).
 */
export const INTERVIEW_MODES = {
  open: {
    label: "Open interview",
    hint: "Ask anything.",
    starters: (first: string) => [
      "What do you want more than anything?",
      "What are you afraid the others will find out?",
      "Tell me about the day before the story starts.",
      `OOC: Where does ${first}'s arc feel thin?`,
    ],
    prompt: "",
  },
  motivation: {
    label: "Interrogate a motivation",
    hint: "Pick a choice they make and push on why.",
    starters: () => ["Why did you really do it?", "What did you tell yourself at the time?", "What would have made you choose differently?"],
    prompt: `Interview mode: interrogating a motivation. The author will pick a choice you make in the book and push on why. Answer honestly as yourself, including the reasons you'd rather not admit. When the page gives your reason, stay true to it; when it doesn't, say you've never said why, then offer what you think, marked as invented.`,
  },
  backstory: {
    label: "Stress-test a backstory",
    hint: "Find where the past doesn't add up.",
    starters: () => ["Walk me through where you grew up.", "Who taught you that?", "When did you last see your family?"],
    prompt: `Interview mode: stress-testing a backstory. The author is looking for holes in your past. Answer from what the page establishes first. If a question exposes a gap or a contradiction between what you've said and what the page says, notice it out loud in character ("That doesn't square with…"), because finding those is the point.`,
  },
  never: {
    label: "What they’d never do",
    hint: "Find the lines they won't cross.",
    starters: () => ["What would you never do, even to save yourself?", "Who would you never forgive?", "What would make you break that rule?"],
    prompt: `Interview mode: the lines you won't cross. The author wants to know what you would never do and why, and what it would take to make you do it anyway. Be specific and consistent with how you act on the page.`,
  },
} as const;

export type InterviewMode = keyof typeof INTERVIEW_MODES;

export const isInterviewMode = (v: unknown): v is InterviewMode => typeof v === "string" && Object.hasOwn(INTERVIEW_MODES, v);

export function interviewMode(v: unknown): (typeof INTERVIEW_MODES)[InterviewMode] {
  return INTERVIEW_MODES[isInterviewMode(v) ? v : "open"];
}

/**
 * Story-bible facts about one character: the ones whose subject is their full name, an alias, or
 * their first name ("Mara" for "Mara Holt"). Whole-subject, case-insensitive matches only.
 */
export function factsAbout<T extends { subject: string }>(facts: T[], name: string, aliases: string[]): T[] {
  const names = new Set([name, ...aliases].map((n) => n.trim().toLowerCase()).filter(Boolean));
  const first = name.trim().split(/\s+/)[0]?.toLowerCase();
  return facts.filter((f) => {
    const s = f.subject.trim().toLowerCase();
    return names.has(s) || (first && first.length > 2 && s === first);
  });
}
