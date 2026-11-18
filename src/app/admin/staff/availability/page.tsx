import { redirect } from "next/navigation";

// Staff availability now lives on the Staff page. Old links (in emails
// staff replies send Faith) still land in the right spot.
export default function StaffAvailabilityRedirect({ searchParams }: { searchParams: { date?: string } }) {
  const q = searchParams.date ? `?date=${encodeURIComponent(searchParams.date)}` : "";
  redirect(`/admin/staff${q}#availability`);
}
