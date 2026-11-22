"use client";

import React, { useState, useMemo } from "react";
import {
  X,
  Share2,
  Copy,
  Check,
  QrCode,
  MessageCircle,
  Sparkles,
  Rocket,
} from "lucide-react";

interface ShareLaunchModalProps {
  open: boolean;
  onClose: () => void;
  matchCode?: string | null;
  ticketsX?: number;
}

function SiteQrSvg({ value }: { value: string }) {
  const size = 21;
  const cells = useMemo(() => {
    const grid: boolean[][] = Array.from({ length: size }, () =>
      Array(size).fill(false)
    );
    const drawFinder = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[r0 + r][c0 + c] = isBorder || isInner;
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const inTL = r < 8 && c < 8;
        const inTR = r < 8 && c >= size - 8;
        const inBL = r >= size - 8 && c < 8;
        if (inTL || inTR || inBL) continue;
        const bit = ((hash >>> ((r * size + c) % 24)) ^ (r * 19 + c * 29)) & 3;
        grid[r][c] = bit === 0 || bit === 1;
      }
    }
    return grid;
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-40 h-40 mx-auto rounded-xl bg-white p-2.5 shadow-inner border-2 border-amber-400"
      aria-label="Website Share QR Code"
    >
      {cells.map((row, rIdx) =>
        row.map((filled, cIdx) =>
          filled ? (
            <rect
              key={`${rIdx}-${cIdx}`}
              x={cIdx}
              y={rIdx}
              width={1}
              height={1}
              fill="#0B0F17"
              rx={0.15}
            />
          ) : null
        )
      )}
    </svg>
  );
}

export default function ShareLaunchModal({
  open,
  onClose,
  matchCode,
  ticketsX = 3,
}: ShareLaunchModalProps) {
  const [copiedType, setCopiedType] = useState<string | null>(null);

  if (!open) return null;

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://outnumber.gg";

  const shareUrl = matchCode ? `${origin}/m/${matchCode}` : origin;

  const smsChallengeText = `Play me on OUTNUMBER ($5 Multi-Ticket Rock Paper Scissors)! Hit PLAY, buy X tickets in 15 seconds to outnumber me, and winner takes 90% of the pot instantly: ${shareUrl}`;

  const socialPromoText = `🔥 $5 Multi-Ticket Rock Paper Scissors is LIVE! Buy ${ticketsX} tickets ($${
    ticketsX * 5
  }) vs 1 ticket ($5) to outnumber your opponent and lock the pot in 15 seconds. Play now: ${shareUrl}`;

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(key);
    setTimeout(() => setCopiedType(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-[#121822] border-2 border-amber-400 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-400 to-[#00D632] text-slate-950 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono uppercase font-bold tracking-wider">
                GET PLAYERS ON YOUR WEBSITE NOW
              </div>
              <h3 className="text-base font-black">
                Share Link, QR Code & Viral Challenge Texts
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-black/15 hover:bg-black/25 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="text-center space-y-2">
            <SiteQrSvg value={shareUrl} />
            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-center gap-1">
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              Have a friend scan this QR with their phone camera to join
              instantly
            </div>
          </div>

          {/* Direct Link Copy */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase text-slate-400">
              Direct Website / Match Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-700 text-[#00D632] font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => copyText("url", shareUrl)}
                className="px-4 py-2 rounded-lg bg-[#00D632] hover:bg-[#00b82b] text-slate-950 font-mono font-black text-xs uppercase flex items-center gap-1.5 cursor-pointer"
              >
                {copiedType === "url" ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy Link
                  </>
                )}
              </button>
            </div>
          </div>

          {/* iMessage / SMS / WhatsApp Challenge Copy */}
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase text-amber-400 font-bold flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" />
                1-on-1 Text / DM Challenge
              </span>
              <button
                type="button"
                onClick={() => copyText("sms", smsChallengeText)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white font-mono text-[11px] flex items-center gap-1 cursor-pointer"
              >
                {copiedType === "sms" ? (
                  <>
                    <Check className="w-3 h-3 text-[#00D632]" /> Copied Text
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copy DM
                  </>
                )}
              </button>
            </div>
            <p className="text-xs font-mono text-slate-300 leading-relaxed">
              &ldquo;{smsChallengeText}&rdquo;
            </p>
          </div>

          {/* TikTok / IG Story / X Promo Copy */}
          <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase text-[#00D632] font-bold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                TikTok / IG Story / X Launch Caption
              </span>
              <button
                type="button"
                onClick={() => copyText("social", socialPromoText)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white font-mono text-[11px] flex items-center gap-1 cursor-pointer"
              >
                {copiedType === "social" ? (
                  <>
                    <Check className="w-3 h-3 text-[#00D632]" /> Copied Caption
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copy Post
                  </>
                )}
              </button>
            </div>
            <p className="text-xs font-mono text-slate-300 leading-relaxed">
              &ldquo;{socialPromoText}&rdquo;
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
