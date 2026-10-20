"use client";

import { useState } from "react";
import { CloseIcon } from "@/components/EditableCell";

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
  { key: "hs_code", label: "H.S. Code" },
  { key: "description_of_goods", label: "Description of Goods" },
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
    <td>
      <button
        onClick={() => setOpen(true)}
        className="btn btn-xs"
        style={
          blNumber
            ? { borderColor: "var(--ok)", color: "var(--ok)", maxWidth: 140 }
            : { borderColor: "var(--accent)", color: "var(--accent)" }
        }
        title={blNumber ?? undefined}
      >
        {blNumber ? (
          <>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5 9-10" />
            </svg>
            <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>BL: {blNumber}</span>
          </>
        ) : (
          <>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />
            </svg>
            Upload BL
          </>
        )}
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

  const stepIdx = { upload: 1, review: 2, done: 3 }[step];
  function dotStyle(n: number): React.CSSProperties {
    if (n < stepIdx) return { background: "var(--okS)", color: "var(--ok)" };
    if (n === stepIdx) return { background: "var(--accent)", color: "var(--onAccent)" };
    return { background: "var(--neuS)", color: "var(--tx2)" };
  }
  const fieldsRead = Object.values(meta).filter(Boolean).length;

  return (
    <div className="scrim" onClick={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="bl-t" style={{ maxWidth: 880 }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div>
            <h2 id="bl-t" className="h2" style={{ fontSize: 18 }}>Upload Bill of Lading</h2>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="ib">
            <CloseIcon />
          </button>
        </div>

        <ol className="steps" aria-label="Steps" style={{ listStyle: "none", margin: 0, padding: "0 24px 12px" }}>
          <li className="stp" style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="dot" style={{ width: 20, height: 20, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, ...dotStyle(1) }}>1</span><span style={{ fontWeight: 500 }}>Upload</span></li>
          <li aria-hidden="true" style={{ width: 32, height: 1, background: "var(--line2)" }} />
          <li className="stp" style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="dot" style={{ width: 20, height: 20, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, ...dotStyle(2) }}>2</span><span style={{ fontWeight: 500 }}>Review</span></li>
          <li aria-hidden="true" style={{ width: 32, height: 1, background: "var(--line2)" }} />
          <li className="stp" style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="dot" style={{ width: 20, height: 20, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, ...dotStyle(3) }}>3</span><span style={{ fontWeight: 500 }}>Done</span></li>
        </ol>

        {step === "upload" && (
          <>
            <div className="mb">
              <label className="drop" style={{ width: "100%", cursor: "pointer" }}>
                <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accentS)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 3H6v18h12V7zM14 3v4h4M12 11v6M9 14l3-3 3 3" />
                  </svg>
                </span>
                <b style={{ fontSize: 15 }}>{uploading ? "Reading and extracting…" : "Click to choose the BL PDF"}</b>
                <span className="lbl">Extracts BL Number, Issued Date, routing, and container/seal/weight details for you to review</span>
                <span className="meta">PDF only · or drop the file here</span>
                <input type="file" accept="application/pdf" className="sr" onChange={handleUpload} disabled={uploading} />
              </label>
              {error && <div className="err">{error}</div>}
            </div>
            <div className="mf"><button onClick={onClose} className="btn btn-s">Cancel</button></div>
          </>
        )}

        {step === "review" && (
          <>
            <div className="mb">
              <div className="banner bn-warn" style={{ padding: "10px 14px" }}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={2} strokeLinecap="round">
                  <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5v.5" />
                </svg>
                <span style={{ fontSize: 13 }}>AI-filled fields are marked. Confirm or correct each one — nothing is saved until you click Save.</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px 16px" }}>
                {FIELD_LABELS.map((f) => {
                  const m = meta[f.key];
                  const highlighted = !!m;
                  const wide = f.key === "description_of_goods";
                  return (
                    <div key={f.key} className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
                      <label htmlFor={`bl-${f.key}`}>
                        {f.label} {f.key === "bl_number" && <span className="req">*</span>}
                      </label>
                      <input
                        id={`bl-${f.key}`}
                        type={f.isDate ? "date" : "text"}
                        className={`input${f.key === "bl_number" || f.key === "hs_code" ? " mono" : ""}${highlighted ? " ai" : ""}`}
                        value={form[f.key]}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      />
                      {m?.source_quote && <span className="src">from PDF: &quot;{m.source_quote}&quot;</span>}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 className="h2" style={{ fontSize: 14 }}>Containers on this BL <span className="meta" style={{ fontWeight: 400 }}>{containers.length}</span></h3>
                  <button onClick={addContainerRow} className="btn btn-xs">+ Add row</button>
                </div>
                <div className="card" style={{ overflow: "hidden" }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Container No.</th><th>Seal No.</th><th className="r">Gross Weight</th><th>Unit</th><th className="r">Bales</th><th><span className="sr">Remove</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {containers.map((c, i) => (
                        <tr key={i}>
                          <td><input className="input input-s mono" value={c.container_no} onChange={(e) => updateContainer(i, { container_no: e.target.value })} aria-label={`Container No. row ${i + 1}`} style={{ width: 150 }} /></td>
                          <td><input className="input input-s mono" value={c.seal_no} onChange={(e) => updateContainer(i, { seal_no: e.target.value })} aria-label={`Seal No. row ${i + 1}`} style={{ width: 120 }} /></td>
                          <td className="r"><input className="input input-s num" value={c.gross_weight} onChange={(e) => updateContainer(i, { gross_weight: e.target.value })} aria-label={`Gross Weight row ${i + 1}`} style={{ width: 100, textAlign: "right" }} /></td>
                          <td>
                            <select className="select select-s" value={c.weight_unit} onChange={(e) => updateContainer(i, { weight_unit: e.target.value })} aria-label={`Unit row ${i + 1}`} style={{ width: 80 }}>
                              <option value="">—</option>
                              <option value="KGS">KGS</option>
                              <option value="LBS">LBS</option>
                            </select>
                          </td>
                          <td className="r"><input className="input input-s num" value={c.bales} onChange={(e) => updateContainer(i, { bales: e.target.value })} aria-label={`Bales row ${i + 1}`} style={{ width: 64, textAlign: "right" }} /></td>
                          <td><button onClick={() => removeContainerRow(i)} aria-label={`Remove row ${i + 1}`} className="ib"><CloseIcon /></button></td>
                        </tr>
                      ))}
                      {containers.length === 0 && (
                        <tr><td colSpan={6} className="meta">No containers found on this BL.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="meta" style={{ margin: 0, display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth={2} strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5v.5" />
                  </svg>
                  Only container numbers that already exist on this booking get their seal/weight/bales filled in here — add a container on the booking first if one&apos;s missing.
                </p>
              </div>
              {error && <div className="err">{error}</div>}
            </div>
            <div className="mf" style={{ justifyContent: "space-between" }}>
              <span className="lbl" style={{ alignSelf: "center" }}>{fieldsRead} fields read</span>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={onClose} className="btn btn-s">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="btn btn-s btn-p">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </>
        )}

        {step === "done" && result && (
          <>
            <div className="mb">
              <div className="banner bn-ok" role="status">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5 9-10" />
                </svg>
                <b style={{ fontWeight: 600 }}>
                  BL details saved{result.containersMatched > 0 ? ` — ${result.containersMatched} container${result.containersMatched === 1 ? "" : "s"} updated` : ""}.
                </b>
              </div>
              {result.unmatchedContainers.length > 0 && (
                <div className="banner bn-warn">
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l10 18H2zM12 10v4M12 17v.5" />
                  </svg>
                  <span style={{ fontSize: 13 }}>Not on this booking yet, so skipped: <span className="mono" style={{ fontWeight: 600 }}>{result.unmatchedContainers.join(", ")}</span></span>
                </div>
              )}
            </div>
            <div className="mf"><button onClick={onClose} className="btn btn-s btn-p">Close</button></div>
          </>
        )}
      </section>
    </div>
  );
}
