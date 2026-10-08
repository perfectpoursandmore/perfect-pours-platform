// A client's home address -- most clients host at home, so new events start
// with it filled in. Everything here uses select("*") and ignores errors, so
// it quietly does nothing until the 0023 migration has been run.

type SupabaseLike = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Address = { address_line: string | null; city: string | null; state: string | null; zip: string | null };

export function hasAddress(a: Partial<Address> | null | undefined): boolean {
  return Boolean(a?.address_line && String(a.address_line).trim());
}

/** The client's saved home address, or null if there isn't one. */
export async function getClientAddress(supabase: SupabaseLike, clientId: string | null | undefined): Promise<Address | null> {
  if (!clientId) return null;
  const { data } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
  if (!data || !hasAddress(data)) return null;
  return { address_line: data.address_line, city: data.city ?? null, state: data.state ?? null, zip: data.zip ?? null };
}

/**
 * Learns a client's home address from an event: if the client has none saved
 * yet and the event isn't at a named venue, the event's address is saved as
 * their home address.
 */
export async function rememberClientAddress(
  supabase: SupabaseLike,
  clientId: string | null | undefined,
  event: Partial<Address> & { venue_name?: string | null }
): Promise<void> {
  if (!clientId || !hasAddress(event) || (event.venue_name && String(event.venue_name).trim())) return;
  const existing = await getClientAddress(supabase, clientId);
  if (existing) return;
  await supabase
    .from("clients")
    .update({ address_line: event.address_line, city: event.city ?? null, state: event.state ?? null, zip: event.zip ?? null })
    .eq("id", clientId);
}
