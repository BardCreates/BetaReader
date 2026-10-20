/** Free sample reads without an account. See src/lib/trialRead.ts for the read itself. */

/** How long a sample read is kept before it's deleted. */
export const TRIAL_RETENTION_DAYS = 7;

/** A sample read is one chapter: long enough to judge, short enough to be cheap. */
export const TRIAL_MIN_WORDS = 300;
export const TRIAL_MAX_WORDS = 6_000;

/** Sample reads per visitor (by network address) per 24 hours. */
export const TRIAL_PER_VISITOR = 2;
