import { db } from "@/db";
import {
  users,
  matches,
  walletTransactions,
  houseLedger,
  floorMessages,
  type User,
  type Match,
} from "@/db/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import {
  calculatePot,
  resolveShowdown,
  normalizeThrows,
  generateThrowsByStrategy,
  TICKET_PRICE_CENTS,
  COUNTDOWN_SECONDS,
  type Throw,
  type ThrowStrategy,
} from "@/lib/game";
import { randomCode, ensureDbReady } from "@/lib/session";

export async function generateUniqueMatchCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode(6);
    const existing = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.code, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  return randomCode(8);
}

/**
 * Pick a random bot challenger for instant queue matching when no human is waiting,
 * and assign them a realistic ticket count (1 to 4 tickets) and throw strategy.
 */
async function pickBotChallenger(excludeUserId: number): Promise<{
  bot: User;
  tickets: number;
  throws: Throw[];
}> {
  const bots = await db
    .select()
    .from(users)
    .where(and(eq(users.isBot, true), ne(users.id, excludeUserId)));

  const bot =
    bots.length > 0
      ? bots[Math.floor(Math.random() * bots.length)]
      : (await db.select().from(users).limit(1))[0];

  // Weighted random ticket count for opponent (mostly 1, 2, or 3 so player can test outnumbering them!)
  const weights = [1, 1, 1, 2, 2, 3, 4];
  const tickets = weights[Math.floor(Math.random() * weights.length)];
  const strategies: ThrowStrategy[] = [
    "RANDOM",
    "BALANCED",
    "ALL_R",
    "ALL_P",
    "ALL_S",
  ];
  const strat = strategies[Math.floor(Math.random() * strategies.length)];
  const throws = generateThrowsByStrategy(tickets, strat);

  return { bot, tickets, throws };
}

/**
 * Hit PLAY -> Enters queue.
 * 1) Checks if another human has a WAITING match open. If so, joins as Player B and starts the 15s countdown.
 * 2) Otherwise, pairs with an active floor challenger (or creates a waiting room if mode === 'CREATE_ROOM')
 *    and launches the 15-second countdown immediately so the player can pick X tickets & throws.
 */
export async function enterQueueOrCreateMatch(
  user: User,
  options: {
    mode?: "INSTANT_QUEUE" | "CREATE_ROOM" | "CHALLENGE_BOT";
    initialTickets?: number;
    initialThrows?: Throw[];
    opponentTicketsOverride?: number;
  } = {}
): Promise<Match> {
  await ensureDbReady();

  if (user.isSuspended) {
    throw new Error("Account is currently suspended by floor administrator.");
  }

  const initialTickets = Math.max(1, Math.floor(options.initialTickets || 1));
  const requiredCents = initialTickets * TICKET_PRICE_CENTS;
  if (user.balanceCents < requiredCents) {
    throw new Error(
      `Insufficient wallet balance ($${(user.balanceCents / 100).toFixed(
        2
      )}) for ${initialTickets} ticket(s) ($${(requiredCents / 100).toFixed(
        2
      )}). Please deposit funds in your Wallet first.`
    );
  }

  const initialThrows = normalizeThrows(
    options.initialThrows || generateThrowsByStrategy(initialTickets, "BALANCED"),
    initialTickets
  );

  const mode = options.mode || "INSTANT_QUEUE";

  // If mode is INSTANT_QUEUE, first check if another human player is waiting in a room
  if (mode === "INSTANT_QUEUE") {
    const waitingHumanMatches = await db
      .select()
      .from(matches)
      .where(
        and(eq(matches.status, "WAITING"), ne(matches.playerAId, user.id))
      )
      .orderBy(desc(matches.id))
      .limit(5);

    // Prefer a non-bot human waiting match if one exists
    for (const wm of waitingHumanMatches) {
      const [pA] = await db
        .select()
        .from(users)
        .where(eq(users.id, wm.playerAId))
        .limit(1);
      if (pA && !pA.isBot) {
        return joinWaitingMatch(wm.id, user, initialTickets, initialThrows);
      }
    }
  }

  const code = await generateUniqueMatchCode();

  if (mode === "CREATE_ROOM") {
    // Creates a shareable WAITING room (/m/CODE) that waits for a second player to join
    const pot = calculatePot(initialTickets, 1);
    const [created] = await db
      .insert(matches)
      .values({
        code,
        status: "WAITING",
        ticketPriceCents: TICKET_PRICE_CENTS,
        playerAId: user.id,
        playerAHandle: user.handle,
        playerATickets: initialTickets,
        playerAThrows: JSON.stringify(initialThrows),
        playerALocked: false,
        totalPotCents: pot.stakeACents,
        houseCutCents: Math.round(pot.stakeACents * 0.1),
        payoutCents: Math.round(pot.stakeACents * 0.9),
      })
      .returning();
    return created;
  }

  // Otherwise (INSTANT_QUEUE or CHALLENGE_BOT): pair immediately and start the 15-second countdown!
  const { bot, tickets: botTicketsDefault, throws: botThrowsDefault } =
    await pickBotChallenger(user.id);

  const botTickets = options.opponentTicketsOverride
    ? Math.max(1, Math.floor(options.opponentTicketsOverride))
    : botTicketsDefault;
  const botThrows = options.opponentTicketsOverride
    ? generateThrowsByStrategy(botTickets, "RANDOM")
    : botThrowsDefault;

  const pot = calculatePot(initialTickets, botTickets);
  const countdownEndsAt = new Date(Date.now() + COUNTDOWN_SECONDS * 1000);

  const [created] = await db
    .insert(matches)
    .values({
      code,
      status: "COUNTDOWN",
      ticketPriceCents: TICKET_PRICE_CENTS,
      playerAId: user.id,
      playerAHandle: user.handle,
      playerATickets: initialTickets,
      playerAThrows: JSON.stringify(initialThrows),
      playerALocked: false,
      playerBId: bot.id,
      playerBHandle: bot.handle,
      playerBTickets: botTickets,
      playerBThrows: JSON.stringify(botThrows),
      playerBLocked: false,
      countdownEndsAt,
      totalPotCents: pot.grossPotCents,
      houseCutCents: pot.houseCutCents,
      payoutCents: pot.winnerPayoutCents,
    })
    .returning();

  return created;
}

