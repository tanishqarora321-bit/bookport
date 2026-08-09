"use client";

import { useState } from "react";
import Link from "next/link";

type TrackingRow = {
  id: string;
  booking_id: string | null;
  party_id: string | null;
  item_id: string | null;
  consignee_as_per_bl: string | null;
  invoice_no: string | null;
  booking_number: string | null;
  container_number: string | null;
  eta: string | null;
  forwarder_name: string | null;
  release_status: string | null;
  shipping_line: string | null;
  invoice_sent: boolean;
  documents_sent: boolean;
  remarks: string | null;
  bl_number: string | null;
  bl_status: "Y" | "N";
  ocean_freight: number | null;
  ocean_freight_currency: string | null;
  last_tracking_check_at: string | null;
};

type Booking = { id: string; booking_no: string; carrier_booking_no: string | null; carrier: string | null; forwarder_name: string | null };
type Party = { id: string; legal_name: string; short_code: string | null };
type Item = { id: string; name: string };

const CURRENCIES = ["USD", "INR", "EUR", "GBP", "AED"];

async function patchRow(id: string, updates: Record<string, any>) {
  const res = await fetch(`/api/tracking/${id}`, {
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

export default function TrackingClient({
  initialTracking,
  unassignedBookings,
  parties,
  items,
}: {
  initialTracking: TrackingRow[];
  unassignedBookings: Booking[];
  parties: Party[];
  items: Item[];
}) {
  const [rows, setRows] = useState(initialTracking);
  const [remainingBookings, setRemainingBookings] = useState(unassignedBookings);
  const [assigning, setAssigning] = useState(false);

  function updateRowLocal(id: string, patch: Partial<TrackingRow>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">Shipment Tracking</h1>
        <button
          onClick={() => setAssigning(true)}
          className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium"
        >
          + Assign Booking
        </button>
      </div>

      {assigning && (
        <AssignPanel
          bookings={remainingBookings}
          parties={parties}
          items={items}
          onClose={() => setAssigning(false)}
          onCreated={(row, bookingId) => {
            setRows([row, ...rows]);
            setRemainingBookings(remainingBookings.filter((b) => b.id !== bookingId));
            setAssigning(false);
          }}
        />
      )}

      <div className="flex-1 overflow-auto border rounded">
        <table className="text-sm border-collapse min-w-[2000px]">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr className="text-left text-ink/50 border-b">
              <Th>Party</Th>
              <Th>Consignee as per BL</Th>
              <Th>Invoice No.</Th>
              <Th>Booking No.</Th>
              <Th>Container No.</Th>
              <Th>ETA</Th>
              <Th>Forwarder</Th>
              <Th>Release Status</Th>
              <Th>Shipping Line</Th>
              <Th>Invoice Sent</Th>
              <Th>Docs Sent</Th>
              <Th>Remarks</Th>
              <Th>BL Number</Th>
              <Th>BL Status</Th>
              <Th>Ocean Freight</Th>
              <Th>Last Checked</Th>
              <Th>Docs</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <TrackingRowView
                key={row.id}
                row={row}
                parties={parties}
                onChange={(patch) => updateRowLocal(row.id, patch)}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={17} className="px-3 py-10 text-center text-ink/40">
                  No shipments tracked yet. Click "+ Assign Booking" to start tracking one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 whitespace-nowrap font-medium">{children}</th>;
}

// ---------------- Assignment panel ----------------

function AssignPanel({
  bookings,
  parties,
  items,
  onClose,
  onCreated,
}: {
  bookings: Booking[];
  parties: Party[];
  items: Item[];
  onClose: () => void;
  onCreated: (row: TrackingRow, bookingId: string) => void;
}) {
  const [bookingId, setBookingId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [itemId, setItemId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!bookingId || !partyId) {
      setError("Booking and Party are both required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, party_id: partyId, item_id: itemId || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create tracking entry");
      onCreated(json.tracking, bookingId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-accent/30 bg-accent/5 rounded p-4 mb-4 grid grid-cols-3 gap-3">
      <select className="border rounded px-2 py-1.5 text-sm" value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
        <option value="">Select booking…</option>
        {bookings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.carrier_booking_no || b.booking_no} {b.carrier ? `(${b.carrier})` : ""}
          </option>
        ))}
      </select>
      <select className="border rounded px-2 py-1.5 text-sm" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
        <option value="">Select party…</option>
        {parties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.legal_name}
          </option>
        ))}
      </select>
      <select className="border rounded px-2 py-1.5 text-sm" value={itemId} onChange={(e) => setItemId(e.target.value)}>
        <option value="">Select item category…</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      {bookings.length === 0 && (
        <div className="col-span-3 text-xs text-ink/50">
          No unassigned bookings available — every booking already has a tracking entry.
        </div>
      )}
      {parties.length === 0 && (
        <div className="col-span-3 text-xs text-cutoff">
          No accounts yet — add one under Buyers / Customers first.
        </div>
      )}
      {error && <div className="col-span-3 text-xs text-cutoff">{error}</div>}
      <div className="col-span-3 flex gap-2">
        <button onClick={create} disabled={saving} className="text-sm bg-ink text-white px-3 py-1.5 rounded">
          {saving ? "Creating…" : "Create Tracking Entry"}
        </button>
        <button onClick={onClose} className="text-sm border px-3 py-1.5 rounded">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------- One row ----------------

function TrackingRowView({
  row,
  parties,
  onChange,
}: {
  row: TrackingRow;
  parties: Party[];
  onChange: (patch: Partial<TrackingRow>) => void;
}) {
  const party = parties.find((p) => p.id === row.party_id);
  const [genLoading, setGenLoading] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  async function generateInvoiceNumber() {
    if (!row.party_id) return;
    setGenLoading(true);
    setRowError(null);
    try {
      const res = await fetch("/api/tracking/generate-invoice-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ party_id: row.party_id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not generate invoice number");
      await patchRow(row.id, { invoice_no: json.invoice_no });
      onChange({ invoice_no: json.invoice_no });
    } catch (err: any) {
      setRowError(err.message);
    } finally {
      setGenLoading(false);
    }
  }

  return (
    <tr className="border-b hover:bg-blue-50/30">
      <Td>{party?.legal_name || "—"}</Td>
      <EditableTd
        value={row.consignee_as_per_bl}
        onSave={(v) => patchRow(row.id, { consignee_as_per_bl: v }).then(() => onChange({ consignee_as_per_bl: v }))}
      />
      <td className="px-3 py-2 whitespace-nowrap">
        {row.invoice_no ? (
          <EditableTd asInline value={row.invoice_no} onSave={(v) => patchRow(row.id, { invoice_no: v }).then(() => onChange({ invoice_no: v }))} />
        ) : (
          <button
            onClick={generateInvoiceNumber}
            disabled={genLoading || !row.party_id}
            className="text-xs bg-ink text-white px-2 py-1 rounded"
          >
            {genLoading ? "…" : "Generate"}
          </button>
        )}
        {rowError && <div className="text-xs text-cutoff">{rowError}</div>}
      </td>
      <Td>{row.booking_number || "—"}</Td>
      <EditableTd value={row.container_number} onSave={(v) => patchRow(row.id, { container_number: v }).then(() => onChange({ container_number: v }))} />
      <EditableTd
        value={row.eta}
        isDate
        onSave={(v) => patchRow(row.id, { eta: v }).then(() => onChange({ eta: v }))}
      />
      <Td>{row.forwarder_name || "—"}</Td>
      <EditableTd value={row.release_status} onSave={(v) => patchRow(row.id, { release_status: v }).then(() => onChange({ release_status: v }))} />
      <Td>{row.shipping_line || "—"}</Td>
      <SentToggleTd
        value={row.invoice_sent}
        onToggle={(v) => patchRow(row.id, { invoice_sent: v }).then(() => onChange({ invoice_sent: v }))}
      />
      <SentToggleTd
        value={row.documents_sent}
        onToggle={(v) => patchRow(row.id, { documents_sent: v }).then(() => onChange({ documents_sent: v }))}
      />
      <EditableTd value={row.remarks} onSave={(v) => patchRow(row.id, { remarks: v }).then(() => onChange({ remarks: v }))} />
      <EditableTd value={row.bl_number} onSave={(v) => patchRow(row.id, { bl_number: v }).then(() => onChange({ bl_number: v }))} />
      <td className="px-3 py-2">
        <button
          onClick={() => {
            const next = row.bl_status === "Y" ? "N" : "Y";
            patchRow(row.id, { bl_status: next }).then(() => onChange({ bl_status: next }));
          }}
          className={`text-xs px-2 py-1 rounded font-medium ${
            row.bl_status === "Y" ? "bg-green-100 text-green-700" : "bg-slate-100 text-ink/50"
          }`}
        >
          {row.bl_status}
        </button>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <OceanFreightCell row={row} onChange={onChange} />
      </td>
      <Td>
        {row.last_tracking_check_at
          ? new Date(row.last_tracking_check_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
          : "Not checked yet"}
      </Td>
      <td className="px-3 py-2">
        <Link href={`/tracking/${row.id}/documents`} className="text-xs text-accent underline">
          Invoice →
        </Link>
      </td>
    </tr>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 whitespace-nowrap text-ink/80">{children}</td>;
}

function SentToggleTd({ value, onToggle }: { value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <td className="px-3 py-2">
      <button
        onClick={() => onToggle(!value)}
        className={`text-xs px-2 py-1 rounded font-medium ${
          value ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {value ? "Sent" : "Pending"}
      </button>
    </td>
  );
}

function OceanFreightCell({ row, onChange }: { row: TrackingRow; onChange: (patch: Partial<TrackingRow>) => void }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(row.ocean_freight?.toString() ?? "");
  const [currency, setCurrency] = useState(row.ocean_freight_currency ?? "USD");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await patchRow(row.id, { ocean_freight: amount ? Number(amount) : null, ocean_freight_currency: currency });
      onChange({ ocean_freight: amount ? Number(amount) : null, ocean_freight_currency: currency });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span onClick={() => setEditing(true)} className="cursor-text hover:bg-blue-50 px-1 rounded">
        {row.ocean_freight ? `${row.ocean_freight_currency ?? ""} ${row.ocean_freight}` : "—"}
      </span>
    );
  }

  return (
    <div className="flex gap-1 items-center">
      <input
        autoFocus
        type="number"
        className="w-20 border border-accent rounded px-1 py-0.5 text-sm"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <select className="border rounded px-1 py-0.5 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value)}>
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button onClick={save} disabled={saving} className="text-xs bg-ink text-white px-1.5 py-0.5 rounded">
        {saving ? "…" : "✓"}
      </button>
      <button onClick={() => setEditing(false)} className="text-xs border px-1.5 py-0.5 rounded">
        ✕
      </button>
    </div>
  );
}

// ---------------- Generic editable cell (click to edit, explicit save) ----------------

function EditableTd({
  value,
  onSave,
  isDate = false,
  asInline = false,
}: {
  value: string | null;
  onSave: (v: string) => Promise<any> | any;
  isDate?: boolean;
  asInline?: boolean;
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

  const display = value ? (isDate ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : value) : "—";

  const content = !editing ? (
    <span onClick={() => setEditing(true)} className="cursor-text hover:bg-blue-50 px-1 rounded block">
      {display}
    </span>
  ) : (
    <div className="flex gap-1 items-center">
      <input
        autoFocus
        type={isDate ? "date" : "text"}
        className="border border-accent rounded px-1.5 py-0.5 text-sm w-32"
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
  );

  return asInline ? <>{content}</> : <td className="px-3 py-2 whitespace-nowrap">{content}</td>;
}
