import { NextResponse } from "next/server";
import { getOrCreateSessionUser } from "@/lib/session";
import {
  enterQueueOrCreateMatch,
  serializeMatchForViewer,
} from "@/lib/match-service";
import type { Throw } from "@/lib/game";

export async function POST(req: Request) {
  try {
    const user = await getOrCreateSessionUser();
    const body = await req.json().catch(() => ({}));

    const mode =
      body.mode === "CREATE_ROOM"
        ? "CREATE_ROOM"
        : body.mode === "CHALLENGE_BOT"
        ? "CHALLENGE_BOT"
        : "INSTANT_QUEUE";

    const initialTickets = Math.max(
      1,
      Math.min(500, Number(body.tickets || 1))
    );
    const initialThrows: Throw[] | undefined = Array.isArray(body.throws)
      ? body.throws
      : undefined;
    const opponentTicketsOverride = body.opponentTickets
      ? Number(body.opponentTickets)
      : undefined;

    const match = await enterQueueOrCreateMatch(user, {
      mode,
      initialTickets,
      initialThrows,
      opponentTicketsOverride,
    });

    return NextResponse.json({
      match: serializeMatchForViewer(match, user.id),
      user,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to enter matchmaking queue.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
