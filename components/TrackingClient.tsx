"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Ship, CheckCircle2, FileText, Files, Anchor, MapPin } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import StatusMenuButton, { StatusOption } from "@/components/ui/StatusMenuButton";
import { useYear } from "@/lib/year-context";
import { dateInWorkingYear } from "@/lib/year-scope";

// One row per container (app/tracking/page.tsx builds it). Shipping Line,
// Forwarder, Trucker, Supplier and Consignee / Buyer come live from the
// booking; BL Number / Status from the booking's BL; Invoice Number from
// the Buyers / Consignee ledger. ETA and Release Status are the MASTER
// values every party ledger shows (read-only there), so they're edited
// only here. Last Checked moves whenever the ETA changes, or by hand.
export type TrackingRow = {
  id: string;
  booking_id: string | null;
  booking_number: string | null;
  container_number: string | null;
  shipping_line: string | null;
  forwarder: string | null;
  trucker: string | null;
  supplier: string | null;
  buyer: string | null;
  bl_number: string | null;
  bl_status: "Y" | "N";
  invoice_no: string | null;
  invoice_sent: boolean;
  documents_sent: boolean;
  eta: string | null;
  release_status: string | null;
  last_tracking_check_at: string | null;
  remarks: string | null;
  booking_status: string | null;
  filing_date: string | null;
};

