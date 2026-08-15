"use client";

import { useState } from "react";
import Link from "next/link";

type Invoice = {
  id: string;
  booking_number: string | null;
  container_number: string | null;
  month_of_loading: string | null;
  location: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_due_date: string | null;
  amount: number;
  currency: string;
  charges_note: string | null;
  paid_status: "PAID" | "UNPAID";
  tracking_id: string | null;
  tracking: { eta: string | null; release_status: string | null } | null;
};

async function patchInvoice(id: string, updates: Record<string, any>) {
  const res = await fetch(`/api/trucker-invoices/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || "Save failed");
  }
  return res.json();
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TruckerInvoiceLedgerClient({
  truckerId,
  truckerName,
  initialInvoices,
}: {
  truckerId: string;
  truckerName: string;
  initialInvoices: Invoice[];
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [adding, setAdding] = useState(false);

  function updateLocal(id: string, patch: Partial<Invoice>) {
    setInvoices(invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  return (
    <div className="h-full flex flex-col">
      <Link href="/truckers" className="text-sm text-accent mb-2 w-fit">
        ← Back to Truckers
      </Link>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">{truckerName} — Invoices</h1>
        <button onClick={() => setAdding(true)} className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium">
          + Add Invoice
        </button>
      </div>

      {adding && (
        <AddInvoicePanel
          truckerId={truckerId}
          onClose={() => setAdding(false)}
          onCreated={(inv) => {
            setInvoices([inv, ...invoices]);
            setAdding(false);
          }}
        />
      )}

      <div className="flex-1 overflow-auto border rounded">
        <table className="text-sm border-collapse min-w-[1700px]">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="text-left text-ink/50 border-b">
              <Th>Booking #</Th>
              <Th>Container #</Th>
              <Th>Month of Loading</Th>
              <Th>Location</Th>
              <Th>Invoice #</Th>
              <Th>Invoice Date</Th>
              <Th>Due Date</Th>
              <Th>Amount</Th>
              <Th>Charges Note</Th>
              <Th>ETA (live)</Th>
              <Th>Status (live)</Th>
              <Th>Paid</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} onChange={(patch) => updateLocal(inv.id, patch)} />
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-ink/40">
                  No invoices yet for this trucker. Click "+ Add Invoice" to enter one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 whitespace-nowrap font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 whitespace-nowrap text-ink/80">{children}</td>;
}

// ---------------- Add Invoice panel ----------------

function AddInvoicePanel({
  truckerId,
  onClose,
  onCreated,
}: {
  truckerId: string;
  onClose: () => void;
  onCreated: (inv: Invoice) => void;
}) {
  const [query, setQuery] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [form, setForm] = useState({
    location: "",
    invoice_number: "",
    invoice_date: "",
    invoice_due_date: "",
    amount: "",
    currency: "USD",
    charges_note: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function lookup() {
    if (!query.trim()) return;
    setLooking(true);
    setLookupError(null);
    try {
      const res = await fetch(`/api/tracking-lookup?query=${encodeURIComponent(query.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Lookup failed");
      setLookupResult(json);
      if (json.matched) {
        // POL is a sensible starting point for "location" -- pickup is
        // usually near port of loading -- but stays fully editable per
        // spec ("manual...or from invoice scan").
        setForm((f) => ({ ...f, location: f.location || json.pol || "" }));
      } else {
        setLookupError("No matching Tracking entry found for that number. You can still enter this invoice manually below — it just won't have a live ETA/status link.");
      }
    } catch (err: any) {
      setLookupError(err.message);
    } finally {
      setLooking(false);
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/trucker-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trucker_id: truckerId,
          tracking_id: lookupResult?.tracking_id ?? null,
          booking_number: lookupResult?.booking_number ?? query,
          container_number: lookupResult?.container_number ?? null,
          month_of_loading: lookupResult?.month_of_loading ?? null,
          ...form,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save invoice");
      onCreated(json.invoice);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-accent/30 bg-accent/5 rounded p-4 mb-4">
      <div className="flex gap-2 mb-3">
        <input
          placeholder="Enter Booking Number or Container Number"
          className="border rounded px-2 py-1.5 text-sm flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
        />
        <button onClick={lookup} disabled={looking} className="text-sm bg-ink text-white px-3 py-1.5 rounded">
          {looking ? "Looking up…" : "Lookup"}
        </button>
      </div>

      {lookupError && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">{lookupError}</div>}

      {lookupResult?.matched && (
        <div className="grid grid-cols-3 gap-2 text-xs mb-3 bg-white border rounded p-3">
          <div><span className="text-ink/40">Matched by:</span> {lookupResult.matched_by}</div>
          <div><span className="text-ink/40">Month of Loading:</span> {lookupResult.month_of_loading || "—"}</div>
          <div><span className="text-ink/40">Suggested Location (POL):</span> {lookupResult.pol || "—"}</div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <LabeledInput label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
        <LabeledInput label="Invoice Number" value={form.invoice_number} onChange={(v) => setForm({ ...form, invoice_number: v })} />
        <LabeledInput label="Invoice Date" type="date" value={form.invoice_date} onChange={(v) => setForm({ ...form, invoice_date: v })} />
        <LabeledInput label="Due Date" type="date" value={form.invoice_due_date} onChange={(v) => setForm({ ...form, invoice_due_date: v })} />
        <LabeledInput label="Amount" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
        <LabeledInput label="Charges Note (optional)" value={form.charges_note} onChange={(v) => setForm({ ...form, charges_note: v })} />
      </div>

      {saveError && <div className="text-xs text-cutoff mt-2">{saveError}</div>}

      <div className="flex gap-2 mt-3">
        <button onClick={save} disabled={saving || !query.trim()} className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium disabled:opacity-50">
          {saving ? "Saving…" : "Save Invoice"}
        </button>
        <button onClick={onClose} className="text-sm border px-3 py-1.5 rounded">
          Cancel
        </button>
      </div>
    </div>
  );
}

function LabeledInput({
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
      <input type={type} className="border rounded px-2 py-1 text-sm w-full" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// ---------------- One invoice row ----------------

function InvoiceRow({ inv, onChange }: { inv: Invoice; onChange: (patch: Partial<Invoice>) => void }) {
  return (
    <tr className="border-b hover:bg-blue-50/30">
      <Td>{inv.booking_number || "—"}</Td>
      <Td>{inv.container_number || "—"}</Td>
      <Td>{inv.month_of_loading ? new Date(inv.month_of_loading).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}</Td>
      <EditableCell value={inv.location} onSave={(v) => patchInvoice(inv.id, { location: v }).then(() => onChange({ location: v }))} />
      <EditableCell value={inv.invoice_number} onSave={(v) => patchInvoice(inv.id, { invoice_number: v }).then(() => onChange({ invoice_number: v }))} />
      <EditableCell value={inv.invoice_date} isDate onSave={(v) => patchInvoice(inv.id, { invoice_date: v }).then(() => onChange({ invoice_date: v }))} />
      <EditableCell value={inv.invoice_due_date} isDate onSave={(v) => patchInvoice(inv.id, { invoice_due_date: v }).then(() => onChange({ invoice_due_date: v }))} />
      <EditableCell value={String(inv.amount ?? 0)} isNumber onSave={(v) => patchInvoice(inv.id, { amount: Number(v) }).then(() => onChange({ amount: Number(v) }))} />
      <EditableCell value={inv.charges_note} onSave={(v) => patchInvoice(inv.id, { charges_note: v }).then(() => onChange({ charges_note: v }))} wide />
      <Td>
        <span className="text-ink/60">{fmtDate(inv.tracking?.eta ?? null)}</span>
      </Td>
      <Td>
        <span className="text-ink/60">{inv.tracking?.release_status || "—"}</span>
      </Td>
      <td className="px-3 py-2">
        <button
          onClick={() => {
            const next = inv.paid_status === "PAID" ? "UNPAID" : "PAID";
            patchInvoice(inv.id, { paid_status: next }).then(() => onChange({ paid_status: next }));
          }}
          className={`text-xs px-2 py-1 rounded font-medium ${
            inv.paid_status === "PAID" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {inv.paid_status}
        </button>
      </td>
    </tr>
  );
}

function EditableCell({
  value,
  onSave,
  isDate = false,
  isNumber = false,
  wide = false,
}: {
  value: string | null;
  onSave: (v: string) => Promise<any>;
  isDate?: boolean;
  isNumber?: boolean;
  wide?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(val);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const display = value ? (isDate ? fmtDate(value) : value) : "—";

  if (!editing) {
    return (
      <td className={`px-3 py-2 ${wide ? "max-w-[300px] truncate" : "whitespace-nowrap"}`}>
        <span onClick={() => setEditing(true)} className="cursor-text hover:bg-blue-50 px-1 rounded block" title={value ?? ""}>
          {display}
        </span>
      </td>
    );
  }

  return (
    <td className="px-3 py-2 whitespace-nowrap">
      <div className="flex gap-1 items-center">
        <input
          autoFocus
          type={isDate ? "date" : isNumber ? "number" : "text"}
          className={`border border-accent rounded px-1.5 py-0.5 text-sm ${wide ? "w-56" : "w-24"}`}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="text-xs bg-ink text-white px-1.5 py-0.5 rounded">
          {saving ? "…" : "✓"}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs border px-1.5 py-0.5 rounded">
          ✕
        </button>
        {error && <span className="text-xs text-cutoff">{error}</span>}
      </div>
    </td>
  );
}
