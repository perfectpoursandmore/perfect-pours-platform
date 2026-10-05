"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { DISHWARE, EXTRA_HELP, SERVICES, SERVICE_STYLES, type Option } from "@/lib/event-details";

const EVENT_TYPES: Option[] = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "bridal_shower", label: "Bridal shower" },
  { value: "baby_shower", label: "Baby shower" },
  { value: "corporate", label: "Corporate event" },
  { value: "holiday_party", label: "Holiday party" },
  { value: "graduation", label: "Graduation" },
  { value: "engagement_party", label: "Engagement party" },
  { value: "anniversary", label: "Anniversary" },
  { value: "other", label: "Other" },
];

const HOW_HEARD_OPTIONS = [
  "Friend/Family",
  "Saw us at an event",
  "Google",
  "Instagram",
  "Facebook",
  "TikTok",
  "The Knot / WeddingWire",
  "Referred by another vendor (venue, planner, etc.)",
  "I've booked with you before",
  "Other",
];

export function InquiryForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      eventType: fd.get("eventType"),
      eventDate: fd.get("eventDate"),
      venueName: fd.get("venueName"),
      addressLine: fd.get("addressLine"),
      city: fd.get("city"),
      state: fd.get("state"),
      zip: fd.get("zip"),
      guestCount: fd.get("guestCount"),
      services: fd.getAll("services"),
      serviceStyle: fd.get("serviceStyle"),
      dishware: fd.get("dishware"),
      extraHelp: fd.getAll("extraHelp"),
      howHeard: fd.get("howHeard"),
      message: fd.get("message"),
      company: fd.get("company"),
    };

    if (payload.services.length === 0) {
      setError("Please check at least one service you're interested in.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/inquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setDone(String(payload.firstName ?? ""));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (done !== null) {
    return (
      <div className="card" style={{ maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>Thank you{done ? `, ${done}` : ""}!</h2>
        <p style={{ marginBottom: 0 }}>
          We&apos;ve got your event details and will email you pricing for your event within 24
          hours, or within 48 hours over the weekend. Keep an eye on your inbox (and your spam
          folder, just in case).
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 600, display: "grid", gap: "1.25rem" }}>
      {/* Honeypot: hidden from people, irresistible to spam bots. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      <Section title="About you">
        <Row>
          <Field label="First name" name="firstName" required autoComplete="given-name" />
          <Field label="Last name" name="lastName" required autoComplete="family-name" />
        </Row>
        <Field label="Email" name="email" type="email" required autoComplete="email" />
        <Field label="Phone" name="phone" type="tel" required autoComplete="tel" />
      </Section>

      <Section title="Your event">
        <Row>
          <div>
            <label htmlFor="eventType">Event type</label>
            <select id="eventType" name="eventType" required defaultValue="" style={selectStyle}>
              <option value="" disabled>
                Select one
              </option>
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <Field label="Event date" name="eventDate" type="date" required />
        </Row>
        <Field label="Estimated guest count" name="guestCount" type="number" min={1} required />
        <Field label="Venue name (if there is one)" name="venueName" />
        <Field label="Street address" name="addressLine" autoComplete="street-address" />
        <Row cols="2fr 1fr 1fr">
          <Field label="Town/City" name="city" required autoComplete="address-level2" />
          <Field label="State" name="state" defaultValue="NY" autoComplete="address-level1" />
          <Field label="ZIP" name="zip" autoComplete="postal-code" />
        </Row>
      </Section>

      <Section title="What are you interested in?" hint="Check all that apply.">
        <CheckList name="services" options={SERVICES} />
      </Section>

      <Section title="Food at your event" hint="This helps us figure out the right amount of staff for you.">
        <RadioList name="serviceStyle" options={SERVICE_STYLES} />
        <div>
          <p style={{ margin: "0.5rem 0 0.4rem", fontWeight: 600, fontSize: "0.95rem" }}>Plates and glassware</p>
          <RadioList name="dishware" options={DISHWARE} />
        </div>
        <div>
          <p style={{ margin: "0.5rem 0 0.4rem", fontWeight: 600, fontSize: "0.95rem" }}>
            Would you like help with any of these?
          </p>
          <CheckList name="extraHelp" options={EXTRA_HELP} />
        </div>
      </Section>

      <Section title="Almost done">
        <div>
          <label htmlFor="howHeard">How did you hear about us?</label>
          <select id="howHeard" name="howHeard" defaultValue="" style={selectStyle}>
            <option value="">Select one</option>
            {HOW_HEARD_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="message">Anything else we should know? (optional)</label>
          <textarea id="message" name="message" rows={4} style={textareaStyle} />
        </div>
      </Section>

      {error && <p style={{ color: "#a33", margin: 0 }}>{error}</p>}

      <button type="submit" className="button" disabled={submitting} style={{ justifySelf: "start" }}>
        {submitting ? "Sending…" : "Get my pricing"}
      </button>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: "0.85rem" }}>
      <legend style={{ fontWeight: 700, fontSize: "1.05rem", padding: 0, marginBottom: "0.25rem" }}>{title}</legend>
      {hint && <p style={{ margin: "-0.5rem 0 0", color: "var(--color-muted)", fontSize: "0.9rem" }}>{hint}</p>}
      {children}
    </fieldset>
  );
}

function Row({ children, cols = "1fr 1fr" }: { children: React.ReactNode; cols?: string }) {
  return <div style={{ display: "grid", gridTemplateColumns: cols, gap: "0.85rem" }}>{children}</div>;
}

function Field({
  label,
  name,
  ...rest
}: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} {...rest} />
    </div>
  );
}

function CheckList({ name, options }: { name: string; options: Option[] }) {
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {options.map((o) => (
        <label key={o.value} style={choiceStyle}>
          <input type="checkbox" name={name} value={o.value} style={{ width: "auto", marginTop: 3 }} />
          <span>
            {o.label}
            {o.hint && <span style={{ display: "block", color: "var(--color-muted)", fontSize: "0.85rem" }}>{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function RadioList({ name, options }: { name: string; options: Option[] }) {
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {options.map((o) => (
        <label key={o.value} style={choiceStyle}>
          <input type="radio" name={name} value={o.value} style={{ width: "auto", marginTop: 3 }} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

const choiceStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.6rem",
  fontWeight: 400,
  fontSize: "0.95rem",
  color: "var(--color-text)",
  marginBottom: 0,
  cursor: "pointer",
};

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  fontFamily: "inherit",
  fontSize: "0.95rem",
};
