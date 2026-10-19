import type { Metadata } from "next";
import { Inter, Literata } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const literata = Literata({ subsets: ["latin"], variable: "--font-literata" });

export const metadata: Metadata = {
  title: { default: "Beta Reader", template: "%s · Beta Reader" },
  description: "An honest first reader for your manuscript: what's working, what isn't, and how to fix it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${literata.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
