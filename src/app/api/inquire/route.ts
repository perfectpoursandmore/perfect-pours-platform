import { NextResponse } from "next/server";
import { rememberClientAddress } from "@/lib/client-address";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { EVENT_TYPE_LABELS, formatDate } from "@/lib/labels";
import { syncEventToGoogle } from "@/lib/google-event-sync";
import { zonedTimeToIso } from "@/lib/calendar-dates";
import {
  DISHWARE,
  EXTRA_HELP,
  SERVICES,
  SERVICE_STYLES,
  cleanValue,
  cleanValues,
  labelFor,
  labelsFor,
} from "@/lib/event-details";

// Public "tell us about your event" form -- the price-first replacement for
// booking a consultation call up front. One submission:
//   1. finds the client by email (repeat clients aren't duplicated) or creates them,
//   2. creates the event as an Inquiry, so the date shows as a HOLD on the
//      platform calendar and Google Calendar right away,
//   3. records the lead for the paper trail,
//   4. emails Faith (with a heads-up if that date already has something on it).

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Honeypot: real people never see or fill this field; bots do.
  if (str(body.company)) return NextResponse.json({ ok: true });

  const firstName = str(body.firstName);
  const lastName = str(body.lastName);
  const email = str(body.email).toLowerCase();
  const phone = str(body.phone);
  const eventType = str(body.eventType);
  const eventDate = str(body.eventDate);
  const eventTypeOther = str(body.eventTypeOther).slice(0, 80);
  const guestArrivalTime = str(body.guestArrivalTime);
  const venueName = str(body.venueName) || null;
  const addressLine = str(body.addressLine) || null;
  const city = str(body.city);
  const state = str(body.state) || "NY";
  const zip = str(body.zip) || null;
  const guestCount = Number(body.guestCount);
  const howHeard = str(body.howHeard) || null;
  const message = str(body.message).slice(0, 4000) || null;
  const serviceStyle = cleanValue(SERVICE_STYLES, body.serviceStyle);
  const dishware = cleanValue(DISHWARE, body.dishware);
  const services = cleanValues(SERVICES, Array.isArray(body.services) ? body.services : []);
  const extraHelp = cleanValues(EXTRA_HELP, Array.isArray(body.extraHelp) ? body.extraHelp : []);

  if (!firstName || !lastName || !email || !phone || !eventType || !eventDate || !city) {
    return NextResponse.json({ error: "Please fill in every required field." }, { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }
  if (!EVENT_TYPE_LABELS[eventType]) {
    return NextResponse.json({ error: "Please pick an event type." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return NextResponse.json({ error: "Please pick your event date." }, { status: 400 });
  }
  if (eventType === "other" && !eventTypeOther) {
    return NextResponse.json({ error: "Please tell us what kind of event it is." }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(guestArrivalTime)) {
    return NextResponse.json({ error: "Please enter your guest arrival time." }, { status: 400 });
  }
  if (!Number.isFinite(guestCount) || guestCount < 1 || guestCount > 5000) {
    return NextResponse.json({ error: "Please enter your estimated guest count." }, { status: 400 });
  }
  if (services.length === 0) {
    return NextResponse.json({ error: "Please check at least one service you're interested in." }, { status: 400 });
  }

  const supabase = createAdminClient();
  // "Other" uses whatever they typed, e.g. "Retirement party".
  const typeLabel = eventType === "other" && eventTypeOther ? eventTypeOther : EVENT_TYPE_LABELS[eventType] ?? eventType;
  const guestArrivalIso = zonedTimeToIso(eventDate, guestArrivalTime);
  const guestArrivalLabel = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(`1970-01-01T${guestArrivalTime}:00Z`)
  );

  // 1. Client: reuse by email so repeat clients keep one history.
  let clientId: string;
  let repeatClient = false;
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (existing) {
    clientId = existing.id;
    repeatClient = true;
  } else {
    const { data: created, error } = await supabase
      .from("clients")
      .insert({ first_name: firstName, last_name: lastName, email, phone })
      .select("id")
      .single();
    if (error || !created) {
      console.error("Inquiry: couldn't create client:", error);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
    clientId = created.id;
  }

  // 2. Event, as an Inquiry (shows as a HOLD).
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      client_id: clientId,
      name: `${lastName} ${typeLabel}`,
      event_type: eventType,
      event_date: eventDate,
      venue_name: venueName,
      address_line: addressLine,
      city,
      state,
      zip,
      guest_count: guestCount,
      guest_arrival_time: guestArrivalIso,
      status: "inquiry",
      service_style: serviceStyle,
      dishware,
      services_interested: services,
      extra_help: extraHelp,
    })
    .select("id")
    .single();

  if (eventError || !event) {
    console.error("Inquiry: couldn't create event:", eventError);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // First time we see where they host (and it's not a named venue)? Save it
  // as their home address so future events and invoices start with it.
  await rememberClientAddress(supabase, clientId, { venue_name: venueName, address_line: addressLine, city, state, zip });

  // 3. Lead, already linked to the client and event.
  const { error: leadError } = await supabase.from("leads").insert({
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
    guest_count: guestCount,
    how_heard: howHeard,
    status: "new_inquiry",
    client_id: clientId,
    event_id: event.id,
    service_style: serviceStyle,
    dishware,
    services_interested: services,
    extra_help: extraHelp,
    message,
    source: "inquiry_form",
  });
  if (leadError) console.error("Inquiry: couldn't create lead (event was still created):", leadError);

  await syncEventToGoogle(event.id);

  // 4. Tell Faith, flagging anything else already on that date.
  if (isEmailConfigured()) {
    try {
      const { data: sameDay } = await supabase
        .from("events")
        .select("name, status")
        .eq("event_date", eventDate)
        .in("status", ["inquiry", "booked"])
        .neq("id", event.id);

      const conflictNote =
        sameDay && sameDay.length > 0
          ? `<p style="color:#b42318"><strong>Heads up:</strong> you already have ${sameDay
              .map((e) => `${esc(e.name)} (${e.status === "inquiry" ? "hold" : "booked"})`)
              .join(", ")} on this date.</p>`
          : "";

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://perfect-pours-platform.vercel.app";
      await sendEmail({
        to: process.env.ADMIN_NOTIFICATION_EMAIL || "faith@perfectpoursandmore.com",
        subject: `New inquiry: ${firstName} ${lastName}, ${typeLabel} on ${formatDate(eventDate)}${repeatClient ? " (repeat client)" : ""}`,
        html: `<p>A new inquiry just came in through the website. The date is on your calendar as a HOLD.</p>
${conflictNote}
<ul>
<li><strong>Name:</strong> ${esc(firstName)} ${esc(lastName)}${repeatClient ? " (repeat client)" : ""}</li>
<li><strong>Email:</strong> ${esc(email)}</li>
<li><strong>Phone:</strong> ${esc(phone)}</li>
<li><strong>Event:</strong> ${esc(typeLabel)} on ${formatDate(eventDate)}, guests arrive at ${guestArrivalLabel}</li>
<li><strong>Where:</strong> ${esc([venueName, addressLine, city, state].filter(Boolean).join(", "))}</li>
<li><strong>Guests:</strong> ${guestCount}</li>
<li><strong>Interested in:</strong> ${esc(labelsFor(SERVICES, services))}</li>
<li><strong>Food service:</strong> ${esc(labelFor(SERVICE_STYLES, serviceStyle))}</li>
<li><strong>Dishware:</strong> ${esc(labelFor(DISHWARE, dishware))}</li>
<li><strong>How they heard about us:</strong> ${esc(howHeard ?? "—")}</li>
</ul>
${message ? `<p><strong>Their note:</strong><br>${esc(message).replace(/\n/g, "<br>")}</p>` : ""}
<p><a href="${appUrl}/admin/events/${event.id}">Open the event</a></p>`,
      });
    } catch (err) {
      console.error("Inquiry: failed to send notification email:", err);
    }

    try {
      await sendEmail({
        to: email,
        subject: `Got your details for ${typeLabel.toLowerCase()} on ${formatDate(eventDate)}`,
        html: `<p>Hi ${esc(firstName)},</p>
<p>Thank you for reaching out about your ${esc(typeLabel.toLowerCase())} on ${formatDate(eventDate)}! We've received your details and will send over pricing for your event. You'll hear back from us within 24 hours, or within 48 hours if you reached out over the weekend.</p>
<p>We can't wait to help you host stress-free!</p>
<p>Questions in the meantime? Email <a href="mailto:faith@perfectpoursandmore.com">faith@perfectpoursandmore.com</a> or shoot us a text at <a href="sms:+19142636709">914-263-6709</a>.</p>
<p>Cheers,<br>Faith<br>Perfect Pours &amp; More</p>`,
      });
    } catch (err) {
      console.error("Inquiry: failed to send client confirmation email:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
