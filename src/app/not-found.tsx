import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0B0F17] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#121822] border border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <div className="inline-block px-3 py-1 rounded bg-rose-500/15 text-rose-400 font-mono text-xs font-bold uppercase">
          404 • TICKET SLIP NOT FOUND
        </div>
        <h1 className="text-2xl font-black">No Match Found at This Window</h1>
        <p className="text-xs font-mono text-slate-400">
          The mutuel slip code or page you requested does not exist on the book.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-[#00D632] text-slate-950 font-mono font-black text-xs uppercase tracking-wider"
        >
          Return to Live Arena →
        </Link>
      </div>
    </div>
  );
}
