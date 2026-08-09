"use client";

import { useState } from "react";
import Link from "next/link";

type Doc = {
  id: string;
  doc_type: string;
  field_data: Record<string, string>;
  pdf_path: string | null;
  version: number;
  created_at: string;
};

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
  const [form, setForm] = useState({
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

  return (
    <div className="h-full flex flex-col max-w-3xl">
      <Link href="/tracking" className="text-sm text-accent mb-3">
        ← Back to Tracking
      </Link>
      <h1 className="text-xl font-semibold text-ink mb-1">Generate Final Invoice</h1>
      <p className="text-sm text-ink/50 mb-4">
        Auto-filled fields come from this shipment's tracking entry. Anything below is editable before you generate —
        each generation creates a new version, nothing gets overwritten.
      </p>

      {missingParty && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded p-3 mb-4">
          This tracking entry has no party assigned yet. Assign one from the Tracking grid before generating.
        </div>
      )}

      <div className="border rounded p-4 mb-4 grid grid-cols-2 gap-3 text-sm">
        <ReadOnlyField label="Consignee (from Party)" value={partyName} />
        <ReadOnlyField label="Booking Number" value={tracking.booking_number} />
        <ReadOnlyField label="Container Number" value={tracking.container_number} />
        <ReadOnlyField label="Shipping Line" value={tracking.shipping_line} />
        <ReadOnlyField label="Seal Number" value={tracking.seal_number} />
        <ReadOnlyField label="Invoice Number" value={tracking.invoice_no} />

        <EditField label="Invoice / Ship Date" type="date" value={form.invoice_date} onChange={(v) => setForm({ ...form, invoice_date: v })} />
        <EditField label="Terms" value={form.terms} onChange={(v) => setForm({ ...form, terms: v })} />
        <EditField label="Reference #" value={form.reference_no} onChange={(v) => setForm({ ...form, reference_no: v })} />
        <EditField label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
        <EditField label="Weight (LBS)" value={form.weight_lbs} onChange={(v) => setForm({ ...form, weight_lbs: v })} />
        <EditField label="Qty (Bales)" value={form.qty_bales} onChange={(v) => setForm({ ...form, qty_bales: v })} />
        <EditField label="Rate" value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} />
        <div className="flex gap-2">
          <EditField label="Amount" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
          <EditField label="Currency" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} />
        </div>
      </div>

      {error && <div className="text-sm text-cutoff mb-3">{error}</div>}

      <button
        onClick={generate}
        disabled={generating || missingParty}
        className="text-sm bg-accent text-white px-4 py-2 rounded font-medium w-fit disabled:opacity-50"
      >
        {generating ? "Generating…" : docs.length > 0 ? "Regenerate (new version)" : "Generate Invoice PDF"}
      </button>

      {lastUrl && (
        <a href={lastUrl} target="_blank" className="text-sm text-accent underline mt-2 w-fit">
          Open the PDF just generated →
        </a>
      )}

      <h2 className="text-sm font-semibold text-ink mt-8 mb-2">Version history</h2>
      <div className="border rounded divide-y">
        {docs.map((d) => (
          <VersionRow key={d.id} doc={d} />
        ))}
        {docs.length === 0 && <div className="px-3 py-6 text-center text-ink/40 text-sm">No versions generated yet.</div>}
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs text-ink/40">{label}</div>
      <div className="text-ink/80">{value || "—"}</div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <div className="text-xs text-ink/40 mb-0.5">{label}</div>
      <input
        type={type}
        className="border rounded px-2 py-1 text-sm w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function VersionRow({ doc }: { doc: Doc }) {
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
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <div>
        <span className="font-medium">v{doc.version}</span>
        <span className="text-ink/40 ml-2">
          {new Date(doc.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      {url ? (
        <a href={url} target="_blank" className="text-accent underline">
          Open PDF
        </a>
      ) : (
        <button onClick={getSignedUrl} disabled={loading} className="text-accent">
          {loading ? "Loading…" : "Get link"}
        </button>
      )}
    </div>
  );
}
