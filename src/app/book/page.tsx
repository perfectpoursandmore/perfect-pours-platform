import { BookingFlow } from "@/components/BookingFlow";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVENT_TYPE_LABELS, formatDate } from "@/lib/labels";

export const metadata = { title: "Schedule a Call — Perfect Pours & More" };
export const dynamic = "force-dynamic";

export default async function BookPage({ searchParams }: { searchParams: { event?: string } }) {
  // Coming from their pricing page? Then we already have everything -- they
  // just pick a time.
  let known: { token: string; firstName: string; summary: string } | null = null;
  if (searchParams.event) {
    const supabase = createAdminClient();
    const { data: event } = await supabase
      .from("events")
      .select("event_type, event_date, documents_token, clients(first_name)")
      .eq("documents_token", searchParams.event)
      .maybeSingle();
    if (event) {
      const client = Array.isArray(event.clients) ? event.clients[0] : event.clients;
      const type = (EVENT_TYPE_LABELS[event.event_type] ?? "event").toLowerCase();
      known = {
        token: event.documents_token,
        firstName: client?.first_name ?? "",
        summary: `your ${type}${event.event_date ? ` on ${formatDate(event.event_date)}` : ""}`,
      };
    }
  }

  return (
    <main style={{ padding: "2rem 1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>{known ? "Schedule your planning call" : "Schedule a call"}</h1>
      <p style={{ color: "var(--color-muted)", maxWidth: 560 }}>
        {known
          ? `Pick a day and time that works. We already have the details for ${known.summary}, so that's all we need.`
          : "Pick a day and time that works for a quick call to go over your event. After selecting a time, we'll ask for a few details so we can come prepared."}
      </p>
      <BookingFlow known={known} />
    </main>
  );
}
