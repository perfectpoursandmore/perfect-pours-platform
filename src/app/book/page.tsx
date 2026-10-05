import { BookingFlow } from "@/components/BookingFlow";

export const metadata = { title: "Schedule a Call — Perfect Pours & More" };

export default function BookPage() {
  return (
    <main style={{ padding: "2rem 1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Schedule a call</h1>
      <p style={{ color: "var(--color-muted)", maxWidth: 560 }}>
        Pick a day and time that works for a quick call to go over your event. After
        selecting a time, we&apos;ll ask for a few details so we can come prepared.
      </p>
      <BookingFlow />
    </main>
  );
}
