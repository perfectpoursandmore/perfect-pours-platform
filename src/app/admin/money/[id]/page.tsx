import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/labels";
import { TagForm, type PickableEvent } from "../ReceiptForm";

function shiftDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Say which events an expense was for (or that it's all Stock). */
export default async function TagExpensePage({ params, searchParams }: { params: { id: string }; searchParams: { back?: string } }) {
  const supabase = createClient();
  const { data: expense } = await supabase.from("expenses").select("*, expense_splits(event_id, amount)").eq("id", params.id).single();
  if (!expense) notFound();

  const splits = (expense.expense_splits ?? []) as { event_id: string; amount: number | string }[];
  const { data: nearby } = await supabase
    .from("events")
    .select("id, name, event_date")
    .neq("status", "cancelled")
    .gte("event_date", shiftDays(expense.spent_on, -90))
    .lte("event_date", shiftDays(expense.spent_on, 90))
    .order("event_date");
  const events = (nearby ?? []) as PickableEvent[];
  const missing = splits.map((s) => s.event_id).filter((id) => !events.some((e) => e.id === id));
  if (missing.length) {
    const { data } = await supabase.from("events").select("id, name, event_date").in("id", missing);
    events.push(...((data ?? []) as PickableEvent[]));
  }

  const back = searchParams.back?.startsWith("/admin/") ? searchParams.back : "/admin/money";

  return (
    <div style={{ display: "grid", gap: "1.25rem", maxWidth: 560 }}>
      <div>
        <a href={back} className="muted small" style={{ textDecoration: "none" }}>
          ← Back
        </a>
        <h1 style={{ margin: "0.5rem 0 0" }}>
          {expense.store || "Expense"}
          {expense.is_return ? " (refund)" : ""}
        </h1>
        <p className="muted" style={{ margin: "0.2rem 0 0" }}>
          {formatDate(expense.spent_on)} · {formatMoney(Number(expense.total))}
          {expense.category ? ` · ${expense.category}` : ""}
          {expense.note ? ` · ${expense.note}` : ""}
        </p>
      </div>
      <TagForm
        expense={{ id: expense.id, spent_on: expense.spent_on, total: Number(expense.total), is_return: expense.is_return }}
        events={events}
        initialAmounts={Object.fromEntries(splits.map((s) => [s.event_id, Number(s.amount).toFixed(2)]))}
        back={back}
      />
    </div>
  );
}
