import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home Poker",
  description: "Play no-limit hold'em with friends.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-900 text-neutral-100 min-h-screen">{children}</body>
    </html>
  );
}
