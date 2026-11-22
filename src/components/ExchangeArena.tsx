"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Play,
  Share2,
  Lock,
  Trophy,
  Clock,
  Sparkles,
  Copy,
  Check,
  Layers,
  Shuffle,
  Repeat,
  Landmark,
  Calculator,
  AlertCircle,
  Volume2,
  VolumeX,
  ArrowUpRight,
  CheckCircle2,
  History,
} from "lucide-react";
import {
  formatUSD,
  calculatePot,
  computeOutnumberBounds,
  generateThrowsByStrategy,
  normalizeThrows,
  THROW_META,
  TICKET_PRICE_CENTS,
  type Throw,
  type MatchResolution,
} from "@/lib/game";
import { soundEngine } from "@/lib/sound";
import { ThrowGlyph, TicketTearLine } from "@/components/MutuelGlyphs";
import Rail, { type ClientUser, type ClientLedgerRow } from "@/components/Rail";
import MonteCarloPanel from "@/components/MonteCarloPanel";
import FloorChat from "@/components/FloorChat";
import ShareLaunchModal from "@/components/ShareLaunchModal";

export interface SerializedMatch {
  id: number;
  code: string;
  status: "WAITING" | "COUNTDOWN" | "COMPLETED" | "VOIDED";
  ticketPriceCents: number;
  playerAId: number;
  playerAHandle: string;
  playerATickets: number;
  playerAThrows: Throw[];
  playerALocked: boolean;
  playerBId: number | null;
  playerBHandle: string | null;
  playerBTickets: number;
  playerBThrows: Throw[];
  playerBLocked: boolean;
  countdownEndsAt: string | null;
  totalPotCents: number;
  houseCutCents: number;
  payoutCents: number;
  winnerId: number | null;
  winnerSide: "A" | "B" | "VOID" | null;
  resolution: MatchResolution | null;
  createdAt: string;
  completedAt: string | null;
  viewerRole: "A" | "B" | "SPECTATOR";
}

interface HouseLedgerRow {
  id: number;
  matchId: number;
  matchCode: string;
  totalTickets: number;
  grossPotCents: number;
  houseCutCents: number;
  winnerPayoutCents: number;
  winnerHandle: string;
  loserHandle: string;
  createdAt: string;
}

interface LeaderboardRow {
  id: number;
  handle: string;
  cashtag: string;
  balanceCents: number;
  totalWonCents: number;
  totalWageredCents: number;
  wins: number;
  losses: number;
  isBot: boolean;
}

