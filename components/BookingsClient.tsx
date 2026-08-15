"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import EditableCell from "@/components/EditableCell";
import PartyPickerCell from "@/components/PartyPickerCell";
import ConsigneeCell from "@/components/ConsigneeCell";
import ContainerCell from "@/components/ContainerCell";

type PartyRef = { id: string; name: string } | null;
type PartyOption = { id: string; legal_name: string };
type ConsigneeItem = { id: string; description: string; sort_order: number };

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
  carrier: string | null;
  vessel: string | null;
  status: string;
  container_no: string | null;
  forwarder: PartyRef;
  trucker: PartyRef;
  supplier: PartyRef;
  buyer: PartyRef;
  consignee_items: ConsigneeItem[];
};

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
    "Container Number", "Vessel", "Status",
  ];
  const lines = rows.map((r) =>
    [
      r.carrier_booking_no ?? "", monthOfLoading(r.erd), formatPlain(r.erd, true), formatPlain(r.si_cutoff, true), formatPlain(r.cargo_cutoff, true),
      r.pol ?? "", r.pod ?? "", r.final_destination ?? "", formatPlain(r.bl_issued_at),
      r.carrier ?? "", r.forwarder?.name ?? "", r.trucker?.name ?? "", r.supplier?.name ?? "", r.buyer?.name ?? "",
      r.container_no ?? "", r.vessel ?? "", r.status,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}

export default function BookingsClient({
  rows: initialRows,
  forwarders,
  truckers,
  suppliers,
  buyers,
}: {
  rows: Row[];
  forwarders: PartyOption[];
  truckers: PartyOption[];
  suppliers: PartyOption[];
  buyers: PartyOption[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [forwarderOptions, setForwarderOptions] = useState(forwarders);
  const [truckerOptions, setTruckerOptions] = useState(truckers);
  const [supplierOptions, setSupplierOptions] = useState(suppliers);
  const [buyerOptions, setBuyerOptions] = useState(buyers);

  const [line, setLine] = useState("all");
  const [destination, setDestination] = useState("all");
  const [status, setStatus] = useState("all");
  const [cutoffSoonOnly, setCutoffSoonOnly] = useState(false);

  const lines = useMemo(() => Array.from(new Set(rows.map((r) => r.carrier).filter(Boolean))) as string[], [rows]);
  const destinations = useMemo(() => Array.from(new Set(rows.map((r) => r.pod).filter(Boolean))) as string[], [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (line !== "all" && r.carrier !== line) return false;
      if (destination !== "all" && r.pod !== destination) return false;
      if (status !== "all" && r.status !== status) return false;
      if (cutoffSoonOnly) {
        if (!r.cargo_cutoff) return false;
        const diff = new Date(r.cargo_cutoff).getTime() - Date.now();
        if (diff > 3 * 24 * 3600 * 1000 || diff < 0) return false;
      }
      return true;
    });
  }, [rows, line, destination, status, cutoffSoonOnly]);

  const totalBookings = useMemo(() => new Set(rows.map((r) => r.booking_id)).size, [rows]);
  const cutoffSoonCount = rows.filter((r) => {
    if (!r.cargo_cutoff) return false;
    const diff = new Date(r.cargo_cutoff).getTime() - Date.now();
    return diff > 0 && diff < 48 * 3600 * 1000;
  }).length;
  const confirmedCount = new Set(rows.filter((r) => r.status === "confirmed").map((r) => r.booking_id)).size;

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
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Booking & Instructions</h1>
          <p className="text-sm text-ink/40">Source of truth — click the pencil icon on any cell to edit</p>
        </div>
        <Link href="/bookings/new" className="bg-accent text-white px-4 py-2.5 rounded-lg text-sm font-medium shrink-0">
          + New Booking
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 shrink-0">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-ink/40 uppercase tracking-wide font-medium">Total Bookings</div>
          <div className="text-2xl font-semibold mt-1 text-ink">{totalBookings}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-ink/40 uppercase tracking-wide font-medium">Cut-off within 48h</div>
          <div className="text-2xl font-semibold mt-1 text-cutoff">{cutoffSoonCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-ink/40 uppercase tracking-wide font-medium">Confirmed</div>
          <div className="text-2xl font-semibold mt-1 text-ink">{confirmedCount}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 shrink-0">
        <select value={line} onChange={(e) => setLine(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="all">All Lines</option>
          {lines.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select value={destination} onChange={(e) => setDestination(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="all">All Destinations</option>
          {destinations.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          onClick={() => setCutoffSoonOnly(!cutoffSoonOnly)}
          className={`border rounded-lg px-3 py-2 text-sm ${cutoffSoonOnly ? "bg-accent text-white border-accent" : "bg-white border-slate-200"}`}
        >
          Cut off within 3 days
        </button>
        <button onClick={exportCsv} className="ml-auto border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:bg-slate-50">
          ⬇ Export CSV
        </button>
      </div>

      {/* This is the ONLY element that scrolls - header/cards/filters stay put */}
      <div className="bg-white rounded-xl border border-slate-200 flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="text-left text-ink/50 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
            <tr>
              {[
                "Booking Number", "Month of Loading", "ERD", "DOC Cut Off", "Cargo Cut Off",
                "Port of Loading", "Port of Discharge", "Port of Delivery", "B/L Issued At",
                "Shipping Line", "Forwarder Name", "Trucker Name", "Supplier Name", "Buyer (Consignee)", "",
                "Container Number", "Vessel", "Status", "Open",
              ].map((label, i) => (
                <th key={i} className="px-3 py-2.5 font-semibold uppercase tracking-wide text-[11px] whitespace-nowrap">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const cutoffSoon = r.cargo_cutoff && new Date(r.cargo_cutoff).getTime() - Date.now() < 48 * 3600 * 1000;
              return (
                <tr key={rowKey(r)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                  <EditableCell bookingId={r.booking_id} column="carrier_booking_no" value={r.carrier_booking_no} />
                  <td className="px-3 py-2 text-sm whitespace-nowrap text-ink/60">{monthOfLoading(r.erd)}</td>
                  <EditableCell bookingId={r.booking_id} column="erd" value={r.erd} isDate />
                  <EditableCell bookingId={r.booking_id} column="si_cutoff" value={r.si_cutoff} isDate />
                  <EditableCell bookingId={r.booking_id} column="cargo_cutoff" value={r.cargo_cutoff} isDate highlight={!!cutoffSoon} />
                  <EditableCell bookingId={r.booking_id} column="pol" value={r.pol} />
                  <EditableCell bookingId={r.booking_id} column="pod" value={r.pod} />
                  <EditableCell bookingId={r.booking_id} column="final_destination" value={r.final_destination} />
                  <EditableCell bookingId={r.booking_id} column="bl_issued_at" value={r.bl_issued_at} />
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
                  <ConsigneeCell
                    bookingId={r.booking_id}
                    current={r.buyer}
                    options={buyerOptions}
                    items={r.consignee_items}
                    onAssigned={(p) => updateRowsForBooking(r.booking_id, { buyer: p })}
                    onCreated={(p) => setBuyerOptions((prev) => [...prev, p].sort((a, b) => a.legal_name.localeCompare(b.legal_name)))}
                    onItemsChange={(items) => updateRowsForBooking(r.booking_id, { consignee_items: items })}
                  />
                  <ContainerCell
                    bookingId={r.booking_id}
                    containerId={r.container_id}
                    value={r.container_no}
                    onSaved={(containerId, containerNo) => updateSingleRow(r.booking_id, r.container_id, { container_id: containerId, container_no: containerNo })}
                    onAddContainer={() => addContainer(r)}
                  />
                  <EditableCell bookingId={r.booking_id} column="vessel" value={r.vessel} />
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/bookings/${r.booking_id}`} className="text-accent hover:underline text-sm whitespace-nowrap">
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={19} className="p-8 text-center text-ink/40">
                  {rows.length === 0 ? "No bookings yet. Upload a PDF or add one manually." : "No bookings match these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600",
    confirmed: "bg-blue-100 text-blue-700",
    in_transit: "bg-amber-100 text-amber-700",
    delivered: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    draft: "Draft",
    confirmed: "Confirmed",
    in_transit: "In Transit",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? "bg-slate-100 text-slate-600"}`}>{labels[status] ?? status}</span>;
}