/**
 * Join a WAITING match by ID or Code -> transitions match to 15-second COUNTDOWN
 */
export async function joinWaitingMatch(
  matchId: number,
  user: User,
  tickets = 1,
  throws?: Throw[]
): Promise<Match> {
  await ensureDbReady();
  const [existing] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!existing) {
    throw new Error("Match not found");
  }
  if (existing.status !== "WAITING") {
    return existing;
  }
  if (existing.playerAId === user.id) {
    return existing;
  }

  const safeTickets = Math.max(1, Math.floor(tickets));
  if (user.balanceCents < safeTickets * TICKET_PRICE_CENTS) {
    throw new Error("Insufficient balance to join this match.");
  }

  const safeThrows = normalizeThrows(
    throws || generateThrowsByStrategy(safeTickets, "BALANCED"),
    safeTickets
  );

  // Check if Player A is a seeded bot; if so, mark Player A ready when countdown expires
  const pot = calculatePot(existing.playerATickets, safeTickets);
  const countdownEndsAt = new Date(Date.now() + COUNTDOWN_SECONDS * 1000);

  const [updated] = await db
    .update(matches)
    .set({
      status: "COUNTDOWN",
      playerBId: user.id,
      playerBHandle: user.handle,
      playerBTickets: safeTickets,
      playerBThrows: JSON.stringify(safeThrows),
      playerBLocked: false,
      countdownEndsAt,
      totalPotCents: pot.grossPotCents,
      houseCutCents: pot.houseCutCents,
      payoutCents: pot.winnerPayoutCents,
    })
    .where(eq(matches.id, matchId))
    .returning();

  return updated;
}

/**
 * Update a player's ticket count X and assigned throws during WAITING or COUNTDOWN.
 * If lockIn === true, marks that player's line as locked.
 */
