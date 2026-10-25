import type { Metadata, Viewport } from "next";
import { Instrument_Serif, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const display = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const sans = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ARTIFEX · Techvidya",
  description: "ARTIFEX: the 10-minute poster design competition at Techvidya.",
};

export const viewport: Viewport = { themeColor: "#0e0d0b", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Reading request headers renders every page per request, so Next.js stamps each response's scripts with
  // the CSP nonce set in middleware.
  await headers();
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable} min-h-dvh antialiased`}>
        {children}
      </body>
    </html>
  );
}
