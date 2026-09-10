import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
        <a href="/admin/events" style={{ fontSize: "0.9rem" }}>
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

      <nav style={{ display: "flex", gap: "1.25rem", borderBottom: "1px solid var(--color-border)" }}>
        <a href={base} style={{ padding: "0.5rem 0" }}>
          Overview
        </a>
        <a href={`${base}/notes`} style={{ padding: "0.5rem 0" }}>
          Notes
        </a>
        <a href={`${base}/staff`} style={{ padding: "0.5rem 0" }}>
          Staff
        </a>
        <a href={`${base}/booking`} style={{ padding: "0.5rem 0" }}>
          Booking
        </a>
      </nav>

      {children}
    </div>
  );
}
