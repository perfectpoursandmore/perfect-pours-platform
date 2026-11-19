"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveExpense, tagExpense } from "./actions";

export type PickableEvent = { id: string; name: string; event_date: string };

const toCents = (v: string) => Math.round((Number(v.replace(/[$,\s]/g, "")) || 0) * 100);
const dollars = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

function daysApart(a: string, b: string) {
  return Math.abs(new Date(a + "T12:00:00").getTime() - new Date(b + "T12:00:00").getTime()) / 86400000;
}

function shortDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Phone photos are several MB; shrink to a readable size before sending. */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * "Which events was it for?" Faith types only what she used for each event;
 * whatever is left goes to Stock. Events near the purchase date show first
 * (shopping is usually for that weekend); everything else is one tap away.
 */
function EventAmounts({
  events,
  spentOn,
  totalCents,
  isReturn,
  preselectEventId,
  amounts,
  setAmounts,
}: {
  events: PickableEvent[];
  spentOn: string;
  totalCents: number;
  isReturn: boolean;
  preselectEventId?: string;
  amounts: Record<string, string>;
  setAmounts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const [showAll, setShowAll] = useState(false);
  const givenCents = Object.values(amounts).reduce((s, v) => s + toCents(v), 0);
  const leftCents = totalCents - givenCents;

  const visible = useMemo(() => {
    if (showAll) return events;
    return events.filter(
      (e) => e.id === preselectEventId || daysApart(e.event_date, spentOn) <= 10 || toCents(amounts[e.id] ?? "") > 0
    );
  }, [events, showAll, spentOn, preselectEventId, amounts]);

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <div>
        <strong>{isReturn ? "Which events get the money back?" : "Which events was it for?"}</strong>
        <div className="muted small">Only what you used for each. Whatever&apos;s left goes to Stock.</div>
      </div>

      {visible.length === 0 && <p className="muted small" style={{ margin: 0 }}>No events near this date.</p>}

      {visible.map((ev) => (
        <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px auto", gap: "0.5rem", alignItems: "center" }}>
          <div>
            <div>{ev.name}</div>
            <div className="muted small">{shortDate(ev.event_date)}</div>
          </div>
          <input
            name={`split_${ev.id}`}
            inputMode="decimal"
            placeholder="$0"
            aria-label={`Amount for ${ev.name}`}
            value={amounts[ev.id] ?? ""}
            onChange={(e) => setAmounts((a) => ({ ...a, [ev.id]: e.target.value }))}
          />
          <button
            type="button"
            className="link-button"
            disabled={leftCents <= 0}
            onClick={() =>
              setAmounts((a) => ({ ...a, [ev.id]: ((toCents(a[ev.id] ?? "") + Math.max(leftCents, 0)) / 100).toFixed(2) }))
            }
          >
            + the rest
          </button>
        </div>
      ))}

      {/* Amounts typed for events that are now hidden still get sent. */}
      {events
        .filter((e) => !visible.includes(e) && amounts[e.id])
        .map((e) => (
          <input key={e.id} type="hidden" name={`split_${e.id}`} value={amounts[e.id]} />
        ))}

      {!showAll && events.length > visible.length && (
        <button type="button" className="link-button" style={{ justifySelf: "start" }} onClick={() => setShowAll(true)}>
          Show other events
        </button>
      )}

      {totalCents > 0 && (
        <div className="notice small" style={{ margin: 0 }}>
          {leftCents < 0 ? (
            <span style={{ color: "var(--color-danger)" }}>That&apos;s {dollars(-leftCents)} more than the total.</span>
          ) : leftCents === 0 ? (
            "All of it is given to events."
          ) : (
            <>
              {dollars(leftCents)} goes to <strong>Stock</strong>: extras for later, and things you reuse like vases and
              candles.
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** A cash purchase QuickBooks doesn't know about: photo (optional) + total. */
export function ReceiptForm({
  events,
  preselectEventId,
  today,
}: {
  events: PickableEvent[];
  preselectEventId?: string;
  today: string;
}) {
  const router = useRouter();
  const [spentOn, setSpentOn] = useState(today);
  const [total, setTotal] = useState("");
  const [isReturn, setIsReturn] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCents = toCents(total);
  const leftCents = totalCents - Object.values(amounts).reduce((s, v) => s + toCents(v), 0);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!totalCents) return setError("Type the total from the receipt.");
    if (leftCents < 0) return setError("The event amounts add up to more than the total.");
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const small = await shrinkPhoto(photo);
      form.set("photo", small, small === photo ? photo.name : "receipt.jpg");
    }
    const result = await saveExpense(form);
    if (result.error) {
      setSaving(false);
      return setError(result.error);
    }
    router.push(preselectEventId ? `/admin/events/${preselectEventId}/money` : "/admin/money?saved=1");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ display: "grid", gap: "1.1rem" }}>
      <div>
        <label htmlFor="photo">Photo of the receipt (optional)</label>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Receipt" style={{ marginTop: "0.5rem", maxWidth: 160, maxHeight: 200, borderRadius: 6, border: "1px solid var(--color-border)" }} />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div>
          <label htmlFor="total">Total</label>
          <input id="total" name="total" inputMode="decimal" placeholder="$0.00" value={total} onChange={(e) => setTotal(e.target.value)} required autoFocus />
        </div>
        <div>
          <label htmlFor="spentOn">Date</label>
          <input id="spentOn" name="spentOn" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </div>
      </div>

      <div>
        <label htmlFor="store">Store (optional)</label>
        <input id="store" name="store" placeholder="Farmers market, cash at the liquor store..." />
      </div>

      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontWeight: 400 }}>
        <input type="checkbox" name="isReturn" checked={isReturn} onChange={(e) => setIsReturn(e.target.checked)} />
        This is a return or refund (money back to me)
      </label>

      <EventAmounts
        events={events}
        spentOn={spentOn}
        totalCents={totalCents}
        isReturn={isReturn}
        preselectEventId={preselectEventId}
        amounts={amounts}
        setAmounts={setAmounts}
      />

      <details>
        <summary className="muted small" style={{ cursor: "pointer" }}>Add a note</summary>
        <input name="note" placeholder="What was it?" style={{ marginTop: "0.5rem" }} />
      </details>

      {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}

      <button type="submit" className="button" disabled={saving} style={{ justifySelf: "start" }}>
        {saving ? "Saving..." : isReturn ? "Save return" : "Save receipt"}
      </button>
    </form>
  );
}

/** Tag an expense that's already in the app (usually from QuickBooks) to events. */
export function TagForm({
  expense,
  events,
  initialAmounts,
  back,
}: {
  expense: { id: string; spent_on: string; total: number; is_return: boolean };
  events: PickableEvent[];
  initialAmounts: Record<string, string>;
  back: string;
}) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>(initialAmounts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalCents = Math.round(expense.total * 100);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name === "allStock") form.set("allStock", "1");
    const result = await tagExpense(form);
    if (result.error) {
      setSaving(false);
      return setError(result.error);
    }
    router.push(back);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ display: "grid", gap: "1.1rem" }}>
      <input type="hidden" name="id" value={expense.id} />
      <EventAmounts
        events={events}
        spentOn={expense.spent_on}
        totalCents={totalCents}
        isReturn={expense.is_return}
        amounts={amounts}
        setAmounts={setAmounts}
      />
      {error && <p style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="submit" className="button" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button type="submit" name="allStock" className="button-secondary" disabled={saving}>
          Not for an event (all Stock)
        </button>
      </div>
    </form>
  );
}
