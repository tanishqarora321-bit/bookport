"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
// BL Date, Due Date, Weight, Total, Total (USD), ETA (live), Status (live),
// Paid, Generate Invoice, Invoice → (the full invoice page), Fumigation
// Cert., Certificate of Origin, Set of Documents, Cost section, Delete.
const LEDGER_COLUMN_WIDTHS = [160, 180, 120, 140, 160, 140, 140, 120, 120, 150, 130, 130, 120, 150, 110, 160, 110, 150, 180, 160, 150, 80];
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Pending = no invoice number yet (not imported, not generated) - a toggle
  // in the header like the other ledgers, so it costs the table no space.
  const [pendingOnly, setPendingOnly] = useState(false);
  // Payments Received side panel (same Payment History as the other ledgers,
  // but money received FROM the buyer).
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [paidFilter, setPaidFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function updateLocal(id: string, patch: Partial<Invoice>) {
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
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

  const monthKey = (d: string | null) => (d ? d.slice(0, 7) : null); // "YYYY-MM"
  const monthOptions = useMemo(() => {
    const keys = new Set(yearInvoices.map((i) => monthKey(i.month_of_loading)).filter((k): k is string => !!k));
    return Array.from(keys).sort().reverse();
  }, [yearInvoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return yearInvoices.filter((inv) => {
      if (pendingOnly && inv.invoice_number) return false;
      if (statusFilter !== "all" && (inv.tracking?.release_status ?? "") !== statusFilter) return false;
      if (paidFilter !== "all" && inv.paid_status !== paidFilter) return false;
      if (monthFilter !== "all" && monthKey(inv.month_of_loading) !== monthFilter) return false;
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
  const [pageSize, setPageSize] = useState(25);
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
        <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Month of loading" className="select select-s" style={{ width: 150 }}>
          <option value="all">All Months</option>
          {monthOptions.map((k) => (
            <option key={k} value={k}>
              {new Date(`${k}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status" className="select select-s" style={{ width: 150 }}>
          <option value="all">All Status</option>
          {RELEASE_STATUS_OPTIONS.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
        <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)} aria-label="Paid" className="select select-s" style={{ width: 150 }}>
          <option value="all">All Paid</option>
          <option value="PAID">Paid</option>
          <option value="UNPAID">Unpaid</option>
        </select>
        {(pendingOnly || statusFilter !== "all" || paidFilter !== "all" || monthFilter !== "all" || search) && (
          <button
            onClick={() => {
              setPendingOnly(false);
              setStatusFilter("all");
              setPaidFilter("all");
              setMonthFilter("all");
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
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((inv) => (
              <InvoiceRows
                key={inv.id}
                buyerId={buyerId}
                inv={inv}
                expanded={!!expanded[inv.id]}
                onToggle={() => toggleExpanded(inv.id)}
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
                <td className="px-3 py-2 whitespace-nowrap">{filteredCurrencies.length === 1 ? fmtMoney(filteredTotal, filteredCurrencies[0]) : <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtMoney(filteredTotalUsd, "USD")}</td>
                <td colSpan={LEDGER_COLUMN_WIDTHS.length - 12} />
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

// ---------------- Add Invoice panel: lookup + header fields + cost section ----------------

type DraftItem = { description: string; weight_kg: string; unit_price: string; amount: string };

function blankItem(): DraftItem {
  return { description: "", weight_kg: "", unit_price: "", amount: "" };
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
  buyerId,
  inv,
  expanded,
  onToggle,
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
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Invoice>) => void;
  onDelete: () => void;
  deleting: boolean;
  colSpan: number;
  isAdmin?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
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
      // The ledger's Date column is the invoice date - a generated invoice
      // is dated today when it has none (the PDF prints the same date).
      if (!inv.invoice_date) {
        const today = new Date().toISOString().slice(0, 10);
        await patchInvoice(inv.id, { invoice_date: today });
        onChange({ invoice_date: today });
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
        // Everything (date, weight, bales, seal, location and the Cost
        // section lines) is read server-side from this buyer invoice and
        // the container's packing - nothing to pass from here.
        body: JSON.stringify({ overrides: {} }),
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
      setDocError({ kind, message: err.message });
    } finally {
      setGeneratingDoc(null);
    }
  }

  return (
    <>
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
          {/* The full invoice page (review / edit the fields, version
              history) - moved here from Shipment Tracking's Docs column. */}
          {inv.tracking_id ? (
            <Link
              href={`/tracking/${inv.tracking_id}/documents?back=${encodeURIComponent(`/parties/${buyerId}/invoices`)}`}
              className="text-xs font-medium"
              title="Review and edit the invoice, see its versions"
            >
              Invoice →
            </Link>
          ) : (
            <span className="text-muted">—</span>
          )}
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
        <td className="px-3 py-3.5 whitespace-nowrap">
          {/* Same look as Booking & Instructions' View button. */}
          <button
            onClick={onToggle}
            aria-expanded={expanded}
            className="text-xs border border-accent text-accent px-2 py-1 rounded hover:bg-accent hover:text-white"
          >
            {expanded ? "Hide cost ▲" : "Cost section ▼"}
          </button>
        </td>
        <td className="px-3 py-3.5">
          <button onClick={onDelete} disabled={deleting} className="text-xs text-cutoff hover:underline whitespace-nowrap disabled:opacity-50">
            {deleting ? "…" : "Delete"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line bg-surface-2">
          <td colSpan={colSpan} className="px-6 py-3">
            {/* Pinned to the left edge so it stays in view however far the
                wide ledger is scrolled sideways. */}
            <div className="sticky left-6" style={{ maxWidth: "min(1100px, calc(100vw - 340px))" }}>
            <CostSection invoiceId={inv.id} items={inv.items} currency={inv.currency} onTotalChange={(total) => onChange({ total })} onItemsChange={(items) => onChange({ items })} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

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
