"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import EditableCell from "@/components/EditableCell";

type Booking = {
  id: string;
  booking_no: string;
  carrier_booking_no: string | null;
  erd: string | null;
  si_cutoff: string | null;
  cargo_cutoff: string | null;
  pol: string | null;
  pod: string | null;
  final_destination: string | null;
  bl_issued_at: string | null;
  carrier: string | null;
  forwarder_name: string | null;
  container_size: string | null;
  status: string;
};

const COLUMNS: { label: string; column: keyof Booking; isDate?: boolean }[] = [
  { label: "Booking Number", column: "carrier_booking_no" },
  { label: "ERD", column: "erd", isDate: true },
  { label: "DOC Cut Off", column: "si_cutoff", isDate: true },
  { label: "Cargo Cut Off", column: "cargo_cutoff", isDate: true },
  { label: "POL", column: "pol" },
  { label: "Port of Discharge", column: "pod" },
  { label: "Port of Delivery", column: "final_destination" },
  { label: "B/L Issued At", column: "bl_issued_at" },
  { label: "Shipping Line", column: "carrier" },
  { label: "Forwarder Name", column: "forwarder_name" },
  { label: "Size Of Container", column: "container_size" }
];

function toCsv(rows: Booking[]) {
  const headers = [...COLUMNS.map((c) => c.label), "Status"];
  const lines = rows.map((b) =>
    [...COLUMNS.map((c) => b[c.column] ?? ""), b.status]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [headers.join(","), ...lines].join("\n");
}

export default function BookingsClient({ bookings }: { bookings: Booking[] }) {
  const [line, setLine] = useState("all");
  const [destination, setDestination] = useState("all");
  const [status, setStatus] = useState("all");
  const [cutoffSoonOnly, setCutoffSoonOnly] = useState(false);

  const lines = useMemo(() => Array.from(new Set(bookings.map((b) => b.carrier).filter(Boolean))) as string[], [bookings]);
  const destinations = useMemo(() => Array.from(new Set(bookings.map((b) => b.pod).filter(Boolean))) as string[], [bookings]);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (line !== "all" && b.carrier !== line) return false;
      if (destination !== "all" && b.pod !== destination) return false;
      if (status !== "all" && b.status !== status) return false;
      if (cutoffSoonOnly) {
        if (!b.cargo_cutoff) return false;
        const diff = new Date(b.cargo_cutoff).getTime() - Date.now();
        if (diff > 3 * 24 * 3600 * 1000 || diff < 0) return false;
      }
      return true;
    });
  }, [bookings, line, destination, status, cutoffSoonOnly]);

  const total = bookings.length;
  const cutoffSoonCount = bookings.filter((b) => {
    if (!b.cargo_cutoff) return false;
    const diff = new Date(b.cargo_cutoff).getTime() - Date.now();
    return diff > 0 && diff < 48 * 3600 * 1000;
  }).length;
  const confirmedCount = bookings.filter((b) => b.status === "confirmed").length;

  function exportCsv() {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookport-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    // h-[calc(100vh-3rem)] + flex-col: header/cards/filters never scroll,
    // only the table body area does. This is what keeps "+ New Booking"
    // and the KPI cards fixed instead of sliding off with the table.
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Booking & Instructions</h1>
          <p className="text-sm text-slate-400">Source of truth — click any cell to edit</p>
        </div>
        <Link href="/bookings/new" className="bg-accent text-white px-4 py-2.5 rounded-lg text-sm font-medium shrink-0">
          + New Booking
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 shrink-0">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide">Total Bookings</div>
          <div className="text-2xl font-semibold mt-1">{total}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide">Cut-off within 48h</div>
          <div className="text-2xl font-semibold mt-1 text-cutoff">{cutoffSoonCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide">Confirmed</div>
          <div className="text-2xl font-semibold mt-1">{confirmedCount}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 shrink-0">
        <select value={line} onChange={(e) => setLine(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="all">All Lines</option>
          {lines.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={destination} onChange={(e) => setDestination(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="all">All Destinations</option>
          {destinations.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          onClick={() => setCutoffSoonOnly(!cutoffSoonOnly)}
          className={`border rounded-lg px-3 py-2 text-sm ${cutoffSoonOnly ? "bg-accent text-white border-accent" : "bg-white"}`}
        >
          Cut off within 3 days
        </button>
        <button onClick={exportCsv} className="ml-auto border rounded-lg px-3 py-2 text-sm bg-white hover:bg-slate-50">
          ⬇ Export CSV
        </button>
      </div>

      {/* This is the ONLY element that scrolls horizontally - everything above stays put */}
      <div className="bg-white rounded-xl shadow-sm flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400 border-b bg-slate-50 sticky top-0">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.column} className="px-3 py-2.5 font-medium whitespace-nowrap">{c.label}</th>
              ))}
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Open</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => {
              const cutoffSoon =
                b.cargo_cutoff && new Date(b.cargo_cutoff).getTime() - Date.now() < 48 * 3600 * 1000;
              return (
                <tr key={b.id} className="border-b last:border-0">
                  {COLUMNS.map((c) => (
                    <EditableCell
                      key={c.column}
                      bookingId={b.id}
                      column={c.column}
                      value={b[c.column] as string | null}
                      isDate={c.isDate}
                      highlight={c.column === "cargo_cutoff" && !!cutoffSoon}
                    />
                  ))}
                  <td className="px-3 py-2">
                    <Link href={`/bookings/${b.id}`} className="text-blue-600 hover:underline text-sm whitespace-nowrap">
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="p-8 text-center text-slate-400">
                  {total === 0 ? "No bookings yet. Upload a PDF or add one manually." : "No bookings match these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
