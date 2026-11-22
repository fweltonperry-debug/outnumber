import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  users,
  matches,
  walletTransactions,
  houseLedger,
  cashappRequests,
} from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import {
  ensureDbReady,
  HOUSE_CASHTAG,
  HOUSE_OWNER_EMAIL,
  randomCode,
  getOrCreateSessionUser,
} from "@/lib/session";

export async function GET() {
  try {
    await ensureDbReady();

    const allUsers = await db
      .select()
      .from(users)
      .orderBy(desc(users.id))
      .limit(50);

    const allMatches = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.id))
      .limit(50);

    const allHouseLedger = await db
      .select()
      .from(houseLedger)
      .orderBy(desc(houseLedger.id))
      .limit(50);

    const allTransactions = await db
      .select()
      .from(walletTransactions)
      .orderBy(desc(walletTransactions.id))
      .limit(60);

    const allCashappRequests = await db
      .select()
      .from(cashappRequests)
      .orderBy(desc(cashappRequests.id))
      .limit(50);

    const [totals] = await db
      .select({
        totalHouseCutCents: sql<number>`COALESCE(SUM(${houseLedger.houseCutCents}), 0)`,
        totalGrossPotCents: sql<number>`COALESCE(SUM(${houseLedger.grossPotCents}), 0)`,
        totalWinnerPayoutCents: sql<number>`COALESCE(SUM(${houseLedger.winnerPayoutCents}), 0)`,
        totalTickets: sql<number>`COALESCE(SUM(${houseLedger.totalTickets}), 0)`,
      })
      .from(houseLedger);

    const [userFloat] = await db
      .select({
        totalFloatCents: sql<number>`COALESCE(SUM(${users.balanceCents}), 0)`,
        userCount: sql<number>`COUNT(*)`,
      })
      .from(users);

    return NextResponse.json({
      users: allUsers,
      matches: allMatches,
      houseLedger: allHouseLedger,
      transactions: allTransactions,
      cashappRequests: allCashappRequests,
      houseOwner: {
        email: HOUSE_OWNER_EMAIL,
        cashtag: HOUSE_CASHTAG,
      },
      summary: {
        totalHouseCutCents: Number(totals?.totalHouseCutCents || 0),
        totalGrossPotCents: Number(totals?.totalGrossPotCents || 0),
        totalWinnerPayoutCents: Number(totals?.totalWinnerPayoutCents || 0),
        totalTickets: Number(totals?.totalTickets || 0),
        totalFloatCents: Number(userFloat?.totalFloatCents || 0),
        userCount: Number(userFloat?.userCount || 0),
      },
    });
  } catch (err) {
    console.error("GET /api/admin error:", err);
    return NextResponse.json(
      { error: "Failed to load admin dashboard data" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await ensureDbReady();
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "SWEEP_HOUSE_CUT") {
      const [totals] = await db
        .select({
          totalHouseCutCents: sql<number>`COALESCE(SUM(${houseLedger.houseCutCents}), 0)`,
        })
        .from(houseLedger);

      const amountCents = Number(
        body.amountCents || totals?.totalHouseCutCents || 0
      );
      if (amountCents <= 0) {
        return NextResponse.json(
          { error: "No house cut balance available to sweep." },
          { status: 400 }
        );
      }

      const destination = String(body.cashtag || HOUSE_CASHTAG).trim();
      const refCode = `HSE-${randomCode(6)}`;
      const currentUser = await getOrCreateSessionUser();

      await db.insert(cashappRequests).values({
        referenceCode: refCode,
        userId: currentUser.id,
        userHandle: currentUser.handle,
        kind: "HOUSE_RAKE_PAYOUT",
        amountCents,
        playerCashtag: destination,
        houseCashtag: HOUSE_CASHTAG,
        status: "COMPLETED",
        note: `10% House Rake sweep ($${(amountCents / 100).toFixed(
          2
        )}) dispatched to owner ${destination} (${HOUSE_OWNER_EMAIL})`,
      });

      return NextResponse.json({
        referenceCode: refCode,
        amountCents,
        destination,
        message: `10% House Cut ($${(amountCents / 100).toFixed(
          2
        )}) swept to Cash App ${destination} (Ref #${refCode}).`,
      });
    }

    if (action === "TOGGLE_SUSPEND") {
      const userId = Number(body.userId);
      const [u] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!u) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const [updated] = await db
        .update(users)
        .set({ isSuspended: !u.isSuspended })
        .where(eq(users.id, userId))
        .returning();

      return NextResponse.json({
        user: updated,
        message: `@${updated.handle} is now ${
          updated.isSuspended ? "SUSPENDED" : "ACTIVE"
        }.`,
      });
    }

    if (action === "ADJUST_BALANCE") {
      const userId = Number(body.userId);
      const amountCents = Math.round(Number(body.amountCents || 0));
      const note = String(
        body.note || "Admin manual balance credit / refund"
      ).trim();

      const [u] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!u) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const newBalance = Math.max(0, u.balanceCents + amountCents);
      const [updated] = await db
        .update(users)
        .set({ balanceCents: newBalance })
        .where(eq(users.id, userId))
        .returning();

      await db.insert(walletTransactions).values({
        userId: updated.id,
        userHandle: updated.handle,
        type: "ADMIN_ADJUSTMENT",
        amountCents,
        balanceAfterCents: newBalance,
        destination: "Admin Desk",
        note,
      });

      return NextResponse.json({
        user: updated,
        message: `Adjusted @${updated.handle} balance by $${(
          amountCents / 100
        ).toFixed(2)}.`,
      });
    }

    if (action === "VOID_MATCH") {
      const matchId = Number(body.matchId);
      const [m] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);

      if (!m) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }
      if (m.status === "VOIDED") {
        return NextResponse.json({
          match: m,
          message: `Match #${m.code} is already voided.`,
        });
      }

      const [updated] = await db
        .update(matches)
        .set({
          status: "VOIDED",
          winnerSide: "VOID",
          completedAt: new Date(),
        })
        .where(eq(matches.id, matchId))
        .returning();

      return NextResponse.json({
        match: updated,
        message: `Match #${updated.code} voided by administrator.`,
      });
    }

    return NextResponse.json(
      { error: "Unknown admin action" },
      { status: 400 }
    );
  } catch (err) {
    console.error("POST /api/admin error:", err);
    return NextResponse.json(
      { error: "Admin operation failed" },
      { status: 500 }
    );
  }
}
