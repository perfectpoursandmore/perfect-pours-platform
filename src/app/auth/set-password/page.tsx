import { updatePassword } from "./actions";

export default function SetPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
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
        action={updatePassword}
        className="card"
        style={{ width: "100%", maxWidth: 380, display: "grid", gap: "1rem" }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.3rem" }}>Set your password</h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--color-muted)", fontSize: "0.9rem" }}>
            Choose a password for your Perfect Pours &amp; More account. You&apos;ll use this to
            sign in from now on.
          </p>
        </div>

        {searchParams.error && (
          <p style={{ color: "#a33", fontSize: "0.85rem", margin: 0 }}>{searchParams.error}</p>
        )}

        <div>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="button">
          Set password &amp; continue
        </button>
      </form>
    </main>
  );
}
