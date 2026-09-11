// Server-only. Sends transactional email via Resend's REST API directly
// over fetch — no SDK dependency, same approach as google-calendar.ts and
// quickbooks.ts. Every send (success or failure) is meant to be logged to
// email_log by the caller, so there's always a record of what went out.

import { renderContractBody } from "@/lib/contracts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("RESEND_FROM_EMAIL");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

// Deliberately `any`, not a structural shape: the real Supabase client's
// generics are deep enough that TypeScript's structural check against a
// hand-written interface here blows past its recursion limit ("Type
// instantiation is excessively deep and possibly infinite") once the real
// @supabase/supabase-js types are installed. Every value pulled off this
// client is already cast to an explicit local type before use below, so
// nothing here relies on the compiler checking the client's shape.
type SupabaseLike = any;

/**
 * Renders an email_templates row's {{variable}} placeholders, sends it, and
 * logs the attempt (sent or failed) to email_log either way — so a failed
 * send is never silent, and there's always a record of what was sent to
 * whom. Used from every place in the app that emails a client, so history
 * always lands in one table.
 */
export async function sendTemplatedEmail(
  supabase: SupabaseLike,
  params: {
    templateId: string;
    to: string;
    vars: Record<string, string>;
    clientId?: string | null;
    eventId?: string | null;
    sentBy?: string | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  // Same {{var}} substitution used for contracts (renderContractBody is
  // generic despite the name) — leaves unknown placeholders visible rather
  // than silently blanking them.
  const render = (template: string) => renderContractBody(template, params.vars);

  const { data: template } = await supabase
    .from("email_templates")
    .select("subject, body")
    .eq("id", params.templateId)
    .single();

  const templateRow = template as { subject: string; body: string } | null;
  if (!templateRow) {
    return { ok: false, error: "Email template not found." };
  }

  const subject = render(templateRow.subject);
  const html = render(templateRow.body);

  try {
    const sent = await sendEmail({ to: params.to, subject, html });
    await supabase.from("email_log").insert({
      client_id: params.clientId ?? null,
      event_id: params.eventId ?? null,
      template_id: params.templateId,
      to_email: params.to,
      subject,
      body: html,
      status: "sent",
      provider_message_id: sent.id,
      sent_by: params.sentBy ?? null,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error sending email.";
    await supabase.from("email_log").insert({
      client_id: params.clientId ?? null,
      event_id: params.eventId ?? null,
      template_id: params.templateId,
      to_email: params.to,
      subject,
      body: html,
      status: "failed",
      error: message,
      sent_by: params.sentBy ?? null,
    });
    return { ok: false, error: message };
  }
}
