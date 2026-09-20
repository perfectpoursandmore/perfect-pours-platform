"use client";

/**
 * Same pattern as the event delete button: a native confirm() gates the
 * submit so a stray click can't delete a lead with no way back.
 */
export function DeleteLeadButton({ leadName }: { leadName: string }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(`Delete the lead for ${leadName}? This can't be undone.`)) {
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
      }}
    >
      Delete lead
    </button>
  );
}
