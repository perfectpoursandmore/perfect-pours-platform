"use client";

/**
 * A plain server-action delete button would fire on a stray click with no
 * way back — this just gates the same submit behind a native confirm()
 * so "delete this event" always takes a deliberate second step.
 */
export function DeleteEventButton({ eventName }: { eventName: string }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (
          !confirm(
            `Permanently delete "${eventName}"? This can't be undone — staffing, proposal, and contract info for this event is deleted too.`
          )
        ) {
          e.preventDefault();
        }
      }}
      style={{
        background: "none",
        border: "1px solid #a33",
        color: "#a33",
        borderRadius: 8,
        padding: "0.6rem 1.1rem",
        cursor: "pointer",
        fontSize: "0.95rem",
        justifySelf: "start",
      }}
    >
      Delete this event permanently
    </button>
  );
}
