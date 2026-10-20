import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * A small durable job queue in Postgres. Work is written to the Job table, then claimed by a
 * worker with FOR UPDATE SKIP LOCKED, so any number of workers (or the web process itself, in
 * inline mode) can share it safely. A running job's heartbeat is refreshed every few seconds;
 * if its worker dies, the job is picked up again after JOB_STALE_MS. Every job kind must be
 * safe to run twice: the reader pipeline resumes chapter by chapter.
 */

export const JOB_KINDS = ["read_manuscript", "reread_chapter", "pitch_kit", "trial_read"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export type JobRow = { id: string; kind: JobKind; payload: unknown; attempts: number };

/** A running job whose heartbeat is older than this is presumed dead and retried. */
export const JOB_STALE_MS = 5 * 60 * 1000;
export const HEARTBEAT_MS = 30 * 1000;
export const MAX_ATTEMPTS = 3;

export const workerId = `${process.env.HOSTNAME ?? "local"}:${process.pid}:${randomUUID().slice(0, 8)}`;

export async function enqueue(kind: JobKind, payload: Prisma.InputJsonValue, opts: { runAt?: Date } = {}) {
  return db.job.create({ data: { kind, payload, runAt: opts.runAt ?? new Date() }, select: { id: true } });
}

/**
 * Claim the next job that's due: a queued one, or a running one whose worker stopped
 * heartbeating. Returns null when there's nothing to do.
 */
export async function claimNext(): Promise<JobRow | null> {
  const stale = new Date(Date.now() - JOB_STALE_MS);
  const rows = await db.$queryRaw<JobRow[]>`
    UPDATE "Job" SET status = 'running', "lockedAt" = now(), "lockedBy" = ${workerId},
      attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE (status = 'queued' AND "runAt" <= now())
         OR (status = 'running' AND "lockedAt" < ${stale})
      ORDER BY "runAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, kind, payload, attempts`;
  return rows[0] ?? null;
}

async function heartbeat(id: string) {
  await db.job.updateMany({ where: { id, lockedBy: workerId, status: "running" }, data: { lockedAt: new Date() } });
}

async function finish(id: string, error: string | null, attempts: number) {
  if (!error) {
    await db.job.updateMany({ where: { id, lockedBy: workerId }, data: { status: "done", lockedAt: null, error: null } });
    return;
  }
  const retry = attempts < MAX_ATTEMPTS;
  await db.job.updateMany({
    where: { id, lockedBy: workerId },
    data: retry
      ? { status: "queued", lockedAt: null, lockedBy: null, error, runAt: new Date(Date.now() + 30_000 * attempts) }
      : { status: "failed", lockedAt: null, error },
  });
}

export type Handler = (payload: unknown, job: JobRow) => Promise<void>;

/** Run one claimed job with a heartbeat, recording the outcome. */
export async function runJob(job: JobRow, handlers: Record<JobKind, Handler>) {
  const timer = setInterval(() => heartbeat(job.id).catch(() => {}), HEARTBEAT_MS);
  let error: string | null = null;
  try {
    const handler = handlers[job.kind];
    if (!handler) throw new Error(`Unknown job kind: ${job.kind}`);
    await handler(job.payload, job);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error(`job ${job.kind} ${job.id} failed (attempt ${job.attempts})`, err);
  } finally {
    clearInterval(timer);
  }
  await finish(job.id, error, job.attempts).catch((e) => console.error("job finish", e));
}

/** Work through due jobs, up to `concurrency` at a time, until none are left. */
export async function drain(handlers: Record<JobKind, Handler>, concurrency = 1, shouldStop: () => boolean = () => false) {
  let ran = 0;
  const lane = async () => {
    while (!shouldStop()) {
      const job = await claimNext();
      if (!job) return;
      await runJob(job, handlers);
      ran++;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, lane));
  return ran;
}

/** Finished jobs are only useful for a while; failed ones are kept longer for debugging. */
export async function pruneJobs() {
  const day = 24 * 60 * 60 * 1000;
  await db.job.deleteMany({
    where: {
      OR: [
        { status: "done", updatedAt: { lt: new Date(Date.now() - 2 * day) } },
        { status: "failed", updatedAt: { lt: new Date(Date.now() - 30 * day) } },
      ],
    },
  });
}
