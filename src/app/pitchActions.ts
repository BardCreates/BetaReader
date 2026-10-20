"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { isLimitError, reserve, type Reservation } from "@/lib/billing/usage";
import { db } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { STALE_READ_MS } from "@/lib/reader/pipeline";
import { toJsonReservation } from "@/lib/jobs/handlers";
import { scheduleJob } from "@/lib/jobs/schedule";
import { release } from "@/lib/billing/usage";

/** Write (or rewrite) the pitch kit. Needs a finished read, since it's built from the reader's notes. */
export async function generatePitchKit(manuscriptId: string) {
  const user = await requireUser();
  if (!FEATURES.pitchKit) return;
  const ms = await db.manuscript.findFirst({
    where: { id: manuscriptId, userId: user.id },
    select: { id: true, report: { select: { status: true } }, pitchKit: { select: { status: true, updatedAt: true } } },
  });
  if (!ms || ms.report?.status !== "DONE") return;
  const kit = ms.pitchKit;
  const running = kit && (kit.status === "QUEUED" || kit.status === "READING") && Date.now() - kit.updatedAt.getTime() < STALE_READ_MS;
  if (running) return;
  let reservation: Reservation;
  try {
    reservation = await reserve(user.id, "pitchKits", 1);
  } catch (err) {
    if (!isLimitError(err)) throw err;
    redirect(`/manuscripts/${ms.id}/pitch?limit=1`);
  }
  try {
    await db.pitchKit.upsert({
      where: { manuscriptId: ms.id },
      update: { status: "READING", error: null },
      create: { manuscriptId: ms.id, status: "READING" },
    });
    await scheduleJob("pitch_kit", { manuscriptId: ms.id, reservation: toJsonReservation(reservation) });
  } catch (err) {
    await release(reservation).catch(() => {});
    throw err;
  }
  revalidatePath(`/manuscripts/${ms.id}/pitch`);
}
