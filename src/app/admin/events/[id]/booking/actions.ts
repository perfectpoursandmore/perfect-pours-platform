"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { effectiveOption, linesForOption, proposalOptions } from "@/lib/proposals";
import { recomputeProposalTotals } from "@/lib/proposal-totals";
import { renderContractBody } from "@/lib/contracts";
import { EVENT_TYPE_LABELS, formatMoney, formatDate } from "@/lib/labels";
import { upsertEventFinancials, maybeMarkEventBooked } from "@/lib/event-financials";
import {
  getValidConnection,
  findOrCreateCustomer,
  createInvoice,
  getInvoiceStatus,
} from "@/lib/quickbooks";
import { isEmailConfigured, sendEmail, sendTemplatedEmail } from "@/lib/email";
import { getPriceList } from "@/lib/price-list";
import { buildDraftProposal } from "@/lib/auto-proposal";
import { DISHWARE, EXTRA_HELP, SERVICES, SERVICE_STYLES, cleanValue, cleanValues } from "@/lib/event-details";
import { zonedTimeToIso } from "@/lib/calendar-dates";
import { syncEventToGoogle } from "@/lib/google-event-sync";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

export async function createProposal(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));

  await supabase.from("proposals").insert({ event_id: eventId });

  revalidatePath(`/admin/events/${eventId}/booking`);
}

export async function addProposalItem(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const proposalId = String(formData.get("proposalId"));
  const eventId = String(formData.get("eventId"));
  const catalogItemId = String(formData.get("catalogItemId") ?? "") || null;
  const description = String(formData.get("description") ?? "").trim();
  const quantity = Number(formData.get("quantity") ?? 1);
  const unitPrice = Number(formData.get("unitPrice") ?? 0);
  const pricingType = String(formData.get("pricingType") ?? "flat");
  const optionLabel = String(formData.get("optionLabel") ?? "").trim() || null;

  if (!description) return;

  const { count } = await supabase
    .from("proposal_items")
    .select("id", { count: "exact", head: true })
    .eq("proposal_id", proposalId);

  await supabase.from("proposal_items").insert({
    proposal_id: proposalId,
    catalog_item_id: catalogItemId,
    description,
    quantity,
    unit_price: unitPrice,
    pricing_type: pricingType,
    line_total: Math.round(quantity * unitPrice * 100) / 100,
    sort_order: count ?? 0,
    ...(optionLabel ? { option_label: optionLabel } : {}),
  });

  await recomputeAndSaveProposalTotals(supabase, proposalId);
  revalidatePath(`/admin/events/${eventId}/booking`);
}

export async function removeProposalItem(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const proposalId = String(formData.get("proposalId"));
  const eventId = String(formData.get("eventId"));

  await supabase.from("proposal_items").delete().eq("id", id);
  await recomputeAndSaveProposalTotals(supabase, proposalId);

  revalidatePath(`/admin/events/${eventId}/booking`);
}

export async function updateProposalAdjustments(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const proposalId = String(formData.get("proposalId"));
  const eventId = String(formData.get("eventId"));

  await supabase
    .from("proposals")
    .update({
      discount_amount: Number(formData.get("discountAmount") ?? 0),
      fee_amount: Number(formData.get("feeAmount") ?? 0),
      gratuity_rate: Number(formData.get("gratuityRate") ?? 0),
      tax_rate: Number(formData.get("taxRate") ?? 0),
      deposit_amount: Number(formData.get("depositAmount") ?? 0),
    })
    .eq("id", proposalId);

  await recomputeAndSaveProposalTotals(supabase, proposalId);
  revalidatePath(`/admin/events/${eventId}/booking`);
}

async function recomputeAndSaveProposalTotals(
  supabase: ReturnType<typeof createClient>,
  proposalId: string
) {
  await recomputeProposalTotals(supabase, proposalId);
}

