"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { computeProposalTotals } from "@/lib/proposals";
import { renderContractBody } from "@/lib/contracts";
import { EVENT_TYPE_LABELS, formatMoney, formatDate } from "@/lib/labels";
import { upsertEventFinancials, maybeMarkEventBooked } from "@/lib/event-financials";
import {
  getValidConnection,
  findOrCreateCustomer,
  createInvoice,
  getInvoiceStatus,
} from "@/lib/quickbooks";
import { isEmailConfigured, sendTemplatedEmail } from "@/lib/email";

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
  const { data: proposal } = await supabase
    .from("proposals")
    .select("discount_amount, fee_amount, gratuity_rate, tax_rate")
    .eq("id", proposalId)
    .single();

  const { data: items } = await supabase
    .from("proposal_items")
    .select("line_total")
    .eq("proposal_id", proposalId);

  const totals = computeProposalTotals({
    lineTotals: (items ?? []).map((i) => Number(i.line_total)),
    discountAmount: Number(proposal?.discount_amount ?? 0),
    feeAmount: Number(proposal?.fee_amount ?? 0),
    gratuityRatePercent: Number(proposal?.gratuity_rate ?? 0),
    taxRatePercent: Number(proposal?.tax_rate ?? 0),
  });

  await supabase
    .from("proposals")
    .update({
      subtotal: totals.subtotal,
      gratuity_amount: totals.gratuityAmount,
      tax_amount: totals.taxAmount,
      total_amount: totals.totalAmount,
    })
    .eq("id", proposalId);
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

  const { data: items } = await supabase
    .from("proposal_items")
    .select("description, quantity, line_total")
    .eq("proposal_id", proposal!.id);

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
