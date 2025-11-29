// src/app/layout.tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css"; // ⬅ bu satır artık dosyayı gerçekten bulacak

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
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
