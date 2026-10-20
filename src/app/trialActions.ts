"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { LOCK_TRIAL_CREATE } from "@/lib/billing/usage";
import { scheduleJob } from "@/lib/jobs/schedule";
import { canonicalText } from "@/lib/manuscript/match";
import { importFile } from "@/lib/manuscript/import";
import { countWords } from "@/lib/manuscript/split";
import { TRIAL_MAX_WORDS, TRIAL_MIN_WORDS } from "@/lib/trial";
import { hashVisitor, trialRefusal } from "@/lib/trialRead";

export type TrialFormState = { error?: string } | undefined;

const Form = z.object({
  title: z.string().trim().max(200).optional(),
  genre: z.string().trim().max(100).optional(),
  midBook: z.boolean(),
  text: z.string().max(200_000).optional(),
});

/** The visitor's address as the hosting proxy reports it (Azure and most hosts set X-Forwarded-For). */
async function visitorAddress() {
  const h = await headers();
  // The right-most entry is the one our own proxy added; anything to its left came from the
  // client and can be made up, so it's never used for limits.
  const forwarded = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return forwarded?.at(-1) || h.get("x-real-ip") || "unknown";
}

/** Optional bot check: on when TURNSTILE_SECRET_KEY is set (Cloudflare Turnstile). */
async function passesBotCheck(token: FormDataEntryValue | null, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

export async function startTrialRead(_prev: TrialFormState, form: FormData): Promise<TrialFormState> {
  const parsed = Form.safeParse({
    title: form.get("title") || undefined,
    genre: form.get("genre") || undefined,
    midBook: form.get("midBook") === "on",
    text: form.get("text") || undefined,
  });
  if (!parsed.success) return { error: "Check the form and try again." };

  let text = parsed.data.text ?? "";
  let title = parsed.data.title;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    try {
      const imported = await importFile(file);
      // A whole manuscript was uploaded: take its first real chapter.
      const first = imported.chapters.find((c) => c.wordCount >= TRIAL_MIN_WORDS) ?? imported.chapters[0];
      if (!first) return { error: "That file looks empty." };
      text = first.content;
      title ||= first.title;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Couldn’t read that file." };
    }
  }
  const content = canonicalText(text);
  const words = countWords(content);
  if (words < TRIAL_MIN_WORDS) return { error: `Paste a chapter of at least ${TRIAL_MIN_WORDS} words so the reader has something to go on.` };
  if (words > TRIAL_MAX_WORDS) {
    return { error: `That’s ${words.toLocaleString()} words. A free sample is one chapter, up to ${TRIAL_MAX_WORDS.toLocaleString()} words. Sign up free to read more.` };
  }

  const ip = await visitorAddress();
  if (!(await passesBotCheck(form.get("cf-turnstile-response"), ip))) return { error: "Please complete the check and try again." };
  const ipHash = hashVisitor(ip);
  // Check the limits and record the read together, one visitor at a time, so a burst of
  // submissions can't slip past them.
  const outcome = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_TRIAL_CREATE})`;
    const refusal = await trialRefusal(ipHash, tx);
    if (refusal) return { error: refusal } as const;
    return tx.trialRead.create({
      data: { ipHash, title: title || null, genre: parsed.data.genre || null, midBook: parsed.data.midBook, content, wordCount: words },
      select: { id: true },
    });
  });
  if ("error" in outcome) return { error: outcome.error };
  const trial = outcome;
  await scheduleJob("trial_read", { trialId: trial.id });
  redirect(`/try/${trial.id}`);
}
