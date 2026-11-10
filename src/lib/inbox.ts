import type { SupabaseClient } from "@supabase/supabase-js";
import { matchClient, sortText } from "./inbox-sort";

/**
 * Files one forwarded text into the inbox: guesses what it's asking for,
 * any date in it, and which client sent it. Shared by the iPhone Shortcut's
 * endpoint (/api/inbox) and the paste box on the dashboard.
 */
export async function addInboxItem(supabase: SupabaseClient, body: string, from = "", note = "") {
  const text = body.trim().slice(0, 5000);
  if (!text) return { error: "Nothing to add." };

  const { kind, guessedDate } = sortText(text);
  const { data: clients } = await supabase.from("clients").select("id, first_name, last_name, phone");
  const clientId = matchClient(text, from, clients ?? []);

  const row: Record<string, unknown> = {
    body: from.trim() ? `${from.trim()}: ${text}` : text,
    kind,
    guessed_date: guessedDate,
    client_id: clientId,
  };
  const trimmedNote = note.trim().slice(0, 500);
  if (trimmedNote) row.note = trimmedNote;

  const { error } = await supabase.from("inbox_items").insert(row);
  return { error: error?.message ?? null };
}
