import { createClient } from "@/lib/supabase/server";
import { addEventNote } from "../../actions";

export default async function EventNotesPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: notes } = await supabase
    .from("event_notes")
    .select("id, note, created_at")
    .eq("event_id", params.id)
    .order("created_at", { ascending: false });

  return (
    <div className="card">
      <p style={{ color: "var(--color-muted)", marginTop: 0 }}>
        Private, admin-only. Whatever you learn by text, call, or in person about this event
        goes here — dietary requests, who&apos;s bringing what, timing quirks, anything you&apos;d
        otherwise have to remember.
      </p>

      <form action={addEventNote} style={{ display: "grid", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <input type="hidden" name="eventId" value={params.id} />
        <textarea
          name="note"
          required
          rows={3}
          placeholder="e.g. Client is providing wine. Outdoor bar has no running water."
          style={{
            width: "100%",
            padding: "0.55rem 0.7rem",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            fontFamily: "inherit",
            fontSize: "0.95rem",
          }}
        />
        <button type="submit" className="button" style={{ justifySelf: "start" }}>
          Add note
        </button>
      </form>

      {notes && notes.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.75rem" }}>
          {notes.map((n) => (
            <li key={n.id} style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.75rem" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                {new Date(n.created_at).toLocaleString()}
              </div>
              <div>{n.note}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: "var(--color-muted)", margin: 0 }}>No notes yet.</p>
      )}
    </div>
  );
}
