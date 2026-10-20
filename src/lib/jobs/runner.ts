import "server-only";
import { JOB_HANDLERS } from "./handlers";
import { drain, pruneJobs } from "./queue";
import { pruneTrials } from "@/lib/trialRead";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll for jobs until `shouldStop` says so. Used by the worker process and, in inline mode,
 * by the web server. Housekeeping (old jobs, expired sample reads) runs every hour.
 */
export async function runJobsLoop(opts: { concurrency: number; pollMs?: number; shouldStop?: () => boolean; log?: boolean }) {
  const stop = opts.shouldStop ?? (() => false);
  let lastHousekeeping = 0;
  while (!stop()) {
    try {
      if (Date.now() - lastHousekeeping > 60 * 60 * 1000) {
        lastHousekeeping = Date.now();
        await Promise.all([pruneJobs(), pruneTrials()]);
      }
      const ran = await drain(JOB_HANDLERS, opts.concurrency, stop);
      if (ran && opts.log) console.log(`jobs: ran ${ran}`);
    } catch (err) {
      console.error("jobs loop", err);
    }
    await sleep(opts.pollMs ?? 3000);
  }
}
