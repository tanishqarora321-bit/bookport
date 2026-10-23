"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, CheckCircle2, Ship, AlertTriangle, PackageCheck, Search, Mail } from "lucide-react";
import EditableCell, { CloseIcon } from "@/components/EditableCell";
import PartyPickerCell from "@/components/PartyPickerCell";
import ContainerCell from "@/components/ContainerCell";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import StatusCell from "@/components/StatusCell";
import PackingItemsCell, { PackingItem } from "@/components/PackingItemsCell";
import SendInstructionsCell from "@/components/SendInstructionsCell";
import UploadBlCell from "@/components/UploadBlCell";
import { useYear } from "@/lib/year-context";

type PartyRef = { id: string; name: string } | null;
type PartyOption = { id: string; legal_name: string };

type Row = {
  booking_id: string;
  container_id: string | null;
  carrier_booking_no: string | null;
  erd: string | null;
  si_cutoff: string | null;
  cargo_cutoff: string | null;
  pol: string | null;
  pod: string | null;
  final_destination: string | null;
  bl_issued_at: string | null;
  bl_number: string | null;
  carrier: string | null;
  vessel: string | null;
  container_size: string | null;
  status: string;
  instruction_status: string | null;
  container_no: string | null;
  forwarder: PartyRef;
  trucker: PartyRef;
  supplier: PartyRef;
  buyer: PartyRef;
  packing_items: PackingItem[];
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthOfLoading(erd: string | null): string {
  if (!erd) return "—";
  const d = new Date(erd);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function formatPlain(value: string | null, isDate = false): string {
  if (!value) return "—";
  if (!isDate) return value;
  const d = new Date(value);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function rowKey(r: Row) {
  return `${r.booking_id}__${r.container_id ?? "none"}`;
}

function toCsv(rows: Row[]) {
  const headers = [
    "Booking Number", "Month of Loading", "ERD", "DOC Cut Off", "Cargo Cut Off",
    "Port of Loading", "Port of Discharge", "Port of Delivery", "B/L Issued At",
    "Shipping Line", "Forwarder Name", "Trucker Name", "Supplier Name", "Buyer (Consignee)",
    "Container Number", "Container Size", "Seal No", "Weight", "Bales", "Status", "Instruction Status",
  ];
  const lines = rows.map((r) => {
    const firstPacking = r.packing_items[0];
    return [
      r.carrier_booking_no ?? "", monthOfLoading(r.erd), formatPlain(r.erd, true), formatPlain(r.si_cutoff, true), formatPlain(r.cargo_cutoff, true),
      r.pol ?? "", r.pod ?? "", r.final_destination ?? "", formatPlain(r.bl_issued_at),
      r.carrier ?? "", r.forwarder?.name ?? "", r.trucker?.name ?? "", r.supplier?.name ?? "", r.buyer?.name ?? "",
      r.container_no ?? "", r.container_size ?? "",
      firstPacking?.seal_no ?? "", firstPacking ? `${firstPacking.weight ?? ""} ${firstPacking.weight_unit}` : "", firstPacking?.bales ?? "",
      r.status, r.instruction_status ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  return [headers.join(","), ...lines].join("\n");
}

export default function BookingsClient({
  rows: initialRows,
  forwarders,
  truckers,
  suppliers,
  buyers,
  variant = "single",
  duplicateGroupCount = 0,
}: {
  rows: Row[];
  forwarders: PartyOption[];
  truckers: PartyOption[];
  suppliers: PartyOption[];
  buyers: PartyOption[];
  // "single": the normal Booking & Instructions page - every row here has
  // a carrier_booking_no that's unique for this company right now (or no
  // number yet). "multiple": the Multiple Bookings & Instructions page -
  // every row here shares its carrier_booking_no with at least one other
  // booking. Which page a booking shows on is computed live off current
  // data (lib/bookings-data.ts), not a stored flag - delete down to one
  // entry for a number and it's back on this page next load, automatically.
  variant?: "single" | "multiple";
  // "single" only: how many distinct booking numbers currently have 2+
  // entries, for the banner linking over to the Multiple page.
  duplicateGroupCount?: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [forwarderOptions, setForwarderOptions] = useState(forwarders);
  const [truckerOptions, setTruckerOptions] = useState(truckers);
  const [supplierOptions, setSupplierOptions] = useState(suppliers);
  const [buyerOptions, setBuyerOptions] = useState(buyers);

  // router.refresh() re-runs this page's server-side data fetch and hands
  // this component fresh props without a browser navigation - this is
  // what actually applies it, since useState(initialRows) only reads that
  // prop once on mount and otherwise ignores later prop changes.
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  // The sidebar's Year selector is the one working-year filter for this
  // grid - always on, no separate opt-in toggle, since having both was
  // redundant with the sidebar already being "the" year control. A
  // booking's year always comes from its own Month of Loading (ERD),
  // never a separately entered field; a booking with no ERD yet can't
  // belong to any year, so it won't show until it has one. The Month
  // filter below narrows further within whichever year is selected.
  const { year } = useYear();
  const [monthFilter, setMonthFilter] = useState("all");

  // The duplicate-numbers banner is a one-time heads-up, not a permanent
  // fixture - once dismissed for the current count, it stays hidden until
  // a NEW duplicate shows up (duplicateGroupCount goes higher than
  // whatever was dismissed), so a genuinely new conflict still surfaces.
  const DUPLICATE_BANNER_KEY = "bookport:dismissed-duplicate-banner-count";
  const [dismissedDuplicateCount, setDismissedDuplicateCount] = useState<number | null>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DUPLICATE_BANNER_KEY);
      setDismissedDuplicateCount(stored ? parseInt(stored, 10) : 0);
    } catch {
      setDismissedDuplicateCount(0);
    }
  }, []);
  function dismissDuplicateBanner() {
    setDismissedDuplicateCount(duplicateGroupCount);
    try {
      localStorage.setItem(DUPLICATE_BANNER_KEY, String(duplicateGroupCount));
    } catch {
      /* private window / blocked storage - banner just won't stay dismissed, not worth failing over */
    }
  }

  const [line, setLine] = useState("all");
  const [destination, setDestination] = useState("all");
  const [status, setStatus] = useState("all");
  const [forwarderFilter, setForwarderFilter] = useState("all");
  const [truckerFilter, setTruckerFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [buyerFilter, setBuyerFilter] = useState("all");
  const [cutoffSoonOnly, setCutoffSoonOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  const lines = useMemo(() => Array.from(new Set(rows.map((r) => r.carrier).filter(Boolean))) as string[], [rows]);
  // "All Destinations" means Port of Delivery (final_destination), not Port
  // of Discharge (pod) - most rows share the same pod (e.g. Mundra) but
  // fan out to many different final destinations, so filtering by pod
  // made almost every option collapse down to one visible choice.
  const destinations = useMemo(
    () => Array.from(new Set(rows.map((r) => r.final_destination).filter(Boolean))) as string[],
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (line !== "all" && r.carrier !== line) return false;
      if (destination !== "all" && r.final_destination !== destination) return false;
      if (status !== "all" && r.status !== status) return false;
      if (forwarderFilter !== "all" && r.forwarder?.name !== forwarderFilter) return false;
      if (truckerFilter !== "all" && r.trucker?.name !== truckerFilter) return false;
      if (supplierFilter !== "all" && r.supplier?.name !== supplierFilter) return false;
      if (buyerFilter !== "all" && r.buyer?.name !== buyerFilter) return false;
      // The working year (sidebar) always filters this grid - a booking
      // with no Month of Loading/ERD yet can't belong to any year, so it
      // drops out until it has one. The Month filter then narrows further
      // within that year.
      if (!r.erd) return false;
      const erdDate = new Date(r.erd);
      if (erdDate.getFullYear() !== year) return false;
      if (monthFilter !== "all" && erdDate.getMonth() !== Number(monthFilter)) return false;
      if (cutoffSoonOnly) {
        if (!r.cargo_cutoff) return false;
        const diff = new Date(r.cargo_cutoff).getTime() - Date.now();
        if (diff > 3 * 24 * 3600 * 1000 || diff < 0) return false;
      }
      if (overdueOnly) {
        if (!r.cargo_cutoff) return false;
        if (new Date(r.cargo_cutoff).getTime() - Date.now() >= 0) return false;
      }
      if (q) {
        const haystack = [r.carrier_booking_no, r.pol, r.pod, r.final_destination, r.forwarder?.name, r.buyer?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, line, destination, status, forwarderFilter, truckerFilter, supplierFilter, buyerFilter, year, monthFilter, cutoffSoonOnly, overdueOnly, search]);

  // Any filter change jumps back to page 1 - staying on, say, page 4 after
  // narrowing the result set down to one page would just show an empty grid.
  useEffect(() => {
    setPage(0);
  }, [line, destination, status, forwarderFilter, truckerFilter, supplierFilter, buyerFilter, year, monthFilter, cutoffSoonOnly, overdueOnly, search, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageStart = page * pageSize;
  const paginated = useMemo(() => filtered.slice(pageStart, pageStart + pageSize), [filtered, pageStart, pageSize]);

  const totalBookings = useMemo(() => new Set(rows.map((r) => r.booking_id)).size, [rows]);
  const cutoffSoonCount = rows.filter((r) => {
    if (!r.cargo_cutoff) return false;
    const diff = new Date(r.cargo_cutoff).getTime() - Date.now();
    return diff > 0 && diff < 48 * 3600 * 1000;
  }).length;
  const confirmedCount = new Set(rows.filter((r) => r.status === "confirmed").map((r) => r.booking_id)).size;
  const inTransitCount = new Set(rows.filter((r) => r.status === "in_transit").map((r) => r.booking_id)).size;
  const deliveredCount = new Set(rows.filter((r) => r.status === "delivered").map((r) => r.booking_id)).size;
  const instructionsSentCount = new Set(rows.filter((r) => r.instruction_status === "sent").map((r) => r.booking_id)).size;

  function updateRowsForBooking(bookingId: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.booking_id === bookingId ? { ...r, ...patch } : r)));
  }

  function updateSingleRow(bookingId: string, containerId: string | null, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.booking_id === bookingId && r.container_id === containerId ? { ...r, ...patch } : r))
    );
  }

  async function addContainer(row: Row) {
    const res = await fetch(`/api/bookings/${row.booking_id}/containers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ container_no: null }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || "Failed to add container");
      return;
    }
    setRows((prev) => {
      const idx = prev.findIndex((r) => rowKey(r) === rowKey(row));
      const newRow: Row = { ...row, container_id: json.container.id, container_no: null };
      const next = [...prev];
      next.splice(idx + 1, 0, newRow);
      return next;
    });
  }

  // Irreversible and cascades across containers/tracking/documents/
  // amendments - matches the confirm() convention already used for
  // other permanent deletes in this app (e.g. OfferSheetGridClient's
  // "Delete this row?"), not TeamClient's silent Remove/Restore toggle,
  // since there's no "Restore" for a deleted booking.
  async function deleteBooking(bookingId: string, bookingNo: string | null) {
    if (!confirm(`Delete booking ${bookingNo ?? "(no number)"}? This permanently removes it and everything on it (containers, documents, tracking, amendments). This cannot be undone.`)) {
      return;
    }
    const res = await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "Failed to delete booking");
      return;
    }
    setRows((prev) => prev.filter((r) => r.booking_id !== bookingId));
  }

  function clearFilters() {
    setLine("all");
    setDestination("all");
    setStatus("all");
    setForwarderFilter("all");
    setTruckerFilter("all");
    setSupplierFilter("all");
    setBuyerFilter("all");
    setCutoffSoonOnly(false);
    setOverdueOnly(false);
    setSearch("");
  }

  const activeChips: { label: string; clear: () => void }[] = [
    line !== "all" ? { label: `Line: ${line}`, clear: () => setLine("all") } : null,
    destination !== "all" ? { label: `Destination: ${destination}`, clear: () => setDestination("all") } : null,
    status !== "all" ? { label: `Status: ${status}`, clear: () => setStatus("all") } : null,
    forwarderFilter !== "all" ? { label: `Forwarder: ${forwarderFilter}`, clear: () => setForwarderFilter("all") } : null,
    truckerFilter !== "all" ? { label: `Trucker: ${truckerFilter}`, clear: () => setTruckerFilter("all") } : null,
    supplierFilter !== "all" ? { label: `Supplier: ${supplierFilter}`, clear: () => setSupplierFilter("all") } : null,
    buyerFilter !== "all" ? { label: `Buyer: ${buyerFilter}`, clear: () => setBuyerFilter("all") } : null,
  ].filter((c): c is { label: string; clear: () => void } => c !== null);

  function exportCsv() {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ship-sphere-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full" style={{ gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="h1">
            {variant === "multiple" ? "Multiple Bookings & Instructions" : "Booking & Instructions"}
          </h1>
          <p className="sub">
            {variant === "multiple"
              ? "Booking numbers with more than one entry — delete the ones that don't belong here, or edit them directly. Once only one entry is left for a number, it moves back to Booking & Instructions on its own."
              : "Source of truth — click the pencil icon on any cell to edit"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={exportCsv} className="btn">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            Export CSV
          </button>
          <Link href={variant === "multiple" ? "/bookings/new?forMultiple=1" : "/bookings/new"} className="btn btn-p">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Booking
          </Link>
        </div>
      </div>

      {variant === "single" && duplicateGroupCount > 0 && dismissedDuplicateCount !== null && duplicateGroupCount > dismissedDuplicateCount && (
        <div className="banner bn-warn" role="status">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l10 18H2zM12 10v4M12 17v.5" />
          </svg>
          <span style={{ flex: "1 1 320px", minWidth: 0 }}>
            <b style={{ fontWeight: 600 }}>
              {duplicateGroupCount} booking number{duplicateGroupCount === 1 ? "" : "s"} {duplicateGroupCount === 1 ? "has" : "have"} more than one entry
            </b>{" "}
            — <Link href="/bookings/multiple" style={{ fontWeight: 600 }}>review in Multiple Bookings & Instructions →</Link>
          </span>
          <button onClick={dismissDuplicateBanner} aria-label="Dismiss banner" className="ib">
            <CloseIcon />
          </button>
        </div>
      )}

      {variant === "single" && (
        <section aria-label="Booking totals" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 9 }}>
          <StatCard icon={ClipboardList} label="Total Bookings" value={totalBookings} />
          <StatCard icon={CheckCircle2} label="Confirmed" value={confirmedCount} />
          <StatCard icon={Ship} label="In Transit" value={inTransitCount} />
          <StatCard icon={AlertTriangle} label="Cut-off within 48h" value={cutoffSoonCount} tone="danger" />
          <StatCard icon={PackageCheck} label="Delivered" value={deliveredCount} tone="success" />
          <StatCard icon={Mail} label="Instructions Sent" value={instructionsSentCount} tone="success" />
        </section>
      )}

      {/* This is the ONLY element that scrolls - header/cards/filters stay put */}
      <section className="card" aria-label="Bookings table" style={{ overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <label style={{ flex: "1 1 300px", maxWidth: 380, display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", border: "1px solid var(--line2)", borderRadius: 9, background: "var(--surf)" }}>
              <Search className="shrink-0" size={15} style={{ color: "var(--tx2)" }} />
              <span className="sr">Search bookings</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search booking #, POL, POD…"
                style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", font: "inherit", fontSize: 13, color: "var(--tx)" }}
              />
            </label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="select select-s" style={{ width: "auto" }}>
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_transit">In Transit</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button onClick={() => setCutoffSoonOnly(!cutoffSoonOnly)} aria-pressed={cutoffSoonOnly} className={cutoffSoonOnly ? "chip on" : "chip"}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
              </svg>
              Cut off within 3 days
            </button>
            <button onClick={() => setOverdueOnly(!overdueOnly)} aria-pressed={overdueOnly} className={overdueOnly ? "chip on-crit" : "chip"}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l10 18H2zM12 10v4" />
              </svg>
              Cut-off overdue
            </button>
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Month of loading" className="select select-s" style={{ width: "auto" }}>
              <option value="all">All Months ({year})</option>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i}>{m} {year}</option>
              ))}
            </select>
            <div style={{ flex: "1 1 0" }} />
            <span className="lbl num" aria-live="polite">
              <b style={{ color: "var(--tx)" }}>{filtered.length}</b> bookings
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <select value={line} onChange={(e) => setLine(e.target.value)} aria-label="Shipping line" className="select select-s select-filter">
              <option value="all">All Lines</option>
              {lines.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <select value={destination} onChange={(e) => setDestination(e.target.value)} aria-label="Port of delivery" className="select select-s select-filter">
              <option value="all">All Destinations</option>
              {destinations.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select value={forwarderFilter} onChange={(e) => setForwarderFilter(e.target.value)} aria-label="Forwarder" className="select select-s select-filter">
              <option value="all">All Forwarders</option>
              {forwarderOptions.map((f) => (
                <option key={f.id} value={f.legal_name}>{f.legal_name}</option>
              ))}
            </select>
            <select value={truckerFilter} onChange={(e) => setTruckerFilter(e.target.value)} aria-label="Trucker" className="select select-s select-filter">
              <option value="all">All Truckers</option>
              {truckerOptions.map((t) => (
                <option key={t.id} value={t.legal_name}>{t.legal_name}</option>
              ))}
            </select>
            <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} aria-label="Supplier" className="select select-s select-filter">
              <option value="all">All Suppliers</option>
              {supplierOptions.map((s) => (
                <option key={s.id} value={s.legal_name}>{s.legal_name}</option>
              ))}
            </select>
            <select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} aria-label="Buyer" className="select select-s select-filter">
              <option value="all">All Buyers</option>
              {buyerOptions.map((b) => (
                <option key={b.id} value={b.legal_name}>{b.legal_name}</option>
              ))}
            </select>
            {activeChips.length > 0 && (
              <button onClick={clearFilters} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--accent)", fontSize: 13, marginLeft: 4 }}>
                Clear filters
              </button>
            )}
          </div>
          {activeChips.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span className="meta">Active:</span>
              {activeChips.map((c) => (
                <button key={c.label} onClick={c.clear} className="chip on" style={{ height: 28 }}>
                  {c.label}
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                  <span className="sr">Remove filter</span>
                </button>
              ))}
            </div>
          )}
        </div>

      <div className="tw" style={{ flex: 1, minHeight: 0 }}>
        <table className="tbl">
          <thead>
            <tr>
              {[
                "Sr. No.", "Booking Number", "Month of Loading", "ERD", "DOC Cut Off", "Cargo Cut Off",
                "Port of Loading", "Port of Discharge", "Port of Delivery", "B/L Issued At", "Upload BL",
                "Shipping Line", "Forwarder Name", "Trucker Name", "Supplier Name", "Buyer (Consignee)",
                "Container Number", "Container Size", "Packing Details", "Status", "Send Instructions", "Instruction Status", "Open",
              ].map((label, i) => (
                <th key={i} className={i === 0 ? "stk" : i === 1 ? "stk2" : undefined} style={i === 0 ? { zIndex: 3, width: 56, minWidth: 56 } : i === 1 ? { zIndex: 3 } : undefined}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((r, idx) => {
              const cutoffSoon = r.cargo_cutoff && new Date(r.cargo_cutoff).getTime() - Date.now() < 48 * 3600 * 1000;
              return (
                <tr key={rowKey(r)}>
                  <td className="stk num meta" style={{ width: 56, minWidth: 56 }}>{pageStart + idx + 1}</td>
                  <EditableCell bookingId={r.booking_id} column="carrier_booking_no" value={r.carrier_booking_no} sticky bold />
                  <td className={monthOfLoading(r.erd) === "—" ? "dash" : ""}>{monthOfLoading(r.erd)}</td>
                  <EditableCell bookingId={r.booking_id} column="erd" value={r.erd} isDate />
                  <EditableCell bookingId={r.booking_id} column="si_cutoff" value={r.si_cutoff} isDate />
                  <EditableCell bookingId={r.booking_id} column="cargo_cutoff" value={r.cargo_cutoff} isDate highlight={!!cutoffSoon} />
                  <EditableCell bookingId={r.booking_id} column="pol" value={r.pol} />
                  <EditableCell bookingId={r.booking_id} column="pod" value={r.pod} />
                  <EditableCell bookingId={r.booking_id} column="final_destination" value={r.final_destination} />
                  <EditableCell bookingId={r.booking_id} column="bl_issued_at" value={r.bl_issued_at} />
                  <UploadBlCell
                    bookingId={r.booking_id}
                    blNumber={r.bl_number}
                    // A BL can update fields across every container on this
                    // booking at once (not just this row's own), so patching
                    // local state by hand for every affected row/container
                    // risked missing one - router.refresh() re-fetches this
                    // page's data server-side and hands it back down via
                    // the initialRows-sync effect above, which is correct
                    // for all of them at once without a full browser
                    // navigation (a plain reload briefly showed a blank
                    // white page while the whole document reloaded).
                    onApplied={() => router.refresh()}
                  />
                  <EditableCell bookingId={r.booking_id} column="carrier" value={r.carrier} />
                  <PartyPickerCell
                    bookingId={r.booking_id}
                    role="forwarder"
                    roleLabel="Forwarder"
                    createEndpoint="/api/forwarders"
                    responseKey="forwarder"
                    current={r.forwarder}
                    options={forwarderOptions}
                    onAssigned={(p) => updateRowsForBooking(r.booking_id, { forwarder: p })}
                    onCreated={(p) => setForwarderOptions((prev) => [...prev, p].sort((a, b) => a.legal_name.localeCompare(b.legal_name)))}
                  />
                  <PartyPickerCell
                    bookingId={r.booking_id}
                    role="trucker"
                    roleLabel="Trucker"
                    createEndpoint="/api/truckers"
                    responseKey="trucker"
                    current={r.trucker}
                    options={truckerOptions}
                    onAssigned={(p) => updateRowsForBooking(r.booking_id, { trucker: p })}
                    onCreated={(p) => setTruckerOptions((prev) => [...prev, p].sort((a, b) => a.legal_name.localeCompare(b.legal_name)))}
                  />
                  <PartyPickerCell
                    bookingId={r.booking_id}
                    role="supplier"
                    roleLabel="Supplier"
                    createEndpoint="/api/suppliers"
                    responseKey="supplier"
                    current={r.supplier}
                    options={supplierOptions}
                    onAssigned={(p) => updateRowsForBooking(r.booking_id, { supplier: p })}
                    onCreated={(p) => setSupplierOptions((prev) => [...prev, p].sort((a, b) => a.legal_name.localeCompare(b.legal_name)))}
                  />
                  <PartyPickerCell
                    bookingId={r.booking_id}
                    role="buyer"
                    roleLabel="Buyer"
                    createEndpoint="/api/parties"
                    responseKey="party"
                    current={r.buyer}
                    options={buyerOptions}
                    onAssigned={(p) => updateRowsForBooking(r.booking_id, { buyer: p })}
                    onCreated={(p) => setBuyerOptions((prev) => [...prev, p].sort((a, b) => a.legal_name.localeCompare(b.legal_name)))}
                  />
                  <ContainerCell
                    bookingId={r.booking_id}
                    containerId={r.container_id}
                    value={r.container_no}
                    onSaved={(containerId, containerNo) => updateSingleRow(r.booking_id, r.container_id, { container_id: containerId, container_no: containerNo })}
                    onAddContainer={() => addContainer(r)}
                  />
                  <EditableCell bookingId={r.booking_id} column="container_size" value={r.container_size} />
                  <PackingItemsCell
                    containerId={r.container_id}
                    items={r.packing_items}
                    onItemsChange={(items) => updateSingleRow(r.booking_id, r.container_id, { packing_items: items })}
                  />
                  <StatusCell
                    bookingId={r.booking_id}
                    value={r.status}
                    onChanged={(v) => updateRowsForBooking(r.booking_id, { status: v })}
                  />
                  <SendInstructionsCell
                    bookingId={r.booking_id}
                    containerId={r.container_id}
                    instructionStatus={r.instruction_status}
                    onSent={() => updateRowsForBooking(r.booking_id, { instruction_status: "sent" })}
                  />
                  <InstructionStatusCell
                    bookingId={r.booking_id}
                    value={r.instruction_status}
                    onChanged={(v) => updateRowsForBooking(r.booking_id, { instruction_status: v })}
                  />
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Link href={`/bookings/${r.booking_id}`} style={{ fontWeight: 600 }}>
                        View →
                      </Link>
                      <button
                        onClick={() => deleteBooking(r.booking_id, r.carrier_booking_no)}
                        aria-label={`Delete booking ${r.carrier_booking_no ?? ""}`}
                        className="ib"
                        style={{ color: "var(--crit)" }}
                      >
                        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                        </svg>
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={24} className="p-0">
                  {rows.length === 0 && variant === "multiple" ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <CheckCircle2 className="w-8 h-8 text-success" size={32} />
                      <div className="text-sm font-medium text-ink">No duplicate booking numbers</div>
                      <div className="text-xs text-muted max-w-sm">Every booking number has a single entry.</div>
                      <Link href="/bookings" className="btn btn-s" style={{ marginTop: 4 }}>
                        Back to Booking & Instructions
                      </Link>
                    </div>
                  ) : (
                    <EmptyState
                      icon={ClipboardList}
                      title={rows.length === 0 ? "No bookings yet" : "No bookings match these filters"}
                      hint={rows.length === 0 ? "Upload a PDF or add one manually." : undefined}
                    />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
          <span className="lbl num">
            {filtered.length === 0 ? "Showing 0 of 0" : `Showing ${pageStart + 1}-${Math.min(pageStart + pageSize, filtered.length)} of ${filtered.length}`}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="lbl">Rows per page</span>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="select select-s" style={{ width: "auto" }}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn btn-s">
              Previous
            </button>
            <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} className="btn btn-s">
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// Separate from the shipment's own `status` (draft/confirmed/in_transit/
// delivered/cancelled) - this just tracks whether shipping instructions
// have gone out to the carrier yet. Blank (unset) has no color, matching
// how every other optional field in this grid reads "—" rather than a
// colored pill until someone actually sets it.
const INSTRUCTION_STATUS_BADGE: Record<string, string> = {
  sent: "b-ok",
  not_sent: "b-crit",
};
const INSTRUCTION_STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  not_sent: "Not Sent",
};

function InstructionStatusCell({
  bookingId, value, onChanged
}: { bookingId: string; value: string | null; onChanged: (value: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction_status: next }),
      });
      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON body, fall through to status */ }
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      onChanged(next);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const badgeClass = value ? INSTRUCTION_STATUS_BADGE[value] ?? "b-neu" : "b-neu";

  return (
    <td style={{ minWidth: 140 }}>
      <select
        value={value ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        aria-label="Instruction Status"
        className={`badge ${badgeClass}`}
        style={{ border: 0, cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 600 }}
      >
        <option value="">—</option>
        <option value="sent">{INSTRUCTION_STATUS_LABELS.sent}</option>
        <option value="not_sent">{INSTRUCTION_STATUS_LABELS.not_sent}</option>
      </select>
      {error && <div className="err" style={{ marginTop: 4 }}>{error}</div>}
    </td>
  );
}
