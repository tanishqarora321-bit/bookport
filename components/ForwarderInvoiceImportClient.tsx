"use client";

import { useState } from "react";
import Link from "next/link";
import { FORWARDER_INVOICE_IMPORT_FIELDS } from "@/lib/forwarder-invoice-import-fields";
import { resolveSuggestedHeader } from "@/lib/match-header";
import AddColumnPanel from "@/components/ui/AddColumnPanel";
import { useYear } from "@/lib/year-context";

type CustomColumn = { key: string; label: string };
type ParseResult = { headers: string[]; rows: string[][]; suggestedMapping: Record<string, string | null>; suggestionFailed?: boolean; customColumns: CustomColumn[] };
type CommitResult = { imported: number; total: number; skipped: { row: number; reason?: string }[] };
type DuplicateGroup = { carrierBookingNo: string; currentForwarderName: string | null; sheetRows: number[] };
type Resolution = "add" | "ignore";

const MAX_CUSTOM_COLUMNS = 10;

const STEP_ORDER = ["upload", "mapping", "duplicates", "result"] as const;
type Step = (typeof STEP_ORDER)[number];
const STEP_LABELS: Record<Step, string> = {
  upload: "Upload",
  mapping: "Match columns",
  duplicates: "Duplicates",
  result: "Done",
};

