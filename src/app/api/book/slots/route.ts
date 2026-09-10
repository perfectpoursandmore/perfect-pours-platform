import { NextResponse } from "next/server";
import { loadAvailableSlots } from "@/lib/scheduling/load-availability";

// Public — a prospective client hasn't signed up for anything yet.
// Returns open consultation slots only; never anything about *why* a time
// is taken (no event titles, no calendar details reach this response).
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load availability." },
      { status: 500 }
    );
  }
}
