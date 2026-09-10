type RoleShellProps = {
  areaLabel: string;
  userName: string | null;
  navItems: { label: string; href: string }[];
  children: React.ReactNode;
};

export function RoleShell({ areaLabel, userName, navItems, children }: RoleShellProps) {
  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <aside
        style={{
          width: 220,
          borderRight: "1px solid var(--color-border)",
          padding: "1.25rem 1rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>Perfect Pours</div>
          <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>{areaLabel}</div>
        </div>

        <nav style={{ display: "grid", gap: "0.5rem" }}>
          {navItems.map((item) => (
            <a key={item.href} href={item.href} style={{ fontSize: "0.9rem", color: "inherit" }}>
              {item.label}
            </a>
          ))}
        </nav>

        <div style={{ marginTop: "auto", fontSize: "0.85rem" }}>
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

      <main style={{ flex: 1, padding: "2rem" }}>{children}</main>
    </div>
  );
}
