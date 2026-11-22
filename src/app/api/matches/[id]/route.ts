import { NextResponse } from "next/server";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getOrCreateSessionUser,
  getUserLedger,
  ensureDbReady,
} from "@/lib/session";
import {
  checkAndSettleMatch,
  joinWaitingMatch,
  updateMatchTicketsAndThrows,
  serializeMatchForViewer,
} from "@/lib/match-service";
import type { Throw } from "@/lib/game";

async function findMatchByIdOrCode(idOrCode: string) {
  await ensureDbReady();
  const numericId = Number(idOrCode);
  if (Number.isInteger(numericId) && numericId > 0) {
    const [byId] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, numericId))
      .limit(1);
    if (byId) return byId;
  }

  const cleanCode = String(idOrCode).trim().toUpperCase();
  const [byCode] = await db
    .select()
    .from(matches)
    .where(eq(matches.code, cleanCode))
    .limit(1);
  return byCode || null;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await getOrCreateSessionUser();
    const found = await findMatchByIdOrCode(id);
    if (!found) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const settled = await checkAndSettleMatch(found.id);
    const refreshedUser = await getOrCreateSessionUser();
    const ledger = await getUserLedger(refreshedUser.id, 30);

    return NextResponse.json({
      match: serializeMatchForViewer(settled, refreshedUser.id),
      user: refreshedUser,
      ledger,
    });
  } catch (err) {
    console.error("GET /api/matches/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to load match" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await getOrCreateSessionUser();
    const found = await findMatchByIdOrCode(id);
    if (!found) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const tickets = Math.max(1, Math.min(500, Number(body.tickets || 1)));
    const throws: Throw[] | undefined = Array.isArray(body.throws)
      ? body.throws
      : undefined;

    const joined = await joinWaitingMatch(found.id, user, tickets, throws);
    const refreshedUser = await getOrCreateSessionUser();

    return NextResponse.json({
      match: serializeMatchForViewer(joined, refreshedUser.id),
      user: refreshedUser,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to join match";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await getOrCreateSessionUser();
    const found = await findMatchByIdOrCode(id);
    if (!found) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));

    if (body.forceSettle) {
      const settled = await checkAndSettleMatch(found.id, true);
      const refreshedUser = await getOrCreateSessionUser();
      const ledger = await getUserLedger(refreshedUser.id, 30);
      return NextResponse.json({
        match: serializeMatchForViewer(settled, refreshedUser.id),
        user: refreshedUser,
        ledger,
      });
    }

    const tickets = Math.max(1, Math.min(500, Number(body.tickets || 1)));
    const throws: Throw[] = Array.isArray(body.throws) ? body.throws : ["R"];
    const lockIn = Boolean(body.lockIn);

    const updated = await updateMatchTicketsAndThrows(
      found.id,
      user,
      tickets,
      throws,
      lockIn
    );
    const refreshedUser = await getOrCreateSessionUser();
    const ledger = await getUserLedger(refreshedUser.id, 30);

    return NextResponse.json({
      match: serializeMatchForViewer(updated, refreshedUser.id),
      user: refreshedUser,
      ledger,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to update match selection";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
