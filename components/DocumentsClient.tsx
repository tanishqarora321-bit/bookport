"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";

type Doc = {
  id: string;
  doc_type: string;
  field_data: Record<string, string>;
  pdf_path: string | null;
  version: number;
  created_at: string;
};

type FormState = {
  invoice_date: string;
  terms: string;
  reference_no: string;
  weight_lbs: string;
  qty_bales: string;
  description: string;
  rate: string;
  amount: string;
  currency: string;
};

function formatDateLong(value: string): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function computedAmountHelp(weight: string, rate: string): string | null {
  const w = parseFloat(weight.replace(/,/g, ""));
  const r = parseFloat(rate.replace(/,/g, ""));
  if (Number.isNaN(w) || Number.isNaN(r)) return null;
  const product = w * r;
  return `Weight × Rate = ${product.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DocumentsClient({
  trackingId,
  tracking,
  partyName,
  partyAddress,
  itemName,
  existingDocs,
}: {
  trackingId: string;
  tracking: { booking_number: string | null; container_number: string | null; shipping_line: string | null; seal_number: string | null; invoice_no: string | null };
  partyName: string | null;
  partyAddress: string | null;
  itemName: string | null;
  existingDocs: Doc[];
}) {
  const latest = existingDocs[0];
  const [docs, setDocs] = useState(existingDocs);
  const [form, setForm] = useState<FormState>({
    invoice_date: latest?.field_data?.invoice_date || new Date().toISOString().slice(0, 10),
    terms: latest?.field_data?.terms || "Advance",
    reference_no: latest?.field_data?.reference_no || "",
    weight_lbs: latest?.field_data?.weight_lbs || "",
    qty_bales: latest?.field_data?.qty_bales || "",
    description: latest?.field_data?.description || itemName || "",
    rate: latest?.field_data?.rate || "",
    amount: latest?.field_data?.amount || "",
    currency: latest?.field_data?.currency || "USD",
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracking/${trackingId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: form }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      setDocs([json.document, ...docs]);
      setLastUrl(json.url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  const missingParty = !partyName;
  const currentVersion = docs[0]?.version;
  const amountHelp = computedAmountHelp(form.weight_lbs, form.rate);

  const lockedFields: { label: string; value: string | null; mono?: boolean }[] = [
    { label: "Consignee", value: partyName },
    { label: "Booking Number", value: tracking.booking_number, mono: true },
    { label: "Container Number", value: tracking.container_number, mono: true },
    { label: "Shipping Line", value: tracking.shipping_line },
    { label: "Seal Number", value: tracking.seal_number, mono: true },
    { label: "Invoice Number", value: tracking.invoice_no, mono: true },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/tracking"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium self-start text-ink"
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Back to Tracking
      </Link>

      <div className="max-w-[900px]">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="h1">Generate Final Invoice</h1>
          {currentVersion != null && <span className="badge b-acc">v{currentVersion} current</span>}
        </div>
        <p className="sub">
          Auto-filled fields come from this shipment&apos;s tracking entry. Anything below is editable before you
          generate — each generation creates a new version, nothing gets overwritten.
        </p>
      </div>

      <div className="flex flex-wrap gap-5 items-start">
        {/* Left column */}
        <div className="flex-1 min-w-0 flex flex-col gap-4" style={{ flexBasis: 520 }}>
          <section className="card flex flex-col gap-3.5" style={{ padding: "18px 20px" }} aria-labelledby="ro-h">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <h2 id="ro-h" className="h2">From tracking (read-only)</h2>
              <Link href="/tracking" className="text-[13px]">Change in Tracking</Link>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {lockedFields.map((l) => (
                <div className="field" key={l.label}>
                  <span className="text-[13px] font-medium text-ink">{l.label}</span>
                  <div
                    className="flex items-center gap-2 h-10 px-3 border border-line rounded-[9px] bg-surface-2 text-ink text-sm"
                    aria-readonly="true"
                  >
                    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--mut)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                    {l.value ? (
                      <span className={`truncate ${l.mono ? "mono" : ""}`}>{l.value}</span>
                    ) : (
                      <span className="dash">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card flex flex-col gap-3.5" style={{ padding: "18px 20px" }} aria-labelledby="ed-h">
            <h2 id="ed-h" className="h2">Editable</h2>
            <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div className="field">
                <label htmlFor="df-date">Invoice / Ship Date</label>
                <input
                  id="df-date"
                  type="date"
                  className="input"
                  value={form.invoice_date}
                  onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="df-terms">Terms</label>
                <input
                  id="df-terms"
                  className="input"
                  value={form.terms}
                  onChange={(e) => setForm({ ...form, terms: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="df-ref">Reference #</label>
                <input
                  id="df-ref"
                  className="input"
                  value={form.reference_no}
                  onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
                />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="df-desc">Description</label>
                <input
                  id="df-desc"
                  className="input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="df-weight">Weight (LBS)</label>
                <input
                  id="df-weight"
                  className="input num"
                  value={form.weight_lbs}
                  onChange={(e) => setForm({ ...form, weight_lbs: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="df-qty">Qty (Bales)</label>
                <input
                  id="df-qty"
                  className="input num"
                  value={form.qty_bales}
                  onChange={(e) => setForm({ ...form, qty_bales: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="df-rate">Rate</label>
                <input
                  id="df-rate"
                  className="input num"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                />
                <span className="help">Per LBS</span>
              </div>
              <div className="field">
                <label htmlFor="df-amount">Amount</label>
                <input
                  id="df-amount"
                  className="input num"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
                {amountHelp && <span className="help">{amountHelp}</span>}
              </div>
              <div className="field">
                <label htmlFor="df-currency">Currency</label>
                <input
                  id="df-currency"
                  className="input"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                />
              </div>
            </div>

            {error && <p className="err">{error}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-line">
              {lastUrl ? (
                <a href={lastUrl} target="_blank" rel="noreferrer" className="text-sm font-medium">
                  Open the PDF just generated →
                </a>
              ) : (
                <span />
              )}
              <button onClick={generate} disabled={generating || missingParty} className="btn btn-p">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
                </svg>
                {generating ? "Generating…" : docs.length > 0 ? "Regenerate (new version)" : "Generate Invoice PDF"}
              </button>
            </div>
          </section>

          <section className="card" style={{ padding: "18px 20px" }} aria-labelledby="vh-h">
            <h2 id="vh-h" className="h2" style={{ marginBottom: 8 }}>Version history</h2>
            {docs.length === 0 ? (
              <p className="lbl" style={{ padding: "24px 0", textAlign: "center" }}>No versions generated yet.</p>
            ) : (
              docs.map((d, i) => <VersionRow key={d.id} doc={d} isCurrent={i === 0} />)
            )}
          </section>

          {missingParty && (
            <div className="banner bn-warn text-[13px]" role="note">
              <span className="meta font-semibold uppercase tracking-wide" style={{ width: "100%" }}>State · no party</span>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l10 18H2zM12 10v4M12 17.5v.5" />
              </svg>
              <span style={{ flex: "1 1 300px" }}>
                This tracking entry has no party assigned yet. Assign one from the Tracking grid before generating.
              </span>
              <Link href="/tracking" className="btn btn-s">Open Tracking</Link>
            </div>
          )}
        </div>

        {/* Right column: live preview, built from local form state - no new data fetching */}
        <aside
          className="card bg-surface-2 flex flex-col gap-3"
          style={{ flex: "1 1 440px", minWidth: 0, padding: 16 }}
          aria-label="Live PDF preview"
        >
          <div className="flex justify-between items-center">
            <span className="h2">Live preview</span>
            <span className="meta">A4 · updates as you type</span>
          </div>
          <div
            style={{
              aspectRatio: "1 / 1.414",
              width: "100%",
              borderRadius: 4,
              boxShadow: "0 2px 10px rgba(15,23,42,0.12)",
              padding: "28px 26px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflow: "hidden",
              background: "#FFFFFF",
              color: "#111827",
              fontFamily: "'Geist', system-ui, sans-serif",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, borderBottom: "3px solid #2F5FE0", paddingBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>[Company name]</div>
                <div style={{ fontSize: 9, color: "#4B5563", lineHeight: 1.4 }}>[Company address line 1]<br />[City, State ZIP] · Ph [Phone] · [Email]</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.08em", color: "#2F5FE0" }}>INVOICE</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", gap: 12, flex: 1 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6B7280" }}>CONSIGNEE</div>
                  <div style={{ fontSize: 10, lineHeight: 1.4 }}>
                    {partyName || "[Consignee]"}
                    {partyAddress ? <><br />{partyAddress}</> : null}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6B7280" }}>NOTIFY</div>
                  <div style={{ fontSize: 10, lineHeight: 1.4 }}>Same as consignee</div>
                </div>
              </div>
              <table style={{ borderCollapse: "collapse", alignSelf: "flex-start" }}>
                <tbody>
                  <tr>
                    <th style={previewTh}>Date</th>
                    <td style={previewTd}>{formatDateLong(form.invoice_date)}</td>
                  </tr>
                  <tr>
                    <th style={previewTh}>Invoice #</th>
                    <td style={{ ...previewTd, fontFamily: "'Geist Mono', monospace" }}>{tracking.invoice_no || "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={previewTh}>Booking</th>
                  <th style={previewTh}>Container</th>
                  <th style={previewTh}>Terms</th>
                  <th style={previewTh}>Ship Date</th>
                  <th style={previewTh}>Ship Via</th>
                  <th style={previewTh}>Seal</th>
                  <th style={previewTh}>Reference</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={previewTd}>{tracking.booking_number || "—"}</td>
                  <td style={previewTd}>{tracking.container_number || "—"}</td>
                  <td style={previewTd}>{form.terms || "—"}</td>
                  <td style={previewTd}>{formatDateLong(form.invoice_date)}</td>
                  <td style={previewTd}>{tracking.shipping_line || "—"}</td>
                  <td style={previewTd}>{tracking.seal_number || "—"}</td>
                  <td style={previewTd}>{form.reference_no || "—"}</td>
                </tr>
              </tbody>
            </table>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={previewTh}>Description</th>
                  <th style={{ ...previewTh, textAlign: "right" }}>Qty (Bales)</th>
                  <th style={{ ...previewTh, textAlign: "right" }}>Weight (LBS)</th>
                  <th style={{ ...previewTh, textAlign: "right" }}>Rate</th>
                  <th style={{ ...previewTh, textAlign: "right" }}>Amount ({form.currency || "USD"})</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={previewTd}>{form.description || "—"}</td>
                  <td style={{ ...previewTd, textAlign: "right" }}>{form.qty_bales || "—"}</td>
                  <td style={{ ...previewTd, textAlign: "right" }}>{form.weight_lbs || "—"}</td>
                  <td style={{ ...previewTd, textAlign: "right" }}>{form.rate || "—"}</td>
                  <td style={{ ...previewTd, textAlign: "right" }}>{form.amount || "—"}</td>
                </tr>
                <tr>
                  <td colSpan={4} style={{ ...previewTd, textAlign: "right", fontWeight: 700 }}>TOTAL</td>
                  <td style={{ ...previewTd, textAlign: "right", fontWeight: 700 }}>
                    {form.amount ? `${form.currency || "USD"} ${form.amount}` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 8, color: "#6B7280", borderTop: "1px solid #E5E7EB", paddingTop: 8 }}>
              [Letterhead footer text]
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const previewTh: CSSProperties = { border: "1px solid #D1D5DB", padding: "5px 7px", fontSize: 10, textAlign: "left", background: "#F3F4F6", fontWeight: 700 };
const previewTd: CSSProperties = { border: "1px solid #D1D5DB", padding: "5px 7px", fontSize: 10, textAlign: "left" };

function VersionRow({ doc, isCurrent }: { doc: Doc; isCurrent: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function getSignedUrl() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/signed-url`);
      const json = await res.json();
      if (res.ok) setUrl(json.url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line" style={{ padding: "11px 0" }}>
      <span className={`badge ${isCurrent ? "b-acc" : "b-neu"}`} style={{ minWidth: 40 }}>v{doc.version}</span>
      <span className="num" style={{ flex: "1 1 200px" }}>
        {new Date(doc.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
      </span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-xs">Open PDF</a>
      ) : (
        <button onClick={getSignedUrl} disabled={loading} className="btn btn-xs">
          {loading ? "Loading…" : "Get link"}
        </button>
      )}
    </div>
  );
}
