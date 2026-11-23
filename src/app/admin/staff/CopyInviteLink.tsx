"use client";

import { useState } from "react";

/** Shows a just-made invite link with a Copy button, so Faith can text it. */
export function CopyInviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the box below is still selectable by hand.
    }
  }

  return (
    <div className="card" style={{ display: "grid", gap: "0.5rem" }}>
      <p style={{ margin: 0, fontSize: "0.9rem" }}>
        You can also text them this link. It works once, so send only the newest one.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ flex: "1 1 220px", minWidth: 0 }} />
        <button type="button" className="button" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