export async function generateContract(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const templateId = String(formData.get("templateId"));

  const [{ data: template }, { data: event }, { data: proposal }] = await Promise.all([
    supabase.from("contract_templates").select("body").eq("id", templateId).single(),
    supabase.from("events").select("*, clients(first_name, last_name)").eq("id", eventId).single(),
    supabase
      .from("proposals")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  if (!template || !event || !proposal) {
    redirect(`/admin/events/${eventId}/booking?error=Create a proposal before generating a contract.`);
  }

  const { data: allItems } = await supabase
    .from("proposal_items")
    .select("*")
    .eq("proposal_id", proposal!.id)
    .order("sort_order");
  const options = proposalOptions(allItems ?? []);
  if (options.length > 1 && !(proposal!.chosen_option && options.includes(proposal!.chosen_option))) {
    redirect(
      `/admin/events/${eventId}/booking?error=${encodeURIComponent(
        "The proposal has two options. Pick the one the client chose (in the proposal section) before generating the contract."
      )}`
    );
  }
  const items = linesForOption(allItems ?? [], effectiveOption(allItems ?? [], proposal!.chosen_option));

  const client = Array.isArray(event!.clients) ? event!.clients[0] : event!.clients;
  // Price leads each entry (rather than trailing after the description) so a
  // multi-line catalog description — a bar package's feature list, say —
  // doesn't push its price down and away from the item it belongs to.
  const servicesList =
    (items ?? [])
      .map(
        (i) =>
          `${formatMoney(i.line_total)}${i.quantity > 1 ? ` (x${i.quantity})` : ""} — ${i.description}`
      )
      .join("\n\n") || "(no line items yet)";

  const vars = {
    client_name: client ? `${client.first_name} ${client.last_name}` : "",
    today_date: formatDate(new Date().toISOString().slice(0, 10)),
    event_date: formatDate(event!.event_date),
    event_location: [event!.venue_name, event!.address_line, event!.city, event!.state]
      .filter(Boolean)
      .join(", ") || "TBD",
    services_list: servicesList,
    total_amount: formatMoney(proposal!.total_amount),
    deposit_amount: formatMoney(proposal!.deposit_amount),
    balance_amount: formatMoney(Number(proposal!.total_amount) - Number(proposal!.deposit_amount)),
  };

  const renderedBody = renderContractBody(template!.body, vars);

  const { data: existing } = await supabase
    .from("contracts")
    .select("id, status, version")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existing && existing.status === "unsent") {
    await supabase
      .from("contracts")
      .update({ template_id: templateId, rendered_body: renderedBody, version: existing.version + 1 })
      .eq("id", existing.id);
  } else if (!existing) {
    await supabase.from("contracts").insert({
      event_id: eventId,
      template_id: templateId,
      rendered_body: renderedBody,
    });
  }
  // If a contract was already sent or signed, regenerating is a no-op here —
  // that document is the one the client already reviewed/signed.

  revalidatePath(`/admin/events/${eventId}/booking`);
}

export async function sendBookingDocuments(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));

  const { data: proposal } = await supabase
    .from("proposals")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: contract } = await supabase
    .from("contracts")
    .select("id, status")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!proposal || !contract) {
    redirect(`/admin/events/${eventId}/booking?error=Create both a proposal and a contract first.`);
  }

  await supabase
    .from("proposals")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", proposal!.id);

  if (contract!.status === "unsent") {
    await supabase
      .from("contracts")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", contract!.id);
  }

  await upsertEventFinancials(supabase, eventId, {
    total_amount: proposal!.total_amount,
    deposit_amount: proposal!.deposit_amount,
    balance_amount: Number(proposal!.total_amount) - Number(proposal!.deposit_amount),
    proposal_sent: true,
  });

  // Best-effort: if an email template was chosen and sending is configured,
  // actually email the secure link instead of leaving it copy/paste-only.
  // Never blocks booking on a send failure — the link on this page still
  // works either way, and sendTemplatedEmail logs the attempt regardless.
  const emailTemplateId = String(formData.get("emailTemplateId") ?? "");
  if (emailTemplateId && isEmailConfigured()) {
    const { data: event } = await supabase
      .from("events")
      .select("event_date, documents_token, clients(id, first_name, last_name, email)")
      .eq("id", eventId)
      .single();
    const client = event ? (Array.isArray(event.clients) ? event.clients[0] : event.clients) : null;

    if (client?.email && event) {
      const user = await getCurrentUser();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await sendTemplatedEmail(supabase, {
        templateId: emailTemplateId,
        to: client.email,
        clientId: client.id,
        eventId,
        sentBy: user?.id ?? null,
        vars: {
          client_name: `${client.first_name} ${client.last_name}`,
          event_date: formatDate(event.event_date),
          secure_link: `${appUrl}/client/${event.documents_token}`,
        },
      });
    }
  }

  // Optional: when Faith checks "also create the invoice", fire that off
  // too so the contract goes out and the invoice is sitting ready in
  // QuickBooks in one click. This only CREATES the invoice -- Faith still
  // reviews and sends it herself from inside QuickBooks, same as if she'd
  // clicked "Create invoice" on the Invoice card above. Silently skipped
  // if QuickBooks isn't connected or an invoice already exists.
  if (String(formData.get("alsoCreateInvoice") ?? "") === "on") {
    const conn = await getValidConnection();
    if (conn) {
      const { data: existingFinancials } = await supabase
        .from("event_financials")
        .select("invoice_id")
        .eq("event_id", eventId)
        .single();
      if (!existingFinancials?.invoice_id) {
        await createDraftInvoiceForEvent(supabase, eventId, conn);
      }
    }
  }

  revalidatePath(`/admin/events/${eventId}/booking`);
}

