import { db } from "@/db";
import { matches } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getOrCreateSessionUser, ensureDbReady } from "@/lib/session";
import {
  checkAndSettleMatch,
  serializeMatchForViewer,
} from "@/lib/match-service";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await ensureDbReady();
  const { id } = await context.params;
  const user = await getOrCreateSessionUser();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      req.signal.addEventListener("abort", () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      const sendSnapshot = async () => {
        if (closed) return true;
        try {
          const numId = Number(id);
          const [found] =
            Number.isInteger(numId) && numId > 0
              ? await db
                  .select()
                  .from(matches)
                  .where(eq(matches.id, numId))
                  .limit(1)
              : await db
                  .select()
                  .from(matches)
                  .where(eq(matches.code, String(id).toUpperCase()))
                  .limit(1);

          if (!found) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: "Match not found" })}\n\n`
              )
            );
            return true;
          }

          const settled = await checkAndSettleMatch(found.id);
          const payload = serializeMatchForViewer(settled, user.id);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ match: payload })}\n\n`)
          );

          return (
            settled.status === "COMPLETED" || settled.status === "VOIDED"
          );
        } catch {
          return true;
        }
      };

      // Send initial snapshot immediately
      const doneInitially = await sendSnapshot();
      if (doneInitially) {
        try {
          controller.close();
        } catch {
          // ignore
        }
        return;
      }

      // Stream updates every 600ms for up to 35 seconds
      let ticks = 0;
      const interval = setInterval(async () => {
        ticks++;
        if (closed || ticks > 60) {
          clearInterval(interval);
          try {
            controller.close();
          } catch {
            // ignore
          }
          return;
        }
        const finished = await sendSnapshot();
        if (finished) {
          clearInterval(interval);
          try {
            controller.close();
          } catch {
            // ignore
          }
        }
      }, 600);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
