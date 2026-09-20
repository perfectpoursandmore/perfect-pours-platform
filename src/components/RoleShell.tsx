type RoleShellProps = {
  areaLabel: string;
  userName: string | null;
  navItems: { label: string; href: string }[];
  children: React.ReactNode;
};

export function RoleShell({ areaLabel, userName, navItems, children }: RoleShellProps) {
  return (
    <div className="role-shell">
      <aside className="role-shell-aside">
        <div>
          <div style={{ fontWeight: 600 }}>Perfect Pours</div>
          <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>{areaLabel}</div>
        </div>

        <nav className="role-shell-nav">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} style={{ fontSize: "0.9rem", color: "inherit" }}>
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
