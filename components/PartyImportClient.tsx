"use client";

import { useState } from "react";
import Link from "next/link";
import { PARTY_IMPORT_FIELDS, type PartyRole } from "@/lib/party-import-fields";

type ParseResult = { headers: string[]; rows: string[][]; suggestedMapping: Record<string, string | null> };
type CommitResult = { imported: number; total: number; skipped: { row: number; reason?: string }[] };

// Reused by every party role's import page (Forwarders today; Truckers/
// Suppliers/Buyers can each add a one-line app/<role>/import/page.tsx
// that just renders this with a different role/label/backHref).
export default function PartyImportClient({
  role, roleLabel, backHref
}: { role: PartyRole; roleLabel: string; backHref: string }) {
  const [step, setStep] = useState<"upload" | "mapping" | "result">("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/parties/import/parse", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read that file");

      setParsed(json);
      const initialMapping: Record<string, string> = {};
      for (const f of PARTY_IMPORT_FIELDS) {
        const suggested = json.suggestedMapping?.[f.key];
        if (suggested && json.headers.includes(suggested)) initialMapping[f.key] = suggested;
      }
      setMapping(initialMapping);
      setStep("mapping");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleImport() {
    if (!parsed) return;
    if (!mapping["legal_name"]) {
      setError("Name must be mapped to a column before importing.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/parties/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: parsed.headers, rows: parsed.rows, mapping, role })
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
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
          ← Back to {roleLabel}s
        </Link>
        <h1 className="text-xl font-semibold text-center">Import {roleLabel}s from Excel</h1>
        <p className="text-sm text-slate-500 text-center">
          Upload an .xlsx spreadsheet of existing {roleLabel.toLowerCase()}s. You'll match its columns to
          Ship-Sphere's fields before anything is saved.
        </p>
        <label className="block border-2 border-dashed rounded-lg p-10 bg-white hover:border-accent text-center cursor-pointer">
          <div className="font-medium">{uploading ? "Reading file…" : "Click to choose a file"}</div>
          <div className="text-sm text-slate-500 mt-1">.xlsx — first sheet, first row must be headers</div>
          <input type="file" accept=".xlsx" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}
      </div>
    );
  }

  if (step === "mapping" && parsed) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Match your columns</h1>
          <p className="text-sm text-slate-500 mt-1">
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} found. AI has pre-filled its best guess for
            each field below — review and correct anything before importing. Fields left as "— Skip —" won't be
            imported.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm divide-y">
          {PARTY_IMPORT_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-3 gap-3 items-center px-4 py-2.5">
              <label className="text-sm text-slate-700">
                {f.key === "legal_name" ? `${roleLabel} Name` : f.label} {f.required && <span className="text-cutoff">*</span>}
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

        {parsed.rows.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 overflow-x-auto">
            <div className="text-xs font-medium text-slate-500 mb-2">Preview (first 3 rows)</div>
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  {parsed.headers.map((h) => (
                    <th key={h} className="px-2 py-1 text-left text-xs text-slate-500 whitespace-nowrap">{h}</th>
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
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 text-sm rounded bg-ink text-white disabled:opacity-60"
          >
            {importing ? "Importing…" : `Import ${parsed.rows.length} Row${parsed.rows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    );
  }

  if (step === "result" && result) {
    return (
      <div className="max-w-lg mx-auto mt-12 space-y-4">
        <h1 className="text-xl font-semibold text-center">Import complete</h1>
        <div className="bg-white rounded-xl shadow-sm p-6 text-center space-y-1">
          <div className="text-3xl font-semibold text-ink">{result.imported}</div>
          <div className="text-sm text-slate-500">of {result.total} rows imported</div>
        </div>

        {result.skipped.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="text-sm font-medium text-ink mb-2">Skipped rows ({result.skipped.length})</div>
            <ul className="text-sm text-slate-600 space-y-1 max-h-64 overflow-y-auto">
              {result.skipped.map((s, i) => (
                <li key={i}>Row {s.row}: {s.reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-center">
          <Link href={backHref} className="inline-block px-4 py-2 text-sm rounded bg-ink text-white">
            Go to {roleLabel}s
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
