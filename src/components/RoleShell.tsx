"use client";

import { useEffect, useState } from "react";

type RoleShellProps = {
  areaLabel: string;
  userName: string | null;
  navItems: { label: string; href: string }[];
  children: React.ReactNode;
};

export function RoleShell({ areaLabel, userName, navItems, children }: RoleShellProps) {
  // Only matters on phones: the side bar is hidden off-screen until the
  // three-line menu button opens it. On desktop it's always visible.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="role-shell">
      <header className="role-shell-topbar">
        <button
          type="button"
          className="role-shell-menu-button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="role-shell-aside"
          onClick={() => setMenuOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <div>
          <div style={{ fontWeight: 600 }}>Perfect Pours</div>
          <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>{areaLabel}</div>
        </div>
      </header>

      {menuOpen && <div className="role-shell-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside id="role-shell-aside" className={`role-shell-aside${menuOpen ? " open" : ""}`}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 600 }}>Perfect Pours</div>
            <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>{areaLabel}</div>
          </div>
          <button
            type="button"
            className="role-shell-close-button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            ×
          </button>
        </div>

        <nav className="role-shell-nav">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              style={{ fontSize: "0.9rem", color: "inherit" }}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="role-shell-signout" style={{ marginTop: "auto", fontSize: "0.85rem" }}>
          {userName && <div style={{ marginBottom: "0.5rem" }}>{userName}</div>}
          <form action="/api/auth/sign-out" method="post">
            <button
              type="submit"
              style={{
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "0.4rem 0.7rem",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="role-shell-main">{children}</main>
    </div>
  );
}
