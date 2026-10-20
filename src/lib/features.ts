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
  /**
   * Pitch kit (logline, blurb, synopsis, query letter). Deferred past v1: it's the one
   * feature that writes prose, and v1 is "reads, never writes". Code is intact; set to true
   * to bring it back.
   */
  pitchKit: false,
} as const;
