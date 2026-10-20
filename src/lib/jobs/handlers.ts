import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Reservation } from "@/lib/billing/usage";
import { readManuscript, rereadChapter } from "@/lib/reader/pipeline";
import { writePitchKit } from "@/lib/reader/pitch";
import { runTrialRead } from "@/lib/trialRead";
import { JOB_STALE_MS, type Handler, type JobKind } from "./queue";

/** Reservations travel through the queue as JSON, so their date comes back as a string. */
const ReservationJson = z
  .object({
    userId: z.string(),
    metric: z.enum(["words", "grammarWords", "chat", "pitchKits"]),
    fromPlan: z.number(),
    fromPass: z.number(),
    periodStart: z.coerce.date(),
  })
  .nullable();

export const toJsonReservation = (r: Reservation | null) => (r ? { ...r, periodStart: r.periodStart.toISOString() } : null);

export const JOB_HANDLERS: Record<JobKind, Handler> = {
  async read_manuscript(p, job) {
    const { manuscriptId, rereadChanged } = z.object({ manuscriptId: z.string(), rereadChanged: z.boolean().optional() }).parse(p);
    // Never two readers on one book: if another job is already reading it, leave it to that one.
    const stale = new Date(Date.now() - JOB_STALE_MS);
    const busy = await db.$queryRaw<unknown[]>`
      SELECT 1 FROM "Job" WHERE kind = 'read_manuscript' AND status = 'running' AND id <> ${job.id}
        AND payload->>'manuscriptId' = ${manuscriptId} AND "lockedAt" > ${stale} LIMIT 1`;
    if (busy.length) return;
    await readManuscript(manuscriptId, { rereadChanged });
  },
  async reread_chapter(p) {
    const { chapterId, reservation } = z.object({ chapterId: z.string(), reservation: ReservationJson }).parse(p);
    await rereadChapter(chapterId, reservation);
  },
  async pitch_kit(p) {
    const { manuscriptId, reservation } = z.object({ manuscriptId: z.string(), reservation: ReservationJson }).parse(p);
    await writePitchKit(manuscriptId, reservation);
  },
  async trial_read(p) {
    const { trialId } = z.object({ trialId: z.string() }).parse(p);
    await runTrialRead(trialId);
  },
};
