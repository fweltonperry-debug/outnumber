import React from "react";
import type { Throw } from "@/lib/game";

export function ThrowGlyph({
  type,
  className = "w-7 h-7",
}: {
  type: Throw;
  className?: string;
}) {
  if (type === "R") {
    // Engraved Heavy Faceted Stone / Fist Mutuel Glyph
    return (
      <svg
        viewBox="0 0 40 40"
        fill="none"
        className={className}
        aria-label="Rock"
      >
        <polygon
          points="12,7 28,6 35,16 32,31 19,35 7,28 5,15"
          fill="currentColor"
          fillOpacity="0.16"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <polyline
          points="12,7 18,18 35,16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <polyline
          points="5,15 18,18 19,35"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <line
          x1="18"
          y1="18"
          x2="28"
          y2="6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="2 2"
        />
        <circle cx="18" cy="18" r="2.2" fill="currentColor" />
      </svg>
    );
  }

  if (type === "P") {
    // Engraved Mutuel Bearer Scroll / Perforated Bill Glyph
    return (
      <svg
        viewBox="0 0 40 40"
        fill="none"
        className={className}
        aria-label="Paper"
      >
        <path
          d="M9 6H26L32 12V34H9V6Z"
          fill="currentColor"
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path
          d="M26 6V12H32"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <line
          x1="13"
          y1="16"
          x2="27"
          y2="16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="13"
          y1="22"
          x2="27"
          y2="22"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="13"
          y1="28"
          x2="22"
          y2="28"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // SCISSORS: Crossed Steel Shears Glyph
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-label="Scissors"
    >
      <circle
        cx="12"
        cy="29"
        r="5.2"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <circle
        cx="28"
        cy="29"
        r="5.2"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <line
        x1="15.5"
        y1="25"
        x2="31"
        y2="7"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <line
        x1="24.5"
        y1="25"
        x2="9"
        y2="7"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="20" cy="17.5" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function TicketTearLine({ dark = false }: { dark?: boolean }) {
  return (
    <div className="relative flex items-center my-3 select-none" aria-hidden="true">
      <div
        className={`w-3 h-6 rounded-r-full -ml-4 border-r ${
          dark
            ? "bg-[#0B0F17] border-slate-700/80"
            : "bg-[#0B0F17] border-amber-900/20"
        }`}
      />
      <div
        className={`flex-1 border-t-2 border-dashed ${
          dark ? "border-slate-700/80" : "border-stone-400/70"
        }`}
      />
      <div
        className={`w-3 h-6 rounded-l-full -mr-4 border-l ${
          dark
            ? "bg-[#0B0F17] border-slate-700/80"
            : "bg-[#0B0F17] border-amber-900/20"
        }`}
      />
    </div>
  );
}
