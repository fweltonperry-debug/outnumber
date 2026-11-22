import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-200 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <Lock className="w-6 h-6 text-[#00D632]" />
            <h1 className="text-2xl font-black text-white">Privacy Policy</h1>
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
            <h2 className="text-base font-mono font-bold uppercase text-[#00D632]">
              1. Information We Store
            </h2>
            <p>
              We store your chosen player handle, your designated payout handle
              (such as a Cash App $Cashtag), an encrypted HTTP-only session
              token cookie, your unique recovery code, and your double-entry
              match & wallet transaction ledger in PostgreSQL.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-mono font-bold uppercase text-[#00D632]">
              2. Public Match Tape & Leaderboard Transparency
            </h2>
            <p>
              To guarantee verifiable pari-mutuel fairness, settled match slips
              (including ticket counts, assigned throws after lock, 10% house
              rake, and 90% winner payout) and leaderboard standings are visible
              on the public exchange tape by handle.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-mono font-bold uppercase text-[#00D632]">
              3. Session & Recovery Key Security
            </h2>
            <p>
              Keep your Account Recovery Key (<code className="font-mono text-white">RPS-XXXX-XXXX</code>)
              confidential. Anyone with your recovery key can restore your
              session on another device.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
