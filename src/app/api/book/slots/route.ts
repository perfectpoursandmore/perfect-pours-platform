import { NextResponse } from "next/server";
import { loadAvailableSlots } from "@/lib/scheduling/load-availability";

// Public — a prospective client hasn't signed up for anything yet.
// Returns open consultation slots only; never anything about *why* a time
// is taken (no event titles, no calendar details reach this response).
//
// Force-dynamic: this handler takes no request input and doesn't call any
// of Next's "dynamic" APIs (cookies/headers), so by default Next.js treats
// it as a static route and caches its response after each deploy. Without
// this, a slot only ever reflects Google Calendar changes made *before*
// the last deploy -- blocking time off afterward (e.g. in the Google
// Calendar app) would silently never show up here until the next push.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { slots, settings, calendarConnected } = await loadAvailableSlots();

    return NextResponse.json({
      timeZone: settings.timeZone,
      appointmentLengthMinutes: settings.appointmentLengthMinutes,
      calendarConnected,
      slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
    });
  } catch (err) {
    // Log the real error server-side (Vercel logs) but never show visitors
    // an internal error string -- a stray API/auth message on the public
    // booking page reads as broken and erodes trust, even when it isn't.
    console.error("Failed to load booking slots:", err);
    return NextResponse.json(
      { error: "We couldn't load available times right now. Please try again in a moment, or email faith@perfectpoursandmore.com to set up a time." },
      { status: 500 }
    );
  }
}
