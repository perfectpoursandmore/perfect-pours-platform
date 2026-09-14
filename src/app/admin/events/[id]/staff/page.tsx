import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/labels";
import { assignStaffToEvent, removeEventStaffAssignment, upsertEventStaffPayout } from "../../actions";

const ROLE_OPTIONS = ["bartender", "server", "barback"];

type PayoutRow = {
  event_staff_id: string;
  hours: number | null;
  pay_rate: number | null;
  expected_pay: number | null;
  payout_status: string;
  paid_at: string | null;
  payment_method: string | null;
  payment_note: string | null;
};

export default async function EventStaffPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: assignments } = await supabase
    .from("event_staff")
    .select("id, role, is_open, arrival_time, staff_id, staff:staff_id(first_name, last_name, staff_details(pay_rate))")
    .eq("event_id", params.id)
    .order("role");

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: payouts } = assignmentIds.length
    ? await supabase.from("event_staff_payouts").select("*").in("event_staff_id", assignmentIds)
    : { data: [] };
  const payoutByAssignment = new Map<string, PayoutRow>(
    ((payouts ?? []) as PayoutRow[]).map((p) => [p.event_staff_id, p])
  );

  const { data: activeStaff } = await supabase
    .from("staff")
    .select("id, first_name, last_name")
    .eq("active", true)
    .order("first_name");

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Assign staff</h2>
        <form
          action={assignStaffToEvent}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}
        >
          <input type="hidden" name="eventId" value={params.id} />
          <div>
            <label htmlFor="staffId">Person</label>
            <select
              id="staffId"
              name="staffId"
              defaultValue=""
              style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
            >
              <option value="">— Open position (unfilled) —</option>
              {(activeStaff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="role">Role</label>
            <select
              id="role"
              name="role"
              defaultValue=""
              required
              style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
            >
              <option value="" disabled>
                — choose a role —
              </option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role[0].toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="button">
            Add
          </button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Assigned &amp; payout</h2>
        {assignments && assignments.length > 0 ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            {assignments.map((a) => {
              const staffPerson = Array.isArray(a.staff) ? a.staff[0] : a.staff;
              const staffDetails = staffPerson
                ? Array.isArray(staffPerson.staff_details)
                  ? staffPerson.staff_details[0]
                  : staffPerson.staff_details
                : null;
              const payout = payoutByAssignment.get(a.id);
              const defaultRate = payout?.pay_rate ?? staffDetails?.pay_rate ?? "";

              return (
                <div key={a.id} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span>
                      <strong>
                        {a.is_open ? (
                          <em style={{ color: "var(--color-muted)", fontStyle: "normal" }}>Open</em>
                        ) : staffPerson ? (
                          `${staffPerson.first_name} ${staffPerson.last_name}`
                        ) : (
                          "—"
                        )}
                      </strong>{" "}
                      — {a.role}
                    </span>
                    <form action={removeEventStaffAssignment}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="eventId" value={params.id} />
                      <button
                        type="submit"
                        style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer" }}
                      >
                        Remove
                      </button>
                    </form>
                  </div>

                  {!a.is_open && staffPerson && (
                    <form
                      action={upsertEventStaffPayout}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                        gap: "0.6rem",
                        alignItems: "end",
                        fontSize: "0.9rem",
                      }}
                    >
                      <input type="hidden" name="eventStaffId" value={a.id} />
                      <input type="hidden" name="eventId" value={params.id} />
                      <div>
                        <label htmlFor={`hours-${a.id}`}>Hours</label>
                        <input
                          id={`hours-${a.id}`}
                          name="hours"
                          type="number"
                          step="0.25"
                          defaultValue={payout?.hours ?? ""}
                        />
                      </div>
                      <div>
                        <label htmlFor={`rate-${a.id}`}>Pay rate ($/hr)</label>
                        <input id={`rate-${a.id}`} name="payRate" type="number" step="0.01" defaultValue={defaultRate} />
                      </div>
                      <div>
                        <label>Expected pay</label>
                        <div style={{ padding: "0.55rem 0" }}>
                          {payout?.expected_pay ? formatMoney(payout.expected_pay) : "—"}
                        </div>
                      </div>
                      <div>
                        <label htmlFor={`status-${a.id}`}>Status</label>
                        <select
                          id={`status-${a.id}`}
                          name="payoutStatus"
                          defaultValue={payout?.payout_status ?? "unpaid"}
                          style={{ width: "100%", padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--color-border)" }}
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="paid">Paid</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`method-${a.id}`}>Payment method</label>
                        <input
                          id={`method-${a.id}`}
                          name="paymentMethod"
                          placeholder="Zelle, cash, check..."
                          defaultValue={payout?.payment_method ?? ""}
                        />
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label htmlFor={`note-${a.id}`}>Note</label>
                        <input
                          id={`note-${a.id}`}
                          name="paymentNote"
                          placeholder='e.g. "Paid September 20 via Zelle"'
                          defaultValue={payout?.payment_note ?? ""}
                        />
                      </div>
                      <button type="submit" className="button">
                        Save
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: "var(--color-muted)", margin: 0 }}>No one assigned yet.</p>
        )}
      </div>
    </div>
  );
}
