"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, CheckCircle2, Ship, AlertTriangle, PackageCheck, Search, Mail, Ban } from "lucide-react";
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
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import StatusMenuButton, { StatusOption } from "@/components/ui/StatusMenuButton";

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
  // Its booking number has more than one container (lib/bookings-data.ts) -
  // highlighted in Booking & Instructions, with a "Multiple only" filter.
  is_multiple?: boolean;
};

type Stage = "open" | "closed" | "cancelled";

// Mirrors CLOSED_STATUS / CANCELLED_STATUS in lib/bookings-data.ts: "Closed"
// is stored as the `delivered` status (no migration needed), "Cancelled" as
// `cancelled`; moving a booking back to Booking & Instructions sets it to
// `confirmed`.
const STAGE_STATUS: Record<Stage, string> = { open: "confirmed", closed: "delivered", cancelled: "cancelled" };
function stageForStatus(status: string): Stage {
  return status === "delivered" ? "closed" : status === "cancelled" ? "cancelled" : "open";
}
const STAGE_LABEL: Record<Stage, string> = { open: "Booking & Instructions", closed: "Closed Bookings", cancelled: "Cancelled Bookings" };

// Every dropdown in the filter bar shares one width, like the ledgers'.
const FILTER_WIDTH = 160;
// "Multiple only" and "No ERD" are the same width.
const TOGGLE_CHIP_WIDTH = 150;

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

// The date a booking is filed under for the Working Year / month: its ERD,
// else its Cargo Cut Off, else its DOC Cut Off. A booking is NEVER hidden
// for having a blank ERD (an import of rows without one used to vanish
// under every year); one with none of the three dates shows under every
// year instead, and the "No ERD" filter gathers them so they can be filled.
function filingDate(r: Pick<Row, "erd" | "cargo_cutoff" | "si_cutoff">): { date: Date; source: "erd" | "cargo_cutoff" | "si_cutoff" } | null {
  for (const source of ["erd", "cargo_cutoff", "si_cutoff"] as const) {
    const v = r[source];
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return { date: d, source };
  }
  return null;
}

// Shared by the grid's `filtered` memo and the KPI cards, so the cards can
// never show a total the grid has no rows to back up.
function inYearScope(r: Pick<Row, "erd" | "cargo_cutoff" | "si_cutoff">, year: number, monthFilter: string): boolean {
  const filed = filingDate(r);
  // Undated: every year, but not under a specific month.
  if (!filed) return monthFilter === "all";
  if (filed.date.getFullYear() !== year) return false;
  if (monthFilter !== "all" && filed.date.getMonth() !== Number(monthFilter)) return false;
  return true;
}

const FILED_BY_LABEL = { cargo_cutoff: "Cargo Cut Off", si_cutoff: "DOC Cut Off" } as const;