export async function updateMatchTicketsAndThrows(
  matchId: number,
  user: User,
  tickets: number,
  throws: Throw[],
  lockIn = false
): Promise<Match> {
  await ensureDbReady();
  const [m] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!m) {
    throw new Error("Match not found");
  }

  if (m.status === "COMPLETED" || m.status === "VOIDED") {
    return m;
  }

  const isPlayerA = m.playerAId === user.id;
  const isPlayerB = m.playerBId === user.id;

  if (!isPlayerA && !isPlayerB) {
    throw new Error("You are not a participant in this match.");
  }

  const safeTickets = Math.max(1, Math.min(500, Math.floor(tickets || 1)));
  const stakeCents = safeTickets * TICKET_PRICE_CENTS;

  if (user.balanceCents < stakeCents) {
    throw new Error(
      `Insufficient wallet balance ($${(user.balanceCents / 100).toFixed(
        2
      )}) for ${safeTickets} tickets ($${(stakeCents / 100).toFixed(
        2
      )}). Top up in Wallet or lower ticket count.`
    );
  }

  const normalizedThrows = normalizeThrows(throws, safeTickets);

  // Check if opponent is a bot so that if the human locks in, the bot also locks in
  const oppId = isPlayerA ? m.playerBId : m.playerAId;
  let oppIsBot = false;
  if (oppId) {
    const [opp] = await db
      .select()
      .from(users)
      .where(eq(users.id, oppId))
      .limit(1);
    if (opp?.isBot) oppIsBot = true;
  }

  const newTicketsA = isPlayerA ? safeTickets : m.playerATickets;
  const newTicketsB = isPlayerB ? safeTickets : m.playerBTickets;
  const pot = calculatePot(newTicketsA, newTicketsB);

  const updateData: Partial<typeof matches.$inferInsert> = {
    totalPotCents: pot.grossPotCents,
    houseCutCents: pot.houseCutCents,
    payoutCents: pot.winnerPayoutCents,
  };

  if (isPlayerA) {
    updateData.playerATickets = safeTickets;
    updateData.playerAThrows = JSON.stringify(normalizedThrows);
    if (lockIn) {
      updateData.playerALocked = true;
      if (oppIsBot && m.status === "COUNTDOWN") {
        updateData.playerBLocked = true;
      }
    }
  } else {
    updateData.playerBTickets = safeTickets;
    updateData.playerBThrows = JSON.stringify(normalizedThrows);
    if (lockIn) {
      updateData.playerBLocked = true;
      if (oppIsBot && m.status === "COUNTDOWN") {
        updateData.playerALocked = true;
      }
    }
  }

  const [updated] = await db
    .update(matches)
    .set(updateData)
    .where(eq(matches.id, matchId))
    .returning();

  return checkAndSettleMatch(updated.id);
}

/**
 * Checks if a match in COUNTDOWN should be settled (either both players locked OR countdown timer expired).
 * Performs atomic settlement: deducts stakes, resolves multi-ticket RPS + byes, books 10% house cut,
 * and pays 90% pot to winner's wallet balance with full transaction ledger rows.
 */
