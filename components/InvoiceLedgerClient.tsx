"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, DollarSign, Ship, CheckCircle2, XCircle, Plus } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import StatusPill from "@/components/ui/StatusPill";

type CustomColumn = { id: string; key: string; label: string };

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
  custom_charges: Record<string, number>;
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

async function createCustomColumn(label: string): Promise<CustomColumn> {
  const res = await fetch("/api/forwarder-invoice-columns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to add column");
  return json.column;
}

const RELEASE_STATUS_OPTIONS = ["On Water", "Released"];
const MAX_CUSTOM_COLUMNS = 10;

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

// forwarder_invoices.total/total_usd are Postgres GENERATED columns
// over only the 6 fixed charge fields - they can't reference the
// custom_charges jsonb blob, so "the real total" (including whatever
// custom columns exist) is computed here instead of trusted from the
// DB once any custom column has a value.
function customChargesSum(inv: Invoice, columns: CustomColumn[]) {
  return columns.reduce((s, c) => s + (Number(inv.custom_charges?.[c.key]) || 0), 0);
}
function invoiceTotal(inv: Invoice, columns: CustomColumn[]) {
  return inv.total + customChargesSum(inv, columns);
}
function invoiceTotalUsd(inv: Invoice, columns: CustomColumn[]) {
  return inv.total_usd + customChargesSum(inv, columns) * (inv.fx_rate || 1);
}

