import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { AuthGate } from "@/components/AuthGate";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Personal Catalog",
  description: "A private catalog for tracking garments and their sources.",
  // Installable-app wiring. Paths include the /china base path (GitHub Pages).
  manifest: "/china/manifest.webmanifest",
  icons: {
    icon: "/china/favicon.png",
    apple: "/china/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Personal Catalog",
    statusBarStyle: "black-translucent",
  },
  // iOS still honours the Apple-prefixed tag for full-screen standalone mode.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0e",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
