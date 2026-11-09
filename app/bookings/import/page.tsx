"use client";

import { useState } from "react";
import Link from "next/link";
import BackButton from "@/components/ui/BackButton";
import { IMPORT_FIELDS } from "@/lib/booking-import-fields";
import { resolveSuggestedHeader } from "@/lib/match-header";
import { useYear } from "@/lib/year-context";

type ParseResult = { headers: string[]; rows: string[][]; suggestedMapping: Record<string, string | null> };
// dateFixes: dates that don't exist (29-02-2026) saved as the next real day.
type DateFix = { row: number; bookingNumber: string; field: string; from: string; to: string };
type CommitResult = {
  imported: number;
  // Rows that filled in an already-saved booking's missing details.
  updated?: number;
  total: number;
  skipped: { row: number; reason?: string }[];
  dateFixes?: DateFix[];
  notes?: { row: number; reason?: string }[];
};
type DuplicateGroup = { carrierBookingNo: string; containerCount: number; sheetRows: number[] };
// "fill": fill in the saved booking's blank fields / containers / packing
// details from this sheet (never overwriting); "add": separate second
// entry; "ignore": skip.
type Resolution = "fill" | "add" | "ignore";

const STEP_ORDER = ["upload", "mapping", "duplicates", "dates", "result"] as const;
type Step = (typeof STEP_ORDER)[number];
const STEP_LABELS: Record<Step, string> = {
  upload: "Upload",
  mapping: "Match columns",
  duplicates: "Duplicates",
  dates: "Missing dates",
  result: "Done",
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function ImportBookingsPage() {
  const [step, setStep] = useState<Step>("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  // "Year this sheet applies to" - the sidebar's Working Year, set from the
  // upload step like the Forwarders import. Month-only dates in the sheet
  // ("AUGUST") are read in this year, and it's the year offered below.
  const { year, setYear } = useYear();
  // Bookings with no ERD and no cut-off date at all (from the dry run), and
  // what to do with them: leave them undated (they show under every year,
  // behind Booking & Instructions' "No ERD" filter) or give them a Month of
  // Loading.
  const [undatedGroups, setUndatedGroups] = useState<DuplicateGroup[]>([]);
  const [undatedMode, setUndatedMode] = useState<"leave" | "set">("leave");
  const [undatedMonth, setUndatedMonth] = useState(new Date().getMonth());

  const stepIdx = STEP_ORDER.indexOf(step);
  const stepsNav = (
    <ol
      aria-label="Import steps"
      className="steps"
      // One row, connectors shrinking to fit - same as the Truckers import.
      style={{ listStyle: "none", margin: 0, padding: "14px 18px", background: "var(--surf)", border: "1px solid var(--line)", borderRadius: 12, flexWrap: "nowrap", overflowX: "auto" }}
    >
      {STEP_ORDER.map((id, i) => {
        const last = i === STEP_ORDER.length - 1;
        return (
          <li
            key={id}
            className={`stp${i < stepIdx ? " done" : i === stepIdx ? " cur" : ""}`}
            aria-current={i === stepIdx ? "step" : undefined}
            style={{ whiteSpace: "nowrap", flex: last ? "0 0 auto" : "1 1 auto" }}
          >
            <span className="n" style={{ flexShrink: 0 }}>{i < stepIdx ? "✓" : i + 1}</span>
            {STEP_LABELS[id]}
            {!last && <span className="stp-line" aria-hidden="true" style={{ flex: "1 1 auto", width: "auto", minWidth: 12, maxWidth: 40, marginRight: 4 }} />}
          </li>
        );
      })}
    </ol>
  );

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/bookings/import/parse", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read that file");

      setParsed(json);
      const initialMapping: Record<string, string> = {};
      for (const f of IMPORT_FIELDS) {
        const resolved = resolveSuggestedHeader(json.headers, json.suggestedMapping?.[f.key]);
        if (resolved) initialMapping[f.key] = resolved;
      }
      setMapping(initialMapping);
      setStep("mapping");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  // Checks for Booking Numbers that already exist on a saved booking
  // before committing anything - those need the user to say whether this
  // is an intentional second entry (-> Multiple Bookings & Instructions)
  // or should just be ignored. A number repeated only within this file
  // (multiple containers of one shipment) isn't a conflict and never
  // shows here - the commit route merges those into one booking on its own.
  async function handleReview() {
    if (!parsed) return;
    const bookingNoField = IMPORT_FIELDS.find((f) => f.required)!;
    if (!mapping[bookingNoField.key]) {
      setError(`${bookingNoField.label} must be mapped to a column before importing.`);
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: parsed.headers, rows: parsed.rows, mapping, dryRun: true, defaultYear: year })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");

      const undated: DuplicateGroup[] = json.undatedGroups ?? [];
      setUndatedGroups(undated);
      setUndatedMode("leave");
      if (json.duplicateGroups && json.duplicateGroups.length > 0) {
        setDuplicateGroups(json.duplicateGroups);
        setResolutions(Object.fromEntries(json.duplicateGroups.map((g: DuplicateGroup) => [g.carrierBookingNo.toLowerCase(), "fill"])));
        setStep("duplicates");
      } else if (undated.length > 0) {
        setResolutions({});
        setStep("dates");
      } else {
        await commitFinal({});
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  // After the duplicates step: undated bookings still need the "Missing
  // dates" choice before anything is saved.
  async function continueFromDuplicates(finalResolutions: Record<string, Resolution>) {
    setResolutions(finalResolutions);
    if (undatedGroups.length > 0) {
      setStep("dates");
      return;
    }
    await commitFinal(finalResolutions);
  }

  async function commitFinal(finalResolutions: Record<string, Resolution>, undatedErd: string | null = null) {
    if (!parsed) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: parsed.headers, rows: parsed.rows, mapping, duplicateResolutions: finalResolutions, defaultYear: year, undatedErd })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      setResult(json);
      setStep("result");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  if (step === "upload") {
    return (
      <div className="max-w-3xl mx-auto space-y-5 py-6">
        <div className="flex items-center gap-3">
          <BackButton href="/bookings/new" label="Back to New Booking" />
          <div>
          <h1 className="h1">Import Bookings from Excel</h1>
          <p className="sub">
            Upload an .xlsx spreadsheet of existing bookings. You&apos;ll match its columns to Ship-Sphere&apos;s
            fields before anything is saved.
          </p>
          </div>
        </div>

        {stepsNav}

        <section className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <label className="drop" style={{ cursor: "pointer" }}>
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
            </svg>
            <span style={{ fontWeight: 600 }}>{uploading ? "Reading file…" : "Click to choose a file"}</span>
            <span className="meta">.xlsx — first sheet, first row must be headers</span>
            <input type="file" accept=".xlsx" className="sr" onChange={handleUpload} disabled={uploading} />
          </label>
          <div className="field" style={{ maxWidth: 260 }}>
            <label htmlFor="import-year">Year this sheet applies to</label>
            <select id="import-year" className="select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {Array.from(new Set([...Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i), year]))
                .sort((a, b) => a - b)
                .map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
            </select>
            <span className="meta">
              Used for month-only dates (e.g. &quot;AUGUST&quot;) and offered for bookings with no ERD or cut-off - also sets the
              Working Year, so the new bookings show up right away.
            </span>
          </div>
          {error && <p className="err" style={{ textAlign: "center" }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Link href="/bookings/new" className="btn">Cancel</Link>
          </div>
        </section>
      </div>
    );
  }

  if (step === "mapping" && parsed) {
    return (
      <div className="max-w-6xl mx-auto space-y-5 py-6">
        <div>
          <h1 className="h1">Match your columns</h1>
          <p className="sub">
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} found. AI has pre-filled its best guess
            for each field below — review and correct anything before importing. Fields left as &quot;— Skip —&quot; won&apos;t
            be imported.
          </p>
        </div>

        {stepsNav}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <section className="card" aria-labelledby="mp" style={{ flex: "1 1 460px", minWidth: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 18px 12px" }}>
              <h2 id="mp" className="h2">Ship-Sphere field</h2>
            </div>
            <div className="tw" style={{ maxHeight: 520 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Ship-Sphere field</th>
                    <th scope="col">Column in your file</th>
                    <th scope="col"><span className="sr">Match</span></th>
                  </tr>
                </thead>
                <tbody>
                  {IMPORT_FIELDS.map((f) => {
                    const matched = !!mapping[f.key];
                    return (
                      <tr key={f.key}>
                        <td style={{ fontWeight: 500 }}>
                          {f.label} {f.required && <span className="req">*</span>}
                        </td>
                        <td style={{ width: "55%" }}>
                          <label className="sr" htmlFor={`map-${f.key}`}>Column for {f.label}</label>
                          <select
                            id={`map-${f.key}`}
                            className="select select-s"
                            value={mapping[f.key] ?? ""}
                            onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                          >
                            <option value="">— Skip —</option>
                            {parsed.headers.map((h) => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {matched ? <span className="badge b-ok">Matched</span> : <span className="badge b-neu">Skipped</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" aria-labelledby="pv" style={{ flex: "1 1 480px", minWidth: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 18px 12px" }}>
              <h2 id="pv" className="h2">Preview (first 3 rows)</h2>
            </div>
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    {parsed.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 3).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell || <span className="dash">—</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 18px", borderTop: "1px solid var(--line)", background: "var(--surf2)" }}>
              <span className="meta">{parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}</span>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep("upload")} className="btn">Back</button>
                <button onClick={handleReview} disabled={importing} className="btn btn-p">
                  {importing ? "Checking…" : `Import ${parsed.rows.length} Row${parsed.rows.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </section>
        </div>

        {error && <p className="err">{error}</p>}
      </div>
    );
  }

  if (step === "duplicates") {
    return (
      <div className="max-w-4xl mx-auto space-y-5 py-6">
        <div>
          <h1 className="h1">Some Booking Numbers already exist</h1>
          <p className="sub">
            These are already saved in Booking &amp; Instructions. For each one, choose: <b>fill in its missing details</b>{" "}
            from this sheet (blank dates, ports, Instruction Status, containers and packing details - anything already
            entered is kept), add an intentional <b>second entry</b> (highlighted as Multiple), or <b>ignore</b> it.
          </p>
        </div>

        {stepsNav}

        <section className="card" aria-labelledby="dp" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 18px 12px", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--warnS)", color: "var(--warn)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 8h12v12H8zM4 16V4h12" />
              </svg>
            </span>
            <div>
              <h2 id="dp" className="h2">Some Booking Numbers already exist</h2>
              <div className="lbl" style={{ marginTop: 3 }}>
                {duplicateGroups.length} booking number{duplicateGroups.length === 1 ? "" : "s"} match bookings already in Ship-Sphere. Choose what to do with each.
              </div>
            </div>
          </div>
          <div className="tw">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Booking Number</th>
                  <th>In this file</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {duplicateGroups.map((g) => {
                  const key = g.carrierBookingNo.toLowerCase();
                  return (
                    <tr key={key}>
                      <td className="mono" style={{ fontWeight: 600 }}>{g.carrierBookingNo}</td>
                      <td className="lbl">
                        {g.sheetRows.length} row{g.sheetRows.length === 1 ? "" : "s"}
                        {g.containerCount > 1 ? ` (${g.containerCount} containers)` : ""}
                      </td>
                      <td style={{ width: 240 }}>
                        <label className="sr" htmlFor={`dup-${key}`}>Action for {g.carrierBookingNo}</label>
                        <select
                          id={`dup-${key}`}
                          className="select select-s"
                          value={resolutions[key] ?? "fill"}
                          onChange={(e) => setResolutions({ ...resolutions, [key]: e.target.value as Resolution })}
                        >
                          <option value="fill">Fill in missing details</option>
                          <option value="add">Add as a second entry</option>
                          <option value="ignore">Ignore</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {error && <p className="err" style={{ padding: "0 18px" }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 18px", borderTop: "1px solid var(--line)", background: "var(--surf2)" }}>
            <button
              onClick={() => continueFromDuplicates(Object.fromEntries(duplicateGroups.map((g) => [g.carrierBookingNo.toLowerCase(), "ignore"])))}
              disabled={importing}
              className="btn"
            >
              Ignore All
            </button>
            <button
              onClick={() => continueFromDuplicates(Object.fromEntries(duplicateGroups.map((g) => [g.carrierBookingNo.toLowerCase(), "fill"])))}
              disabled={importing}
              className="btn"
            >
              Fill In All
            </button>
            <button onClick={() => continueFromDuplicates(resolutions)} disabled={importing} className="btn btn-p">
              {importing ? "Importing…" : "Continue"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (step === "dates") {
    const undatedErd = undatedMode === "set" ? `${year}-${String(undatedMonth + 1).padStart(2, "0")}-01` : null;
    return (
      <div className="max-w-4xl mx-auto space-y-5 py-6">
        <div>
          <h1 className="h1">Some bookings have no dates</h1>
          <p className="sub">
            These have no ERD and no Cut Off in the sheet, so there&apos;s nothing to file them under a year by. Every other
            booking is filed by its ERD (or its Cut Off when the ERD is blank).
          </p>
        </div>

        {stepsNav}

        <section className="card" aria-labelledby="nd" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 id="nd" className="h2">{undatedGroups.length} booking{undatedGroups.length === 1 ? "" : "s"} without any date</h2>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="radio" name="undated" checked={undatedMode === "leave"} onChange={() => setUndatedMode("leave")} style={{ marginTop: 3 }} />
              <span>
                <b>Leave them without an ERD</b>
                <span className="lbl" style={{ display: "block" }}>
                  They show under every year, with the &quot;No ERD&quot; filter in Booking &amp; Instructions, until you fill one in.
                </span>
              </span>
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input type="radio" name="undated" checked={undatedMode === "set"} onChange={() => setUndatedMode("set")} style={{ marginTop: 3 }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <b>Give them a Month of Loading</b>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    aria-label="Month of Loading for bookings without dates"
                    className="select select-s"
                    style={{ width: 150 }}
                    value={undatedMonth}
                    onChange={(e) => {
                      setUndatedMonth(Number(e.target.value));
                      setUndatedMode("set");
                    }}
                  >
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i}>{m}</option>
                    ))}
                  </select>
                  <b>{year}</b>
                  <span className="lbl">(sets their ERD to the 1st of that month - change it per booking later)</span>
                </span>
              </span>
            </label>
          </div>
          <div className="tw" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Booking Number</th>
                  <th>In this file</th>
                </tr>
              </thead>
              <tbody>
                {undatedGroups.map((g) => (
                  <tr key={g.carrierBookingNo.toLowerCase()}>
                    <td className="mono" style={{ fontWeight: 600 }}>{g.carrierBookingNo}</td>
                    <td className="lbl">
                      {g.sheetRows.length} row{g.sheetRows.length === 1 ? "" : "s"}
                      {g.containerCount > 1 ? ` (${g.containerCount} containers)` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p className="err" style={{ padding: "0 18px" }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "14px 18px", borderTop: "1px solid var(--line)", background: "var(--surf2)" }}>
            <button onClick={() => setStep(duplicateGroups.length > 0 ? "duplicates" : "mapping")} disabled={importing} className="btn">Back</button>
            <button onClick={() => commitFinal(resolutions, undatedErd)} disabled={importing} className="btn btn-p">
              {importing ? "Importing…" : "Import"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (step === "result" && result) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 py-6">
        <div>
          <h1 className="h1">Import Bookings from Excel</h1>
          <p className="sub">Each step can be undone with Back until you import.</p>
        </div>

        {stepsNav}

        <section className="card" style={{ padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <span style={{ width: 52, height: 52, borderRadius: 26, background: "var(--okS)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5 9-10" />
            </svg>
          </span>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Import complete</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <span className="badge b-ok">{result.imported} imported</span>
            {!!result.updated && <span className="badge b-info">{result.updated} filled in on existing bookings</span>}
            {result.skipped.length > 0 && <span className="badge b-neu">{result.skipped.length} skipped</span>}
            {(result.dateFixes?.length ?? 0) > 0 && <span className="badge b-warn">{result.dateFixes!.length} date{result.dateFixes!.length === 1 ? "" : "s"} corrected</span>}
          </div>
          <div className="meta">of {result.total} row{result.total === 1 ? "" : "s"} total</div>

          {result.skipped.length > 0 && (
            <div className="card" style={{ width: "100%", textAlign: "left", padding: 16, marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Skipped rows ({result.skipped.length})</div>
              <ul style={{ fontSize: 13, color: "var(--tx2)", display: "flex", flexDirection: "column", gap: 4, maxHeight: 256, overflowY: "auto", margin: 0, paddingLeft: 18 }}>
                {result.skipped.map((s, i) => (
                  <li key={i}>Row {s.row}: {s.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {(result.notes?.length ?? 0) > 0 && (
            <div className="card" style={{ width: "100%", textAlign: "left", padding: 16, marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Notes ({result.notes!.length})</div>
              <ul style={{ fontSize: 13, color: "var(--tx2)", display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto", margin: 0, paddingLeft: 18 }}>
                {result.notes!.map((n, i) => (
                  <li key={i}>{n.row ? `Row ${n.row}: ` : ""}{n.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {(result.dateFixes?.length ?? 0) > 0 && (
            <div className="card" style={{ width: "100%", textAlign: "left", padding: 16, marginTop: 8, borderColor: "var(--warnB)", background: "var(--warnS)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Dates corrected ({result.dateFixes!.length})</div>
              <p className="lbl" style={{ margin: "0 0 8px" }}>
                These dates don&apos;t exist, so each was saved as the next real day. Change any of them in Booking &amp; Instructions if that&apos;s wrong.
              </p>
              <ul style={{ fontSize: 13, color: "var(--tx2)", display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto", margin: 0, paddingLeft: 18 }}>
                {result.dateFixes!.map((f, i) => (
                  <li key={i}>
                    Row {f.row} · <span className="mono">{f.bookingNumber}</span> · {f.field}: <b>{f.from}</b> → saved as <b>{f.to}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link href="/bookings" className="btn btn-p" style={{ marginTop: 6 }}>
            Go to Booking &amp; Instructions
          </Link>
        </section>
      </div>
    );
  }

  return null;
}
