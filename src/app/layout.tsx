import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistem Manajemen Hotel — Operasional & Laba Harian",
  description: "PMS & Laporan Laba Harian Hotel Nusantara (Fase 1 MVP)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900 font-sans">{children}</body>
    </html>
  );
}
