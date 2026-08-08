"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FieldVal = { value: string | null; confidence: number; source_quote: string };
type Extracted = Record<string, FieldVal>;

// Maps the extraction schema's field names to the actual bookings table
// columns (see migration 0002 for which ones are new vs. pre-existing).
const FIELD_MAP: { key: string; column: string; label: string; extractKey: string }[] = [
  { key: "booking_number", column: "carrier_booking_no", label: "Booking Number", extractKey: "booking_number" },
  { key: "erd", column: "erd", label: "ERD", extractKey: "erd" },
  { key: "doc_cutoff", column: "si_cutoff", label: "DOC Cut Off", extractKey: "doc_cutoff" },
  { key: "cargo_cutoff", column: "cargo_cutoff", label: "Cargo Cut Off", extractKey: "cargo_cutoff" },
  { key: "pol", column: "pol", label: "POL", extractKey: "pol" },
  { key: "port_of_discharge", column: "pod", label: "Port of Discharge", extractKey: "port_of_discharge" },
  { key: "port_of_delivery", column: "final_destination", label: "Port of Delivery", extractKey: "port_of_delivery" },
  { key: "bl_issued_at", column: "bl_issued_at", label: "B/L Issued At", extractKey: "bl_issued_at" },
  { key: "shipping_line", column: "carrier", label: "Shipping Line", extractKey: "shipping_line" },
  { key: "forwarder_name", column: "forwarder_name", label: "Forwarder Name", extractKey: "forwarder_name" },
  { key: "container_size", column: "container_size", label: "Size Of Container", extractKey: "container_size" }
];

export default function NewBookingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "manual" | "review">("choose");
  const [uploading, setUploading] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(FIELD_MAP.map((f) => [f.column, ""]))
  );

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Extraction failed");

      setExtracted(json.extracted);
      setDocumentId(json.document.id);

      const next: Record<string, string> = {};
      for (const f of FIELD_MAP) {
        next[f.column] = json.extracted?.[f.extractKey]?.value ?? "";
      }
      setForm(next);
      setMode("review");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setError(null);

    if (!form["carrier_booking_no"]) {
      setError("Booking Number is required — this field can't be left blank.");
      return;
    }

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, status: "confirmed", _source_document_id: documentId })
    });
    const json = await res.json();
    if (res.ok) window.location.href = `/bookings/${json.booking.id}`;
    else setError(json.error);
  }

  if (mode === "choose") {
    return (
      <div className="max-w-lg mx-auto mt-12 space-y-4">
        <h1 className="text-xl font-semibold text-center">New Booking</h1>
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => setMode("manual")} className="border rounded-lg p-6 bg-white hover:border-ink text-left">
            <div className="font-medium">Type it in</div>
            <div className="text-sm text-slate-500">Fill the Booking & Instructions form by hand.</div>
          </button>
          <label className="border rounded-lg p-6 bg-white hover:border-ink text-left cursor-pointer">
            <div className="font-medium">Upload PDF</div>
            <div className="text-sm text-slate-500">
              {uploading ? "Extracting…" : "Booking confirmation → AI pre-fills the form, you review."}
            </div>
            <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-1">
      <h1 className="text-xl font-semibold mb-4">
        {mode === "review" ? "Review extracted fields" : "New Booking"}
      </h1>
      {mode === "review" && (
        <p className="text-sm text-slate-500 mb-4">
          AI-filled fields are marked. Confirm or correct each one — nothing is saved until you click Save.
        </p>
      )}

      {FIELD_MAP.map((f) => {
        const meta = extracted?.[f.extractKey];
        const lowConfidence = meta && meta.confidence < 0.6;
        const isMandatory = f.key === "booking_number";
        return (
          <div key={f.key} className="grid grid-cols-3 gap-3 items-start py-1.5 border-b last:border-0">
            <label className="text-sm text-slate-600 pt-2">
              {f.label} {isMandatory && <span className="text-cutoff">*</span>}
            </label>
            <div className="col-span-2">
              <input
                className={`w-full border rounded px-2 py-1.5 text-sm ${
                  meta ? "border-amber-400 bg-amber-50" : "border-slate-300"
                } ${lowConfidence ? "border-cutoff" : ""}`}
                value={form[f.column] ?? ""}
                onChange={(e) => setForm({ ...form, [f.column]: e.target.value })}
                placeholder={
                  isMandatory && !form[f.column] ? "Required" : lowConfidence ? "Low confidence — please verify" : ""
                }
              />
              {meta?.source_quote && (
                <div className="text-xs text-slate-400 mt-0.5">from PDF: "{meta.source_quote}"</div>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex justify-end gap-3 pt-4">
        <button onClick={() => setMode("choose")} className="px-4 py-2 text-sm rounded border">
          Back
        </button>
        <button onClick={handleSave} className="px-4 py-2 text-sm rounded bg-ink text-white">
          Save Booking
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
