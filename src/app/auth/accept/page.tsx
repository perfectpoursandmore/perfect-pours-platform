import { acceptInvite } from "./actions";

/**
 * Landing page for staff invite links. Opening it does nothing on its own
 * (so email link scanners can't use up the invite); the person taps the
 * button to actually sign in and go choose a password.
 */
export default function AcceptInvitePage({
  searchParams,
}: {
  searchParams: { token_hash?: string; type?: string };
}) {
  const tokenHash = searchParams.token_hash ?? "";
  const type = searchParams.type ?? "invite";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <form
        action={acceptInvite}
        className="card"
        style={{ width: "100%", maxWidth: 380, display: "grid", gap: "1rem" }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.3rem" }}>Welcome to Perfect Pours &amp; More</h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--color-muted)", fontSize: "0.9rem" }}>
            {tokenHash
              ? "Tap the button below to set up your staff account. Next you'll choose a password."
              : "This link is missing part of it. Ask Faith to send you a new invite."}
          </p>
        </div>

        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />

        {tokenHash && (
          <button type="submit" className="button">
            Set up my account
          </button>
        )}
      </form>
    </main>
  );
}
