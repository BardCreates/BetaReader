/**
 * Guided ways to interview a character. Each is editorial research: finding what the
 * manuscript hasn't settled about someone, not writing new scenes. Safe to import from
 * client and server code.
 */

export type InterviewMode = "open" | "motivation" | "backstory" | "limits" | "canon";

type ModeInfo = {
  label: string;
  blurb: string;
  /** Added to the character's system prompt. */
  prompt: string;
  starters: (first: string) => string[];
};

const GAPS = `After your in-character answer, add one final line in italics that starts "_Gaps:_" and lists, briefly, anything the author asked about that the manuscript doesn't establish (so they can decide it). Leave the line out if there were none.`;

export const INTERVIEW_MODES: Record<InterviewMode, ModeInfo> = {
  open: {
    label: "Open conversation",
    blurb: "Talk about anything. Invented details are highlighted.",
    prompt: "",
    starters: (first) => [
      "What do you want more than anything?",
      "What are you afraid the others will find out?",
      "Tell me about the day before the story starts.",
      `OOC: Where does ${first}'s arc feel thin?`,
    ],
  },
  motivation: {
    label: "Interrogate a motivation",
    blurb: "Push on why they do what they do, until the reasons hold or crack.",
    prompt: `Interview focus: the author is interrogating your motivations. When they ask why you did something, give your real reason as you understand it, grounded in what happened on the page, and quote or point to the moment. If your reasons don't quite add up, or the page never makes them clear, don't paper over it: say what you're unsure of, as {name} would. Expect follow-up "but why?" questions and answer each one a layer deeper. ${GAPS}`,
    starters: () => [
      "Why did you really make that choice?",
      "What would you lose if you'd done nothing?",
      "Who are you doing this for, honestly?",
      "What do you tell yourself so you can keep going?",
    ],
  },
  backstory: {
    label: "Stress-test the backstory",
    blurb: "Check the history behind them against what the book actually says.",
    prompt: `Interview focus: the author is stress-testing your backstory. Answer questions about your past, but keep clear what the manuscript establishes and what it doesn't: anything not on the page must be wrapped in ⟦ ⟧ as usual. If the author's question assumes something that conflicts with the manuscript or the profile, say so and point to the passage. If two things you've said or the book says don't fit together, notice it. ${GAPS}`,
    starters: () => [
      "Walk me through where you grew up.",
      "Who taught you to be the way you are?",
      "What happened the first time you failed?",
      "Is there anything about your past that doesn't add up?",
    ],
  },
  limits: {
    label: "What they'd never do",
    blurb: "Find their lines: what they'd refuse, and what it would take to cross one.",
    prompt: `Interview focus: the author is finding your limits. When asked whether you would do something, answer as yourself: would you, wouldn't you, and why. Be specific about the line and what it would take to push you over it. Ground it in who you've been on the page; if the manuscript gives no evidence either way, say that plainly instead of deciding firmly. ${GAPS}`,
    starters: (first) => [
      "What would you never do, even to win?",
      "Who would you betray, if you had to?",
      "What would make you walk away from all of it?",
      `OOC: Does ${first} ever act against these lines in the book?`,
    ],
  },
  canon: {
    label: "Canon only",
    blurb: "Answers only from the manuscript. Gaps are named, never filled.",
    prompt: `Interview focus: canon only. This overrides the inventing rule above: do NOT invent anything. Answer only from the manuscript passages, the profile and the author's notes. Stay in your voice, but when asked about something they don't establish, say plainly that it isn't on the page (for example "That's not something the story has told yet.") and don't guess. Never use ⟦ ⟧ in this mode, because nothing you say should be invented. ${GAPS}`,
    starters: () => [
      "What do we actually know about your family?",
      "What does the story say you want?",
      "What's never been explained about you?",
      "What have you told other people about yourself?",
    ],
  },
};

export const MODE_IDS = Object.keys(INTERVIEW_MODES) as InterviewMode[];

export function modeFor(mode: string | null | undefined): InterviewMode {
  return mode && mode in INTERVIEW_MODES ? (mode as InterviewMode) : "open";
}

/** The mode's prompt, with the character's name filled in. Empty for open conversation. */
export function interviewPrompt(mode: string | null | undefined, name: string): string {
  return INTERVIEW_MODES[modeFor(mode)].prompt.replaceAll("{name}", name);
}
