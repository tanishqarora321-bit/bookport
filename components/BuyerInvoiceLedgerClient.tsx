"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { BUYER_CHARGES, splitBuyerItems, type BuyerChargeKey } from "@/lib/buyer-charges";
import { Clock, DollarSign, Ship, CheckCircle2, XCircle, Receipt, Search, Wallet } from "lucide-react";
import PartyPaymentHistory from "@/components/PartyPaymentHistory";
import { PAYMENTS_LAYOUT } from "@/lib/ui-flags";
import StatCard from "@/components/ui/StatCard";
import { useYear } from "@/lib/year-context";
import { invoiceInWorkingYear } from "@/lib/year-scope";
import BackButton from "@/components/ui/BackButton";
import StatusPill from "@/components/ui/StatusPill";
import EmptyState from "@/components/ui/EmptyState";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import MultiSelect from "@/components/ui/MultiSelect";
import { eachLimited } from "@/lib/each-limited";
import { usePersistentState } from "@/lib/hooks/usePersistentState";
import StatusMenuButton, { StatusOption } from "@/components/ui/StatusMenuButton";

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

// Same floating Status/Paid menus as the Forwarders/Truckers/Suppliers ledgers.
const PAID_STATUS_MENU_OPTIONS: StatusOption[] = [
  { value: "UNPAID", label: "UNPAID", badgeClass: "b-crit" },
  { value: "PAID", label: "PAID", badgeClass: "b-ok" },
];

