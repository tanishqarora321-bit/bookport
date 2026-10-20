"use client";

import { useState } from "react";
import Link from "next/link";
import { BUYER_INVOICE_IMPORT_FIELDS } from "@/lib/buyer-invoice-import-fields";
import { resolveSuggestedHeader } from "@/lib/match-header";

type ParseResult = { headers: string[]; rows: string[][]; suggestedMapping: Record<string, string | null> };
type CommitResult = { imported: number; total: number; skipped: { row: number; reason?: string }[] };

// Mirrors components/SupplierInvoiceImportClient.tsx, minus the
// currency/FX-rate picker on the mapping screen -- that was tied to
// supplier's whole-file grouping logic, and buyer invoices default to USD
// per the schema with no equivalent whole-file setting to collect here.
export default function BuyerInvoiceImportClient({ buyerId, buyerName }: { buyerId: string; buyerName: string }) {
  const [step, setStep] = useState<"upload" | "mapping" | "result">("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);

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
      const res = await fetch("/api/buyer-invoices/import/parse", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read that file");

      setParsed(json);
      const initialMapping: Record<string, string> = {};
      for (const f of BUYER_INVOICE_IMPORT_FIELDS) {
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

  async function handleImport() {
    if (!parsed) return;
    if (!mapping["invoice_number"]) {
      setError("Invoice Number must be mapped to a column before importing.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/buyer-invoices/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerId,
          headers: parsed.headers,
          rows: parsed.rows,
          mapping,
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

  const backHref = `/parties/${buyerId}/invoices`;

  if (step === "upload") {
    return (
      <div className="h-full flex flex-col">
        <Link href={backHref} className="text-sm text-accent mb-2 w-fit inline-flex items-center gap-1 hover:underline">
          ← Back to {buyerName}'s Invoices
        </Link>
        <div className="max-w-lg mx-auto mt-12 space-y-4 w-full">
          <h1 className="text-xl font-semibold text-center text-ink">Import Invoices from Excel</h1>
          <p className="text-sm text-text-2 text-center">
            A buyer account statement where each row is one complete invoice - Invoice Value, Freight, Trucking, and
            Commission are separate columns on that same row, each becoming one of that invoice's cost lines.
          </p>
          <label className="block border-2 border-dashed border-line rounded-lg p-10 bg-surface hover:border-accent text-center cursor-pointer">
            <div className="font-medium text-ink">{uploading ? "Reading file…" : "Click to choose a file"}</div>
            <div className="text-sm text-text-2 mt-1">.xlsx — first sheet; the header row is found automatically even with a title banner above it</div>
            <input type="file" accept=".xlsx" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          {error && <p className="text-cutoff text-sm text-center">{error}</p>}
        </div>
      </div>
    );
  }

  if (step === "mapping" && parsed) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Match your columns</h1>
          <p className="text-sm text-text-2 mt-1">
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} found. AI has pre-filled its best guess for
            each field — review and correct anything before importing.
          </p>
        </div>

        <div className="bg-surface border border-line rounded-xl divide-y divide-line">
          {BUYER_INVOICE_IMPORT_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-3 gap-3 items-center px-4 py-2.5">
              <label className="text-sm text-ink">
                {f.label} {(f as any).required && <span className="text-cutoff">*</span>}
              </label>
              <select
                className="col-span-2 border border-line bg-surface rounded-lg px-2 py-1.5 text-sm"
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
          <div className="border border-warning/30 bg-warning-soft rounded-lg p-3 space-y-1">
            <div className="text-xs font-medium text-warning">These columns in your sheet aren't mapped to anything above:</div>
            <div className="text-sm text-warning">{unmappedHeaders.join(", ")}</div>
          </div>
        )}

        {parsed.rows.length > 0 && (
          <div className="bg-surface border border-line rounded-xl p-4 overflow-x-auto">
            <div className="text-xs font-medium text-text-2 mb-2">Preview (first 6 rows)</div>
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  {parsed.headers.map((h) => (
                    <th key={h} className="px-2 py-1 text-left text-xs text-text-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 6).map((row, i) => (
                  <tr key={i} className="border-t border-line">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 whitespace-nowrap text-text-2">{cell || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className="text-cutoff text-sm">{error}</p>}

        <div className="flex justify-end gap-3 pt-2 pb-8">
          <button onClick={() => setStep("upload")} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-4 py-2 text-sm">Back</button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="bg-accent text-white hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "result" && result) {
    return (
      <div className="max-w-lg mx-auto mt-12 space-y-4">
        <h1 className="text-xl font-semibold text-center text-ink">Import complete</h1>
        <div className="bg-surface border border-line rounded-xl p-6 text-center space-y-1">
          <div className="text-3xl font-semibold text-ink">{result.imported}</div>
          <div className="text-sm text-text-2">of {result.total} invoices created</div>
        </div>

        {result.skipped.length > 0 && (
          <div className="bg-surface border border-line rounded-xl p-4">
            <div className="text-sm font-medium text-ink mb-2">Skipped ({result.skipped.length})</div>
            <ul className="text-sm text-text-2 space-y-1 max-h-64 overflow-y-auto">
              {result.skipped.map((s, i) => (
                <li key={i}>Row {s.row}: {s.reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-center">
          <Link href={backHref} className="inline-block bg-accent text-white hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium">
            Go to {buyerName}'s Invoices
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
