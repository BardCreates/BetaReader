"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { discoverCharacters } from "@/lib/reader/characters";

export type CharacterFormState = { error?: string; message?: string } | undefined;

async function ownedManuscript(manuscriptId: unknown, userId: string) {
  if (!FEATURES.characterChat || typeof manuscriptId !== "string") return null;
  return db.manuscript.findFirst({ where: { id: manuscriptId, userId }, select: { id: true } });
}

async function ownedCharacter(characterId: unknown, userId: string) {
  if (!FEATURES.characterChat || typeof characterId !== "string") return null;
  return db.character.findFirst({ where: { id: characterId, manuscript: { userId } }, select: { id: true, manuscriptId: true, notes: true } });
}

export async function findCharacters(manuscriptId: string): Promise<CharacterFormState> {
  const user = await requireUser();
  const ms = await ownedManuscript(manuscriptId, user.id);
  if (!ms) return { error: "Manuscript not found." };
  try {
    const { added } = await discoverCharacters(ms.id);
    revalidatePath(`/manuscripts/${ms.id}/characters`);
    return { message: added ? `Found ${added} new character${added === 1 ? "" : "s"}.` : "No new characters found." };
  } catch (err) {
    console.error("character discovery failed", err);
    return { error: "Couldn't read the manuscript for characters. Please try again." };
  }
}

export async function addCharacter(manuscriptId: string, _prev: CharacterFormState, form: FormData): Promise<CharacterFormState> {
  const user = await requireUser();
  const ms = await ownedManuscript(manuscriptId, user.id);
  if (!ms) return { error: "Manuscript not found." };
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!name) return { error: "Give the character a name." };
  const c = await db.character.create({ data: { manuscriptId: ms.id, name } });
  redirect(`/manuscripts/${ms.id}/characters/${c.id}`);
}

export async function updateCharacter(
  characterId: string,
  fields: { notes?: string; summary?: string; role?: string; aliases?: string },
): Promise<CharacterFormState> {
  const user = await requireUser();
  const c = await ownedCharacter(characterId, user.id);
  if (!c) return { error: "Character not found." };
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  await db.character.update({
    where: { id: c.id },
    data: {
      notes: clip(fields.notes, 50_000),
      summary: clip(fields.summary, 5_000),
      role: clip(fields.role, 100),
      aliases:
        typeof fields.aliases === "string"
          ? fields.aliases
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean)
              .slice(0, 20)
          : undefined,
    },
  });
  revalidatePath(`/manuscripts/${c.manuscriptId}/characters`);
  return { message: "Saved." };
}

/** "Save to notes": append something from a chat to the character's notes. */
export async function appendCharacterNote(characterId: string, text: string): Promise<CharacterFormState> {
  const user = await requireUser();
  const c = await ownedCharacter(characterId, user.id);
  if (!c || typeof text !== "string" || !text.trim()) return { error: "Nothing to save." };
  // Saving a reply adopts it as canon, so the "invented" markers are dropped.
  const entry = text.replace(/[⟦⟧]/g, "").trim().slice(0, 10_000);
  const notes = c.notes?.trim() ? `${c.notes.trim()}\n\n${entry}` : entry;
  await db.character.update({ where: { id: c.id }, data: { notes } });
  revalidatePath(`/manuscripts/${c.manuscriptId}/characters/${c.id}`);
  return { message: "Saved to notes." };
}

export async function deleteCharacter(characterId: string) {
  const user = await requireUser();
  const c = await ownedCharacter(characterId, user.id);
  if (!c) return;
  await db.character.delete({ where: { id: c.id } });
  revalidatePath(`/manuscripts/${c.manuscriptId}`, "layout");
  redirect(`/manuscripts/${c.manuscriptId}/characters`);
}