export default function InvoiceLedgerClient({
  forwarderId,
  forwarderName,
  initialInvoices,
  initialCustomColumns,
}: {
  forwarderId: string;
  forwarderName: string;
  initialInvoices: Invoice[];
  initialCustomColumns: CustomColumn[];
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [customColumns, setCustomColumns] = useState(initialCustomColumns);
  const [enteringInvoice, setEnteringInvoice] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [paidFilter, setPaidFilter] = useState("all");
  const [addingColumn, setAddingColumn] = useState(false);

  function updateLocal(id: string, patch: Partial<Invoice>) {
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function handleAddColumn() {
    const label = prompt("New charge column name:")?.trim();
    if (!label) return;
    if (customColumns.length >= MAX_CUSTOM_COLUMNS) {
      alert(`You already have ${MAX_CUSTOM_COLUMNS} custom columns, the maximum.`);
      return;
    }
    if (!confirm(`Add "${label}" as a new charge column? It will show up on every forwarder's invoice ledger, not just ${forwarderName}'s.`)) {
      return;
    }
    setAddingColumn(true);
    try {
      const column = await createCustomColumn(label);
      setCustomColumns((prev) => [...prev, column]);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAddingColumn(false);
    }
  }

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && (inv.tracking?.release_status ?? "") !== statusFilter) return false;
      if (paidFilter !== "all" && inv.paid_status !== paidFilter) return false;
      return true;
    });
  }, [invoices, statusFilter, paidFilter]);

  // KPI cards reflect the whole ledger regardless of the filters above
  // (same convention as Booking & Instructions' stat cards).
  const pendingCount = invoices.filter((i) => !i.invoice_number).length;
  const onWaterCount = invoices.filter((i) => (i.tracking?.release_status ?? "").toLowerCase() === "on water").length;
  const releasedCount = invoices.filter((i) => (i.tracking?.release_status ?? "").toLowerCase() === "released").length;
  const paidCount = invoices.filter((i) => i.paid_status === "PAID").length;
  const unpaidCount = invoices.filter((i) => i.paid_status === "UNPAID").length;
  const totalUsd = invoices.reduce((s, i) => s + invoiceTotalUsd(i, customColumns), 0);

  const chargeTotalsUsd = CHARGE_KEYS.reduce((acc, key) => {
    acc[key] = invoices.reduce((s, i) => s + (Number(i[key]) || 0) * (i.fx_rate || 1), 0);
    return acc;
  }, {} as Record<(typeof CHARGE_KEYS)[number], number>);
  const customTotalsUsd = customColumns.reduce((acc, col) => {
    acc[col.key] = invoices.reduce((s, i) => s + (Number(i.custom_charges?.[col.key]) || 0) * (i.fx_rate || 1), 0);
    return acc;
  }, {} as Record<string, number>);

  const columnCount = 22 + customColumns.length;

  return (
    <div className="h-full flex flex-col">
      <Link href="/forwarders" className="text-sm text-accent mb-2 w-fit">
        ← Back to Forwarders
      </Link>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">{forwarderName} — Invoices</h1>
        <button
          onClick={handleAddColumn}
          disabled={addingColumn || customColumns.length >= MAX_CUSTOM_COLUMNS}
          className="text-sm border px-3 py-1.5 rounded font-medium flex items-center gap-1 disabled:opacity-50"
          title={customColumns.length >= MAX_CUSTOM_COLUMNS ? "Maximum of 10 custom columns reached" : "Add a charge column"}
        >
          <Plus className="w-4 h-4" size={16} /> Add Column ({customColumns.length}/{MAX_CUSTOM_COLUMNS})
        </button>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4 shrink-0">
        <StatCard icon={Clock} label="Pending" value={pendingCount} tone={pendingCount > 0 ? "warning" : "default"} />
        <StatCard icon={Ship} label="On Water" value={onWaterCount} />
        <StatCard icon={CheckCircle2} label="Released" value={releasedCount} tone="success" />
        <StatCard icon={CheckCircle2} label="Paid" value={paidCount} tone="success" />
        <StatCard icon={XCircle} label="Unpaid" value={unpaidCount} tone={unpaidCount > 0 ? "danger" : "default"} />
        <StatCard icon={DollarSign} label="Total (USD)" value={fmtMoney(totalUsd, "USD")} tone="success" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 shrink-0">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="all">All Status</option>
          {RELEASE_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="all">All Paid</option>
          <option value="PAID">Paid</option>
          <option value="UNPAID">Unpaid</option>
        </select>
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
              {customColumns.map((col) => (
                <Th key={col.key}>{col.label}</Th>
              ))}
              <Th>Total</Th>
              <Th>Total (USD)</Th>
              <Th>ETA (live)</Th>
              <Th>Status (live)</Th>
              <Th>Paid</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => (
              <InvoiceRow
                key={inv.id}
                inv={inv}
                customColumns={customColumns}
                onChange={(patch) => updateLocal(inv.id, patch)}
                onEnterInvoice={() => setEnteringInvoice(inv)}
                onDeleted={() => setInvoices((prev) => prev.filter((x) => x.id !== inv.id))}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-3 py-10 text-center text-ink/40">
                  {invoices.length === 0
                    ? <>No invoices yet — one appears here automatically as soon as a container with this forwarder assigned is added in Booking &amp; Instructions.</>
                    : "No invoices match these filters."}
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="font-medium bg-slate-50 border-t">
                <td colSpan={10} className="px-3 py-2 text-right text-ink/60">Totals (converted to USD):</td>
                {CHARGE_KEYS.map((key) => (
                  <td key={key} className="px-3 py-2 whitespace-nowrap">{fmtMoney(chargeTotalsUsd[key], "USD")}</td>
                ))}
                {customColumns.map((col) => (
                  <td key={col.key} className="px-3 py-2 whitespace-nowrap">{fmtMoney(customTotalsUsd[col.key], "USD")}</td>
                ))}
                <td className="px-3 py-2 text-ink/30">—</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(totalUsd, "USD")}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {enteringInvoice && (
        <EnterInvoiceModal
          inv={enteringInvoice}
          customColumns={customColumns}
          onColumnAdded={(col) => setCustomColumns((prev) => [...prev, col])}
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

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-3 py-2 whitespace-nowrap font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 whitespace-nowrap text-ink/80">{children}</td>;
}

// ---------------- One invoice row ----------------

function InvoiceRow({
  inv, customColumns, onChange, onEnterInvoice, onDeleted
}: {
  inv: Invoice;
  customColumns: CustomColumn[];
  onChange: (patch: Partial<Invoice>) => void;
  onEnterInvoice: () => void;
  onDeleted: () => void;
}) {
  async function handleDelete() {
    if (!confirm(`Delete this invoice (${inv.booking_number || "no booking"} / ${inv.container_number || "no container"})? This cannot be undone.`)) return;
    const res = await fetch(`/api/forwarder-invoices/${inv.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "Failed to delete");
      return;
    }
    onDeleted();
  }
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
      {customColumns.map((col) => (
        <EditableCell
          key={col.key}
          value={String(inv.custom_charges?.[col.key] ?? 0)}
          isNumber
          onSave={(v) => patchInvoice(inv.id, { custom_charges: { [col.key]: Number(v) || 0 } }).then((r) => onChange(r.invoice))}
          display={fmtMoney(inv.custom_charges?.[col.key] ?? 0, inv.currency)}
        />
      ))}
      <Td>
        <span className="font-medium">{fmtMoney(invoiceTotal(inv, customColumns), inv.currency)}</span>
      </Td>
      <Td>
        <span className="font-medium">{fmtMoney(invoiceTotalUsd(inv, customColumns), "USD")}</span>
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
      <td className="px-3 py-2">
        <button onClick={handleDelete} className="text-xs text-cutoff hover:underline" title="Delete this invoice">
          Delete
        </button>
      </td>
    </tr>
  );
}

// The select IS the pill - it used to render a separate colored
// StatusPill next to a plain gray <select>, which looked like two
// controls showing conflicting info for the same value. One control now.
const RELEASE_STATUS_COLORS: Record<string, string> = {
  "on water": "bg-sky-100 text-sky-700",
  released: "bg-emerald-100 text-emerald-700",
};

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
  const colorClass = RELEASE_STATUS_COLORS[value.toLowerCase()] ?? "bg-slate-100 text-slate-600";
  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      disabled={saving}
      className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${colorClass}`}
    >
      <option value="">— set —</option>
      {RELEASE_STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
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
  inv, customColumns, onColumnAdded, onClose, onSaved,
}: {
  inv: Invoice;
  customColumns: CustomColumn[];
  onColumnAdded: (col: CustomColumn) => void;
  onClose: () => void;
  onSaved: (invoice: Invoice) => void;
}) {
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
  const [customValues, setCustomValues] = useState<Record<string, string>>(
    Object.fromEntries(customColumns.map((c) => [c.key, String(inv.custom_charges?.[c.key] ?? 0)]))
  );
  const [suggestedCharges, setSuggestedCharges] = useState<{ name: string; amount: number }[]>([]);
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
      // Charge lines the AI found that don't match any of the 6 fixed
      // fields - surfaced as suggestions rather than silently dropped;
      // adding one as a column is a deliberate, confirmed action.
      if (Array.isArray(ex.other_charges) && ex.other_charges.length > 0) {
        setSuggestedCharges(ex.other_charges.filter((c: any) => c?.name && c?.amount != null));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function acceptSuggestion(s: { name: string; amount: number }) {
    if (customColumns.length >= MAX_CUSTOM_COLUMNS) {
      alert(`You already have ${MAX_CUSTOM_COLUMNS} custom columns, the maximum - enter "${s.name}" under an existing column instead.`);
      return;
    }
    if (!confirm(`Add "${s.name}" as a new charge column (value ${s.amount})? It will show up on every forwarder's invoice ledger.`)) return;
    try {
      const column = await createCustomColumn(s.name);
      onColumnAdded(column);
      setCustomValues((prev) => ({ ...prev, [column.key]: String(s.amount) }));
      setSuggestedCharges((prev) => prev.filter((c) => c !== s));
    } catch (err: any) {
      alert(err.message);
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
      const updates: Record<string, any> = {
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
      if (customColumns.length > 0) {
        updates.custom_charges = Object.fromEntries(customColumns.map((c) => [c.key, Number(customValues[c.key]) || 0]));
      }
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

        {suggestedCharges.length > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mb-4 space-y-2">
            <div className="text-xs font-medium text-amber-800">
              This PDF has charge line(s) that don't match a standard field:
            </div>
            {suggestedCharges.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-sm">
                <span>{s.name} — {s.amount}</span>
                <button onClick={() => acceptSuggestion(s)} className="text-xs bg-ink text-white px-2 py-1 rounded">
                  + Add as column
                </button>
              </div>
            ))}
          </div>
        )}

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
          {customColumns.map((col) => (
            <LabeledInput
              key={col.key}
              label={col.label}
              type="number"
              value={customValues[col.key] ?? "0"}
              onChange={(v) => setCustomValues({ ...customValues, [col.key]: v })}
            />
          ))}
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
