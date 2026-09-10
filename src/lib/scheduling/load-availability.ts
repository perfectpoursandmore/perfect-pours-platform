import { createAdminClient } from "@/lib/supabase/admin";
import { getBusyBlocks, getValidAccessToken } from "@/lib/google-calendar";
import { getAvailableSlots, type ConsultationSettings, type Slot } from "./availability";

/**
 * Loads the admin's current consultation settings + blocked dates + Google
 * Calendar busy blocks, and returns the resulting open slots. Shared by the
 * public "what times are open" route and the booking route's race-condition
 * re-check, so the two can never disagree about what "available" means.
 */
export async function loadAvailableSlots(now: Date = new Date()): Promise<{
  slots: Slot[];
  settings: ConsultationSettings;
  calendarConnected: boolean;
}> {
  const supabase = createAdminClient();

  const { data: settingsRow, error: settingsError } = await supabase
    .from("consultation_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (settingsError || !settingsRow) {
    throw new Error("Consultation settings haven't been configured yet.");
  }

  const settings: ConsultationSettings = {
    weeklyHours: settingsRow.weekly_hours,
    timeZone: settingsRow.time_zone,
    appointmentLengthMinutes: settingsRow.appointment_length_minutes,
    bufferBeforeMinutes: settingsRow.buffer_before_minutes,
    bufferAfterMinutes: settingsRow.buffer_after_minutes,
    minNoticeHours: settingsRow.min_notice_hours,
    maxAdvanceDays: settingsRow.max_advance_days,
    vacationMode: settingsRow.vacation_mode,
  };

  const { data: blockedRows } = await supabase
    .from("consultation_blocked_dates")
    .select("blocked_date");
  const blockedDates = new Set<string>(
    ((blockedRows ?? []) as { blocked_date: string }[]).map((r) => r.blocked_date)
  );

  const calendar = await getValidAccessToken();

  let busyBlocks: Slot[] = [];
  if (calendar) {
    const timeMax = new Date(now.getTime() + (settings.maxAdvanceDays + 1) * 86400000);
    busyBlocks = await getBusyBlocks(calendar.accessToken, calendar.calendarId, now, timeMax);
  }

  const slots = getAvailableSlots({ settings, blockedDates, busyBlocks, now });

  return { slots, settings, calendarConnected: Boolean(calendar) };
}
