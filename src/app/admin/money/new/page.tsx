import { createClient } from "@/lib/supabase/server";
import { expensesReady } from "@/lib/money";
import { ReceiptForm, type PickableEvent } from "../ReceiptForm";
import { ExpensesSetupBox } from "../SetupBox";

function isoDaysFromToday(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export default async function NewReceiptPage({ searchParams }: { searchParams: { event?: string } }) {
  const supabase = createClient();
  const today = isoDaysFromToday(0);

  const [ready, { data: nearby }] = await Promise.all([
    expensesReady(supabase),
    supabase
      .from("events")
      .select("id, name, event_date")
      .neq("status", "cancelled")
      .gte("event_date", isoDaysFromToday(-90))
      .lte("event_date", isoDaysFromToday(90))
      .order("event_date"),
  ]);

  const events = (nearby ?? []) as PickableEvent[];
  const preselect = searchParams.event;
  if (preselect && !events.some((e) => e.id === preselect)) {
    const { data: one } = await supabase.from("events").select("id, name, event_date").eq("id", preselect).single();
    if (one) events.unshift(one as PickableEvent);
  }

  return (
    <div style={{ display: "grid", gap: "1.25rem", maxWidth: 560 }}>
      <div>
        <a href={preselect ? `/admin/events/${preselect}/money` : "/admin/money"} className="muted small" style={{ textDecoration: "none" }}>
          ← Back
        </a>
        <h1 style={{ margin: "0.5rem 0 0" }}>Add a receipt</h1>
        <p className="muted" style={{ margin: "0.2rem 0 0" }}>Just the total. No itemizing.</p>
      </div>
      {!ready && <ExpensesSetupBox />}
      <ReceiptForm events={events} preselectEventId={preselect} today={today} />
    </div>
  );
}
