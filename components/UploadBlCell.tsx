"use client";

import { useState } from "react";

type ExtractedField = { value: string | null; confidence: number; source_quote: string } | undefined;
type ExtractedContainer = { container_no: string | null; seal_no: string | null; gross_weight: number | null; weight_unit: string | null; bales: number | null };

type FormState = {
  bl_number: string; bl_date: string; place_of_issue: string; vessel: string; voyage: string;
  pol: string; pod: string; description_of_goods: string; hs_code: string;
};
const BLANK_FORM: FormState = { bl_number: "", bl_date: "", place_of_issue: "", vessel: "", voyage: "", pol: "", pod: "", description_of_goods: "", hs_code: "" };

type ContainerRow = { container_no: string; seal_no: string; gross_weight: string; weight_unit: string; bales: string };

const FIELD_LABELS: { key: keyof FormState; label: string; isDate?: boolean }[] = [
  { key: "bl_number", label: "Bill of Lading Number" },
  { key: "bl_date", label: "BL Issued Date", isDate: true },
  { key: "place_of_issue", label: "Place of Issue" },
  { key: "vessel", label: "Vessel" },
  { key: "voyage", label: "Voyage" },
  { key: "pol", label: "Port of Loading" },
  { key: "pod", label: "Port of Discharge" },
  { key: "description_of_goods", label: "Description of Goods" },
  { key: "hs_code", label: "H.S. Code" },
];

// "Upload BL" on Booking & Instructions - mirrors the booking-confirmation
// PDF review flow (app/bookings/new/page.tsx): upload -> AI extracts via
// Gemini -> a review screen the user confirms/edits -> only then is
// anything saved (app/api/bookings/[id]/apply-bl-extraction). Feeds the
// BL number/date, routing, and per-container seal/weight/bales that
// Fumigation Certificate / Certificate of Origin / Commercial Invoice
// generation will read later.
export default function UploadBlCell({
  bookingId,
  blNumber,
  onApplied,
}: {
  bookingId: string;
  blNumber: string | null;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <td className="px-3 py-2 whitespace-nowrap">
      <button
        onClick={() => setOpen(true)}
        className={
          blNumber
            ? "text-xs border border-emerald-600 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-50 max-w-[140px] truncate inline-block align-bottom"
            : "text-xs border border-accent text-accent px-2 py-1 rounded hover:bg-accent hover:text-white"
        }
        title={blNumber ?? undefined}
      >
        {blNumber ? `BL: ${blNumber}` : "Upload BL"}
      </button>
      {open && <UploadBlModal bookingId={bookingId} onClose={() => setOpen(false)} onApplied={onApplied} />}
    </td>
  );
}

