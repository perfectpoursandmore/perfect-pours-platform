"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { zonedTimeToIso } from "@/lib/calendar-dates";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Faith's spreadsheet writes dates like "Friday April 24th" — a weekday, a
 * month name, and a day, with no year at all (the year lives in the sheet
 * name instead, e.g. "2026 Events"). This turns that into "YYYY-MM-DD" so
 * it can be matched against events.event_date directly.
 */
function parseSheetDate(raw: unknown, fallbackYear: number): string | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, "0");
    const d = String(raw.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const str = String(raw ?? "").trim();
  if (!str) return null;

  const noWeekday = str.replace(/^(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?,?\s+/i, "");
  const monthMatch = noWeekday.match(/[A-Za-z]{3,}/);
  const dayMatch = noWeekday.match(/(\d{1,2})(st|nd|rd|th)?/i);
  const yearMatch = noWeekday.match(/\d{4}/);
  if (!monthMatch || !dayMatch) return null;

  const month = MONTHS[monthMatch[0].slice(0, 3).toLowerCase()];
  if (!month) return null;

  const day = Number(dayMatch[1]);
  if (!day || day < 1 || day > 31) return null;

  const year = yearMatch ? Number(yearMatch[0]) : fallbackYear;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * "5:30 PM" -> "17:30". Returns needsReview when the cell has something we
 * shouldn't guess at (e.g. "3:30/4:30 PM", two possible times in one cell) —
 * those get left blank for Faith to fill in by hand in the review table
 * rather than silently picking one.
 */
function parseTimeCell(raw: unknown): { value: string | null; needsReview: boolean } {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const h = String(raw.getUTCHours()).padStart(2, "0");
    const m = String(raw.getUTCMinutes()).padStart(2, "0");
    return { value: `${h}:${m}`, needsReview: false };
  }

  const str = String(raw ?? "").trim();
  if (!str) return { value: null, needsReview: false };

  const timeMatches = str.match(/\d{1,2}:\d{2}/g);
  if (!timeMatches || timeMatches.length !== 1) {
    return { value: null, needsReview: true };
  }

  const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (!m) return { value: null, needsReview: true };

  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  if (!ampm && (hour > 23 || hour < 0)) return { value: null, needsReview: true };

  return { value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, needsReview: false };
}

function findColumn(header: string[], predicate: (h: string) => boolean): number {
  return header.findIndex(predicate);
}

function cell(row: unknown[], index: number): unknown {
  return index >= 0 ? row[index] : undefined;
}

export type ParsedRowCandidate = { id: string; label: string };

export type ParsedRow = {
  sheetName: string;
  rowNumber: number;
  dateRaw: string;
  clientNameRaw: string;
  staffTimeRaw: string;
  endTimeRaw: string;
  guestArrivalRaw: string;
  eventDateIso: string | null;
  staffArrivalTime: string | null;
  guestArrivalTime: string | null;
  staffEndTime: string | null;
  timeNeedsReview: boolean;
  candidates: ParsedRowCandidate[];
  selectedEventId: string | null;
};

export async function parseStaffTimesFile(formData: FormData): Promise<{ rows: ParsedRow[]; error?: string }> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { rows: [], error: "Choose a spreadsheet file first." };
  }

  let workbook: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return { rows: [], error: "Couldn't read that file — is it a valid .xlsx spreadsheet?" };
  }

  const supabase = createClient();
  const { data: eventsData } = await supabase
    .from("events")
    .select("id, name, event_date, clients(first_name, last_name)")
    .order("event_date");

  const eventsByDate = new Map<string, { id: string; label: string; clientName: string }[]>();
  for (const e of eventsData ?? []) {
    const client = Array.isArray(e.clients) ? e.clients[0] : e.clients;
    const clientName = client ? `${client.first_name} ${client.last_name}` : "";
    const label = `${e.name}${clientName ? ` — ${clientName}` : ""} (${e.event_date})`;
    const list = eventsByDate.get(e.event_date) ?? [];
    list.push({ id: e.id, label, clientName });
    eventsByDate.set(e.event_date, list);
  }

  const rows: ParsedRow[] = [];
  const currentYear = new Date().getFullYear();

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: "" });
    if (data.length === 0) continue;

    const header = (data[0] as unknown[]).map((h) => String(h ?? "").trim().toLowerCase());
    const dateCol = findColumn(header, (h) => h === "date");
    if (dateCol === -1) continue; // not a sheet we know how to read — skip it quietly

    const clientCol = findColumn(header, (h) => h.includes("client"));
    const staffTimeCol = findColumn(header, (h) => h.includes("staff") && h.includes("time"));
    const endTimeCol = findColumn(header, (h) => h.includes("end"));
    const guestArrivalCol = findColumn(
      header,
      (h) => (h.includes("guest") || h.includes("start")) && !h.includes("staff")
    );

    const sheetYearMatch = sheetName.match(/\d{4}/);
    const fallbackYear = sheetYearMatch ? Number(sheetYearMatch[0]) : currentYear;

    for (let i = 1; i < data.length; i++) {
      const row = data[i] as unknown[];
      const dateRaw = String(cell(row, dateCol) ?? "").trim();
      const clientNameRaw = String(cell(row, clientCol) ?? "").trim();
      const staffTimeRaw = String(cell(row, staffTimeCol) ?? "").trim();
      const endTimeRaw = String(cell(row, endTimeCol) ?? "").trim();
      const guestArrivalRaw = String(cell(row, guestArrivalCol) ?? "").trim();

      if (!dateRaw && !clientNameRaw && !staffTimeRaw && !endTimeRaw && !guestArrivalRaw) continue;

      const eventDateIso = parseSheetDate(dateRaw, fallbackYear);
      const staffArrival = parseTimeCell(staffTimeRaw);
      const staffEnd = parseTimeCell(endTimeRaw);
      const guestArrival = parseTimeCell(guestArrivalRaw);

      const candidates = eventDateIso ? eventsByDate.get(eventDateIso) ?? [] : [];
      let selectedEventId: string | null = null;
      if (candidates.length === 1) {
        selectedEventId = candidates[0].id;
      } else if (candidates.length > 1 && clientNameRaw) {
        const needle = clientNameRaw.toLowerCase();
        const filtered = candidates.filter((c) => c.clientName.toLowerCase().includes(needle));
        if (filtered.length === 1) selectedEventId = filtered[0].id;
      }

      rows.push({
        sheetName,
        rowNumber: i + 1,
        dateRaw,
        clientNameRaw,
        staffTimeRaw,
        endTimeRaw,
        guestArrivalRaw,
        eventDateIso,
        staffArrivalTime: staffArrival.value,
        guestArrivalTime: guestArrival.value,
        staffEndTime: staffEnd.value,
        timeNeedsReview: staffArrival.needsReview || staffEnd.needsReview || guestArrival.needsReview,
        candidates: candidates.map((c) => ({ id: c.id, label: c.label })),
        selectedEventId,
      });
    }
  }

  return { rows };
}

