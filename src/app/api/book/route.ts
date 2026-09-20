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

  const {
    slotStart,
    firstName,
    lastName,
    email,
    phone,
    eventType,
    eventDate,
    venueOrAddress,
    guestCount,
    howHeard,
  } = body;

  // Required-field validation — mirrors the intake form in the PRD.
  if (
    !isNonEmptyString(slotStart) ||
    !isNonEmptyString(firstName) ||
    !isNonEmptyString(lastName) ||
    !isNonEmptyString(email) ||
    !isNonEmptyString(phone) ||
    !isNonEmptyString(eventType) ||
    !isNonEmptyString(eventDate) ||
    !isNonEmptyString(venueOrAddress)
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
      venue_or_address: venueOrAddress,
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
<li><strong>Venue/address:</strong> ${venueOrAddress}</li>
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
