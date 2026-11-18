import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventTabs } from "./EventTabs";
import { nextStepFor } from "./next-step";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name, client_id, clients(first_name, last_name)")
    .eq("id", params.id)
    .single();

  if (!event) notFound();

  const client = Array.isArray(event.clients) ? event.clients[0] : event.clients;
  const base = `/admin/events/${params.id}`;
  const step = await nextStepFor(supabase, params.id, base);

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 720 }}>
      <div>
        <a href="/admin/calendar" className="muted small" style={{ textDecoration: "none" }}>
          ← Calendar
        </a>
        <h1 style={{ margin: "0.5rem 0 0" }}>{event.name}</h1>
        {client && (
          <p style={{ margin: 0, color: "var(--color-muted)" }}>
            <a href={`/admin/clients/${event.client_id}`}>
              {client.first_name} {client.last_name}
            </a>
          </p>
        )}
      </div>

      {step && (
        <div className={`next-step${step.href ? "" : " all-set"}`}>
          <div>
            <div className="muted small" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Next step
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: "0.15rem" }}>{step.title}</div>
            {step.detail && <div className="muted small" style={{ marginTop: "0.15rem" }}>{step.detail}</div>}
          </div>
          {step.href && step.button && (
            <a href={step.href} className="button">
              {step.button}
            </a>
          )}
        </div>
      )}

      <EventTabs base={base} />

      {children}
    </div>
  );
}