export async function checkAndSettleMatch(
  matchId: number,
  forceExpire = false
): Promise<Match> {
  await ensureDbReady();
  const [m] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!m) throw new Error("Match not found");
  if (m.status !== "COUNTDOWN" || !m.playerBId) {
    return m;
  }

  const now = Date.now();
  const endsAt = m.countdownEndsAt ? new Date(m.countdownEndsAt).getTime() : 0;
  const timerExpired = endsAt > 0 && now >= endsAt;
  const bothLocked = m.playerALocked && m.playerBLocked;

  if (!bothLocked && !timerExpired && !forceExpire) {
    return m;
  }

  // Fetch both players
  const [pA] = await db
    .select()
    .from(users)
    .where(eq(users.id, m.playerAId))
    .limit(1);
  const [pB] = await db
    .select()
    .from(users)
    .where(eq(users.id, m.playerBId))
    .limit(1);

  if (!pA || !pB) {
    return m;
  }

  // Clamp tickets to what each player can afford (minimum 1 ticket)
  const maxAffordableA = Math.max(
    1,
    Math.floor(pA.balanceCents / TICKET_PRICE_CENTS)
  );
  const maxAffordableB = Math.max(
    1,
    Math.floor(pB.balanceCents / TICKET_PRICE_CENTS)
  );

  const finalTicketsA = Math.min(m.playerATickets, maxAffordableA);
  const finalTicketsB = Math.min(m.playerBTickets, maxAffordableB);

  let parsedThrowsA: Throw[] = ["R"];
  let parsedThrowsB: Throw[] = ["R"];
  try {
    parsedThrowsA = normalizeThrows(JSON.parse(m.playerAThrows), finalTicketsA);
  } catch {
    parsedThrowsA = normalizeThrows(["R"], finalTicketsA);
  }
  try {
    parsedThrowsB = normalizeThrows(JSON.parse(m.playerBThrows), finalTicketsB);
  } catch {
    parsedThrowsB = normalizeThrows(["R"], finalTicketsB);
  }

  const pot = calculatePot(finalTicketsA, finalTicketsB);
  const resolution = resolveShowdown(parsedThrowsA, parsedThrowsB);
  const winner = resolution.winnerSide === "A" ? pA : pB;
  const loser = resolution.winnerSide === "A" ? pB : pA;

  // Update match row only if still COUNTDOWN
  const [settledMatch] = await db
    .update(matches)
    .set({
      status: "COMPLETED",
      playerATickets: finalTicketsA,
      playerAThrows: JSON.stringify(parsedThrowsA),
      playerALocked: true,
      playerBTickets: finalTicketsB,
      playerBThrows: JSON.stringify(parsedThrowsB),
      playerBLocked: true,
      totalPotCents: pot.grossPotCents,
      houseCutCents: pot.houseCutCents,
      payoutCents: pot.winnerPayoutCents,
      winnerId: winner.id,
      winnerSide: resolution.winnerSide,
      resolutionJson: JSON.stringify(resolution),
      completedAt: new Date(),
    })
    .where(and(eq(matches.id, m.id), eq(matches.status, "COUNTDOWN")))
    .returning();

  if (!settledMatch) {
    // Another request already settled it
    const [latest] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, m.id))
      .limit(1);
    return latest;
  }

  // Update Player A balance & stats
  const balanceAfterStakeA = Math.max(0, pA.balanceCents - pot.stakeACents);
  const finalBalanceA =
    resolution.winnerSide === "A"
      ? balanceAfterStakeA + pot.winnerPayoutCents
      : balanceAfterStakeA;

  await db
    .update(users)
    .set({
      balanceCents: finalBalanceA,
      totalWageredCents: pA.totalWageredCents + pot.stakeACents,
      totalWonCents:
        resolution.winnerSide === "A"
          ? pA.totalWonCents + pot.winnerPayoutCents
          : pA.totalWonCents,
      wins: resolution.winnerSide === "A" ? pA.wins + 1 : pA.wins,
      losses: resolution.winnerSide === "B" ? pA.losses + 1 : pA.losses,
    })
    .where(eq(users.id, pA.id));

  // Update Player B balance & stats
  const balanceAfterStakeB = Math.max(0, pB.balanceCents - pot.stakeBCents);
  const finalBalanceB =
    resolution.winnerSide === "B"
      ? balanceAfterStakeB + pot.winnerPayoutCents
      : balanceAfterStakeB;

  await db
    .update(users)
    .set({
      balanceCents: finalBalanceB,
      totalWageredCents: pB.totalWageredCents + pot.stakeBCents,
      totalWonCents:
        resolution.winnerSide === "B"
          ? pB.totalWonCents + pot.winnerPayoutCents
          : pB.totalWonCents,
      wins: resolution.winnerSide === "B" ? pB.wins + 1 : pB.wins,
      losses: resolution.winnerSide === "A" ? pB.losses + 1 : pB.losses,
    })
    .where(eq(users.id, pB.id));

  // Write Stake & Payout rows in walletTransactions
  await db.insert(walletTransactions).values([
    {
      userId: pA.id,
      userHandle: pA.handle,
      type: "MATCH_STAKE",
      amountCents: -pot.stakeACents,
      balanceAfterCents: balanceAfterStakeA,
      matchId: settledMatch.id,
      matchCode: settledMatch.code,
      destination: `Match #${settledMatch.code}`,
      note: `Locked ${finalTicketsA} ticket(s) ($${(
        pot.stakeACents / 100
      ).toFixed(2)}) in #${settledMatch.code}`,
    },
    {
      userId: pB.id,
      userHandle: pB.handle,
      type: "MATCH_STAKE",
      amountCents: -pot.stakeBCents,
      balanceAfterCents: balanceAfterStakeB,
      matchId: settledMatch.id,
      matchCode: settledMatch.code,
      destination: `Match #${settledMatch.code}`,
      note: `Locked ${finalTicketsB} ticket(s) ($${(
        pot.stakeBCents / 100
      ).toFixed(2)}) in #${settledMatch.code}`,
    },
    {
      userId: winner.id,
      userHandle: winner.handle,
      type: "MATCH_PAYOUT",
      amountCents: pot.winnerPayoutCents,
      balanceAfterCents:
        resolution.winnerSide === "A" ? finalBalanceA : finalBalanceB,
      matchId: settledMatch.id,
      matchCode: settledMatch.code,
      destination: winner.cashtag || "In-App Balance",
      note: `Won #${settledMatch.code} (${finalTicketsA}v${finalTicketsB} tickets) — Instant 90% Payout ($${(
        pot.winnerPayoutCents / 100
      ).toFixed(2)}) after 10% House Cut ($${(
        pot.houseCutCents / 100
      ).toFixed(2)})`,
    },
  ]);

  // Book 10% House Cut in houseLedger
  await db.insert(houseLedger).values({
    matchId: settledMatch.id,
    matchCode: settledMatch.code,
    totalTickets: pot.totalTickets,
    grossPotCents: pot.grossPotCents,
    houseCutCents: pot.houseCutCents,
    winnerPayoutCents: pot.winnerPayoutCents,
    winnerHandle: winner.handle,
    loserHandle: loser.handle,
  });

  // Broadcast showdown victory to the live floor feed
  try {
    await db.insert(floorMessages).values({
      userId: winner.id,
      userHandle: winner.handle,
      cashtag: winner.cashtag || "",
      message: `Won $${(pot.winnerPayoutCents / 100).toFixed(
        2
      )} (90% pot) vs @${loser.handle} in #${
        settledMatch.code
      } (${finalTicketsA}v${finalTicketsB} tickets — ${
        resolution.summaryHeadline
      })`,
      matchCode: settledMatch.code,
      ticketsOffered:
        resolution.winnerSide === "A" ? finalTicketsA : finalTicketsB,
    });
  } catch {
    // non-fatal
  }

  return settledMatch;
}

