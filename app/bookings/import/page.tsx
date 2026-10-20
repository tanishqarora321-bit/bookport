"use client";

import { useState } from "react";
import Link from "next/link";
import { IMPORT_FIELDS } from "@/lib/booking-import-fields";
import { resolveSuggestedHeader } from "@/lib/match-header";

type ParseResult = { headers: string[]; rows: string[][]; suggestedMapping: Record<string, string | null> };
type CommitResult = { imported: number; total: number; skipped: { row: number; reason?: string }[] };
type DuplicateGroup = { carrierBookingNo: string; containerCount: number; sheetRows: number[] };
type Resolution = "add" | "ignore";

export default function ImportBookingsPage() {
  const [step, setStep] = useState<"upload" | "mapping" | "duplicates" | "result">("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});

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
        body: JSON.stringify({ headers: parsed.headers, rows: parsed.rows, mapping, dryRun: true })
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
      const res = await fetch("/api/bookings/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: parsed.headers, rows: parsed.rows, mapping, duplicateResolutions: finalResolutions })
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
      <div className="max-w-lg mx-auto mt-12 space-y-4">
        <h1 className="text-xl font-semibold text-center">Import Bookings from Excel</h1>
        <p className="text-sm text-text-2 text-center">
          Upload an .xlsx spreadsheet of existing bookings. You'll match its columns to Ship-Sphere's
          fields before anything is saved.
        </p>
        <label className="block border-2 border-dashed rounded-lg p-10 bg-surface hover:border-accent text-center cursor-pointer">
          <div className="font-medium">{uploading ? "Reading file…" : "Click to choose a file"}</div>
          <div className="text-sm text-text-2 mt-1">.xlsx — first sheet, first row must be headers</div>
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}
        <div className="text-center">
          <Link href="/bookings/new" className="text-sm text-accent hover:underline">
            ← Back
          </Link>
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
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} found. AI has pre-filled its best guess
            for each field below — review and correct anything before importing. Fields left as "— Skip —" won't
            be imported.
          </p>
        </div>

        <div className="bg-surface rounded-xl shadow-sm divide-y">
          {IMPORT_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-3 gap-3 items-center px-4 py-2.5">
              <label className="text-sm text-ink">
                {f.label} {f.required && <span className="text-cutoff">*</span>}
              </label>
              <select
                className="col-span-2 border rounded px-2 py-1.5 text-sm"
                value={mapping[f.key] ?? ""}
                onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
              >
                <option value="">— Skip —</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {parsed.rows.length > 0 && (
          <div className="bg-surface rounded-xl shadow-sm p-4 overflow-x-auto">
            <div className="text-xs font-medium text-text-2 mb-2">Preview (first 3 rows)</div>
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  {parsed.headers.map((h) => (
                    <th key={h} className="px-2 py-1 text-left text-xs text-text-2 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 3).map((row, i) => (
                  <tr key={i} className="border-t">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 whitespace-nowrap text-ink/70">
                        {cell || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 pb-8">
          <button onClick={() => setStep("upload")} className="px-4 py-2 text-sm rounded border">
            Back
          </button>
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
          <h1 className="text-xl font-semibold">Some Booking Numbers already exist</h1>
          <p className="text-sm text-text-2 mt-1">
            These are already saved in Booking & Instructions. For each one, choose whether this is an
            intentional second entry (it'll show up on Multiple Bookings & Instructions) or should be
            ignored — you can always add it there yourself later.
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
                    {g.sheetRows.length} row{g.sheetRows.length === 1 ? "" : "s"} in this file
                    {g.containerCount > 1 ? ` (${g.containerCount} containers)` : ""}
                  </div>
                </div>
                <select
                  className="border rounded px-2 py-1.5 text-sm"
                  value={resolutions[key] ?? "ignore"}
                  onChange={(e) => setResolutions({ ...resolutions, [key]: e.target.value as Resolution })}
                >
                  <option value="ignore">Ignore</option>
                  <option value="add">Add to Multiple Bookings</option>
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
            Ignore All
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
          <div className="text-sm text-text-2">of {result.total} rows imported</div>
        </div>

        {result.skipped.length > 0 && (
          <div className="bg-surface rounded-xl shadow-sm p-4">
            <div className="text-sm font-medium text-ink mb-2">Skipped rows ({result.skipped.length})</div>
            <ul className="text-sm text-text-2 space-y-1 max-h-64 overflow-y-auto">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  Row {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-center">
          <Link href="/bookings" className="inline-block px-4 py-2 text-sm rounded bg-ink text-white">
            Go to Booking & Instructions
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
