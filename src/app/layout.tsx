import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perfect Pours & More — Business Platform",
  description: "Event booking, client, and staff management for Perfect Pours & More.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
