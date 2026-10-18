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
 *
 * When `openWindows` is given (Faith's "Call times" events on Google
 * Calendar), slots are offered only inside those windows and the weekly
 * hours are ignored.
 */
export function getAvailableSlots(params: {
  settings: ConsultationSettings;
  blockedDates: Set<string>; // "YYYY-MM-DD", in the business's local calendar
  busyBlocks: BusyBlock[];
  openWindows?: BusyBlock[];
  now: Date;
}): Slot[] {
  const { settings, blockedDates, busyBlocks, openWindows, now } = params;

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

  const latestAllowedMillis = zonedTimeToUtc(
    addDaysToDateString(todayLocal, maxAdvanceDays + 1),
    "00:00",
    timeZone
  ).getTime();

  const addSlotsWithin = (rangeStart: number, rangeEnd: number) => {
    for (
      let slotStartMillis = rangeStart;
      slotStartMillis + slotLengthMillis <= rangeEnd;
      slotStartMillis += slotLengthMillis
    ) {
      const slotEndMillis = slotStartMillis + slotLengthMillis;

      if (slotStartMillis < earliestAllowedMillis) continue;
      if (slotStartMillis >= latestAllowedMillis) continue;
      if (blockedDates.has(utcToZonedDateString(new Date(slotStartMillis), timeZone))) continue;

      const protectedStart = slotStartMillis - bufferBeforeMillis;
      const protectedEnd = slotEndMillis + bufferAfterMillis;

      const conflicts = busyBlocks.some(
        (busy) => protectedStart < busy.end.getTime() && protectedEnd > busy.start.getTime()
      );

      if (!conflicts) {
        slots.push({ start: new Date(slotStartMillis), end: new Date(slotEndMillis) });
      }
    }
  };

  if (openWindows) {
    for (const w of openWindows) addSlotsWithin(w.start.getTime(), w.end.getTime());
    // Overlapping "Call times" events could offer the same slot twice.
    const unique = new Map(slots.map((s) => [s.start.getTime(), s]));
    return Array.from(unique.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  for (let dayOffset = 0; dayOffset <= maxAdvanceDays; dayOffset++) {
    const dateStr = addDaysToDateString(todayLocal, dayOffset);
    const hours = weeklyHours[weekdayOf(dateStr)];
    if (!hours) continue;

    addSlotsWithin(
      zonedTimeToUtc(dateStr, hours.start, timeZone).getTime(),
      zonedTimeToUtc(dateStr, hours.end, timeZone).getTime()
    );
  }

  return slots;
}