export default function ForwarderInvoiceImportClient({ forwarderId, forwarderName }: { forwarderId: string; forwarderName: string }) {
  // Used only as a last-resort fallback when a new booking's Month of
  // Loading/ERD is a bare month name with no Invoice Date on the same row
  // to borrow a year from - same "pre-fill, don't invent data" role the
  // sidebar's Working Year already plays for Payment History's "Applies to
  // Year" (see lib/year-context.tsx).
  const { year: workingYear, setYear } = useYear();
  const [step, setStep] = useState<Step>("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [addColumnForHeader, setAddColumnForHeader] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});

  const allFields = [...FORWARDER_INVOICE_IMPORT_FIELDS, ...customColumns.map((c) => ({ key: c.key, label: c.label }))];
  const mappedHeaders = new Set(Object.values(mapping).filter(Boolean));
  const unmappedHeaders = parsed ? parsed.headers.filter((h) => !mappedHeaders.has(h)) : [];

  const stepIdx = STEP_ORDER.indexOf(step);
  const stepsNav = (
    <ol
      aria-label="Import steps"
      className="steps"
      style={{ listStyle: "none", margin: 0, padding: "14px 18px", background: "var(--surf)", border: "1px solid var(--line)", borderRadius: 12 }}
    >
      {STEP_ORDER.map((id, i) => (
        <li key={id} className={`stp${i < stepIdx ? " done" : i === stepIdx ? " cur" : ""}`} aria-current={i === stepIdx ? "step" : undefined}>
          <span className="n">{i < stepIdx ? "✓" : i + 1}</span>
          {STEP_LABELS[id]}
          {i < STEP_ORDER.length - 1 && <span className="stp-line" aria-hidden="true" style={{ marginLeft: 8 }} />}
        </li>
      ))}
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
      const res = await fetch("/api/forwarder-invoices/import/parse", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read that file");

      setParsed(json);
      setCustomColumns(json.customColumns ?? []);
      const initialMapping: Record<string, string> = {};
      const fields = [...FORWARDER_INVOICE_IMPORT_FIELDS, ...(json.customColumns ?? []).map((c: CustomColumn) => ({ key: c.key }))];
      for (const f of fields) {
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

  function columnCreatedFromHeader(header: string, column: CustomColumn) {
    setCustomColumns((prev) => [...prev, column]);
    setMapping((prev) => ({ ...prev, [column.key]: header }));
    setAddColumnForHeader(null);
  }

  // Checks whether any row would reassign an already-booked shipment away
  // from a different forwarder before committing anything - that only
  // happens when a Booking Number is reused across two genuinely
  // different shipments, and only the user can say whether this sheet's
  // version is an intentional second entry (-> Multiple Bookings &
  // Instructions) or should be ignored.
  async function handleReview() {
    if (!parsed) return;
    if (!mapping["booking_number"]) {
      setError("Booking Number must be mapped to a column before importing.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/forwarder-invoices/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forwarderId,
          headers: parsed.headers,
          rows: parsed.rows,
          mapping,
          customKeys: customColumns.map((c) => c.key),
          dryRun: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");

      if (!json.duplicateGroups || json.duplicateGroups.length === 0) {
        await commitFinal({});
        return;
      }
      setDuplicateGroups(json.duplicateGroups);
      setResolutions(Object.fromEntries(json.duplicateGroups.map((g: DuplicateGroup) => [g.carrierBookingNo.toLowerCase(), "ignore"])));
      setStep("duplicates");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function commitFinal(finalResolutions: Record<string, Resolution>) {
    if (!parsed) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/forwarder-invoices/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forwarderId,
          headers: parsed.headers,
          rows: parsed.rows,
          mapping,
          customKeys: customColumns.map((c) => c.key),
          duplicateResolutions: finalResolutions,
          defaultYear: workingYear,
        }),
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

  const backHref = `/forwarders/${forwarderId}/invoices`;
  const currentCalendarYear = new Date().getFullYear();
  const importYears = Array.from({ length: 6 }, (_, i) => currentCalendarYear - 2 + i);

  // Flush against the shared Header/sidebar, not indented inside the
  // centered content column like the rest of each step - rendered the
  // same on every step so there's always an obvious way back.
  const backBar = (
    <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--line)", background: "var(--surf)" }}>
      <Link href={backHref} className="lbl" style={{ display: "inline-flex", alignItems: "center", gap: 4, width: "fit-content" }}>
        ← Back to {forwarderName}&apos;s Invoices
      </Link>
    </div>
  );

  if (step === "upload") {
    return (
      <>
        {backBar}
        <div className="max-w-2xl mx-auto space-y-5 py-6">
        <div>
          <h1 className="h1">Import Invoice Charges from Excel</h1>
          <p className="sub">
            Fills in invoice numbers/charges on {forwarderName}&apos;s pending invoices, matched by Booking Number
            (and Container Number if a booking has more than one). If a Booking Number isn&apos;t found anywhere yet,
            it creates that booking with {forwarderName} assigned, using whatever POL/POD/container details this
            sheet has for it.
          </p>
        </div>

        {stepsNav}

        <section className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field" style={{ maxWidth: 220 }}>
            <label htmlFor="import-year">Year this sheet applies to</label>
            <select id="import-year" className="select" value={workingYear} onChange={(e) => setYear(Number(e.target.value))}>
              {importYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="help">
              Used when a new booking&apos;s Month of Loading has no year of its own (e.g. just &quot;JANUARY&quot;) -
              and also sets the Working Year, so new entries show up on Booking &amp; Instructions right away.
            </span>
          </div>
          <label className="drop" style={{ cursor: "pointer" }}>
            <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
            </svg>
            <span style={{ fontWeight: 600 }}>{uploading ? "Reading file…" : "Click to choose a file"}</span>
            <span className="meta">.xlsx — first sheet, first row must be headers</span>
            <input type="file" accept=".xlsx" className="sr" onChange={handleUpload} disabled={uploading} />
          </label>
          {error && <p className="err" style={{ textAlign: "center" }}>{error}</p>}
        </section>
        </div>
      </>
    );
  }

  if (step === "mapping" && parsed) {
    return (
      <>
      {backBar}
      <div className="max-w-6xl mx-auto space-y-5 py-6">
        <div>
          <h1 className="h1">Match your columns</h1>
          <p className="sub">
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} found. AI has pre-filled its best guess for
            each field — review and correct anything before importing.
          </p>
        </div>

        {stepsNav}

        {parsed.suggestionFailed && (
          <p className="err">
            Couldn&apos;t generate auto-mapping suggestions for this file — map each field below by hand.
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <section className="card" aria-labelledby="mp" style={{ flex: "1 1 460px", minWidth: 0, display: "flex", flexDirection: "column", maxHeight: 640 }}>
            <div style={{ padding: "16px 18px 12px", flexShrink: 0 }}>
              <h2 id="mp" className="h2">Ship-Sphere field</h2>
            </div>
            {/* One scrollable region for the whole card body (table + the
                unmapped-columns list below it) instead of each having its
                own independent scrollbar - a sheet with many unmatched
                columns used to grow a second, nested scroll box here, which
                looked broken next to the single scrollbar everything else
                on this page gets. */}
            <div style={{ overflowY: "auto", minHeight: 0 }}>
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Ship-Sphere field</th>
                    <th scope="col">Column in your file</th>
                    <th scope="col"><span className="sr">Match</span></th>
                  </tr>
                </thead>
                <tbody>
                  {allFields.map((f) => {
                    const matched = !!mapping[f.key];
                    const required = (f as any).required as boolean | undefined;
                    return (
                      <tr key={f.key}>
                        <td style={{ fontWeight: 500 }}>
                          {f.label} {required && <span className="req">*</span>}
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

            {unmappedHeaders.length > 0 && (
              <div className="banner bn-warn" style={{ margin: 16, flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--warn)" }}>
                  These columns in your sheet aren&apos;t mapped to anything above:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {unmappedHeaders.map((h) => (
                    <div key={h} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                      <span>{h}</span>
                      <button
                        onClick={() => setAddColumnForHeader(h)}
                        disabled={customColumns.length >= MAX_CUSTOM_COLUMNS}
                        className="btn btn-xs"
                      >
                        + Add Column
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {addColumnForHeader && (
              <div style={{ margin: 16 }}>
                <AddColumnPanel
                  open={!!addColumnForHeader}
                  onClose={() => setAddColumnForHeader(null)}
                  defaultName={addColumnForHeader}
                  columnCount={customColumns.length}
                  maxColumns={MAX_CUSTOM_COLUMNS}
                  entityLabel="forwarder"
                  createEndpoint="/api/forwarder-invoice-columns"
                  onCreated={(column) => columnCreatedFromHeader(addColumnForHeader, column)}
                />
              </div>
            )}
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
      </>
    );
  }

  if (step === "duplicates") {
    return (
      <>
      {backBar}
      <div className="max-w-4xl mx-auto space-y-5 py-6">
        <div>
          <h1 className="h1">Some bookings are assigned to a different forwarder</h1>
          <p className="sub">
            Reassigning these to {forwarderName} would move them away from whoever&apos;s currently on them. For each
            one, choose whether this is really the same booking (reassign it) or a different shipment that
            happens to reuse the number (add it as a separate entry — it&apos;ll show up on Multiple Bookings &amp;
            Instructions).
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
              <h2 id="dp" className="h2">Some bookings are assigned to a different forwarder</h2>
              <div className="lbl" style={{ marginTop: 3 }}>
                {duplicateGroups.length} booking number{duplicateGroups.length === 1 ? "" : "s"} already have a forwarder. Choose what to do with each.
              </div>
            </div>
          </div>
          <div className="tw">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Booking Number</th>
                  <th>Currently assigned to</th>
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
                      <td className="lbl">{g.currentForwarderName ?? <span className="dash">—</span>}</td>
                      <td className="lbl">{g.sheetRows.length} row{g.sheetRows.length === 1 ? "" : "s"}</td>
                      <td style={{ width: 240 }}>
                        <label className="sr" htmlFor={`dup-${key}`}>Action for {g.carrierBookingNo}</label>
                        <select
                          id={`dup-${key}`}
                          className="select select-s"
                          value={resolutions[key] ?? "ignore"}
                          onChange={(e) => setResolutions({ ...resolutions, [key]: e.target.value as Resolution })}
                        >
                          <option value="ignore">Reassign to {forwarderName}</option>
                          <option value="add">Add as separate booking</option>
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
              onClick={() => commitFinal(Object.fromEntries(duplicateGroups.map((g) => [g.carrierBookingNo.toLowerCase(), "ignore"])))}
              disabled={importing}
              className="btn"
            >
              Reassign All
            </button>
            <button onClick={() => commitFinal(resolutions)} disabled={importing} className="btn btn-p">
              {importing ? "Importing…" : "Continue"}
            </button>
          </div>
        </section>
      </div>
      </>
    );
  }

  if (step === "result" && result) {
    return (
      <>
      {backBar}
      <div className="max-w-2xl mx-auto space-y-5 py-6">
        <div>
          <h1 className="h1">Import Invoice Charges from Excel</h1>
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
            {result.skipped.length > 0 && <span className="badge b-neu">{result.skipped.length} skipped</span>}
          </div>
          <div className="meta">of {result.total} row{result.total === 1 ? "" : "s"} matched and updated</div>

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

          <Link href={backHref} className="btn btn-p" style={{ marginTop: 6 }}>
            Go to {forwarderName}&apos;s Invoices
          </Link>
        </section>
      </div>
      </>
    );
  }

  return null;
}
