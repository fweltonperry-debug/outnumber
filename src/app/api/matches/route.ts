import { NextResponse } from "next/server";
import { db } from "@/db";
import { matches, houseLedger, users } from "@/db/schema";
import { eq, or, desc, sql } from "drizzle-orm";
import { getOrCreateSessionUser, ensureDbReady } from "@/lib/session";
import {
  checkAndSettleMatch,
  serializeMatchForViewer,
} from "@/lib/match-service";

export async function GET() {
  try {
    await ensureDbReady();
    const viewer = await getOrCreateSessionUser();

    // First auto-settle any expired COUNTDOWN matches
    const countdownRows = await db
      .select()
      .from(matches)
      .where(eq(matches.status, "COUNTDOWN"));

    for (const cm of countdownRows) {
      await checkAndSettleMatch(cm.id);
    }

    const openRows = await db
      .select()
      .from(matches)
      .where(eq(matches.status, "WAITING"))
      .orderBy(desc(matches.id))
      .limit(15);

    const activeRows = await db
      .select()
      .from(matches)
      .where(eq(matches.status, "COUNTDOWN"))
      .orderBy(desc(matches.id))
      .limit(10);

    const completedRows = await db
      .select()
      .from(matches)
      .where(eq(matches.status, "COMPLETED"))
      .orderBy(desc(matches.id))
      .limit(20);

    const myRows = await db
      .select()
      .from(matches)
      .where(
        or(
          eq(matches.playerAId, viewer.id),
          eq(matches.playerBId, viewer.id)
        )
      )
      .orderBy(desc(matches.id))
      .limit(30);

    const houseEntries = await db
      .select()
      .from(houseLedger)
      .orderBy(desc(houseLedger.id))
      .limit(25);

    const [houseTotals] = await db
      .select({
        totalHouseCutCents: sql<number>`COALESCE(SUM(${houseLedger.houseCutCents}), 0)`,
        totalGrossPotCents: sql<number>`COALESCE(SUM(${houseLedger.grossPotCents}), 0)`,
        totalWinnerPayoutCents: sql<number>`COALESCE(SUM(${houseLedger.winnerPayoutCents}), 0)`,
        totalTicketsDealt: sql<number>`COALESCE(SUM(${houseLedger.totalTickets}), 0)`,
        matchCount: sql<number>`COUNT(*)`,
      })
      .from(houseLedger);

    const leaderboardUsers = await db
      .select({
        id: users.id,
        handle: users.handle,
        cashtag: users.cashtag,
        balanceCents: users.balanceCents,
        totalWonCents: users.totalWonCents,
        totalWageredCents: users.totalWageredCents,
        wins: users.wins,
        losses: users.losses,
        isBot: users.isBot,
      })
      .from(users)
      .orderBy(desc(users.totalWonCents), desc(users.wins))
      .limit(15);

    return NextResponse.json({
      openMatches: openRows.map((m) => serializeMatchForViewer(m, viewer.id)),
      activeMatches: activeRows.map((m) =>
        serializeMatchForViewer(m, viewer.id)
      ),
      completedMatches: completedRows.map((m) =>
        serializeMatchForViewer(m, viewer.id)
      ),
      myMatches: myRows.map((m) => serializeMatchForViewer(m, viewer.id)),
      houseLedger: houseEntries,
      houseSummary: {
        totalHouseCutCents: Number(houseTotals?.totalHouseCutCents || 0),
        totalGrossPotCents: Number(houseTotals?.totalGrossPotCents || 0),
        totalWinnerPayoutCents: Number(
          houseTotals?.totalWinnerPayoutCents || 0
        ),
        totalTicketsDealt: Number(houseTotals?.totalTicketsDealt || 0),
        matchCount: Number(houseTotals?.matchCount || 0),
      },
      leaderboard: leaderboardUsers,
    });
  } catch (err) {
    console.error("GET /api/matches error:", err);
    return NextResponse.json(
      { error: "Failed to load matches" },
      { status: 500 }
    );
  }
}
