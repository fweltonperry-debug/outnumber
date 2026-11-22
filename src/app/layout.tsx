import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OUTNUMBER // $5 Multi-Ticket Rock Paper Scissors Exchange",
  description:
    "Hit PLAY, connect to a live opponent, buy X tickets ($5/ticket) during the 15-second countdown to outnumber your opponent, and win 90% of the pot instantly to your wallet (10% house cut).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0B0F17] text-slate-100 antialiased selection:bg-[#00D632] selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
