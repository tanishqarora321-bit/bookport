"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, DollarSign } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import StatusPill from "@/components/ui/StatusPill";

type Invoice = {
  id: string;
  booking_number: string | null;
  container_number: string | null;
  month_of_loading: string | null;
  shipping_line: string | null;
  consignee_name: string | null;
  pol: string | null;
  pod: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_due_date: string | null;
  freight_charges: number;
  bl_fees: number;
  aes_fees: number;
  extra_charges: number;
  correction_charges: number;
  demurrage: number;
  total: number;
  currency: string;
  fx_rate: number;
  total_usd: number;
  paid_status: "PAID" | "UNPAID";
  tracking_id: string | null;
  tracking: { eta: string | null; release_status: string | null } | null;
};

async function patchInvoice(id: string, updates: Record<string, any>) {
  const res = await fetch(`/api/forwarder-invoices/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Save failed");
  return json;
}

// ETA/Status here are read live from `tracking` (see the page's join) -
// editing them writes to that same tracking row via its own route, the
// same one components/TrackingClient.tsx uses, so a change here shows
// up in Shipment Tracking too and vice versa - there's only one copy.
async function patchTracking(trackingId: string, updates: Record<string, any>) {
  const res = await fetch(`/api/tracking/${trackingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Save failed");
  return json;
}

const RELEASE_STATUS_OPTIONS = ["On Water", "Released"];

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(amount: number | null | undefined, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount ?? 0);
  } catch {
    return `${currency} ${(amount ?? 0).toFixed(2)}`;
  }
}

const CHARGE_KEYS = ["freight_charges", "bl_fees", "aes_fees", "extra_charges", "correction_charges", "demurrage"] as const;

