import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConsultationEvent, getValidAccessToken } from "@/lib/google-calendar";
import { loadAvailableSlots } from "@/lib/scheduling/load-availability";
import { isEmailConfigured, sendEmail, sendTemplatedEmail } from "@/lib/email";
import { formatDateTime, EVENT_TYPE_LABELS } from "@/lib/labels";

const EVENT_TYPES: readonly string[] = [
  "wedding",
  "birthday",
  "bridal_shower",
  "baby_shower",
  "corporate",
  "holiday_party",
  "graduation",
  "engagement_party",
  "anniversary",
  "other",
];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // From their pricing page: we already have the client and event, so only
  // the time is sent.
  if (isNonEmptyString(body.eventToken)) {
    return bookKnownClient(body.eventToken, body.slotStart);
  }

  const {
    slotStart,
    firstName,
    lastName,
    email,
    phone,
    eventType,
    eventDate,
    addressLine,
    city,
    state,
    zip,
    guestCount,
    howHeard,
  } = body;

  // Required-field validation — mirrors the intake form in the PRD. The
  // address is split into pieces (rather than one free-text line) so a
  // vague answer like just a neighborhood name can't slip through — every
  // piece has to actually be filled in.
  if (
    !isNonEmptyString(slotStart) ||
    !isNonEmptyString(firstName) ||
    !isNonEmptyString(lastName) ||
    !isNonEmptyString(email) ||
    !isNonEmptyString(phone) ||
    !isNonEmptyString(eventType) ||
    !isNonEmptyString(eventDate) ||
    !isNonEmptyString(addressLine) ||
    !isNonEmptyString(city) ||
    !isNonEmptyString(state) ||
    !isNonEmptyString(zip)
  ) {
    return NextResponse.json({ error: "Please fill in every required field." }, { status: 400 });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }

  if (!EVENT_TYPES.includes(eventType)) {
    return NextResponse.json({ error: "Unrecognized event type." }, { status: 400 });
  }

  const slotStartDate = new Date(slotStart);
  if (Number.isNaN(slotStartDate.getTime())) {
    return NextResponse.json({ error: "Invalid consultation time." }, { status: 400 });
  }

  // Re-check availability server-side right before booking — the slot list
  // the browser has could be a few minutes stale, or someone else could have
  // just taken it. This is the actual guard against double-booking, not the
  // earlier GET request.
  const { slots } = await loadAvailableSlots();
  const stillOpen = slots.some((s) => s.start.getTime() === slotStartDate.getTime());

  if (!stillOpen) {
    return NextResponse.json(
      { error: "That time was just booked or is no longer available. Please pick another." },
      { status: 409 }
    );
  }

  const chosenSlot = slots.find((s) => s.start.getTime() === slotStartDate.getTime())!;
  const guestCountNum = guestCount ? Number(guestCount) : null;

  const supabase = createAdminClient();

  // Best-effort: put the consultation on Faith's calendar so it blocks
  // future conflicts too. If Google isn't connected yet, still take the
  // booking — Faith just won't see it on her calendar automatically.
  let calendarEventLink: string | null = null;
  try {
    const calendar = await getValidAccessToken();
    if (calendar) {
      const { data: settingsRow } = await supabase
        .from("consultation_settings")
        .select("time_zone")
        .eq("id", true)
        .single();

      const event = await createConsultationEvent({
        accessToken: calendar.accessToken,
        calendarId: calendar.calendarId,
        start: chosenSlot.start,
        end: chosenSlot.end,
        timeZone: settingsRow?.time_zone ?? "America/New_York",
        clientName: `${firstName} ${lastName}`,
        clientEmail: email,
        eventType,
      });
      calendarEventLink = event.htmlLink;
    }
  } catch (err) {
    // Don't fail the whole booking over a calendar hiccup — the lead still
    // needs to land in the CRM. Faith will just need to add it manually.
    console.error("Failed to create Google Calendar event for booking:", err);
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      event_type: eventType,
      event_date: eventDate,
      address_line: addressLine,
      city,
      state,
      zip,
      guest_count: guestCountNum,
      how_heard: howHeard ?? null,
      consultation_at: chosenSlot.start.toISOString(),
      status: "consultation_scheduled",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Something went wrong saving your booking. Please try again." },
      { status: 500 }
    );
  }

  // Best-effort confirmation email — never blocks the booking itself on a
  // send failure (sendTemplatedEmail logs the attempt either way). Looked up
  // by name rather than a hard-coded id since Faith can edit these freely
  // from Email templates; if she renames it away from "consultation" this
  // just quietly skips sending, same as if email isn't configured at all.
  if (isEmailConfigured()) {
    try {
      const { data: template } = await supabase
        .from("email_templates")
        .select("id")
        .eq("active", true)
        .ilike("name", "%consultation%")
        .limit(1)
        .single();

      if (template) {
        await sendTemplatedEmail(supabase, {
          templateId: template.id,
          to: email,
          vars: {
            client_name: `${firstName} ${lastName}`,
            consultation_datetime: formatDateTime(chosenSlot.start.toISOString()),
            event_type: EVENT_TYPE_LABELS[eventType] ?? eventType,
          },
        });
      }
    } catch (err) {
      console.error("Failed to send consultation confirmation email:", err);
    }
  }

  // Best-effort notification to Faith so a new booking never sits
  // undiscovered in /admin/leads. Uses the low-level sendEmail() helper
  // directly (no email_templates row needed) and never blocks or fails
  // the booking response.
  if (isEmailConfigured()) {
    try {
      const notifyTo = process.env.ADMIN_NOTIFICATION_EMAIL || "faith@perfectpoursandmore.com";
      await sendEmail({
        to: notifyTo,
        subject: `New consultation booked: ${firstName} ${lastName} (${EVENT_TYPE_LABELS[eventType] ?? eventType})`,
        html: `<p>A new consultation was just booked through the website.</p>
<ul>
<li><strong>Name:</strong> ${firstName} ${lastName}</li>
<li><strong>Email:</strong> ${email}</li>
<li><strong>Phone:</strong> ${phone}</li>
<li><strong>Event type:</strong> ${EVENT_TYPE_LABELS[eventType] ?? eventType}</li>
<li><strong>Event date:</strong> ${eventDate}</li>
<li><strong>Address:</strong> ${addressLine}, ${city}, ${state} ${zip}</li>
<li><strong>Guest count:</strong> ${guestCountNum ?? "—"}</li>
<li><strong>How they heard about us:</strong> ${howHeard || "—"}</li>
<li><strong>Consultation time:</strong> ${formatDateTime(chosenSlot.start.toISOString())}</li>
</ul>
<p><a href="https://perfect-pours-platform.vercel.app/admin/leads">View in the leads dashboard</a></p>`,
      });
    } catch (err) {
      // Don't fail the booking over a notification hiccup — Faith can
      // still find the lead in /admin/leads or her calendar.
      console.error("Failed to send new-lead notification email:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    leadId: lead.id,
    consultationAt: chosenSlot.start.toISOString(),
    calendarEventLink,
  });
}

