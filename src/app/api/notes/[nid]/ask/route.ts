import { APIUserAbortError } from "@anthropic-ai/sdk";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { streamUsageTracker } from "@/lib/billing/streamUsage";
import { estimateMicros, holdCost, isLimitError, release, reserve, settleCost, type Reservation } from "@/lib/billing/usage";
import { db } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { MODEL, anthropic } from "@/lib/reader/anthropic";
import { noteDiscussionSystem, ownedNote } from "@/lib/reader/discuss";

export const maxDuration = 120;

const Body = z.object({ message: z.string().trim().min(1).max(8_000) });

/** The conversation so far about this note (one per note). */
export async function GET(_req: Request, { params }: { params: Promise<{ nid: string }> }) {
  if (!FEATURES.noteChat) return new Response("Not found", { status: 404 });
  const userId = await currentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { nid } = await params;
  const note = await db.note.findFirst({ where: { id: nid, review: { chapter: { manuscript: { userId } } } }, select: { id: true } });
  if (!note) return new Response("Not found", { status: 404 });
  const conversation = await db.conversation.findFirst({ where: { noteId: note.id }, select: { id: true } });
  const messages = conversation
    ? await db.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true } })
    : [];
  return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}

/** Ask the reader about one of its notes. Streams the reply as plain text. */
export async function POST(req: Request, { params }: { params: Promise<{ nid: string }> }) {
  if (!FEATURES.noteChat) return new Response("Not found", { status: 404 });
  const userId = await currentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { nid } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { message } = parsed.data;

  const note = await ownedNote(nid, userId);
  if (!note) return new Response("Not found", { status: 404 });
  const manuscriptId = note.review.chapter.manuscript.id;

  // One message from the allowance; refused with the reason if it's used up.
  let reservation: Reservation | null;
  try {
    reservation = await reserve(userId, "chat", 1);
  } catch (err) {
    if (isLimitError(err)) return new Response(err.message, { status: 429 });
    throw err;
  }

  // Everything up to the start of the reply: if any of it fails, give the message back.
  let prepared;
  try {
    prepared = await (async () => {
      const conversation =
        (await db.conversation.findFirst({ where: { noteId: note.id } })) ??
        (await db.conversation.create({
          data: { manuscriptId, chapterId: note.review.chapter.id, noteId: note.id, title: message.slice(0, 80) },
        }));

      // Most recent 30 messages, oldest first, starting on a user turn.
      const history = (await db.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 30 })).reverse();
      while (history[0]?.role === "assistant") history.shift();
      await db.message.create({ data: { conversationId: conversation.id, role: "user", content: message } });

      const system = await noteDiscussionSystem(note);
      const hold = await holdCost(userId, estimateMicros(MODEL, system.length + message.length + history.reduce((n, m) => n + m.content.length, 0), 2048));
      const stream = anthropic().messages.stream({
        model: MODEL,
        max_tokens: 2048,
        // The chapter and note are the same every turn, so cache them.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })), { role: "user" as const, content: message }],
      });
      return { conversationId: conversation.id, stream, hold };
    })();
  } catch (err) {
    await release(reservation).catch(() => {});
    if (isLimitError(err)) return new Response(err.message, { status: 429 });
    throw err;
  }
  const { conversationId, stream, hold } = prepared;

  const tracker = streamUsageTracker();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let clientGone = false;
      const send = (text: string) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          clientGone = true; // keep collecting so the reply is saved
        }
      };
      try {
        for await (const event of stream) {
          tracker.onEvent(event);
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            send(event.delta.text);
          }
        }
      } catch (err) {
        if (!(err instanceof APIUserAbortError)) {
          const note = `\n\n_(The reply was interrupted: ${err instanceof Error ? err.message : "unknown error"})_`;
          full += note;
          send(note);
        }
      } finally {
        // Bill what the reply actually used; if nothing came back, give the message back.
        await settleCost(hold, { userId, manuscriptId, kind: "discuss" }, MODEL, tracker.any ? tracker.usage : null).catch((e) => console.error("usage", e));
        if (!tracker.usage.output) await release(reservation).catch(() => {});
        if (full) {
          await db.message.create({ data: { conversationId, role: "assistant", content: full } });
          await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
        }
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
