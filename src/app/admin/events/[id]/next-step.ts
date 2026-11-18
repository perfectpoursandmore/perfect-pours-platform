import type { SupabaseClient } from "@supabase/supabase-js";

export type NextStep = { title: string; detail?: string; button?: string; href?: string };

/**
 * Works out the one thing to do next on an event, so the top of every event
 * page says it plainly with a single button, instead of Faith reading the
 * whole Booking page to figure out where things stand. Same signals the
 * Booking page's status pills use. Returns null for cancelled/past events.
 */
export async function nextStepFor(supabase: SupabaseClient, eventId: string, base: string): Promise<NextStep | null> {
  const [{ data: event }, { data: proposal }, { data: contract }, { data: fin }, { data: openRoles }] = await Promise.all([
    supabase.from("events").select("status, event_date").eq("id", eventId).single(),
    supabase.from("proposals").select("status, sent_at").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("contracts").select("status").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("event_financials").select("*").eq("event_id", eventId).maybeSingle(),
    supabase.from("event_staff").select("id").eq("event_id", eventId).eq("is_open", true),
  ]);

  if (!event || event.status === "cancelled" || event.status === "completed") return null;
  const past = event.event_date && event.event_date < new Date().toISOString().slice(0, 10);

  const pricingSent = Boolean(fin?.proposal_sent) || proposal?.status === "sent" || Boolean(proposal?.sent_at);
  const contractStatus: string = fin?.contract_status_manual ?? contract?.status ?? "unsent";
  const booking = `${base}/booking`;

  if (event.status !== "booked") {
    if (!pricingSent) return { title: "Send them pricing", button: "Send pricing", href: `${booking}#pricing` };
    return {
      title: "Waiting on their answer",
      detail: "Pricing is out. When they say yes, mark it Booked.",
      button: "Mark as booked",
      href: booking,
    };
  }

  if (contractStatus !== "signed") {
    if (contractStatus === "sent") {
      return { title: "Waiting for them to sign the contract", button: "See contract", href: `${booking}#contract` };
    }
    return { title: "Send the contract", button: "Send contract", href: `${booking}#contract` };
  }

  if (!fin?.deposit_paid) {
    if (!fin?.invoice_id) return { title: "Send the retainer invoice", button: "Create invoice", href: `${booking}#contract` };
    return { title: "Waiting on the retainer payment", button: "Check payment", href: `${booking}#contract` };
  }

  if (!past && (openRoles ?? []).length > 0) {
    const n = (openRoles ?? []).length;
    return { title: `Fill ${n} open staff spot${n === 1 ? "" : "s"}`, button: "Assign staff", href: `${base}/staff` };
  }

  if (!fin?.balance_paid) {
    return { title: "Collect the balance", detail: "Retainer is in. The rest is still owed.", button: "See invoice", href: `${booking}#contract` };
  }

  return { title: "All set ✓", detail: "Booked, signed and paid." };
}
