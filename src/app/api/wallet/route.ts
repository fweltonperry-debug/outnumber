import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, walletTransactions, cashappRequests } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getOrCreateSessionUser,
  getUserLedger,
  getUserCashappRequests,
  HOUSE_CASHTAG,
  randomCode,
} from "@/lib/session";

export async function POST(req: Request) {
  try {
    const user = await getOrCreateSessionUser();
    if (user.isSuspended) {
      return NextResponse.json(
        { error: "Your account is currently suspended." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const action = String(body.action || "DEPOSIT").toUpperCase();

    if (action === "SET_CASHTAG") {
      let cashtag = String(body.cashtag || "").trim();
      if (cashtag && !cashtag.startsWith("$")) {
        cashtag = `$${cashtag}`;
      }
      if (!cashtag || cashtag.length < 2) {
        return NextResponse.json(
          { error: "Please enter a valid $Cashtag payout handle." },
          { status: 400 }
        );
      }

      const [updated] = await db
        .update(users)
        .set({ cashtag })
        .where(eq(users.id, user.id))
        .returning();

      const ledger = await getUserLedger(updated.id, 30);
      const cashappHistory = await getUserCashappRequests(updated.id, 20);
      return NextResponse.json({
        user: updated,
        ledger,
        cashappHistory,
        message: `Payout destination updated to ${cashtag}`,
      });
    }

    const amountDollars = Number(body.amountDollars || 0);
    const amountCents = Math.round(
      body.amountCents ? Number(body.amountCents) : amountDollars * 100
    );

    if (!Number.isFinite(amountCents) || amountCents < 500) {
      return NextResponse.json(
        { error: "Minimum transaction amount is $5.00 (1 ticket)." },
        { status: 400 }
      );
    }

    if (action === "DEPOSIT") {
      if (amountCents > 500000) {
        return NextResponse.json(
          { error: "Maximum single deposit is $5,000.00." },
          { status: 400 }
        );
      }

      const newBalance = user.balanceCents + amountCents;
      const newDeposited = user.totalDepositedCents + amountCents;
      const playerCashtag = String(
        body.source || user.cashtag || "$player"
      ).trim();
      const refCode = `CA-${randomCode(6)}`;

      const [updated] = await db
        .update(users)
        .set({
          balanceCents: newBalance,
          totalDepositedCents: newDeposited,
        })
        .where(eq(users.id, user.id))
        .returning();

      await db.insert(walletTransactions).values({
        userId: updated.id,
        userHandle: updated.handle,
        type: "DEPOSIT",
        amountCents,
        balanceAfterCents: newBalance,
        destination: HOUSE_CASHTAG,
        note: `Cash App Deposit #${refCode} (+$${(amountCents / 100).toFixed(
          2
        )} / ${Math.floor(amountCents / 500)} tickets) from ${playerCashtag} → ${HOUSE_CASHTAG}`,
      });

      await db.insert(cashappRequests).values({
        referenceCode: refCode,
        userId: updated.id,
        userHandle: updated.handle,
        kind: "DEPOSIT",
        amountCents,
        playerCashtag,
        houseCashtag: HOUSE_CASHTAG,
        status: "COMPLETED",
        note: `Instant Cash App load (${Math.floor(amountCents / 500)} tickets)`,
      });

      const ledger = await getUserLedger(updated.id, 30);
      const cashappHistory = await getUserCashappRequests(updated.id, 20);
      return NextResponse.json({
        user: updated,
        ledger,
        cashappHistory,
        message: `Deposited $${(amountCents / 100).toFixed(
          2
        )} to your balance (Ref #${refCode}).`,
      });
    }

    if (action === "WITHDRAW") {
      if (amountCents > user.balanceCents) {
        return NextResponse.json(
          {
            error: `Insufficient balance ($${(
              user.balanceCents / 100
            ).toFixed(2)}) for withdrawal of $${(amountCents / 100).toFixed(
              2
            )}.`,
          },
          { status: 400 }
        );
      }

      let destination = String(
        body.cashtag || user.cashtag || "$cashtag"
      ).trim();
      if (!destination.startsWith("$")) {
        destination = `$${destination}`;
      }

      const newBalance = user.balanceCents - amountCents;
      const newWithdrawn = user.totalWithdrawnCents + amountCents;
      const refCode = `CA-${randomCode(6)}`;

      const [updated] = await db
        .update(users)
        .set({
          balanceCents: newBalance,
          totalWithdrawnCents: newWithdrawn,
          cashtag: destination,
        })
        .where(eq(users.id, user.id))
        .returning();

      await db.insert(walletTransactions).values({
        userId: updated.id,
        userHandle: updated.handle,
        type: "WITHDRAWAL",
        amountCents: -amountCents,
        balanceAfterCents: newBalance,
        destination,
        note: `Cash App Payout #${refCode} (-$${(amountCents / 100).toFixed(
          2
        )}) dispatched to ${destination}`,
      });

      await db.insert(cashappRequests).values({
        referenceCode: refCode,
        userId: updated.id,
        userHandle: updated.handle,
        kind: "PAYOUT",
        amountCents,
        playerCashtag: destination,
        houseCashtag: HOUSE_CASHTAG,
        status: "COMPLETED",
        note: `Instant winner payout to ${destination}`,
      });

      const ledger = await getUserLedger(updated.id, 30);
      const cashappHistory = await getUserCashappRequests(updated.id, 20);
      return NextResponse.json({
        user: updated,
        ledger,
        cashappHistory,
        message: `Sent $${(amountCents / 100).toFixed(
          2
        )} to Cash App ${destination} (Ref #${refCode}).`,
      });
    }

    return NextResponse.json(
      { error: "Unsupported wallet action." },
      { status: 400 }
    );
  } catch (err) {
    console.error("POST /api/wallet error:", err);
    return NextResponse.json(
      { error: "Wallet operation failed." },
      { status: 500 }
    );
  }
}
