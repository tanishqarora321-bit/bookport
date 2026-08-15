"use client";

import { useState } from "react";
import Link from "next/link";

type Item = {
  id: string;
  description: string | null;
  weight_kg: number | null;
  unit_price: number | null;
  amount: number;
  sort_order: number;
};

type Invoice = {
  id: string;
  booking_number: string | null;
  container_number: string | null;
  month_of_loading: string | null;
  forwarder_name: string | null;
  consignee_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total: number;
  currency: string;
  paid_status: "PAID" | "UNPAID";
  notes: string | null;
  tracking_id: string | null;
  tracking: { eta: string | null; release_status: string | null } | null;
  items: Item[];
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMonth(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

async function patchInvoice(id: string, updates: Record<string, any>) {
  const res = await fetch(`/api/supplier-invoices/${id}`, {
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

export default function SupplierInvoiceLedgerClient({
  supplierId,
  supplierName,
  initialInvoices,
}: {
  supplierId: string;
  supplierName: string;
  initialInvoices: Invoice[];
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function updateLocal(id: string, patch: Partial<Invoice>) {
    setInvoices(invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function toggleExpanded(id: string) {
    setExpanded({ ...expanded, [id]: !expanded[id] });
  }

  const grandTotal = invoices.reduce((sum, inv) => {
    // Only sums same-currency invoices meaningfully -- shown per-currency below.
    return sum;
  }, 0);

  const totalsByCurrency: Record<string, number> = {};
  for (const inv of invoices) {
    totalsByCurrency[inv.currency] = (totalsByCurrency[inv.currency] ?? 0) + Number(inv.total || 0);
  }

  return (
    <div className="h-full flex flex-col">
      <Link href="/suppliers" className="text-sm text-accent mb-2 w-fit">
        ← Back to Suppliers
      </Link>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">{supplierName} — Invoices</h1>
        <div className="flex items-center gap-4">
          <div className="text-xs text-ink/50">
            {Object.entries(totalsByCurrency).map(([cur, total]) => (
              <span key={cur} className="mr-3">
                Total {cur}: <span className="font-medium text-ink/80">{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </span>
            ))}
          </div>
          <button onClick={() => setAdding(true)} className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium">
            + Add Invoice
          </button>
        </div>
      </div>

      {adding && (
        <AddInvoicePanel
          supplierId={supplierId}
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
              <Th>Sr. N</Th>
              <Th>Date</Th>
              <Th>Month of Loading</Th>
              <Th>Invoice #</Th>
              <Th>FF</Th>
              <Th>Consignee</Th>
              <Th>Booking No.</Th>
              <Th>Container No.</Th>
              <Th>Total</Th>
              <Th>ETA (live)</Th>
              <Th>Status (live)</Th>
              <Th>Paid</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, idx) => (
              <InvoiceRows
                key={inv.id}
                sr={invoices.length - idx}
                inv={inv}
                expanded={!!expanded[inv.id]}
                onToggle={() => toggleExpanded(inv.id)}
                onChange={(patch) => updateLocal(inv.id, patch)}
              />
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-10 text-center text-ink/40">
                  No invoices yet for this supplier. Click "+ Add Invoice" to enter one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-3 py-2 whitespace-nowrap font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 whitespace-nowrap text-ink/80">{children}</td>;
}

// ---------------- Add Invoice panel: lookup + header fields + cost section ----------------

type DraftItem = { description: string; weight_kg: string; unit_price: string; amount: string };

function blankItem(): DraftItem {
  return { description: "", weight_kg: "", unit_price: "", amount: "" };
}

function AddInvoicePanel({
  supplierId,
  onClose,
  onCreated,
}: {
  supplierId: string;
  onClose: () => void;
  onCreated: (inv: Invoice) => void;
}) {
  const [query, setQuery] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [form, setForm] = useState({
    invoice_number: "",
    invoice_date: "",
    currency: "EUR",
  });
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
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
      if (!json.matched) {
        setLookupError(
          "No matching Tracking entry found for that number. You can still enter this invoice manually below — it just won't have a live ETA/status link, and Booking/Container/FF/Consignee/Month of Loading won't auto-fill."
        );
      }
    } catch (err: any) {
      setLookupError(err.message);
    } finally {
      setLooking(false);
    }
  }

  function updateItem(i: number, patch: Partial<DraftItem>) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItemRow() {
    setItems([...items, blankItem()]);
  }
  function removeItemRow(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  const computedTotal = items.reduce((sum, it) => {
    const explicit = it.amount !== "" ? Number(it.amount) : null;
    if (explicit !== null && !Number.isNaN(explicit)) return sum + explicit;
    const w = Number(it.weight_kg);
    const p = Number(it.unit_price);
    if (it.weight_kg !== "" && it.unit_price !== "" && !Number.isNaN(w) && !Number.isNaN(p)) {
      return sum + w * p;
    }
    return sum;
  }, 0);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/supplier-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId,
          tracking_id: lookupResult?.tracking_id ?? null,
          booking_number: lookupResult?.booking_number ?? query,
          container_number: lookupResult?.container_number ?? null,
          month_of_loading: lookupResult?.month_of_loading ?? null,
          forwarder_name: lookupResult?.forwarder_name ?? null,
          consignee_name: lookupResult?.consignee_name ?? null,
          ...form,
          items: items.filter((it) => it.description || it.weight_kg || it.unit_price || it.amount),
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
          <div><span className="text-ink/40">Container:</span> {lookupResult.container_number || "—"}</div>
          <div><span className="text-ink/40">FF (Forwarder):</span> {lookupResult.forwarder_name || "—"}</div>
          <div><span className="text-ink/40">Consignee:</span> {lookupResult.consignee_name || "—"}</div>
          <div><span className="text-ink/40">Month of Loading:</span> {lookupResult.month_of_loading || "—"}</div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <LabeledInput label="Invoice Number" value={form.invoice_number} onChange={(v) => setForm({ ...form, invoice_number: v })} />
        <LabeledInput label="Invoice Date" type="date" value={form.invoice_date} onChange={(v) => setForm({ ...form, invoice_date: v })} />
        <div>
          <div className="text-xs text-ink/40 mb-0.5">Currency</div>
          <select
            className="border rounded px-2 py-1 text-sm w-full"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="INR">INR</option>
            <option value="GBP">GBP</option>
            <option value="AED">AED</option>
          </select>
        </div>
      </div>

      {/* Cost section -- kept visually separate, this is the line-item table */}
      <div className="border-t pt-3">
        <div className="text-xs font-medium text-ink/60 mb-2">Cost Section</div>
        <table className="w-full text-sm mb-2">
          <thead>
            <tr className="text-left text-ink/40">
              <th className="pb-1 pr-2 font-normal">Description</th>
              <th className="pb-1 pr-2 font-normal w-28">Weight (KG)</th>
              <th className="pb-1 pr-2 font-normal w-28">Unit Price</th>
              <th className="pb-1 pr-2 font-normal w-28">Amount</th>
              <th className="pb-1 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="pr-2 pb-1">
                  <input
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={it.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                  />
                </td>
                <td className="pr-2 pb-1">
                  <input
                    type="number"
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={it.weight_kg}
                    onChange={(e) => updateItem(i, { weight_kg: e.target.value })}
                  />
                </td>
                <td className="pr-2 pb-1">
                  <input
                    type="number"
                    step="0.0001"
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={it.unit_price}
                    onChange={(e) => updateItem(i, { unit_price: e.target.value })}
                  />
                </td>
                <td className="pr-2 pb-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="auto"
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={it.amount}
                    onChange={(e) => updateItem(i, { amount: e.target.value })}
                  />
                </td>
                <td className="pb-1 text-center">
                  {items.length > 1 && (
                    <button onClick={() => removeItemRow(i)} className="text-cutoff text-xs">
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between">
          <button onClick={addItemRow} className="text-xs text-accent underline">
            + Add Line
          </button>
          <div className="text-sm text-ink/70">
            Computed total: <span className="font-medium">{form.currency} {computedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {saveError && <div className="text-xs text-cutoff mt-3">{saveError}</div>}

      <div className="flex gap-2 mt-3">
        <button onClick={save} disabled={saving} className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium disabled:opacity-50">
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

// ---------------- One invoice's header row + expandable cost section ----------------

function InvoiceRows({
  sr,
  inv,
  expanded,
  onToggle,
  onChange,
}: {
  sr: number;
  inv: Invoice;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Invoice>) => void;
}) {
  return (
    <>
      <tr className="border-b hover:bg-blue-50/30">
        <Td>{sr}</Td>
        <EditableCell value={inv.invoice_date} isDate onSave={(v) => patchInvoice(inv.id, { invoice_date: v }).then(() => onChange({ invoice_date: v }))} />
        <Td>{fmtMonth(inv.month_of_loading)}</Td>
        <EditableCell value={inv.invoice_number} onSave={(v) => patchInvoice(inv.id, { invoice_number: v }).then(() => onChange({ invoice_number: v }))} />
        <Td>{inv.forwarder_name || "—"}</Td>
        <Td>{inv.consignee_name || "—"}</Td>
        <Td>{inv.booking_number || "—"}</Td>
        <Td>{inv.container_number || "—"}</Td>
        <Td>
          <span className="font-medium">{inv.currency} {Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </Td>
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
        <td className="px-3 py-2">
          <button onClick={onToggle} className="text-xs text-accent underline whitespace-nowrap">
            {expanded ? "Hide cost ▲" : "Cost section ▼"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b bg-slate-50/60">
          <td colSpan={13} className="px-6 py-3">
            <CostSection invoiceId={inv.id} items={inv.items} currency={inv.currency} onTotalChange={(total) => onChange({ total })} onItemsChange={(items) => onChange({ items })} />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------- Cost section: the per-invoice line-item sub-table ----------------

function CostSection({
  invoiceId,
  items,
  currency,
  onTotalChange,
  onItemsChange,
}: {
  invoiceId: string;
  items: Item[];
  currency: string;
  onTotalChange: (total: number) => void;
  onItemsChange: (items: Item[]) => void;
}) {
  const [rows, setRows] = useState(items);
  const [addingRow, setAddingRow] = useState(false);
  const [draft, setDraft] = useState<DraftItem>(blankItem());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveNewRow() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/supplier-invoices/${invoiceId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add line");
      const next = [...rows, json.item];
      setRows(next);
      onItemsChange(next);
      onTotalChange(json.total);
      setDraft(blankItem());
      setAddingRow(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function patchItem(itemId: string, field: keyof Item, value: string) {
    const res = await fetch(`/api/supplier-invoices/${invoiceId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Save failed");
    const next = rows.map((r) => (r.id === itemId ? json.item : r));
    setRows(next);
    onItemsChange(next);
    onTotalChange(json.total);
  }

  async function deleteRow(itemId: string) {
    if (!confirm("Remove this cost line?")) return;
    const res = await fetch(`/api/supplier-invoices/${invoiceId}/items/${itemId}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) return;
    const next = rows.filter((r) => r.id !== itemId);
    setRows(next);
    onItemsChange(next);
    onTotalChange(json.total);
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink/40">
            <th className="pb-1 pr-2 font-normal">Description</th>
            <th className="pb-1 pr-2 font-normal w-32">Weight (KG)</th>
            <th className="pb-1 pr-2 font-normal w-28">Unit Price</th>
            <th className="pb-1 pr-2 font-normal w-32">Amount ({currency})</th>
            <th className="pb-1 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} className="border-t">
              <ItemCell value={item.description} onSave={(v) => patchItem(item.id, "description", v)} />
              <ItemCell value={item.weight_kg?.toString() ?? ""} isNumber onSave={(v) => patchItem(item.id, "weight_kg", v)} />
              <ItemCell value={item.unit_price?.toString() ?? ""} isNumber onSave={(v) => patchItem(item.id, "unit_price", v)} />
              <ItemCell value={item.amount?.toString() ?? "0"} isNumber onSave={(v) => patchItem(item.id, "amount", v)} />
              <td className="py-1 text-center">
                <button onClick={() => deleteRow(item.id)} className="text-cutoff text-xs">
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 text-ink/40 text-xs">
                No cost lines yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {addingRow ? (
        <div className="flex gap-2 items-center mt-2">
          <input
            placeholder="Description"
            className="border rounded px-2 py-1 text-sm flex-1"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <input
            type="number"
            placeholder="Weight KG"
            className="border rounded px-2 py-1 text-sm w-28"
            value={draft.weight_kg}
            onChange={(e) => setDraft({ ...draft, weight_kg: e.target.value })}
          />
          <input
            type="number"
            step="0.0001"
            placeholder="Unit Price"
            className="border rounded px-2 py-1 text-sm w-28"
            value={draft.unit_price}
            onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Amount (auto)"
            className="border rounded px-2 py-1 text-sm w-28"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          />
          <button onClick={saveNewRow} disabled={saving} className="text-xs bg-ink text-white px-2 py-1 rounded">
            {saving ? "…" : "✓"}
          </button>
          <button
            onClick={() => {
              setAddingRow(false);
              setDraft(blankItem());
            }}
            className="text-xs border px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>
      ) : (
        <button onClick={() => setAddingRow(true)} className="text-xs text-accent underline mt-2">
          + Add Line
        </button>
      )}
      {error && <div className="text-xs text-cutoff mt-1">{error}</div>}
    </div>
  );
}

function ItemCell({
  value,
  onSave,
  isNumber = false,
}: {
  value: string | null;
  onSave: (v: string) => Promise<any>;
  isNumber?: boolean;
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

  if (!editing) {
    return (
      <td className="py-1 pr-2">
        <span onClick={() => setEditing(true)} className="cursor-text hover:bg-blue-50 px-1 rounded block">
          {value || (isNumber ? "0" : "—")}
        </span>
      </td>
    );
  }

  return (
    <td className="py-1 pr-2">
      <div className="flex gap-1 items-center">
        <input
          autoFocus
          type={isNumber ? "number" : "text"}
          step={isNumber ? "0.0001" : undefined}
          className="border border-accent rounded px-1.5 py-0.5 text-sm w-full"
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

// ---------------- Header-row EditableCell (invoice_number, invoice_date) ----------------

function EditableCell({
  value,
  onSave,
  isDate = false,
}: {
  value: string | null;
  onSave: (v: string) => Promise<any>;
  isDate?: boolean;
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
      <td className="px-3 py-2 whitespace-nowrap">
        <span onClick={() => setEditing(true)} className="cursor-text hover:bg-blue-50 px-1 rounded block">
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
          type={isDate ? "date" : "text"}
          className="border border-accent rounded px-1.5 py-0.5 text-sm w-28"
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