export type CommitRow = {
  eventId: string;
  eventDateIso: string;
  staffArrivalTime: string | null;
  guestArrivalTime: string | null;
  staffEndTime: string | null;
};

export async function commitStaffTimesImport(rows: CommitRow[]): Promise<{ updated: number; errors: string[] }> {
  await requireAdmin();
  const supabase = createClient();

  let updated = 0;
  const errors: string[] = [];

  for (const r of rows) {
    const payload: Record<string, string> = {};
    if (r.staffArrivalTime) {
      const iso = zonedTimeToIso(r.eventDateIso, r.staffArrivalTime);
      if (iso) payload.staff_arrival_time = iso;
    }
    if (r.guestArrivalTime) {
      const iso = zonedTimeToIso(r.eventDateIso, r.guestArrivalTime);
      if (iso) payload.guest_arrival_time = iso;
    }
    if (r.staffEndTime) {
      const iso = zonedTimeToIso(r.eventDateIso, r.staffEndTime);
      if (iso) payload.staff_end_time = iso;
    }
    if (Object.keys(payload).length === 0) continue;

    const { error } = await supabase.from("events").update(payload).eq("id", r.eventId);
    if (error) {
      errors.push(`${r.eventId}: ${error.message}`);
    } else {
      updated++;
    }
  }

  revalidatePath("/admin/events");
  revalidatePath("/admin/calendar");
  revalidatePath("/staff");

  return { updated, errors };
}
