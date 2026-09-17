import { ImportTimesForm } from "./ImportTimesForm";

export default function ImportStaffTimesPage() {
  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ margin: 0 }}>Import staff/event times</h1>
        <p style={{ color: "var(--color-muted)", maxWidth: 640 }}>
          Upload your spreadsheet of staff arrival, event start, and staff end times and this will
          match each row to an existing event by date (and client name, when more than one event
          falls on the same date). Review the matches and times below, uncheck or fix anything
          that looks wrong, then import — only the rows you leave checked get saved.
        </p>
      </div>
      <ImportTimesForm />
    </div>
  );
}
