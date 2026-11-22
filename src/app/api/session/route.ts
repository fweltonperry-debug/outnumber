import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, walletTransactions, houseLedger, matches } from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";
import {
  getOrCreateSessionUser,
  getUserLedger,
  getUserCashappRequests,
  SESSION_COOKIE_NAME,
  HOUSE_CASHTAG,
  ensureDbReady,
  generateSessionToken,
  generateRecoveryCode,
  hashPassword,
} from "@/lib/session";

function sanitizeUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    handle: u.handle,
    email: u.email,
    hasPassword: Boolean(u.passwordHash),
    cashtag: u.cashtag,
    recoveryCode: u.recoveryCode,
    balanceCents: u.balanceCents,
    totalDepositedCents: u.totalDepositedCents,
    totalWithdrawnCents: u.totalWithdrawnCents,
    totalWageredCents: u.totalWageredCents,
    totalWonCents: u.totalWonCents,
    wins: u.wins,
    losses: u.losses,
    isSuspended: u.isSuspended,
    ageVerified: u.ageVerified,
  };
}

export async function GET() {
  try {
    const user = await getOrCreateSessionUser();
    const ledger = await getUserLedger(user.id, 30);
    const cashappHistory = await getUserCashappRequests(user.id, 20);

    const [houseStats] = await db
      .select({
        totalHouseCutCents: sql<number>`COALESCE(SUM(${houseLedger.houseCutCents}), 0)`,
        totalGrossPotCents: sql<number>`COALESCE(SUM(${houseLedger.grossPotCents}), 0)`,
        totalMatchesSettled: sql<number>`COUNT(*)`,
      })
      .from(houseLedger);

    const [openCount] = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(matches)
      .where(eq(matches.status, "WAITING"));

    return NextResponse.json({
      user: sanitizeUser(user),
      ledger,
      cashappHistory,
      houseCashtag: HOUSE_CASHTAG,
      stats: {
        totalHouseCutCents: Number(houseStats?.totalHouseCutCents || 0),
        totalGrossPotCents: Number(houseStats?.totalGrossPotCents || 0),
        totalMatchesSettled: Number(houseStats?.totalMatchesSettled || 0),
        openMatchesCount: Number(openCount?.count || 0),
      },
    });
  } catch (err) {
    console.error("GET /api/session error:", err);
    return NextResponse.json(
      { error: "Failed to load session" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await ensureDbReady();
    const body = await req.json();
    const action = body.action || "UPDATE_PROFILE";

    if (action === "LOGIN_PASSWORD") {
      const identifier = String(body.identifier || "")
        .trim()
        .toLowerCase()
        .replace(/^@/, "");
      const password = String(body.password || "");

      if (!identifier || !password) {
        return NextResponse.json(
          { error: "Please enter both handle/email and password." },
          { status: 400 }
        );
      }

      const [found] = await db
        .select()
        .from(users)
        .where(
          or(eq(users.handle, identifier), eq(users.email, identifier))
        )
        .limit(1);

      if (!found || found.passwordHash !== hashPassword(password)) {
        return NextResponse.json(
          { error: "Invalid handle/email or password." },
          { status: 401 }
        );
      }

      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, found.sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      });

      const ledger = await getUserLedger(found.id, 30);
      const cashappHistory = await getUserCashappRequests(found.id, 20);
      return NextResponse.json({
        user: sanitizeUser(found),
        ledger,
        cashappHistory,
        message: `Signed in as @${found.handle}`,
      });
    }

    if (action === "RECOVER_ACCOUNT") {
      const code = String(body.recoveryCode || "")
        .trim()
        .toUpperCase();
      if (!code) {
        return NextResponse.json(
          { error: "Please enter a valid recovery code." },
          { status: 400 }
        );
      }

      const [found] = await db
        .select()
        .from(users)
        .where(eq(users.recoveryCode, code))
        .limit(1);

      if (!found) {
        return NextResponse.json(
          { error: "No account found matching that recovery code." },
          { status: 404 }
        );
      }

      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, found.sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      });

      const ledger = await getUserLedger(found.id, 30);
      const cashappHistory = await getUserCashappRequests(found.id, 20);
      return NextResponse.json({
        user: sanitizeUser(found),
        ledger,
        cashappHistory,
        message: `Account @${found.handle} restored successfully.`,
      });
    }

    if (action === "NEW_ACCOUNT") {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const handle = body.handle
        ? String(body.handle)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "")
            .slice(0, 20) || `player_${suffix}`
        : `player_${suffix}`;
      const cashtag = body.cashtag
        ? String(body.cashtag).trim()
        : `$${handle}`;
      const newToken = generateSessionToken();
      const recoveryCode = generateRecoveryCode();
      const startingBalance = 15000;

      const [created] = await db
        .insert(users)
        .values({
          handle,
          email: "",
          passwordHash: "",
          cashtag: cashtag.startsWith("$") ? cashtag : `$${cashtag}`,
          sessionToken: newToken,
          recoveryCode,
          balanceCents: startingBalance,
          totalDepositedCents: startingBalance,
        })
        .returning();

      await db.insert(walletTransactions).values({
        userId: created.id,
        userHandle: created.handle,
        type: "INITIAL_CREDIT",
        amountCents: startingBalance,
        balanceAfterCents: startingBalance,
        destination: created.cashtag,
        note: "Opening wallet bankroll credit ($150.00)",
      });

      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, newToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      });

      const ledger = await getUserLedger(created.id, 30);
      const cashappHistory = await getUserCashappRequests(created.id, 20);
      return NextResponse.json({
        user: sanitizeUser(created),
        ledger,
        cashappHistory,
      });
    }

    // Default: UPDATE_PROFILE (also binds Email + Password if supplied)
    const user = await getOrCreateSessionUser();
    const rawHandle = body.handle
      ? String(body.handle)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "")
          .slice(0, 22)
      : user.handle;
    const cleanHandle = rawHandle.length >= 2 ? rawHandle : user.handle;

    let cleanCashtag =
      body.cashtag !== undefined ? String(body.cashtag).trim() : user.cashtag;
    if (cleanCashtag && !cleanCashtag.startsWith("$")) {
      cleanCashtag = `$${cleanCashtag}`;
    }

    const cleanEmail =
      body.email !== undefined
        ? String(body.email).trim().toLowerCase()
        : user.email;

    const newPassword = body.password ? String(body.password).trim() : "";

    if (cleanHandle !== user.handle) {
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.handle, cleanHandle))
        .limit(1);
      if (existing.length > 0 && existing[0].id !== user.id) {
        return NextResponse.json(
          { error: `Handle @${cleanHandle} is already taken.` },
          { status: 400 }
        );
      }
    }

    const [updated] = await db
      .update(users)
      .set({
        handle: cleanHandle,
        email: cleanEmail,
        passwordHash:
          newPassword.length >= 4
            ? hashPassword(newPassword)
            : user.passwordHash,
        cashtag: cleanCashtag,
        ageVerified:
          body.ageVerified !== undefined
            ? Boolean(body.ageVerified)
            : user.ageVerified,
      })
      .where(eq(users.id, user.id))
      .returning();

    const ledger = await getUserLedger(updated.id, 30);
    const cashappHistory = await getUserCashappRequests(updated.id, 20);
    return NextResponse.json({
      user: sanitizeUser(updated),
      ledger,
      cashappHistory,
      message: newPassword
        ? "Account handle, $Cashtag, email & password saved!"
        : "Player profile & $Cashtag payout destination saved.",
    });
  } catch (err) {
    console.error("POST /api/session error:", err);
    return NextResponse.json(
      { error: "Failed to update session profile" },
      { status: 500 }
    );
  }
}
