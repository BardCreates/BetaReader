import type { Metadata } from "next";
// Fonts are bundled with the app (no download at build/dev time — next/font/google
// fails in some Windows/offline/proxied environments).
import "@fontsource-variable/source-sans-3";
import "@fontsource-variable/literata";
import "./globals.css";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: `${BRAND.name}: ${BRAND.tagline.replace(/\.$/, "")}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions often add attributes to <html> before React loads.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
