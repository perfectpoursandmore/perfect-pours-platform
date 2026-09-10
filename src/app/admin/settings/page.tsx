export default function SettingsIndexPage() {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <h1 style={{ margin: 0 }}>Settings</h1>
      <div style={{ display: "grid", gap: "0.75rem", maxWidth: 360 }}>
        <a className="card" href="/admin/settings/consultations" style={{ textDecoration: "none", color: "inherit" }}>
          <strong>Consultation availability</strong>
          <div style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
            Hours, buffers, notice, blocked dates
          </div>
        </a>
        <a className="card" href="/admin/settings/calendar" style={{ textDecoration: "none", color: "inherit" }}>
          <strong>Google Calendar</strong>
          <div style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
            Connect the calendar used for conflict checking
          </div>
        </a>
        <a className="card" href="/admin/settings/quickbooks" style={{ textDecoration: "none", color: "inherit" }}>
          <strong>QuickBooks Online</strong>
          <div style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
            Connect the company used for deposit/balance invoices
          </div>
        </a>
        <a className="card" href="/admin/settings/email" style={{ textDecoration: "none", color: "inherit" }}>
          <strong>Email</strong>
          <div style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
            Check whether automatic sending is configured
          </div>
        </a>
      </div>
    </div>
  );
}
