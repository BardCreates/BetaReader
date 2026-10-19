/**
 * Feature switches. Safe to import from both server and client components.
 *
 * editorChat — talk through the feedback with an AI editor. Held back for v2 so v1 stays
 * focused on the read itself. The code (editor page, chat API, EditorChat) is intact;
 * set this to true to bring it back.
 */
export const FEATURES = {
  editorChat: false,
  /** Chat in-voice with characters from the manuscript, for brainstorming. */
  characterChat: true,
} as const;
