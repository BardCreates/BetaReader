"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { isLimitError } from "@/lib/billing/usage";
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
    if (isLimitError(err)) return { error: err.message };
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

export type CharacterFields = {
  notes?: string;
  summary?: string;
  role?: string;
  aliases?: string;
  pronouns?: string;
  age?: string;
  appearance?: string;
  personality?: string;
  wants?: string;
  fears?: string;
  backstory?: string;
  voice?: string;
};

export async function updateCharacter(characterId: string, fields: CharacterFields): Promise<CharacterFormState> {
  const user = await requireUser();
  const c = await ownedCharacter(characterId, user.id);
  if (!c) return { error: "Character not found." };
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  // Short fields: trimmed, and blank means "not set".
  const short = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) || null : undefined);
  await db.character.update({
    where: { id: c.id },
    data: {
      notes: clip(fields.notes, 50_000),
      summary: clip(fields.summary, 5_000),
      role: clip(fields.role, 100),
      pronouns: short(fields.pronouns, 40),
      age: short(fields.age, 60),
      appearance: clip(fields.appearance, 5_000),
      personality: clip(fields.personality, 5_000),
      wants: clip(fields.wants, 5_000),
      fears: clip(fields.fears, 5_000),
      backstory: clip(fields.backstory, 20_000),
      voice: clip(fields.voice, 5_000),
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

// ─── Pictures ────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 1_500_000; // the browser resizes to 512px first, so real uploads are far smaller

/** Identify the image from its first bytes; anything else (SVG, HTML, …) is refused. */
function sniffImage(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function uploadCharacterImage(characterId: string, form: FormData): Promise<CharacterFormState> {
  const user = await requireUser();
  const c = await ownedCharacter(characterId, user.id);
  if (!c) return { error: "Character not found." };
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a picture to upload." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "That picture is too large. Try a smaller one." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return { error: "Upload a JPEG, PNG or WebP picture." };
  const now = new Date();
  await db.$transaction([
    db.characterImage.upsert({
      where: { characterId: c.id },
      update: { data: bytes, type },
      create: { characterId: c.id, data: bytes, type },
    }),
    db.character.update({ where: { id: c.id }, data: { imageUpdatedAt: now } }),
  ]);
  revalidatePath(`/manuscripts/${c.manuscriptId}/characters`, "layout");
  return { message: "Picture saved." };
}

export async function removeCharacterImage(characterId: string): Promise<CharacterFormState> {
  const user = await requireUser();
  const c = await ownedCharacter(characterId, user.id);
  if (!c) return { error: "Character not found." };
  await db.$transaction([
    db.characterImage.deleteMany({ where: { characterId: c.id } }),
    db.character.update({ where: { id: c.id }, data: { imageUpdatedAt: null } }),
  ]);
  revalidatePath(`/manuscripts/${c.manuscriptId}/characters`, "layout");
  return { message: "Picture removed." };
}
