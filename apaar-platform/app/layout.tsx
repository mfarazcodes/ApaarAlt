import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { currentLang } from "@/lib/lang-server";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  title: "APAAR Bridge — Unified Student Data Verification",
  description:
    "Colleges fix name and marks errors before APAAR rejects them. Students choose who sees what. Employers check a degree in seconds, even offline.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The language is read on the server so the first paint, and screen readers, get the right one.
  const lang = await currentLang();
  return (
    <html lang={lang} data-theme="emerald">
      <body>{children}</body>
    </html>
  );
}
