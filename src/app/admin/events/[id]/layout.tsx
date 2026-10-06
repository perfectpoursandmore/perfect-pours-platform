import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventTabs } from "./EventTabs";

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

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 720 }}>
      <div>
        <a href="/admin/events" className="muted small" style={{ textDecoration: "none" }}>
          ← All events
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

      <EventTabs base={base} />

      {children}
    </div>
  );
}
