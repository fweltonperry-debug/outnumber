import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  handle: text("handle").notNull().unique(),
  email: text("email").notNull().default(""),
  passwordHash: text("password_hash").notNull().default(""),
  cashtag: text("cashtag").notNull().default(""),
  sessionToken: text("session_token").notNull().unique(),
  recoveryCode: text("recovery_code").notNull().unique(),
  balanceCents: integer("balance_cents").notNull().default(10000), // $100.00 default starting bankroll
  totalDepositedCents: integer("total_deposited_cents").notNull().default(10000),
  totalWithdrawnCents: integer("total_withdrawn_cents").notNull().default(0),
  totalWageredCents: integer("total_wagered_cents").notNull().default(0),
  totalWonCents: integer("total_won_cents").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  isBot: boolean("is_bot").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  ageVerified: boolean("age_verified").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  status: text("status").notNull().default("WAITING"), // WAITING | COUNTDOWN | COMPLETED | VOIDED
  ticketPriceCents: integer("ticket_price_cents").notNull().default(500), // $5.00 per ticket
  playerAId: integer("player_a_id").notNull(),
  playerAHandle: text("player_a_handle").notNull(),
  playerATickets: integer("player_a_tickets").notNull().default(1),
  playerAThrows: text("player_a_throws").notNull().default('["R"]'),
  playerALocked: boolean("player_a_locked").notNull().default(false),
  playerBId: integer("player_b_id"),
  playerBHandle: text("player_b_handle"),
  playerBTickets: integer("player_b_tickets").notNull().default(1),
  playerBThrows: text("player_b_throws").notNull().default('["R"]'),
  playerBLocked: boolean("player_b_locked").notNull().default(false),
  countdownEndsAt: timestamp("countdown_ends_at"),
  totalPotCents: integer("total_pot_cents").notNull().default(0),
  houseCutCents: integer("house_cut_cents").notNull().default(0),
  payoutCents: integer("payout_cents").notNull().default(0),
  winnerId: integer("winner_id"),
  winnerSide: text("winner_side"), // "A" | "B" | "VOID"
  resolutionJson: text("resolution_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userHandle: text("user_handle").notNull(),
  type: text("type").notNull(), // INITIAL_CREDIT | DEPOSIT | WITHDRAWAL | MATCH_STAKE | MATCH_PAYOUT | MATCH_REFUND | ADMIN_ADJUSTMENT
  amountCents: integer("amount_cents").notNull(),
  balanceAfterCents: integer("balance_after_cents").notNull(),
  matchId: integer("match_id"),
  matchCode: text("match_code"),
  destination: text("destination").notNull().default(""),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const houseLedger = pgTable("house_ledger", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  matchCode: text("match_code").notNull(),
  totalTickets: integer("total_tickets").notNull(),
  grossPotCents: integer("gross_pot_cents").notNull(),
  houseCutCents: integer("house_cut_cents").notNull(),
  winnerPayoutCents: integer("winner_payout_cents").notNull(),
  winnerHandle: text("winner_handle").notNull(),
  loserHandle: text("loser_handle").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cashappRequests = pgTable("cashapp_requests", {
  id: serial("id").primaryKey(),
  referenceCode: text("reference_code").notNull().unique(),
  userId: integer("user_id").notNull(),
  userHandle: text("user_handle").notNull(),
  kind: text("kind").notNull(), // DEPOSIT | PAYOUT | HOUSE_RAKE_PAYOUT
  amountCents: integer("amount_cents").notNull(),
  playerCashtag: text("player_cashtag").notNull(),
  houseCashtag: text("house_cashtag").notNull().default("$stockhunger"),
  status: text("status").notNull().default("COMPLETED"), // PENDING | COMPLETED | REJECTED
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const floorMessages = pgTable("floor_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userHandle: text("user_handle").notNull(),
  cashtag: text("cashtag").notNull().default(""),
  message: text("message").notNull(),
  matchCode: text("match_code"),
  ticketsOffered: integer("tickets_offered"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type HouseLedgerEntry = typeof houseLedger.$inferSelect;
export type CashappRequest = typeof cashappRequests.$inferSelect;
export type FloorMessage = typeof floorMessages.$inferSelect;
