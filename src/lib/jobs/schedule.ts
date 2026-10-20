import "server-only";
import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { JOB_HANDLERS } from "./handlers";
import { drain, enqueue, type JobKind } from "./queue";

/**
 * Where jobs run:
 *  - "inline" (default): the web server runs them itself, right after the response and from a
 *    background poller (see src/instrumentation.ts). Fine for one long-running server.
 *  - "worker": a separate process runs `npm run worker`; the web server only queues jobs.
 *    Use this in production (Azure: a second container app from the same image).
 */
export const jobsMode = () => (process.env.JOBS_MODE === "worker" ? "worker" : "inline");

/** Queue a job and, in inline mode, start on it as soon as the response has been sent. */
export async function scheduleJob(kind: JobKind, payload: Prisma.InputJsonValue) {
  const job = await enqueue(kind, payload);
  if (jobsMode() === "inline") after(() => drain(JOB_HANDLERS, 1).catch((e) => console.error("jobs", e)));
  return job;
}
