"use client";

import { useState, useTransition } from "react";
import { parseStaffTimesFile, commitStaffTimesImport, type ParsedRow } from "./actions";

type EditableRow = ParsedRow & {
  included: boolean;
  staffArrivalOverride: string;
  guestArrivalOverride: string;
  staffEndOverride: string;
};

export function ImportTimesForm() {
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();
  const [isCommitting, startCommitting] = useTransition();
  const [result, setResult] = useState<{ updated: number; errors: string[] } | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setResult(null);
    setRows(null);

    const formData = new FormData();
    formData.append("file", file);

    startParsing(async () => {
      const res = await parseStaffTimesFile(formData);
      if (res.error) {
        setParseError(res.error);
        return;
      }
      setRows(
        res.rows.map((r) => ({
          ...r,
          included: r.selectedEventId !== null,
          staffArrivalOverride: r.staffArrivalTime ?? "",
          guestArrivalOverride: r.guestArrivalTime ?? "",
          staffEndOverride: r.staffEndTime ?? "",
        }))
      );
    });
  }

  function updateRow(index: number, patch: Partial<EditableRow>) {
    setRows((prev) => (prev ? prev.map((r, i) => (i === index ? { ...r, ...patch } : r)) : prev));
  }

  function handleImport() {
    if (!rows) return;
    const selected = rows.filter((r) => r.included && r.selectedEventId && r.eventDateIso);

    startCommitting(async () => {
      const res = await commitStaffTimesImport(
        selected.map((r) => ({
          eventId: r.selectedEventId as string,
          eventDateIso: r.eventDateIso as string,
          staffArrivalTime: r.staffArrivalOverride || null,
          guestArrivalTime: r.guestArrivalOverride || null,
          staffEndTime: r.staffEndOverride || null,
        }))
      );
      setResult(res);
    });
  }

  const matchedCount = rows?.filter((r) => r.included && r.selectedEventId).length ?? 0;

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div className="card" style={{ display: "grid", gap: "0.75rem" }}>
        <label htmlFor="file">Spreadsheet file (.xlsx)</label>
        <input id="file" type="file" accept=".xlsx,.xls" onChange={handleFileChange} disabled={isParsing} />
        <p style={{ color: "var(--color-muted)", fontSize: "0.85rem", margin: 0 }}>
          Works with a sheet that has a &quot;Date&quot; column plus staff arrival / end (and, if your
          file has it, event start) time columns — column names just need to contain those words
          somewhere, so it&apos;s fine if they don&apos;t match exactly. Nothing is saved to any event
          until you review the matches below and click Import.
        </p>
        {isParsing && <p style={{ color: "var(--color-muted)", margin: 0 }}>Reading file…</p>}
        {parseError && <p style={{ color: "#a33", margin: 0 }}>{parseError}</p>}
      </div>

      {rows && rows.length === 0 && !isParsing && (
        <p style={{ color: "var(--color-muted)" }}>
          No rows with a recognizable &quot;Date&quot; column were found in that file.
        </p>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid var(--color-border)" }}>
                  <th style={{ padding: "0.6rem" }}>Include</th>
                  <th style={{ padding: "0.6rem" }}>Spreadsheet row</th>
                  <th style={{ padding: "0.6rem" }}>Matched event</th>
                  <th style={{ padding: "0.6rem" }}>Staff arrival</th>
                  <th style={{ padding: "0.6rem" }}>Event start (guest arrival)</th>
                  <th style={{ padding: "0.6rem" }}>Staff end</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.sheetName}-${r.rowNumber}`}
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      background: r.selectedEventId ? undefined : "#fdf1f1",
                    }}
                  >
                    <td style={{ padding: "0.6rem" }}>
                      <input
                        type="checkbox"
                        checked={r.included}
                        disabled={!r.selectedEventId}
                        onChange={(e) => updateRow(i, { included: e.target.checked })}
                      />
                    </td>
                    <td style={{ padding: "0.6rem" }}>
                      <div>{r.dateRaw || "—"}</div>
                      <div style={{ color: "var(--color-muted)" }}>
                        {r.clientNameRaw || "—"}
                        <br />
                        {r.sheetName} row {r.rowNumber}
                      </div>
                      {r.timeNeedsReview && (
                        <div style={{ color: "#a33" }}>A time on this row was ambiguous — check it.</div>
                      )}
                    </td>
                    <td style={{ padding: "0.6rem" }}>
                      <select
                        value={r.selectedEventId ?? ""}
                        onChange={(e) =>
                          updateRow(i, {
                            selectedEventId: e.target.value || null,
                            included: e.target.value ? true : r.included,
                          })
                        }
                        style={{ minWidth: 220, padding: "0.4rem", borderRadius: 6, border: "1px solid var(--color-border)" }}
                      >
                        <option value="">— no match / skip —</option>
                        {r.candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.6rem" }}>
                      <input
                        type="time"
                        value={r.staffArrivalOverride}
                        onChange={(e) => updateRow(i, { staffArrivalOverride: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: "0.6rem" }}>
                      <input
                        type="time"
                        value={r.guestArrivalOverride}
                        onChange={(e) => updateRow(i, { guestArrivalOverride: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: "0.6rem" }}>
                      <input
                        type="time"
                        value={r.staffEndOverride}
                        onChange={(e) => updateRow(i, { staffEndOverride: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="button"
              onClick={handleImport}
              disabled={isCommitting || matchedCount === 0}
            >
              {isCommitting ? "Importing…" : `Import ${matchedCount} selected row${matchedCount === 1 ? "" : "s"}`}
            </button>
            {result && (
              <span style={{ color: result.errors.length ? "#a33" : "#2a7a2a" }}>
                {result.updated} event{result.updated === 1 ? "" : "s"} updated.
                {result.errors.length > 0 && ` ${result.errors.length} error(s) below.`}
              </span>
            )}
          </div>

          {result && result.errors.length > 0 && (
            <ul style={{ color: "#a33" }}>
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
