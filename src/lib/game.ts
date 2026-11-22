export type Throw = "R" | "P" | "S";

export const TICKET_PRICE_CENTS = 500; // $5.00 per ticket
export const HOUSE_CUT_RATE = 0.1; // 10% house cut
export const COUNTDOWN_SECONDS = 15; // 15-second live ticket selection window
export const MIN_TICKETS = 1;
export const MAX_TICKETS = 500; // Uncapped X tickets up to 500 per hand

export const THROW_META: Record<
  Throw,
  { name: string; short: string; beats: Throw; verb: string; code: string }
> = {
  R: {
    name: "ROCK",
    short: "RCK",
    beats: "S",
    verb: "crushes",
    code: "01-R",
  },
  P: {
    name: "PAPER",
    short: "PPR",
    beats: "R",
    verb: "covers",
    code: "02-P",
  },
  S: {
    name: "SCISSORS",
    short: "SCS",
    beats: "P",
    verb: "cuts",
    code: "03-S",
  },
};

export function compareThrows(a: Throw, b: Throw): 1 | -1 | 0 {
  if (a === b) return 0;
  if (THROW_META[a].beats === b) return 1;
  return -1;
}

export function normalizeThrows(raw: unknown, count: number): Throw[] {
  const safeCount = Math.max(MIN_TICKETS, Math.min(MAX_TICKETS, Math.floor(count || 1)));
  const valid: Throw[] = ["R", "P", "S"];
  const arr = Array.isArray(raw) ? raw : [];
  const result: Throw[] = [];
  for (let i = 0; i < safeCount; i++) {
    const val = arr[i];
    if (val === "R" || val === "P" || val === "S") {
      result.push(val);
    } else {
      result.push(valid[i % 3]);
    }
  }
  return result;
}

export type ThrowStrategy =
  | "BALANCED"
  | "RANDOM"
  | "ALL_R"
  | "ALL_P"
  | "ALL_S";

export function generateThrowsByStrategy(
  count: number,
  strategy: ThrowStrategy = "BALANCED"
): Throw[] {
  const safeCount = Math.max(MIN_TICKETS, Math.min(MAX_TICKETS, Math.floor(count || 1)));
  const cycle: Throw[] = ["R", "P", "S"];
  const out: Throw[] = [];
  for (let i = 0; i < safeCount; i++) {
    if (strategy === "BALANCED") {
      out.push(cycle[i % 3]);
    } else if (strategy === "ALL_R") {
      out.push("R");
    } else if (strategy === "ALL_P") {
      out.push("P");
    } else if (strategy === "ALL_S") {
      out.push("S");
    } else {
      out.push(cycle[Math.floor(Math.random() * 3)]);
    }
  }
  return out;
}

export interface PotBreakdown {
  ticketsA: number;
  ticketsB: number;
  totalTickets: number;
  stakeACents: number;
  stakeBCents: number;
  grossPotCents: number;
  houseCutCents: number;
  winnerPayoutCents: number;
  netProfitWinnerACents: number;
  netProfitWinnerBCents: number;
}

export function calculatePot(ticketsA: number, ticketsB: number): PotBreakdown {
  const a = Math.max(1, Math.floor(ticketsA));
  const b = Math.max(1, Math.floor(ticketsB));
  const totalTickets = a + b;
  const stakeACents = a * TICKET_PRICE_CENTS;
  const stakeBCents = b * TICKET_PRICE_CENTS;
  const grossPotCents = totalTickets * TICKET_PRICE_CENTS;
  const houseCutCents = Math.round(grossPotCents * HOUSE_CUT_RATE);
  const winnerPayoutCents = grossPotCents - houseCutCents;

  return {
    ticketsA: a,
    ticketsB: b,
    totalTickets,
    stakeACents,
    stakeBCents,
    grossPotCents,
    houseCutCents,
    winnerPayoutCents,
    netProfitWinnerACents: winnerPayoutCents - stakeACents,
    netProfitWinnerBCents: winnerPayoutCents - stakeBCents,
  };
}

export interface OutnumberBounds {
  myTickets: number;
  oppTickets: number;
  pairedBouts: number;
  myByes: number;
  oppByes: number;
  netByes: number;
  minNet: number; // Worst-case net score if every paired bout is lost
  midNet: number; // Expected net score if paired bouts split evenly
  maxNet: number; // Best-case net score if every paired bout is won
  guaranteedWin: boolean;
  canTieOrWin: boolean;
  ticketsNeededToGuaranteeWin: number;
}

