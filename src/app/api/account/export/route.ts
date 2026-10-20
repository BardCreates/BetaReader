import { currentUserId } from "@/auth";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";

export const maxDuration = 60;

/** Everything the user has given us and everything the reader made, as one JSON file. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      createdAt: true,
      plan: true,
      billingInterval: true,
      manuscripts: {
        orderBy: { createdAt: "asc" },
        select: {
          title: true,
          genre: true,
          audience: true,
          authorGoals: true,
          persona: true,
          draft: true,
          wordCount: true,
          createdAt: true,
          updatedAt: true,
          chapters: {
            orderBy: { index: "asc" },
            select: {
              index: true,
              title: true,
              content: true,
              intent: true,
              wordCount: true,
              review: {
                select: {
                  status: true,
                  reaction: true,
                  summary: true,
                  engagement: true,
                  confusion: true,
                  driftQuote: true,
                  driftReason: true,
                  strengths: true,
                  questions: true,
                  predictions: true,
                  intentCheck: true,
                  revisionCheck: true,
                  readAt: true,
                  notes: { select: { kind: true, category: true, severity: true, quote: true, comment: true, suggestion: true, status: true } },
                },
              },
            },
          },
          report: { select: { status: true, content: true, updatedAt: true } },
          pitchKit: { select: { status: true, content: true, updatedAt: true } },
          threads: { select: { kind: true, text: true, outcome: true, resolution: true, raisedChapter: { select: { index: true } }, resolvedChapter: { select: { index: true } } } },
          facts: { select: { subject: true, category: true, fact: true, chapter: { select: { index: true } } } },
          snapshots: { select: { draft: true, reason: true, data: true, createdAt: true } },
          characters: {
            select: {
              name: true,
              aliases: true,
              role: true,
              pronouns: true,
              age: true,
              summary: true,
              appearance: true,
              personality: true,
              wants: true,
              fears: true,
              backstory: true,
              voice: true,
              notes: true,
              conversations: {
                orderBy: { createdAt: "asc" },
                select: {
                  title: true,
                  mode: true,
                  asOfChapter: true,
                  createdAt: true,
                  messages: { orderBy: { createdAt: "asc" }, select: { role: true, content: true, createdAt: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!user) return new Response("Not found", { status: 404 });

  const body = JSON.stringify({ exportedAt: new Date().toISOString(), service: BRAND.name, ...user }, null, 2);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${BRAND.name.toLowerCase()}-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
