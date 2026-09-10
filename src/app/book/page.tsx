import { BookingFlow } from "@/components/BookingFlow";

export const metadata = { title: "Schedule a Consultation — Perfect Pours & More" };

export default function BookPage() {
  return (
    <main style={{ padding: "2rem 1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Schedule a Consultation</h1>
      <p style={{ color: "var(--color-muted)", maxWidth: 560 }}>
        Tell us a bit about your event and pick a time that works for you — we&apos;ll
        take it from there.
      </p>
      <BookingFlow />
    </main>
  );
}
