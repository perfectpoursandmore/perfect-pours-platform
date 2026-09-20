import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { loadAvailableSlots } from "@/lib/scheduling/load-availability";
import { getValidAccessToken, getBusyBlocks } from "@/lib/google-calendar";

// TEMPORARY diagnostic route -- admin-only. Delete once the Google
// Calendar issue is resolved.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  // Step 1: call the exact same function /api/book/slots calls, but
  // capture any error instead of swallowing it silently.
  let viaLoadAvailableSlots: unknown;
  try {
    const result = await loadAvailableSlots();
    viaLoadAvailableSlots = {
      calendarConnected: result.calendarConnected,
      slotCount: result.slots.length,
      calendarDebug: result.calendarDebug,
    };
  } catch (err) {
    viaLoadAvailableSlots = { threw: err instanceof Error ? err.message : String(err) };
  }

  // Step 2: call the two Google functions directly, same as before.
  let direct: unknown;
  try {
    const calendar = await getValidAccessToken();
    if (!calendar) {
      direct = { step: "getValidAccessToken", result: "returned null" };
    } else {
      const now = new Date();
      const timeMax = new Date(now.getTime() + 30 * 86400000);
      const busy = await getBusyBlocks(calendar.accessToken, calendar.calendarId, now, timeMax);
      direct = {
        step: "success",
        calendarId: calendar.calendarId,
        busyBlockCount: busy.length,
        debugInfo: calendar.debugInfo,
      };
    }
  } catch (err) {
    direct = { step: "threw", error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({ viaLoadAvailableSlots, direct, timestamp: new Date().toISOString() });
}
