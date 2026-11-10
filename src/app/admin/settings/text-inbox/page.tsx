import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resetInboxToken } from "./actions";

const code = {
  display: "block",
  padding: "0.5rem 0.65rem",
  borderRadius: 8,
  background: "var(--color-soft)",
  border: "1px solid var(--color-border)",
  fontSize: "0.85rem",
  overflowWrap: "anywhere" as const,
  userSelect: "all" as const,
};

export default async function TextInboxSettingsPage() {
  const supabase = createClient();
  const { data: settings } = await supabase.from("inbox_settings").select("token").eq("id", true).single();

  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;
  const endpoint = `${appUrl.replace(/\/$/, "")}/api/inbox`;

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 620 }}>
      <div>
        <h1 style={{ margin: 0 }}>Text inbox (iPhone)</h1>
        <p style={{ color: "var(--color-muted)" }}>
          A one-tap button on your iPhone that sends a client&apos;s text to the &quot;Texts to
          handle&quot; list on your dashboard. Set it up once (about 5 minutes); after that it&apos;s
          copy the text, tap the button.
        </p>
      </div>

      {!settings?.token ? (
        <p style={{ color: "var(--color-danger)" }}>
          The inbox isn&apos;t set up in the database yet. Run <code>supabase/migrations/0024_text_inbox.sql</code> in
          the Supabase SQL Editor, then reload this page.
        </p>
      ) : (
        <>
          <div className="card" style={{ display: "grid", gap: "0.75rem" }}>
            <h2 style={{ margin: 0, fontSize: "1rem" }}>You&apos;ll paste these two things into the Shortcut</h2>
            <div>
              <div style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>Web address</div>
              <code style={code}>{endpoint}</code>
            </div>
            <div>
              <div style={{ fontSize: "0.85rem", marginBottom: "0.25rem" }}>Your secret key (don&apos;t share it)</div>
              <code style={code}>{settings.token}</code>
            </div>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--color-muted)" }}>
              Tip: open this page on your phone so you can copy and paste straight into the Shortcuts app.
            </p>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Build the Shortcut</h2>
            <ol style={{ margin: 0, paddingLeft: "1.2rem", display: "grid", gap: "0.6rem", fontSize: "0.92rem" }}>
              <li>Open the <strong>Shortcuts</strong> app, tap <strong>+</strong>, and name it <strong>Send to Perfect Pours</strong>.</li>
              <li>
                Tap the <strong>ⓘ</strong> (details) and turn on <strong>Show in Share Sheet</strong>. Back in the
                Shortcut, tap the first line it adds (&quot;Receive … input from Share Sheet&quot;), set it to
                <strong> Text</strong>, and set &quot;If there&apos;s no input&quot; to <strong>Get Clipboard</strong>.
              </li>
              <li>
                Add the action <strong>Get Contents of URL</strong>. Paste the web address above. Tap the arrow to
                expand it: Method <strong>POST</strong>, Request Body <strong>JSON</strong>, then add two
                <strong> Text</strong> fields:
                <ul style={{ marginTop: "0.3rem" }}>
                  <li><code>token</code> → paste your secret key</li>
                  <li><code>text</code> → tap the variable bar and pick <strong>Shortcut Input</strong></li>
                </ul>
              </li>
              <li>
                Add <strong>Get Dictionary Value</strong> (Get <strong>Value</strong> for <code>message</code> in
                Contents of URL), then <strong>Show Notification</strong> with that Dictionary Value. That&apos;s
                your &quot;Added ✓&quot; confirmation.
              </li>
              <li>Tap the share icon at the bottom → <strong>Add to Home Screen</strong>.</li>
              <li>
                Optional, but the fastest: <strong>Settings → Accessibility → Touch → Back Tap → Double Tap</strong> →
                pick <strong>Send to Perfect Pours</strong>. Then a double-tap on the back of your phone sends
                whatever you just copied.
              </li>
            </ol>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Using it</h2>
            <p style={{ margin: 0, fontSize: "0.92rem" }}>
              In Messages, press and hold the client&apos;s text → <strong>Copy</strong> → tap the Send to Perfect
              Pours icon (or double-tap the back of your phone). It shows up on your dashboard under
              <strong> Texts to handle</strong>. The app guesses whether it&apos;s a booking request or something to
              send, pulls out any date, and matches the client if their name or number is in the text. Otherwise
              just pick who it&apos;s from.
            </p>
          </div>

          <form action={resetInboxToken}>
            <button type="submit" className="button" style={{ background: "none", color: "inherit", border: "1px solid var(--color-border)" }}>
              Reset secret key
            </button>
            <span style={{ marginLeft: "0.6rem", fontSize: "0.82rem", color: "var(--color-muted)" }}>
              Only if it got shared by accident. You&apos;ll need to paste the new key into the Shortcut.
            </span>
          </form>
        </>
      )}
    </div>
  );
}
