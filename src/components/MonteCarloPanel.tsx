"use client";

import React, { useState, useMemo } from "react";
import {
  runMonteCarloSim,
  formatUSD,
  type ThrowStrategy,
} from "@/lib/game";
import { Calculator, Play, ShieldCheck, TrendingUp } from "lucide-react";

export default function MonteCarloPanel() {
  const [ticketsA, setTicketsA] = useState<number>(3);
  const [ticketsB, setTicketsB] = useState<number>(1);
  const [strategyA, setStrategyA] = useState<ThrowStrategy>("BALANCED");
  const [strategyB, setStrategyB] = useState<ThrowStrategy>("RANDOM");
  const [trials, setTrials] = useState<number>(5000);
  const [simSeed, setSimSeed] = useState<number>(1);

  const result = useMemo(() => {
    void simSeed;
    return runMonteCarloSim(ticketsA, ticketsB, trials, strategyA, strategyB);
  }, [ticketsA, ticketsB, trials, strategyA, strategyB, simSeed]);

  const presetMatchups = [
    { label: "3 vs 1 (Classic Outnumber)", a: 3, b: 1 },
    { label: "12 vs 1 ($65 Pot / +11 Byes)", a: 12, b: 1 },
    { label: "2 vs 1 (Edge Case)", a: 2, b: 1 },
    { label: "5 vs 2 (Guaranteed Floor)", a: 5, b: 2 },
    { label: "25 vs 5 (High Roller X)", a: 25, b: 5 },
    { label: "1 vs 1 (Even Coin)", a: 1, b: 1 },
  ];

  return (
    <div className="bg-[#121822] border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
            <Calculator className="w-4 h-4" />
            MONTE CARLO ENGINE & OUTNUMBER MATRIX
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            Simulate Any X vs Y Multi-Ticket Matchup
          </h2>
        </div>

        <button
          type="button"
          onClick={() => setSimSeed((s) => s + 1)}
          className="px-4 py-2 rounded-xl bg-[#00D632] hover:bg-[#00b82b] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Re-Run {trials.toLocaleString()} Trials
        </button>
      </div>

      {/* Preset Quick Buttons */}
      <div className="flex flex-wrap gap-2">
        {presetMatchups.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setTicketsA(p.a);
              setTicketsB(p.b);
            }}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs border transition ${
              ticketsA === p.a && ticketsB === p.b
                ? "bg-amber-400/20 border-amber-400 text-amber-300 font-bold"
                : "bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800 space-y-3">
          <div className="text-xs font-mono uppercase text-emerald-400 font-bold">
            Your Side (Player A — X Tickets)
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Tickets Bought ($5.00 each)
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={ticketsA}
              onChange={(e) =>
                setTicketsA(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
              }
              className="w-full px-3 py-2 rounded-lg bg-[#121822] border border-slate-700 text-white font-mono text-base font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Ticket Throw Assignment Strategy
            </label>
            <select
              value={strategyA}
              onChange={(e) => setStrategyA(e.target.value as ThrowStrategy)}
              className="w-full px-3 py-2 rounded-lg bg-[#121822] border border-slate-700 text-white font-mono text-xs"
            >
              <option value="BALANCED">Balanced Spread (R, P, S...)</option>
              <option value="RANDOM">Uniform Random</option>
              <option value="ALL_R">All ROCK</option>
              <option value="ALL_P">All PAPER</option>
              <option value="ALL_S">All SCISSORS</option>
            </select>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800 space-y-3">
          <div className="text-xs font-mono uppercase text-rose-400 font-bold">
            Opponent Side (Player B — Y Tickets)
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Opponent Tickets ($5.00 each)
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={ticketsB}
              onChange={(e) =>
                setTicketsB(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
              }
              className="w-full px-3 py-2 rounded-lg bg-[#121822] border border-slate-700 text-white font-mono text-base font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">
              Opponent Strategy
            </label>
            <select
              value={strategyB}
              onChange={(e) => setStrategyB(e.target.value as ThrowStrategy)}
              className="w-full px-3 py-2 rounded-lg bg-[#121822] border border-slate-700 text-white font-mono text-xs"
            >
              <option value="RANDOM">Uniform Random</option>
              <option value="BALANCED">Balanced Spread (R, P, S...)</option>
              <option value="ALL_R">All ROCK</option>
              <option value="ALL_P">All PAPER</option>
              <option value="ALL_S">All SCISSORS</option>
            </select>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800 space-y-3">
          <div className="text-xs font-mono uppercase text-amber-400 font-bold">
            Pot & 10% House Rake Breakdown
          </div>
          <div className="space-y-1.5 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Your Stake ({ticketsA} tix):</span>
              <span className="text-white font-bold">
                {formatUSD(result.pot.stakeACents)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Opp Stake ({ticketsB} tix):</span>
              <span className="text-white font-bold">
                {formatUSD(result.pot.stakeBCents)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-800 pt-1">
              <span className="text-slate-300">Gross Match Pot:</span>
              <span className="text-white font-bold">
                {formatUSD(result.pot.grossPotCents)}
              </span>
            </div>
            <div className="flex justify-between text-amber-400">
              <span>House Cut (10%):</span>
              <span className="font-bold">
                {formatUSD(result.pot.houseCutCents)}
              </span>
            </div>
            <div className="flex justify-between text-[#00D632] text-sm pt-1 border-t border-slate-800">
              <span>Winner Payout (90%):</span>
              <span className="font-bold">
                {formatUSD(result.pot.winnerPayoutCents)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Simulation Output Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
          <div className="text-[11px] font-mono uppercase text-emerald-300">
            Your Win Rate ({ticketsA}v{ticketsB})
          </div>
          <div className="text-3xl font-mono font-bold text-[#00D632] mt-1">
            {(result.winRateA * 100).toFixed(1)}%
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Opp Win: {(result.winRateB * 100).toFixed(1)}%
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800">
          <div className="text-[11px] font-mono uppercase text-slate-400">
            Net Score Bounds
          </div>
          <div className="text-2xl font-mono font-bold text-white mt-1">
            [{result.bounds.minNet >= 0 ? `+${result.bounds.minNet}` : result.bounds.minNet},{" "}
            {result.bounds.maxNet >= 0 ? `+${result.bounds.maxNet}` : result.bounds.maxNet}]
          </div>
          <div className="text-xs font-mono text-amber-400 mt-1">
            Byes: {result.bounds.myByes > 0 ? `+${result.bounds.myByes} Yours` : result.bounds.oppByes > 0 ? `+${result.bounds.oppByes} Opp` : "0 (Even)"}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800">
          <div className="text-[11px] font-mono uppercase text-slate-400">
            Outnumber Guarantee
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {result.bounds.guaranteedWin ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#00D632]/20 text-[#00D632] font-mono text-sm font-bold">
                <ShieldCheck className="w-4 h-4" />
                100% LOCKED WIN
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 font-mono text-xs font-bold">
                Need {result.bounds.ticketsNeededToGuaranteeWin} Tix for 100% Lock
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-1.5">
            Worst-case floor:{" "}
            {result.bounds.minNet > 0
              ? `+${result.bounds.minNet} pts ahead`
              : `${result.bounds.minNet} pts`}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0B0F17] border border-slate-800">
          <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            Expected Value / Hand
          </div>
          <div
            className={`text-2xl font-mono font-bold mt-1 ${
              result.evACents >= 0 ? "text-[#00D632]" : "text-rose-400"
            }`}
          >
            {formatUSD(result.evACents, true)}
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            House Books: {formatUSD(result.pot.houseCutCents)} / match
          </div>
        </div>
      </div>
    </div>
  );
}