export function computeOutnumberBounds(
  myTickets: number,
  oppTickets: number
): OutnumberBounds {
  const a = Math.max(1, Math.floor(myTickets));
  const b = Math.max(1, Math.floor(oppTickets));
  const pairedBouts = Math.min(a, b);
  const myByes = Math.max(0, a - b);
  const oppByes = Math.max(0, b - a);
  const netByes = myByes - oppByes;
  const minNet = netByes - pairedBouts;
  const midNet = netByes;
  const maxNet = netByes + pairedBouts;

  // To guarantee minNet >= 1 against oppTickets = b:
  // (a - b) - b >= 1  =>  a >= 2*b + 1
  const ticketsNeededToGuaranteeWin = 2 * b + 1;

  return {
    myTickets: a,
    oppTickets: b,
    pairedBouts,
    myByes,
    oppByes,
    netByes,
    minNet,
    midNet,
    maxNet,
    guaranteedWin: minNet > 0,
    canTieOrWin: maxNet >= 0,
    ticketsNeededToGuaranteeWin,
  };
}

export interface BoutResult {
  boutNumber: number;
  throwA: Throw;
  throwB: Throw;
  winner: "A" | "B" | "TIE";
  deltaA: 1 | -1 | 0;
  headline: string;
}

export interface ByeTicketResult {
  ticketNumber: number;
  side: "A" | "B";
  throwAssigned: Throw;
  note: string;
}

export interface TiebreakerResult {
  played: boolean;
  rounds: Array<{ round: number; throwA: Throw; throwB: Throw; winner: "A" | "B" | "TIE" }>;
  winner?: "A" | "B";
}

export interface MatchResolution {
  ticketsA: number;
  ticketsB: number;
  throwsA: Throw[];
  throwsB: Throw[];
  pairedCount: number;
  bouts: BoutResult[];
  byesA: number;
  byesB: number;
  byeTickets: ByeTicketResult[];
  boutWinsA: number;
  boutWinsB: number;
  boutTies: number;
  totalScoreA: number;
  totalScoreB: number;
  netScoreA: number; // totalScoreA - totalScoreB
  boundsA: OutnumberBounds;
  tiebreaker: TiebreakerResult;
  winnerSide: "A" | "B";
  summaryHeadline: string;
}

export function resolveShowdown(
  rawThrowsA: Throw[],
  rawThrowsB: Throw[]
): MatchResolution {
  const throwsA = rawThrowsA.length > 0 ? rawThrowsA : (["R"] as Throw[]);
  const throwsB = rawThrowsB.length > 0 ? rawThrowsB : (["R"] as Throw[]);
  const ticketsA = throwsA.length;
  const ticketsB = throwsB.length;
  const pairedCount = Math.min(ticketsA, ticketsB);

  const bouts: BoutResult[] = [];
  let boutWinsA = 0;
  let boutWinsB = 0;
  let boutTies = 0;

  for (let i = 0; i < pairedCount; i++) {
    const tA = throwsA[i];
    const tB = throwsB[i];
    const cmp = compareThrows(tA, tB);
    if (cmp === 1) {
      boutWinsA++;
      bouts.push({
        boutNumber: i + 1,
        throwA: tA,
        throwB: tB,
        winner: "A",
        deltaA: 1,
        headline: `${THROW_META[tA].name} ${THROW_META[tA].verb} ${THROW_META[tB].name}`,
      });
    } else if (cmp === -1) {
      boutWinsB++;
      bouts.push({
        boutNumber: i + 1,
        throwA: tA,
        throwB: tB,
        winner: "B",
        deltaA: -1,
        headline: `${THROW_META[tB].name} ${THROW_META[tB].verb} ${THROW_META[tA].name}`,
      });
    } else {
      boutTies++;
      bouts.push({
        boutNumber: i + 1,
        throwA: tA,
        throwB: tB,
        winner: "TIE",
        deltaA: 0,
        headline: `${THROW_META[tA].name} mirrors ${THROW_META[tB].name} (Push)`,
      });
    }
  }

  const byesA = Math.max(0, ticketsA - ticketsB);
  const byesB = Math.max(0, ticketsB - ticketsA);
  const byeTickets: ByeTicketResult[] = [];

  if (byesA > 0) {
    for (let i = pairedCount; i < ticketsA; i++) {
      byeTickets.push({
        ticketNumber: i + 1,
        side: "A",
        throwAssigned: throwsA[i],
        note: `Uncontested Outnumber Ticket #${i + 1} (${THROW_META[throwsA[i]].name}) → +1 Automatic Point`,
      });
    }
  } else if (byesB > 0) {
    for (let i = pairedCount; i < ticketsB; i++) {
      byeTickets.push({
        ticketNumber: i + 1,
        side: "B",
        throwAssigned: throwsB[i],
        note: `Uncontested Outnumber Ticket #${i + 1} (${THROW_META[throwsB[i]].name}) → +1 Automatic Point`,
      });
    }
  }

  const totalScoreA = boutWinsA + byesA;
  const totalScoreB = boutWinsB + byesB;
  const netScoreA = totalScoreA - totalScoreB;
  const boundsA = computeOutnumberBounds(ticketsA, ticketsB);

  const tiebreaker: TiebreakerResult = {
    played: false,
    rounds: [],
  };

  let winnerSide: "A" | "B" = "A";
  if (netScoreA > 0) {
    winnerSide = "A";
  } else if (netScoreA < 0) {
    winnerSide = "B";
  } else {
    // Sudden-death tiebreaker when netScoreA === 0
    tiebreaker.played = true;
    const pool: Throw[] = ["R", "P", "S"];
    for (let r = 1; r <= 7; r++) {
      const tA = pool[Math.floor(Math.random() * 3)];
      let tB = pool[Math.floor(Math.random() * 3)];
      if (r === 7 && tA === tB) {
        tB = tA === "R" ? "S" : tA === "P" ? "R" : "P";
      }
      const cmp = compareThrows(tA, tB);
      const roundWinner = cmp === 1 ? "A" : cmp === -1 ? "B" : "TIE";
      tiebreaker.rounds.push({
        round: r,
        throwA: tA,
        throwB: tB,
        winner: roundWinner,
      });
      if (roundWinner !== "TIE") {
        tiebreaker.winner = roundWinner;
        winnerSide = roundWinner;
        break;
      }
    }
  }

  const summaryHeadline =
    netScoreA !== 0
      ? `Side ${winnerSide} wins ${Math.max(totalScoreA, totalScoreB)}–${Math.min(
          totalScoreA,
          totalScoreB
        )} (Net ${netScoreA > 0 ? `+${netScoreA}` : netScoreA}, Byes: ${
          byesA > 0 ? `+${byesA} A` : byesB > 0 ? `+${byesB} B` : "Even"
        })`
      : `Dead heat ${totalScoreA}–${totalScoreB} settled in Sudden-Death OT Round #${tiebreaker.rounds.length} for Side ${winnerSide}`;

  return {
    ticketsA,
    ticketsB,
    throwsA,
    throwsB,
    pairedCount,
    bouts,
    byesA,
    byesB,
    byeTickets,
    boutWinsA,
    boutWinsB,
    boutTies,
    totalScoreA,
    totalScoreB,
    netScoreA,
    boundsA,
    tiebreaker,
    winnerSide,
    summaryHeadline,
  };
}

