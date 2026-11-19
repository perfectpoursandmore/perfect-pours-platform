import { EXPENSES_SQL } from "@/lib/expenses-setup";

/** Shown until the expenses SQL has been run in Supabase. */
export function ExpensesSetupBox() {
  return (
    <details className="notice" open>
      <summary>
        <strong>One-time setup</strong> (turns on receipts). Tap to see how.
      </summary>
      <p style={{ margin: "0.5rem 0 0.4rem" }}>
        In Supabase, open the SQL Editor, paste all of this in and click Run. This box goes away after.
      </p>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.82rem", background: "#fff", padding: "0.6rem", borderRadius: 6 }}>
        {EXPENSES_SQL}
      </pre>
    </details>
  );
}
