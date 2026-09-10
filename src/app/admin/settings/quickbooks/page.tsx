import { createClient } from "@/lib/supabase/server";
import { disconnectQuickBooks } from "./actions";

export default async function QuickBooksSettingsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const supabase = createClient();
  const { data: connection } = await supabase
    .from("qbo_connections")
    .select("connected_at, realm_id, environment")
    .eq("id", true)
    .single();

  const isConnected = Boolean(connection?.connected_at && connection?.realm_id);

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 620 }}>
      <div>
        <h1 style={{ margin: 0 }}>QuickBooks Online</h1>
        <p style={{ color: "var(--color-muted)" }}>
          Lets this app create and send real QuickBooks invoices for deposits and
          balances, and check whether they&apos;ve been paid. All bookkeeping and
          actual payment collection still happens in QuickBooks itself — this app
          never touches a card number.
        </p>
      </div>

      {searchParams.connected && (
        <p style={{ color: "#2a7a2a" }}>QuickBooks connected successfully.</p>
      )}
      {searchParams.error && <p style={{ color: "#a33" }}>{searchParams.error}</p>}

      <div className="card">
        {isConnected ? (
          <>
            <p style={{ margin: "0 0 1rem" }}>
              ✓ Connected to QuickBooks company <strong>{connection?.realm_id}</strong> (
              {connection?.environment}) since{" "}
              {new Date(connection!.connected_at as string).toLocaleDateString()}.
            </p>
            <form action={disconnectQuickBooks}>
              <button
                type="submit"
                style={{
                  background: "none",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  padding: "0.5rem 0.9rem",
                  cursor: "pointer",
                }}
              >
                Disconnect
              </button>
            </form>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 1rem" }}>Not connected yet.</p>
            <a href="/api/quickbooks/connect" className="button">
              Connect QuickBooks
            </a>
          </>
        )}
      </div>
    </div>
  );
}
