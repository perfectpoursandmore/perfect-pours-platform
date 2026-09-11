import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { confirmMergeClients } from "../../actions";

export default async function MergeClientPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { into?: string };
}) {
  const intoId = searchParams.into;
  if (!intoId) redirect(`/admin/clients/${params.id}`);

  const supabase = createClient();

  const [{ data: remove }, { data: keep }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", params.id).single(),
    supabase.from("clients").select("*").eq("id", intoId).single(),
  ]);

  if (!remove || !keep) notFound();

  const [{ count: eventCount }, { count: noteCount }] = await Promise.all([
    supabase.from("events").select("id", { count: "exact", head: true }).eq("client_id", params.id),
    supabase.from("client_notes").select("id", { count: "exact", head: true }).eq("client_id", params.id),
  ]);

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 640 }}>
      <div>
        <a href={`/admin/clients/${params.id}`} style={{ fontSize: "0.9rem" }}>
          ← Cancel
        </a>
        <h1 style={{ margin: "0.5rem 0 0" }}>Merge clients</h1>
      </div>

      <div className="card" style={{ display: "grid", gap: "1rem" }}>
        <p style={{ margin: 0 }}>
          <strong>
            {remove.first_name} {remove.last_name}
          </strong>{" "}
          will be merged into{" "}
          <strong>
            {keep.first_name} {keep.last_name}
          </strong>
          . Here&apos;s exactly what that means:
        </p>

        <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gap: "0.4rem" }}>
          <li>
            {eventCount ?? 0} event{eventCount === 1 ? "" : "s"} will move to{" "}
            {keep.first_name} {keep.last_name}
          </li>
          <li>
            {noteCount ?? 0} note{noteCount === 1 ? "" : "s"} will move over too
          </li>
          <li>
            Any phone, email, or other contact info {keep.first_name} is missing will be filled
            in from {remove.first_name}&apos;s record — nothing {keep.first_name} already has
            gets overwritten
          </li>
          <li>
            <strong>
              {remove.first_name} {remove.last_name}&apos;s record will then be deleted
            </strong>{" "}
            — this can&apos;t be undone
          </li>
        </ul>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", fontSize: "0.9rem" }}>
          <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.75rem" }}>
            <div style={{ color: "var(--color-muted)", marginBottom: "0.25rem" }}>Being removed</div>
            <div>
              {remove.first_name} {remove.last_name}
            </div>
            <div style={{ color: "var(--color-muted)" }}>{remove.email || "no email"}</div>
            <div style={{ color: "var(--color-muted)" }}>{remove.phone || "no phone"}</div>
          </div>
          <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.75rem" }}>
            <div style={{ color: "var(--color-muted)", marginBottom: "0.25rem" }}>Staying (the real record)</div>
            <div>
              {keep.first_name} {keep.last_name}
            </div>
            <div style={{ color: "var(--color-muted)" }}>{keep.email || "no email"}</div>
            <div style={{ color: "var(--color-muted)" }}>{keep.phone || "no phone"}</div>
          </div>
        </div>

        <form action={confirmMergeClients} style={{ display: "flex", gap: "0.75rem" }}>
          <input type="hidden" name="mergeId" value={remove.id} />
          <input type="hidden" name="keepId" value={keep.id} />
          <button type="submit" className="button">
            Yes, merge them
          </button>
          <a
            href={`/admin/clients/${params.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0 1rem",
              color: "inherit",
              textDecoration: "none",
            }}
          >
            Cancel
          </a>
        </form>
      </div>
    </div>
  );
}
