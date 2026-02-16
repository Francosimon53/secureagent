import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "SecureAgent — HIPAA-Compliant AI for Behavioral Health",
  description:
    "Built by BCBAs, for BCBAs. Session notes, pre-authorizations, parent training summaries — all from Telegram, all HIPAA-compliant.",
  keywords: [
    "HIPAA",
    "ABA Therapy",
    "BCBA",
    "RBT",
    "AI Assistant",
    "Session Notes",
    "Behavioral Health",
    "Telegram",
  ],
  authors: [{ name: "SecureAgent" }],
  openGraph: {
    title: "SecureAgent — HIPAA-Compliant AI for Behavioral Health",
    description:
      "Built by BCBAs, for BCBAs. The AI assistant that understands your clinical practice.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${dmSans.variable} ${playfair.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
