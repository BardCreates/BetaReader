/**
 * Feature switches. Safe to import from both server and client components.
 *
 * v1 is focused on the loop read → continuity ledger → re-import → draft changes, and on one
 * promise: the AI reads, it never writes the author's book. Features that don't fit are held
 * back here with their code intact; set a switch to true to bring one back.
 */
export const FEATURES = {
  /** Free-form chat with an AI editor about the whole book. Held back for v2. */
  editorChat: false,
  /** Interview characters from the manuscript, in their voice, to find the gaps. */
  characterChat: true,
  /** Ask the reader about one of its notes ("why did you flag this?"), anchored to that note. */
  noteChat: true,
  /**
   * Logline, blurb, synopsis and query letter. Deferred: it writes prose for the author, which
   * cuts against "reads, never writes", and nobody picks a beta reader for it.
   */
  pitchKit: false,
} as const;
