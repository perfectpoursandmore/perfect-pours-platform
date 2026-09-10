export default function ClientPortalPage() {
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <h1 style={{ margin: 0 }}>Welcome</h1>
      <p style={{ color: "var(--color-muted)", maxWidth: 560 }}>
        Your proposal, contract, and payment status will appear here once
        the booking workflow is built (Phase 5-6). This portal only ever
        shows your own event — never any other client&apos;s information.
      </p>
    </div>
  );
}
