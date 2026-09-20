import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { getValidAccessToken, getBusyBlocks } from "@/lib/google-calendar";

// TEMPORARY diagnostic route -- admin-only, no client details exposed
// beyond what's needed to see why the calendar connection is failing.
// Delete this file once the Google Calendar issue is resolved.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  try {
    const calendar = await getValidAccessToken();
    if (!calendar) {
      return NextResponse.json({ step: "getValidAccessToken", result: "returned null (no refresh_token stored)" });
    }

    const now = new Date();
    const timeMax = new Date(now.getTime() + 30 * 86400000);
    try {
      const busy = await getBusyBlocks(calendar.accessToken, calendar.calendarId, now, timeMax);
      return NextResponse.json({
        step: "success",
        calendarId: calendar.calendarId,
        busyBlockCount: busy.length,
        busyBlocks: busy.map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
      });
    } catch (err) {
      return NextResponse.json({
        step: "getBusyBlocks",
        calendarId: calendar.calendarId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } catch (err) {
    return NextResponse.json({
      step: "getValidAccessToken",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
