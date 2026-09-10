// Human-readable labels for the enum-ish values stored in the database.
// Keeping these in one place means the booking form, admin screens, and
// dashboard all describe the same status the same way.

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new_inquiry: "New Inquiry",
  consultation_scheduled: "Consultation Scheduled",
  consultation_completed: "Consultation Completed",
  quote_needed: "Quote Needed",
  proposal_sent: "Proposal Sent",
  awaiting_decision: "Awaiting Decision",
  booked: "Booked",
  lost: "Lost / Did Not Book",
  completed_event: "Completed Event",
  archived: "Archived",
};

export const LEAD_STATUS_ORDER = Object.keys(LEAD_STATUS_LABELS);

export const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Wedding",
  birthday: "Birthday",
  bridal_shower: "Bridal Shower",
  baby_shower: "Baby Shower",
  corporate: "Corporate Event",
  holiday_party: "Holiday Party",
  graduation: "Graduation",
  engagement_party: "Engagement Party",
  anniversary: "Anniversary",
  other: "Other",
};

export const EVENT_STATUS_LABELS: Record<string, string> = {
  inquiry: "Inquiry",
  booked: "Booked",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PRICING_TYPE_LABELS: Record<string, string> = {
  flat: "Flat price",
  hourly: "Per hour",
  per_person: "Per person",
  per_item: "Per item",
  custom: "Custom",
};

export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatDateTime(iso: string | null, timeZone = "America/New_York"): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  // Plain "YYYY-MM-DD" date columns — format without a timezone conversion
  // so the calendar date shown always matches what's stored.
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(year, month - 1, day)
  );
}