function toCsv(rows: Row[]) {
  const headers = [
    "Booking Number", "Container Number", "Month of Loading", "ERD", "DOC Cut Off", "Cargo Cut Off",
    "Port of Loading", "Port of Discharge", "Port of Delivery", "B/L Issued At",
    "Shipping Line", "Forwarder Name", "Trucker Name", "Supplier Name", "Buyer (Consignee)",
    "Container Size", "Seal No", "Weight", "Bales", "Status", "Instruction Status",
  ];
  const lines = rows.map((r) => {
    const firstPacking = r.packing_items[0];
    return [
      r.carrier_booking_no ?? "", r.container_no ?? "", monthOfLoading(r.erd), formatPlain(r.erd, true), formatPlain(r.si_cutoff, true), formatPlain(r.cargo_cutoff, true),
      r.pol ?? "", r.pod ?? "", r.final_destination ?? "", formatPlain(r.bl_issued_at),
      r.carrier ?? "", r.forwarder?.name ?? "", r.trucker?.name ?? "", r.supplier?.name ?? "", r.buyer?.name ?? "",
      r.container_size ?? "",
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
  stage = "open",
  closedRows = [],
  cancelledRows = [],
  forwarders,
  truckers,
  suppliers,
  buyers,
  isAdmin = false,
}: {
  rows: Row[];
  // Which of the three booking grids this is (lib/bookings-data.ts):
  // "open" = Booking & Instructions, "closed" = Closed Bookings (every
  // field filled in, or moved there by hand), "cancelled" = Cancelled
  // Bookings (moved there by hand).
  stage?: Stage;
  // "open" only: the Closed / Cancelled Bookings rows, for those KPI cards.
  closedRows?: Row[];
  cancelledRows?: Row[];
  forwarders: PartyOption[];
  truckers: PartyOption[];
  suppliers: PartyOption[];
  buyers: PartyOption[];
  // Only an admin sees bulk DELETE - a testing-cleanup tool, not something
  // every teammate should reach for on live data. Selecting rows to move
  // them between stages is for everyone.
  isAdmin?: boolean;
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

  // Local copies of the Closed/Cancelled lists so their KPI cards update the
  // moment a booking moves there from this grid, without a reload.
  const [closedList, setClosedList] = useState(closedRows);
  const [cancelledList, setCancelledList] = useState(cancelledRows);
  useEffect(() => setClosedList(closedRows), [closedRows]);
  useEffect(() => setCancelledList(cancelledRows), [cancelledRows]);

  // A booking whose status now belongs to another section leaves this grid
  // straight away - whether it was moved with the selection bar or its
  // Status pill was changed. Every row of the booking goes together.
  function applyStatusChange(bookingIds: string[], newStatus: string) {
    const ids = new Set(bookingIds);
    const target = stageForStatus(newStatus);
    if (target === stage) {
      setRows((prev) => prev.map((r) => (ids.has(r.booking_id) ? { ...r, status: newStatus } : r)));
      return;
    }
    const moved = rows.filter((r) => ids.has(r.booking_id)).map((r) => ({ ...r, status: newStatus }));
    setRows((prev) => prev.filter((r) => !ids.has(r.booking_id)));
    if (target === "closed") setClosedList((prev) => [...moved, ...prev]);
    if (target === "cancelled") setCancelledList((prev) => [...moved, ...prev]);
    if (stage === "closed") setClosedList((prev) => prev.filter((r) => !ids.has(r.booking_id)));
    if (stage === "cancelled") setCancelledList((prev) => prev.filter((r) => !ids.has(r.booking_id)));
  }

  // The sidebar's Year selector is the one working-year filter for this
  // grid - always on, no separate opt-in toggle, since having both was
  // redundant with the sidebar already being "the" year control. A
  // booking's year always comes from its own Month of Loading (ERD),
  // never a separately entered field; a booking with no ERD yet can't
  // belong to any year, so it won't show until it has one. The Month
  // filter below narrows further within whichever year is selected.
  const { year } = useYear();
  const [monthFilter, setMonthFilter] = useState("all");

  // "Multiple only": just the booking numbers with more than one container
  // (the old Multiple Bookings & Instructions page). /bookings?multiple=1 -
  // where that page's old URL now redirects - opens with it on.
  const searchParams = useSearchParams();
  const [multipleOnly, setMultipleOnly] = useState(searchParams?.get("multiple") === "1");
  // "No ERD": bookings still missing their ERD (filed by a cut-off date, or
  // undated) - so they can be found and filled in.
  const [noErdOnly, setNoErdOnly] = useState(false);
  const noErdCount = useMemo(
    () => new Set(rows.filter((r) => !r.erd && inYearScope(r, year, monthFilter)).map((r) => r.booking_id)).size,
    [rows, year, monthFilter]
  );
  const multipleCount = useMemo(
    () => new Set(rows.filter((r) => r.is_multiple && inYearScope(r, year, monthFilter)).map((r) => (r.carrier_booking_no ?? "").trim().toLowerCase())).size,
    [rows, year, monthFilter]
  );

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
      if (multipleOnly && !r.is_multiple) return false;
      if (noErdOnly && r.erd) return false;
      // The working year (sidebar) always filters this grid - a booking
      // with no Month of Loading/ERD yet can't belong to any year, so it
      // drops out until it has one. The Month filter then narrows further
      // within that year.
      if (!inYearScope(r, year, monthFilter)) return false;
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
  }, [rows, line, destination, status, forwarderFilter, truckerFilter, supplierFilter, buyerFilter, multipleOnly, noErdOnly, year, monthFilter, cutoffSoonOnly, overdueOnly, search]);

  // Any filter change jumps back to page 1 - staying on, say, page 4 after
  // narrowing the result set down to one page would just show an empty grid.
  useEffect(() => {
    setPage(0);
  }, [line, destination, status, forwarderFilter, truckerFilter, supplierFilter, buyerFilter, multipleOnly, noErdOnly, year, monthFilter, cutoffSoonOnly, overdueOnly, search, pageSize]);

  // Each booking's container numbers, for the Upload BL dialog's manual
  // entry (pre-fills its container table).
  const containerNosByBooking = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.container_no) continue;
      if (!m.has(r.booking_id)) m.set(r.booking_id, []);
      m.get(r.booking_id)!.push(r.container_no);
    }
    return m;
  }, [rows]);

  // The frozen Container Number column sits right after the frozen Sr. No. +
  // Booking Number columns, whose combined width changes (editing a booking
  // number widens it) - measured live into --stk3-left so the three frozen
  // columns never overlap.
  const tableRef = useRef<HTMLTableElement>(null);
  const bookingHeadRef = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    const th = bookingHeadRef.current;
    const table = tableRef.current;
    if (!th || !table) return;
    // Sum of the two frozen columns' widths - offsetLeft would be measured
    // from the page, not the table, and drift by the page's own padding.
    const srTh = th.previousElementSibling as HTMLElement | null;
    const update = () => table.style.setProperty("--stk3-left", `${(srTh?.offsetWidth ?? 56) + th.offsetWidth}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(th);
    if (srTh) ro.observe(srTh);
    return () => ro.disconnect();
  }, []);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageStart = page * pageSize;
  const paginated = useMemo(() => filtered.slice(pageStart, pageStart + pageSize), [filtered, pageStart, pageSize]);

  // Selection is per ROW (one row = one container), so a single container
  // of a multi-container booking can be picked on its own - e.g. deleting
  // one of two containers turns a "multiple" booking back into a single
  // one. Moving to another stage always moves the whole booking (all its
  // containers); deleting removes the whole booking only when every one of
  // its rows is selected, otherwise just the selected containers.
  const visibleRowKeys = useMemo(() => paginated.map(rowKey), [paginated]);
  const bulk = useBulkSelection(visibleRowKeys);
  useEffect(() => {
    bulk.pruneToVisible(new Set(visibleRowKeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRowKeys.join(",")]);
  const selectedRows = useMemo(() => rows.filter((r) => bulk.selected.has(rowKey(r))), [rows, bulk.selected]);
  const selectedBookingIds = useMemo(() => Array.from(new Set(selectedRows.map((r) => r.booking_id))), [selectedRows]);
  // What a bulk delete of the current selection would remove.
  const deletePlan = useMemo(() => {
    const wholeBookings: string[] = [];
    const containers: Row[] = [];
    for (const bookingId of selectedBookingIds) {
      const all = rows.filter((r) => r.booking_id === bookingId);
      const picked = selectedRows.filter((r) => r.booking_id === bookingId);
      if (picked.length === all.length || picked.some((r) => !r.container_id)) wholeBookings.push(bookingId);
      else containers.push(...picked);
    }
    return { wholeBookings, containers };
  }, [rows, selectedRows, selectedBookingIds]);

  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Drops rows locally and re-checks the "multiple" highlight for the
  // booking numbers they belonged to, then refreshes from the server (which
  // also counts numbers on the other stages' pages).
  function removeRowsLocally(shouldRemove: (r: Row) => boolean) {
    setRows((prev) => {
      const kept = prev.filter((r) => !shouldRemove(r));
      const count = new Map<string, number>();
      for (const r of kept) {
        const k = (r.carrier_booking_no ?? "").trim().toLowerCase();
        if (k) count.set(k, (count.get(k) ?? 0) + 1);
      }
      return kept.map((r) => {
        const k = (r.carrier_booking_no ?? "").trim().toLowerCase();
        return r.is_multiple && (count.get(k) ?? 0) <= 1 ? { ...r, is_multiple: false } : r;
      });
    });
    router.refresh();
  }

  async function bulkDeleteSelected() {
    setBulkDeleting(true);
    setBulkError(null);
    const { wholeBookings, containers } = deletePlan;
    const deletedBookings: string[] = [];
    const deletedContainers: string[] = [];
    const failures: string[] = [];
    for (const bookingId of wholeBookings) {
      const bookingNo = rows.find((r) => r.booking_id === bookingId)?.carrier_booking_no ?? bookingId;
      try {
        const res = await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
        if (res.ok) deletedBookings.push(bookingId);
        else failures.push(`${bookingNo}: ${(await res.json().catch(() => ({}))).error || "failed"}`);
      } catch (err: any) {
        failures.push(`${bookingNo}: ${err?.message || "network error"}`);
      }
    }
    for (const r of containers) {
      try {
        const res = await fetch(`/api/bookings/${r.booking_id}/containers/${r.container_id}`, { method: "DELETE" });
        if (res.ok) deletedContainers.push(r.container_id!);
        else failures.push(`${r.carrier_booking_no} / ${r.container_no}: ${(await res.json().catch(() => ({}))).error || "failed"}`);
      } catch (err: any) {
        failures.push(`${r.carrier_booking_no} / ${r.container_no}: ${err?.message || "network error"}`);
      }
    }
    removeRowsLocally((r) => deletedBookings.includes(r.booking_id) || (!!r.container_id && deletedContainers.includes(r.container_id)));
    setBulkDeleting(false);
    setBulkConfirming(false);
    bulk.clear();
    if (failures.length > 0) {
      setBulkError(`${failures.length} couldn't be deleted:\n${failures.join("\n")}`);
    }
  }

  // Moves the selected bookings to another stage by setting their status
  // (see STAGE_STATUS). They leave this grid straight away; the page they
  // went to shows them on its next load.
  const [moving, setMoving] = useState(false);
  async function moveSelected(to: Stage) {
    const ids = selectedBookingIds;
    if (ids.length === 0) return;
    const reopenNote =
      to === "open"
        ? " A booking with every field already filled in moves straight back to Closed Bookings - clear a field first to keep it open."
        : "";
    if (!confirm(`Move ${ids.length} booking${ids.length === 1 ? "" : "s"} to ${STAGE_LABEL[to]}?${reopenNote}`)) return;
    setMoving(true);
    setBulkError(null);
    const succeeded: string[] = [];
    const failures: string[] = [];
    for (const bookingId of ids) {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: STAGE_STATUS[to] }),
        });
        if (res.ok) {
          succeeded.push(bookingId);
        } else {
          const json = await res.json().catch(() => ({}));
          const bookingNo = rows.find((r) => r.booking_id === bookingId)?.carrier_booking_no ?? bookingId;
          failures.push(`${bookingNo}: ${json.error || "failed"}`);
        }
      } catch (err: any) {
        failures.push(`${bookingId}: ${err?.message || "network error"}`);
      }
    }
    applyStatusChange(succeeded, STAGE_STATUS[to]);
    setMoving(false);
    bulk.clear();
    if (failures.length > 0) {
      setBulkError(`${failures.length} of ${ids.length} couldn't be moved:\n${failures.join("\n")}`);
    }
  }

  // The KPI cards reflect every booking in this grid for the selected
  // Working Year/month - multi-container numbers included, since they're
  // in this same grid now. Scoped by the same ERD/year/month gate as the
  // grid itself (inYearScope) so these numbers can never show a total the
  // grid has no rows to back up - unlike the secondary dropdown filters
  // (status/forwarder/etc.), which are a drill-down and intentionally don't
  // shrink the KPIs.
  const kpiRows = useMemo(() => rows.filter((r) => inYearScope(r, year, monthFilter)), [rows, year, monthFilter]);
  const totalBookings = useMemo(() => new Set(kpiRows.map((r) => r.booking_id)).size, [kpiRows]);
  const cutoffSoonCount = kpiRows.filter((r) => {
    if (!r.cargo_cutoff) return false;
    const diff = new Date(r.cargo_cutoff).getTime() - Date.now();
    return diff > 0 && diff < 48 * 3600 * 1000;
  }).length;
  const confirmedCount = new Set(kpiRows.filter((r) => r.status === "confirmed").map((r) => r.booking_id)).size;
  const inTransitCount = new Set(kpiRows.filter((r) => r.status === "in_transit").map((r) => r.booking_id)).size;
  const closedCount = useMemo(
    () => new Set(closedList.filter((r) => inYearScope(r, year, monthFilter)).map((r) => r.booking_id)).size,
    [closedList, year, monthFilter]
  );
  const cancelledCount = useMemo(
    () => new Set(cancelledList.filter((r) => inYearScope(r, year, monthFilter)).map((r) => r.booking_id)).size,
    [cancelledList, year, monthFilter]
  );
  const instructionsSentCount = new Set(kpiRows.filter((r) => r.instruction_status === "sent").map((r) => r.booking_id)).size;

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
    removeRowsLocally((r) => r.booking_id === bookingId);
  }

  // A row's own delete button: on a booking with several containers it
  // removes just THIS container (and its tracking/invoices) - the booking
  // keeps the others, and drops its "multiple" highlight once one is left.
  // On a single-container booking it deletes the booking.
  async function deleteRow(r: Row) {
    const containerCount = rows.filter((x) => x.booking_id === r.booking_id).length;
    if (containerCount <= 1 || !r.container_id) return deleteBooking(r.booking_id, r.carrier_booking_no);
    if (!confirm(`Remove container ${r.container_no ?? "(no number)"} from booking ${r.carrier_booking_no ?? ""}? Its tracking entry and invoices go with it; the booking keeps its other container${containerCount - 1 === 1 ? "" : "s"}. This cannot be undone.`)) {
      return;
    }
    const res = await fetch(`/api/bookings/${r.booking_id}/containers/${r.container_id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "Failed to remove container");
      return;
    }
    removeRowsLocally((x) => x.container_id === r.container_id);
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
    setMultipleOnly(false);
    setNoErdOnly(false);
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
    multipleOnly ? { label: "Multiple only", clear: () => setMultipleOnly(false) } : null,
    noErdOnly ? { label: "No ERD", clear: () => setNoErdOnly(false) } : null,
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
          <h1 className="h1">{STAGE_LABEL[stage]}</h1>
          <p className="sub">
            {stage === "closed"
              ? "Bookings with every field filled in move here on their own - or select rows and move them by hand. Still editable. Highlighted rows share a booking number with more than one container."
              : stage === "cancelled"
              ? "Bookings moved here by hand. Select rows to restore them to Booking & Instructions. Highlighted rows share a booking number with more than one container."
              : "Source of truth — click the pencil icon on any cell to edit. Highlighted rows share a booking number with more than one container."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={exportCsv} className="btn">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            Export CSV
          </button>
          {stage === "open" && (
            <Link href="/bookings/new" className="btn btn-p">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Booking
            </Link>
          )}
        </div>
      </div>

      {stage === "open" && (
        <section aria-label="Booking totals" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(130px, 1fr))", gap: 9, overflowX: "auto" }}>
          <StatCard icon={ClipboardList} label="Total Bookings" value={totalBookings} />
          <StatCard icon={CheckCircle2} label="Confirmed" value={confirmedCount} />
          <StatCard icon={Ship} label="In Transit" value={inTransitCount} />
          <StatCard icon={AlertTriangle} label="Cut-off within 48h" value={cutoffSoonCount} tone="danger" />
          <StatCard icon={PackageCheck} label="Closed" value={closedCount} tone="success" />
          <StatCard icon={Ban} label="Cancelled" value={cancelledCount} tone={cancelledCount > 0 ? "danger" : "default"} />
          <StatCard icon={Mail} label="Instructions Sent" value={instructionsSentCount} tone="success" />
        </section>
      )}

      {/* This is the ONLY element that scrolls - header/cards/filters stay put */}
      <section className="card" aria-label="Bookings table" style={{ overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* One wrapping filter row, in this order: search, Month, Status,
            Lines, Destinations, Forwarders, Truckers, Suppliers, Buyers, then
            the cut-off, Multiple and No ERD chips. Items flow onto the second
            line only where they don't fit, so with the sidebar collapsed
            Truckers moves up beside Forwarders. Every dropdown is the same
            width (FILTER_WIDTH); Multiple only and No ERD share a width too. The booking count lives
            in the footer ("Showing 1-25 of N"), not up here. ERD / cut-off
            dates are always shown compact (EditableCell compactDate). */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <label style={{ flex: "1 1 260px", maxWidth: 340, display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", border: "1px solid var(--line2)", borderRadius: 9, background: "var(--surf)" }}>
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
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Month of loading" className="select select-s" style={{ width: FILTER_WIDTH }}>
              <option value="all">All Months ({year})</option>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i}>{m} {year}</option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="select select-s" style={{ width: FILTER_WIDTH }}>
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_transit">In Transit</option>
              {stage === "closed" && <option value="delivered">Closed</option>}
              {stage === "cancelled" && <option value="cancelled">Cancelled</option>}
            </select>
            <select value={line} onChange={(e) => setLine(e.target.value)} aria-label="Shipping line" className="select select-s" style={{ width: FILTER_WIDTH }}>
              <option value="all">All Lines</option>
              {lines.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <select value={destination} onChange={(e) => setDestination(e.target.value)} aria-label="Port of delivery" className="select select-s" style={{ width: FILTER_WIDTH }}>
              <option value="all">All Destinations</option>
              {destinations.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select value={forwarderFilter} onChange={(e) => setForwarderFilter(e.target.value)} aria-label="Forwarder" className="select select-s" style={{ width: FILTER_WIDTH }}>
              <option value="all">All Forwarders</option>
              {forwarderOptions.map((f) => (
                <option key={f.id} value={f.legal_name}>{f.legal_name}</option>
              ))}
            </select>
            <select value={truckerFilter} onChange={(e) => setTruckerFilter(e.target.value)} aria-label="Trucker" className="select select-s" style={{ width: FILTER_WIDTH }}>
              <option value="all">All Truckers</option>
              {truckerOptions.map((t) => (
                <option key={t.id} value={t.legal_name}>{t.legal_name}</option>
              ))}
            </select>
            <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} aria-label="Supplier" className="select select-s" style={{ width: FILTER_WIDTH }}>
              <option value="all">All Suppliers</option>
              {supplierOptions.map((sp) => (
                <option key={sp.id} value={sp.legal_name}>{sp.legal_name}</option>
              ))}
            </select>
            <select value={buyerFilter} onChange={(e) => setBuyerFilter(e.target.value)} aria-label="Buyer" className="select select-s" style={{ width: FILTER_WIDTH }}>
              <option value="all">All Buyers</option>
              {buyerOptions.map((b) => (
                <option key={b.id} value={b.legal_name}>{b.legal_name}</option>
              ))}
            </select>
            <button onClick={() => setCutoffSoonOnly(!cutoffSoonOnly)} aria-pressed={cutoffSoonOnly} className={cutoffSoonOnly ? "chip on" : "chip"} style={{ height: 36 }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
              </svg>
              Cut-off in 3 days
            </button>
            <button onClick={() => setOverdueOnly(!overdueOnly)} aria-pressed={overdueOnly} className={overdueOnly ? "chip on-crit" : "chip"} style={{ height: 36 }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l10 18H2zM12 10v4" />
              </svg>
              Cut-off overdue
            </button>
            {/* On all three pages - Closed and Cancelled bookings keep their
                multiple-container highlight too. */}
            {(
              <button
                onClick={() => setMultipleOnly(!multipleOnly)}
                aria-pressed={multipleOnly}
                className={multipleOnly ? "chip on" : "chip"}
                style={{ height: 36, minWidth: TOGGLE_CHIP_WIDTH, justifyContent: "center" }}
                title="Booking numbers with more than one container"
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 8h12v12H8zM4 16V4h12" />
                </svg>
                Multiple only{multipleCount > 0 ? ` (${multipleCount})` : ""}
              </button>
            )}
            <button
              onClick={() => setNoErdOnly(!noErdOnly)}
              aria-pressed={noErdOnly}
              className={noErdOnly ? "chip on-crit" : "chip"}
              style={{ height: 36, minWidth: TOGGLE_CHIP_WIDTH, justifyContent: "center" }}
              title="Bookings with no ERD yet - filed by their cut-off date, or shown under every year when they have none"
            >
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" />
              </svg>
              No ERD{noErdCount > 0 ? ` (${noErdCount})` : ""}
            </button>
            {(activeChips.length > 0 || cutoffSoonOnly || overdueOnly || search || monthFilter !== "all") && (
              <button
                onClick={() => {
                  clearFilters();
                  setMonthFilter("all");
                }}
                style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--accent)", fontSize: 13, marginLeft: 4 }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

      {bulk.selectedCount > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "8px 16px", background: "var(--accentS)", borderBottom: "1px solid var(--line)" }}>
          <span className="lbl" style={{ fontWeight: 600, color: "var(--accent)" }}>
            {bulk.selectedCount} row{bulk.selectedCount === 1 ? "" : "s"} selected
            {selectedBookingIds.length !== bulk.selectedCount ? ` (${selectedBookingIds.length} booking${selectedBookingIds.length === 1 ? "" : "s"})` : ""}
          </span>
          {stage !== "closed" && (
            <button type="button" onClick={() => moveSelected("closed")} disabled={moving || bulkDeleting} className="btn btn-s">
              <PackageCheck size={14} /> Move to Closed
            </button>
          )}
          {stage !== "cancelled" && (
            <button type="button" onClick={() => moveSelected("cancelled")} disabled={moving || bulkDeleting} className="btn btn-s">
              <Ban size={14} /> Move to Cancelled
            </button>
          )}
          {stage !== "open" && (
            <button type="button" onClick={() => moveSelected("open")} disabled={moving || bulkDeleting} className="btn btn-s">
              Back to Booking &amp; Instructions
            </button>
          )}
          {isAdmin && (
            <button type="button" onClick={() => setBulkConfirming(true)} disabled={moving || bulkDeleting} className="btn btn-dp btn-s">
              {bulkDeleting ? "Deleting…" : "Delete Selected"}
            </button>
          )}
          <button type="button" onClick={bulk.clear} disabled={moving || bulkDeleting} className="btn btn-g btn-s">
            Clear
          </button>
          {moving && <span className="meta">Moving…</span>}
        </div>
      )}

      <div className="tw" style={{ flex: 1, minHeight: 0 }}>
        <table className="tbl tbl-bk" ref={tableRef}>
          <thead>
            <tr>
              {[
                "Sr. No.", "Booking Number", "Container Number", "Month of Loading", "ERD", "DOC Cut Off", "Cargo Cut Off",
                "Port of Loading", "Port of Discharge", "Port of Delivery", "B/L Issued At", "Upload BL",
                "Shipping Line", "Forwarder Name", "Trucker Name", "Supplier Name", "Buyer (Consignee)",
                "Container Size", "Packing Details", "Status", "Send Instructions", "Instruction Status", "Open",
              ].map((label, i) => (
                <th
                  key={i}
                  ref={i === 1 ? bookingHeadRef : undefined}
                  className={i === 0 ? "stk" : i === 1 ? "stk2" : i === 2 ? "stk3" : undefined}
                  style={i === 0 ? { zIndex: 3, width: 56, minWidth: 56 } : i <= 2 ? { zIndex: 3 } : undefined}
                >
                  {i === 0 ? (
                    <input
                      type="checkbox"
                      aria-label="Select all bookings on this page"
                      checked={bulk.allVisibleSelected}
                      onChange={bulk.toggleAll}
                    />
                  ) : (
                    label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((r, idx) => {
              const cutoffSoon = r.cargo_cutoff && new Date(r.cargo_cutoff).getTime() - Date.now() < 48 * 3600 * 1000;
              return (
                <tr key={rowKey(r)} className={r.is_multiple ? "row-multi" : undefined} title={r.is_multiple ? "This booking number has more than one container" : undefined}>
                  <td className="stk num meta" style={{ width: 56, minWidth: 56 }}>
                    <input
                      type="checkbox"
                      aria-label={`Select booking ${r.carrier_booking_no ?? ""} (row ${pageStart + idx + 1})`}
                      checked={bulk.selected.has(rowKey(r))}
                      onChange={() => bulk.toggle(rowKey(r))}
                    />
                  </td>
                  <EditableCell bookingId={r.booking_id} column="carrier_booking_no" value={r.carrier_booking_no} sticky bold />
                  <ContainerCell
                    bookingId={r.booking_id}
                    containerId={r.container_id}
                    value={r.container_no}
                    onSaved={(containerId, containerNo) => updateSingleRow(r.booking_id, r.container_id, { container_id: containerId, container_no: containerNo })}
                    onAddContainer={() => addContainer(r)}
                    sticky
                  />
                  {(() => {
                    if (r.erd) return <td className={monthOfLoading(r.erd) === "—" ? "dash" : ""}>{monthOfLoading(r.erd)}</td>;
                    const filed = filingDate(r);
                    return filed ? (
                      <td title={`No ERD yet - filed by ${FILED_BY_LABEL[filed.source as "cargo_cutoff" | "si_cutoff"]}`}>
                        <span style={{ color: "var(--tx2)" }}>{monthOfLoading(filed.date.toISOString())}</span>
                        <div className="meta" style={{ color: "var(--warn)" }}>No ERD · by {FILED_BY_LABEL[filed.source as "cargo_cutoff" | "si_cutoff"]}</div>
                      </td>
                    ) : (
                      <td title="No ERD or cut-off date yet - shown under every year">
                        <span className="badge b-warn">No ERD</span>
                      </td>
                    );
                  })()}
                  <EditableCell bookingId={r.booking_id} column="erd" value={r.erd} isDate compactDate />
                  <EditableCell bookingId={r.booking_id} column="si_cutoff" value={r.si_cutoff} isDate compactDate />
                  <EditableCell bookingId={r.booking_id} column="cargo_cutoff" value={r.cargo_cutoff} isDate highlight={!!cutoffSoon} compactDate />
                  <EditableCell bookingId={r.booking_id} column="pol" value={r.pol} />
                  <EditableCell bookingId={r.booking_id} column="pod" value={r.pod} />
                  <EditableCell bookingId={r.booking_id} column="final_destination" value={r.final_destination} />
                  <EditableCell bookingId={r.booking_id} column="bl_issued_at" value={r.bl_issued_at} />
                  <UploadBlCell
                    bookingId={r.booking_id}
                    blNumber={r.bl_number}
                    containerNos={containerNosByBooking.get(r.booking_id) ?? []}
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

                  <EditableCell bookingId={r.booking_id} column="container_size" value={r.container_size} />
                  <PackingItemsCell
                    containerId={r.container_id}
                    items={r.packing_items}
                    onItemsChange={(items) => updateSingleRow(r.booking_id, r.container_id, { packing_items: items })}
                  />
                  <StatusCell
                    bookingId={r.booking_id}
                    value={r.status}
                    onChanged={(v) => applyStatusChange([r.booking_id], v)}
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
                      <Link
                        href={`/bookings/${r.booking_id}`}
                        className="text-xs border border-accent text-accent px-2 py-1 rounded hover:bg-accent hover:text-white"
                        style={{ textDecoration: "none" }}
                      >
                        View
                      </Link>
                      <button
                        onClick={() => deleteRow(r)}
                        aria-label={rows.filter((x) => x.booking_id === r.booking_id).length > 1 ? `Remove container ${r.container_no ?? ""} from booking ${r.carrier_booking_no ?? ""}` : `Delete booking ${r.carrier_booking_no ?? ""}`}
                        title={rows.filter((x) => x.booking_id === r.booking_id).length > 1 ? "Remove this container only" : "Delete booking"}
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
                  <EmptyState
                    icon={stage === "cancelled" ? Ban : stage === "closed" ? PackageCheck : ClipboardList}
                    title={
                      rows.length === 0
                        ? stage === "closed"
                          ? "No closed bookings yet"
                          : stage === "cancelled"
                          ? "No cancelled bookings"
                          : "No bookings yet"
                        : "No bookings match these filters"
                    }
                    hint={
                      rows.length > 0
                        ? undefined
                        : stage === "closed"
                        ? "A booking moves here once every field is filled in, or when you move it here by hand."
                        : stage === "cancelled"
                        ? "Select bookings in Booking & Instructions and choose Move to Cancelled."
                        : "Upload a PDF or add one manually."
                    }
                  />
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

      {bulkConfirming && (
        <div className="scrim" onClick={() => !bulkDeleting && setBulkConfirming(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <h2 className="h2">Delete the selected rows?</h2>
            </div>
            <div className="mb">
              {deletePlan.wholeBookings.length > 0 && (
                <p className="lbl">
                  <b>{deletePlan.wholeBookings.length} whole booking{deletePlan.wholeBookings.length === 1 ? "" : "s"}</b> (every row
                  selected) - removed with everything on them: containers, documents, tracking, amendments and their invoices.
                </p>
              )}
              {deletePlan.containers.length > 0 && (
                <p className="lbl">
                  <b>{deletePlan.containers.length} single container{deletePlan.containers.length === 1 ? "" : "s"}</b> from
                  multi-container bookings ({deletePlan.containers.map((r) => r.container_no ?? "no number").join(", ")}) -
                  each with its own tracking entry and invoices. Those bookings keep their other containers.
                </p>
              )}
              <p className="lbl">This cannot be undone.</p>
            </div>
            <div className="mf">
              <button type="button" onClick={() => setBulkConfirming(false)} disabled={bulkDeleting} className="btn btn-g">
                Cancel
              </button>
              <button type="button" onClick={bulkDeleteSelected} disabled={bulkDeleting} className="btn btn-dp">
                {bulkDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkError && (
        <div className="scrim" onClick={() => setBulkError(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <h2 className="h2">Some deletes failed</h2>
            </div>
            <div className="mb">
              <p className="lbl" style={{ whiteSpace: "pre-wrap" }}>{bulkError}</p>
            </div>
            <div className="mf">
              <button type="button" onClick={() => setBulkError(null)} className="btn btn-p">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Separate from the shipment's own `status` (draft/confirmed/in_transit/
// delivered (shown as Closed)/cancelled) - this just tracks whether shipping instructions
// have gone out to the carrier yet. Blank (unset) has no color, matching
// how every other optional field in this grid reads "—" rather than a
// colored pill until someone actually sets it.
// Same floating pill menu as the ledgers' Paid column.
const INSTRUCTION_STATUS_OPTIONS: StatusOption[] = [
  { value: "", label: "— set —", badgeClass: "b-neu" },
  { value: "sent", label: "Sent", badgeClass: "b-ok" },
  { value: "not_sent", label: "Not Sent", badgeClass: "b-crit" },
];

function InstructionStatusCell({
  bookingId, value, onChanged
}: { bookingId: string; value: string | null; onChanged: (value: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
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
    }
  }

  return (
    <td style={{ minWidth: 140 }}>
      <StatusMenuButton value={value ?? ""} options={INSTRUCTION_STATUS_OPTIONS} ariaLabel="Instruction Status" onChange={handleChange} />
      {error && <div className="err" style={{ marginTop: 4 }}>{error}</div>}
    </td>
  );
}
