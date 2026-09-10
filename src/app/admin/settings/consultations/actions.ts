"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";

const DAYS = [0, 1, 2, 3, 4, 5, 6];

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
}

export async function saveConsultationSettings(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  const weeklyHours: Record<number, { start: string; end: string } | null> = {};
  for (const day of DAYS) {
    const enabled = formData.get(`day-${day}-enabled`) === "on";
    const start = String(formData.get(`day-${day}-start`) ?? "");
    const end = String(formData.get(`day-${day}-end`) ?? "");
    weeklyHours[day] = enabled && start && end ? { start, end } : null;
  }

  await supabase
    .from("consultation_settings")
    .update({
      weekly_hours: weeklyHours,
      appointment_length_minutes: Number(formData.get("appointmentLengthMinutes")),
      buffer_before_minutes: Number(formData.get("bufferBeforeMinutes")),
      buffer_after_minutes: Number(formData.get("bufferAfterMinutes")),
      min_notice_hours: Number(formData.get("minNoticeHours")),
      max_advance_days: Number(formData.get("maxAdvanceDays")),
      vacation_mode: formData.get("vacationMode") === "on",
    })
    .eq("id", true);

  revalidatePath("/admin/settings/consultations");
}

export async function addBlockedDate(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  const date = String(formData.get("date") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!date) return;

  await supabase.from("consultation_blocked_dates").insert({
    blocked_date: date,
    reason: reason || null,
  });

  revalidatePath("/admin/settings/consultations");
}

export async function removeBlockedDate(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();

  const date = String(formData.get("date") ?? "");
  if (!date) return;

  await supabase.from("consultation_blocked_dates").delete().eq("blocked_date", date);

  revalidatePath("/admin/settings/consultations");
}
