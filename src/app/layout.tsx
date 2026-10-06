import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perfect Pours & More — Business Platform",
  description: "Event booking, client, and staff management for Perfect Pours & More.",
  // iPhone "Add to Home Screen": open full screen like an app, under this name.
  appleWebApp: { capable: true, title: "Perfect Pours", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
