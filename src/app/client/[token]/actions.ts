"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertEventFinancials, maybeMarkEventBooked } from "@/lib/event-financials";
import { ADD_ONS } from "@/lib/price-list";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { formatDate } from "@/lib/labels";

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

/**
 * Public, token-only (same trust rules as signContract above). The client
 * taps the add-ons they'd like priced; Faith gets an email and the request
 * shows on the event's Booking tab and her dashboard.
 */
export async function requestAddons(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/");

  const allowed = new Set(ADD_ONS.map((a) => a.value));
  const picked = Array.from(new Set(formData.getAll("addons").map(String).filter((v) => allowed.has(v))));
  const note = String(formData.get("addonsNote") ?? "").trim().slice(0, 2000) || null;

  if (picked.length === 0) {
    redirect(`/client/${token}?error=${encodeURIComponent("Check at least one add-on you'd like pricing for.")}#addons`);
  }

  const supabase = createAdminClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name, event_date")
    .eq("documents_token", token)
    .single();
  if (!event) redirect("/");

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!proposal) redirect(`/client/${token}`);

  await supabase
    .from("proposals")
    .update({
      requested_addons: picked,
      addons_note: note,
      addons_requested_at: new Date().toISOString(),
      addons_handled_at: null,
    })
    .eq("id", proposal!.id);

  if (isEmailConfigured()) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://perfect-pours-platform.vercel.app";
      const labels = picked.map((v) => ADD_ONS.find((a) => a.value === v)?.label ?? v);
      await sendEmail({
        to: process.env.ADMIN_NOTIFICATION_EMAIL || "faith@perfectpoursandmore.com",
        subject: `Add-on request: ${event.name}`,
        html: `<p>${esc(event.name)} (${formatDate(event.event_date)}) would like pricing for:</p>
<ul>${labels.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
${note ? `<p><strong>Their note:</strong> ${esc(note)}</p>` : ""}
<p><a href="${appUrl}/admin/events/${event.id}/booking">Open the event</a></p>`,
      });
    } catch (err) {
      console.error("requestAddons: notification failed:", err);
    }
  }

  revalidatePath(`/client/${token}`);
  redirect(`/client/${token}?addons=requested#addons`);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
