"use client";

import { useEffect, useState } from "react";

type Home = { address_line: string | null; city: string | null; state: string | null; zip: string | null };

/**
 * Venue + address on "Add a booking". Picking a client fills in their home
 * address (most clients host at home); Faith just changes it when they're
 * hosting somewhere else.
 */
export function EventAddressFields({ initialClientId, homes }: { initialClientId: string; homes: Record<string, Home> }) {
  const empty = { venueName: "", addressLine: "", city: "", state: "", zip: "" };
  const fromHome = (id: string) => {
    const h = homes[id];
    return h ? { venueName: "", addressLine: h.address_line ?? "", city: h.city ?? "", state: h.state ?? "", zip: h.zip ?? "" } : empty;
  };
  const [fields, setFields] = useState(fromHome(initialClientId));
  const [filledFrom, setFilledFrom] = useState(homes[initialClientId] ? initialClientId : "");

  // Listen to the Client dropdown above (it lives in the server-rendered form).
  useEffect(() => {
    const select = document.getElementById("clientId") as HTMLSelectElement | null;
    if (!select) return;
    const onChange = () => {
      const id = select.value;
      setFields(fromHome(id));
      setFilledFrom(homes[id] ? id : "");
    };
    select.addEventListener("change", onChange);
    return () => select.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setFields({ ...fields, [k]: e.target.value });

  return (
    <>
      {filledFrom && (
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-muted)" }}>
          Filled in with their home address. Change it if they&apos;re hosting somewhere else.
        </p>
      )}
      <div>
        <label htmlFor="addressLine">Address</label>
        <input id="addressLine" name="addressLine" value={fields.addressLine} onChange={set("addressLine")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
        <div>
          <label htmlFor="city">City</label>
          <input id="city" name="city" value={fields.city} onChange={set("city")} />
        </div>
        <div>
          <label htmlFor="state">State</label>
          <input id="state" name="state" value={fields.state} onChange={set("state")} />
        </div>
        <div>
          <label htmlFor="zip">ZIP</label>
          <input id="zip" name="zip" value={fields.zip} onChange={set("zip")} />
        </div>
      </div>
    </>
  );
}
