"use client";

import { useState } from "react";
import Link from "next/link";
import { SUPPLIER_INVOICE_IMPORT_FIELDS } from "@/lib/supplier-invoice-import-fields";
import { resolveSuggestedHeader } from "@/lib/match-header";

type ParseResult = { headers: string[]; rows: string[][]; suggestedMapping: Record<string, string | null> };
type CommitResult = { imported: number; total: number; skipped: { row: number; reason?: string }[] };

const STEP_ORDER = ["upload", "mapping", "result"] as const;
type Step = (typeof STEP_ORDER)[number];
const STEP_LABELS: Record<Step, string> = {
  upload: "Upload",
  mapping: "Match columns",
  result: "Done",
};

export default function SupplierInvoiceImportClient({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  const [step, setStep] = useState<Step>("upload");
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
      <div className="max-w-2xl mx-auto space-y-5 py-6">
        <Link href={backHref} className="lbl" style={{ display: "inline-flex", alignItems: "center", gap: 4, width: "fit-content" }}>
          ← Back to {supplierName}&apos;s Invoices
        </Link>
        <div>
          <h1 className="h1">Import Invoices from Excel</h1>
          <p className="sub">
            A statement where one invoice spans several rows - a row with a Booking Number starts a new invoice, and
            the Description/Weight/Unit Price rows under it (Booking Number left blank) become that invoice&apos;s cost
            lines, until the next Booking Number starts the next invoice.
          </p>
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
              <select
                id="supplier-import-currency"
                className="select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="INR">INR</option>
                <option value="GBP">GBP</option>
                <option value="AED">AED</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="supplier-import-fx">FX Rate → USD (applies to this whole file)</label>
              <input
                id="supplier-import-fx"
                type="number"
                step="0.0001"
                className="input"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
              />
            </div>
          </div>
        </section>

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
                  {SUPPLIER_INVOICE_IMPORT_FIELDS.map((f) => {
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

            {unmappedHeaders.length > 0 && (
              <div className="banner bn-warn" style={{ margin: 16, flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--warn)" }}>These columns in your sheet aren&apos;t mapped to anything above:</div>
                <div style={{ fontSize: 13, color: "var(--tx2)" }}>{unmappedHeaders.join(", ")}</div>
              </div>
            )}
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
                <button onClick={handleImport} disabled={importing} className="btn btn-p">
                  {importing ? "Importing…" : "Import"}
                </button>
              </div>
            </div>
          </section>
        </div>

        {error && <p className="err">{error}</p>}
      </div>
    );
  }

  if (step === "result" && result) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 py-6">
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
          <div className="meta">of {result.total} invoice{result.total === 1 ? "" : "s"} created</div>

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