// Fixed per-column widths (table-layout:fixed) so the sticky Booking/
// Container Number columns' `left` offsets never drift - same approach as
// the other ledgers. Order matches the <colgroup>/<thead>: Booking Number,
// Container Number, Date, Month of Loading, Invoice, Forwarder, Location,
// BL Date, Due Date, Weight, Goods Value, Ocean Freight, Commission,
// Trucking, Total, Total (USD), ETA (live), Status (live), Paid, Generate
// Invoice (opens the Final Invoice page), Fumigation Cert., Certificate of
// Origin, Set of Documents, Delete. No Cost section (owner, 2026-11): the
// goods (item, weight x rate) are entered on the Final Invoice page; the
// ledger just shows the final Goods Value and the three charges.
const LEDGER_COLUMN_WIDTHS = [160, 180, 120, 140, 160, 140, 140, 120, 120, 150, 140, 140, 130, 120, 130, 130, 120, 150, 110, 160, 150, 180, 160, 80];
// Ledger column order of the three charges (lib/buyer-charges.ts).
const LEDGER_CHARGES: BuyerChargeKey[] = ["ocean_freight", "commission", "trucking"];
const chargeLabel = (k: BuyerChargeKey) => BUYER_CHARGES.find((c) => c.key === k)!.label;
const CHECKBOX_COLUMN_WIDTH = 40;

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
  // The sidebar's Working Year scopes this whole page - grid, filters, KPI
  // cards and Payment History (lib/year-scope.ts for which year an invoice
  // belongs to).
  const { year } = useYear();
  const yearInvoices = useMemo(() => invoices.filter((i) => invoiceInWorkingYear(i, year)), [invoices, year]);
  // Pending = no invoice number yet (not imported, not generated) - a toggle
  // in the header like the other ledgers, so it costs the table no space.
  const [pendingOnly, setPendingOnly] = usePersistentState(`buy:${buyerId}:pendingOnly`, false);
  // Payments Received side panel (same Payment History as the other ledgers,
  // but money received FROM the buyer).
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = usePersistentState<string[]>(`buy:${buyerId}:statusFilter`, []); // multi-select: none ticked = all
  const [paidFilter, setPaidFilter] = usePersistentState<string[]>(`buy:${buyerId}:paidFilter`, []); // multi-select: none ticked = all
  const [monthFilter, setMonthFilter] = usePersistentState<string[]>(`buy:${buyerId}:monthFilter`, []); // multi-select: none ticked = all
  const [search, setSearch] = usePersistentState(`buy:${buyerId}:search`, "");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function updateLocal(id: string, patch: Partial<Invoice>) {
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
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

  const monthKey = (d: string | null) => (d ? d.slice(0, 7) : null); // "YYYY-MM"
  const monthOptions = useMemo(() => {
    const keys = new Set(yearInvoices.map((i) => monthKey(i.month_of_loading)).filter((k): k is string => !!k));
    return Array.from(keys).sort().reverse();
  }, [yearInvoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return yearInvoices.filter((inv) => {
      if (pendingOnly && inv.invoice_number) return false;
      if (statusFilter.length && !statusFilter.includes(String((inv.tracking?.release_status ?? "") ?? ""))) return false;
      if (paidFilter.length && !paidFilter.includes(String(inv.paid_status ?? ""))) return false;
      if (monthFilter.length && !monthFilter.includes(String(monthKey(inv.month_of_loading) ?? ""))) return false;
      if (q) {
        const haystack = [inv.booking_number, inv.container_number, inv.invoice_number, inv.forwarder_name, inv.location]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [yearInvoices, pendingOnly, statusFilter, paidFilter, monthFilter, search]);

  // Pagination matches the other ledgers.
  const [pageSize, setPageSize] = usePersistentState(`buy:${buyerId}:pageSize`, 25);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [pendingOnly, statusFilter, paidFilter, monthFilter, search, pageSize, year]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageStart = page * pageSize;
  const paginated = useMemo(() => filtered.slice(pageStart, pageStart + pageSize), [filtered, pageStart, pageSize]);

  const visibleIds = useMemo(() => paginated.map((i) => i.id), [paginated]);
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
    await eachLimited(ids, 6, async (id) => {
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
    });
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
  const pendingCount = yearInvoices.filter((i) => !i.invoice_number).length;
  const onWaterCount = yearInvoices.filter((i) => (i.tracking?.release_status ?? "").toLowerCase() === "on water").length;
  const releasedCount = yearInvoices.filter((i) => (i.tracking?.release_status ?? "").toLowerCase() === "released").length;
  const paidCount = yearInvoices.filter((i) => i.paid_status === "PAID").length;
  const unpaidCount = yearInvoices.filter((i) => i.paid_status === "UNPAID").length;
  const totalUsd = yearInvoices.reduce((s, i) => s + Number(i.total_usd || 0), 0);

  // Totals row (the filtered rows, like the other ledgers). "Total" is only
  // summed when every row shares one currency.
  const filteredTotalUsd = filtered.reduce((s, i) => s + Number(i.total_usd || 0), 0);
  const filteredCurrencies = Array.from(new Set(filtered.map((i) => i.currency || "USD")));
  const filteredTotal = filtered.reduce((s, i) => s + Number(i.total || 0), 0);
  // Goods Value / charges totals, in USD (each row's amount x its FX rate).
  const filteredSplitUsd = filtered.reduce(
    (acc, i) => {
      const sp = splitBuyerItems(i.items);
      const fx = Number(i.fx_rate) || 1;
      acc.goods += sp.goodsTotal * fx;
      for (const k of LEDGER_CHARGES) acc[k] += sp.charges[k] * fx;
      return acc;
    },
    { goods: 0, ocean_freight: 0, commission: 0, trucking: 0 } as Record<"goods" | BuyerChargeKey, number>
  );

  const COLSPAN = (isAdmin ? 1 : 0) + LEDGER_COLUMN_WIDTHS.length;
  const tableWidth = (isAdmin ? CHECKBOX_COLUMN_WIDTH : 0) + LEDGER_COLUMN_WIDTHS.reduce((s, w) => s + w, 0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <BackButton href="/parties" label="Back to Buyers / Customers" />
          <h1 className="text-xl font-semibold text-ink">{buyerName} — Invoices</h1>
        </div>
        {/* Equal columns sized to the widest label - all buttons the same
            size. No "+ Add Invoice": a buyer invoice is imported or
            generated (Generate Invoice on its row), never typed in. */}
        <div className="grid grid-flow-col auto-cols-fr gap-2">
          <button
            onClick={() => setPendingOnly((v) => !v)}
            aria-pressed={pendingOnly}
            title="Invoices that don't have an invoice number yet (not imported or generated)"
            className={`text-sm border rounded-lg px-3 py-1.5 font-medium flex items-center justify-center gap-1.5 ${pendingOnly ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:bg-surface-2"}`}
          >
            <Clock className="w-4 h-4" size={16} /> Pending Invoices ({pendingCount})
          </button>
          <Link href={`/parties/${buyerId}/invoices/import`} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium flex items-center justify-center">
            Import Excel
          </Link>
          {PAYMENTS_LAYOUT === "drawer" && (
            <button
              onClick={() => setPaymentsOpen(true)}
              aria-haspopup="dialog"
              className="text-sm bg-accent hover:bg-accent-hover text-white rounded-lg px-3 py-1.5 font-medium flex items-center justify-center gap-1.5"
            >
              <Wallet className="w-4 h-4" size={16} /> Payments Received
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 shrink-0">
        <StatCard icon={Clock} label="Pending" value={pendingCount} tone={pendingCount > 0 ? "warning" : "default"} />
        <StatCard icon={Ship} label="On Water" value={onWaterCount} />
        <StatCard icon={CheckCircle2} label="Released" value={releasedCount} tone="success" />
        <StatCard icon={CheckCircle2} label="Paid" value={paidCount} tone="success" />
        <StatCard icon={XCircle} label="Unpaid" value={unpaidCount} tone={unpaidCount > 0 ? "danger" : "default"} />
        <StatCard icon={DollarSign} label="Total (USD)" value={fmtMoney(totalUsd, "USD")} tone="success" />
      </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
      {PAYMENTS_LAYOUT === "card" ? (
        <div className="mt-4 mb-4 shrink-0">
          <PartyPaymentHistory partyId={buyerId} totalInvoicedUsd={totalUsd} received />
        </div>
      ) : (
        <>
          <PartyPaymentHistory
            partyId={buyerId}
            partyName={buyerName}
            totalInvoicedUsd={totalUsd}
            variant="drawer"
            open={paymentsOpen}
            onClose={() => setPaymentsOpen(false)}
            received
          />
          <div className="mt-4 shrink-0" />
        </>
      )}

      <div className="flex-1 min-h-0 flex flex-col bg-surface border border-line rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-line shrink-0">
        <label style={{ flex: "1 1 260px", maxWidth: 340, display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", border: "1px solid var(--line2)", borderRadius: 9, background: "var(--surf)" }}>
          <Search className="shrink-0" size={15} style={{ color: "var(--tx2)" }} />
          <span className="sr-only">Search invoices</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search booking #, container #, invoice #…"
            style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", font: "inherit", fontSize: 13, color: "var(--tx)" }}
          />
        </label>
        <MultiSelect label="Month of loading" allLabel="All Months" options={monthOptions} value={monthFilter} onChange={setMonthFilter} format={(k) => new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })} width={150} />
        <MultiSelect label="Status" allLabel="All Status" options={RELEASE_STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} width={150} />
        <MultiSelect label="Paid" allLabel="All Paid" options={["PAID", "UNPAID"]} value={paidFilter} onChange={setPaidFilter} format={(v) => (v === "PAID" ? "Paid" : "Unpaid")} width={150} />
        {(pendingOnly || statusFilter.length > 0 || paidFilter.length > 0 || monthFilter.length > 0 || search) && (
          <button
            onClick={() => {
              setPendingOnly(false);
              setStatusFilter([]);
              setPaidFilter([]);
              setMonthFilter([]);
              setSearch("");
            }}
            aria-label="Clear filters"
            title="Clear filters"
            className="chip"
            style={{ height: 36, width: 36, padding: 0, justifyContent: "center", color: "var(--accent)", borderColor: "var(--accent)" }}
          >
            ✕
          </button>
        )}
        <div style={{ flex: "1 1 0" }} />
        <span className="lbl num" aria-live="polite">
          <b style={{ color: "var(--tx)" }}>{filtered.length}</b> invoice{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {isAdmin && (
        <BulkActionBar
          count={bulk.selectedCount}
          itemLabel="invoice"
          onDeleteClick={() => setBulkConfirming(true)}
          onClear={bulk.clear}
          deleting={bulkDeleting}
        />
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="text-sm border-collapse" style={{ tableLayout: "fixed", width: tableWidth, minWidth: "100%" }}>
          <colgroup>
            {isAdmin && <col style={{ width: CHECKBOX_COLUMN_WIDTH }} />}
            {LEDGER_COLUMN_WIDTHS.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-left text-muted border-b border-line">
              {isAdmin && (
                <th className="px-3 py-2.5 whitespace-nowrap font-medium sticky top-0 left-0 z-20 bg-surface-2">
                  <input type="checkbox" aria-label="Select all invoices" checked={bulk.allVisibleSelected} onChange={bulk.toggleAll} />
                </th>
              )}
              <th className={`px-3 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis font-medium sticky top-0 z-20 bg-surface-2 ${isAdmin ? "left-10" : "left-0"}`}>Booking Number</th>
              <th className={`px-3 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis font-medium sticky top-0 z-20 bg-surface-2 shadow-[1px_0_0_var(--line)] ${isAdmin ? "left-[200px]" : "left-[160px]"}`}>Container Number</th>
              <Th>Date</Th>
              <Th>Month of Loading</Th>
              <Th>Invoice</Th>
              <Th>Forwarder</Th>
              <Th>Location</Th>
              <Th>BL Date</Th>
              <Th>Due Date</Th>
              <Th>Weight</Th>
              <Th>Goods Value</Th>
              {LEDGER_CHARGES.map((k) => (
                <Th key={k}>{chargeLabel(k)}</Th>
              ))}
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
            </tr>
          </thead>
          <tbody>
            {paginated.map((inv) => (
              <InvoiceRows
                key={inv.id}
                buyerId={buyerId}
                inv={inv}
                onChange={(patch) => updateLocal(inv.id, patch)}
                onDelete={() => handleDelete(inv)}
                deleting={deletingId === inv.id}
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
                    title={yearInvoices.length === 0 ? "No invoices yet for this buyer" : "No invoices match these filters"}
                    hint={yearInvoices.length === 0 ? "An invoice appears here as soon as a container with this buyer is added in Booking & Instructions, or import one with Import Excel." : undefined}
                  />
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="font-medium bg-surface-2 border-t border-line">
                {/* The label sits in the frozen Booking / Container columns,
                    so it stays put while the amounts scroll with their own
                    columns - same as the other ledgers. */}
                {isAdmin && <td className="sticky left-0 z-10 bg-surface-2" />}
                <td className={`px-3 py-2 whitespace-nowrap sticky z-10 bg-surface-2 text-ink ${isAdmin ? "left-10" : "left-0"}`}>Totals in USD</td>
                <td className={`sticky z-10 bg-surface-2 shadow-[1px_0_0_var(--line)] ${isAdmin ? "left-[200px]" : "left-[160px]"}`} />
                <td colSpan={8} />
                <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(filteredSplitUsd.goods, "USD")}</td>
                {LEDGER_CHARGES.map((k) => (
                  <td key={k} className="px-3 py-2 whitespace-nowrap">{fmtMoney(filteredSplitUsd[k], "USD")}</td>
                ))}
                <td className="px-3 py-2 whitespace-nowrap">{filteredCurrencies.length === 1 ? fmtMoney(filteredTotal, filteredCurrencies[0]) : <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(filteredTotalUsd, "USD")}</td>
                <td colSpan={LEDGER_COLUMN_WIDTHS.length - 16} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-t border-line shrink-0">
        <span className="text-xs text-muted tabular-nums">
          {filtered.length === 0 ? "Showing 0 of 0" : `Showing ${pageStart + 1}-${Math.min(pageStart + pageSize, filtered.length)} of ${filtered.length}`}
        </span>
        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-2 text-xs text-muted">
            Rows per page
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="border border-line rounded-lg px-2 py-1 text-xs bg-surface">
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium disabled:opacity-50">
            Previous
          </button>
          <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium disabled:opacity-50">
            Next
          </button>
        </div>
      </div>
      </div>
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
  return <th className="px-3 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis font-medium sticky top-0 z-10 bg-surface-2">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3.5 whitespace-nowrap overflow-hidden text-ellipsis text-text-2">{children}</td>;
}


// ---------------- One invoice's header row + expandable cost section ----------------

function InvoiceRows({
  buyerId,
  inv,
  onChange,
  onDelete,
  deleting,
  colSpan,
  isAdmin = false,
  selected = false,
  onToggleSelect,
}: {
  buyerId: string;
  inv: Invoice;
  onChange: (patch: Partial<Invoice>) => void;
  onDelete: () => void;
  deleting: boolean;
  colSpan: number;
  isAdmin?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const split = splitBuyerItems(inv.items);
  const [generatingDoc, setGeneratingDoc] = useState<"fumigation" | "coo" | "sod" | null>(null);
  const [docError, setDocError] = useState<{ kind: "fumigation" | "coo" | "sod"; message: string } | null>(null);

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

      // Opens the Final Invoice page: everything pre-filled (BL, packing,
      // booking, this row), editable, then printed from there.
      router.push(`/tracking/${inv.tracking_id}/documents?back=${encodeURIComponent(`/parties/${buyerId}/invoices`)}`);
    } catch (err: any) {
      setGenError(err.message);
      setGenerating(false);
    }
  }

  // Fumigation Certificate / Certificate of Origin - no override form by
  // design (see app/api/tracking/[id]/fumigation-certificate/route.ts's
  // comment): fix the source data on Booking & Instructions / Buyers &
  // Customers first, then generate. Both routes derive everything from
  // the booking's uploaded BL (date/container/POL) and the buyer's own
  // shipping details, so this is just a POST + open the result.
  // Printing asks for the date first (owner, 2026-11-19): 3 days before
  // the BL date, or another date the user enters.
  const [datePrompt, setDatePrompt] = useState<"fumigation" | "coo" | "sod" | null>(null);
  function handleGenerateDoc(kind: "fumigation" | "coo" | "sod") {
    if (!inv.tracking_id) return;
    setDocError(null);
    setDatePrompt(kind);
  }

  async function generateDoc(kind: "fumigation" | "coo" | "sod", date: string) {
    if (!inv.tracking_id) return;
    setDatePrompt(null);
    setGeneratingDoc(kind);
    setDocError(null);
    try {
      const endpoint = kind === "fumigation" ? "fumigation-certificate" : kind === "coo" ? "certificate-of-origin" : "set-of-documents";
      const res = await fetch(`/api/tracking/${inv.tracking_id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate");
      if (json.url) window.open(json.url, "_blank");
    } catch (err: any) {
      setDocError({ kind, message: err.message });
    } finally {
      setGeneratingDoc(null);
    }
  }

  return (
    <>
      {datePrompt &&
        inv.tracking_id &&
        createPortal(
          <DocDateDialog
            trackingId={inv.tracking_id}
            title={datePrompt === "fumigation" ? "Fumigation Certificate" : datePrompt === "coo" ? "Certificate of Origin" : "Set of Documents"}
            onCancel={() => setDatePrompt(null)}
            onPrint={(date) => generateDoc(datePrompt, date)}
          />,
          document.body
        )}
      <tr className="group border-b border-line hover:bg-surface-2">
        {isAdmin && (
          <td className="px-3 py-3.5 sticky left-0 z-10 bg-surface group-hover:bg-surface-2 w-10">
            <input type="checkbox" aria-label={`Select invoice ${inv.invoice_number || inv.booking_number || ""}`} checked={selected} onChange={onToggleSelect} />
          </td>
        )}
        <td className={`px-3 py-3.5 whitespace-nowrap overflow-hidden text-ellipsis sticky z-10 bg-surface group-hover:bg-surface-2 font-semibold text-accent ${isAdmin ? "left-10" : "left-0"}`}>{inv.booking_number || "—"}</td>
        <td className={`px-3 py-3.5 whitespace-nowrap overflow-hidden text-ellipsis sticky z-10 bg-surface group-hover:bg-surface-2 font-semibold text-accent shadow-[1px_0_0_var(--line)] ${isAdmin ? "left-[200px]" : "left-[160px]"}`}>{inv.container_number || "—"}</td>
        <EditableCell value={inv.invoice_date} isDate onSave={(v) => patchInvoice(inv.id, { invoice_date: v }).then(() => onChange({ invoice_date: v }))} />
        <Td>{fmtMonth(inv.month_of_loading)}</Td>
        {/* The invoice number from the import, or the one Generate Invoice
            assigned - no Enter Invoice / upload step (2026-11). Still
            correctable with a click. */}
        <EditableCell value={inv.invoice_number} onSave={(v) => patchInvoice(inv.id, { invoice_number: v }).then(() => onChange({ invoice_number: v }))} />
        <Td>{inv.forwarder_name || "—"}</Td>
        <EditableCell value={inv.location} onSave={(v) => patchInvoice(inv.id, { location: v }).then(() => onChange({ location: v }))} />
        <EditableCell value={inv.bl_date} isDate onSave={(v) => patchInvoice(inv.id, { bl_date: v }).then(() => onChange({ bl_date: v }))} />
        <EditableCell value={inv.due_date} isDate onSave={(v) => patchInvoice(inv.id, { due_date: v }).then(() => onChange({ due_date: v }))} />
        <WeightCell
          weight={inv.weight}
          unit={inv.weight_unit}
          onSave={(weight, unit) => patchInvoice(inv.id, { weight, weight_unit: unit }).then(() => onChange({ weight: weight === "" ? null : Number(weight), weight_unit: unit }))}
        />
        <Td>
          <span className="text-text-2">{fmtMoney(split.goodsTotal, inv.currency)}</span>
        </Td>
        {LEDGER_CHARGES.map((k) => (
          <EditableCell
            key={k}
            value={split.charges[k] ? String(split.charges[k]) : null}
            display={split.charges[k] ? fmtMoney(split.charges[k], inv.currency) : undefined}
            onSave={(v) =>
              patchInvoice(inv.id, { charges: { [k]: v } }).then((json) => onChange({ items: json.invoice.items ?? inv.items, total: Number(json.invoice.total) || 0, total_usd: Number(json.invoice.total_usd) || 0 }))
            }
          />
        ))}
        <Td>
          <span className="font-medium text-ink">{fmtMoney(inv.total, inv.currency)}</span>
        </Td>
        <Td>
          <span className="text-text-2">{fmtMoney(inv.total_usd, "USD")}</span>
        </Td>
        {/* ETA / Status are read-only here: Shipment Tracking is the master
            and every ledger shows its live value (lib/tracking-master.ts). */}
        <td className="px-3 py-3.5 whitespace-nowrap" title="Updated in Shipment Tracking">
          {inv.tracking?.eta ? fmtDate(inv.tracking.eta) : <span className="text-muted">—</span>}
        </td>
        <td className="px-3 py-3.5 whitespace-nowrap" title="Updated in Shipment Tracking">
          <StatusPill value={inv.tracking?.release_status || null} />
        </td>
        <td className="px-3 py-3.5">
          <StatusMenuButton
            value={inv.paid_status}
            options={PAID_STATUS_MENU_OPTIONS}
            ariaLabel={`Paid status for ${inv.invoice_number ?? inv.booking_number ?? ""}`}
            onChange={(v) => patchInvoice(inv.id, { paid_status: v }).then(() => onChange({ paid_status: v as Invoice["paid_status"] }))}
          />
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
          {docError?.kind === "fumigation" && <div className="text-xs text-cutoff mt-1 max-w-[180px] whitespace-normal">{docError.message}</div>}
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
          {docError?.kind === "coo" && <div className="text-xs text-cutoff mt-1 max-w-[180px] whitespace-normal">{docError.message}</div>}
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
          {docError?.kind === "sod" && <div className="text-xs text-cutoff mt-1 max-w-[180px] whitespace-normal">{docError.message}</div>}
        </td>
        <td className="px-3 py-3.5">
          <button onClick={onDelete} disabled={deleting} className="text-xs text-cutoff hover:underline whitespace-nowrap disabled:opacity-50">
            {deleting ? "…" : "Delete"}
          </button>
        </td>
      </tr>
    </>
  );
}

function EditableCell({
  value,
  onSave,
  isDate = false,
  display: displayOverride,
}: {
  value: string | null;
  onSave: (v: string) => Promise<any>;
  isDate?: boolean;
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

  const display = displayOverride ?? (value ? (isDate ? fmtDate(value) : value) : "—");

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

// ---------------- "Which date?" before printing Fumigation / COO / Set of Documents ----------------

function fmtLong(iso: string | null) {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function DocDateDialog({
  trackingId,
  title,
  onCancel,
  onPrint,
}: {
  trackingId: string;
  title: string;
  onCancel: () => void;
  onPrint: (date: string) => void;
}) {
  const [info, setInfo] = useState<{ bl_date: string | null; default_date: string | null } | null>(null);
  const [mode, setMode] = useState<"default" | "other">("default");
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tracking/${trackingId}/doc-date`)
      .then((r) => r.json())
      .then((j) => {
        setInfo({ bl_date: j.bl_date ?? null, default_date: j.default_date ?? null });
        if (!j.default_date) setMode("other");
      })
      .catch(() => {
        setInfo({ bl_date: null, default_date: null });
        setMode("other");
      });
  }, [trackingId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function print() {
    const date = mode === "default" ? info?.default_date : other;
    if (!date) {
      setError("Enter the date to print.");
      return;
    }
    onPrint(date);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="docdate-title"
        className="bg-surface border border-line rounded-xl shadow-lg p-6 w-full max-w-md whitespace-normal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="docdate-title" className="text-lg font-semibold text-ink mb-1">Print {title}</h2>
        {info === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            <p className="text-sm text-muted mb-4">
              {info.bl_date ? <>BL date: <b className="text-ink">{fmtLong(info.bl_date)}</b>. Which date should be printed?</> : <>This booking has no BL date yet - enter the date to print.</>}
            </p>
            <div className="flex flex-col gap-3">
              {info.default_date && (
                <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                  <input type="radio" name="docdate" checked={mode === "default"} onChange={() => setMode("default")} />
                  3 days before the BL date - <b>{fmtLong(info.default_date)}</b>
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                <input type="radio" name="docdate" checked={mode === "other"} onChange={() => setMode("other")} />
                Another date
                <input
                  type="date"
                  aria-label="Date to print"
                  className="border border-line bg-surface rounded-lg px-2 py-1 text-sm ml-1"
                  value={other}
                  onFocus={() => setMode("other")}
                  onChange={(e) => {
                    setOther(e.target.value);
                    setMode("other");
                    setError(null);
                  }}
                />
              </label>
            </div>
            {error && <p className="text-xs text-cutoff mt-2">{error}</p>}
          </>
        )}
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onCancel} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-4 py-2">Cancel</button>
          <button onClick={print} disabled={info === null} className="text-sm bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60">
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
