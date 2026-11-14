import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/shell/Shell";

export const metadata: Metadata = {
  title: "VeriSec Case Investigator",
  description: "Investigate a financial case: every document, every relationship, every finding with its proof.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Same fonts as the VeriSec console: Archivo (display), Hanken Grotesk (body), IBM Plex Mono (mono). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
