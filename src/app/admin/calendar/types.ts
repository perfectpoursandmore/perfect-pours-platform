// Shared between the calendar page (server) and the client-side chip/quick
// view components -- kept separate from page.tsx so client components can
// import the type without pulling in server-only code.

export type CalendarEvent = {
  id: string;
  name: string;
  event_type: string;
  event_date: string;
  venue_name: string | null;
  city: string | null;
  status: string;
  clients: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};

export function clientName(event: CalendarEvent): string | null {
  const client = Array.isArray(event.clients) ? event.clients[0] : event.clients;
  return client ? `${client.first_name} ${client.last_name}` : null;
}
