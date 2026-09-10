"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertEventFinancials, maybeMarkEventBooked } from "@/lib/event-financials";

/**
 * Public — reached only via the unguessable per-event token, never an
 * authenticated session. The token is the ONLY client-supplied value that's
 * trusted; the event/contract it refers to are always looked up server-side
 * from it, never from a hidden event id a visitor's browser could tamper with.
 */
export async function signContract(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const signedName = String(formData.get("signedName") ?? "").trim();
  const signatureData = String(formData.get("signatureData") ?? "");
  const agreed = formData.get("agree") === "on";

  if (!token) redirect("/");

  if (!signedName || !signatureData || !agreed) {
    redirect(`/client/${token}?error=Please sign, type your name, and confirm you agree.`);
  }

  const supabase = createAdminClient();

  const { data: event } = await supabase.from("events").select("id").eq("documents_token", token).single();
  if (!event) redirect("/");

  const { data: contract } = await supabase
    .from("contracts")
    .select("id, status")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!contract || contract.status !== "sent") {
    redirect(`/client/${token}?error=This contract isn't ready to sign yet.`);
  }

  await supabase
    .from("contracts")
    .update({
      status: "signed",
      signed_name: signedName,
      signature_data: signatureData,
      signed_at: new Date().toISOString(),
    })
    .eq("id", contract!.id);

  await upsertEventFinancials(supabase, event.id, { contract_signed: true });
  await maybeMarkEventBooked(supabase, event.id);

  revalidatePath(`/client/${token}`);
}
