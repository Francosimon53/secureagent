import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "SecureAgent - Enterprise-Grade AI Assistant",
  description: "Enterprise-Grade AI Assistant with OWASP Top 10 Compliance, Zero Trust Architecture, and Multi-Channel Support",
  keywords: ["AI", "Enterprise", "Security", "OWASP", "Zero Trust", "Discord", "Slack", "WhatsApp"],
  authors: [{ name: "SecureAgent Team" }],
  openGraph: {
    title: "SecureAgent - Enterprise-Grade AI Assistant",
    description: "Enterprise-Grade AI Assistant with OWASP Top 10 Compliance",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-gray-950 text-gray-100`}>
        {children}
      </body>
    </html>
  );
}
