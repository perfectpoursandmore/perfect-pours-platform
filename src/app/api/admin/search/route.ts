import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { formatDate } from "@/lib/labels";
import type { SearchResult } from "@/lib/search-types";

// Escapes the characters PostgREST's ilike pattern (and the .or() filter
// string itself) treat specially, so a search for e.g. "O'Brien" or
// "50%" can't break the query or match more than intended.
function toIlikePattern(term: string): string {
  const escaped = term.replace(/[%_]/g, (c) => `\\${c}`).replace(/[,()]/g, " ");
  return `%${escaped}%`;
}

// Admin-only global search across clients, leads, and events -- the one
// gap called out in the original spec: finding a record by a half-remembered
// name/email/venue instead of knowing which section to open first.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const term = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (term.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = createClient();
  const pattern = toIlikePattern(term);

  const [{ data: clients }, { data: leads }, { data: events }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, first_name, last_name, email, phone")
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .order("last_name")
      .limit(8),
    supabase
      .from("leads")
      .select("id, first_name, last_name, email, phone, event_type, status")
      .or(
        `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},event_type.ilike.${pattern}`
      )
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("events")
      .select("id, name, event_type, event_date, venue_name, status, clients(first_name, last_name)")
      .or(`name.ilike.${pattern},event_type.ilike.${pattern},venue_name.ilike.${pattern},address_line.ilike.${pattern},city.ilike.${pattern}`)
      .order("event_date", { ascending: false })
      .limit(8),
  ]);

  // A search for a client's name should also surface the events booked
  // under that client, even when the event's own name/venue doesn't
  // mention them (e.g. searching "Marcus" should find "Reyes Birthday").
  const matchedClientIds = (clients ?? []).map((c) => c.id);
  let eventsByClient: typeof events = [];
  if (matchedClientIds.length > 0) {
    const { data } = await supabase
      .from("events")
      .select("id, name, event_type, event_date, venue_name, status, clients(first_name, last_name)")
      .in("client_id", matchedClientIds)
      .order("event_date", { ascending: false })
      .limit(8);
    eventsByClient = data ?? [];
  }

  const results: SearchResult[] = [];

  for (const c of clients ?? []) {
    results.push({
      type: "client",
      id: c.id,
      title: `${c.first_name} ${c.last_name}`,
      subtitle: [c.email, c.phone].filter(Boolean).join(" · ") || "Client",
      href: `/admin/clients/${c.id}`,
    });
  }

  for (const l of leads ?? []) {
    results.push({
      type: "lead",
      id: l.id,
      title: `${l.first_name} ${l.last_name}`,
      subtitle: [l.event_type, l.email].filter(Boolean).join(" · ") || "Lead",
      href: `/admin/leads/${l.id}`,
    });
  }

  const seenEventIds = new Set<string>();
  for (const e of [...(events ?? []), ...eventsByClient]) {
    if (seenEventIds.has(e.id)) continue;
    seenEventIds.add(e.id);
    const client = Array.isArray(e.clients) ? e.clients[0] : e.clients;
    const clientName = client ? `${client.first_name} ${client.last_name}` : null;
    results.push({
      type: "event",
      id: e.id,
      title: e.name,
      subtitle: [clientName, e.venue_name, formatDate(e.event_date)].filter(Boolean).join(" · "),
      href: `/admin/events/${e.id}`,
    });
  }

  return NextResponse.json({ results: results.slice(0, 20) });
}
