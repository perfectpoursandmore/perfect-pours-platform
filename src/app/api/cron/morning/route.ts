import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { addDays, todayDateString, zonedTimeToIso } from "@/lib/calendar-dates";
import { formatDate, formatTime } from "@/lib/labels";
import { getPreferences } from "@/lib/preferences";

// Runs every morning (vercel.json: 12:00 UTC = 7 AM Eastern in winter,
// 8 AM in summer). Two jobs, each with an on/off switch on the Today screen:
//   1. clear the to-do items Faith checked off, so the list starts fresh
//   2. email her the day: to-dos, calls, events, and texts waiting
//
// Vercel sends "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set
// in the project's environment variables; without it set, only Vercel's
// own cron caller (its user agent) is accepted.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const ua = request.headers.get("user-agent") ?? "";
  const allowed = secret ? auth === `Bearer ${secret}` : ua.startsWith("vercel-cron");
  if (!allowed) return NextResponse.json({ ok: false }, { status: 401 });

  const supabase = createAdminClient();
  const prefs = await getPreferences(supabase);
  const result: Record<string, unknown> = {};

  if (prefs.clear_done_overnight) {
    const { error } = await supabase.from("todos").delete().eq("is_done", true);
    result.cleared = !error;
  }

  const to = await adminEmail(supabase);
  if (prefs.morning_email && isEmailConfigured() && to) {
    const today = todayDateString();
    const dayStart = zonedTimeToIso(today, "00:00")!;
    const dayEnd = zonedTimeToIso(addDays(today, 1), "00:00")!;

    const [{ data: todos }, { data: calls }, { data: events }, { count: textCount }] = await Promise.all([
      supabase.from("todos").select("item").eq("is_done", false).order("created_at"),
      supabase
        .from("leads")
        .select("first_name, last_name, consultation_at")
        .gte("consultation_at", dayStart)
        .lt("consultation_at", dayEnd)
        .order("consultation_at"),
      supabase
        .from("events")
        .select("name, event_date, guest_arrival_time")
        .eq("status", "booked")
        .gte("event_date", today)
        .lte("event_date", addDays(today, 6))
        .order("event_date"),
      supabase.from("inbox_items").select("id", { count: "exact", head: true }),
    ]);

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://perfect-pours-platform.vercel.app").replace(/\/$/, "");
    const todayEvents = (events ?? []).filter((e) => e.event_date === today);
    const laterEvents = (events ?? []).filter((e) => e.event_date !== today);
    const todoCount = (todos ?? []).length;
    const callCount = (calls ?? []).length;

    const section = (title: string, rows: string[], empty: string) =>
      `<h3 style="margin:20px 0 6px;font-size:15px">${title}</h3>` +
      (rows.length
        ? `<ul style="margin:0;padding-left:18px">${rows.map((r) => `<li style="margin:3px 0">${r}</li>`).join("")}</ul>`
        : `<p style="margin:0;color:#6e6e6e">${empty}</p>`);

    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;color:#111;max-width:520px">
<p style="margin:0 0 4px">Good morning! Here's your day.</p>
${section("To do", (todos ?? []).slice(0, 15).map((t) => esc(t.item)), "Nothing on your list. 🎉")}
${section("Calls today", (calls ?? []).map((c) => `${formatTime(c.consultation_at)} · ${esc(`${c.first_name} ${c.last_name ?? ""}`.trim())}`), "No calls today.")}
${section("Events today", todayEvents.map((e) => `${e.guest_arrival_time ? `${formatTime(e.guest_arrival_time)} · ` : ""}${esc(e.name)}`), "No events today.")}
${laterEvents.length ? section("Later this week", laterEvents.map((e) => `${formatDate(e.event_date)} · ${esc(e.name)}`), "") : ""}
${textCount ? `<p style="margin:20px 0 0"><strong>${textCount} client text${textCount === 1 ? "" : "s"}</strong> waiting for you.</p>` : ""}
<p style="margin:24px 0 0"><a href="${appUrl}/admin" style="display:inline-block;background:#8a2346;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Open Today</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#6e6e6e">You can turn this email off at the bottom of the Today screen.</p>
</div>`;

    try {
      await sendEmail({
        to,
        subject: `Your day: ${todoCount} to-do${todoCount === 1 ? "" : "s"}, ${callCount} call${callCount === 1 ? "" : "s"}, ${todayEvents.length} event${todayEvents.length === 1 ? "" : "s"}`,
        html,
      });
      result.emailed = true;
    } catch (err) {
      console.error("Morning email failed:", err);
      result.emailed = false;
    }
  }

  return NextResponse.json({ ok: true, ...result });
}

/** Same inbox as the other admin notices; otherwise the admin login's email. */
async function adminEmail(supabase: ReturnType<typeof createAdminClient>): Promise<string | null> {
  if (process.env.ADMIN_NOTIFICATION_EMAIL) return process.env.ADMIN_NOTIFICATION_EMAIL;
  const { data: admin } = await supabase.from("profiles").select("id").eq("role", "admin").order("created_at").limit(1).maybeSingle();
  if (!admin) return null;
  const { data } = await supabase.auth.admin.getUserById(admin.id);
  return data?.user?.email ?? null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
