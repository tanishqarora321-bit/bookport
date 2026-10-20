"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type FieldVal = { value: string | null; confidence: number; source_quote: string };
type Extracted = Record<string, FieldVal>;

// Best-effort conversion to the format <input type="datetime-local">
// requires. Returns "" for an empty field (still renders the picker,
// just empty) and null when the value can't be parsed as a date at
// all (e.g. an odd AI-extracted date format) - null falls back to a
// plain text box below so nothing extracted is ever silently dropped.
function toLocalInputValue(v: string): string | null {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Maps the extraction schema's field names to the actual bookings table
// columns (see migration 0002 for which ones are new vs. pre-existing).
const FIELD_MAP: { key: string; column: string; label: string; extractKey: string; isDate?: boolean }[] = [
  { key: "booking_number", column: "carrier_booking_no", label: "Booking Number", extractKey: "booking_number" },
  { key: "erd", column: "erd", label: "ERD", extractKey: "erd", isDate: true },
  { key: "doc_cutoff", column: "si_cutoff", label: "DOC Cut Off", extractKey: "doc_cutoff", isDate: true },
  { key: "cargo_cutoff", column: "cargo_cutoff", label: "Cargo Cut Off", extractKey: "cargo_cutoff", isDate: true },
  { key: "pol", column: "pol", label: "POL", extractKey: "pol" },
  { key: "port_of_discharge", column: "pod", label: "Port of Discharge", extractKey: "port_of_discharge" },
  { key: "port_of_delivery", column: "final_destination", label: "Port of Delivery", extractKey: "port_of_delivery" },
  { key: "bl_issued_at", column: "bl_issued_at", label: "B/L Issued At", extractKey: "bl_issued_at" },
  { key: "shipping_line", column: "carrier", label: "Shipping Line", extractKey: "shipping_line" },
  { key: "forwarder_name", column: "forwarder_name", label: "Forwarder Name", extractKey: "forwarder_name" },
  { key: "container_size", column: "container_size", label: "Size Of Container", extractKey: "container_size" }
];

export default function NewBookingPage() {
  return (
    <Suspense fallback={null}>
      <NewBookingPageInner />
    </Suspense>
  );
}

function NewBookingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Reached via the "+ New Booking" link on the Multiple Bookings &
  // Instructions page - that page is only for booking numbers already
  // used elsewhere, so this entry is required to match an existing one
  // (enforced server-side too, see app/api/bookings/route.ts).
  const forMultiple = searchParams.get("forMultiple") === "1";
  const [mode, setMode] = useState<"choose" | "manual" | "review">("choose");
  const [uploading, setUploading] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Set when the server reports this Booking Number already exists and
  // this isn't the Multiple Bookings entry form (where a match is
  // expected/required) - asks the user to confirm before creating a
  // second, intentional entry that'll show up on Multiple Bookings.
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ existing: { status: string; created_at: string } } | null>(null);

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

  async function handleSave(force = false) {
    setError(null);
    setDuplicateConfirm(null);

    if (!form["carrier_booking_no"]) {
      setError("Booking Number is required — this field can't be left blank.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          status: "confirmed",
          _source_document_id: documentId,
          ...(forMultiple ? { requireDuplicateOf: true } : {}),
          ...(force ? { force: true } : {}),
        })
      });
      const json = await res.json();
      if (res.ok) {
        window.location.href = `/bookings/${json.booking.id}`;
        return;
      }
      if (json.duplicate && json.existing) {
        setDuplicateConfirm({ existing: json.existing });
        return;
      }
      setError(json.error);
    } finally {
      setSaving(false);
    }
  }

  if (mode === "choose") {
    return (
      <div className="h-full flex flex-col">
        <Link href={forMultiple ? "/bookings/multiple" : "/bookings"} className="text-sm text-accent mb-2 w-fit inline-flex items-center gap-1 hover:underline">
          ← Back to {forMultiple ? "Multiple Bookings & Instructions" : "Bookings"}
        </Link>
        <div className="max-w-2xl mx-auto mt-12 space-y-4 w-full">
          <h1 className="text-xl font-semibold text-center">{forMultiple ? "New Entry in Multiple Bookings" : "New Booking"}</h1>
          {forMultiple && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
              Only for an intentional second entry under a Booking Number already in Booking & Instructions — Excel import isn't available here.
            </p>
          )}
          <div className={forMultiple ? "grid grid-cols-2 gap-4" : "grid grid-cols-3 gap-4"}>
            <button onClick={() => setMode("manual")} className="border rounded-lg p-6 bg-surface hover:border-ink text-left">
              <div className="font-medium">Type it in</div>
              <div className="text-sm text-text-2">Fill the Booking & Instructions form by hand.</div>
            </button>
            <label className="border rounded-lg p-6 bg-surface hover:border-ink text-left cursor-pointer">
              <div className="font-medium">Upload PDF</div>
              <div className="text-sm text-text-2">
                {uploading ? "Extracting…" : "Booking confirmation → AI pre-fills the form, you review."}
              </div>
              <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            {!forMultiple && (
              <Link href="/bookings/import" className="border rounded-lg p-6 bg-surface hover:border-ink text-left block">
                <div className="font-medium">Import Excel</div>
                <div className="text-sm text-text-2">Bring in existing bookings from a spreadsheet, in bulk.</div>
              </Link>
            )}
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col max-w-2xl space-y-1">
      <Link href={forMultiple ? "/bookings/multiple" : "/bookings"} className="text-sm text-accent mb-2 w-fit inline-flex items-center gap-1 hover:underline">
        ← Back to {forMultiple ? "Multiple Bookings & Instructions" : "Bookings"}
      </Link>
      <h1 className="text-xl font-semibold mb-4">
        {mode === "review" ? "Review extracted fields" : forMultiple ? "New Entry in Multiple Bookings" : "New Booking"}
      </h1>
      {mode === "review" && (
        <p className="text-sm text-text-2 mb-4">
          AI-filled fields are marked. Confirm or correct each one — nothing is saved until you click Save.
        </p>
      )}
      {forMultiple && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2 mb-4">
          This entry only saves if its Booking Number already exists in Booking & Instructions — it's meant for an intentional second entry under a number already in use, not a new one.
        </p>
      )}

      {FIELD_MAP.map((f) => {
        const meta = extracted?.[f.extractKey];
        const lowConfidence = meta && meta.confidence < 0.6;
        const isMandatory = f.key === "booking_number";
        const dateVal = f.isDate ? toLocalInputValue(form[f.column] ?? "") : null;
        const inputClass = `w-full border rounded px-2 py-1.5 text-sm ${
          meta ? "border-amber-400 bg-amber-50" : "border-line-2"
        } ${lowConfidence ? "border-cutoff" : ""}`;
        return (
          <div key={f.key} className="grid grid-cols-3 gap-3 items-start py-1.5 border-b last:border-0">
            <label className="text-sm text-text-2 pt-2">
              {f.label} {isMandatory && <span className="text-cutoff">*</span>}
            </label>
            <div className="col-span-2">
              {dateVal !== null ? (
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={dateVal}
                  onChange={(e) => setForm({ ...form, [f.column]: e.target.value })}
                />
              ) : (
                <input
                  className={inputClass}
                  value={form[f.column] ?? ""}
                  onChange={(e) => setForm({ ...form, [f.column]: e.target.value })}
                  placeholder={
                    isMandatory && !form[f.column] ? "Required" : lowConfidence ? "Low confidence — please verify" : ""
                  }
                />
              )}
              {meta?.source_quote && (
                <div className="text-xs text-muted mt-0.5">from PDF: "{meta.source_quote}"</div>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex justify-end gap-3 pt-4">
        <button onClick={() => setMode("choose")} className="px-4 py-2 text-sm rounded border">
          Back
        </button>
        <button onClick={() => handleSave()} disabled={saving} className="px-4 py-2 text-sm rounded bg-ink text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save Booking"}
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {duplicateConfirm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setDuplicateConfirm(null)}>
          <div className="bg-surface rounded-lg shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink mb-2">Booking Number already exists</h2>
            <p className="text-sm text-text-2 mb-1">
              "{form["carrier_booking_no"]}" is already used by a booking created{" "}
              {new Date(duplicateConfirm.existing.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              {" "}(status: {duplicateConfirm.existing.status}).
            </p>
            <p className="text-sm text-text-2 mb-4">
              Save this as a second, separate entry anyway? Both will move to Multiple Bookings & Instructions for review.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDuplicateConfirm(null)} className="px-4 py-2 text-sm rounded border">
                Cancel
              </button>
              <button onClick={() => handleSave(true)} disabled={saving} className="px-4 py-2 text-sm rounded bg-accent text-white disabled:opacity-50">
                {saving ? "Saving…" : "Save Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
