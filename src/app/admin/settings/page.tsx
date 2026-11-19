export default function SettingsIndexPage() {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <h1 style={{ margin: 0 }}>Settings</h1>
      <div style={{ display: "grid", gap: "0.75rem", maxWidth: 360 }}>
        <a className="card" href="/admin/money" style={{ textDecoration: "none", color: "inherit" }}>
          <strong>Money</strong>
          <div style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
            Receipts, and what you kept each month
          </div>
        </a>
        <a className="card" href="/admin/services" style={{ textDecoration: "none", color: "inherit" }}>
          <strong>Services &amp; prices</strong>
          <div style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
            What you sell and what it costs
          </div>
        </a>
        <a className="card" href="/admin/templates" style={{ textDecoration: "none", color: "inherit" }}>
          <strong>Contract templates</strong>
          <div style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
            The wording of your contracts
          </div>
        </a>
        <a className="card" href="/admin/email-templates" style={{ textDecoration: "none", color: "inherit" }}>
          <strong>Email templates</strong>
          <div style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
            The emails the app sends clients
          </div>
        </a>
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
        <a className="card" href="/admin/settings/text-inbox" style={{ textDecoration: "none", color: "inherit" }}>
          <strong>iPhone buttons</strong>
          <div style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
            Send client texts here, and add to-dos by Siri or one tap
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
