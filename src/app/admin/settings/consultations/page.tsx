import { createClient } from "@/lib/supabase/server";
import { saveConsultationSettings, addBlockedDate, removeBlockedDate } from "./actions";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function ConsultationSettingsPage() {
  const supabase = createClient();

  const { data: settings } = await supabase
    .from("consultation_settings")
    .select("*")
    .eq("id", true)
    .single();

  const { data: blockedDates } = await supabase
    .from("consultation_blocked_dates")
    .select("blocked_date, reason")
    .order("blocked_date");

  const weeklyHours = settings?.weekly_hours ?? {};

  return (
    <div style={{ display: "grid", gap: "2rem", maxWidth: 640 }}>
      <div>
        <h1 style={{ margin: 0 }}>Consultation availability</h1>
        <p style={{ color: "var(--color-muted)" }}>
          Controls what prospective clients can book on the consultation page. Google
          Calendar conflicts are checked on top of these hours automatically.
        </p>
      </div>

      <form action={saveConsultationSettings} className="card" style={{ display: "grid", gap: "1.25rem" }}>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="vacationMode" defaultChecked={settings?.vacation_mode} />
            Vacation mode (blocks every consultation slot until turned off)
          </label>
        </div>

        <div style={{ display: "grid", gap: "0.6rem" }}>
          {DAY_LABELS.map((label, day) => {
            const hours = weeklyHours[day];
            return (
              <div
                key={day}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 140px 100px 100px",
                  gap: "0.75rem",
                  alignItems: "center",
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <input type="checkbox" name={`day-${day}-enabled`} defaultChecked={Boolean(hours)} />
                  {label}
                </label>
                <input type="time" name={`day-${day}-start`} defaultValue={hours?.start ?? "10:00"} />
                <input type="time" name={`day-${day}-end`} defaultValue={hours?.end ?? "16:00"} />
              </div>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label htmlFor="appointmentLengthMinutes">Consultation length (minutes)</label>
            <input
              id="appointmentLengthMinutes"
              name="appointmentLengthMinutes"
              type="number"
              min={5}
              defaultValue={settings?.appointment_length_minutes ?? 30}
            />
          </div>
          <div>
            <label htmlFor="minNoticeHours">Minimum notice (hours)</label>
            <input
              id="minNoticeHours"
              name="minNoticeHours"
              type="number"
              min={0}
              defaultValue={settings?.min_notice_hours ?? 12}
            />
          </div>
          <div>
            <label htmlFor="bufferBeforeMinutes">Buffer before (minutes)</label>
            <input
              id="bufferBeforeMinutes"
              name="bufferBeforeMinutes"
              type="number"
              min={0}
              defaultValue={settings?.buffer_before_minutes ?? 0}
            />
          </div>
          <div>
            <label htmlFor="bufferAfterMinutes">Buffer after (minutes)</label>
            <input
              id="bufferAfterMinutes"
              name="bufferAfterMinutes"
              type="number"
              min={0}
              defaultValue={settings?.buffer_after_minutes ?? 15}
            />
          </div>
          <div>
            <label htmlFor="maxAdvanceDays">Maximum days in advance</label>
            <input
              id="maxAdvanceDays"
              name="maxAdvanceDays"
              type="number"
              min={1}
              defaultValue={settings?.max_advance_days ?? 60}
            />
          </div>
        </div>

        <button type="submit" className="button" style={{ justifySelf: "start" }}>
          Save availability
        </button>
      </form>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Blocked dates</h2>
        <p style={{ color: "var(--color-muted)", marginTop: 0 }}>
          Specific days off — a holiday, a one-off day out of the office — without turning
          on vacation mode.
        </p>

        <form action={addBlockedDate} style={{ display: "flex", gap: "0.75rem", alignItems: "end", marginBottom: "1rem" }}>
          <div>
            <label htmlFor="date">Date</label>
            <input id="date" name="date" type="date" required />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="reason">Reason (optional)</label>
            <input id="reason" name="reason" placeholder="e.g. Thanksgiving" />
          </div>
          <button type="submit" className="button">
            Add
          </button>
        </form>

        {blockedDates && blockedDates.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
            {blockedDates.map((b) => (
              <li
                key={b.blocked_date}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span>
                  {b.blocked_date}
                  {b.reason ? ` — ${b.reason}` : ""}
                </span>
                <form action={removeBlockedDate}>
                  <input type="hidden" name="date" value={b.blocked_date} />
                  <button
                    type="submit"
                    style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer" }}
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--color-muted)", margin: 0 }}>No blocked dates yet.</p>
        )}
      </div>
    </div>
  );
}
