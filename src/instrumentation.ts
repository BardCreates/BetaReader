/**
 * Runs once when the server starts. In inline jobs mode (the default), the web server polls
 * the job queue itself, so queued reads resume after a restart without a separate worker.
 * With JOBS_MODE=worker this does nothing: `npm run worker` does the work.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.JOBS_MODE === "worker" || process.env.NEXT_PHASE === "phase-production-build") return;
  const g = globalThis as { __readthroughJobs?: boolean };
  if (g.__readthroughJobs) return; // dev hot reloads
  g.__readthroughJobs = true;
  const { runJobsLoop } = await import("@/lib/jobs/runner");
  void runJobsLoop({ concurrency: 1, pollMs: 5000 });
}