export async function markDepositReceived(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));

  await upsertEventFinancials(supabase, eventId, { deposit_paid: true });
  await maybeMarkEventBooked(supabase, eventId);

  revalidatePath(`/admin/events/${eventId}/booking`);
}

/** Manual bookkeeping bridge for a balance paid by cash/check/Zelle/etc. */
export async function markBalanceReceived(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));

  await upsertEventFinancials(supabase, eventId, { balance_paid: true });

  revalidatePath(`/admin/events/${eventId}/booking`);
}

// ---------------------------------------------------------------------
// QuickBooks-driven invoicing. These create/send a REAL QuickBooks invoice
// and, if Faith's QuickBooks company has QuickBooks Payments turned on,
// Intuit's own email includes a secure "Pay Now" link — this app never
// touches a card number. "Refresh" re-reads the invoice's balance from
// QuickBooks to detect payment, since local dev can't receive QuickBooks'
// webhook (that needs a public HTTPS URL — see README for Phase 6+ notes).
// ---------------------------------------------------------------------

async function loadEventAndClientForInvoicing(
  supabase: ReturnType<typeof createClient>,
  eventId: string
) {
  const { data: event } = await supabase
    .from("events")
    .select("id, name, client_id, clients(id, first_name, last_name, email, phone, qbo_customer_id)")
    .eq("id", eventId)
    .single();

  if (!event) return null;
  const client = Array.isArray(event.clients) ? event.clients[0] : event.clients;
  return { event, client };
}

/**
 * The actual QuickBooks work behind "create & send invoice" -- pulled out
 * so both the standalone Invoice-card button and the combined "send
 * contract + invoice" checkbox on Send to client can trigger it. One
 * invoice for the event's full total, with a memo asking for the retainer
 * amount up front -- QuickBooks Payments lets the client type in whatever
 * amount they want to pay at checkout, rather than this app having to
 * split it into a separate deposit invoice. Assumes the caller already
 * confirmed QuickBooks is connected (conn is non-null); no-ops quietly if
 * there's no client or proposal to invoice, which in practice shouldn't
 * happen since every event now gets a proposal row automatically.
 */
/**
 * Creates a QuickBooks invoice for the event's full total (with a memo
 * asking for the retainer amount up front) and saves its id, linking it to
 * this event -- but does NOT send it. Faith reviews, edits, and sends the
 * invoice herself from inside QuickBooks (her own email template lives
 * there), so this app never emails an invoice on its own. "Refresh payment
 * status" below is how the app finds out later that she sent it and the
 * client paid.
 */
