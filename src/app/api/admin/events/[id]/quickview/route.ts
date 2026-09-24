import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";

// Backs the calendar's quick-view popover: enough about one event to show
// Faith what it is and who's on it, without sending her to the full event
// page for a two-second look. Admin-only, same as every other event route.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const supabase = createClient();

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, name, event_type, event_date, venue_name, address_line, city, state, guest_count, status, staff_arrival_time, guest_arrival_time, staff_end_time, client_id, clients(first_name, last_name)"
    )
    .eq("id", params.id)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const { data: assignments } = await supabase
    .from("event_staff")
    .select("id, role, is_open, staff_id, staff:staff_id(first_name, last_name)")
    .eq("event_id", params.id)
    .order("role");

  const { data: activeStaff } = await supabase
    .from("staff")
    .select("id, first_name, last_name")
    .eq("active", true)
    .order("first_name");

  const client = Array.isArray(event.clients) ? event.clients[0] : event.clients;

  return NextResponse.json({
    event: { ...event, clients: undefined, client },
    assignments: assignments ?? [],
    activeStaff: activeStaff ?? [],
  });
}