export default function InvoiceLedgerClient({
  forwarderId,
  forwarderName,
  initialInvoices,
}: {
  forwarderId: string;
  forwarderName: string;
  initialInvoices: Invoice[];
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [enteringInvoice, setEnteringInvoice] = useState<Invoice | null>(null);

  function updateLocal(id: string, patch: Partial<Invoice>) {
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  const pendingCount = invoices.filter((i) => !i.invoice_number).length;
  const totalUsd = invoices.reduce((s, i) => s + (i.total_usd ?? 0), 0);
  const chargeTotalsUsd = CHARGE_KEYS.reduce((acc, key) => {
    acc[key] = invoices.reduce((s, i) => s + (Number(i[key]) || 0) * (i.fx_rate || 1), 0);
    return acc;
  }, {} as Record<(typeof CHARGE_KEYS)[number], number>);

  return (
    <div className="h-full flex flex-col">
      <Link href="/forwarders" className="text-sm text-accent mb-2 w-fit">
        ← Back to Forwarders
      </Link>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">{forwarderName} — Invoices</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 shrink-0">
        <StatCard icon={Clock} label="Pending Invoices" value={pendingCount} tone={pendingCount > 0 ? "warning" : "default"} />
        <StatCard icon={DollarSign} label="Total (USD)" value={fmtMoney(totalUsd, "USD")} tone="success" />
      </div>

      <div className="flex-1 overflow-auto border rounded">
        <table className="text-sm border-collapse min-w-[2300px]">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="text-left text-ink/50 border-b">
              <Th>Booking Number</Th>
              <Th>Container Number</Th>
              <Th>Month of Loading</Th>
              <Th>Shipping Line</Th>
              <Th>Consignee</Th>
              <Th>POL</Th>
              <Th>POD</Th>
              <Th>Invoice Number</Th>
              <Th>Invoice Date</Th>
              <Th>Due Date</Th>
              <Th>Freight</Th>
              <Th>BL Fees</Th>
              <Th>AES Fees</Th>
              <Th>Extra</Th>
              <Th>Correction</Th>
              <Th>Demurrage</Th>
              <Th>Total</Th>
              <Th>Total (USD)</Th>
              <Th>ETA (live)</Th>
              <Th>Status (live)</Th>
              <Th>Paid</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <InvoiceRow
                key={inv.id}
                inv={inv}
                onChange={(patch) => updateLocal(inv.id, patch)}
                onEnterInvoice={() => setEnteringInvoice(inv)}
              />
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={21} className="px-3 py-10 text-center text-ink/40">
                  No invoices yet — one appears here automatically as soon as a container with this forwarder
                  assigned is added in Booking &amp; Instructions.
                </td>
              </tr>
            )}
          </tbody>
          {invoices.length > 0 && (
            <tfoot>
              <tr className="font-medium bg-slate-50 border-t">
                <td colSpan={10} className="px-3 py-2 text-right text-ink/60">Totals (converted to USD):</td>
                {CHARGE_KEYS.map((key) => (
                  <td key={key} className="px-3 py-2 whitespace-nowrap">{fmtMoney(chargeTotalsUsd[key], "USD")}</td>
                ))}
                <td className="px-3 py-2 text-ink/30">—</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(totalUsd, "USD")}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {enteringInvoice && (
        <EnterInvoiceModal
          inv={enteringInvoice}
          onClose={() => setEnteringInvoice(null)}
          onSaved={(updated) => {
            updateLocal(updated.id, updated);
            setEnteringInvoice(null);
          }}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 whitespace-nowrap font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 whitespace-nowrap text-ink/80">{children}</td>;
}

// ---------------- One invoice row ----------------

function InvoiceRow({
  inv, onChange, onEnterInvoice
}: { inv: Invoice; onChange: (patch: Partial<Invoice>) => void; onEnterInvoice: () => void }) {
  return (
    <tr className="border-b hover:bg-blue-50/30">
      <Td>{inv.booking_number || "—"}</Td>
      <Td>{inv.container_number || "—"}</Td>
      <Td>{inv.month_of_loading ? new Date(inv.month_of_loading).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}</Td>
      <Td>{inv.shipping_line || "—"}</Td>
      <Td>{inv.consignee_name || "—"}</Td>
      <Td>{inv.pol || "—"}</Td>
      <Td>{inv.pod || "—"}</Td>
      {inv.invoice_number ? (
        <EditableCell value={inv.invoice_number} onSave={(v) => patchInvoice(inv.id, { invoice_number: v }).then((r) => onChange(r.invoice))} />
      ) : (
        <td className="px-3 py-2 whitespace-nowrap">
          <button onClick={onEnterInvoice} className="text-xs bg-accent text-white px-2 py-1 rounded font-medium">
            Enter Invoice
          </button>
        </td>
      )}
      <EditableCell value={inv.invoice_date} isDate onSave={(v) => patchInvoice(inv.id, { invoice_date: v }).then((r) => onChange(r.invoice))} />
      <EditableCell value={inv.invoice_due_date} isDate onSave={(v) => patchInvoice(inv.id, { invoice_due_date: v }).then((r) => onChange(r.invoice))} />
      <EditableCell value={String(inv.freight_charges ?? 0)} isNumber onSave={(v) => patchInvoice(inv.id, { freight_charges: Number(v) }).then((r) => onChange(r.invoice))} display={fmtMoney(inv.freight_charges, inv.currency)} />
      <EditableCell value={String(inv.bl_fees ?? 0)} isNumber onSave={(v) => patchInvoice(inv.id, { bl_fees: Number(v) }).then((r) => onChange(r.invoice))} display={fmtMoney(inv.bl_fees, inv.currency)} />
      <EditableCell value={String(inv.aes_fees ?? 0)} isNumber onSave={(v) => patchInvoice(inv.id, { aes_fees: Number(v) }).then((r) => onChange(r.invoice))} display={fmtMoney(inv.aes_fees, inv.currency)} />
      <EditableCell value={String(inv.extra_charges ?? 0)} isNumber onSave={(v) => patchInvoice(inv.id, { extra_charges: Number(v) }).then((r) => onChange(r.invoice))} display={fmtMoney(inv.extra_charges, inv.currency)} />
      <EditableCell value={String(inv.correction_charges ?? 0)} isNumber onSave={(v) => patchInvoice(inv.id, { correction_charges: Number(v) }).then((r) => onChange(r.invoice))} display={fmtMoney(inv.correction_charges, inv.currency)} />
      <EditableCell value={String(inv.demurrage ?? 0)} isNumber onSave={(v) => patchInvoice(inv.id, { demurrage: Number(v) }).then((r) => onChange(r.invoice))} display={fmtMoney(inv.demurrage, inv.currency)} />
      <Td>
        <span className="font-medium">{fmtMoney(inv.total, inv.currency)}</span>
      </Td>
      <Td>
        <span className="font-medium">{fmtMoney(inv.total_usd, "USD")}</span>
      </Td>
      {inv.tracking_id ? (
        <EditableCell
          value={inv.tracking?.eta ?? null}
          isDate
          onSave={(v) => patchTracking(inv.tracking_id!, { eta: v }).then(() => onChange({ tracking: { eta: v, release_status: inv.tracking?.release_status ?? null } }))}
        />
      ) : (
        <Td><span className="text-ink/30">—</span></Td>
      )}
      {inv.tracking_id ? (
        <td className="px-3 py-2 whitespace-nowrap">
          <ReleaseStatusSelect
            value={inv.tracking?.release_status ?? ""}
            onSave={(v) => patchTracking(inv.tracking_id!, { release_status: v }).then(() => onChange({ tracking: { eta: inv.tracking?.eta ?? null, release_status: v } }))}
          />
        </td>
      ) : (
        <td className="px-3 py-2"><StatusPill value={null} /></td>
      )}
      <td className="px-3 py-2">
        <select
          value={inv.paid_status}
          onChange={(e) => patchInvoice(inv.id, { paid_status: e.target.value }).then((r) => onChange(r.invoice))}
          className={`text-xs px-2 py-1 rounded font-medium border-0 ${
            inv.paid_status === "PAID" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          <option value="UNPAID">UNPAID</option>
          <option value="PAID">PAID</option>
        </select>
      </td>
    </tr>
  );
}

function ReleaseStatusSelect({ value, onSave }: { value: string; onSave: (v: string) => Promise<any> }) {
  const [saving, setSaving] = useState(false);
  async function handleChange(v: string) {
    setSaving(true);
    try {
      await onSave(v);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex items-center gap-1.5">
      <StatusPill value={value || null} />
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="text-xs border rounded px-1 py-0.5 text-ink/50"
      >
        <option value="">— set —</option>
        {RELEASE_STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

function EditableCell({
  value, onSave, isDate = false, isNumber = false, display,
}: {
  value: string | null;
  onSave: (v: string) => Promise<any>;
  isDate?: boolean;
  isNumber?: boolean;
  display?: string;
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

  const shown = display ?? (value ? (isDate ? fmtDate(value) : value) : "—");

  if (!editing) {
    return (
      <td className="px-3 py-2 whitespace-nowrap">
        <span onClick={() => setEditing(true)} className="cursor-text hover:bg-blue-50 px-1 rounded block">
          {shown}
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
          className="border border-accent rounded px-1.5 py-0.5 text-sm w-24"
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

// ---------------- Enter Invoice modal: manual fields, or PDF upload to pre-fill them ----------------

function EnterInvoiceModal({
  inv, onClose, onSaved,
}: { inv: Invoice; onClose: () => void; onSaved: (invoice: Invoice) => void }) {
  const [form, setForm] = useState({
    invoice_number: inv.invoice_number ?? "",
    invoice_date: inv.invoice_date ?? "",
    invoice_due_date: inv.invoice_due_date ?? "",
    freight_charges: String(inv.freight_charges ?? 0),
    bl_fees: String(inv.bl_fees ?? 0),
    aes_fees: String(inv.aes_fees ?? 0),
    extra_charges: String(inv.extra_charges ?? 0),
    correction_charges: String(inv.correction_charges ?? 0),
    demurrage: String(inv.demurrage ?? 0),
    currency: inv.currency || "USD",
    fx_rate: String(inv.fx_rate ?? 1),
  });
  const [uploading, setUploading] = useState(false);
  const [fetchingRate, setFetchingRate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/forwarder-invoices/extract", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Extraction failed");
      const ex = json.extracted ?? {};
      setForm((f) => ({
        ...f,
        invoice_number: ex.invoice_number ?? f.invoice_number,
        invoice_date: ex.invoice_date ?? f.invoice_date,
        invoice_due_date: ex.invoice_due_date ?? f.invoice_due_date,
        freight_charges: ex.freight_charges != null ? String(ex.freight_charges) : f.freight_charges,
        bl_fees: ex.bl_fees != null ? String(ex.bl_fees) : f.bl_fees,
        aes_fees: ex.aes_fees != null ? String(ex.aes_fees) : f.aes_fees,
        extra_charges: ex.extra_charges != null ? String(ex.extra_charges) : f.extra_charges,
        correction_charges: ex.correction_charges != null ? String(ex.correction_charges) : f.correction_charges,
        demurrage: ex.demurrage != null ? String(ex.demurrage) : f.demurrage,
        currency: ex.currency || f.currency,
      }));
      if (ex.currency && ex.currency !== "USD") await handleCurrencyChange(ex.currency, false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleCurrencyChange(next: string, updateFormCurrency = true) {
    if (updateFormCurrency) setForm((f) => ({ ...f, currency: next }));
    if (next === "USD") {
      setForm((f) => ({ ...f, currency: next, fx_rate: "1" }));
      return;
    }
    setFetchingRate(true);
    try {
      const res = await fetch(`/api/fx-rate?from=${next}&to=USD`);
      const json = await res.json();
      if (res.ok) setForm((f) => ({ ...f, currency: next, fx_rate: String(json.rate) }));
    } catch {
      // Rate lookup is a convenience - fx_rate stays editable regardless.
    } finally {
      setFetchingRate(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updates = {
        invoice_number: form.invoice_number || null,
        invoice_date: form.invoice_date || null,
        invoice_due_date: form.invoice_due_date || null,
        freight_charges: Number(form.freight_charges) || 0,
        bl_fees: Number(form.bl_fees) || 0,
        aes_fees: Number(form.aes_fees) || 0,
        extra_charges: Number(form.extra_charges) || 0,
        correction_charges: Number(form.correction_charges) || 0,
        demurrage: Number(form.demurrage) || 0,
        currency: form.currency,
        fx_rate: Number(form.fx_rate) || 1,
      };
      const result = await patchInvoice(inv.id, updates);
      onSaved(result.invoice);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink">
            Enter Invoice — {inv.booking_number || "—"} / {inv.container_number || "—"}
          </h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">✕</button>
        </div>

        <label className="block border-2 border-dashed rounded-lg p-4 bg-slate-50 hover:border-accent text-center cursor-pointer mb-4">
          <div className="text-sm font-medium">{uploading ? "Extracting…" : "Upload invoice PDF (optional — auto-fills the fields below)"}</div>
          <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <LabeledInput label="Invoice Number" value={form.invoice_number} onChange={(v) => setForm({ ...form, invoice_number: v })} />
          <LabeledInput label="Invoice Date" type="date" value={form.invoice_date} onChange={(v) => setForm({ ...form, invoice_date: v })} />
          <LabeledInput label="Due Date" type="date" value={form.invoice_due_date} onChange={(v) => setForm({ ...form, invoice_due_date: v })} />
          <LabeledInput label="Freight Charges" type="number" value={form.freight_charges} onChange={(v) => setForm({ ...form, freight_charges: v })} />
          <LabeledInput label="BL Fees" type="number" value={form.bl_fees} onChange={(v) => setForm({ ...form, bl_fees: v })} />
          <LabeledInput label="AES Fees" type="number" value={form.aes_fees} onChange={(v) => setForm({ ...form, aes_fees: v })} />
          <LabeledInput label="Extra Charges" type="number" value={form.extra_charges} onChange={(v) => setForm({ ...form, extra_charges: v })} />
          <LabeledInput label="Correction Charges" type="number" value={form.correction_charges} onChange={(v) => setForm({ ...form, correction_charges: v })} />
          <LabeledInput label="Demurrage" type="number" value={form.demurrage} onChange={(v) => setForm({ ...form, demurrage: v })} />
          <div>
            <div className="text-xs text-ink/40 mb-0.5">Currency</div>
            <select className="border rounded px-2 py-1 text-sm w-full" value={form.currency} onChange={(e) => handleCurrencyChange(e.target.value)}>
              <option value="USD">USD</option>
              <option value="INR">INR</option>
            </select>
          </div>
          {form.currency !== "USD" && (
            <LabeledInput
              label={fetchingRate ? "FX Rate to USD (looking up…)" : "FX Rate to USD"}
              type="number"
              value={form.fx_rate}
              onChange={(v) => setForm({ ...form, fx_rate: v })}
            />
          )}
        </div>

        {error && <div className="text-sm text-cutoff mt-3">{error}</div>}

        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="text-sm border px-4 py-2 rounded">Cancel</button>
          <button onClick={save} disabled={saving} className="text-sm bg-accent text-white px-4 py-2 rounded font-medium disabled:opacity-60">
            {saving ? "Saving…" : "Save Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LabeledInput({
  label, value, onChange, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <div className="text-xs text-ink/40 mb-0.5">{label}</div>
      <input type={type} className="border rounded px-2 py-1 text-sm w-full" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
