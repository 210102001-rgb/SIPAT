import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SIPAT — Sistem Peringatan Gempa Cepat dan Praktis",
  description:
    "SIPAT — Sistem Peringatan Gempa Cepat dan Praktis. Monitoring seismik real-time, klasifikasi getaran, dan peringatan dini 4 level (simulasi demo).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-page font-sans text-ink">{children}</body>
    </html>
  );
}
