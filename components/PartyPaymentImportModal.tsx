"use client";

import { useState } from "react";
import { PARTY_PAYMENT_IMPORT_FIELDS } from "@/lib/party-payment-import-fields";
import { resolveSuggestedHeader } from "@/lib/match-header";

type ParseResult = { headers: string[]; rows: string[][]; suggestedMapping: Record<string, string | null>; suggestionFailed?: boolean };
type CommitResult = { imported: number; total: number; skipped: { row: number; reason: string }[] };

// Shared by Forwarders/Truckers/Suppliers' Payment History (see
// components/PartyPaymentHistory.tsx) - a much smaller version of the
// invoice-import wizard (6 fields, no custom columns, no duplicate
// detection), so it's a single modal rather than a whole page.
export default function PartyPaymentImportModal({
  partyId,
  onClose,
  onImported,
}: {
  partyId: string;
  onClose: () => void;
  onImported: () => void;
}) {
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
      const res = await fetch("/api/party-payments/import/parse", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read that file");

      setParsed(json);
      const initialMapping: Record<string, string> = {};
      for (const f of PARTY_PAYMENT_IMPORT_FIELDS) {
        const resolved = resolveSuggestedHeader(json.headers, json.suggestedMapping?.[f.key]);
        if (resolved) initialMapping[f.key] = resolved;
      }
      setMapping(initialMapping);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleImport() {
    if (!parsed) return;
    if (!mapping["amount"]) {
      setError("Amount must be mapped to a column before importing.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/party-payments/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyId, headers: parsed.headers, rows: parsed.rows, mapping }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      setResult(json);
      onImported();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface border border-line rounded-xl shadow-lg p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Import Payments from Excel</h2>
            <p className="text-xs text-muted mt-0.5">.xlsx — first sheet, first row must be headers</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink text-xl leading-none">✕</button>
        </div>

        {result ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-success-soft text-success flex items-center justify-center text-2xl">✓</div>
            <div className="text-base font-semibold text-ink">Import complete</div>
            <div className="flex gap-2 flex-wrap justify-center">
              <span className="text-xs font-semibold bg-success-soft text-success rounded-full px-3 py-1">{result.imported} imported</span>
              {result.skipped.length > 0 && <span className="text-xs font-semibold bg-surface-2 text-muted rounded-full px-3 py-1">{result.skipped.length} skipped</span>}
            </div>
            <div className="text-xs text-muted">of {result.total} row{result.total === 1 ? "" : "s"}</div>
            {result.skipped.length > 0 && (
              <div className="w-full text-left bg-surface-2 border border-line rounded-lg p-3 max-h-40 overflow-y-auto">
                <ul className="text-xs text-text-2 flex flex-col gap-1">
                  {result.skipped.map((s, i) => (
                    <li key={i}>Row {s.row}: {s.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            <button onClick={onClose} className="text-sm bg-accent text-white hover:bg-accent-hover rounded-lg px-4 py-2 font-medium mt-2">
              Close
            </button>
          </div>
        ) : !parsed ? (
          <label className="border-2 border-dashed border-line rounded-xl p-8 flex flex-col items-center gap-2 text-center cursor-pointer hover:bg-surface-2">
            <span className="font-semibold text-ink">{uploading ? "Reading file…" : "Click to choose a file"}</span>
            <span className="text-xs text-muted">.xlsx with Amount, Date, Currency, etc.</span>
            <input type="file" accept=".xlsx" className="sr-only" onChange={handleUpload} disabled={uploading} />
          </label>
        ) : (
          <>
            <p className="text-xs text-muted">{parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"} found. Review the mapping below before importing.</p>
            {parsed.suggestionFailed && (
              <p className="text-xs text-critical font-medium">Couldn&apos;t generate auto-mapping suggestions for this file — map each field below by hand.</p>
            )}
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-1.5 pr-2 font-medium text-xs">Field</th>
                  <th className="py-1.5 font-medium text-xs">Column in your file</th>
                </tr>
              </thead>
              <tbody>
                {PARTY_PAYMENT_IMPORT_FIELDS.map((f) => (
                  <tr key={f.key} className="border-b border-line">
                    <td className="py-2 pr-2">{f.label} {f.required && <span className="text-critical">*</span>}</td>
                    <td className="py-2">
                      <select
                        className="border border-line rounded-lg px-2 py-1.5 text-sm bg-surface w-full"
                        value={mapping[f.key] ?? ""}
                        onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                      >
                        <option value="">— Skip —</option>
                        {parsed.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {unmappedHeaders.length > 0 && (
              <div className="bg-warning-soft border border-ai-border rounded-lg p-3 max-h-32 overflow-y-auto">
                <div className="text-xs font-semibold text-warning mb-1">These columns in your sheet aren&apos;t mapped to anything above:</div>
                <div className="text-xs text-text-2">{unmappedHeaders.join(", ")}</div>
              </div>
            )}

            {error && <p className="text-xs text-critical font-medium">{error}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="text-sm bg-accent text-white hover:bg-accent-hover rounded-lg px-4 py-2 font-medium disabled:opacity-60"
              >
                {importing ? "Importing…" : `Import ${parsed.rows.length} Row${parsed.rows.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}

        {error && !parsed && <p className="text-xs text-critical font-medium">{error}</p>}
      </div>
    </div>
  );
}
