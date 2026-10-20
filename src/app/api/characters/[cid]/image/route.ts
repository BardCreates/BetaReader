import { currentUserId } from "@/auth";
import { db } from "@/lib/db";

/** A character's picture, only for the author who owns it. The URL carries ?v=<timestamp>, so it can be cached for good. */
export async function GET(_req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const userId = await currentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { cid } = await params;
  const image = await db.characterImage.findFirst({
    where: { characterId: cid, character: { manuscript: { userId } } },
    select: { data: true, type: true },
  });
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(image.data), {
    headers: {
      "Content-Type": image.type,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