async function createDraftInvoiceForEvent(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  conn: NonNullable<Awaited<ReturnType<typeof getValidConnection>>>
) {
  const loaded = await loadEventAndClientForInvoicing(supabase, eventId);
  const { data: proposal } = await supabase
    .from("proposals")
    .select("total_amount, deposit_amount")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!loaded?.client || !proposal) return;

  try {
    let qboCustomerId = loaded.client.qbo_customer_id as string | null;
    if (!qboCustomerId) {
      qboCustomerId = await findOrCreateCustomer(conn, {
        firstName: loaded.client.first_name,
        lastName: loaded.client.last_name,
        email: loaded.client.email,
        phone: loaded.client.phone,
      });
      await supabase.from("clients").update({ qbo_customer_id: qboCustomerId }).eq("id", loaded.client.id);
    }

    const depositAmount = Number(proposal.deposit_amount);
    const memo =
      depositAmount > 0
        ? `A retainer of ${formatMoney(depositAmount)} is due now to confirm this booking, with the remaining balance due before the event. Enter the amount you'd like to pay now at checkout.`
        : undefined;

    const invoice = await createInvoice(conn, {
      customerId: qboCustomerId,
      description: `Invoice — ${loaded.event.name}`,
      amount: Number(proposal.total_amount),
      memo,
    });

    await upsertEventFinancials(supabase, eventId, {
      invoice_id: invoice.id,
      invoice_status: "draft",
      qbo_sync_error: null,
    });
  } catch (err) {
    await upsertEventFinancials(supabase, eventId, {
      qbo_sync_error: err instanceof Error ? err.message : "Something went wrong creating the invoice.",
    });
  }
}

export async function createInvoiceDraft(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));

  const conn = await getValidConnection();
  if (!conn) {
    redirect(`/admin/events/${eventId}/booking?error=Connect QuickBooks in Settings first.`);
  }

  await createDraftInvoiceForEvent(supabase, eventId, conn!);

  revalidatePath(`/admin/events/${eventId}/booking`);
}

/**
 * Re-reads the invoice's balance from QuickBooks to detect payment -- local
 * dev can't receive QuickBooks' webhook (that needs a public HTTPS URL).
 * Since it's one invoice for the full total and QuickBooks Payments allows
 * a partial payment, "retainer received" is inferred from how much has
 * come in rather than from a separate invoice: once the amount paid so far
 * reaches the deposit amount, the retainer counts as received (which is
 * what flips an event to "booked" once the contract's signed too); once
 * the balance hits zero, it's paid in full.
 */
export async function refreshInvoiceStatus(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));

  const conn = await getValidConnection();
  if (!conn) redirect(`/admin/events/${eventId}/booking?error=Connect QuickBooks in Settings first.`);

  try {
    const [{ data: financials }, { data: proposal }] = await Promise.all([
      supabase.from("event_financials").select("invoice_id").eq("event_id", eventId).single(),
      supabase
        .from("proposals")
        .select("deposit_amount")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    ]);

    if (financials?.invoice_id) {
      const status = await getInvoiceStatus(conn!, financials.invoice_id);
      const paidSoFar = status.totalAmount - status.balance;
      const depositAmount = Number(proposal?.deposit_amount ?? 0);

      await upsertEventFinancials(supabase, eventId, {
        invoice_status: status.paid ? "paid" : "sent",
        ...(depositAmount > 0 && paidSoFar >= depositAmount ? { deposit_paid: true } : {}),
        ...(status.paid ? { balance_paid: true } : {}),
        qbo_sync_error: null,
      });
      await maybeMarkEventBooked(supabase, eventId);
    }
  } catch (err) {
    await upsertEventFinancials(supabase, eventId, {
      qbo_sync_error: err instanceof Error ? err.message : "Couldn't check the invoice status.",
    });
  }

  revalidatePath(`/admin/events/${eventId}/booking`);
}

// ---------------------------------------------------------------------
// Price-first proposals (pricing goes out before any call).
// ---------------------------------------------------------------------

/**
 * Fills the proposal from the event's details using the price list
 * (package tier by guest count, hourly staff, gratuity). Replaces whatever
 * lines are there -- only allowed before pricing has gone out.
 */
