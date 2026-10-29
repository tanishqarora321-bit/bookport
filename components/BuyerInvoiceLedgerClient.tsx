"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock, DollarSign, Ship, CheckCircle2, XCircle, Receipt } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import BackButton from "@/components/ui/BackButton";
import StatusPill from "@/components/ui/StatusPill";
import EmptyState from "@/components/ui/EmptyState";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";

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
  location: string | null;
  month_of_loading: string | null;
  bl_date: string | null;
  due_date: string | null;
  forwarder_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  weight: number | null;
  weight_unit: "LBS" | "KG";
  total: number;
  total_usd: number;
  currency: string;
  fx_rate: number;
  paid_status: "PAID" | "UNPAID";
  notes: string | null;
  tracking_id: string | null;
  tracking: { eta: string | null; release_status: string | null } | null;
  items: Item[];
};

const RELEASE_STATUS_OPTIONS = ["On Water", "Released"];

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMonth(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
function fmtMoney(amount: number | null | undefined, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount ?? 0);
  } catch {
    return `${currency} ${(amount ?? 0).toFixed(2)}`;
  }
}

async function patchInvoice(id: string, updates: Record<string, any>) {
  const res = await fetch(`/api/buyer-invoices/${id}`, {
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

export default function BuyerInvoiceLedgerClient({
  buyerId,
  buyerName,
  initialInvoices,
  isAdmin = false,
}: {
  buyerId: string;
  buyerName: string;
  initialInvoices: Invoice[];
  isAdmin?: boolean;
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [entering, setEntering] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [paidFilter, setPaidFilter] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function updateLocal(id: string, patch: Partial<Invoice>) {
    setInvoices(invoices.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function toggleExpanded(id: string) {
    setExpanded({ ...expanded, [id]: !expanded[id] });
  }

  async function handleDelete(inv: Invoice) {
    if (!confirm(`Delete this invoice (${inv.invoice_number || inv.booking_number || "no reference"})? This also removes its cost-section lines, and clears this buyer from Booking & Instructions if it was their only invoice there.`)) return;
    setDeletingId(inv.id);
    try {
      const res = await fetch(`/api/buyer-invoices/${inv.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to delete invoice");
      setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && (inv.tracking?.release_status ?? "") !== statusFilter) return false;
      if (paidFilter !== "all" && inv.paid_status !== paidFilter) return false;
      return true;
    });
  }, [invoices, statusFilter, paidFilter]);

  const visibleIds = useMemo(() => filtered.map((i) => i.id), [filtered]);
  const bulk = useBulkSelection(visibleIds);
  useEffect(() => {
    bulk.pruneToVisible(new Set(visibleIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds.join(",")]);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  async function bulkDeleteSelected() {
    setBulkDeleting(true);
    setBulkError(null);
    const ids = bulk.selectedIds;
    const succeeded: string[] = [];
    const failures: string[] = [];
    for (const id of ids) {
      const target = invoices.find((i) => i.id === id);
      const name = target?.invoice_number || target?.booking_number || id;
      try {
        const res = await fetch(`/api/buyer-invoices/${id}`, { method: "DELETE" });
        if (res.ok) {
          succeeded.push(id);
        } else {
          const json = await res.json().catch(() => ({}));
          failures.push(`${name}: ${json.error || "failed"}`);
        }
      } catch (err: any) {
        failures.push(`${name}: ${err?.message || "network error"}`);
      }
    }
    setInvoices((prev) => prev.filter((i) => !succeeded.includes(i.id)));
    setBulkDeleting(false);
    setBulkConfirming(false);
    bulk.clear();
    if (failures.length > 0) {
      setBulkError(`${failures.length} of ${ids.length} couldn't be deleted:\n${failures.join("\n")}`);
    }
  }

  // KPI cards reflect the whole ledger regardless of the filters above,
  // same convention as the Suppliers invoice ledger.
  const pendingCount = invoices.filter((i) => !i.invoice_number).length;
  const onWaterCount = invoices.filter((i) => (i.tracking?.release_status ?? "").toLowerCase() === "on water").length;
  const releasedCount = invoices.filter((i) => (i.tracking?.release_status ?? "").toLowerCase() === "released").length;
  const paidCount = invoices.filter((i) => i.paid_status === "PAID").length;
  const unpaidCount = invoices.filter((i) => i.paid_status === "UNPAID").length;
  const totalUsd = invoices.reduce((s, i) => s + Number(i.total_usd || 0), 0);

  const totalsByCurrency: Record<string, number> = {};
  for (const inv of invoices) {
    totalsByCurrency[inv.currency] = (totalsByCurrency[inv.currency] ?? 0) + Number(inv.total || 0);
  }

  const COLSPAN = isAdmin ? 23 : 22;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <BackButton href="/parties" label="Back to Buyers / Customers" />
          <h1 className="text-xl font-semibold text-ink">{buyerName} — Invoices</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/parties/${buyerId}/invoices/import`} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm font-medium">
            Import Excel
          </Link>
          <button onClick={() => setAdding(true)} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium">
            + Add Invoice
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4 shrink-0">
        <StatCard icon={Clock} label="Pending" value={pendingCount} tone={pendingCount > 0 ? "warning" : "default"} />
        <StatCard icon={Ship} label="On Water" value={onWaterCount} />
        <StatCard icon={CheckCircle2} label="Released" value={releasedCount} tone="success" />
        <StatCard icon={CheckCircle2} label="Paid" value={paidCount} tone="success" />
        <StatCard icon={XCircle} label="Unpaid" value={unpaidCount} tone={unpaidCount > 0 ? "danger" : "default"} />
        <StatCard icon={DollarSign} label="Total (USD)" value={fmtMoney(totalUsd, "USD")} tone="success" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-line rounded-lg px-3 py-2 text-sm bg-surface">
          <option value="all">All Status</option>
          {RELEASE_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)} className="border border-line rounded-lg px-3 py-2 text-sm bg-surface">
          <option value="all">All Paid</option>
          <option value="PAID">Paid</option>
          <option value="UNPAID">Unpaid</option>
        </select>
        <div className="text-xs text-muted ml-auto">
          {Object.entries(totalsByCurrency).map(([cur, total]) => (
            <span key={cur} className="mr-3">
              Total {cur}: <span className="font-medium text-text-2">{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </span>
          ))}
        </div>
      </div>

      {adding && (
        <AddInvoicePanel
          buyerId={buyerId}
          onClose={() => setAdding(false)}
          onCreated={(inv) => {
            setInvoices([inv, ...invoices]);
            setAdding(false);
          }}
        />
      )}

      {entering && (
        <EnterInvoiceModal
          inv={entering}
          onClose={() => setEntering(null)}
          onSaved={(updated) => {
            updateLocal(updated.id, updated);
            setEntering(null);
          }}
        />
      )}

      {isAdmin && (
        <BulkActionBar
          count={bulk.selectedCount}
          itemLabel="invoice"
          onDeleteClick={() => setBulkConfirming(true)}
          onClear={bulk.clear}
          deleting={bulkDeleting}
        />
      )}

      <div className="flex-1 overflow-auto bg-surface border border-line rounded-xl">
        <table className="text-sm border-collapse min-w-[2200px]">
          <thead className="sticky top-0 bg-surface-2 z-10">
            <tr className="text-left text-muted border-b border-line">
              {isAdmin && (
                <Th>
                  <input type="checkbox" aria-label="Select all invoices" checked={bulk.allVisibleSelected} onChange={bulk.toggleAll} />
                </Th>
              )}
              <Th>Sr. No</Th>
              <Th>Date</Th>
              <Th>Month of Loading</Th>
              <Th>Invoice</Th>
              <Th>Forwarder</Th>
              <Th>Booking No.</Th>
              <Th>Container No.</Th>
              <Th>Location</Th>
              <Th>BL Date</Th>
              <Th>Due Date</Th>
              <Th>Weight</Th>
              <Th>Total</Th>
              <Th>Total (USD)</Th>
              <Th>ETA (live)</Th>
              <Th>Status (live)</Th>
              <Th>Paid</Th>
              <Th></Th>
              <Th></Th>
              <Th></Th>
              <Th></Th>
              <Th></Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv, idx) => (
              <InvoiceRows
                key={inv.id}
                sr={filtered.length - idx}
                buyerId={buyerId}
                inv={inv}
                expanded={!!expanded[inv.id]}
                onToggle={() => toggleExpanded(inv.id)}
                onChange={(patch) => updateLocal(inv.id, patch)}
                onDelete={() => handleDelete(inv)}
                deleting={deletingId === inv.id}
                onEnterInvoice={() => setEntering(inv)}
                colSpan={COLSPAN}
                isAdmin={isAdmin}
                selected={bulk.selected.has(inv.id)}
                onToggleSelect={() => bulk.toggle(inv.id)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLSPAN}>
                  <EmptyState
                    icon={Receipt}
                    title={invoices.length === 0 ? "No invoices yet for this buyer" : "No invoices match these filters"}
                    hint={invoices.length === 0 ? 'Click "+ Add Invoice" above to enter one.' : undefined}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {bulkConfirming && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => !bulkDeleting && setBulkConfirming(false)}>
          <div className="bg-surface border border-line rounded-xl shadow-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink mb-2">
              Delete {bulk.selectedCount} invoice{bulk.selectedCount === 1 ? "" : "s"}?
            </h2>
            <p className="text-sm text-muted">
              This permanently removes each selected invoice (and its cost-section lines), and clears this buyer from
              Booking &amp; Instructions wherever it was their only invoice there. This cannot be undone.
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setBulkConfirming(false)} disabled={bulkDeleting} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-4 py-2">
                Cancel
              </button>
              <button onClick={bulkDeleteSelected} disabled={bulkDeleting} className="text-sm bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60">
                {bulkDeleting ? "Deleting…" : `Delete ${bulk.selectedCount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkError && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setBulkError(null)}>
          <div className="bg-surface border border-line rounded-xl shadow-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink mb-2">Some deletes failed</h2>
            <p className="text-sm text-muted whitespace-pre-wrap">{bulkError}</p>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setBulkError(null)} className="text-sm bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-3 py-2 whitespace-nowrap font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 whitespace-nowrap text-text-2">{children}</td>;
}

// ---------------- Add Invoice panel: lookup + header fields + cost section ----------------

type DraftItem = { description: string; weight_kg: string; unit_price: string; amount: string };

function blankItem(): DraftItem {
  return { description: "", weight_kg: "", unit_price: "", amount: "" };
}

function AddInvoicePanel({
  buyerId,
  onClose,
  onCreated,
}: {
  buyerId: string;
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
    bl_date: "",
    due_date: "",
    location: "",
    weight: "",
    weight_unit: "LBS",
    currency: "USD",
    fx_rate: "1",
  });
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setSaveError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/buyer-invoices/extract", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Extraction failed");
      const ex = json.extracted ?? {};
      setForm((f) => ({
        ...f,
        invoice_number: ex.invoice_number ?? f.invoice_number,
        invoice_date: ex.invoice_date ?? f.invoice_date,
        currency: ex.currency || f.currency,
        weight: ex.weight != null ? String(ex.weight) : f.weight,
        weight_unit: ex.weight_unit || f.weight_unit,
      }));
      if (Array.isArray(ex.items) && ex.items.length > 0) {
        setItems(
          ex.items.map((it: any) => ({
            description: it.description ?? "",
            weight_kg: "",
            unit_price: "",
            amount: it.amount != null ? String(it.amount) : "",
          }))
        );
      }
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setUploading(false);
    }
  }

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
          "No matching Tracking entry found for that number. You can still enter this invoice manually below — it just won't have a live ETA/status link, and Booking/Container/Forwarder/Month of Loading won't auto-fill."
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
      const res = await fetch("/api/buyer-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer_id: buyerId,
          tracking_id: lookupResult?.tracking_id ?? null,
          booking_number: lookupResult?.booking_number ?? query,
          container_number: lookupResult?.container_number ?? null,
          month_of_loading: lookupResult?.month_of_loading ?? null,
          forwarder_name: lookupResult?.forwarder_name ?? null,
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
    <div className="border border-accent/30 bg-accent-soft rounded-xl p-4 mb-4">
      <label className="block border-2 border-dashed border-line rounded-lg p-4 bg-surface hover:border-accent text-center cursor-pointer mb-3">
        <div className="text-sm font-medium text-ink">{uploading ? "Extracting…" : "Upload invoice PDF (optional — auto-fills invoice number/date/currency/weight and cost lines below)"}</div>
        <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} disabled={uploading} />
      </label>

      <div className="flex gap-2 mb-3">
        <input
          placeholder="Enter Booking Number or Container Number"
          className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
        />
        <button onClick={lookup} disabled={looking} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60">
          {looking ? "Looking up…" : "Lookup"}
        </button>
      </div>

      {lookupError && <div className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg p-2 mb-3">{lookupError}</div>}

      {lookupResult?.matched && (
        <div className="grid grid-cols-3 gap-2 text-xs mb-3 bg-surface border border-line rounded-lg p-3">
          <div><span className="text-muted">Matched by:</span> {lookupResult.matched_by}</div>
          <div><span className="text-muted">Container:</span> {lookupResult.container_number || "—"}</div>
          <div><span className="text-muted">Forwarder:</span> {lookupResult.forwarder_name || "—"}</div>
          <div><span className="text-muted">Month of Loading:</span> {lookupResult.month_of_loading || "—"}</div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 mb-4">
        <LabeledInput label="Invoice Number" value={form.invoice_number} onChange={(v) => setForm({ ...form, invoice_number: v })} />
        <LabeledInput label="Invoice Date" type="date" value={form.invoice_date} onChange={(v) => setForm({ ...form, invoice_date: v })} />
        <LabeledInput label="BL Date" type="date" value={form.bl_date} onChange={(v) => setForm({ ...form, bl_date: v })} />
        <LabeledInput label="Due Date" type="date" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
        <LabeledInput label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
        <LabeledInput label="Weight" type="number" value={form.weight} onChange={(v) => setForm({ ...form, weight: v })} />
        <div>
          <div className="text-xs text-muted mb-0.5">Weight Unit</div>
          <select
            className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full"
            value={form.weight_unit}
            onChange={(e) => setForm({ ...form, weight_unit: e.target.value })}
          >
            <option value="LBS">LBS</option>
            <option value="KG">KG</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-muted mb-0.5">Currency</div>
          <select
            className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="INR">INR</option>
            <option value="GBP">GBP</option>
            <option value="AED">AED</option>
          </select>
        </div>
        <LabeledInput
          label={`FX Rate (→ USD)`}
          type="number"
          value={form.fx_rate}
          onChange={(v) => setForm({ ...form, fx_rate: v })}
        />
      </div>

      {/* Cost section -- kept visually separate, this is the line-item table */}
      <div className="border-t border-line pt-3">
        <div className="text-xs font-medium text-text-2 mb-2">Cost Section</div>
        <table className="w-full text-sm mb-2">
          <thead>
            <tr className="text-left text-muted">
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
                    className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full"
                    value={it.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                  />
                </td>
                <td className="pr-2 pb-1">
                  <input
                    type="number"
                    className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full"
                    value={it.weight_kg}
                    onChange={(e) => updateItem(i, { weight_kg: e.target.value })}
                  />
                </td>
                <td className="pr-2 pb-1">
                  <input
                    type="number"
                    step="0.0001"
                    className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full"
                    value={it.unit_price}
                    onChange={(e) => updateItem(i, { unit_price: e.target.value })}
                  />
                </td>
                <td className="pr-2 pb-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="auto"
                    className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full"
                    value={it.amount}
                    onChange={(e) => updateItem(i, { amount: e.target.value })}
                  />
                </td>
                <td className="pb-1 text-center">
                  {items.length > 1 && (
                    <button onClick={() => removeItemRow(i)} className="text-cutoff text-xs" aria-label="Remove item row">
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between">
          <button onClick={addItemRow} className="text-xs text-accent hover:underline">
            + Add Line
          </button>
          <div className="text-sm text-text-2">
            Computed total: <span className="font-medium text-ink">{form.currency} {computedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            {Number(form.fx_rate) !== 1 && !Number.isNaN(Number(form.fx_rate)) && (
              <span className="text-muted"> (≈ USD {(computedTotal * Number(form.fx_rate)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
            )}
          </div>
        </div>
      </div>

      {saveError && <div className="text-xs text-cutoff mt-3">{saveError}</div>}

      <div className="flex gap-2 mt-3">
        <button onClick={save} disabled={saving} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50">
          {saving ? "Saving…" : "Save Invoice"}
        </button>
        <button onClick={onClose} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm">
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
      <div className="text-xs text-muted mb-0.5">{label}</div>
      <input type={type} className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// ---------------- One invoice's header row + expandable cost section ----------------

function InvoiceRows({
  sr,
  buyerId,
  inv,
  expanded,
  onToggle,
  onChange,
  onDelete,
  deleting,
  onEnterInvoice,
  colSpan,
  isAdmin = false,
  selected = false,
  onToggleSelect,
}: {
  sr: number;
  buyerId: string;
  inv: Invoice;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Invoice>) => void;
  onDelete: () => void;
  deleting: boolean;
  onEnterInvoice: () => void;
  colSpan: number;
  isAdmin?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [generatingDoc, setGeneratingDoc] = useState<"fumigation" | "coo" | "sod" | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  // "Generate Invoice" reuses the existing Final Invoice PDF pipeline
  // (app/api/tracking/[id]/documents/route.ts) rather than a new
  // generator - it just assigns an invoice number first if this row
  // doesn't have one yet, then renders/opens the PDF.
  async function handleGenerateInvoice() {
    if (!inv.tracking_id) return;
    setGenerating(true);
    setGenError(null);
    try {
      let invoiceNumber = inv.invoice_number;
      if (!invoiceNumber) {
        const res = await fetch("/api/tracking/generate-invoice-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ party_id: buyerId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not generate invoice number");
        invoiceNumber = json.invoice_no;
        await patchInvoice(inv.id, { invoice_number: invoiceNumber });
        onChange({ invoice_number: invoiceNumber });
      }

      // The documents route (below) reads invoice_no off the TRACKING
      // row, not off buyer_invoices.invoice_number - has to be pushed
      // there every time (not just when freshly generated), since an
      // imported invoice can already have its own invoice_number with
      // the linked tracking row still blank, and the route 400s with
      // "Generate an invoice number on this row first" otherwise.
      const trackingRes = await fetch(`/api/tracking/${inv.tracking_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_no: invoiceNumber }),
      });
      if (!trackingRes.ok) {
        const trackingJson = await trackingRes.json().catch(() => ({}));
        throw new Error(trackingJson.error || "Could not save the invoice number to this tracking entry");
      }

      const res2 = await fetch(`/api/tracking/${inv.tracking_id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrides: {
            invoice_date: inv.invoice_date,
            terms: "Advance",
            reference_no: invoiceNumber,
            weight_lbs: String(inv.weight ?? ""),
            qty_bales: "",
            description: inv.items[0]?.description || "",
            rate: "",
            amount: String(inv.total ?? ""),
            currency: inv.currency,
            items: inv.items.map((it) => ({
              description: it.description,
              weight_kg: it.weight_kg,
              unit_price: it.unit_price,
              amount: it.amount,
            })),
          },
        }),
      });
      const json2 = await res2.json();
      if (!res2.ok) throw new Error(json2.error || "Failed to generate invoice");
      if (json2.url) window.open(json2.url, "_blank");
    } catch (err: any) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // Fumigation Certificate / Certificate of Origin - no override form by
  // design (see app/api/tracking/[id]/fumigation-certificate/route.ts's
  // comment): fix the source data on Booking & Instructions / Buyers &
  // Customers first, then generate. Both routes derive everything from
  // the booking's uploaded BL (date/container/POL) and the buyer's own
  // shipping details, so this is just a POST + open the result.
  async function handleGenerateDoc(kind: "fumigation" | "coo" | "sod") {
    if (!inv.tracking_id) return;
    setGeneratingDoc(kind);
    setDocError(null);
    try {
      const endpoint = kind === "fumigation" ? "fumigation-certificate" : kind === "coo" ? "certificate-of-origin" : "set-of-documents";
      const res = await fetch(`/api/tracking/${inv.tracking_id}/${endpoint}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate");
      if (json.url) window.open(json.url, "_blank");
    } catch (err: any) {
      setDocError(err.message);
    } finally {
      setGeneratingDoc(null);
    }
  }

  return (
    <>
      <tr className="border-b border-line hover:bg-surface-2">
        {isAdmin && (
          <td className="px-3 py-2">
            <input type="checkbox" aria-label={`Select invoice ${inv.invoice_number || inv.booking_number || ""}`} checked={selected} onChange={onToggleSelect} />
          </td>
        )}
        <Td>{sr}</Td>
        <EditableCell value={inv.invoice_date} isDate onSave={(v) => patchInvoice(inv.id, { invoice_date: v }).then(() => onChange({ invoice_date: v }))} />
        <Td>{fmtMonth(inv.month_of_loading)}</Td>
        {inv.invoice_number ? (
          <EditableCell value={inv.invoice_number} onSave={(v) => patchInvoice(inv.id, { invoice_number: v }).then(() => onChange({ invoice_number: v }))} />
        ) : (
          <td className="px-3 py-2 whitespace-nowrap">
            <button onClick={onEnterInvoice} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-2 py-1 text-xs font-medium">
              Enter Invoice
            </button>
          </td>
        )}
        <Td>{inv.forwarder_name || "—"}</Td>
        <Td>{inv.booking_number || "—"}</Td>
        <Td>{inv.container_number || "—"}</Td>
        <EditableCell value={inv.location} onSave={(v) => patchInvoice(inv.id, { location: v }).then(() => onChange({ location: v }))} />
        <EditableCell value={inv.bl_date} isDate onSave={(v) => patchInvoice(inv.id, { bl_date: v }).then(() => onChange({ bl_date: v }))} />
        <EditableCell value={inv.due_date} isDate onSave={(v) => patchInvoice(inv.id, { due_date: v }).then(() => onChange({ due_date: v }))} />
        <WeightCell
          weight={inv.weight}
          unit={inv.weight_unit}
          onSave={(weight, unit) => patchInvoice(inv.id, { weight, weight_unit: unit }).then(() => onChange({ weight: weight === "" ? null : Number(weight), weight_unit: unit }))}
        />
        <Td>
          <span className="font-medium text-ink">{fmtMoney(inv.total, inv.currency)}</span>
        </Td>
        <Td>
          <span className="text-text-2">{fmtMoney(inv.total_usd, "USD")}</span>
        </Td>
        <Td>
          <span className="text-text-2">{fmtDate(inv.tracking?.eta ?? null)}</span>
        </Td>
        <td className="px-3 py-2 whitespace-nowrap">
          <StatusPill value={inv.tracking?.release_status ?? null} />
        </td>
        <td className="px-3 py-2">
          <button
            onClick={() => {
              const next = inv.paid_status === "PAID" ? "UNPAID" : "PAID";
              patchInvoice(inv.id, { paid_status: next }).then(() => onChange({ paid_status: next }));
            }}
            className="rounded-lg px-2 py-1 hover:bg-surface-2"
          >
            <StatusPill value={inv.paid_status} />
          </button>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <button
            onClick={handleGenerateInvoice}
            disabled={!inv.tracking_id || generating}
            title={!inv.tracking_id ? "This invoice has no linked tracking entry yet" : undefined}
            className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-40"
          >
            {generating ? "Generating…" : "Generate Invoice"}
          </button>
          {genError && <div className="text-xs text-cutoff mt-1 max-w-[180px] whitespace-normal">{genError}</div>}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <button
            onClick={() => handleGenerateDoc("fumigation")}
            disabled={!inv.tracking_id || generatingDoc !== null}
            title={!inv.tracking_id ? "This invoice has no linked tracking entry yet" : undefined}
            className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-40"
          >
            {generatingDoc === "fumigation" ? "Generating…" : "Fumigation Cert."}
          </button>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <button
            onClick={() => handleGenerateDoc("coo")}
            disabled={!inv.tracking_id || generatingDoc !== null}
            title={!inv.tracking_id ? "This invoice has no linked tracking entry yet" : undefined}
            className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-40"
          >
            {generatingDoc === "coo" ? "Generating…" : "Certificate of Origin"}
          </button>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <button
            onClick={() => handleGenerateDoc("sod")}
            disabled={!inv.tracking_id || generatingDoc !== null}
            title={!inv.tracking_id ? "This invoice has no linked tracking entry yet" : undefined}
            className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-40"
          >
            {generatingDoc === "sod" ? "Generating…" : "Set of Documents"}
          </button>
          {docError && <div className="text-xs text-cutoff mt-1 max-w-[180px] whitespace-normal">{docError}</div>}
        </td>
        <td className="px-3 py-2">
          <button onClick={onToggle} className="text-xs text-accent hover:underline whitespace-nowrap">
            {expanded ? "Hide cost ▲" : "Cost section ▼"}
          </button>
        </td>
        <td className="px-3 py-2">
          <button onClick={onDelete} disabled={deleting} className="text-xs text-cutoff hover:underline whitespace-nowrap disabled:opacity-50">
            {deleting ? "…" : "Delete"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line bg-surface-2">
          <td colSpan={colSpan} className="px-6 py-3">
            <CostSection invoiceId={inv.id} items={inv.items} currency={inv.currency} onTotalChange={(total) => onChange({ total })} onItemsChange={(items) => onChange({ items })} />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------- Enter Invoice modal: PDF upload (or manual entry) for a pending shell ----------------

function EnterInvoiceModal({
  inv, onClose, onSaved,
}: { inv: Invoice; onClose: () => void; onSaved: (invoice: Invoice) => void }) {
  const [form, setForm] = useState({
    invoice_number: inv.invoice_number ?? "",
    invoice_date: inv.invoice_date ?? "",
    currency: inv.currency || "USD",
    fx_rate: String(inv.fx_rate ?? 1),
  });
  const [items, setItems] = useState<DraftItem[]>(
    inv.items.length > 0
      ? inv.items.map((it) => ({
          description: it.description ?? "",
          weight_kg: it.weight_kg != null ? String(it.weight_kg) : "",
          unit_price: it.unit_price != null ? String(it.unit_price) : "",
          amount: it.amount != null ? String(it.amount) : "",
        }))
      : [blankItem()]
  );
  const [uploading, setUploading] = useState(false);
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
      const res = await fetch("/api/buyer-invoices/extract", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Extraction failed");
      const ex = json.extracted ?? {};
      setForm((f) => ({
        invoice_number: ex.invoice_number ?? f.invoice_number,
        invoice_date: ex.invoice_date ?? f.invoice_date,
        currency: ex.currency || f.currency,
        fx_rate: f.fx_rate,
      }));
      if (Array.isArray(ex.items) && ex.items.length > 0) {
        setItems(
          ex.items.map((it: any) => ({
            description: it.description ?? "",
            weight_kg: "",
            unit_price: "",
            amount: it.amount != null ? String(it.amount) : "",
          }))
        );
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
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
    setError(null);
    try {
      const res = await fetch(`/api/buyer-invoices/${inv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_number: form.invoice_number,
          invoice_date: form.invoice_date,
          currency: form.currency,
          fx_rate: form.fx_rate,
          items: items.filter((it) => it.description || it.weight_kg || it.unit_price || it.amount),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save invoice");
      onSaved(json.invoice);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface border border-line rounded-xl shadow-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink">
            Enter Invoice — {inv.booking_number || "—"} / {inv.container_number || "—"}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close dialog">✕</button>
        </div>

        <label className="block border-2 border-dashed border-line rounded-lg p-4 bg-surface-2 hover:border-accent text-center cursor-pointer mb-4">
          <div className="text-sm font-medium text-ink">{uploading ? "Extracting…" : "Upload invoice PDF (optional — auto-fills the fields below)"}</div>
          <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <LabeledInput label="Invoice Number" value={form.invoice_number} onChange={(v) => setForm({ ...form, invoice_number: v })} />
          <LabeledInput label="Invoice Date" type="date" value={form.invoice_date} onChange={(v) => setForm({ ...form, invoice_date: v })} />
          <div>
            <div className="text-xs text-muted mb-0.5">Currency</div>
            <select
              className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="INR">INR</option>
              <option value="GBP">GBP</option>
              <option value="AED">AED</option>
            </select>
          </div>
          <LabeledInput label="FX Rate (→ USD)" type="number" value={form.fx_rate} onChange={(v) => setForm({ ...form, fx_rate: v })} />
        </div>

        <div className="border-t border-line pt-3">
          <div className="text-xs font-medium text-text-2 mb-2">Cost Section</div>
          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="text-left text-muted">
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
                      className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full"
                      value={it.description}
                      onChange={(e) => updateItem(i, { description: e.target.value })}
                    />
                  </td>
                  <td className="pr-2 pb-1">
                    <input
                      type="number"
                      className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full"
                      value={it.weight_kg}
                      onChange={(e) => updateItem(i, { weight_kg: e.target.value })}
                    />
                  </td>
                  <td className="pr-2 pb-1">
                    <input
                      type="number"
                      step="0.0001"
                      className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full"
                      value={it.unit_price}
                      onChange={(e) => updateItem(i, { unit_price: e.target.value })}
                    />
                  </td>
                  <td className="pr-2 pb-1">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="auto"
                      className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-full"
                      value={it.amount}
                      onChange={(e) => updateItem(i, { amount: e.target.value })}
                    />
                  </td>
                  <td className="pb-1 text-center">
                    {items.length > 1 && (
                      <button onClick={() => removeItemRow(i)} className="text-cutoff text-xs" aria-label="Remove item row">
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between">
            <button onClick={addItemRow} className="text-xs text-accent hover:underline">
              + Add Line
            </button>
            <div className="text-sm text-text-2">
              Computed total: <span className="font-medium text-ink">{form.currency} {computedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              {Number(form.fx_rate) !== 1 && !Number.isNaN(Number(form.fx_rate)) && (
                <span className="text-muted"> (≈ USD {(computedTotal * Number(form.fx_rate)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
              )}
            </div>
          </div>
        </div>

        {error && <div className="text-sm text-cutoff mt-3">{error}</div>}

        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
            {saving ? "Saving…" : "Save Invoice"}
          </button>
        </div>
      </div>
    </div>
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
      const res = await fetch(`/api/buyer-invoices/${invoiceId}/items`, {
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
    const res = await fetch(`/api/buyer-invoices/${invoiceId}/items/${itemId}`, {
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
    const res = await fetch(`/api/buyer-invoices/${invoiceId}/items/${itemId}`, { method: "DELETE" });
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
          <tr className="text-left text-muted">
            <th className="pb-1 pr-2 font-normal">Description</th>
            <th className="pb-1 pr-2 font-normal w-32">Weight (KG)</th>
            <th className="pb-1 pr-2 font-normal w-28">Unit Price</th>
            <th className="pb-1 pr-2 font-normal w-32">Amount ({currency})</th>
            <th className="pb-1 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} className="border-t border-line">
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
              <td colSpan={5} className="py-2 text-muted text-xs">
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
            className="border border-line bg-surface rounded-lg px-2 py-1 text-sm flex-1"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <input
            type="number"
            placeholder="Weight KG"
            className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-28"
            value={draft.weight_kg}
            onChange={(e) => setDraft({ ...draft, weight_kg: e.target.value })}
          />
          <input
            type="number"
            step="0.0001"
            placeholder="Unit Price"
            className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-28"
            value={draft.unit_price}
            onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Amount (auto)"
            className="border border-line bg-surface rounded-lg px-2 py-1 text-sm w-28"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          />
          <button onClick={saveNewRow} disabled={saving} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-2 py-1 text-xs">
            {saving ? "…" : "✓"}
          </button>
          <button
            onClick={() => {
              setAddingRow(false);
              setDraft(blankItem());
            }}
            className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-2 py-1 text-xs"
          >
            ✕
          </button>
        </div>
      ) : (
        <button onClick={() => setAddingRow(true)} className="text-xs text-accent hover:underline mt-2">
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
        <span onClick={() => setEditing(true)} className="cursor-text hover:bg-surface-2 px-1 rounded-lg block">
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
          className="border border-accent rounded-lg px-1.5 py-0.5 text-sm w-full bg-surface"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="text-xs bg-accent text-white hover:bg-accent-hover px-1.5 py-0.5 rounded-lg">
          {saving ? "…" : "✓"}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs border border-line bg-surface hover:bg-surface-2 px-1.5 py-0.5 rounded-lg">
          ✕
        </button>
        {error && <span className="text-xs text-cutoff">{error}</span>}
      </div>
    </td>
  );
}

// ---------------- Header-row EditableCell (invoice_number, invoice_date, location, bl_date, due_date) ----------------

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
        <span onClick={() => setEditing(true)} className="cursor-text hover:bg-surface-2 px-1 rounded-lg block">
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
          className="border border-accent rounded-lg px-1.5 py-0.5 text-sm w-28 bg-surface"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="text-xs bg-accent text-white hover:bg-accent-hover px-1.5 py-0.5 rounded-lg">
          {saving ? "…" : "✓"}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs border border-line bg-surface hover:bg-surface-2 px-1.5 py-0.5 rounded-lg">
          ✕
        </button>
        {error && <span className="text-xs text-cutoff">{error}</span>}
      </div>
    </td>
  );
}

// ---------------- Weight cell: number + LBS/KG unit, saved together ----------------

function WeightCell({
  weight,
  unit,
  onSave,
}: {
  weight: number | null;
  unit: "LBS" | "KG";
  onSave: (weight: string, unit: "LBS" | "KG") => Promise<any>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(weight != null ? String(weight) : "");
  const [u, setU] = useState<"LBS" | "KG">(unit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(val, u);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <td className="px-3 py-2 whitespace-nowrap">
        <span onClick={() => setEditing(true)} className="cursor-text hover:bg-surface-2 px-1 rounded-lg block">
          {weight != null ? `${weight} ${unit}` : "—"}
        </span>
      </td>
    );
  }

  return (
    <td className="px-3 py-2 whitespace-nowrap">
      <div className="flex gap-1 items-center">
        <input
          autoFocus
          type="number"
          className="border border-accent rounded-lg px-1.5 py-0.5 text-sm w-20 bg-surface"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <select
          className="border border-accent rounded-lg px-1 py-0.5 text-sm bg-surface"
          value={u}
          onChange={(e) => setU(e.target.value as "LBS" | "KG")}
          disabled={saving}
        >
          <option value="LBS">LBS</option>
          <option value="KG">KG</option>
        </select>
        <button onClick={save} disabled={saving} className="text-xs bg-accent text-white hover:bg-accent-hover px-1.5 py-0.5 rounded-lg">
          {saving ? "…" : "✓"}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs border border-line bg-surface hover:bg-surface-2 px-1.5 py-0.5 rounded-lg">
          ✕
        </button>
        {error && <span className="text-xs text-cutoff">{error}</span>}
      </div>
    </td>
  );
}
