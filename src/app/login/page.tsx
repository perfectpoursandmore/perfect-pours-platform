import { signIn } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
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
        action={signIn}
        className="card"
        style={{ width: "100%", maxWidth: 380, display: "grid", gap: "1rem" }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.3rem" }}>Perfect Pours &amp; More</h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--color-muted)", fontSize: "0.9rem" }}>
            Sign in to your account
          </p>
        </div>

        {searchParams.error && (
          <p style={{ color: "#a33", fontSize: "0.85rem", margin: 0 }}>{searchParams.error}</p>
        )}

        <input type="hidden" name="next" value={searchParams.next ?? ""} />

        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>

        <button type="submit" className="button">
          Sign in
        </button>
      </form>
    </main>
  );
}
