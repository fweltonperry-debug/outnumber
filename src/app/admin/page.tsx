"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Shield,
  Users,
  Landmark,
  ReceiptText,
  Layers,
  ArrowLeft,
  Ban,
  CheckCircle2,
  PlusCircle,
  XCircle,
  RefreshCw,
  DollarSign,
} from "lucide-react";
import { formatUSD } from "@/lib/game";

interface AdminUser {
  id: number;
  handle: string;
  email: string;
  cashtag: string;
  recoveryCode: string;
  balanceCents: number;
  totalDepositedCents: number;
  totalWithdrawnCents: number;
  totalWageredCents: number;
  totalWonCents: number;
  wins: number;
  losses: number;
  isBot: boolean;
  isSuspended: boolean;
}

interface AdminMatch {
  id: number;
  code: string;
  status: string;
  playerAHandle: string;
  playerATickets: number;
  playerBHandle: string | null;
  playerBTickets: number;
  totalPotCents: number;
  houseCutCents: number;
  payoutCents: number;
  winnerSide: string | null;
  createdAt: string;
}

interface AdminHouseRow {
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

interface AdminTxRow {
  id: number;
  userId: number;
  userHandle: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  matchCode: string | null;
  destination: string;
  note: string;
  createdAt: string;
}

interface AdminCashappRow {
  id: number;
  referenceCode: string;
  userId: number;
  userHandle: string;
  kind: string;
  amountCents: number;
  playerCashtag: string;
  houseCashtag: string;
  status: string;
  note: string;
  createdAt: string;
}

export default function AdminDashboardPage() {
  const [tab, setTab] = useState<
    "USERS" | "MATCHES" | "HOUSE" | "CASHAPP" | "LEDGER"
  >("USERS");
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [matchesList, setMatchesList] = useState<AdminMatch[]>([]);
  const [houseList, setHouseList] = useState<AdminHouseRow[]>([]);
  const [txList, setTxList] = useState<AdminTxRow[]>([]);
  const [cashappList, setCashappList] = useState<AdminCashappRow[]>([]);
  const [summary, setSummary] = useState({
    totalHouseCutCents: 0,
    totalGrossPotCents: 0,
    totalWinnerPayoutCents: 0,
    totalTickets: 0,
    totalFloatCents: 0,
    userCount: 0,
  });
  const [creditAmounts, setCreditAmounts] = useState<Record<number, string>>(
    {}
  );
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin");
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
        setMatchesList(data.matches || []);
        setHouseList(data.houseLedger || []);
        setTxList(data.transactions || []);
        setCashappList(data.cashappRequests || []);
        if (data.summary) setSummary(data.summary);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleToggleSuspend = async (userId: number) => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "TOGGLE_SUSPEND", userId }),
    });
    const data = await res.json();
    if (res.ok) {
      setBanner(data.message);
      loadAdminData();
    }
  };

  const handleAdjustBalance = async (userId: number) => {
    const dollars = Number(creditAmounts[userId] || 25);
    if (!Number.isFinite(dollars) || dollars === 0) return;
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ADJUST_BALANCE",
        userId,
        amountCents: Math.round(dollars * 100),
        note: `Admin desk credit/refund (${
          dollars >= 0 ? `+$${dollars}` : `-$${Math.abs(dollars)}`
        })`,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setBanner(data.message);
      loadAdminData();
    }
  };

  const handleVoidMatch = async (matchId: number) => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "VOID_MATCH", matchId }),
    });
    const data = await res.json();
    if (res.ok) {
      setBanner(data.message);
      loadAdminData();
    }
  };

  const handleSweepHouseCut = async () => {
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
      setBanner(data.message);
      setTab("CASHAPP");
      loadAdminData();
    }
  };

  const handleExportHouseCsv = () => {
    const headers = [
      "ID",
      "MatchCode",
      "TotalTickets",
      "GrossPotUSD",
      "HouseCut10PctUSD",
      "WinnerPayout90PctUSD",
      "Winner",
      "Loser",
      "CreatedAt",
    ];
    const rows = houseList.map((h) => [
      h.id,
      h.matchCode,
      h.totalTickets,
      (h.grossPotCents / 100).toFixed(2),
      (h.houseCutCents / 100).toFixed(2),
      (h.winnerPayoutCents / 100).toFixed(2),
      h.winnerHandle,
      h.loserHandle,
      h.createdAt,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "outnumber_10pct_house_ledger.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-400/15 border border-amber-400/40 text-amber-400 flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-amber-400">
                OUTNUMBER EXCHANGE • HOUSE COMMAND DESK ($stockhunger)
              </div>
              <h1 className="text-2xl font-black text-white">
                Admin Operations, Cash App Rails & 10% House Rake Audit
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleSweepHouseCut}
              className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-mono font-black text-xs uppercase cursor-pointer"
            >
              Sweep 10% Cut ({formatUSD(summary.totalHouseCutCents)}) → $stockhunger
            </button>
            <button
              type="button"
              onClick={handleExportHouseCsv}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs cursor-pointer"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={loadAdminData}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 font-mono text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <Link
              href="/"
              className="px-4 py-2 rounded-xl bg-[#00D632] text-slate-950 font-mono font-bold text-xs uppercase flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Live Arena
            </Link>
          </div>
        </div>

        {banner && (
          <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 font-mono text-xs flex items-center justify-between">
            <span>{banner}</span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Executive KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 rounded-xl bg-[#121822] border border-amber-500/40">
            <div className="text-[11px] font-mono text-amber-400 uppercase">
              House 10% Cut Booked
            </div>
            <div className="text-2xl font-mono font-black text-amber-400 mt-1">
              {formatUSD(summary.totalHouseCutCents)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#121822] border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">
              Gross Match Volume
            </div>
            <div className="text-2xl font-mono font-bold text-white mt-1">
              {formatUSD(summary.totalGrossPotCents)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#121822] border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">
              90% Winner Payouts
            </div>
            <div className="text-2xl font-mono font-bold text-[#00D632] mt-1">
              {formatUSD(summary.totalWinnerPayoutCents)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#121822] border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">
              Player Wallet Float
            </div>
            <div className="text-2xl font-mono font-bold text-sky-400 mt-1">
              {formatUSD(summary.totalFloatCents)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#121822] border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">
              Registered Accounts
            </div>
            <div className="text-2xl font-mono font-bold text-white mt-1">
              {summary.userCount}
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3 font-mono text-xs">
          <button
            type="button"
            onClick={() => setTab("USERS")}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 ${
              tab === "USERS"
                ? "bg-[#00D632] text-slate-950"
                : "bg-[#121822] text-slate-300"
            }`}
          >
            <Users className="w-4 h-4" /> Users & Refunds ({usersList.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("MATCHES")}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 ${
              tab === "MATCHES"
                ? "bg-[#00D632] text-slate-950"
                : "bg-[#121822] text-slate-300"
            }`}
          >
            <Layers className="w-4 h-4" /> Matches & Void Control (
            {matchesList.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("HOUSE")}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 ${
              tab === "HOUSE"
                ? "bg-amber-400 text-slate-950"
                : "bg-[#121822] text-slate-300"
            }`}
          >
            <Landmark className="w-4 h-4" /> 10% House Ledger (
            {houseList.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("CASHAPP")}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 ${
              tab === "CASHAPP"
                ? "bg-emerald-400 text-slate-950"
                : "bg-[#121822] text-slate-300"
            }`}
          >
            <DollarSign className="w-4 h-4" /> Cash App Receipts (
            {cashappList.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("LEDGER")}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 ${
              tab === "LEDGER"
                ? "bg-sky-400 text-slate-950"
                : "bg-[#121822] text-slate-300"
            }`}
          >
            <ReceiptText className="w-4 h-4" /> Wallet Audit Trail (
            {txList.length})
          </button>
        </div>

        {/* Tab Content */}
        {tab === "USERS" && (
          <div className="bg-[#121822] border border-slate-800 rounded-2xl p-5 overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <th className="py-3 px-3">ID / Handle</th>
                  <th className="py-3 px-3">$Cashtag</th>
                  <th className="py-3 px-3">Recovery Key</th>
                  <th className="py-3 px-3">Record</th>
                  <th className="py-3 px-3 text-right">Balance</th>
                  <th className="py-3 px-3">Credit / Refund ($ USD)</th>
                  <th className="py-3 px-3 text-right">Status / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/25">
                    <td className="py-3 px-3 font-bold text-white">
                      #{u.id} @{u.handle}
                    </td>
                    <td className="py-3 px-3 text-[#00D632]">
                      {u.cashtag || "—"}
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {u.recoveryCode}
                    </td>
                    <td className="py-3 px-3">
                      {u.wins}W–{u.losses}L
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-white">
                      {formatUSD(u.balanceCents)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          placeholder="25"
                          value={creditAmounts[u.id] ?? "25"}
                          onChange={(e) =>
                            setCreditAmounts((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }))
                          }
                          className="w-20 px-2 py-1 rounded bg-[#0B0F17] border border-slate-700 text-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleAdjustBalance(u.id)}
                          className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 flex items-center gap-1"
                        >
                          <PlusCircle className="w-3 h-3" /> Credit
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleSuspend(u.id)}
                        className={`px-3 py-1 rounded font-bold inline-flex items-center gap-1 ${
                          u.isSuspended
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            : "bg-slate-800 text-slate-300 hover:bg-rose-950 hover:text-rose-300"
                        }`}
                      >
                        {u.isSuspended ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> Unsuspend
                          </>
                        ) : (
                          <>
                            <Ban className="w-3 h-3" /> Suspend
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "MATCHES" && (
          <div className="bg-[#121822] border border-slate-800 rounded-2xl p-5 overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <th className="py-3 px-3">Code</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Player A vs Player B</th>
                  <th className="py-3 px-3 text-right">Gross Pot</th>
                  <th className="py-3 px-3 text-right">10% House</th>
                  <th className="py-3 px-3 text-right">90% Payout</th>
                  <th className="py-3 px-3 text-right">Admin Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {matchesList.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/25">
                    <td className="py-3 px-3 font-bold text-amber-400">
                      <Link href={`/m/${m.code}`} className="hover:underline">
                        #{m.code}
                      </Link>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.status === "COMPLETED"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : m.status === "VOIDED"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-white">
                      @{m.playerAHandle} ({m.playerATickets} tix) vs{" "}
                      {m.playerBHandle
                        ? `@${m.playerBHandle} (${m.playerBTickets} tix)`
                        : "Waiting..."}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {formatUSD(m.totalPotCents)}
                    </td>
                    <td className="py-3 px-3 text-right text-amber-400">
                      {formatUSD(m.houseCutCents)}
                    </td>
                    <td className="py-3 px-3 text-right text-[#00D632]">
                      {formatUSD(m.payoutCents)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {m.status !== "VOIDED" && (
                        <button
                          type="button"
                          onClick={() => handleVoidMatch(m.id)}
                          className="px-2.5 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 inline-flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" /> Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "HOUSE" && (
          <div className="bg-[#121822] border border-slate-800 rounded-2xl p-5 overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <th className="py-3 px-3">Ledger ID</th>
                  <th className="py-3 px-3">Match</th>
                  <th className="py-3 px-3">Winner / Loser</th>
                  <th className="py-3 px-3 text-right">Tickets</th>
                  <th className="py-3 px-3 text-right">Gross Pot</th>
                  <th className="py-3 px-3 text-right text-amber-400">
                    10% House Cut
                  </th>
                  <th className="py-3 px-3 text-right text-[#00D632]">
                    90% Winner Payout
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {houseList.map((h) => (
                  <tr key={h.id}>
                    <td className="py-3 px-3 text-slate-400">#{h.id}</td>
                    <td className="py-3 px-3 font-bold text-amber-400">
                      #{h.matchCode}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[#00D632] font-bold">
                        @{h.winnerHandle}
                      </span>{" "}
                      beat @{h.loserHandle}
                    </td>
                    <td className="py-3 px-3 text-right">{h.totalTickets}</td>
                    <td className="py-3 px-3 text-right">
                      {formatUSD(h.grossPotCents)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-amber-400">
                      +{formatUSD(h.houseCutCents)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-[#00D632]">
                      {formatUSD(h.winnerPayoutCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "CASHAPP" && (
          <div className="bg-[#121822] border border-slate-800 rounded-2xl p-5 overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <th className="py-3 px-3">Reference</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Player</th>
                  <th className="py-3 px-3">Player $Cashtag</th>
                  <th className="py-3 px-3">House $Cashtag</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {cashappList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-6 text-center text-slate-500"
                    >
                      No Cash App deposit or payout receipts yet. Use the Wallet
                      Deposit or Cash Out tab to generate one.
                    </td>
                  </tr>
                ) : (
                  cashappList.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3 px-3 font-bold text-amber-400">
                        {c.referenceCode}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.kind === "DEPOSIT"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {c.kind}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-white">@{c.userHandle}</td>
                      <td className="py-3 px-3 text-[#00D632]">
                        {c.playerCashtag}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {c.houseCashtag}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-white">
                        {formatUSD(c.amountCents)}
                      </td>
                      <td className="py-3 px-3 text-emerald-400 font-bold">
                        {c.status}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "LEDGER" && (
          <div className="bg-[#121822] border border-slate-800 rounded-2xl p-5 overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
                  <th className="py-3 px-3">TX ID</th>
                  <th className="py-3 px-3">Player</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Note / Audit</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-3 text-right">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {txList.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 px-3 text-slate-500">#{t.id}</td>
                    <td className="py-2.5 px-3 font-bold text-white">
                      @{t.userHandle}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px]">
                        {t.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{t.note}</td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        t.amountCents >= 0 ? "text-[#00D632]" : "text-rose-400"
                      }`}
                    >
                      {formatUSD(t.amountCents, true)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {formatUSD(t.balanceAfterCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
