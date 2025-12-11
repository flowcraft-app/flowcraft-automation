// src/app/layout.tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AppHeader from "../components/AppHeader";

export const metadata: Metadata = {
  title: "FlowCraft",
  description: "Flow automation platform",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen flex flex-col">
        <AppHeader />
        <main className="flex-1 min-h-0 flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}
