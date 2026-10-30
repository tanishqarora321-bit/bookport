"use client";

import { useState } from "react";
import Link from "next/link";
import { SUPPLIER_INVOICE_IMPORT_FIELDS } from "@/lib/supplier-invoice-import-fields";
import { resolveSuggestedHeader } from "@/lib/match-header";
import BackButton from "@/components/ui/BackButton";
import { useYear } from "@/lib/year-context";

type ParseResult = { headers: string[]; rows: string[][]; suggestedMapping: Record<string, string | null>; suggestionFailed?: boolean };
type CommitResult = { imported: number; total: number; skipped: { row: number; reason?: string }[]; bookingsCreated?: number; newBookingYear?: number | null };
// One booking number this import would have to create. `containers` are the
// distinct Container Numbers the sheet lists for it (>1 -> it lands on
// Multiple Bookings & Instructions); `month` (0-11) is the Month of Loading
// it'll be filed under, or null when the sheet gives none (-> January).
type NewBookingGroup = { carrierBookingNo: string; sheetRows: number[]; containers: string[]; month: number | null };
type DuplicateGroup = NewBookingGroup & { currentSupplierName: string | null };
type Resolution = "add" | "ignore";

const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];


const STEP_ORDER = ["upload", "mapping", "duplicates", "newBookings", "result"] as const;
type Step = (typeof STEP_ORDER)[number];
const STEP_LABELS: Record<Step, string> = {
  upload: "Upload",
  mapping: "Match columns",
  duplicates: "Duplicates",
  newBookings: "New bookings",
  result: "Done",
};

