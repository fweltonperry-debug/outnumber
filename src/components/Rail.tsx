"use client";

import React, { useState } from "react";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  KeyRound,
  Copy,
  Check,
  DollarSign,
  ReceiptText,
  UserCheck,
  Sparkles,
  LogIn,
  QrCode,
} from "lucide-react";
import { formatUSD, TICKET_PRICE_CENTS } from "@/lib/game";
import CashAppModal from "@/components/CashAppModal";

export interface ClientUser {
  id: number;
  handle: string;
  email?: string;
  hasPassword?: boolean;
  cashtag: string;
  recoveryCode: string;
  balanceCents: number;
  totalDepositedCents: number;
  totalWithdrawnCents: number;
  totalWageredCents: number;
  totalWonCents: number;
  wins: number;
  losses: number;
  isSuspended: boolean;
  ageVerified: boolean;
}

export interface ClientLedgerRow {
  id: number;
  userId: number;
  userHandle: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  matchId: number | null;
  matchCode: string | null;
  destination: string;
  note: string;
  createdAt: string;
}

interface RailProps {
  user: ClientUser | null;
  ledger: ClientLedgerRow[];
  onUserUpdated: (user: ClientUser, ledger: ClientLedgerRow[]) => void;
  onSelectMatchCode?: (code: string) => void;
}

