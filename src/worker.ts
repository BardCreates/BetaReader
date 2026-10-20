/**
 * Background worker: runs queued reads (and other long AI work) outside the web server.
 *
 *   npm run worker
 *
 * Run one or more alongside the web app with JOBS_MODE=worker set on both. Jobs survive
 * restarts: a job whose worker dies is picked up again after a few minutes, and reads resume
 * from the chapter they stopped at.
 */
import "dotenv/config";
import { runJobsLoop } from "@/lib/jobs/runner";
import { workerId } from "@/lib/jobs/queue";
import { db } from "@/lib/db";

let stopping = false;
const concurrency = Math.max(1, Number(process.env.JOBS_CONCURRENCY ?? 2) || 2);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    stopping = true;
    // Finish the jobs in hand; anything cut off is retried by another worker later.
    console.log(`worker: ${signal}, finishing current jobs…`);
    setTimeout(() => process.exit(0), Number(process.env.JOBS_SHUTDOWN_GRACE_MS ?? 25_000)).unref();
  });
}

console.log(`worker ${workerId}: running ${concurrency} at a time`);
await runJobsLoop({ concurrency, log: true, shouldStop: () => stopping });
await db.$disconnect().catch(() => {});
process.exit(0);