async function patchTracking(id: string, updates: Record<string, any>) {
  const res = await fetch(`/api/tracking/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Save failed");
  return json.tracking as { last_tracking_check_at: string | null };
}

const RELEASE_STATUS_MENU_OPTIONS: StatusOption[] = [
  { value: "", label: "— set —", badgeClass: "b-neu" },
  { value: "On Water", label: "On Water", badgeClass: "b-info" },
  { value: "Released", label: "Released", badgeClass: "b-ok" },
];
const SENT_MENU_OPTIONS: StatusOption[] = [
  { value: "pending", label: "Pending", badgeClass: "b-warn" },
  { value: "sent", label: "Sent", badgeClass: "b-ok" },
];

// Fixed widths (table-layout:fixed) so the frozen Booking / Container
// columns' offsets never drift. Order = the <thead> order.
const COLUMNS: { label: string; width: number }[] = [
  { label: "Booking Number", width: 160 },
  { label: "Container Number", width: 160 },
  { label: "Shipping Line", width: 140 },
  { label: "Forwarder", width: 190 },
  { label: "Trucker", width: 190 },
  { label: "Supplier", width: 190 },
  { label: "Consignee / Buyer", width: 210 },
  { label: "BL Number", width: 160 },
  { label: "BL Status", width: 95 },
  { label: "Invoice Number", width: 150 },
  { label: "Invoice Sent", width: 130 },
  { label: "Docs Sent", width: 130 },
  { label: "ETA", width: 150 },
  { label: "Release Status", width: 140 },
  { label: "Last Checked", width: 200 },
  { label: "Remarks", width: 240 },
  { label: "Docs", width: 90 },
];
const TABLE_WIDTH = COLUMNS.reduce((s, c) => s + c.width, 0);

function fmtDate(d: string | null) {
  if (!d) return null;
  const x = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  if (isNaN(x.getTime())) return null;
  return x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(d: string | null) {
  if (!d) return null;
  const x = new Date(d);
  if (isNaN(x.getTime())) return null;
  return x.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function monthKey(d: string | null) {
  if (!d) return null;
  const x = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  if (isNaN(x.getTime())) return null;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

export default function TrackingClient({ initialTracking }: { initialTracking: TrackingRow[] }) {
  const [rows, setRows] = useState(initialTracking);
  // Working Year: filed like Booking & Instructions files the booking (ERD,
  // else Cargo Cut Off, else DOC Cut Off), else the ETA; undated rows show
  // under every year (lib/year-scope.ts).
  const { year } = useYear();
  const yearRows = useMemo(() => rows.filter((r) => dateInWorkingYear(r.filing_date, year)), [rows, year]);

  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lineFilter, setLineFilter] = useState("all");
  const [invoicePending, setInvoicePending] = useState(false);
  const [docsPending, setDocsPending] = useState(false);
  const [blPending, setBlPending] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [docsFor, setDocsFor] = useState<TrackingRow | null>(null);

  function updateLocal(id: string, patch: Partial<TrackingRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDocsFor((d) => (d && d.id === id ? { ...d, ...patch } : d));
  }

  const monthOptions = useMemo(
    () => Array.from(new Set(yearRows.map((r) => monthKey(r.filing_date)).filter((k): k is string => Boolean(k)))).sort(),
    [yearRows]
  );
  const lineOptions = useMemo(
    () => Array.from(new Set(yearRows.map((r) => r.shipping_line).filter((l): l is string => Boolean(l)))).sort(),
    [yearRows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return yearRows.filter((r) => {
      if (monthFilter !== "all" && monthKey(r.filing_date) !== monthFilter) return false;
      if (statusFilter === "none" && r.release_status) return false;
      if (statusFilter !== "all" && statusFilter !== "none" && r.release_status !== statusFilter) return false;
      if (lineFilter !== "all" && r.shipping_line !== lineFilter) return false;
      if (invoicePending && r.invoice_sent) return false;
      if (docsPending && r.documents_sent) return false;
      if (blPending && r.bl_status === "Y") return false;
      if (!q) return true;
      return [r.booking_number, r.container_number, r.shipping_line, r.forwarder, r.trucker, r.supplier, r.buyer, r.bl_number, r.invoice_no, r.remarks]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [yearRows, search, monthFilter, statusFilter, lineFilter, invoicePending, docsPending, blPending]);

  useEffect(() => setPage(0), [search, monthFilter, statusFilter, lineFilter, invoicePending, docsPending, blPending, pageSize, year]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageStart = Math.min(page, pageCount - 1) * pageSize;
  const paginated = filtered.slice(pageStart, pageStart + pageSize);

  const onWater = yearRows.filter((r) => r.release_status === "On Water").length;
  const released = yearRows.filter((r) => r.release_status === "Released").length;
  const invoicePendingCount = yearRows.filter((r) => !r.invoice_sent).length;
  const docsPendingCount = yearRows.filter((r) => !r.documents_sent).length;
  const blPendingCount = yearRows.filter((r) => r.bl_status !== "Y").length;

  const anyFilter =
    search || monthFilter !== "all" || statusFilter !== "all" || lineFilter !== "all" || invoicePending || docsPending || blPending;
  function clearFilters() {
    setSearch("");
    setMonthFilter("all");
    setStatusFilter("all");
    setLineFilter("all");
    setInvoicePending(false);
    setDocsPending(false);
    setBlPending(false);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-ink">Shipment Tracking</h1>
          <p className="sub">Every container from loading to release - a row appears as soon as its container number is added to a booking.</p>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <StatCard icon={MapPin} label="Tracked" value={yearRows.length} />
          <StatCard icon={Ship} label="On Water" value={onWater} />
          <StatCard icon={CheckCircle2} label="Released" value={released} tone="success" />
          <StatCard icon={FileText} label="Invoice Pending" value={invoicePendingCount} tone={invoicePendingCount > 0 ? "warning" : "default"} />
          <StatCard icon={Files} label="Docs Pending" value={docsPendingCount} tone={docsPendingCount > 0 ? "warning" : "default"} />
          <StatCard icon={Anchor} label="BL Pending" value={blPendingCount} tone={blPendingCount > 0 ? "warning" : "default"} />
        </div>
      </div>

      <div className="flex-1 min-h-0 mt-4 flex flex-col bg-surface border border-line rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-line shrink-0">
          <label style={{ flex: "1 1 260px", maxWidth: 340, display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", border: "1px solid var(--line2)", borderRadius: 9, background: "var(--surf)" }}>
            <Search className="shrink-0" size={15} style={{ color: "var(--tx2)" }} />
            <span className="sr-only">Search shipments</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search booking, container, party, BL, invoice…"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", font: "inherit", fontSize: 13, color: "var(--tx)" }}
            />
          </label>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Month" className="select select-s" style={{ width: 150 }}>
            <option value="all">All Months</option>
            {monthOptions.map((k) => (
              <option key={k} value={k}>
                {new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Release status" className="select select-s" style={{ width: 150 }}>
            <option value="all">All Status</option>
            <option value="On Water">On Water</option>
            <option value="Released">Released</option>
            <option value="none">Not set</option>
          </select>
          {lineOptions.length > 0 && (
            <select value={lineFilter} onChange={(e) => setLineFilter(e.target.value)} aria-label="Shipping line" className="select select-s" style={{ width: 150 }}>
              <option value="all">All Lines</option>
              {lineOptions.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          )}
          <button type="button" className={`chip ${invoicePending ? "on" : ""}`} aria-pressed={invoicePending} onClick={() => setInvoicePending((v) => !v)}>
            Invoice pending <span className="num" style={{ color: "var(--tx2)" }}>{invoicePendingCount}</span>
          </button>
          <button type="button" className={`chip ${docsPending ? "on" : ""}`} aria-pressed={docsPending} onClick={() => setDocsPending((v) => !v)}>
            Docs pending <span className="num" style={{ color: "var(--tx2)" }}>{docsPendingCount}</span>
          </button>
          <button type="button" className={`chip ${blPending ? "on" : ""}`} aria-pressed={blPending} onClick={() => setBlPending((v) => !v)}>
            BL pending <span className="num" style={{ color: "var(--tx2)" }}>{blPendingCount}</span>
          </button>
          {anyFilter && (
            <button type="button" onClick={clearFilters} className="chip" aria-label="Clear filters" title="Clear filters">
              ✕
            </button>
          )}
          <div style={{ flex: "1 1 0" }} />
          <span className="lbl num" aria-live="polite">
            <b style={{ color: "var(--tx)" }}>{filtered.length}</b> container{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="text-sm border-collapse" style={{ tableLayout: "fixed", width: TABLE_WIDTH, minWidth: "100%" }}>
            <colgroup>
              {COLUMNS.map((c) => (
                <col key={c.label} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="text-left text-muted border-b border-line">
                {COLUMNS.map((c, i) => (
                  <th
                    key={c.label}
                    className={`px-3 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis font-medium sticky top-0 bg-surface-2 ${
                      i === 0 ? "left-0 z-20" : i === 1 ? "left-[160px] z-20 shadow-[1px_0_0_var(--line)]" : "z-10"
                    }`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => (
                <Row key={r.id} row={r} onChange={(patch) => updateLocal(r.id, patch)} onOpenDocs={() => setDocsFor(r)} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-muted">
                    {yearRows.length === 0
                      ? <>No shipments yet - a row appears here as soon as a container number is added to a booking in Booking &amp; Instructions.</>
                      : "No shipments match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
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
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={pageStart === 0} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium disabled:opacity-50">
              Previous
            </button>
            <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={pageStart + pageSize >= filtered.length} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </div>

      {docsFor && <DocsModal row={docsFor} onClose={() => setDocsFor(null)} onSent={(patch) => updateLocal(docsFor.id, patch)} />}
    </div>
  );
}

// ---------------- One row ----------------

const CELL = "px-3 py-3 whitespace-nowrap overflow-hidden text-ellipsis";
const CTRL = "px-3 py-3 whitespace-nowrap";
const STICKY = "sticky z-10 bg-surface group-hover:bg-surface-2 font-semibold text-accent";

function Text({ value, mono = false }: { value: string | null; mono?: boolean }) {
  return <td className={`${CELL} ${mono ? "font-mono text-xs" : ""}`} title={value ?? undefined}>{value || <span className="text-muted">—</span>}</td>;
}

function Row({ row, onChange, onOpenDocs }: { row: TrackingRow; onChange: (patch: Partial<TrackingRow>) => void; onOpenDocs: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  function save(updates: Record<string, any>, local: Partial<TrackingRow>) {
    setError(null);
    return patchTracking(row.id, updates)
      .then((t) => onChange({ ...local, last_tracking_check_at: t?.last_tracking_check_at ?? row.last_tracking_check_at }))
      .catch((err) => {
        setError(err.message);
        throw err;
      });
  }

  const statusTag = row.booking_status === "cancelled" ? "Cancelled" : row.booking_status === "delivered" ? "Closed" : null;

  return (
    <tr className="group border-b border-line hover:bg-surface-2">
      <td className={`${CELL} ${STICKY} left-0`} title={row.booking_number ?? undefined}>
        {row.booking_id ? (
          <Link href={`/bookings/${row.booking_id}`} className="text-accent hover:underline">{row.booking_number || "—"}</Link>
        ) : (
          row.booking_number || "—"
        )}
        {statusTag && (
          <div className="text-[11px] font-medium" style={{ color: statusTag === "Cancelled" ? "var(--crit)" : "var(--tx2)" }}>{statusTag}</div>
        )}
      </td>
      <td className={`${CELL} ${STICKY} left-[160px] shadow-[1px_0_0_var(--line)]`} title={row.container_number ?? undefined}>{row.container_number || "—"}</td>
      <Text value={row.shipping_line} />
      <Text value={row.forwarder} />
      <Text value={row.trucker} />
      <Text value={row.supplier} />
      <Text value={row.buyer} />
      <Text value={row.bl_number} mono />
      <td className={CELL} title={row.bl_status === "Y" ? "BL received" : "No BL yet - upload or enter it in Booking & Instructions"}>
        <span className={`badge ${row.bl_status === "Y" ? "b-ok" : "b-neu"}`}>{row.bl_status}</span>
      </td>
      <td className={`${CELL} font-mono text-xs`} title={row.invoice_no ? undefined : "Generated from the Buyers / Consignee ledger"}>
        {row.invoice_no || <span className="text-muted">—</span>}
      </td>
      <td className={CTRL}>
        <StatusMenuButton
          value={row.invoice_sent ? "sent" : "pending"}
          options={SENT_MENU_OPTIONS}
          ariaLabel={`Invoice Sent for ${row.container_number ?? row.booking_number ?? ""}`}
          onChange={(v) => save({ invoice_sent: v === "sent" }, { invoice_sent: v === "sent" }).catch(() => {})}
        />
      </td>
      <td className={CTRL}>
        <StatusMenuButton
          value={row.documents_sent ? "sent" : "pending"}
          options={SENT_MENU_OPTIONS}
          ariaLabel={`Docs Sent for ${row.container_number ?? row.booking_number ?? ""}`}
          onChange={(v) => save({ documents_sent: v === "sent" }, { documents_sent: v === "sent" }).catch(() => {})}
        />
      </td>
      <InlineEdit
        value={row.eta}
        type="date"
        display={fmtDate(row.eta)}
        onSave={(v) => save({ eta: v || null }, { eta: v || null })}
      />
      <td className={CTRL}>
        <StatusMenuButton
          value={row.release_status ?? ""}
          options={RELEASE_STATUS_MENU_OPTIONS}
          ariaLabel={`Release status for ${row.container_number ?? row.booking_number ?? ""}`}
          onChange={(v) => save({ release_status: v || null }, { release_status: v || null }).catch(() => {})}
        />
      </td>
      <td className={CTRL}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="tabular-nums" style={{ color: row.last_tracking_check_at ? "var(--tx2)" : "var(--mut)" }}>
            {fmtDateTime(row.last_tracking_check_at) ?? "Not checked yet"}
          </span>
          <button
            type="button"
            className="ib"
            style={{ width: 24, height: 24 }}
            disabled={checking}
            title="Mark checked now"
            aria-label={`Mark ${row.container_number ?? row.booking_number ?? "this shipment"} checked now`}
            onClick={() => {
              setChecking(true);
              save({ last_tracking_check_at: new Date().toISOString() }, {})
                .catch(() => {})
                .finally(() => setChecking(false));
            }}
          >
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </button>
        </span>
      </td>
      <InlineEdit value={row.remarks} type="text" display={row.remarks} wide onSave={(v) => save({ remarks: v || null }, { remarks: v || null })} />
      <td className={CTRL}>
        {/* Same look as Booking & Instructions' View button. */}
        <button type="button" onClick={onOpenDocs} className="text-xs border border-accent text-accent px-2 py-1 rounded hover:bg-accent hover:text-white">
          Docs
        </button>
        {error && <div className="text-xs text-cutoff mt-1 whitespace-normal">{error}</div>}
      </td>
    </tr>
  );
}

function InlineEdit({
  value,
  display,
  type,
  wide = false,
  onSave,
}: {
  value: string | null;
  display: string | null;
  type: "date" | "text";
  wide?: boolean;
  onSave: (v: string) => Promise<any>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  function start() {
    setVal(type === "date" ? (value ?? "").slice(0, 10) : value ?? "");
    setEditing(true);
  }
  async function commit() {
    setSaving(true);
    try {
      await onSave(val.trim());
      setEditing(false);
    } catch {
      // the row shows the error
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <td className="px-2 py-2">
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            autoFocus
            type={type}
            className="input input-s"
            style={{ width: wide ? 160 : 128, minWidth: 0 }}
            value={val}
            disabled={saving}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button type="button" onClick={commit} disabled={saving} className="btn btn-xs" aria-label="Save">
            {saving ? "…" : "✓"}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={saving} className="btn btn-xs btn-g" aria-label="Cancel">
            ✕
          </button>
        </div>
      </td>
    );
  }
  return (
    <td className={CELL} title={display ?? "Click to edit"}>
      <button
        type="button"
        onClick={start}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "text", textAlign: "left", maxWidth: "100%", verticalAlign: "middle" }}
      >
        {display ? <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{display}</span> : <span className="text-muted">—</span>}
        <svg className="shrink-0 opacity-0 group-hover:opacity-100" style={{ color: "var(--mut)" }} aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
    </td>
  );
}

// ---------------- Docs dialog ----------------

type Doc = { id: string; doc_type: string; version: number; created_at: string };
const DOC_TYPES: { type: string; label: string }[] = [
  { type: "final_invoice", label: "Invoice" },
  { type: "fumigation_certificate", label: "Fumigation Certificate" },
  { type: "certificate_of_origin", label: "Certificate of Origin" },
  { type: "set_of_documents", label: "Set of Documents" },
];

function DocsModal({ row, onClose, onSent }: { row: TrackingRow; onClose: () => void; onSent: (patch: Partial<TrackingRow>) => void }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [compose, setCompose] = useState<"invoice" | "documents" | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/tracking/${row.id}/documents`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Couldn't load the documents");
        if (alive) setDocs(json.documents ?? []);
      })
      .catch((err) => alive && setLoadError(err.message));
    return () => {
      alive = false;
    };
  }, [row.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function openDoc(doc: Doc) {
    setOpening(doc.id);
    // Open the tab synchronously so the browser doesn't block it as a popup.
    const tab = window.open("", "_blank");
    try {
      const res = await fetch(`/api/documents/${doc.id}/signed-url`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error || "Couldn't open the PDF");
      if (tab) tab.location.href = json.url;
      else window.location.href = json.url;
    } catch (err: any) {
      tab?.close();
      setLoadError(err.message);
    } finally {
      setOpening(null);
    }
  }

  const latest = (type: string) => (docs ?? []).filter((d) => d.doc_type === type).sort((a, b) => b.version - a.version)[0] ?? null;
  const hasInvoice = Boolean(latest("final_invoice"));
  const hasAnyDoc = DOC_TYPES.slice(1).some((d) => latest(d.type));
  const ref = [row.booking_number, row.container_number].filter(Boolean).join(" / ");

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="docs-title" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="mh">
          <div>
            <h2 id="docs-title" className="h2">{compose ? (compose === "invoice" ? "Send Invoice" : "Send Documents") : "Documents"}</h2>
            <div className="meta" style={{ marginTop: 3 }}>
              {ref}
              {row.buyer ? ` · ${row.buyer}` : ""}
            </div>
          </div>
          <button type="button" className="ib" aria-label="Close" onClick={onClose}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {compose ? (
          <ComposeView
            trackingId={row.id}
            kind={compose}
            onBack={() => setCompose(null)}
            onSent={() => onSent(compose === "invoice" ? { invoice_sent: true } : { documents_sent: true })}
          />
        ) : (
          <>
            <div className="mb">
              {loadError && <div className="err">{loadError}</div>}
              {!docs && !loadError && <div className="meta" style={{ padding: "16px 0", textAlign: "center" }}>Loading documents…</div>}
              {docs && (
                <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                  {DOC_TYPES.map((d, i) => {
                    const doc = latest(d.type);
                    return (
                      <div
                        key={d.type}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderTop: i === 0 ? 0 : "1px solid var(--line)" }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {d.label}
                            {d.type === "final_invoice" && row.invoice_no ? <span className="meta" style={{ fontWeight: 400 }}> · {row.invoice_no}</span> : null}
                          </div>
                          <div className="meta" style={{ marginTop: 2 }}>
                            {doc ? `Generated ${fmtDateTime(doc.created_at)} · v${doc.version}` : "Not generated yet - generate it in the Buyers / Consignee ledger"}
                          </div>
                        </div>
                        {doc ? (
                          <button type="button" className="btn btn-s" onClick={() => openDoc(doc)} disabled={opening === doc.id}>
                            {opening === doc.id ? "Opening…" : "View PDF"}
                          </button>
                        ) : (
                          <span className="badge b-neu">Not generated</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                <SendCard
                  title="Invoice"
                  hint="Emails the invoice PDF to the buyer / consignee."
                  sent={row.invoice_sent}
                  disabled={!hasInvoice}
                  disabledHint="Generate the invoice first"
                  label={row.invoice_sent ? "Resend Invoice" : "Send Invoice"}
                  onClick={() => setCompose("invoice")}
                />
                <SendCard
                  title="Documents"
                  hint="Emails the Fumigation Certificate, Certificate of Origin and Set of Documents PDFs."
                  sent={row.documents_sent}
                  disabled={!hasAnyDoc}
                  disabledHint="Generate the documents first"
                  label={row.documents_sent ? "Resend Documents" : "Send Documents"}
                  onClick={() => setCompose("documents")}
                />
              </div>
            </div>
            <div className="mf">
              <button type="button" className="btn" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SendCard({
  title,
  hint,
  sent,
  disabled,
  disabledHint,
  label,
  onClick,
}: {
  title: string;
  hint: string;
  sent: boolean;
  disabled: boolean;
  disabledHint: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <b style={{ fontSize: 14 }}>{title}</b>
        <span className={`badge ${sent ? "b-ok" : "b-warn"}`}>{sent ? "Sent" : "Pending"}</span>
      </div>
      <div className="meta">{disabled ? disabledHint : hint}</div>
      <button type="button" className="btn btn-s btn-p" disabled={disabled} onClick={onClick} style={{ alignSelf: "flex-start" }}>
        {label}
      </button>
    </div>
  );
}

function ComposeView({
  trackingId,
  kind,
  onBack,
  onSent,
}: {
  trackingId: string;
  kind: "invoice" | "documents";
  onBack: () => void;
  onSent: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [attachments, setAttachments] = useState<{ id: string; label: string; filename: string }[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/tracking/${trackingId}/send-docs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, preview: true }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Couldn't build the email");
        if (!alive) return;
        setSubject(json.subject);
        setHtml(json.html);
        setAttachments(json.attachments ?? []);
        setMissing(json.missing ?? []);
        setTo(json.suggested_to || "");
        setCc(json.suggested_cc || "");
        if (json.buyer_missing_email) setError("This buyer has no email on file yet - add one under Buyers / Consignee > Edit, or type a recipient below for this send.");
      } catch (err: any) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [trackingId, kind]);

  async function send() {
    const toList = to.split(",").map((s) => s.trim()).filter(Boolean);
    if (toList.length === 0) return setError('At least one "To" recipient is required.');
    const ccList = cc.split(",").map((s) => s.trim()).filter(Boolean);
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracking/${trackingId}/send-docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, to: toList, cc: ccList }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to send");
      setSent(true);
      onSent();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="mb">
        {loading && <div className="meta" style={{ padding: "16px 0", textAlign: "center" }}>Building the email…</div>}
        {sent ? (
          <div className="banner" style={{ background: "var(--okS)", border: "1px solid var(--ok)", color: "var(--ok)" }}>
            {kind === "invoice" ? "Invoice sent - Invoice Sent is now marked Sent." : "Documents sent - Docs Sent is now marked Sent."}
          </div>
        ) : (
          !loading &&
          html && (
            <>
              <div className="field">
                <label htmlFor="docs-to">To</label>
                <input id="docs-to" className="input" placeholder="Comma-separated" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="docs-cc">Cc</label>
                <input id="docs-cc" className="input" placeholder="Comma-separated, optional" value={cc} onChange={(e) => setCc(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="docs-subject">Subject</label>
                <input id="docs-subject" className="input" value={subject} readOnly style={{ background: "var(--surf2)" }} />
              </div>
              <div>
                <div className="meta" style={{ fontWeight: 600, marginBottom: 6 }}>Attachments</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {attachments.map((a) => (
                    <span key={a.id} className="badge b-info" title={a.filename}>📎 {a.filename}</span>
                  ))}
                </div>
                {missing.length > 0 && (
                  <div className="meta" style={{ color: "var(--warn)", marginTop: 6 }}>
                    Not generated yet, so not attached: {missing.join(", ")}
                  </div>
                )}
              </div>
              <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, background: "var(--surf2)", overflowWrap: "anywhere" }}>
                <div dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </>
          )
        )}
        {error && <div className="err">{error}</div>}
      </div>
      <div className="mf">
        <button type="button" className="btn" onClick={onBack} disabled={sending}>
          {sent ? "Back to documents" : "Back"}
        </button>
        {!sent && html && (
          <button type="button" className="btn btn-p" onClick={send} disabled={sending || loading}>
            {sending ? "Sending…" : "Send Email"}
          </button>
        )}
      </div>
    </>
  );
}
