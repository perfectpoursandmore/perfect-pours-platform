import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatDate } from "@/lib/labels";
import { upsertEventStaffPayout } from "../events/actions";

type AssignmentRow = {
  id: string;
  event_id: string;
  role: string;
  staff_id: string | null;
  staff: { first_name: string; last_name: string; staff_details: { pay_rate: number | null } | { pay_rate: number | null }[] | null } | Array<{ first_name: string; last_name: string; staff_details: { pay_rate: number | null } | { pay_rate: number | null }[] | null }> | null;
  events: { name: string; event_date: string } | { name: string; event_date: string }[] | null;
};

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

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const supabase = createClient();
  const filter = searchParams.filter === "paid" || searchParams.filter === "all" ? searchParams.filter : "unpaid";

  const { data: assignments } = await supabase
    .from("event_staff")
    .select("id, event_id, role, staff_id, staff:staff_id(first_name, last_name, staff_details(pay_rate)), events(name, event_date)")
    .not("staff_id", "is", null)
    .order("event_id", { ascending: false });

  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const { data: payouts } = assignmentIds.length
    ? await supabase.from("event_staff_payouts").select("*").in("event_staff_id", assignmentIds)
    : { data: [] };
  const payoutByAssignment = new Map<string, PayoutRow>(
    ((payouts ?? []) as PayoutRow[]).map((p) => [p.event_staff_id, p])
  );

  const rows = (assignments as AssignmentRow[] | null ?? [])
    .map((a) => ({ assignment: a, payout: payoutByAssignment.get(a.id) }))
    .filter(({ payout }) => {
      const status = payout?.payout_status ?? "unpaid";
      if (filter === "all") return true;
      return status === filter;
    })
    .sort((x, y) => {
      const ex = Array.isArray(x.assignment.events) ? x.assignment.events[0] : x.assignment.events;
      const ey = Array.isArray(y.assignment.events) ? y.assignment.events[0] : y.assignment.events;
      return (ey?.event_date ?? "").localeCompare(ex?.event_date ?? "");
    });

  const totalOutstanding = rows.reduce((sum, { payout }) => {
    if ((payout?.payout_status ?? "unpaid") !== "unpaid") return sum;
    return sum + Number(payout?.expected_pay ?? 0);
  }, 0);

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0 }}>Payouts</h1>
        <p style={{ color: "var(--color-muted)" }}>Who's owed money, and who's already been paid.</p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <FilterTab href="/admin/payouts?filter=unpaid" active={filter === "unpaid"} label="Unpaid" />
          <FilterTab href="/admin/payouts?filter=paid" active={filter === "paid"} label="Paid" />
          <FilterTab href="/admin/payouts?filter=all" active={filter === "all"} label="All" />
        </div>
        {filter === "unpaid" && (
          <strong>Outstanding: {formatMoney(totalOutstanding)}</strong>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <p style={{ padding: "1.5rem", color: "var(--color-muted)", margin: 0 }}>Nothing here.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.75rem 1rem" }}>Event</th>
                <th style={{ padding: "0.75rem 1rem" }}>Staff</th>
                <th style={{ padding: "0.75rem 1rem" }}>Role</th>
                <th style={{ padding: "0.75rem 1rem" }}>Hours</th>
                <th style={{ padding: "0.75rem 1rem" }}>Rate</th>
                <th style={{ padding: "0.75rem 1rem" }}>Expected</th>
                <th style={{ padding: "0.75rem 1rem" }}>Status</th>
                <th style={{ padding: "0.75rem 1rem" }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ assignment, payout }) => {
                const staffPerson = Array.isArray(assignment.staff) ? assignment.staff[0] : assignment.staff;
                const staffDetails = staffPerson
                  ? Array.isArray(staffPerson.staff_details)
                    ? staffPerson.staff_details[0]
                    : staffPerson.staff_details
                  : null;
                const event = Array.isArray(assignment.events) ? assignment.events[0] : assignment.events;
                const defaultRate = payout?.pay_rate ?? staffDetails?.pay_rate ?? "";

                return (
                  <tr key={assignment.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <a href={`/admin/events/${assignment.event_id}/staff`}>{event?.name ?? "—"}</a>
                      <div style={{ color: "var(--color-muted)", fontSize: "0.8rem" }}>
                        {event ? formatDate(event.event_date) : ""}
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      {staffPerson ? `${staffPerson.first_name} ${staffPerson.last_name}` : "—"}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>{assignment.role}</td>
                    <td style={{ padding: "0.75rem 1rem" }} colSpan={5}>
                      <form
                        action={upsertEventStaffPayout}
                        style={{ display: "grid", gridTemplateColumns: "80px 100px 100px 130px 1fr auto", gap: "0.5rem", alignItems: "center" }}
                      >
                        <input type="hidden" name="eventStaffId" value={assignment.id} />
                        <input type="hidden" name="eventId" value={assignment.event_id} />
                        <input name="hours" type="number" step="0.25" defaultValue={payout?.hours ?? ""} placeholder="hrs" />
                        <input name="payRate" type="number" step="0.01" defaultValue={defaultRate} placeholder="rate" />
                        <span>{payout?.expected_pay ? formatMoney(payout.expected_pay) : "—"}</span>
                        <select name="payoutStatus" defaultValue={payout?.payout_status ?? "unpaid"} style={{ padding: "0.4rem", borderRadius: 6, border: "1px solid var(--color-border)" }}>
                          <option value="unpaid">Unpaid</option>
                          <option value="paid">Paid</option>
                        </select>
                        <input name="paymentMethod" placeholder="method / note" defaultValue={payout?.payment_method ?? payout?.payment_note ?? ""} />
                        <button type="submit" className="button" style={{ padding: "0.4rem 0.7rem", fontSize: "0.85rem" }}>
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilterTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <a
      href={href}
      style={{
        padding: "0.5rem 0.9rem",
        borderRadius: 8,
        border: "1px solid var(--color-border)",
        background: active ? "var(--color-accent)" : "none",
        color: active ? "#fff" : "inherit",
        textDecoration: "none",
        fontSize: "0.9rem",
      }}
    >
      {label}
    </a>
  );
}
