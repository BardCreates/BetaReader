import type { Metadata } from "next";
// Fonts are bundled with the app (no download at build/dev time — next/font/google
// fails in some Windows/offline/proxied environments).
import "@fontsource-variable/inter";
import "@fontsource-variable/literata";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Beta Reader", template: "%s · Beta Reader" },
  description: "An honest first reader for your manuscript: what's working, what isn't, and how to fix it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