export interface MonteCarloResult {
  ticketsA: number;
  ticketsB: number;
  trials: number;
  winRateA: number;
  winRateB: number;
  tiebreakerRate: number;
  avgNetScoreA: number;
  pot: PotBreakdown;
  evACents: number;
  evBCents: number;
  roiAPercent: number;
  bounds: OutnumberBounds;
}

export function runMonteCarloSim(
  ticketsA: number,
  ticketsB: number,
  trials = 2000,
  strategyA: ThrowStrategy = "BALANCED",
  strategyB: ThrowStrategy = "RANDOM"
): MonteCarloResult {
  const safeTrials = Math.max(100, Math.min(20000, trials));
  let winsA = 0;
  let winsB = 0;
  let tiebreakers = 0;
  let totalNetA = 0;

  for (let t = 0; t < safeTrials; t++) {
    const tA = generateThrowsByStrategy(ticketsA, strategyA);
    const tB = generateThrowsByStrategy(ticketsB, strategyB);
    const res = resolveShowdown(tA, tB);
    totalNetA += res.netScoreA;
    if (res.tiebreaker.played) tiebreakers++;
    if (res.winnerSide === "A") winsA++;
    else winsB++;
  }

  const winRateA = winsA / safeTrials;
  const winRateB = winsB / safeTrials;
  const tiebreakerRate = tiebreakers / safeTrials;
  const avgNetScoreA = totalNetA / safeTrials;
  const pot = calculatePot(ticketsA, ticketsB);
  const bounds = computeOutnumberBounds(ticketsA, ticketsB);

  const evACents = Math.round(winRateA * pot.winnerPayoutCents - pot.stakeACents);
  const evBCents = Math.round(winRateB * pot.winnerPayoutCents - pot.stakeBCents);
  const roiAPercent = (evACents / pot.stakeACents) * 100;

  return {
    ticketsA,
    ticketsB,
    trials: safeTrials,
    winRateA,
    winRateB,
    tiebreakerRate,
    avgNetScoreA,
    pot,
    evACents,
    evBCents,
    roiAPercent,
    bounds,
  };
}

export function formatUSD(cents: number, showPlus = false): string {
  const sign = cents < 0 ? "-" : showPlus && cents > 0 ? "+" : "";
  const abs = Math.abs(cents) / 100;
  return `${sign}$${abs.toFixed(2)}`;
}
