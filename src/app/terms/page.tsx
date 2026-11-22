import Link from "next/link";
import { Scale, ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-200 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <Scale className="w-6 h-6 text-amber-400" />
            <h1 className="text-2xl font-black text-white">
              Terms of Service & Official Mutuel Rules
            </h1>
          </div>
          <Link
            href="/"
            className="px-4 py-2 rounded-xl bg-[#00D632] text-slate-950 font-mono font-bold text-xs uppercase flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Exchange
          </Link>
        </div>

        <div className="bg-[#121822] border border-slate-800 rounded-2xl p-6 space-y-5 text-sm leading-relaxed text-slate-300">
          <section className="space-y-2">
            <h2 className="text-base font-mono font-bold uppercase text-amber-400">
              1. Multi-Ticket Outnumber Mechanics ($5.00 / Ticket)
            </h2>
            <p>
              Each match connects two players into a live 15-second countdown
              window. During the 15-second countdown, each participant may
              purchase any number of tickets (&quot;X tickets&quot;) at $5.00 per
              ticket up to their available wallet balance, and assign ROCK,
              PAPER, or SCISSORS to each ticket.
            </p>
            <p>
              When the 15-second timer reaches 0.0s (or both players lock in),
              lines lock. Contested bouts are paired up to{" "}
              <code className="text-white font-mono">
                min(TicketsA, TicketsB)
              </code>
              . Any excess tickets held by the player who purchased more tickets
              (
              <code className="text-white font-mono">
                |TicketsA - TicketsB|
              </code>
              ) score as uncontested Outnumber Byes (+1 automatic point per
              extra ticket).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-mono font-bold uppercase text-amber-400">
              2. Pot Settlement & 10% Platform Rake
            </h2>
            <p>
              The Gross Match Pot equals{" "}
              <code className="text-white font-mono">
                (TicketsA + TicketsB) × $5.00
              </code>
              . A 10% house platform fee is deducted and booked to the House
              Ledger on every settled match. The remaining 90% of the Gross Pot
              is credited immediately to the winning player&apos;s wallet
              balance.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-mono font-bold uppercase text-amber-400">
              3. Wallet Deposits & Cash App ($Cashtag) Payouts
            </h2>
            <p>
              Players can load funds ($5.00 minimum = 1 ticket) and cash out
              winnings to their designated Cash App $Cashtag at any time from
              the Wallet panel. Every deposit, withdrawal, match stake, and
              winner payout is recorded with an immutable reference code in the
              transaction ledger.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-mono font-bold uppercase text-amber-400">
              4. Eligibility & Fair Play
            </h2>
            <p>
              Participants must be 18 years of age or older. Accounts may be
              suspended or voided by the House Administrator in the event of
              abuse or technical malfunction.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
