"use client";

import React, { useState, useEffect, useCallback } from "react";
import { MessageSquare, Send, Flame, ArrowRight } from "lucide-react";

interface FloorMsg {
  id: number;
  userId: number;
  userHandle: string;
  cashtag: string;
  message: string;
  matchCode: string | null;
  ticketsOffered: number | null;
  createdAt: string;
}

export default function FloorChat({
  activeMatchCode,
  currentTickets,
  onSelectMatchCode,
}: {
  activeMatchCode?: string | null;
  currentTickets?: number;
  onSelectMatchCode?: (code: string) => void;
}) {
  const [messages, setMessages] = useState<FloorMsg[]>([]);
  const [input, setInput] = useState("");
  const [attachCode, setAttachCode] = useState(true);
  const [sending, setSending] = useState(false);

  const loadChat = useCallback(async () => {
    try {
      const res = await fetch("/api/chat");
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadChat();
    const timer = setInterval(loadChat, 6000);
    return () => clearInterval(timer);
  }, [loadChat]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input.trim(),
          matchCode: attachCode && activeMatchCode ? activeMatchCode : null,
          ticketsOffered: currentTickets || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setInput("");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-[#121822] border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#00D632]" />
          <span className="text-xs font-mono uppercase tracking-wider font-bold text-white">
            LIVE EXCHANGE FLOOR PIT
          </span>
        </div>
        <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
          <Flame className="w-3 h-3" /> Live Action Feed
        </span>
      </div>

      {/* Messages Feed */}
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {messages.map((m) => (
          <div
            key={m.id}
            className="p-2.5 rounded-xl bg-[#0B0F17] border border-slate-800/90 text-xs flex items-start justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap font-mono">
                <span className="font-bold text-[#00D632]">
                  @{m.userHandle}
                </span>
                {m.cashtag && (
                  <span className="text-[10px] text-slate-500">
                    ({m.cashtag})
                  </span>
                )}
                {m.ticketsOffered && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                    {m.ticketsOffered} TIX (${m.ticketsOffered * 5})
                  </span>
                )}
              </div>
              <p className="text-slate-200 mt-1 leading-snug break-words">
                {m.message}
              </p>
            </div>
            {m.matchCode && onSelectMatchCode && (
              <button
                type="button"
                onClick={() => onSelectMatchCode(m.matchCode!)}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-[#00D632]/15 hover:bg-[#00D632]/25 text-[#00D632] border border-[#00D632]/30 font-mono text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                #{m.matchCode} <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Post to Floor Form */}
      <form onSubmit={handleSend} className="space-y-2 pt-1">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Call out a challenge or flex your outnumber win..."
            maxLength={220}
            className="flex-1 px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-[#00D632]"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-3.5 py-2 rounded-lg bg-[#00D632] hover:bg-[#00b82b] text-slate-950 font-mono font-bold text-xs uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            Post
          </button>
        </div>
        {activeMatchCode && (
          <label className="flex items-center gap-2 text-[11px] font-mono text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={attachCode}
              onChange={(e) => setAttachCode(e.target.checked)}
              className="accent-[#00D632]"
            />
            Attach current match slip #{activeMatchCode}
          </label>
        )}
      </form>
    </div>
  );
}