export default function SupplierInvoiceImportClient({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  // Pre-fills the "New bookings" year and resolves a bare month name on
  // bookings that already exist - see the Forwarders import client.
  const { year: workingYear } = useYear();
  const [step, setStep] = useState<Step>("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  // A supplier statement is priced in one currency for the whole file.
  const [currency, setCurrency] = useState("EUR");
  const [fxRate, setFxRate] = useState("1");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [newBookingGroups, setNewBookingGroups] = useState<NewBookingGroup[]>([]);
  // Year the not-found-anywhere bookings get created in - pre-filled from
  // the sidebar's Working Year, but asked explicitly since matching existing
  // bookings ignores the year and only these new ones need one.
  const [newBookingYear, setNewBookingYear] = useState<number>(workingYear);

  const allFields = SUPPLIER_INVOICE_IMPORT_FIELDS;
  const mappedHeaders = new Set(Object.values(mapping).filter(Boolean));
  const unmappedHeaders = parsed ? parsed.headers.filter((h) => !mappedHeaders.has(h)) : [];

  const stepIdx = STEP_ORDER.indexOf(step);
  const stepsNav = (
    <ol
      aria-label="Import steps"
      className="steps"
      // Five steps don't fit the upload page's width with the default
      // fixed-length connector lines, so they wrapped onto two rows - keep
      // them on one row and let the connectors shrink to fill what's left.
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
      const res = await fetch("/api/supplier-invoices/import/parse", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read that file");

      setParsed(json);
      const initialMapping: Record<string, string> = {};
      for (const f of SUPPLIER_INVOICE_IMPORT_FIELDS) {
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

  // Dry run first: finds bookings that would be reassigned away from a
  // different supplier (-> Duplicates step) and booking numbers that exist
  // in no year yet (-> New bookings step) before anything is saved.
  async function handleReview() {
    if (!parsed) return;
    if (!mapping["booking_number"]) {
      setError("Booking Number must be mapped to a column before importing.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/supplier-invoices/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          headers: parsed.headers,
          rows: parsed.rows,
          mapping,
          dryRun: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");

      const dups: DuplicateGroup[] = json.duplicateGroups ?? [];
      const fresh: NewBookingGroup[] = json.newBookingGroups ?? [];
      setDuplicateGroups(dups);
      setNewBookingGroups(fresh);
      setNewBookingYear(workingYear);
      if (dups.length > 0) {
        setResolutions(Object.fromEntries(dups.map((g) => [g.carrierBookingNo.toLowerCase(), "ignore"])));
        setStep("duplicates");
      } else if (fresh.length > 0) {
        setResolutions({});
        setStep("newBookings");
      } else {
        await commitFinal({}, null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  // After the duplicates step: anything the user chose to "add" as a
  // separate booking is a new booking too, so it needs a year as well.
  async function continueFromDuplicates(finalResolutions: Record<string, Resolution>) {
    setResolutions(finalResolutions);
    const anyAdded = duplicateGroups.some((g) => finalResolutions[g.carrierBookingNo.toLowerCase()] === "add");
    if (newBookingGroups.length > 0 || anyAdded) {
      setStep("newBookings");
      return;
    }
    await commitFinal(finalResolutions, null);
  }

  async function commitFinal(finalResolutions: Record<string, Resolution>, yearForNewBookings: number | null) {
    if (!parsed) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/supplier-invoices/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          headers: parsed.headers,
          rows: parsed.rows,
          mapping,
          currency,
          fxRate: Number(fxRate) || 1,
          duplicateResolutions: finalResolutions,
          defaultYear: workingYear,
          newBookingYear: yearForNewBookings,
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

  const backHref = `/suppliers/${supplierId}/invoices`;

  if (step === "upload") {
    return (
      <div className="max-w-3xl mx-auto space-y-5 py-6">
        <div className="flex items-center gap-3">
          <BackButton href={backHref} label={`Back to ${supplierName}'s Invoices`} />
          <div>
            <h1 className="h1">Import Invoices from Excel</h1>
            <p className="sub">
              A row with a Booking Number starts an invoice; the Description/Weight/Unit Price rows under it become its
              cost lines. Each invoice is matched by Booking Number + Container Number in any year and filled in on
              {" "}{supplierName}&apos;s invoices. If a Booking Number isn&apos;t found anywhere yet, you&apos;ll be asked which
              year to create it in.
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
            <span className="meta">.xlsx — first sheet; the header row is found automatically even with a title banner above it</span>
            <input type="file" accept=".xlsx" className="sr" onChange={handleUpload} disabled={uploading} />
          </label>
          {error && <p className="err" style={{ textAlign: "center" }}>{error}</p>}
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
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} found. AI has pre-filled its best guess for
            each field — review and correct anything before importing.
          </p>
        </div>

        {stepsNav}

        <section className="card" style={{ padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <div className="field">
              <label htmlFor="supplier-import-currency">Currency (applies to this whole file)</label>
              <select id="supplier-import-currency" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="INR">INR</option>
                <option value="GBP">GBP</option>
                <option value="AED">AED</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="supplier-import-fx">FX Rate → USD (applies to this whole file)</label>
              <input id="supplier-import-fx" type="number" step="0.0001" className="input" value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
            </div>
          </div>
        </section>

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
            {/* One scrollable region for the whole card body - see the
                identical fix (with full reasoning) on the Forwarders
                import client. */}
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
              <div className="banner bn-warn" style={{ margin: 16, flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--warn)" }}>These columns in your sheet aren&apos;t mapped to anything above:</div>
                <div style={{ fontSize: 13, color: "var(--tx2)" }}>{unmappedHeaders.join(", ")}</div>
              </div>
            )}
            </div>
          </section>

          <section className="card" aria-labelledby="pv" style={{ flex: "1 1 480px", minWidth: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 18px 12px" }}>
              <h2 id="pv" className="h2">Preview (first 6 rows)</h2>
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
                  {parsed.rows.slice(0, 6).map((row, i) => (
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
                  {importing ? "Checking…" : "Import"}
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
          <h1 className="h1">Some bookings are assigned to a different supplier</h1>
          <p className="sub">
            Reassigning these to {supplierName} would move them away from whoever&apos;s currently on them. For each
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
              <h2 id="dp" className="h2">Some bookings are assigned to a different supplier</h2>
              <div className="lbl" style={{ marginTop: 3 }}>
                {duplicateGroups.length} booking number{duplicateGroups.length === 1 ? "" : "s"} already have a supplier. Choose what to do with each.
              </div>
            </div>
          </div>
          <div className="tw">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Booking Number</th>
                  <th>Currently assigned to</th>
                  <th>Invoices in this file</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {duplicateGroups.map((g) => {
                  const key = g.carrierBookingNo.toLowerCase();
                  return (
                    <tr key={key}>
                      <td className="mono" style={{ fontWeight: 600 }}>{g.carrierBookingNo}</td>
                      <td className="lbl">{g.currentSupplierName ?? <span className="dash">—</span>}</td>
                      <td className="lbl">{g.sheetRows.length}</td>
                      <td style={{ width: 240 }}>
                        <label className="sr" htmlFor={`dup-${key}`}>Action for {g.carrierBookingNo}</label>
                        <select
                          id={`dup-${key}`}
                          className="select select-s"
                          value={resolutions[key] ?? "ignore"}
                          onChange={(e) => setResolutions({ ...resolutions, [key]: e.target.value as Resolution })}
                        >
                          <option value="ignore">Reassign to {supplierName}</option>
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
              onClick={() => continueFromDuplicates(Object.fromEntries(duplicateGroups.map((g) => [g.carrierBookingNo.toLowerCase(), "ignore"])))}
              disabled={importing}
              className="btn"
            >
              Reassign All
            </button>
            <button onClick={() => continueFromDuplicates(resolutions)} disabled={importing} className="btn btn-p">
              {importing ? "Importing…" : "Continue"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (step === "newBookings") {
    const toCreate: NewBookingGroup[] = [
      ...newBookingGroups,
      ...duplicateGroups.filter((g) => resolutions[g.carrierBookingNo.toLowerCase()] === "add"),
    ];
    const multipleCount = toCreate.filter((g) => g.containers.length > 1).length;
    const currentCalendarYear = new Date().getFullYear();
    const yearOptions = Array.from(new Set([...Array.from({ length: 6 }, (_, i) => currentCalendarYear - 2 + i), workingYear])).sort((a, b) => a - b);
    return (
      <div className="max-w-4xl mx-auto space-y-5 py-6">
        <div>
          <h1 className="h1">Some bookings weren&apos;t found in any year</h1>
          <p className="sub">
            Every other invoice matched an existing Booking Number + Container Number (in any year) and will be
            assigned to {supplierName}. These booking numbers don&apos;t exist anywhere yet, so they&apos;ll be
            created as new bookings. Choose which year they belong to - the month comes from the sheet.
          </p>
        </div>

        {stepsNav}

        <section className="card" aria-labelledby="nb" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 18px 12px", display: "flex", gap: 16, alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <h2 id="nb" className="h2">
                {toCreate.length} new booking{toCreate.length === 1 ? "" : "s"}
              </h2>
              <div className="lbl" style={{ marginTop: 3 }}>
                {toCreate.length - multipleCount} to Booking &amp; Instructions
                {multipleCount > 0 && <> · {multipleCount} with more than one container to Multiple Bookings &amp; Instructions</>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
              <label htmlFor="new-booking-year" style={{ fontSize: 12, fontWeight: 600 }}>Create these bookings in year</label>
              <select id="new-booking-year" className="select" value={newBookingYear} onChange={(e) => setNewBookingYear(Number(e.target.value))}>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="tw" style={{ maxHeight: 420, overflowY: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Booking Number</th>
                  <th>Container(s)</th>
                  <th>Month of Loading</th>
                  <th>Goes to</th>
                </tr>
              </thead>
              <tbody>
                {toCreate.map((g) => (
                  <tr key={g.carrierBookingNo.toLowerCase()}>
                    <td className="mono" style={{ fontWeight: 600 }}>{g.carrierBookingNo}</td>
                    <td className="mono lbl">{g.containers.length > 0 ? g.containers.join(", ") : <span className="dash">—</span>}</td>
                    <td className="lbl">
                      {g.month !== null ? `${MONTH_LABELS[g.month]} ${newBookingYear}` : <>January {newBookingYear} <span className="meta">(no month in sheet)</span></>}
                    </td>
                    <td>
                      {g.containers.length > 1 ? <span className="badge b-warn">Multiple Bookings</span> : <span className="badge b-neu">Booking &amp; Instructions</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p className="err" style={{ padding: "0 18px" }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "14px 18px", borderTop: "1px solid var(--line)", background: "var(--surf2)" }}>
            <button onClick={() => setStep(duplicateGroups.length > 0 ? "duplicates" : "mapping")} disabled={importing} className="btn">Back</button>
            <button onClick={() => commitFinal(resolutions, newBookingYear)} disabled={importing} className="btn btn-p">
              {importing ? "Importing…" : `Create in ${newBookingYear} & Import`}
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
          <h1 className="h1">Import Invoices from Excel</h1>
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
          <div className="meta">of {result.total} invoice{result.total === 1 ? "" : "s"} in the file</div>
          {!!result.bookingsCreated && (
            <div className="meta">
              {result.bookingsCreated} new booking{result.bookingsCreated === 1 ? "" : "s"} created
              {result.newBookingYear ? ` in ${result.newBookingYear}` : ""}
              {result.newBookingYear && result.newBookingYear !== workingYear ? ` - switch the sidebar's Working Year to ${result.newBookingYear} to see them.` : "."}
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="card" style={{ width: "100%", textAlign: "left", padding: 16, marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Skipped ({result.skipped.length})</div>
              <ul style={{ fontSize: 13, color: "var(--tx2)", display: "flex", flexDirection: "column", gap: 4, maxHeight: 256, overflowY: "auto", margin: 0, paddingLeft: 18 }}>
                {result.skipped.map((s, i) => (
                  <li key={i}>Row {s.row}: {s.reason}</li>
                ))}
              </ul>
            </div>
          )}

          <Link href={backHref} className="btn btn-p" style={{ marginTop: 6 }}>
            Go to {supplierName}&apos;s Invoices
          </Link>
        </section>
      </div>
    );
  }

  return null;
}
