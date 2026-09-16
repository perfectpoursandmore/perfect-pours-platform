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
  sendInvoice,
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
  const servicesList =
    (items ?? []).map((i) => `- ${i.description} (x${i.quantity}) — ${formatMoney(i.line_total)}`).join("\n") ||
    "(no line items yet)";

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

export async function createAndSendDepositInvoice(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));

  const conn = await getValidConnection();
  if (!conn) {
    redirect(`/admin/events/${eventId}/booking?error=Connect QuickBooks in Settings first.`);
  }

  // Note: redirect() throws internally, so validation redirects must happen
  // OUTSIDE the try/catch below — otherwise our own catch would swallow the
  // redirect and misreport it as a QuickBooks error.
  const loaded = await loadEventAndClientForInvoicing(supabase, eventId);
  const { data: proposal } = await supabase
    .from("proposals")
    .select("deposit_amount")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!loaded?.client || !proposal) {
    redirect(`/admin/events/${eventId}/booking?error=Create a proposal before sending an invoice.`);
  }

  try {
    let qboCustomerId = loaded!.client.qbo_customer_id as string | null;
    if (!qboCustomerId) {
      qboCustomerId = await findOrCreateCustomer(conn!, {
        firstName: loaded!.client.first_name,
        lastName: loaded!.client.last_name,
        email: loaded!.client.email,
        phone: loaded!.client.phone,
      });
      await supabase.from("clients").update({ qbo_customer_id: qboCustomerId }).eq("id", loaded!.client.id);
    }

    const invoice = await createInvoice(conn!, {
      customerId: qboCustomerId,
      description: `Deposit — ${loaded!.event.name}`,
      amount: Number(proposal!.deposit_amount),
    });
    await sendInvoice(conn!, invoice.id);

    await upsertEventFinancials(supabase, eventId, {
      deposit_invoice_id: invoice.id,
      deposit_invoice_status: "sent",
      deposit_invoice_sent_at: new Date().toISOString(),
      qbo_sync_error: null,
    });
  } catch (err) {
    await upsertEventFinancials(supabase, eventId, {
      qbo_sync_error: err instanceof Error ? err.message : "Something went wrong sending the deposit invoice.",
    });
  }

  revalidatePath(`/admin/events/${eventId}/booking`);
}

export async function refreshDepositInvoiceStatus(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));

  const conn = await getValidConnection();
  if (!conn) redirect(`/admin/events/${eventId}/booking?error=Connect QuickBooks in Settings first.`);

  try {
    const { data: financials } = await supabase
      .from("event_financials")
      .select("deposit_invoice_id")
      .eq("event_id", eventId)
      .single();

    if (financials?.deposit_invoice_id) {
      const status = await getInvoiceStatus(conn!, financials.deposit_invoice_id);
      await upsertEventFinancials(supabase, eventId, {
        deposit_invoice_status: status.paid ? "paid" : "sent",
        ...(status.paid ? { deposit_paid: true } : {}),
        qbo_sync_error: null,
      });
      if (status.paid) await maybeMarkEventBooked(supabase, eventId);
    }
  } catch (err) {
    await upsertEventFinancials(supabase, eventId, {
      qbo_sync_error: err instanceof Error ? err.message : "Couldn't check the deposit invoice status.",
    });
  }

  revalidatePath(`/admin/events/${eventId}/booking`);
}

export async function createAndSendBalanceInvoice(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));

  const conn = await getValidConnection();
  if (!conn) redirect(`/admin/events/${eventId}/booking?error=Connect QuickBooks in Settings first.`);

  // Validation redirects stay outside the try/catch — see the note in
  // createAndSendDepositInvoice above.
  const loaded = await loadEventAndClientForInvoicing(supabase, eventId);
  const { data: proposal } = await supabase
    .from("proposals")
    .select("total_amount, deposit_amount")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!loaded?.client || !proposal) {
    redirect(`/admin/events/${eventId}/booking?error=Create a proposal before sending an invoice.`);
  }

  try {
    let qboCustomerId = loaded!.client.qbo_customer_id as string | null;
    if (!qboCustomerId) {
      qboCustomerId = await findOrCreateCustomer(conn!, {
        firstName: loaded!.client.first_name,
        lastName: loaded!.client.last_name,
        email: loaded!.client.email,
        phone: loaded!.client.phone,
      });
      await supabase.from("clients").update({ qbo_customer_id: qboCustomerId }).eq("id", loaded!.client.id);
    }

    const balanceAmount = Number(proposal!.total_amount) - Number(proposal!.deposit_amount);
    const invoice = await createInvoice(conn!, {
      customerId: qboCustomerId,
      description: `Balance — ${loaded!.event.name}`,
      amount: balanceAmount,
    });
    await sendInvoice(conn!, invoice.id);

    await upsertEventFinancials(supabase, eventId, {
      balance_invoice_id: invoice.id,
      balance_invoice_status: "sent",
      balance_invoice_sent_at: new Date().toISOString(),
      qbo_sync_error: null,
    });
  } catch (err) {
    await upsertEventFinancials(supabase, eventId, {
      qbo_sync_error: err instanceof Error ? err.message : "Something went wrong sending the balance invoice.",
    });
  }

  revalidatePath(`/admin/events/${eventId}/booking`);
}

export async function refreshBalanceInvoiceStatus(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const eventId = String(formData.get("eventId"));

  const conn = await getValidConnection();
  if (!conn) redirect(`/admin/events/${eventId}/booking?error=Connect QuickBooks in Settings first.`);

  try {
    const { data: financials } = await supabase
      .from("event_financials")
      .select("balance_invoice_id")
      .eq("event_id", eventId)
      .single();

    if (financials?.balance_invoice_id) {
      const status = await getInvoiceStatus(conn!, financials.balance_invoice_id);
      await upsertEventFinancials(supabase, eventId, {
        balance_invoice_status: status.paid ? "paid" : "sent",
        ...(status.paid ? { balance_paid: true } : {}),
        qbo_sync_error: null,
      });
    }
  } catch (err) {
    await upsertEventFinancials(supabase, eventId, {
      qbo_sync_error: err instanceof Error ? err.message : "Couldn't check the balance invoice status.",
    });
  }

  revalidatePath(`/admin/events/${eventId}/booking`);
}