function UploadBlModal({
  bookingId,
  onClose,
  onApplied,
}: {
  bookingId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(BLANK_FORM);
  const [meta, setMeta] = useState<Record<string, ExtractedField>>({});
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [result, setResult] = useState<{ containersMatched: number; unmatchedContainers: string[] } | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/bookings/${bookingId}/extract-bl`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Extraction failed");

      const ex = json.extracted ?? {};
      setDocumentId(json.document.id);
      setMeta(ex);
      setForm({
        bl_number: ex.bl_number?.value ?? "",
        bl_date: ex.bl_date?.value ?? "",
        place_of_issue: ex.place_of_issue?.value ?? "",
        vessel: ex.vessel?.value ?? "",
        voyage: ex.voyage?.value ?? "",
        pol: ex.pol?.value ?? "",
        pod: ex.pod?.value ?? "",
        description_of_goods: ex.description_of_goods?.value ?? "",
        hs_code: ex.hs_code?.value ?? "",
      });
      setContainers(
        ((ex.containers as ExtractedContainer[]) ?? []).map((c) => ({
          container_no: c.container_no ?? "",
          seal_no: c.seal_no ?? "",
          gross_weight: c.gross_weight != null ? String(c.gross_weight) : "",
          weight_unit: c.weight_unit ?? "",
          bales: c.bales != null ? String(c.bales) : "",
        }))
      );
      setStep("review");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function updateContainer(i: number, patch: Partial<ContainerRow>) {
    setContainers((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function addContainerRow() {
    setContainers((prev) => [...prev, { container_no: "", seal_no: "", gross_weight: "", weight_unit: "", bales: "" }]);
  }

  function removeContainerRow(i: number) {
    setContainers((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!form.bl_number.trim()) {
      setError("Bill of Lading Number is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/apply-bl-extraction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          document_id: documentId,
          containers: containers
            .filter((c) => c.container_no.trim())
            .map((c) => ({
              container_no: c.container_no.trim(),
              seal_no: c.seal_no.trim() || null,
              gross_weight: c.gross_weight.trim() ? Number(c.gross_weight) : null,
              weight_unit: c.weight_unit.trim() || null,
              bales: c.bales.trim() ? Number(c.bales) : null,
            })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      setResult(json);
      setStep("done");
      onApplied();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink">Upload Bill of Lading</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink text-sm">✕</button>
        </div>

        {step === "upload" && (
          <div className="py-6">
            <label className="block border-2 border-dashed rounded-lg p-10 bg-surface-2 hover:border-accent text-center cursor-pointer">
              <div className="font-medium text-sm">{uploading ? "Reading and extracting…" : "Click to choose the BL PDF"}</div>
              <div className="text-xs text-text-2 mt-1">Extracts BL Number, Issued Date, routing, and container/seal/weight details for you to review</div>
              <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            {error && <div className="text-sm text-cutoff mt-3">{error}</div>}
          </div>
        )}

        {step === "review" && (
          <>
            <p className="text-sm text-text-2 mb-3">
              AI-filled fields are marked. Confirm or correct each one — nothing is saved until you click Save.
            </p>
            <div className="space-y-1 mb-4">
              {FIELD_LABELS.map((f) => {
                const m = meta[f.key];
                const highlighted = !!m;
                return (
                  <div key={f.key} className="grid grid-cols-3 gap-3 items-start py-1 border-b last:border-0">
                    <label className="text-sm text-text-2 pt-2">
                      {f.label} {f.key === "bl_number" && <span className="text-cutoff">*</span>}
                    </label>
                    <div className="col-span-2">
                      <input
                        type={f.isDate ? "date" : "text"}
                        className={`w-full border rounded px-2 py-1.5 text-sm ${highlighted ? "border-amber-400 bg-amber-50" : "border-line-2"}`}
                        value={form[f.key]}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      />
                      {m?.source_quote && <div className="text-xs text-muted mt-0.5">from PDF: "{m.source_quote}"</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium text-ink">Containers on this BL</div>
              <button onClick={addContainerRow} className="text-xs text-accent underline">+ Add row</button>
            </div>
            <div className="border rounded-lg overflow-x-auto mb-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink/40 bg-surface-2">
                    <th className="px-2 py-1.5 font-normal">Container No.</th>
                    <th className="px-2 py-1.5 font-normal">Seal No.</th>
                    <th className="px-2 py-1.5 font-normal">Gross Weight</th>
                    <th className="px-2 py-1.5 font-normal">Unit</th>
                    <th className="px-2 py-1.5 font-normal">Bales</th>
                    <th className="px-2 py-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {containers.map((c, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1"><input className="border rounded px-1.5 py-1 text-sm w-full" value={c.container_no} onChange={(e) => updateContainer(i, { container_no: e.target.value })} /></td>
                      <td className="px-2 py-1"><input className="border rounded px-1.5 py-1 text-sm w-full" value={c.seal_no} onChange={(e) => updateContainer(i, { seal_no: e.target.value })} /></td>
                      <td className="px-2 py-1"><input className="border rounded px-1.5 py-1 text-sm w-24" value={c.gross_weight} onChange={(e) => updateContainer(i, { gross_weight: e.target.value })} /></td>
                      <td className="px-2 py-1">
                        <select className="border rounded px-1.5 py-1 text-sm" value={c.weight_unit} onChange={(e) => updateContainer(i, { weight_unit: e.target.value })}>
                          <option value="">—</option>
                          <option value="KGS">KGS</option>
                          <option value="LBS">LBS</option>
                        </select>
                      </td>
                      <td className="px-2 py-1"><input className="border rounded px-1.5 py-1 text-sm w-16" value={c.bales} onChange={(e) => updateContainer(i, { bales: e.target.value })} /></td>
                      <td className="px-2 py-1 text-center"><button onClick={() => removeContainerRow(i)} className="text-cutoff text-xs">✕</button></td>
                    </tr>
                  ))}
                  {containers.length === 0 && (
                    <tr><td colSpan={6} className="px-2 py-2 text-xs text-ink/40">No containers found on this BL.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted mb-3">
              Only container numbers that already exist on this booking get their seal/weight/bales filled in here — add a container on the booking first if one's missing.
            </p>

            {error && <div className="text-sm text-cutoff mb-2">{error}</div>}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="text-sm border px-4 py-2 rounded">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="text-sm bg-accent text-white px-4 py-2 rounded font-medium disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}

        {step === "done" && result && (
          <div className="text-center py-6">
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded px-3 py-2 inline-block">
              BL details saved{result.containersMatched > 0 ? ` — ${result.containersMatched} container${result.containersMatched === 1 ? "" : "s"} updated` : ""}.
            </p>
            {result.unmatchedContainers.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 mt-2">
                Not on this booking yet, so skipped: {result.unmatchedContainers.join(", ")}
              </p>
            )}
            <div className="mt-4">
              <button onClick={onClose} className="text-sm border px-4 py-2 rounded">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
