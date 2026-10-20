"use client";

import { useState } from "react";
import Link from "next/link";
import { TRUCKER_INVOICE_IMPORT_FIELDS } from "@/lib/trucker-invoice-import-fields";
import { resolveSuggestedHeader } from "@/lib/match-header";

type CustomColumn = { key: string; label: string };
type ParseResult = { headers: string[]; rows: string[][]; suggestedMapping: Record<string, string | null>; customColumns: CustomColumn[] };
type CommitResult = { imported: number; total: number; skipped: { row: number; reason?: string }[] };
type DuplicateGroup = { carrierBookingNo: string; currentTruckerName: string | null; sheetRows: number[] };
type Resolution = "add" | "ignore";

const MAX_CUSTOM_COLUMNS = 10;

export default function TruckerInvoiceImportClient({ truckerId, truckerName }: { truckerId: string; truckerName: string }) {
  const [step, setStep] = useState<"upload" | "mapping" | "duplicates" | "result">("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [addingColumnFor, setAddingColumnFor] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});

  const allFields = [...TRUCKER_INVOICE_IMPORT_FIELDS, ...customColumns.map((c) => ({ key: c.key, label: c.label }))];
  const mappedHeaders = new Set(Object.values(mapping).filter(Boolean));
  const unmappedHeaders = parsed ? parsed.headers.filter((h) => !mappedHeaders.has(h)) : [];

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/trucker-invoices/import/parse", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read that file");

      setParsed(json);
      setCustomColumns(json.customColumns ?? []);
      const initialMapping: Record<string, string> = {};
      const fields = [...TRUCKER_INVOICE_IMPORT_FIELDS, ...(json.customColumns ?? []).map((c: CustomColumn) => ({ key: c.key }))];
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

  async function addColumnFromHeader(header: string) {
    if (customColumns.length >= MAX_CUSTOM_COLUMNS) {
      alert(`You already have ${MAX_CUSTOM_COLUMNS} custom columns, the maximum.`);
      return;
    }
    if (!confirm(`Add "${header}" as a new charge column? It will show up on every trucker's invoice ledger, and this sheet's "${header}" column will map to it.`)) {
      return;
    }
    setAddingColumnFor(header);
    try {
      const res = await fetch("/api/trucker-invoice-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: header }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add column");
      setCustomColumns((prev) => [...prev, json.column]);
      setMapping((prev) => ({ ...prev, [json.column.key]: header }));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAddingColumnFor(null);
    }
  }

  // Checks whether any row would reassign an already-booked shipment away
  // from a different trucker before committing anything - that only
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
      const res = await fetch("/api/trucker-invoices/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          truckerId,
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
      const res = await fetch("/api/trucker-invoices/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          truckerId,
          headers: parsed.headers,
          rows: parsed.rows,
          mapping,
          customKeys: customColumns.map((c) => c.key),
          duplicateResolutions: finalResolutions,
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

  const backHref = `/truckers/${truckerId}/invoices`;

  if (step === "upload") {
    return (
      <div className="h-full flex flex-col">
        <Link href={backHref} className="text-sm text-accent mb-2 w-fit inline-flex items-center gap-1 hover:underline">
          ← Back to {truckerName}'s Invoices
        </Link>
        <div className="max-w-lg mx-auto mt-12 space-y-4 w-full">
          <h1 className="text-xl font-semibold text-center">Import Invoice Charges from Excel</h1>
          <p className="text-sm text-text-2 text-center">
            Fills in invoice numbers/charges on {truckerName}'s pending invoices, matched by Booking Number
            (and Container Number if a booking has more than one). If a Booking Number isn't found anywhere yet,
            it creates that booking with {truckerName} assigned.
          </p>
          <label className="block border-2 border-dashed rounded-lg p-10 bg-surface hover:border-accent text-center cursor-pointer">
            <div className="font-medium">{uploading ? "Reading file…" : "Click to choose a file"}</div>
            <div className="text-sm text-text-2 mt-1">.xlsx — first sheet; the header row is found automatically even with a title banner above it</div>
            <input type="file" accept=".xlsx" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          {error && <p className="text-red-600 text-sm text-center">{error}</p>}
        </div>
      </div>
    );
  }

  if (step === "mapping" && parsed) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Match your columns</h1>
          <p className="text-sm text-text-2 mt-1">
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} found. AI has pre-filled its best guess for
            each field — review and correct anything before importing.
          </p>
        </div>

        <div className="bg-surface rounded-xl shadow-sm divide-y">
          {allFields.map((f) => (
            <div key={f.key} className="grid grid-cols-3 gap-3 items-center px-4 py-2.5">
              <label className="text-sm text-ink">
                {f.label} {(f as any).required && <span className="text-cutoff">*</span>}
              </label>
              <select
                className="col-span-2 border rounded px-2 py-1.5 text-sm"
                value={mapping[f.key] ?? ""}
                onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
              >
                <option value="">— Skip —</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {unmappedHeaders.length > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-amber-800">
              These columns in your sheet aren't mapped to anything above:
            </div>
            {unmappedHeaders.map((h) => (
              <div key={h} className="flex items-center justify-between text-sm">
                <span>{h}</span>
                <button
                  onClick={() => addColumnFromHeader(h)}
                  disabled={addingColumnFor === h || customColumns.length >= MAX_CUSTOM_COLUMNS}
                  className="text-xs bg-ink text-white px-2 py-1 rounded disabled:opacity-50"
                >
                  {addingColumnFor === h ? "Adding…" : "+ Add as charge column"}
                </button>
              </div>
            ))}
          </div>
        )}

        {parsed.rows.length > 0 && (
          <div className="bg-surface rounded-xl shadow-sm p-4 overflow-x-auto">
            <div className="text-xs font-medium text-text-2 mb-2">Preview (first 3 rows)</div>
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  {parsed.headers.map((h) => (
                    <th key={h} className="px-2 py-1 text-left text-xs text-text-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 3).map((row, i) => (
                  <tr key={i} className="border-t">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 whitespace-nowrap text-ink/70">{cell || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 pb-8">
          <button onClick={() => setStep("upload")} className="px-4 py-2 text-sm rounded border">Back</button>
          <button
            onClick={handleReview}
            disabled={importing}
            className="px-4 py-2 text-sm rounded bg-ink text-white disabled:opacity-60"
          >
            {importing ? "Checking…" : `Import ${parsed.rows.length} Row${parsed.rows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    );
  }

  if (step === "duplicates") {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Some bookings are assigned to a different trucker</h1>
          <p className="text-sm text-text-2 mt-1">
            Reassigning these to {truckerName} would move them away from whoever's currently on them. For each
            one, choose whether this is really the same booking (reassign it) or a different shipment that
            happens to reuse the number (add it as a separate entry — it'll show up on Multiple Bookings &
            Instructions).
          </p>
        </div>

        <div className="bg-surface rounded-xl shadow-sm divide-y">
          {duplicateGroups.map((g) => {
            const key = g.carrierBookingNo.toLowerCase();
            return (
              <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-ink">{g.carrierBookingNo}</div>
                  <div className="text-xs text-text-2">
                    Currently assigned to {g.currentTruckerName ?? "another trucker"} — {g.sheetRows.length} row{g.sheetRows.length === 1 ? "" : "s"} in this file
                  </div>
                </div>
                <select
                  className="border rounded px-2 py-1.5 text-sm"
                  value={resolutions[key] ?? "ignore"}
                  onChange={(e) => setResolutions({ ...resolutions, [key]: e.target.value as Resolution })}
                >
                  <option value="ignore">Reassign to {truckerName}</option>
                  <option value="add">Add as separate booking</option>
                </select>
              </div>
            );
          })}
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 pb-8">
          <button
            onClick={() => commitFinal(Object.fromEntries(duplicateGroups.map((g) => [g.carrierBookingNo.toLowerCase(), "ignore"])))}
            disabled={importing}
            className="px-4 py-2 text-sm rounded border disabled:opacity-60"
          >
            Reassign All
          </button>
          <button
            onClick={() => commitFinal(resolutions)}
            disabled={importing}
            className="px-4 py-2 text-sm rounded bg-ink text-white disabled:opacity-60"
          >
            {importing ? "Importing…" : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "result" && result) {
    return (
      <div className="max-w-lg mx-auto mt-12 space-y-4">
        <h1 className="text-xl font-semibold text-center">Import complete</h1>
        <div className="bg-surface rounded-xl shadow-sm p-6 text-center space-y-1">
          <div className="text-3xl font-semibold text-ink">{result.imported}</div>
          <div className="text-sm text-text-2">of {result.total} rows matched and updated</div>
        </div>

        {result.skipped.length > 0 && (
          <div className="bg-surface rounded-xl shadow-sm p-4">
            <div className="text-sm font-medium text-ink mb-2">Skipped rows ({result.skipped.length})</div>
            <ul className="text-sm text-text-2 space-y-1 max-h-64 overflow-y-auto">
              {result.skipped.map((s, i) => (
                <li key={i}>Row {s.row}: {s.reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-center">
          <Link href={backHref} className="inline-block px-4 py-2 text-sm rounded bg-ink text-white">
            Go to {truckerName}'s Invoices
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
