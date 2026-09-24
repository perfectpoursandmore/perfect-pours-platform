// Shared by admin server actions (proposal sent, deposit marked received) and
// the public contract-signing route (uses the service-role client instead,
// since the person signing hasn't logged in). Both need to update the same
// booking-status cache without clobbering fields the other one owns.

// Deliberately `any`, not a structural shape: the real Supabase client's
// generics are deep enough that TypeScript's structural check against a
// hand-written interface here blows past its recursion limit ("Type
// instantiation is excessively deep and possibly infinite") once the real
// @supabase/supabase-js types are installed. Every value pulled off this
// client is already cast to an explicit local type before use below, so
// nothing here relies on the compiler checking the client's shape.
type SupabaseLike = any;

export async function upsertEventFinancials(
  supabase: SupabaseLike,
  eventId: string,
  patch: Partial<{
    total_amount: number;
    deposit_amount: number;
    balance_amount: number;
    proposal_sent: boolean;
    contract_signed: boolean;
    deposit_paid: boolean;
    balance_paid: boolean;
    deposit_invoice_id: string | null;
    deposit_invoice_status: string | null;
    deposit_invoice_sent_at: string | null;
    balance_invoice_id: string | null;
    balance_invoice_status: string | null;
    balance_invoice_sent_at: string | null;
    invoice_id: string | null;
    invoice_status: string | null;
    invoice_sent_at: string | null;
    qbo_sync_error: string | null;
  }>
) {
  await supabase.from("event_financials").upsert({ event_id: eventId, ...patch }, { onConflict: "event_id" });
}

/** Booked = contract signed AND deposit received. Call after either changes. */
export async function maybeMarkEventBooked(supabase: SupabaseLike, eventId: string) {
  const { data } = await supabase
    .from("event_financials")
    .select("contract_signed, deposit_paid")
    .eq("event_id", eventId)
    .single();

  const row = data as { contract_signed?: boolean; deposit_paid?: boolean } | null;

  if (row?.contract_signed && row?.deposit_paid) {
    await supabase.from("events").update({ status: "booked" }).eq("id", eventId);
  }
}
