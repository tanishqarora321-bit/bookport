"use client";

import { useState } from "react";
import Link from "next/link";
import { SUPPLIER_INVOICE_IMPORT_FIELDS } from "@/lib/supplier-invoice-import-fields";
import { resolveSuggestedHeader } from "@/lib/match-header";

type ParseResult = { headers: string[]; rows: string[][]; suggestedMapping: Record<string, string | null> };
type CommitResult = { imported: number; total: number; skipped: { row: number; reason?: string }[] };

export default function SupplierInvoiceImportClient({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  const [step, setStep] = useState<"upload" | "mapping" | "result">("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState("EUR");
  const [fxRate, setFxRate] = useState("1");
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

  async function handleImport() {
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
          currency,
          fxRate: Number(fxRate) || 1,
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
      <div className="h-full flex flex-col">
        <Link href={backHref} className="text-sm text-accent mb-2 w-fit inline-flex items-center gap-1 hover:underline">
          ← Back to {supplierName}'s Invoices
        </Link>
        <div className="max-w-lg mx-auto mt-12 space-y-4 w-full">
          <h1 className="text-xl font-semibold text-center">Import Invoices from Excel</h1>
          <p className="text-sm text-slate-500 text-center">
            A statement where one invoice spans several rows - a row with a Booking Number starts a new invoice, and
            the Description/Weight/Unit Price rows under it (Booking Number left blank) become that invoice's cost
            lines, until the next Booking Number starts the next invoice.
          </p>
          <label className="block border-2 border-dashed rounded-lg p-10 bg-white hover:border-accent text-center cursor-pointer">
            <div className="font-medium">{uploading ? "Reading file…" : "Click to choose a file"}</div>
            <div className="text-sm text-slate-500 mt-1">.xlsx — first sheet; the header row is found automatically even with a title banner above it</div>
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
          <p className="text-sm text-slate-500 mt-1">
            {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} found. AI has pre-filled its best guess for
            each field — review and correct anything before importing.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-ink/40 mb-0.5">Currency (applies to this whole file)</div>
            <select className="border rounded px-2 py-1.5 text-sm w-full" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="INR">INR</option>
              <option value="GBP">GBP</option>
              <option value="AED">AED</option>
            </select>
          </div>
          <div>
            <div className="text-xs text-ink/40 mb-0.5">FX Rate → USD (applies to this whole file)</div>
            <input
              type="number"
              step="0.0001"
              className="border rounded px-2 py-1.5 text-sm w-full"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm divide-y">
          {SUPPLIER_INVOICE_IMPORT_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-3 gap-3 items-center px-4 py-2.5">
              <label className="text-sm text-slate-700">
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
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-1">
            <div className="text-xs font-medium text-amber-800">These columns in your sheet aren't mapped to anything above:</div>
            <div className="text-sm text-amber-700">{unmappedHeaders.join(", ")}</div>
          </div>
        )}

        {parsed.rows.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 overflow-x-auto">
            <div className="text-xs font-medium text-slate-500 mb-2">Preview (first 6 rows)</div>
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  {parsed.headers.map((h) => (
                    <th key={h} className="px-2 py-1 text-left text-xs text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 6).map((row, i) => (
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
            {importing ? "Importing…" : "Import"}
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
          <div className="text-sm text-slate-500">of {result.total} invoices created</div>
        </div>

        {result.skipped.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="text-sm font-medium text-ink mb-2">Skipped ({result.skipped.length})</div>
            <ul className="text-sm text-slate-600 space-y-1 max-h-64 overflow-y-auto">
              {result.skipped.map((s, i) => (
                <li key={i}>Row {s.row}: {s.reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-center">
          <Link href={backHref} className="inline-block px-4 py-2 text-sm rounded bg-ink text-white">
            Go to {supplierName}'s Invoices
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
