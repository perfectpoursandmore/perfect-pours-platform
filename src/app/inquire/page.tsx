import { InquiryForm } from "@/components/InquiryForm";

export const metadata = { title: "Tell Us About Your Event — Perfect Pours & More" };

export default function InquirePage() {
  return (
    <main style={{ padding: "2rem 1rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>Tell us about your event</h1>
      <p style={{ color: "var(--color-muted)", maxWidth: 560 }}>
        Share a few details and we&apos;ll email you personalized pricing for your event. No call
        needed until you&apos;re ready to book.
      </p>
      <InquiryForm />
    </main>
  );
}