export default function ExchangeArena({
  initialMatchCode,
}: {
  initialMatchCode?: string;
}) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [ledger, setLedger] = useState<ClientLedgerRow[]>([]);
  const [activeNav, setActiveNav] = useState<
    "ARENA" | "BOOK" | "MY_SLIPS" | "HOUSE" | "LEADERBOARD" | "SIMULATOR"
  >("ARENA");

  // Matchmaking & Live Match state
  const [currentMatch, setCurrentMatch] = useState<SerializedMatch | null>(null);
  const [queueConnecting, setQueueConnecting] = useState(false);
  const [ticketsX, setTicketsX] = useState<number>(3);
  const [customXInput, setCustomXInput] = useState<string>("3");
  const [throwsList, setThrowsList] = useState<Throw[]>(["R", "P", "S"]);
  const [remainingMs, setRemainingMs] = useState<number>(15000);
  const [lockingIn, setLockingIn] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [houseSweepBanner, setHouseSweepBanner] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState<string>("");
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(false);

  // Floor feeds
  const [openMatches, setOpenMatches] = useState<SerializedMatch[]>([]);
  const [completedMatches, setCompletedMatches] = useState<SerializedMatch[]>(
    []
  );
  const [myMatches, setMyMatches] = useState<SerializedMatch[]>([]);
  const [houseLedger, setHouseLedger] = useState<HouseLedgerRow[]>([]);
  const [houseSummary, setHouseSummary] = useState({
    totalHouseCutCents: 0,
    totalGrossPotCents: 0,
    totalWinnerPayoutCents: 0,
    totalTicketsDealt: 0,
    matchCount: 0,
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const settlingRef = useRef<boolean>(false);
  const lastBeepSecondRef = useRef<number>(-1);

  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    soundEngine.muted = next;
  };

  // Sync throwsList length whenever ticketsX changes
  const updateTicketCount = useCallback((newCount: number) => {
    const clamped = Math.max(1, Math.min(500, Math.floor(newCount || 1)));
    setTicketsX(clamped);
    setCustomXInput(String(clamped));
    setThrowsList((prev) => normalizeThrows(prev, clamped));
    soundEngine.playClick();
  }, []);

  const fetchFloorData = useCallback(async () => {
    try {
      const [sessRes, matchesRes] = await Promise.all([
        fetch("/api/session"),
        fetch("/api/matches"),
      ]);
      if (sessRes.ok) {
        const sData = await sessRes.json();
        setUser(sData.user);
        setLedger(sData.ledger || []);
      }
      if (matchesRes.ok) {
        const mData = await matchesRes.json();
        setOpenMatches(mData.openMatches || []);
        setCompletedMatches(mData.completedMatches || []);
        setMyMatches(mData.myMatches || []);
        setHouseLedger(mData.houseLedger || []);
        if (mData.houseSummary) setHouseSummary(mData.houseSummary);
        setLeaderboard(mData.leaderboard || []);
      }
    } catch {
      // silent retry
    }
  }, []);

  const loadSpecificMatch = useCallback(async (codeOrId: string) => {
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(codeOrId)}`);
      if (!res.ok) {
        setErrorBanner(`Match #${codeOrId} was not found.`);
        return;
      }
      const data = await res.json();
      setCurrentMatch(data.match);
      if (data.user) setUser(data.user);
      if (data.ledger) setLedger(data.ledger);
      setActiveNav("ARENA");

      if (data.match.viewerRole === "B") {
        setTicketsX(data.match.playerBTickets);
        setCustomXInput(String(data.match.playerBTickets));
        setThrowsList(
          normalizeThrows(data.match.playerBThrows, data.match.playerBTickets)
        );
      } else {
        setTicketsX(data.match.playerATickets);
        setCustomXInput(String(data.match.playerATickets));
        setThrowsList(
          normalizeThrows(data.match.playerAThrows, data.match.playerATickets)
        );
      }
    } catch {
      setErrorBanner("Could not load match.");
    }
  }, []);

  useEffect(() => {
    fetchFloorData();
    if (initialMatchCode) {
      loadSpecificMatch(initialMatchCode);
    }
  }, [fetchFloorData, initialMatchCode, loadSpecificMatch]);

  // Connect to SSE stream when in WAITING or COUNTDOWN match
  useEffect(() => {
    if (
      !currentMatch ||
      (currentMatch.status !== "WAITING" && currentMatch.status !== "COUNTDOWN")
    ) {
      return;
    }

    const es = new EventSource(`/api/matches/${currentMatch.id}/stream`);
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed.match) {
          setCurrentMatch((prev) => {
            if (
              prev?.status !== "COMPLETED" &&
              parsed.match.status === "COMPLETED"
            ) {
              soundEngine.playVictory();
              fetchFloorData();
            }
            return parsed.match;
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      es.close();
    };
  }, [currentMatch?.id, currentMatch?.status, fetchFloorData]);

  // Live 100ms countdown clock for 15-second ticket selection rush
  useEffect(() => {
    if (!currentMatch || currentMatch.status !== "COUNTDOWN") {
      settlingRef.current = false;
      lastBeepSecondRef.current = -1;
      return;
    }

    const tick = async () => {
      const endsAt = currentMatch.countdownEndsAt
        ? new Date(currentMatch.countdownEndsAt).getTime()
        : Date.now() + 15000;
      const diff = Math.max(0, endsAt - Date.now());
      setRemainingMs(diff);

      const wholeSec = Math.ceil(diff / 1000);
      if (
        wholeSec <= 5 &&
        wholeSec >= 1 &&
        wholeSec !== lastBeepSecondRef.current
      ) {
        lastBeepSecondRef.current = wholeSec;
        soundEngine.playCountdownBeep(wholeSec <= 2);
      }

      if (diff <= 0 && !settlingRef.current) {
        settlingRef.current = true;
        soundEngine.playLockIn();
        try {
          const res = await fetch(`/api/matches/${currentMatch.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tickets: ticketsX,
              throws: throwsList,
              lockIn: true,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setCurrentMatch(data.match);
            if (data.user) setUser(data.user);
            if (data.ledger) setLedger(data.ledger);
            soundEngine.playVictory();
            fetchFloorData();
          }
        } catch {
          // fallback settle
        }
      }
    };

    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [
    currentMatch?.id,
    currentMatch?.status,
    currentMatch?.countdownEndsAt,
    ticketsX,
    throwsList,
    fetchFloorData,
  ]);

  // Sync ticket selection to server while adjusting during COUNTDOWN
  const syncSelectionDuringCountdown = async (
    newTickets: number,
    newThrows: Throw[],
    lockNow = false
  ) => {
    if (!currentMatch || currentMatch.status !== "COUNTDOWN") return;
    if (lockNow) {
      setLockingIn(true);
      soundEngine.playLockIn();
    }
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/matches/${currentMatch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickets: newTickets,
          throws: newThrows,
          lockIn: lockNow,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.error || "Could not update tickets");
      } else {
        setCurrentMatch(data.match);
        if (data.user) setUser(data.user);
        if (data.ledger) setLedger(data.ledger);
        if (data.match.status === "COMPLETED") {
          soundEngine.playVictory();
          fetchFloorData();
        }
      }
    } catch {
      setErrorBanner("Failed to sync ticket selection.");
    } finally {
      if (lockNow) setLockingIn(false);
    }
  };

  // Hit PLAY -> Enter Queue -> Connect to opponent -> 15-second Countdown starts!
  const handleHitPlayQueue = async (
    mode: "INSTANT_QUEUE" | "CREATE_ROOM" = "INSTANT_QUEUE"
  ) => {
    setErrorBanner(null);
    setQueueConnecting(true);
    settlingRef.current = false;
    soundEngine.playClick();
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          tickets: ticketsX,
          throws: throwsList,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.error || "Could not start match.");
      } else {
        setCurrentMatch(data.match);
        if (data.user) setUser(data.user);
        setRemainingMs(15000);
        fetchFloorData();
      }
    } catch {
      setErrorBanner("Network error while entering queue.");
    } finally {
      setQueueConnecting(false);
    }
  };

  // Join an open WAITING match from the order book
  const handleJoinOpenMatch = async (matchIdOrCode: number | string) => {
    setErrorBanner(null);
    setQueueConnecting(true);
    soundEngine.playClick();
    try {
      const res = await fetch(`/api/matches/${matchIdOrCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickets: ticketsX,
          throws: throwsList,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorBanner(data.error || "Could not join match.");
      } else {
        setCurrentMatch(data.match);
        if (data.user) setUser(data.user);
        setActiveNav("ARENA");
        setRemainingMs(15000);
        fetchFloorData();
      }
    } catch {
      setErrorBanner("Failed to join match.");
    } finally {
      setQueueConnecting(false);
    }
  };

  const handleSweepHouseCut = async () => {
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SWEEP_HOUSE_CUT",
          cashtag: "$stockhunger",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setHouseSweepBanner(data.message);
        soundEngine.playVictory();
      } else {
        setErrorBanner(data.error || "Could not sweep house cut.");
      }
    } catch {
      setErrorBanner("Failed to sweep house cut.");
    }
  };

  const handleToggleSingleThrow = (index: number, nextThrow?: Throw) => {
    const cycle: Record<Throw, Throw> = { R: "P", P: "S", S: "R" };
    const updated = [...throwsList];
    updated[index] = nextThrow ? nextThrow : cycle[updated[index] || "R"];
    setThrowsList(updated);
    soundEngine.playClick();
    if (currentMatch?.status === "COUNTDOWN") {
      syncSelectionDuringCountdown(ticketsX, updated, false);
    }
  };

  const handleApplyStrategy = (
    strat: "BALANCED" | "RANDOM" | "ALL_R" | "ALL_P" | "ALL_S"
  ) => {
    const generated = generateThrowsByStrategy(ticketsX, strat);
    setThrowsList(generated);
    soundEngine.playClick();
    if (currentMatch?.status === "COUNTDOWN") {
      syncSelectionDuringCountdown(ticketsX, generated, false);
    }
  };

  const handleChangeTicketsLive = (newCount: number) => {
    const maxAffordable = user
      ? Math.max(1, Math.floor(user.balanceCents / TICKET_PRICE_CENTS))
      : 100;
    const clamped = Math.max(
      1,
      Math.min(maxAffordable, Math.floor(newCount || 1))
    );
    setTicketsX(clamped);
    setCustomXInput(String(clamped));
    const newThrows = normalizeThrows(throwsList, clamped);
    setThrowsList(newThrows);
    soundEngine.playClick();
    if (currentMatch?.status === "COUNTDOWN") {
      syncSelectionDuringCountdown(clamped, newThrows, false);
    }
  };

  const maxAffordableTickets = user
    ? Math.max(1, Math.floor(user.balanceCents / TICKET_PRICE_CENTS))
    : 30;

  const previewOppTickets =
    currentMatch && currentMatch.status === "COMPLETED"
      ? currentMatch.viewerRole === "B"
        ? currentMatch.playerATickets
        : currentMatch.playerBTickets
      : 1;

  const previewBounds = computeOutnumberBounds(ticketsX, previewOppTickets);
  const previewPot = calculatePot(ticketsX, previewOppTickets);

  const shareUrl =
    typeof window !== "undefined" && currentMatch
      ? `${window.location.origin}/m/${currentMatch.code}`
      : currentMatch
      ? `/m/${currentMatch.code}`
      : "";

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      {/* Top Mutuel Ticker & Live Floor Bar */}
      <div className="bg-[#070A0F] border-b border-slate-800/90 px-4 py-2 text-xs font-mono">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#00D632]/15 text-[#00D632] border border-[#00D632]/30 font-bold">
              <span className="w-2 h-2 rounded-full bg-[#00D632] animate-pulse" />
              LIVE EXCHANGE
            </span>
            <span className="text-slate-400">
              ENTRY: <strong className="text-white">$5.00 / TICKET</strong>
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400">
              HOUSE CUT: <strong>10% OF POT</strong>
            </span>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="text-emerald-400 hidden sm:inline">
              HOUSE BOOKED:{" "}
              <strong>{formatUSD(houseSummary.totalHouseCutCents)}</strong> (
              {houseSummary.matchCount} matches)
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <button
              type="button"
              onClick={toggleSound}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 cursor-pointer"
              title="Toggle Arena Sound Effects"
            >
              {soundMuted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" /> Muted
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-[#00D632]" /> Audio On
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              className="px-2.5 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold flex items-center gap-1 cursor-pointer"
            >
              <Share2 className="w-3 h-3" /> Share / Invite Players
            </button>
            <span className="px-2 py-0.5 rounded bg-[#00D632]/10 text-[#00D632] border border-[#00D632]/25">
              CASH APP: $stockhunger
            </span>
            <Link
              href="/admin"
              className="text-slate-300 hover:text-amber-400 underline"
            >
              Admin & Ledger
            </Link>
            <Link
              href="/terms"
              className="text-slate-400 hover:text-white underline"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-slate-400 hover:text-white underline"
            >
              Privacy
            </Link>
          </div>
        </div>
      </div>

      {/* Main Header & Navigation */}
      <header className="border-b border-slate-800 bg-[#0E141F]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              onClick={() => setActiveNav("ARENA")}
              className="flex items-center gap-3 group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00D632] to-emerald-700 flex items-center justify-center text-slate-950 font-mono font-black text-lg shadow-lg shadow-[#00D632]/20">
                X×
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-lg tracking-tight text-white">
                    OUTNUMBER
                  </span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-bold">
                    $5 RPS MUTUEL
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Buy X Tickets • Outnumber Opponent • Instant 90% Pot Payout
                </p>
              </div>
            </Link>
          </div>

          {/* Primary Floor Tabs */}
          <nav className="flex items-center gap-1.5 bg-[#090D14] p-1 rounded-xl border border-slate-800 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveNav("ARENA")}
              className={`px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                activeNav === "ARENA"
                  ? "bg-[#00D632] text-slate-950 shadow"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Play Arena
            </button>
            <button
              type="button"
              onClick={() => setActiveNav("BOOK")}
              className={`px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                activeNav === "BOOK"
                  ? "bg-[#00D632] text-slate-950 shadow"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Open Book ({openMatches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveNav("MY_SLIPS")}
              className={`px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                activeNav === "MY_SLIPS"
                  ? "bg-[#00D632] text-slate-950 shadow"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              My Slips ({myMatches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveNav("LEADERBOARD")}
              className={`px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                activeNav === "LEADERBOARD"
                  ? "bg-[#00D632] text-slate-950 shadow"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              Leaderboard
            </button>
            <button
              type="button"
              onClick={() => setActiveNav("HOUSE")}
              className={`px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                activeNav === "HOUSE"
                  ? "bg-amber-400 text-slate-950 shadow"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Landmark className="w-3.5 h-3.5" />
              10% House Cut
            </button>
            <button
              type="button"
              onClick={() => setActiveNav("SIMULATOR")}
              className={`px-3.5 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer ${
                activeNav === "SIMULATOR"
                  ? "bg-sky-400 text-slate-950 shadow"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              Sim Matrix
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="max-w-7xl w-full mx-auto px-4 py-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Center 8 Columns: Active View */}
        <div className="lg:col-span-8 space-y-6">
          {errorBanner && (
            <div className="p-4 rounded-xl bg-rose-950/90 border border-rose-600/60 text-rose-200 text-sm font-mono flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-xs underline text-rose-300 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeNav === "SIMULATOR" && <MonteCarloPanel />}

          {activeNav === "MY_SLIPS" && (
            <div className="bg-[#121822] border border-slate-800 rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="text-xs font-mono uppercase tracking-widest text-[#00D632]">
                    PERSONAL MUTUEL PORTFOLIO
                  </div>
                  <h2 className="text-xl font-bold text-white mt-0.5">
                    @{user?.handle} Match History & Outnumber Analytics
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveNav("ARENA");
                    handleHitPlayQueue("INSTANT_QUEUE");
                  }}
                  className="px-4 py-2 rounded-xl bg-[#00D632] text-slate-950 font-mono font-black text-xs uppercase cursor-pointer"
                >
                  + Play New 15s Match
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">
                    Match Record
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {user?.wins ?? 0}W – {user?.losses ?? 0}L
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">
                    Total Wagered
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {user ? formatUSD(user.totalWageredCents) : "$0.00"}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">
                    Total Payouts Won
                  </div>
                  <div className="text-2xl font-bold text-[#00D632] mt-1">
                    {user ? formatUSD(user.totalWonCents) : "$0.00"}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">
                    Net Game P&L
                  </div>
                  <div
                    className={`text-2xl font-bold mt-1 ${
                      (user?.totalWonCents ?? 0) -
                        (user?.totalWageredCents ?? 0) >=
                      0
                        ? "text-[#00D632]"
                        : "text-rose-400"
                    }`}
                  >
                    {user
                      ? formatUSD(
                          user.totalWonCents - user.totalWageredCents,
                          true
                        )
                      : "$0.00"}
                  </div>
                </div>
              </div>

              {myMatches.length === 0 ? (
                <div className="p-8 rounded-xl bg-[#0B0F17] border border-slate-800 text-center space-y-3 font-mono">
                  <div className="text-sm text-slate-300">
                    You haven&apos;t locked a match slip yet!
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveNav("ARENA");
                      handleHitPlayQueue("INSTANT_QUEUE");
                    }}
                    className="px-5 py-2.5 rounded-xl bg-[#00D632] text-slate-950 font-black text-xs uppercase cursor-pointer"
                  >
                    Hit PLAY Now (15s Countdown) →
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {myMatches.map((mm) => {
                    const won = mm.winnerId === user?.id;
                    return (
                      <div
                        key={mm.id}
                        className="p-3.5 rounded-xl bg-[#0B0F17] border border-slate-800 flex flex-wrap items-center justify-between gap-3 font-mono text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-amber-400 font-bold">
                              #{mm.code}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                mm.status === "COMPLETED"
                                  ? won
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "bg-rose-500/20 text-rose-300"
                                  : "bg-amber-500/20 text-amber-300"
                              }`}
                            >
                              {mm.status === "COMPLETED"
                                ? won
                                  ? "WON"
                                  : "LOST"
                                : mm.status}
                            </span>
                            <span className="text-white font-bold">
                              @{mm.playerAHandle} ({mm.playerATickets} tix) vs @
                              {mm.playerBHandle || "Waiting"} (
                              {mm.playerBTickets} tix)
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            Gross Pot: {formatUSD(mm.totalPotCents)} • 10% House
                            Cut: {formatUSD(mm.houseCutCents)} • 90% Payout:{" "}
                            <span className="text-[#00D632] font-bold">
                              {formatUSD(mm.payoutCents)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentMatch(mm);
                            setActiveNav("ARENA");
                          }}
                          className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
                        >
                          Inspect Slip →
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeNav === "LEADERBOARD" && (
            <div className="bg-[#121822] border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="text-xs font-mono uppercase tracking-widest text-amber-400">
                    EXCHANGE STANDINGS
                  </div>
                  <h2 className="text-xl font-bold text-white mt-0.5">
                    Top Outnumber Sharp Players
                  </h2>
                </div>
                <Trophy className="w-7 h-7 text-amber-400" />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                      <th className="py-3 px-3">Rank</th>
                      <th className="py-3 px-3">Player</th>
                      <th className="py-3 px-3">$Cashtag</th>
                      <th className="py-3 px-3">W–L</th>
                      <th className="py-3 px-3 text-right">Total Won</th>
                      <th className="py-3 px-3 text-right">Bankroll</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {leaderboard.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={`hover:bg-slate-800/30 ${
                          user?.id === row.id ? "bg-[#00D632]/10" : ""
                        }`}
                      >
                        <td className="py-3 px-3 font-bold text-amber-400">
                          #{idx + 1}
                        </td>
                        <td className="py-3 px-3 font-bold text-white">
                          @{row.handle}
                          {user?.id === row.id && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#00D632] text-slate-950 font-bold">
                              YOU
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[#00D632]">
                          {row.cashtag || "$—"}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-emerald-400 font-bold">
                            {row.wins}W
                          </span>{" "}
                          –{" "}
                          <span className="text-rose-400">{row.losses}L</span>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-[#00D632]">
                          {formatUSD(row.totalWonCents)}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-200">
                          {formatUSD(row.balanceCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeNav === "HOUSE" && (
            <div className="bg-[#121822] border border-slate-800 rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="text-xs font-mono uppercase tracking-widest text-amber-400">
                    PLATFORM OWNER REVENUE BOOK • $stockhunger
                  </div>
                  <h2 className="text-xl font-bold text-white mt-0.5">
                    10% House Rake Ledger (Booked on Every Match)
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSweepHouseCut}
                    className="px-4 py-2 rounded-lg bg-[#00D632] hover:bg-[#00b82b] text-slate-950 font-mono font-black text-xs uppercase flex items-center gap-1.5 cursor-pointer shadow"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Sweep 10% Cut ({formatUSD(
                      houseSummary.totalHouseCutCents
                    )}) to $stockhunger
                  </button>
                  <Link
                    href="/admin"
                    className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-mono font-bold text-xs uppercase"
                  >
                    Full Admin Console →
                  </Link>
                </div>
              </div>

              {houseSweepBanner && (
                <div className="p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 font-mono text-xs flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#00D632]" />
                    {houseSweepBanner}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHouseSweepBanner(null)}
                    className="underline"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-[#0B0F17] border border-amber-500/30">
                  <div className="text-[11px] font-mono text-amber-300 uppercase">
                    Your 10% Cut Earned
                  </div>
                  <div className="text-2xl font-mono font-bold text-amber-400 mt-1">
                    {formatUSD(houseSummary.totalHouseCutCents)}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400 uppercase">
                    Gross Pot Volume
                  </div>
                  <div className="text-2xl font-mono font-bold text-white mt-1">
                    {formatUSD(houseSummary.totalGrossPotCents)}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400 uppercase">
                    90% Paid to Winners
                  </div>
                  <div className="text-2xl font-mono font-bold text-[#00D632] mt-1">
                    {formatUSD(houseSummary.totalWinnerPayoutCents)}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800">
                  <div className="text-[11px] font-mono text-slate-400 uppercase">
                    Tickets Dealt
                  </div>
                  <div className="text-2xl font-mono font-bold text-white mt-1">
                    {houseSummary.totalTicketsDealt} Tix
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                      <th className="py-2.5 px-3">Match</th>
                      <th className="py-2.5 px-3">Winner vs Loser</th>
                      <th className="py-2.5 px-3 text-right">Tickets</th>
                      <th className="py-2.5 px-3 text-right">Gross Pot</th>
                      <th className="py-2.5 px-3 text-right text-amber-400">
                        10% House Cut
                      </th>
                      <th className="py-2.5 px-3 text-right text-[#00D632]">
                        90% Winner Payout
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {houseLedger.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => loadSpecificMatch(h.matchCode)}
                            className="text-amber-400 hover:underline font-bold"
                          >
                            #{h.matchCode}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-slate-200">
                          <span className="text-[#00D632] font-bold">
                            @{h.winnerHandle}
                          </span>{" "}
                          def. @{h.loserHandle}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {h.totalTickets}
                        </td>
                        <td className="py-2.5 px-3 text-right text-white">
                          {formatUSD(h.grossPotCents)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-400">
                          +{formatUSD(h.houseCutCents)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#00D632]">
                          {formatUSD(h.winnerPayoutCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeNav === "BOOK" && (
            <div className="bg-[#121822] border border-slate-800 rounded-2xl p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="text-xs font-mono uppercase tracking-widest text-[#00D632]">
                    LIVE MUTUEL ORDER BOOK
                  </div>
                  <h2 className="text-xl font-bold text-white mt-0.5">
                    Open Waiting Slips & Shareable Room Codes
                  </h2>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) =>
                      setJoinCodeInput(e.target.value.toUpperCase())
                    }
                    placeholder="Enter 6-char code (e.g. WC6Z2Y)"
                    className="px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-700 font-mono text-xs text-white uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (joinCodeInput.trim()) {
                        loadSpecificMatch(joinCodeInput.trim());
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-[#00D632] text-slate-950 font-mono font-bold text-xs uppercase cursor-pointer"
                  >
                    Open Slip
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {openMatches.map((om) => (
                  <div
                    key={om.id}
                    className="p-4 rounded-xl bg-[#F7F3E8] text-slate-900 border-2 border-amber-900/20 shadow-lg flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between font-mono text-xs text-stone-600">
                        <span className="font-bold text-stone-900">
                          SLIP #{om.code}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-700 text-white font-bold text-[10px]">
                          OPEN • WAITING FOR OPPONENT
                        </span>
                      </div>
                      <div className="mt-2 font-bold text-base text-stone-900">
                        @{om.playerAHandle} posted an open challenge
                      </div>
                      <div className="text-xs font-mono text-stone-600 mt-1">
                        Connect to trigger the 15-second countdown & pick your X
                        tickets!
                      </div>
                    </div>
                    <TicketTearLine />
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/m/${om.code}`}
                        className="text-xs font-mono text-stone-600 hover:text-stone-900 underline"
                      >
                        Share link /m/{om.code}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleJoinOpenMatch(om.id)}
                        className="px-4 py-2 rounded-lg bg-[#00D632] hover:bg-[#00b82b] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider shadow cursor-pointer"
                      >
                        Take Match (15s Rush) →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MAIN ARENA VIEW */}
          {activeNav === "ARENA" && (
            <div className="space-y-6">
              {/* STEP-BY-STEP HOW IT WORKS RIBBON */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[#121822] border border-slate-800 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#00D632]/20 text-[#00D632] font-mono font-bold text-xs flex items-center justify-center shrink-0">
                    01
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold text-white uppercase">
                      Hit Play & Connect
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Instant matchmaking pairs you with a live player and
                      starts the 15-second match clock.
                    </p>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#121822] border border-slate-800 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-amber-400/20 text-amber-300 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                    02
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold text-white uppercase">
                      Buy X Tickets in 15 Secs
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Pick 1, 3, 5, or X tickets ($5 each) to outnumber your
                      opponent. Extra tickets score automatic points!
                    </p>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#121822] border border-slate-800 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-sky-400/20 text-sky-300 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                    03
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold text-white uppercase">
                      Instant 90% Wallet Payout
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      At 0.0s lines lock, server deals, 10% house cut books, and
                      winner gets paid 90% of the pot immediately.
                    </p>
                  </div>
                </div>
              </div>

              {/* ACTIVE COUNTDOWN OR WAITING OR COMPLETED OR READY-TO-PLAY TICKET SLIP */}
              {currentMatch && currentMatch.status === "COUNTDOWN" ? (
                /* =========================================================
                   LIVE 15-SECOND COUNTDOWN ARENA (CONNECTED TO OPPONENT!)
                   ========================================================= */
                <div className="rounded-2xl border-2 border-[#00D632] bg-[#121822] shadow-2xl shadow-[#00D632]/10 overflow-hidden">
                  {/* Live Countdown Top Bar */}
                  <div className="p-5 bg-gradient-to-r from-[#0E2218] via-[#121822] to-[#23190E] border-b border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#00D632]/20 text-[#00D632] font-mono text-xs font-bold uppercase">
                          <span className="w-2 h-2 rounded-full bg-[#00D632] animate-ping" />
                          CONNECTED • MATCH #{currentMatch.code} LIVE
                        </div>
                        <h2 className="text-2xl font-black text-white mt-2 flex items-center gap-3">
                          <span>@{currentMatch.playerAHandle}</span>
                          <span className="text-sm font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400">
                            VS
                          </span>
                          <span>
                            @{currentMatch.playerBHandle || "challenger"}
                          </span>
                        </h2>
                        <p className="text-xs text-slate-300 mt-1">
                          Pick how many tickets (X) you want and assign your
                          throws before the 15-second timer hits zero!
                        </p>
                      </div>

                      {/* Giant 15-Second Digital Clock */}
                      <div className="bg-[#080B10] border-2 border-amber-400/70 rounded-2xl px-5 py-3 text-center min-w-[165px] shadow-inner">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-amber-300 flex items-center justify-center gap-1">
                          <Clock className="w-3.5 h-3.5 animate-spin" />
                          LINES LOCK IN
                        </div>
                        <div
                          className={`text-4xl font-mono font-black tracking-tight mt-0.5 ${
                            remainingMs <= 5000
                              ? "text-rose-400 animate-pulse"
                              : "text-[#00D632]"
                          }`}
                        >
                          {(remainingMs / 1000).toFixed(1)}s
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-4">
                      <div
                        className={`h-full transition-all duration-100 ${
                          remainingMs <= 5000 ? "bg-rose-500" : "bg-[#00D632]"
                        }`}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(0, (remainingMs / 15000) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Ticket Count X Selector + Throws Assignment inside the 15s Window */}
                  <div className="p-6 space-y-6 bg-[#F7F3E8] text-stone-900">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <span className="text-[11px] font-mono uppercase tracking-widest text-stone-600 font-bold">
                          STEP 1 • BUY X TICKETS ($5.00 PER TICKET) TO OUTNUMBER
                          OPPONENT
                        </span>
                        <h3 className="text-lg font-black text-stone-900">
                          You are buying{" "}
                          <span className="text-emerald-700 underline">
                            {ticketsX} Ticket{ticketsX > 1 ? "s" : ""}
                          </span>{" "}
                          ({formatUSD(ticketsX * TICKET_PRICE_CENTS)} Entry)
                        </h3>
                      </div>

                      {/* Custom X Input + Stepper */}
                      <div className="flex items-center gap-2 bg-stone-900 text-white p-2 rounded-xl">
                        <span className="text-xs font-mono text-amber-400 px-2 font-bold">
                          CUSTOM X:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleChangeTicketsLive(ticketsX - 1)}
                          className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 font-mono font-bold text-lg cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={maxAffordableTickets}
                          value={customXInput}
                          onChange={(e) => {
                            setCustomXInput(e.target.value);
                            const val = parseInt(e.target.value, 10);
                            if (Number.isFinite(val) && val >= 1) {
                              handleChangeTicketsLive(val);
                            }
                          }}
                          className="w-20 text-center py-1 rounded bg-stone-950 border border-stone-700 font-mono font-bold text-base text-[#00D632]"
                        />
                        <button
                          type="button"
                          onClick={() => handleChangeTicketsLive(ticketsX + 1)}
                          className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 font-mono font-bold text-lg cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Quick Multi-Ticket Presets */}
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {[1, 2, 3, 5, 8, 12, 20, 30].map((cnt) => {
                        const affordable = cnt <= maxAffordableTickets;
                        const active = ticketsX === cnt;
                        return (
                          <button
                            key={cnt}
                            type="button"
                            disabled={!affordable}
                            onClick={() => handleChangeTicketsLive(cnt)}
                            className={`py-2 px-2 rounded-xl font-mono text-xs border-2 transition cursor-pointer ${
                              active
                                ? "bg-stone-900 text-[#00D632] border-stone-900 font-black shadow"
                                : affordable
                                ? "bg-white text-stone-900 border-stone-300 hover:border-stone-900 font-bold"
                                : "bg-stone-200 text-stone-400 border-stone-200 cursor-not-allowed"
                            }`}
                          >
                            <div>{cnt} Tix</div>
                            <div className="text-[10px] opacity-80">
                              ${cnt * 5}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Outnumber Guarantee & Live Pot Math Callout */}
                    <div className="p-4 rounded-xl bg-stone-900 text-stone-100 grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                      <div>
                        <div className="text-stone-400 text-[10px] uppercase">
                          OUTNUMBER ADVANTAGE (VS 1 TICKET)
                        </div>
                        <div className="text-sm font-bold text-amber-400 mt-0.5">
                          +{Math.max(0, ticketsX - 1)} Uncontested Bye Tickets
                        </div>
                        <div className="text-[11px] text-stone-300 mt-0.5">
                          {ticketsX >= 3
                            ? "Guaranteed Win vs 1-ticket opponent even if their 1 ticket beats yours!"
                            : ticketsX === 2
                            ? "Cannot lose in regulation vs 1-ticket opponent (Worst case: OT tie)!"
                            : "Buy 3+ tickets ($15) to guarantee a win vs a 1-ticket opponent."}
                        </div>
                      </div>
                      <div>
                        <div className="text-stone-400 text-[10px] uppercase">
                          YOUR STAKE AT LOCK
                        </div>
                        <div className="text-lg font-bold text-white mt-0.5">
                          {formatUSD(ticketsX * TICKET_PRICE_CENTS)}{" "}
                          <span className="text-xs text-stone-400">
                            ({ticketsX} × $5)
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-stone-400 text-[10px] uppercase">
                          PAYOUT STRUCTURE
                        </div>
                        <div className="text-sm font-bold text-[#00D632] mt-0.5">
                          Winner Gets 90% of Total Pot
                        </div>
                        <div className="text-[11px] text-amber-400">
                          10% House Cut booked automatically
                        </div>
                      </div>
                    </div>

                    <TicketTearLine />

                    {/* Throw Assignment Controls */}
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-mono uppercase tracking-wider text-stone-700 font-bold">
                          STEP 2 • ASSIGN THROWS TO YOUR {ticketsX} TICKET
                          {ticketsX > 1 ? "S" : ""} (TAP ANY TICKET TO CHANGE)
                        </span>
                        <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleApplyStrategy("BALANCED")}
                            className="px-2.5 py-1 rounded bg-stone-900 text-white hover:bg-stone-800 flex items-center gap-1 cursor-pointer"
                          >
                            <Repeat className="w-3 h-3" /> R-P-S Spread
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyStrategy("RANDOM")}
                            className="px-2.5 py-1 rounded bg-stone-800 text-white hover:bg-stone-700 flex items-center gap-1 cursor-pointer"
                          >
                            <Shuffle className="w-3 h-3" /> Random
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyStrategy("ALL_R")}
                            className="px-2.5 py-1 rounded bg-stone-200 text-stone-900 hover:bg-stone-300 font-bold cursor-pointer"
                          >
                            All ROCK
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyStrategy("ALL_P")}
                            className="px-2.5 py-1 rounded bg-stone-200 text-stone-900 hover:bg-stone-300 font-bold cursor-pointer"
                          >
                            All PAPER
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyStrategy("ALL_S")}
                            className="px-2.5 py-1 rounded bg-stone-200 text-stone-900 hover:bg-stone-300 font-bold cursor-pointer"
                          >
                            All SCISSORS
                          </button>
                        </div>
                      </div>

                      {/* Ticket Stubs Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto p-1">
                        {throwsList.map((t, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-white border-2 border-stone-300 hover:border-stone-900 transition shadow-sm flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono text-stone-500">
                              <span className="font-bold text-stone-800">
                                TICKET #{idx + 1}
                              </span>
                              <span className="text-emerald-700 font-bold">
                                $5.00
                              </span>
                            </div>
                            <div className="my-2 flex items-center justify-center gap-2 text-stone-900">
                              <ThrowGlyph type={t} className="w-6 h-6" />
                              <span className="font-mono font-black text-sm">
                                {THROW_META[t].name}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 pt-1 border-t border-dashed border-stone-200">
                              {(["R", "P", "S"] as Throw[]).map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() =>
                                    handleToggleSingleThrow(idx, opt)
                                  }
                                  className={`py-1 rounded font-mono text-[10px] font-bold transition cursor-pointer ${
                                    t === opt
                                      ? "bg-stone-900 text-[#00D632]"
                                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Lock & Deal CTA */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
                      <div className="text-xs font-mono text-stone-600">
                        Lines auto-lock when the 15s timer reaches{" "}
                        <strong>0.0s</strong>, or click Lock to deal immediately.
                      </div>
                      <button
                        type="button"
                        disabled={lockingIn}
                        onClick={() =>
                          syncSelectionDuringCountdown(
                            ticketsX,
                            throwsList,
                            true
                          )
                        }
                        className="px-6 py-3.5 rounded-xl bg-[#00D632] hover:bg-[#00b82b] text-slate-950 font-mono font-black text-sm uppercase tracking-wider shadow-lg flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
                      >
                        <Lock className="w-4 h-4" />
                        {lockingIn
                          ? "Locking & Dealing..."
                          : `LOCK IN ${ticketsX} TICKET${
                              ticketsX > 1 ? "S" : ""
                            } (${formatUSD(
                              ticketsX * TICKET_PRICE_CENTS
                            )}) & DEAL NOW`}
                      </button>
                    </div>
                  </div>
                </div>
              ) : currentMatch && currentMatch.status === "WAITING" ? (
                /* =========================================================
                   WAITING SHAREABLE ROOM VIEW (/m/CODE)
                   ========================================================= */
                <div className="rounded-2xl border-2 border-amber-400/70 bg-[#F7F3E8] text-stone-900 p-6 shadow-xl space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="px-2.5 py-1 rounded bg-amber-400 text-stone-950 font-mono text-xs font-bold uppercase">
                        WAITING FOR OPPONENT • ROOM #{currentMatch.code}
                      </span>
                      <h2 className="text-2xl font-black mt-2">
                        Share Link or Pair Instantly to Start the 15s Countdown
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-stone-900 text-white font-mono text-xs font-bold flex items-center gap-2 cursor-pointer"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-4 h-4 text-[#00D632]" /> Copied
                          Link!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" /> Copy /m/
                          {currentMatch.code}
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-xs font-mono text-stone-600">
                    Anyone who opens{" "}
                    <strong className="text-stone-900">{shareUrl}</strong> and
                    clicks Join will connect with you and launch the 15-second
                    ticket selection timer. Don&apos;t want to wait? Click below
                    to connect with a live floor challenger right now:
                  </p>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => handleHitPlayQueue("INSTANT_QUEUE")}
                      className="px-5 py-3 rounded-xl bg-[#00D632] text-slate-950 font-mono font-black text-xs uppercase tracking-wider cursor-pointer"
                    >
                      Connect Floor Challenger Now (Start 15s Timer) →
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentMatch(null)}
                      className="px-4 py-3 rounded-xl bg-stone-200 text-stone-800 font-mono text-xs font-bold cursor-pointer"
                    >
                      Back to Slip Builder
                    </button>
                  </div>
                </div>
              ) : currentMatch &&
                currentMatch.status === "COMPLETED" &&
                currentMatch.resolution ? (
                /* =========================================================
                   SHOWDOWN SETTLEMENT RECEIPT & PAYOUT AUDIT
                   ========================================================= */
                <div className="rounded-2xl border-2 border-amber-400/60 bg-[#F7F3E8] text-stone-900 p-6 shadow-2xl space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-dashed border-stone-300 pb-4">
                    <div>
                      <div className="text-xs font-mono uppercase tracking-widest text-stone-500">
                        OFFICIAL MUTUEL SETTLEMENT RECEIPT • SLIP #
                        {currentMatch.code}
                      </div>
                      <h2 className="text-2xl font-black text-stone-900 mt-1">
                        {currentMatch.winnerId === user?.id ? (
                          <span className="text-emerald-700">
                            VICTORY! +{formatUSD(currentMatch.payoutCents)} PAID
                            TO YOUR WALLET
                          </span>
                        ) : (
                          <span className="text-rose-700">
                            MATCH SETTLED — @
                            {currentMatch.winnerSide === "A"
                              ? currentMatch.playerAHandle
                              : currentMatch.playerBHandle}{" "}
                            WON {formatUSD(currentMatch.payoutCents)}
                          </span>
                        )}
                      </h2>
                      <p className="text-xs font-mono text-stone-600 mt-1">
                        {currentMatch.resolution.summaryHeadline}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleHitPlayQueue("INSTANT_QUEUE")}
                      className="px-5 py-3 rounded-xl bg-[#00D632] hover:bg-[#00b82b] text-slate-950 font-mono font-black text-xs uppercase tracking-wider shadow-lg flex items-center gap-2 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Play Again (New 15s Match)
                    </button>
                  </div>

                  {/* Scoreboard & 10% House Rake Box */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-stone-900 text-white font-mono">
                      <div className="text-[10px] text-stone-400 uppercase">
                        SIDE A • @{currentMatch.playerAHandle}
                      </div>
                      <div className="text-xl font-black text-[#00D632] mt-1">
                        {currentMatch.playerATickets} Tickets ($
                        {currentMatch.playerATickets * 5})
                      </div>
                      <div className="text-xs text-stone-300 mt-1">
                        Bout Wins: {currentMatch.resolution.boutWinsA} | Byes: +
                        {currentMatch.resolution.byesA}
                      </div>
                      <div className="text-sm font-bold text-white mt-1">
                        Total Score: {currentMatch.resolution.totalScoreA} pts
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-stone-900 text-white font-mono">
                      <div className="text-[10px] text-stone-400 uppercase">
                        SIDE B • @{currentMatch.playerBHandle}
                      </div>
                      <div className="text-xl font-black text-amber-400 mt-1">
                        {currentMatch.playerBTickets} Tickets ($
                        {currentMatch.playerBTickets * 5})
                      </div>
                      <div className="text-xs text-stone-300 mt-1">
                        Bout Wins: {currentMatch.resolution.boutWinsB} | Byes: +
                        {currentMatch.resolution.byesB}
                      </div>
                      <div className="text-sm font-bold text-white mt-1">
                        Total Score: {currentMatch.resolution.totalScoreB} pts
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-950 text-emerald-100 border border-emerald-600 font-mono space-y-1 text-xs">
                      <div className="text-[10px] uppercase text-emerald-300 font-bold">
                        INSTANT PAYOUT & 10% HOUSE CUT
                      </div>
                      <div className="flex justify-between">
                        <span>Gross Pot:</span>
                        <span className="font-bold">
                          {formatUSD(currentMatch.totalPotCents)}
                        </span>
                      </div>
                      <div className="flex justify-between text-amber-300">
                        <span>10% House Cut:</span>
                        <span className="font-bold">
                          -{formatUSD(currentMatch.houseCutCents)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[#00D632] text-sm font-black pt-1 border-t border-emerald-800">
                        <span>Winner Paid (90%):</span>
                        <span>{formatUSD(currentMatch.payoutCents)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Paired Head-to-Head Bouts */}
                  <div className="space-y-2">
                    <div className="text-xs font-mono uppercase font-bold text-stone-700">
                      HEAD-TO-HEAD CONTESTED BOUTS (
                      {currentMatch.resolution.bouts.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {currentMatch.resolution.bouts.map((b) => (
                        <div
                          key={b.boutNumber}
                          className="p-3 rounded-xl bg-white border border-stone-300 flex items-center justify-between font-mono text-xs"
                        >
                          <div>
                            <span className="font-bold text-stone-500 mr-2">
                              #{b.boutNumber}
                            </span>
                            <span className="font-bold text-stone-900">
                              {THROW_META[b.throwA].name} vs{" "}
                              {THROW_META[b.throwB].name}
                            </span>
                            <div className="text-[11px] text-stone-600">
                              {b.headline}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                              b.winner === "A"
                                ? "bg-emerald-100 text-emerald-800"
                                : b.winner === "B"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-stone-200 text-stone-700"
                            }`}
                          >
                            {b.winner === "TIE"
                              ? "PUSH (0)"
                              : `SIDE ${b.winner} (+1)`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Uncontested Outnumber Bye Tickets */}
                  {currentMatch.resolution.byeTickets.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-mono uppercase font-bold text-emerald-800">
                        OUTNUMBER BONUS TICKETS (+
                        {currentMatch.resolution.byeTickets.length} AUTOMATIC
                        POINTS)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {currentMatch.resolution.byeTickets.map((bt) => (
                          <div
                            key={bt.ticketNumber}
                            className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-950 font-mono text-xs flex items-center justify-between"
                          >
                            <span>{bt.note}</span>
                            <span className="font-black text-emerald-700">
                              +1 PT
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tiebreaker OT if played */}
                  {currentMatch.resolution.tiebreaker.played && (
                    <div className="p-3 rounded-xl bg-amber-100 border border-amber-400 font-mono text-xs text-amber-950">
                      <strong>SUDDEN-DEATH OVERTIME TIEBREAKER:</strong> Settled
                      in {currentMatch.resolution.tiebreaker.rounds.length} OT
                      hand(s) in favor of Side{" "}
                      {currentMatch.resolution.tiebreaker.winner}!
                    </div>
                  )}
                </div>
              ) : null}

              {/* =========================================================
                 PRIMARY MUTUEL SLIP & "HIT PLAY" LAUNCHPAD
                 ========================================================= */}
              {(!currentMatch || currentMatch.status === "COMPLETED") && (
                <div className="rounded-2xl bg-[#F7F3E8] text-stone-900 border-2 border-amber-900/20 shadow-2xl overflow-hidden">
                  {/* Mutuel Slip Top Banner */}
                  <div className="bg-stone-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-widest text-amber-400">
                        OFFICIAL PARI-MUTUEL MULTI-TICKET SLIP • $5.00 / TICKET
                      </div>
                      <h1 className="text-xl sm:text-2xl font-black tracking-tight mt-0.5">
                        HIT PLAY → 15s TICKET RUSH → OUTNUMBER & WIN
                      </h1>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-[10px] text-stone-400 uppercase">
                        WINNER PAYOUT
                      </div>
                      <div className="text-lg font-black text-[#00D632]">
                        90% OF TOTAL POT
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Big Hero Call to Action: Hit PLAY */}
                    <div className="p-5 rounded-2xl bg-gradient-to-r from-stone-900 via-stone-900 to-emerald-950 text-white flex flex-col sm:flex-row items-center justify-between gap-5 shadow-lg">
                      <div className="space-y-1.5">
                        <div className="inline-flex items-center gap-1.5 text-xs font-mono text-[#00D632] font-bold">
                          <Sparkles className="w-4 h-4" />
                          LIVE MULTIPLAYER QUEUE READY
                        </div>
                        <h2 className="text-xl font-black">
                          Hit PLAY to Connect to a Player & Start the 15-Second
                          Clock
                        </h2>
                        <p className="text-xs text-stone-300 max-w-xl leading-relaxed">
                          Once matched, both players get{" "}
                          <strong className="text-amber-300">15 seconds</strong>{" "}
                          to choose how many tickets (X) they want to buy ($5
                          each) and assign Rock, Paper, or Scissors. When the
                          clock hits 0, lines lock and the winner is paid
                          instantly to their wallet!
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 w-full sm:w-auto shrink-0">
                        <button
                          type="button"
                          disabled={queueConnecting}
                          onClick={() => handleHitPlayQueue("INSTANT_QUEUE")}
                          className="px-7 py-4 rounded-xl bg-[#00D632] hover:bg-[#00b82b] text-slate-950 font-mono font-black text-base uppercase tracking-wider shadow-xl shadow-[#00D632]/25 flex items-center justify-center gap-2.5 cursor-pointer transition transform active:scale-95"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          {queueConnecting
                            ? "CONNECTING..."
                            : "HIT PLAY (15s RUSH)"}
                        </button>
                        <button
                          type="button"
                          disabled={queueConnecting}
                          onClick={() => handleHitPlayQueue("CREATE_ROOM")}
                          className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-mono text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          Create Shareable Friend Link
                        </button>
                      </div>
                    </div>

                    {/* Pre-Configure Starting X Tickets & Throws (also editable live during the 15s countdown!) */}
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-mono uppercase tracking-wider text-stone-500 font-bold">
                            PRE-SET OR TEST YOUR X TICKET STACK (EDITABLE DURING
                            15s COUNTDOWN)
                          </div>
                          <div className="text-lg font-black text-stone-900">
                            Selected:{" "}
                            <span className="text-emerald-700">
                              {ticketsX} Ticket{ticketsX > 1 ? "s" : ""}
                            </span>{" "}
                            × $5.00 ={" "}
                            <span className="font-mono">
                              {formatUSD(ticketsX * TICKET_PRICE_CENTS)}
                            </span>
                          </div>
                        </div>

                        {/* Unlimited / Custom X Ticket Input */}
                        <div className="flex items-center gap-2 bg-stone-900 text-white px-3 py-2 rounded-xl">
                          <label className="text-xs font-mono text-amber-400 font-bold">
                            BUY X TICKETS:
                          </label>
                          <button
                            type="button"
                            onClick={() => updateTicketCount(ticketsX - 1)}
                            className="w-7 h-7 rounded bg-stone-800 hover:bg-stone-700 font-mono font-bold cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={customXInput}
                            onChange={(e) => {
                              setCustomXInput(e.target.value);
                              const parsed = parseInt(e.target.value, 10);
                              if (Number.isFinite(parsed) && parsed >= 1) {
                                updateTicketCount(parsed);
                              }
                            }}
                            className="w-20 text-center py-1 rounded bg-stone-950 border border-stone-700 font-mono font-bold text-[#00D632]"
                          />
                          <button
                            type="button"
                            onClick={() => updateTicketCount(ticketsX + 1)}
                            className="w-7 h-7 rounded bg-stone-800 hover:bg-stone-700 font-mono font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Quick Preset Pills */}
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5, 8, 10, 12, 15, 25, 50].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => updateTicketCount(n)}
                            className={`px-3 py-1.5 rounded-lg font-mono text-xs border transition cursor-pointer ${
                              ticketsX === n
                                ? "bg-stone-900 text-[#00D632] border-stone-900 font-black"
                                : "bg-white text-stone-800 border-stone-300 hover:border-stone-900 font-semibold"
                            }`}
                          >
                            {n} Tix (${n * 5})
                          </button>
                        ))}
                      </div>

                      {/* Outnumber Math Preview Strip */}
                      <div className="p-4 rounded-xl bg-stone-200/80 border border-stone-300 grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                        <div>
                          <div className="text-[10px] text-stone-500 uppercase">
                            VS 1-TICKET ($5) OPPONENT
                          </div>
                          <div className="font-bold text-stone-900 text-sm mt-0.5">
                            {previewBounds.guaranteedWin ? (
                              <span className="text-emerald-700">
                                100% Guaranteed Win (+{previewBounds.myByes}{" "}
                                Byes)
                              </span>
                            ) : (
                              <span>
                                Net Score Range: [{previewBounds.minNet}, +
                                {previewBounds.maxNet}]
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-stone-500 uppercase">
                            EXAMPLE POT ({ticketsX}v1 TICKETS)
                          </div>
                          <div className="font-bold text-stone-900 text-sm mt-0.5">
                            Gross {formatUSD(previewPot.grossPotCents)} → 10%
                            Cut {formatUSD(previewPot.houseCutCents)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-stone-500 uppercase">
                            90% WINNER PAYOUT
                          </div>
                          <div className="font-black text-emerald-700 text-base mt-0.5">
                            {formatUSD(previewPot.winnerPayoutCents)} Instant
                            Credit
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* RECENT SETTLED MATCHES TAPE */}
              <div className="bg-[#121822] border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                    RECENT SETTLED SHOWDOWNS (CLICK ANY SLIP TO INSPECT BOUTS)
                  </div>
                  <span className="text-[11px] font-mono text-amber-400">
                    10% House Cut Verified
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {completedMatches.slice(0, 6).map((cm) => (
                    <button
                      key={cm.id}
                      type="button"
                      onClick={() => setCurrentMatch(cm)}
                      className="p-3 rounded-xl bg-[#0B0F17] hover:bg-slate-900 border border-slate-800/90 hover:border-slate-700 text-left transition flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <span className="text-amber-400 font-bold">
                            #{cm.code}
                          </span>
                          <span className="text-white font-semibold">
                            @{cm.playerAHandle} ({cm.playerATickets}) vs @
                            {cm.playerBHandle} ({cm.playerBTickets})
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-1">
                          Pot {formatUSD(cm.totalPotCents)} • House 10%:{" "}
                          {formatUSD(cm.houseCutCents)}
                        </div>
                      </div>
                      <div className="text-right font-mono shrink-0">
                        <div className="text-xs font-bold text-[#00D632]">
                          Paid {formatUSD(cm.payoutCents)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Winner:{" "}
                          {cm.winnerSide === "A"
                            ? `@${cm.playerAHandle}`
                            : `@${cm.playerBHandle}`}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right 4 Columns: Persistent Wallet & Transaction Ledger Rail */}
        <div className="lg:col-span-4 space-y-6">
          <Rail
            user={user}
            ledger={ledger}
            onUserUpdated={(u, l) => {
              setUser(u);
              setLedger(l);
            }}
            onSelectMatchCode={(code) => loadSpecificMatch(code)}
          />
          <FloorChat
            activeMatchCode={currentMatch?.code || null}
            currentTickets={ticketsX}
            onSelectMatchCode={(code) => loadSpecificMatch(code)}
          />
        </div>
      </main>

      {/* Complete Website Footer */}
      <footer className="border-t border-slate-800/90 bg-[#070A0F] px-4 py-6 mt-10 text-xs font-mono text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-black text-white">OUTNUMBER™</span>
            <span>•</span>
            <span>$5.00 Multi-Ticket Rock Paper Scissors Exchange</span>
            <span>•</span>
            <span className="text-[#00D632]">Cash App: $stockhunger</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-white">
              Play Arena
            </Link>
            <Link href="/admin" className="hover:text-amber-400">
              House Admin Console
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>

      <ShareLaunchModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        matchCode={currentMatch?.code || null}
        ticketsX={ticketsX}
      />
    </div>
  );
}
