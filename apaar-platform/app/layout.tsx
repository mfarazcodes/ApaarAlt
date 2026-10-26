import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "APAAR Bridge — Unified Student Data Verification",
  description:
    "Bridge College ERPs, AICTE compliance, NAD/ABC credits and student consent in one zero-timeout verification layer.",
};

// Applies the saved accent theme before first paint so the page never flashes the default.
const themeInit = `try{var t=localStorage.getItem("apaar-theme");if(t==="emerald"||t==="cobalt"||t==="amber"){document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="emerald" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
