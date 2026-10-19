import { APIUserAbortError } from "@anthropic-ai/sdk";
import { z } from "zod";
import { currentUserId } from "@/auth";
import { db } from "@/lib/db";
import { FEATURES } from "@/lib/features";
import { MODEL, anthropic } from "@/lib/reader/anthropic";
import { buildEditorSystem } from "@/lib/reader/editor";

export const maxDuration = 120;

const Body = z.object({
  conversationId: z.string().nullish(),
  chapterId: z.string().nullable().optional(),
  message: z.string().trim().min(1).max(20_000),
});

/** Stream the editor's reply as plain text. The conversation id is returned in a header. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!FEATURES.editorChat) return new Response("Not found", { status: 404 });
  const userId = await currentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id: manuscriptId } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { message } = parsed.data;

  const ms = await db.manuscript.findFirst({ where: { id: manuscriptId, userId }, select: { id: true } });
  if (!ms) return new Response("Not found", { status: 404 });

  let conversation = parsed.data.conversationId
    ? await db.conversation.findFirst({ where: { id: parsed.data.conversationId, manuscriptId } })
    : null;
  if (!conversation) {
    const chapterId = parsed.data.chapterId
      ? (await db.chapter.findFirst({ where: { id: parsed.data.chapterId, manuscriptId }, select: { id: true } }))?.id ?? null
      : null;
    conversation = await db.conversation.create({
      data: { manuscriptId, chapterId, title: message.slice(0, 80) },
    });
  }

  // Most recent 40 messages, oldest first, starting on a user turn.
  const history = (
    await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 40,
    })
  ).reverse();
  while (history[0]?.role === "assistant") history.shift();
  await db.message.create({ data: { conversationId: conversation.id, role: "user", content: message } });

  const system = await buildEditorSystem(manuscriptId, conversation.chapterId);
  const conversationId = conversation.id;

  const stream = anthropic().messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: message },
    ],
  });

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
          clientGone = true; // the browser disconnected; keep collecting so the reply is saved
        }
      };
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            send(event.delta.text);
          }
        }
      } catch (err) {
        if (!(err instanceof APIUserAbortError)) {
          const note = `\n\n_(The editor was interrupted: ${err instanceof Error ? err.message : "unknown error"})_`;
          full += note;
          send(note);
        }
      } finally {
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

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": conversationId,
    },
  });
}