export default function Rail({
  user,
  ledger,
  onUserUpdated,
  onSelectMatchCode,
}: RailProps) {
  const [activeTab, setActiveTab] = useState<
    "DEPOSIT" | "WITHDRAW" | "LEDGER" | "IDENTITY"
  >("DEPOSIT");
  const [depositDollars, setDepositDollars] = useState<string>("25");
  const [withdrawDollars, setWithdrawDollars] = useState<string>("25");
  const [cashtagInput, setCashtagInput] = useState<string>(
    user?.cashtag || "$stockhunger"
  );
  const [handleInput, setHandleInput] = useState<string>(user?.handle || "");
  const [emailInput, setEmailInput] = useState<string>(user?.email || "");
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  const [recoveryInput, setRecoveryInput] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  React.useEffect(() => {
    if (user) {
      setCashtagInput(user.cashtag || "$stockhunger");
      setHandleInput(user.handle || "");
      setEmailInput(user.email || "");
    }
  }, [user?.id, user?.cashtag, user?.handle, user?.email]);

  const showToast = (type: "ok" | "err", text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
  };

  const handleDeposit = async (overrideDollars?: number) => {
    const amt =
      overrideDollars !== undefined ? overrideDollars : Number(depositDollars);
    if (!Number.isFinite(amt) || amt < 5) {
      showToast("err", "Minimum deposit is $5.00 (1 ticket).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DEPOSIT",
          amountDollars: amt,
          source: cashtagInput || user?.cashtag || "$player",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data.error || "Deposit failed");
      } else {
        onUserUpdated(data.user, data.ledger);
        showToast("ok", data.message || `Loaded $${amt.toFixed(2)} to wallet!`);
      }
    } catch {
      showToast("err", "Network error during deposit.");
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    const amt = Number(withdrawDollars);
    if (!Number.isFinite(amt) || amt < 5) {
      showToast("err", "Minimum withdrawal is $5.00.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "WITHDRAW",
          amountDollars: amt,
          cashtag: cashtagInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data.error || "Withdrawal failed");
      } else {
        onUserUpdated(data.user, data.ledger);
        showToast("ok", data.message || "Payout dispatched!");
      }
    } catch {
      showToast("err", "Network error during withdrawal.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_PROFILE",
          handle: handleInput,
          email: emailInput,
          password: passwordInput || undefined,
          cashtag: cashtagInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data.error || "Could not update profile");
      } else {
        onUserUpdated(data.user, data.ledger);
        setPasswordInput("");
        showToast("ok", data.message || "Profile & $Cashtag saved!");
      }
    } catch {
      showToast("err", "Failed to save profile.");
    } finally {
      setBusy(false);
    }
  };

  const handleLoginPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword) return;
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "LOGIN_PASSWORD",
          identifier: loginIdentifier.trim(),
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data.error || "Sign in failed");
      } else {
        onUserUpdated(data.user, data.ledger);
        setLoginIdentifier("");
        setLoginPassword("");
        showToast("ok", data.message || "Signed in!");
      }
    } catch {
      showToast("err", "Failed to sign in.");
    } finally {
      setBusy(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryInput.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RECOVER_ACCOUNT",
          recoveryCode: recoveryInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("err", data.error || "Invalid recovery code");
      } else {
        onUserUpdated(data.user, data.ledger);
        setRecoveryInput("");
        showToast("ok", data.message || "Account recovered!");
      }
    } catch {
      showToast("err", "Recovery failed.");
    } finally {
      setBusy(false);
    }
  };

  const ticketBuyingPower = user
    ? Math.floor(user.balanceCents / TICKET_PRICE_CENTS)
    : 0;

  return (
    <aside className="bg-[#121822] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Mutuel Bankroll Header */}
      <div className="p-5 bg-gradient-to-br from-[#16202E] via-[#121822] to-[#0D1117] border-b border-slate-800">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#00D632]/15 text-[#00D632] border border-[#00D632]/30">
              <Wallet className="w-4 h-4" />
            </span>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-slate-400">
                CASH APP / MUTUEL WALLET
              </div>
              <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                @{user?.handle || "loading"}
                {user?.cashtag && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#00D632]/15 text-[#00D632] border border-[#00D632]/30">
                    {user.cashtag}
                  </span>
                )}
              </div>
            </div>
          </div>

          <span className="text-[11px] font-mono px-2 py-1 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            {ticketBuyingPower} TIX POWER
          </span>
        </div>

        {/* Balance Display */}
        <div className="bg-[#0B0F17] border border-slate-800/90 rounded-xl p-4 flex items-baseline justify-between">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              AVAILABLE BANKROLL
            </div>
            <div className="text-3xl font-mono font-bold text-[#00D632] tracking-tight mt-0.5">
              {user ? formatUSD(user.balanceCents) : "$0.00"}
            </div>
          </div>
          <div className="text-right font-mono text-xs space-y-0.5">
            <div className="text-slate-400">
              RECORD:{" "}
              <span className="text-emerald-400 font-semibold">
                {user?.wins ?? 0}W
              </span>
              –
              <span className="text-rose-400 font-semibold">
                {user?.losses ?? 0}L
              </span>
            </div>
            <div className="text-slate-400">
              WON:{" "}
              <span className="text-white font-semibold">
                {user ? formatUSD(user.totalWonCents) : "$0.00"}
              </span>
            </div>
          </div>
        </div>

        {/* Payout Destination Bar */}
        <div className="mt-3 flex items-center justify-between gap-2 bg-[#0B0F17]/70 px-3 py-2 rounded-lg border border-slate-800/80">
          <div className="text-xs text-slate-300 truncate">
            <span className="text-slate-500 font-mono mr-1.5">PAYOUT TO:</span>
            <span className="font-mono text-[#00D632] font-semibold">
              {user?.cashtag || "$NotSet"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("IDENTITY")}
            className="text-[11px] font-mono text-amber-400 hover:text-amber-300 underline shrink-0"
          >
            Edit $Cashtag
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`px-4 py-2.5 text-xs font-mono border-b ${
            feedback.type === "ok"
              ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/50"
              : "bg-rose-950/80 text-rose-300 border-rose-700/50"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="grid grid-cols-4 border-b border-slate-800 bg-[#0D1117] text-[11px] font-mono uppercase tracking-wider">
        <button
          type="button"
          onClick={() => setActiveTab("DEPOSIT")}
          className={`py-2.5 flex items-center justify-center gap-1 border-b-2 transition ${
            activeTab === "DEPOSIT"
              ? "border-[#00D632] text-[#00D632] bg-[#00D632]/5 font-bold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
          Deposit
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("WITHDRAW")}
          className={`py-2.5 flex items-center justify-center gap-1 border-b-2 transition ${
            activeTab === "WITHDRAW"
              ? "border-amber-400 text-amber-300 bg-amber-500/5 font-bold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          Cash Out
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("LEDGER")}
          className={`py-2.5 flex items-center justify-center gap-1 border-b-2 transition ${
            activeTab === "LEDGER"
              ? "border-sky-400 text-sky-300 bg-sky-500/5 font-bold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <ReceiptText className="w-3.5 h-3.5" />
          Ledger
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("IDENTITY")}
          className={`py-2.5 flex items-center justify-center gap-1 border-b-2 transition ${
            activeTab === "IDENTITY"
              ? "border-purple-400 text-purple-300 bg-purple-500/5 font-bold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          Account
        </button>
      </div>

      {/* Tab Body */}
      <div className="p-4">
        {activeTab === "DEPOSIT" && (
          <div className="space-y-3.5">
            <div className="p-2.5 rounded-lg bg-[#0B0F17] border border-[#00D632]/30 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">HOUSE CASH APP:</span>
              <span className="text-[#00D632] font-bold">$stockhunger</span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Quick Load ($5.00 = 1 Ticket)</span>
              <span className="font-mono text-[11px] text-emerald-400">
                Instant Credit
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { amt: 15, tix: 3 },
                { amt: 25, tix: 5 },
                { amt: 50, tix: 10 },
                { amt: 100, tix: 20 },
              ].map((preset) => (
                <button
                  key={preset.amt}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDepositDollars(String(preset.amt));
                    handleDeposit(preset.amt);
                  }}
                  className="py-2 px-1.5 rounded-lg bg-[#1A2332] hover:bg-[#00D632]/20 border border-slate-700 hover:border-[#00D632]/50 text-center transition group cursor-pointer"
                >
                  <div className="font-mono font-bold text-sm text-white group-hover:text-[#00D632]">
                    +${preset.amt}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">
                    {preset.tix} Tix
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-1">
              <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1.5">
                Custom Deposit Amount (USD)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min={5}
                    max={5000}
                    step={5}
                    value={depositDollars}
                    onChange={(e) => setDepositDollars(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-[#00D632]"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDeposit()}
                  className="px-4 py-2 rounded-lg bg-[#00D632] hover:bg-[#00b82b] text-slate-950 font-mono font-bold text-xs uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
                >
                  {busy ? "..." : "Add Funds"}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-[#0B0F17] hover:bg-slate-900 border border-[#00D632]/40 text-[#00D632] font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              Scan Cash App QR / Deep Link ($stockhunger)
            </button>

            <p className="text-[11px] text-slate-400 leading-relaxed bg-[#0B0F17] p-2.5 rounded-lg border border-slate-800/80">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 inline mr-1 -mt-0.5" />
              Every match win pays{" "}
              <span className="text-white font-semibold">
                90% of the total pot
              </span>{" "}
              directly into this balance the instant the 15-second clock locks.
            </p>
          </div>
        )}

        {activeTab === "WITHDRAW" && (
          <div className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                Cash App Payout Destination ($Cashtag)
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={cashtagInput}
                  onChange={(e) => setCashtagInput(e.target.value)}
                  placeholder="$stockhunger"
                  className="flex-1 px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-700 text-[#00D632] font-mono text-sm focus:outline-none focus:border-[#00D632]"
                />
                <button
                  type="button"
                  onClick={() => setCashtagInput("$stockhunger")}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-slate-300"
                >
                  $stockhunger
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-mono uppercase text-slate-400">
                  Withdraw Amount (USD)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setWithdrawDollars(
                      user ? (user.balanceCents / 100).toFixed(2) : "0"
                    )
                  }
                  className="text-[11px] font-mono text-amber-400 hover:underline"
                >
                  Withdraw Max ({user ? formatUSD(user.balanceCents) : "$0.00"})
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={withdrawDollars}
                  onChange={(e) => setWithdrawDollars(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleWithdraw}
                  className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-mono font-bold text-xs uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
                >
                  {busy ? "..." : "Cash Out"}
                </button>
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-400 bg-[#0B0F17] p-2.5 rounded-lg border border-slate-800">
              Total Withdrawn to Date:{" "}
              <span className="text-white font-bold">
                {user ? formatUSD(user.totalWithdrawnCents) : "$0.00"}
              </span>
            </div>
          </div>
        )}

        {activeTab === "LEDGER" && (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pb-1 border-b border-slate-800">
              <span>TRANSACTION AUDIT TRAIL</span>
              <span>{ledger.length} ENTRIES</span>
            </div>
            {ledger.length === 0 ? (
              <div className="text-xs text-slate-500 py-6 text-center font-mono">
                No wallet transactions recorded yet.
              </div>
            ) : (
              ledger.map((row) => {
                const isCredit = row.amountCents >= 0;
                return (
                  <div
                    key={row.id}
                    className="p-2.5 rounded-lg bg-[#0B0F17] border border-slate-800/90 flex items-start justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                            row.type === "MATCH_PAYOUT"
                              ? "bg-[#00D632]/15 text-[#00D632]"
                              : row.type === "MATCH_STAKE"
                              ? "bg-rose-500/15 text-rose-300"
                              : row.type === "WITHDRAWAL"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-sky-500/15 text-sky-300"
                          }`}
                        >
                          {row.type}
                        </span>
                        {row.matchCode && (
                          <button
                            type="button"
                            onClick={() =>
                              onSelectMatchCode &&
                              row.matchCode &&
                              onSelectMatchCode(row.matchCode)
                            }
                            className="font-mono text-[11px] text-amber-400 hover:underline"
                          >
                            #{row.matchCode}
                          </button>
                        )}
                      </div>
                      <div className="text-slate-300 text-[11px] mt-1 leading-snug">
                        {row.note}
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div
                        className={`font-bold ${
                          isCredit ? "text-[#00D632]" : "text-rose-400"
                        }`}
                      >
                        {formatUSD(row.amountCents, true)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Bal: {formatUSD(row.balanceAfterCents)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === "IDENTITY" && (
          <div className="space-y-4">
            <form onSubmit={handleSaveProfile} className="space-y-2.5">
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Player Handle
                </label>
                <input
                  type="text"
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 text-white font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                  Default Cash App ($Cashtag)
                </label>
                <input
                  type="text"
                  value={cashtagInput}
                  onChange={(e) => setCashtagInput(e.target.value)}
                  placeholder="$stockhunger"
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 text-[#00D632] font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@email.com"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 text-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                    Set Password
                  </label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder={user?.hasPassword ? "••••••" : "Min 4 chars"}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 text-white font-mono text-xs"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Save Account & $Cashtag
              </button>
            </form>

            {/* Sign In with Existing Handle/Email + Password */}
            <form
              onSubmit={handleLoginPassword}
              className="pt-2 border-t border-slate-800 space-y-2"
            >
              <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                <LogIn className="w-3 h-3 text-sky-400" />
                Sign In to Existing Account
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="Handle or Email"
                  className="px-2.5 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 text-white font-mono text-xs"
                />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password"
                  className="px-2.5 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 text-white font-mono text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs font-bold"
              >
                Sign In
              </button>
            </form>

            {/* Recovery Code Box */}
            <div className="p-3 rounded-xl bg-[#0B0F17] border border-amber-500/30 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase text-amber-400 font-semibold">
                  Instant Recovery Key
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (user?.recoveryCode) {
                      navigator.clipboard.writeText(user.recoveryCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }
                  }}
                  className="text-[10px] font-mono text-slate-300 hover:text-white flex items-center gap-1"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono text-xs font-bold tracking-widest text-white bg-slate-900 px-3 py-1.5 rounded border border-slate-800 text-center">
                {user?.recoveryCode || "RPS-XXXX-XXXX"}
              </div>
            </div>

            {/* Restore by Recovery Code */}
            <form
              onSubmit={handleRecover}
              className="pt-1 border-t border-slate-800"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={recoveryInput}
                  onChange={(e) => setRecoveryInput(e.target.value)}
                  placeholder="Restore by Key (RPS-XXXX-XXXX)"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 text-white font-mono text-xs uppercase"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs"
                >
                  Restore
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <CashAppModal
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        amountDollars={Number(depositDollars) || 25}
        playerCashtag={cashtagInput || user?.cashtag || "$player"}
        houseCashtag="$stockhunger"
        onConfirmDeposit={async (amt) => {
          await handleDeposit(amt);
        }}
      />
    </aside>
  );
}