/**
 * Sanitize match state for client response so an opponent's throws/ticket count
 * cannot be peeked before the countdown locks & completes, unless the viewer IS that side.
 */
export function serializeMatchForViewer(match: Match, viewerUserId?: number) {
  const isCompleted = match.status === "COMPLETED" || match.status === "VOIDED";
  const isPlayerA = viewerUserId === match.playerAId;
  const isPlayerB = viewerUserId === match.playerBId;

  let throwsA: Throw[] = [];
  let throwsB: Throw[] = [];
  try {
    throwsA = JSON.parse(match.playerAThrows);
  } catch {
    throwsA = ["R"];
  }
  try {
    throwsB = JSON.parse(match.playerBThrows);
  } catch {
    throwsB = ["R"];
  }

  let resolution = null;
  if (isCompleted && match.resolutionJson) {
    try {
      resolution = JSON.parse(match.resolutionJson);
    } catch {
      resolution = null;
    }
  }

  return {
    id: match.id,
    code: match.code,
    status: match.status,
    ticketPriceCents: match.ticketPriceCents,
    playerAId: match.playerAId,
    playerAHandle: match.playerAHandle,
    playerATickets: match.playerATickets,
    playerAThrows: isCompleted || isPlayerA ? throwsA : [],
    playerALocked: match.playerALocked,
    playerBId: match.playerBId,
    playerBHandle: match.playerBHandle,
    playerBTickets: match.playerBTickets,
    playerBThrows: isCompleted || isPlayerB ? throwsB : [],
    playerBLocked: match.playerBLocked,
    countdownEndsAt: match.countdownEndsAt
      ? new Date(match.countdownEndsAt).toISOString()
      : null,
    totalPotCents: match.totalPotCents,
    houseCutCents: match.houseCutCents,
    payoutCents: match.payoutCents,
    winnerId: match.winnerId,
    winnerSide: match.winnerSide,
    resolution,
    createdAt: new Date(match.createdAt).toISOString(),
    completedAt: match.completedAt
      ? new Date(match.completedAt).toISOString()
      : null,
    viewerRole: isPlayerA ? "A" : isPlayerB ? "B" : "SPECTATOR",
  };
}