/**
 * Planning call for a client who already sent their details (they came from
 * their pricing page). Puts the call on Faith's calendar and on their
 * existing lead/event -- no new lead, no retyping.
 */
async function bookKnownClient(eventToken: string, slotStart: unknown) {
  if (!isNonEmptyString(slotStart) || Number.isNaN(new Date(slotStart).getTime())) {
    return NextResponse.json({ error: "Invalid call time." }, { status: 400 });
  }
  const slotStartDate = new Date(slotStart);

  const supabase = createAdminClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, name, event_type, event_date, client_id, clients(first_name, last_name, email, phone)")
    .eq("documents_token", eventToken)
    .maybeSingle();
  if (!event) {
    return NextResponse.json({ error: "We couldn't find your event. Please use the link from your pricing email." }, { status: 404 });
  }
  const client = (Array.isArray(event.clients) ? event.clients[0] : event.clients) as
    | { first_name: string; last_name: string; email: string | null; phone: string | null }
    | null;
  const name = client ? `${client.first_name} ${client.last_name}`.trim() : event.name;

  const { slots } = await loadAvailableSlots();
  const chosenSlot = slots.find((s) => s.start.getTime() === slotStartDate.getTime());
  if (!chosenSlot) {
    return NextResponse.json(
      { error: "That time was just booked or is no longer available. Please pick another." },
      { status: 409 }
    );
  }

  try {
    const calendar = await getValidAccessToken();
    if (calendar) {
      const { data: settingsRow } = await supabase.from("consultation_settings").select("time_zone").eq("id", true).single();
      await createConsultationEvent({
        accessToken: calendar.accessToken,
        calendarId: calendar.calendarId,
        start: chosenSlot.start,
        end: chosenSlot.end,
        timeZone: settingsRow?.time_zone ?? "America/New_York",
        clientName: name,
        clientEmail: client?.email ?? "",
        eventType: EVENT_TYPE_LABELS[event.event_type] ?? event.event_type,
      });
    }
  } catch (err) {
    console.error("Planning call: Google Calendar event failed:", err);
  }

  // Record the call on their existing lead (that's what the dashboard's
  // "Upcoming consultations" reads). Repeat clients Faith added by hand may
  // not have one, so create it from what's already on file.
  const consultationAt = chosenSlot.start.toISOString();
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = lead
    ? await supabase.from("leads").update({ consultation_at: consultationAt, status: "consultation_scheduled" }).eq("id", lead.id)
    : await supabase.from("leads").insert({
        first_name: client?.first_name ?? name,
        last_name: client?.last_name ?? "",
        email: client?.email ?? "",
        phone: client?.phone ?? "",
        event_type: event.event_type,
        event_date: event.event_date,
        consultation_at: consultationAt,
        status: "consultation_scheduled",
        client_id: event.client_id,
        event_id: event.id,
      });
  if (error) {
    console.error("Planning call: saving failed:", error);
    return NextResponse.json({ error: "Something went wrong saving your call. Please try again." }, { status: 500 });
  }

  if (isEmailConfigured()) {
    try {
      const { data: template } = await supabase
        .from("email_templates")
        .select("id")
        .eq("active", true)
        .ilike("name", "%consultation%")
        .limit(1)
        .single();
      if (template && client?.email) {
        await sendTemplatedEmail(supabase, {
          templateId: template.id,
          to: client.email,
          vars: {
            client_name: name,
            consultation_datetime: formatDateTime(consultationAt),
            event_type: EVENT_TYPE_LABELS[event.event_type] ?? event.event_type,
          },
          clientId: event.client_id,
          eventId: event.id,
        });
      }
    } catch (err) {
      console.error("Planning call: confirmation email failed:", err);
    }
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://perfect-pours-platform.vercel.app";
      await sendEmail({
        to: process.env.ADMIN_NOTIFICATION_EMAIL || "faith@perfectpoursandmore.com",
        subject: `Planning call booked: ${name}, ${formatDateTime(consultationAt)}`,
        html: `<p>${name} booked a planning call for ${formatDateTime(consultationAt)} about ${event.name}.</p>
<p><a href="${appUrl}/admin/events/${event.id}/booking">Open their event</a></p>`,
      });
    } catch (err) {
      console.error("Planning call: notification failed:", err);
    }
  }

  return NextResponse.json({ ok: true, consultationAt });
}
