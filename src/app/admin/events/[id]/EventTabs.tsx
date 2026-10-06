"use client";

import { usePathname } from "next/navigation";

/** Overview / Notes / Staff / Booking tabs, with the current one underlined. */
export function EventTabs({ base }: { base: string }) {
  const pathname = usePathname();
  const tabs = [
    { label: "Booking", href: `${base}/booking` },
    { label: "Overview", href: base },
    { label: "Staff", href: `${base}/staff` },
    { label: "Notes", href: `${base}/notes` },
  ];
  return (
    <nav style={{ display: "flex", gap: "1.5rem", borderBottom: "1px solid var(--color-border)" }}>
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname?.startsWith(t.href);
        return (
          <a
            key={t.href}
            href={t.href}
            style={{
              padding: "0.5rem 0",
              marginBottom: -1,
              textDecoration: "none",
              color: active ? "var(--color-text)" : "var(--color-muted)",
              fontWeight: active ? 600 : 400,
              borderBottom: active ? "2px solid var(--color-text)" : "2px solid transparent",
            }}
          >
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}
