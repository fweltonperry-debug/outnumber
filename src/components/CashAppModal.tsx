"use client";

import React, { useState, useMemo } from "react";
import {
  X,
  QrCode,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

interface CashAppModalProps {
  open: boolean;
  onClose: () => void;
  amountDollars: number;
  playerCashtag: string;
  houseCashtag?: string;
  onConfirmDeposit: (amountDollars: number) => Promise<void>;
}

/**
 * Generates a deterministic 21x21 QR-style SVG matrix from the Cash App deep link URL
 * with standard finder patterns in the three corners.
 */
function CashAppQrSvg({ value }: { value: string }) {
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
        const inTopLeft = r < 8 && c < 8;
        const inTopRight = r < 8 && c >= size - 8;
        const inBottomLeft = r >= size - 8 && c < 8;
        if (inTopLeft || inTopRight || inBottomLeft) continue;
        const bit = ((hash >>> ((r * size + c) % 24)) ^ (r * 17 + c * 31)) & 3;
        grid[r][c] = bit === 0 || bit === 2;
      }
    }

    return grid;
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-44 h-44 mx-auto rounded-xl bg-white p-2.5 shadow-inner border-2 border-[#00D632]"
      aria-label="Cash App QR Code"
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

export default function CashAppModal({
  open,
  onClose,
  amountDollars,
  playerCashtag,
  houseCashtag = "$stockhunger",
  onConfirmDeposit,
}: CashAppModalProps) {
  const [copiedTag, setCopiedTag] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const safeAmount = Math.max(5, Math.round(amountDollars || 25));
  const cleanHouseTag = houseCashtag.startsWith("$")
    ? houseCashtag
    : `$${houseCashtag}`;
  const cashAppUrl = `https://cash.app/${cleanHouseTag}/${safeAmount}`;
  const ticketsCount = Math.floor(safeAmount / 5);

  if (!open) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirmDeposit(safeAmount);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#121822] border-2 border-[#00D632] rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-[#00D632] text-slate-950 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            <div>
              <div className="text-[10px] font-mono uppercase font-bold tracking-wider">
                OFFICIAL CASH APP TICKET WINDOW
              </div>
              <h3 className="text-base font-black">
                Load ${safeAmount.toFixed(2)} ({ticketsCount} Tickets)
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
        <div className="p-5 space-y-4 text-center">
          <CashAppQrSvg value={cashAppUrl} />

          <div className="space-y-1">
            <div className="text-xs font-mono text-slate-400">
              SEND VIA CASH APP TO HOUSE CASHTAG:
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#0B0F17] border border-slate-800">
              <span className="font-mono font-black text-lg text-[#00D632]">
                {cleanHouseTag}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(cleanHouseTag);
                  setCopiedTag(true);
                  setTimeout(() => setCopiedTag(false), 2000);
                }}
                className="text-xs font-mono text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {copiedTag ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#00D632]" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#0B0F17] border border-slate-800 text-left font-mono text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Your $Cashtag:</span>
              <span className="text-white font-bold">
                {playerCashtag || "$player"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Deposit Amount:</span>
              <span className="text-[#00D632] font-bold">
                ${safeAmount.toFixed(2)} ({ticketsCount} × $5 Tickets)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Winner Payout Rate:</span>
              <span className="text-amber-400 font-bold">
                90% of Pot (10% House Cut)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <a
              href={cashAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase flex items-center justify-center gap-1.5 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#00D632]" />
              Open Cash App Link
            </a>
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirm}
              className="py-3 px-4 rounded-xl bg-[#00D632] hover:bg-[#00b82b] text-slate-950 font-mono font-black text-xs uppercase flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting
                ? "Crediting..."
                : `Instant Credit +$${safeAmount}`}
            </button>
          </div>

          <p className="text-[11px] font-mono text-slate-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00D632]" />
            Generates an audited CA-XXXXXX receipt in your Wallet Ledger & Admin
            Console.
          </p>
        </div>
      </div>
    </div>
  );
}
