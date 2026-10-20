import "server-only";
import { db } from "@/lib/db";

import type { CastMember } from "./prompts";

export type { CastMember };

/** Characters whose pronouns the author has set (or that were found in the text). */
export async function castWithPronouns(manuscriptId: string): Promise<CastMember[]> {
  const rows = await db.character.findMany({
    where: { manuscriptId, pronouns: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { name: true, aliases: true, pronouns: true },
  });
  return rows
    .filter((r) => r.pronouns?.trim())
    .map((r) => ({ name: r.name, aliases: ((r.aliases as string[] | null) ?? []).slice(0, 5), pronouns: r.pronouns!.trim() }));
}

export { castBlock } from "./prompts";