export async function autoBuildProposal(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const proposalId = String(formData.get("proposalId"));
  await buildProposalFromDetails(supabase, eventId, proposalId);
  revalidatePath(`/admin/events/${eventId}/booking`);
}

async function buildProposalFromDetails(supabase: ReturnType<typeof createClient>, eventId: string, proposalId: string) {
  const back = `/admin/events/${eventId}/booking`;
  const [{ data: event }, { data: proposal }, { data: contract }] = await Promise.all([
    supabase
      .from("events")
      .select("event_type, guest_count, services_interested, service_style, dishware, extra_help, staff_arrival_time, staff_end_time")
      .eq("id", eventId)
      .single(),
    supabase.from("proposals").select("id, status").eq("id", proposalId).single(),
    supabase.from("contracts").select("status").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (!event || !proposal) redirect(`${back}?error=Couldn't load this event.`);
  // Rebuilding after pricing went out is fine (their page just updates), but
  // not once a contract is out -- it lists the services they agreed to.
  if (contract && contract.status !== "unsent") {
    redirect(`${back}?error=${encodeURIComponent("The contract already went out, so edit the proposal lines by hand instead.")}`);
  }

  const draft = buildDraftProposal(event!, await getPriceList(supabase));
  if (draft.customQuote) {
    redirect(`${back}?error=${encodeURIComponent(`${draft.customQuote}: build this custom quote by hand.`)}`);
  }

  // Add the new lines first and only then remove the old ones, so a failed
  // save never leaves the proposal half-built.
  const { data: oldLines } = await supabase.from("proposal_items").select("id").eq("proposal_id", proposalId);
  if (draft.lines.length > 0) {
    const rows = draft.lines.map((l, i) => ({
      proposal_id: proposalId,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
      pricing_type: "flat",
      note: l.note,
      sort_order: i,
      ...(l.option ? { option_label: l.option } : {}),
    }));
    const { error } = await supabase.from("proposal_items").insert(rows);
    if (error) {
      console.error("buildProposalFromDetails:", error);
      redirect(
        `${back}?error=${encodeURIComponent(
          draft.lines.some((l) => l.option)
            ? "Couldn't save the two options: the database update for options hasn't been run yet. See the box at the top of this page."
            : `Couldn't save the proposal: ${error.message}`
        )}`
      );
    }
  }
  const oldIds = (oldLines ?? []).map((l: { id: string }) => l.id);
  if (oldIds.length > 0) await supabase.from("proposal_items").delete().in("id", oldIds);
  // A fresh proposal starts with no option picked.
  await supabase.from("proposals").update({ chosen_option: null, option_chosen_at: null }).eq("id", proposalId);

  await recomputeAndSaveProposalTotals(supabase, proposalId);
}

/**
 * The client's answers (services, food style, times...) edited right on the
 * Booking tab, so Faith can tweak them and rebuild the proposal in one go.
 */
export async function saveEventDetails(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const proposalId = String(formData.get("proposalId") ?? "");
  const back = `/admin/events/${eventId}/booking`;

  const { data: event } = await supabase.from("events").select("event_date").eq("id", eventId).single();
  if (!event) redirect(`${back}?error=Couldn't load this event.`);
  const date = event!.event_date as string;
  const guestRaw = String(formData.get("guestCount") ?? "").trim();

  await supabase
    .from("events")
    .update({
      guest_count: guestRaw ? Number(guestRaw) : null,
      staff_arrival_time: zonedTimeToIso(date, String(formData.get("staffArrivalTime") ?? "")),
      guest_arrival_time: zonedTimeToIso(date, String(formData.get("guestArrivalTime") ?? "")),
      staff_end_time: zonedTimeToIso(date, String(formData.get("staffEndTime") ?? "")),
      services_interested: cleanValues(SERVICES, formData.getAll("services")),
      service_style: cleanValue(SERVICE_STYLES, formData.get("serviceStyle")),
      dishware: cleanValue(DISHWARE, formData.get("dishware")),
      extra_help: cleanValues(EXTRA_HELP, formData.getAll("extraHelp")),
    })
    .eq("id", eventId);
  await syncEventToGoogle(eventId);

  if (formData.get("intent") === "build" && proposalId) {
    await buildProposalFromDetails(supabase, eventId, proposalId);
  }

  revalidatePath(back);
  revalidatePath(`/admin/events/${eventId}`);
  redirect(`${back}${formData.get("intent") === "build" ? "#proposal" : "?detailsSaved=1"}`);
}

/** Faith records which option the client went with (e.g. after a call). */
export async function setChosenOption(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const proposalId = String(formData.get("proposalId"));
  const option = String(formData.get("option") ?? "").trim() || null;

  await supabase
    .from("proposals")
    .update({ chosen_option: option, option_chosen_at: option ? new Date().toISOString() : null })
    .eq("id", proposalId);
  await recomputeAndSaveProposalTotals(supabase, proposalId);
  revalidatePath(`/admin/events/${eventId}/booking`);
}

export async function saveIntroNote(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const proposalId = String(formData.get("proposalId"));
  const note = String(formData.get("introNote") ?? "").trim();

  await supabase.from("proposals").update({ intro_note: note || null }).eq("id", proposalId);
  revalidatePath(`/admin/events/${eventId}/booking`);
}

/**
 * Sends the pricing link on its own (no contract yet). The client sees
 * their proposal, can request add-ons, and books a planning call when
 * they're ready. Also marks pricing as sent, so the dashboard's follow-up
 * list starts counting days.
 */
export async function sendPricing(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const proposalId = String(formData.get("proposalId"));

  const { count } = await supabase
    .from("proposal_items")
    .select("id", { count: "exact", head: true })
    .eq("proposal_id", proposalId);
  if (!count) redirect(`/admin/events/${eventId}/booking?error=Add at least one line before sending pricing.`);

  await supabase
    .from("proposals")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", proposalId);

  const { data: event } = await supabase
    .from("events")
    .select("event_type, event_date, documents_token, clients(id, first_name, email)")
    .eq("id", eventId)
    .single();
  const client = event ? (Array.isArray(event.clients) ? event.clients[0] : event.clients) : null;

  let emailed = false;
  if (formData.get("emailClient") === "on" && isEmailConfigured() && client?.email && event) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://perfect-pours-platform.vercel.app";
    const link = `${appUrl}/client/${event.documents_token}`;
    const typeLabel = (EVENT_TYPE_LABELS[event.event_type] ?? "event").toLowerCase();
    try {
      await sendEmail({
        to: client.email,
        subject: "Your personalized pricing — Perfect Pours & More",
        html: `<p>Hi ${escapeHtml(client.first_name ?? "")},</p>
<p>Your personalized pricing for your ${escapeHtml(typeLabel)} on ${formatDate(event.event_date)} is ready! Everything is in one place here:</p>
<p><a href="${link}" style="display:inline-block;background:#111111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">View my pricing</a></p>
<p>When you're ready to move forward, you can book a quick planning call right from that page.</p>
<p>Cheers,<br>Faith<br>Perfect Pours &amp; More</p>`,
      });
      emailed = true;
    } catch (err) {
      console.error("sendPricing: email failed:", err);
    }
  }

  revalidatePath(`/admin/events/${eventId}/booking`);
  revalidatePath("/admin");
  redirect(`/admin/events/${eventId}/booking?pricingSent=${emailed ? "emailed" : "link"}`);
}

export async function markAddonsHandled(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const proposalId = String(formData.get("proposalId"));

  await supabase.from("proposals").update({ addons_handled_at: new Date().toISOString() }).eq("id", proposalId);
  revalidatePath(`/admin/events/${eventId}/booking`);
  revalidatePath("/admin");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Booking status, set by hand -- for events booked before the app existed
 * (paper contract, retainer by Venmo/Zelle, pricing sent from the old
 * Google Doc). Whatever Faith picks here is what the app goes by.
 */
export async function updateBookingStatus(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));
  const back = `/admin/events/${eventId}/booking`;

  const pick = (k: string, allowed: string[]) => {
    const v = String(formData.get(k) ?? "");
    return allowed.includes(v) ? v : null;
  };
  let eventStatus = pick("eventStatus", ["inquiry", "booked", "completed", "cancelled"]);
  const pricing = pick("pricing", ["unsent", "sent"]);
  const contractStatus = pick("contract", ["unsent", "sent", "signed"]);
  const retainer = pick("retainer", ["outstanding", "received"]);
  const balance = pick("balance", ["outstanding", "paid"]);
  const amount = (k: string) => {
    const raw = String(formData.get(k) ?? "").replace(/[$,\s]/g, "");
    if (raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };
  const total = amount("totalAmount");
  const deposit = amount("depositAmount");
  if (Number.isNaN(total) || Number.isNaN(deposit)) {
    redirect(`${back}?error=${encodeURIComponent("Total and retainer need to be numbers.")}`);
  }

  const [{ data: event }, { data: contract }, { data: proposal }] = await Promise.all([
    supabase.from("events").select("status").eq("id", eventId).single(),
    supabase.from("contracts").select("status").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("proposals").select("id, status, sent_at").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!event) redirect(`${back}?error=${encodeURIComponent("Couldn't load this event.")}`);

  // Contract: only store a hand-set value when it differs from what the app
  // already knows, so a real in-app contract keeps driving things.
  const appContractStatus = contract?.status ?? "unsent";
  const contractManual = contractStatus && contractStatus !== appContractStatus ? contractStatus : null;
  const effectiveContract = contractManual ?? appContractStatus;

  // Contract signed + retainer in = booked, unless Faith picked something else.
  if (eventStatus === "inquiry" && event!.status === "inquiry" && effectiveContract === "signed" && retainer === "received") {
    eventStatus = "booked";
  }

  const patch: Parameters<typeof upsertEventFinancials>[2] = {
    proposal_sent: pricing === "sent",
    contract_signed: effectiveContract === "signed",
    deposit_paid: retainer === "received",
    balance_paid: balance === "paid",
  };
  if (total !== undefined) patch.total_amount = total;
  if (deposit !== undefined) patch.deposit_amount = deposit;
  if (total !== undefined || deposit !== undefined) {
    const { data: fin } = await supabase.from("event_financials").select("total_amount, deposit_amount").eq("event_id", eventId).maybeSingle();
    const t = total ?? Number(fin?.total_amount ?? 0);
    const d = deposit ?? Number(fin?.deposit_amount ?? 0);
    patch.balance_amount = Math.max(0, Math.round((t - d) * 100) / 100);
  }
  await upsertEventFinancials(supabase, eventId, patch);

  const { error: manualError } = await supabase
    .from("event_financials")
    .update({ contract_status_manual: contractManual })
    .eq("event_id", eventId);
  if (manualError && contractManual) {
    console.error("updateBookingStatus:", manualError);
    redirect(
      `${back}?error=${encodeURIComponent(
        "Saved everything except the contract status. Run supabase/migrations/0021_manual_booking_status.sql in the Supabase SQL Editor, then save again."
      )}`
    );
  }

  // Pricing: keep the proposal in step so the dashboard's follow-up lists
  // (and the client's pricing page) agree with what's set here.
  if (proposal && pricing) {
    if (pricing === "sent" && proposal.status !== "sent") {
      await supabase
        .from("proposals")
        .update({ status: "sent", sent_at: proposal.sent_at ?? new Date().toISOString() })
        .eq("id", proposal.id);
    } else if (pricing === "unsent" && proposal.status === "sent") {
      await supabase.from("proposals").update({ status: "draft", sent_at: null }).eq("id", proposal.id);
    }
  }

  if (eventStatus && eventStatus !== event!.status) {
    await supabase.from("events").update({ status: eventStatus }).eq("id", eventId);
    await syncEventToGoogle(eventId);
  }

  revalidatePath(back);
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/events");
  revalidatePath("/admin");
  redirect(`${back}?statusSaved=1`);
}
