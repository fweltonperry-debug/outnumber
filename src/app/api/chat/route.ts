import { NextResponse } from "next/server";
import { db } from "@/db";
import { floorMessages } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getOrCreateSessionUser, ensureDbReady } from "@/lib/session";

export async function GET() {
  try {
    await ensureDbReady();
    const messages = await db
      .select()
      .from(floorMessages)
      .orderBy(desc(floorMessages.id))
      .limit(25);

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("GET /api/chat error:", err);
    return NextResponse.json(
      { error: "Failed to load floor chat" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateSessionUser();
    if (user.isSuspended) {
      return NextResponse.json(
        { error: "Your account is suspended." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const text = String(body.message || "")
      .trim()
      .slice(0, 220);

    if (!text) {
      return NextResponse.json(
        { error: "Message cannot be empty." },
        { status: 400 }
      );
    }

    const matchCode = body.matchCode
      ? String(body.matchCode).trim().toUpperCase().slice(0, 12)
      : null;
    const ticketsOffered = body.ticketsOffered
      ? Math.max(1, Math.min(500, Number(body.ticketsOffered)))
      : null;

    const [created] = await db
      .insert(floorMessages)
      .values({
        userId: user.id,
        userHandle: user.handle,
        cashtag: user.cashtag || "",
        message: text,
        matchCode,
        ticketsOffered,
      })
      .returning();

    const messages = await db
      .select()
      .from(floorMessages)
      .orderBy(desc(floorMessages.id))
      .limit(25);

    return NextResponse.json({ created, messages });
  } catch (err) {
    console.error("POST /api/chat error:", err);
    return NextResponse.json(
      { error: "Failed to post floor message" },
      { status: 500 }
    );
  }
}
