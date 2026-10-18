import { InquiryForm } from "@/components/InquiryForm";

export const metadata = { title: "Schedule a Call — Perfect Pours & More" };

export default function InquirePage() {
  return (
    <main style={{ padding: "2rem 1rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>Let&apos;s talk about your event</h1>
      <p style={{ color: "var(--color-muted)", maxWidth: 560 }}>
        Pick a time for a quick 15-minute phone call, then answer a few questions about your event so
        we can come prepared. After our call, we&apos;ll send you a personalized quote.
      </p>
      <InquiryForm />
    </main>
  );
}
