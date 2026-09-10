import { isEmailConfigured } from "@/lib/email";

export default function EmailSettingsPage() {
  const configured = isEmailConfigured();

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 620 }}>
      <div>
        <h1 style={{ margin: 0 }}>Email</h1>
        <p style={{ color: "var(--color-muted)" }}>
          Sends consultation confirmations and the client&apos;s proposal/contract
          link automatically, using the templates in{" "}
          <a href="/admin/email-templates">Email templates</a>. Powered by Resend —
          see the README for the one-time setup.
        </p>
      </div>

      <div className="card">
        {configured ? (
          <p style={{ margin: 0, color: "#2a7a2a" }}>
            ✓ Configured — <code>RESEND_API_KEY</code> and <code>RESEND_FROM_EMAIL</code> are set.
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 0.5rem" }}>Not configured yet.</p>
            <p style={{ margin: 0, color: "var(--color-muted)", fontSize: "0.9rem" }}>
              Add <code>RESEND_API_KEY</code> and <code>RESEND_FROM_EMAIL</code> to your
              environment variables (see the README&apos;s Email setup section), then restart
              the app. Until then, the secure client link still shows on each event&apos;s
              Booking tab to copy/paste by hand — nothing is blocked by this being unset.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
