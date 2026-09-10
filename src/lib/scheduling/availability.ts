import { addDaysToDateString, utcToZonedDateString, weekdayOf, zonedTimeToUtc } from "./timezone";

export type DayHours = { start: string; end: string } | null;

/** Keyed 0 (Sunday) .. 6 (Saturday). */
export type WeeklyHours = Record<number, DayHours>;

export interface ConsultationSettings {
  weeklyHours: WeeklyHours;
  timeZone: string;
  appointmentLengthMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  vacationMode: boolean;
}

export interface BusyBlock {
  start: Date;
  end: Date;
}

export interface Slot {
  start: Date;
  end: Date;
}

/**
 * The heart of the consultation scheduler. Pure function, no I/O — given the
 * admin's availability settings, the calendar dates that are blocked out,
 * and the busy blocks read from Google Calendar, returns every bookable
 * slot. Callers are responsible for fetching busyBlocks from Google first.
 */
export function getAvailableSlots(params: {
  settings: ConsultationSettings;
  blockedDates: Set<string>; // "YYYY-MM-DD", in the business's local calendar
  busyBlocks: BusyBlock[];
  now: Date;
}): Slot[] {
  const { settings, blockedDates, busyBlocks, now } = params;

  if (settings.vacationMode) return [];

  const {
    weeklyHours,
    timeZone,
    appointmentLengthMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    minNoticeHours,
    maxAdvanceDays,
  } = settings;

  const earliestAllowedMillis = now.getTime() + minNoticeHours * 60 * 60 * 1000;
  const slotLengthMillis = appointmentLengthMinutes * 60 * 1000;
  const bufferBeforeMillis = bufferBeforeMinutes * 60 * 1000;
  const bufferAfterMillis = bufferAfterMinutes * 60 * 1000;

  const todayLocal = utcToZonedDateString(now, timeZone);
  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset <= maxAdvanceDays; dayOffset++) {
    const dateStr = addDaysToDateString(todayLocal, dayOffset);

    if (blockedDates.has(dateStr)) continue;

    const hours = weeklyHours[weekdayOf(dateStr)];
    if (!hours) continue;

    const dayStart = zonedTimeToUtc(dateStr, hours.start, timeZone).getTime();
    const dayEnd = zonedTimeToUtc(dateStr, hours.end, timeZone).getTime();

    for (
      let slotStartMillis = dayStart;
      slotStartMillis + slotLengthMillis <= dayEnd;
      slotStartMillis += slotLengthMillis
    ) {
      const slotEndMillis = slotStartMillis + slotLengthMillis;

      if (slotStartMillis < earliestAllowedMillis) continue;

      const protectedStart = slotStartMillis - bufferBeforeMillis;
      const protectedEnd = slotEndMillis + bufferAfterMillis;

      const conflicts = busyBlocks.some(
        (busy) => protectedStart < busy.end.getTime() && protectedEnd > busy.start.getTime()
      );

      if (!conflicts) {
        slots.push({ start: new Date(slotStartMillis), end: new Date(slotEndMillis) });
      }
    }
  }

  return slots;
}
