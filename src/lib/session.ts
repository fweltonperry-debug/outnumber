import { cookies } from "next/headers";
import crypto from "crypto";
import { db, pool } from "@/db";
import {
  users,
  matches,
  walletTransactions,
  houseLedger,
  cashappRequests,
  floorMessages,
  type User,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  calculatePot,
  resolveShowdown,
  type Throw,
  TICKET_PRICE_CENTS,
} from "@/lib/game";

export const SESSION_COOKIE_NAME = "mutuel_rps_session";
export const HOUSE_CASHTAG = "$stockhunger";
export const HOUSE_OWNER_EMAIL = "fweltonperry@gmail.com";

let schemaEnsured = false;

export function randomCode(len = 6): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function generateRecoveryCode(): string {
  return `RPS-${randomCode(4)}-${randomCode(4)}`;
}

export function generateSessionToken(): string {
  return `tok_${Date.now().toString(36)}_${randomCode(12)}_${randomCode(12)}`;
}

export function hashPassword(password: string): string {
  return crypto
    .createHash("sha256")
    .update(`mutuel_salt_${password}`)
    .digest("hex");
}

export async function ensureDbReady(): Promise<void> {
  if (schemaEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        handle TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL DEFAULT '',
        cashtag TEXT NOT NULL DEFAULT '',
        session_token TEXT NOT NULL UNIQUE,
        recovery_code TEXT NOT NULL UNIQUE,
        balance_cents INTEGER NOT NULL DEFAULT 10000,
        total_deposited_cents INTEGER NOT NULL DEFAULT 10000,
        total_withdrawn_cents INTEGER NOT NULL DEFAULT 0,
        total_wagered_cents INTEGER NOT NULL DEFAULT 0,
        total_won_cents INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        is_bot BOOLEAN NOT NULL DEFAULT FALSE,
        is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
        age_verified BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'WAITING',
        ticket_price_cents INTEGER NOT NULL DEFAULT 500,
        player_a_id INTEGER NOT NULL,
        player_a_handle TEXT NOT NULL,
        player_a_tickets INTEGER NOT NULL DEFAULT 1,
        player_a_throws TEXT NOT NULL DEFAULT '["R"]',
        player_a_locked BOOLEAN NOT NULL DEFAULT FALSE,
        player_b_id INTEGER,
        player_b_handle TEXT,
        player_b_tickets INTEGER NOT NULL DEFAULT 1,
        player_b_throws TEXT NOT NULL DEFAULT '["R"]',
        player_b_locked BOOLEAN NOT NULL DEFAULT FALSE,
        countdown_ends_at TIMESTAMP,
        total_pot_cents INTEGER NOT NULL DEFAULT 0,
        house_cut_cents INTEGER NOT NULL DEFAULT 0,
        payout_cents INTEGER NOT NULL DEFAULT 0,
        winner_id INTEGER,
        winner_side TEXT,
        resolution_json TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        user_handle TEXT NOT NULL,
        type TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        balance_after_cents INTEGER NOT NULL,
        match_id INTEGER,
        match_code TEXT,
        destination TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS house_ledger (
        id SERIAL PRIMARY KEY,
        match_id INTEGER NOT NULL,
        match_code TEXT NOT NULL,
        total_tickets INTEGER NOT NULL,
        gross_pot_cents INTEGER NOT NULL,
        house_cut_cents INTEGER NOT NULL,
        winner_payout_cents INTEGER NOT NULL,
        winner_handle TEXT NOT NULL,
        loser_handle TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS cashapp_requests (
        id SERIAL PRIMARY KEY,
        reference_code TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        user_handle TEXT NOT NULL,
        kind TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        player_cashtag TEXT NOT NULL,
        house_cashtag TEXT NOT NULL DEFAULT '$stockhunger',
        status TEXT NOT NULL DEFAULT 'COMPLETED',
        note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS floor_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        user_handle TEXT NOT NULL,
        cashtag TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL,
        match_code TEXT,
        tickets_offered INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length === 0) {
      await seedInitialData();
    }

    const existingMsgs = await db.select().from(floorMessages).limit(1);
    if (existingMsgs.length === 0) {
      const someUsers = await db.select().from(users).limit(3);
      if (someUsers.length >= 2) {
        await db.insert(floorMessages).values([
          {
            userId: someUsers[0].id,
            userHandle: someUsers[0].handle,
            cashtag: someUsers[0].cashtag,
            message:
              "Bought 3 tickets ($15) against 1 ticket ($5) — opponent threw Rock vs my Scissors on #1, still won 2-1 with +2 Outnumber Byes!",
            matchCode: "WC6Z2Y",
            ticketsOffered: 3,
          },
          {
            userId: someUsers[1].id,
            userHandle: someUsers[1].handle,
            cashtag: someUsers[1].cashtag,
            message:
              "Open slip #OPN3V1 is live on the book. Hit PLAY or take the slip to start the 15s countdown!",
            matchCode: "OPN3V1",
            ticketsOffered: 3,
          },
        ]);
      }
    }

    schemaEnsured = true;
  } catch (err) {
    console.error("ensureDbReady warning:", err);
  }
}

async function seedInitialData() {
  const seedPlayers = [
    {
      handle: "vela_sharp",
      email: "vela@outnumber.gg",
      cashtag: "$velasharp",
      balanceCents: 24850,
      totalDepositedCents: 15000,
      totalWithdrawnCents: 5000,
      totalWageredCents: 18500,
      totalWonCents: 33350,
      wins: 14,
      losses: 4,
      isBot: true,
    },
    {
      handle: "brick_mutuel",
      email: "brick@outnumber.gg",
      cashtag: "$brickcity99",
      balanceCents: 19200,
      totalDepositedCents: 12000,
      totalWithdrawnCents: 2500,
      totalWageredCents: 14000,
      totalWonCents: 23700,
      wins: 11,
      losses: 5,
      isBot: true,
    },
    {
      handle: "trey_stacks",
      email: "trey@outnumber.gg",
      cashtag: "$treystacks",
      balanceCents: 16400,
      totalDepositedCents: 10000,
      totalWithdrawnCents: 0,
      totalWageredCents: 9500,
      totalWonCents: 15900,
      wins: 8,
      losses: 4,
      isBot: true,
    },
    {
      handle: "kilo_hand",
      email: "kilo@outnumber.gg",
      cashtag: "$kilohand",
      balanceCents: 11500,
      totalDepositedCents: 10000,
      totalWithdrawnCents: 0,
      totalWageredCents: 8000,
      totalWonCents: 9500,
      wins: 5,
      losses: 6,
      isBot: true,
    },
    {
      handle: "southpaw_dc",
      email: "southpaw@outnumber.gg",
      cashtag: "$southpawdc",
      balanceCents: 14250,
      totalDepositedCents: 10000,
      totalWithdrawnCents: 1500,
      totalWageredCents: 11000,
      totalWonCents: 16750,
      wins: 9,
      losses: 5,
      isBot: true,
    },
  ];

  const insertedPlayers: User[] = [];
  for (const p of seedPlayers) {
    const [u] = await db
      .insert(users)
      .values({
        handle: p.handle,
        email: p.email,
        passwordHash: hashPassword("demo1234"),
        cashtag: p.cashtag,
        sessionToken: generateSessionToken(),
        recoveryCode: generateRecoveryCode(),
        balanceCents: p.balanceCents,
        totalDepositedCents: p.totalDepositedCents,
        totalWithdrawnCents: p.totalWithdrawnCents,
        totalWageredCents: p.totalWageredCents,
        totalWonCents: p.totalWonCents,
        wins: p.wins,
        losses: p.losses,
        isBot: p.isBot,
        isSuspended: false,
        ageVerified: true,
      })
      .returning();
    insertedPlayers.push(u);

    await db.insert(walletTransactions).values({
      userId: u.id,
      userHandle: u.handle,
      type: "INITIAL_CREDIT",
      amountCents: p.totalDepositedCents,
      balanceAfterCents: p.balanceCents,
      destination: p.cashtag,
      note: `Opening exchange bankroll credit (${p.cashtag})`,
    });
  }

  const sampleMatches: Array<{
    code: string;
    aIdx: number;
    bIdx: number;
    throwsA: Throw[];
    throwsB: Throw[];
  }> = [
    {
      code: "WC6Z2Y",
      aIdx: 0,
      bIdx: 1,
      throwsA: ["R", "P", "S"],
      throwsB: ["R"],
    },
    {
      code: "M9X4PL",
      aIdx: 1,
      bIdx: 2,
      throwsA: [
        "R",
        "P",
        "S",
        "R",
        "P",
        "S",
        "R",
        "P",
        "S",
        "R",
        "P",
        "S",
      ],
      throwsB: ["S"],
    },
    {
      code: "K7R2TN",
      aIdx: 2,
      bIdx: 3,
      throwsA: ["P", "P", "S", "R", "P"],
      throwsB: ["R", "S"],
    },
    {
      code: "J4V8QD",
      aIdx: 4,
      bIdx: 3,
      throwsA: ["R", "S", "P", "R"],
      throwsB: ["P"],
    },
  ];

  for (const sm of sampleMatches) {
    const pA = insertedPlayers[sm.aIdx];
    const pB = insertedPlayers[sm.bIdx];
    const pot = calculatePot(sm.throwsA.length, sm.throwsB.length);
    const res = resolveShowdown(sm.throwsA, sm.throwsB);
    const winner = res.winnerSide === "A" ? pA : pB;
    const loser = res.winnerSide === "A" ? pB : pA;

    const [m] = await db
      .insert(matches)
      .values({
        code: sm.code,
        status: "COMPLETED",
        ticketPriceCents: TICKET_PRICE_CENTS,
        playerAId: pA.id,
        playerAHandle: pA.handle,
        playerATickets: sm.throwsA.length,
        playerAThrows: JSON.stringify(sm.throwsA),
        playerALocked: true,
        playerBId: pB.id,
        playerBHandle: pB.handle,
        playerBTickets: sm.throwsB.length,
        playerBThrows: JSON.stringify(sm.throwsB),
        playerBLocked: true,
        totalPotCents: pot.grossPotCents,
        houseCutCents: pot.houseCutCents,
        payoutCents: pot.winnerPayoutCents,
        winnerId: winner.id,
        winnerSide: res.winnerSide,
        resolutionJson: JSON.stringify(res),
        completedAt: new Date(),
      })
      .returning();

    await db.insert(houseLedger).values({
      matchId: m.id,
      matchCode: m.code,
      totalTickets: pot.totalTickets,
      grossPotCents: pot.grossPotCents,
      houseCutCents: pot.houseCutCents,
      winnerPayoutCents: pot.winnerPayoutCents,
      winnerHandle: winner.handle,
      loserHandle: loser.handle,
    });

    await db.insert(walletTransactions).values([
      {
        userId: pA.id,
        userHandle: pA.handle,
        type: "MATCH_STAKE",
        amountCents: -pot.stakeACents,
        balanceAfterCents: pA.balanceCents,
        matchId: m.id,
        matchCode: m.code,
        destination: `Match #${m.code}`,
        note: `Locked ${sm.throwsA.length} ticket(s) ($${(pot.stakeACents / 100).toFixed(2)}) in #${m.code}`,
      },
      {
        userId: winner.id,
        userHandle: winner.handle,
        type: "MATCH_PAYOUT",
        amountCents: pot.winnerPayoutCents,
        balanceAfterCents: winner.balanceCents,
        matchId: m.id,
        matchCode: m.code,
        destination: winner.cashtag,
        note: `Won #${m.code} (${sm.throwsA.length}v${sm.throwsB.length} tickets) — 90% Payout after 10% house cut`,
      },
    ]);
  }

  const openChallengers = [
    {
      code: "OPN3V1",
      player: insertedPlayers[0],
      tickets: 3,
      throws: ["R", "P", "S"] as Throw[],
    },
    {
      code: "OPN5X5",
      player: insertedPlayers[2],
      tickets: 5,
      throws: ["R", "P", "S", "R", "P"] as Throw[],
    },
  ];

  for (const oc of openChallengers) {
    await db.insert(matches).values({
      code: oc.code,
      status: "WAITING",
      ticketPriceCents: TICKET_PRICE_CENTS,
      playerAId: oc.player.id,
      playerAHandle: oc.player.handle,
      playerATickets: oc.tickets,
      playerAThrows: JSON.stringify(oc.throws),
      playerALocked: false,
      totalPotCents: oc.tickets * TICKET_PRICE_CENTS,
      houseCutCents: Math.round(oc.tickets * TICKET_PRICE_CENTS * 0.1),
      payoutCents: Math.round(oc.tickets * TICKET_PRICE_CENTS * 0.9),
    });
  }
}

export async function getOrCreateSessionUser(): Promise<User> {
  await ensureDbReady();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const found = await db
      .select()
      .from(users)
      .where(eq(users.sessionToken, token))
      .limit(1);
    if (found.length > 0) {
      return found[0];
    }
  }

  const startingBalance = 15000;
  let created: User | undefined;
  let handle = "";
  let cashtag = "";
  let newToken = "";

  // Retry with a fresh handle/token if we hit a unique collision
  // (old 4-digit handles collided often on Vercel serverless instances)
  for (let attempt = 0; attempt < 6 && !created; attempt++) {
    const suffix = `${Date.now().toString(36)}${randomCode(4).toLowerCase()}`;
    handle = `player_${suffix}`.slice(0, 22);
    cashtag = `$player${suffix}`.slice(0, 22);
    newToken = generateSessionToken();
    const recoveryCode = generateRecoveryCode();
    try {
      const rows = await db
        .insert(users)
        .values({
          handle,
          email: "",
          passwordHash: "",
          cashtag,
          sessionToken: newToken,
          recoveryCode,
          balanceCents: startingBalance,
          totalDepositedCents: startingBalance,
          totalWithdrawnCents: 0,
          totalWageredCents: 0,
          totalWonCents: 0,
          wins: 0,
          losses: 0,
          isBot: false,
          isSuspended: false,
          ageVerified: true,
        })
        .returning();
      created = rows[0];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isDuplicate =
        msg.includes("unique") ||
        msg.includes("duplicate") ||
        msg.includes("23505");
      if (!isDuplicate || attempt === 5) throw err;
    }
  }

  if (!created) {
    throw new Error("Could not create player account, please refresh.");
  }

  await db.insert(walletTransactions).values({
    userId: created.id,
    userHandle: created.handle,
    type: "INITIAL_CREDIT",
    amountCents: startingBalance,
    balanceAfterCents: startingBalance,
    destination: cashtag,
    note: "Opening wallet bankroll credit ($150.00)",
  });

  try {
    cookieStore.set(SESSION_COOKIE_NAME, newToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  } catch {
    // Server Component context
  }

  return created;
}

export async function getUserLedger(userId: number, limit = 30) {
  await ensureDbReady();
  return db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.userId, userId))
    .orderBy(desc(walletTransactions.id))
    .limit(limit);
}

export async function getUserCashappRequests(userId: number, limit = 20) {
  await ensureDbReady();
  return db
    .select()
    .from(cashappRequests)
    .where(eq(cashappRequests.userId, userId))
    .orderBy(desc(cashappRequests.id))
    .limit(limit);
}
