"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";

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
  forwarder_id: string | null;
  forwarder: { legal_name: string } | null;
  release_status: string | null;
  shipping_line: string | null;
  invoice_sent: boolean;
  documents_sent: boolean;
  remarks: string | null;
  bl_number: string | null;
  bl_status: "Y" | "N";
  last_tracking_check_at: string | null;
};

type Booking = { id: string; booking_no: string; carrier_booking_no: string | null; carrier: string | null; forwarder_name: string | null };
type Forwarder = { id: string; legal_name: string };
type Party = { id: string; legal_name: string; short_code: string | null };
type Item = { id: string; name: string };

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

// Client-side-only quick filters (pre-approved addition, no new API calls).
const FILTER_CHIPS = [
  { id: "invoice", label: "Invoice pending" },
  { id: "docs", label: "Docs pending" },
  { id: "bl", label: "BL pending" },
] as const;
type FilterChipId = (typeof FILTER_CHIPS)[number]["id"];

export default function TrackingClient({
  initialTracking,
  unassignedBookings,
  parties,
  items,
  forwarders,
}: {
  initialTracking: TrackingRow[];
  unassignedBookings: Booking[];
  parties: Party[];
  items: Item[];
  forwarders: Forwarder[];
}) {
  const [rows, setRows] = useState(initialTracking);
  const [remainingBookings, setRemainingBookings] = useState(unassignedBookings);
  const [assigning, setAssigning] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<FilterChipId>>(new Set());

  function updateRowLocal(id: string, patch: Partial<TrackingRow>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const invoicePendingCount = useMemo(() => rows.filter((r) => !r.invoice_sent).length, [rows]);
  const docsPendingCount = useMemo(() => rows.filter((r) => !r.documents_sent).length, [rows]);
  const blPendingCount = useMemo(() => rows.filter((r) => r.bl_status !== "Y").length, [rows]);

  const chipCounts: Record<FilterChipId, number> = {
    invoice: invoicePendingCount,
    docs: docsPendingCount,
    bl: blPendingCount,
  };

  // Client-side filtering over the already-fetched rows. No new fetch.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeFilters.has("invoice") && row.invoice_sent) return false;
      if (activeFilters.has("docs") && row.documents_sent) return false;
      if (activeFilters.has("bl") && row.bl_status === "Y") return false;
      if (!q) return true;
      const party = parties.find((p) => p.id === row.party_id);
      const haystack = [
        party?.legal_name,
        row.consignee_as_per_bl,
        row.invoice_no,
        row.booking_number,
        row.container_number,
        row.bl_number,
      ]
        .filter((v): v is string => Boolean(v))
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, activeFilters, parties]);

  function toggleFilter(id: FilterChipId) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setActiveFilters(new Set());
  }

  const hasActiveSearch = search.trim().length > 0 || activeFilters.size > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h1">Shipment Tracking</h1>
          <p className="sub">Every booking assigned to a buyer, from loading to release</p>
        </div>
        <button type="button" onClick={() => setAssigning((a) => !a)} aria-expanded={assigning} className="btn btn-p">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Assign Booking
        </button>
      </div>

      <section aria-label="Tracking totals" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <div className="card kpi">
          <span className="lbl">Tracked Shipments</span>
          <span className="v">{rows.length}</span>
        </div>
        <KpiTile label="Invoice Pending" value={invoicePendingCount} caption="Invoice not sent to buyer" />
        <KpiTile label="Docs Pending" value={docsPendingCount} caption="Document set not sent" />
        <KpiTile label="BL Pending" value={blPendingCount} caption="BL Status is N" />
      </section>

      {assigning && (
        <AssignPanel
          bookings={remainingBookings}
          parties={parties}
          items={items}
          forwarders={forwarders}
          onClose={() => setAssigning(false)}
          onCreated={(row, bookingId) => {
            setRows([row, ...rows]);
            setRemainingBookings(remainingBookings.filter((b) => b.id !== bookingId));
            setAssigning(false);
          }}
        />
      )}

      <section className="card" aria-label="Tracked shipments" style={{ overflow: "hidden" }}>
        <div className="flex flex-wrap items-center gap-2.5" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <label
            style={{
              flex: "0 1 340px",
              minWidth: 220,
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 36,
              padding: "0 10px",
              border: "1px solid var(--line2)",
              borderRadius: 9,
              background: "var(--surf)",
            }}
          >
            <SearchIcon />
            <span className="sr">Search tracking</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search party, booking, container, BL…"
              style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", font: "inherit", fontSize: 13, color: "var(--tx)" }}
            />
          </label>
          {FILTER_CHIPS.map((c) => {
            const active = activeFilters.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`chip ${active ? "on" : ""}`}
                aria-pressed={active}
                onClick={() => toggleFilter(c.id)}
              >
                {c.label} <span className="num" style={{ color: "var(--tx2)" }}>{chipCounts[c.id]}</span>
              </button>
            );
          })}
          {hasActiveSearch && (
            <button type="button" className="btn btn-xs btn-g" onClick={clearFilters}>
              Clear filters
            </button>
          )}
          <div style={{ flex: 1 }} />
          <span className="meta">
            Showing {filteredRows.length} of {rows.length}
          </span>
        </div>
        <div className="tw" style={{ maxHeight: 560 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th className="stk" style={{ width: 56, zIndex: 3 }}>Sr. No.</th>
                <th className="stk2" style={{ zIndex: 3 }}>Party</th>
                <th>Consignee as per BL</th>
                <th>Invoice No.</th>
                <th>Booking No.</th>
                <th>Container No.</th>
                <th>ETA</th>
                <th>Forwarder</th>
                <th>Release Status</th>
                <th>Shipping Line</th>
                <th>Invoice Sent</th>
                <th>Docs Sent</th>
                <th>Remarks</th>
                <th>BL Number</th>
                <th>BL Status</th>
                <th>Last Checked</th>
                <th>Docs</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, idx) => (
                <TrackingRowView
                  key={row.id}
                  sr={idx + 1}
                  row={row}
                  parties={parties}
                  onChange={(patch) => updateRowLocal(row.id, patch)}
                />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={17} className="p-0">
                    <EmptyState
                      icon={MapPin}
                      title="No shipments tracked yet"
                      hint='Click "+ Assign Booking" above to link a booking to a party and start tracking it.'
                    />
                  </td>
                </tr>
              )}
              {rows.length > 0 && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={17} style={{ padding: "32px 16px", textAlign: "center" }}>
                    <span className="lbl">No shipments match your search or filters.</span>{" "}
                    <button type="button" className="btn btn-xs" onClick={clearFilters}>
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--line)", background: "var(--surf2)" }}>
          <span className="meta">Click any value with a pencil to edit · Invoice No. is generated from the Buyer ledger</span>
        </div>
      </section>
    </div>
  );
}

function KpiTile({ label, value, caption }: { label: string; value: number; caption: string }) {
  const pending = value > 0;
  return (
    <div className="card kpi">
      <span className="lbl">{label}</span>
      <span className="v" style={pending ? { color: "var(--warn)" } : undefined}>
        {value}
      </span>
      {pending && (
        <span className="meta" style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <WarnIcon /> {caption}
        </span>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tx2)" strokeWidth={2} strokeLinecap="round">
      <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l10 18H2zM12 10v4" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg className="pen" aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

// ---------------- Assignment panel ----------------

function AssignPanel({
  bookings,
  parties,
  items,
  forwarders,
  onClose,
  onCreated,
}: {
  bookings: Booking[];
  parties: Party[];
  items: Item[];
  forwarders: Forwarder[];
  onClose: () => void;
  onCreated: (row: TrackingRow, bookingId: string) => void;
}) {
  const [bookingId, setBookingId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [itemId, setItemId] = useState("");
  const [forwarderId, setForwarderId] = useState("");
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
        body: JSON.stringify({ booking_id: bookingId, party_id: partyId, item_id: itemId || null, forwarder_id: forwarderId || null }),
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

  const bookingInvalid = Boolean(error) && !bookingId;
  const partyInvalid = Boolean(error) && !partyId;

  return (
    <section className="card" aria-labelledby="assign-heading" style={{ padding: "18px 20px", border: "1.5px solid var(--accent)", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 id="assign-heading" className="h2">Assign Booking</h2>
          <div className="meta" style={{ marginTop: 3 }}>Links a booking to a party and starts tracking it. Booking and Party are required.</div>
        </div>
        <button type="button" className="ib" aria-label="Close assign panel" onClick={onClose}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        <div className="field">
          <label htmlFor="assign-booking">
            Booking <span className="req">*</span>
          </label>
          <select
            id="assign-booking"
            className={`select ${bookingInvalid ? "is-err" : ""}`}
            aria-invalid={bookingInvalid}
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
          >
            <option value="">Select booking…</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.carrier_booking_no || b.booking_no} {b.carrier ? `(${b.carrier})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="assign-party">
            Party <span className="req">*</span>
          </label>
          <select
            id="assign-party"
            className={`select ${partyInvalid ? "is-err" : ""}`}
            aria-invalid={partyInvalid}
            aria-describedby={error ? "assign-error" : undefined}
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
          >
            <option value="">Select party…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.legal_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="assign-item">Item category</label>
          <select id="assign-item" className="select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Select item category…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="assign-forwarder">Forwarder</label>
          <select id="assign-forwarder" className="select" value={forwarderId} onChange={(e) => setForwarderId(e.target.value)}>
            <option value="">Select forwarder…</option>
            {forwarders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.legal_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {bookings.length === 0 && <div className="meta">No unassigned bookings available — every booking already has a tracking entry.</div>}
      {parties.length === 0 && <div className="err">No accounts yet — add one under Buyers / Customers first.</div>}
      {error && (
        <div id="assign-error" className="err" role="alert">
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-p" onClick={create} disabled={saving}>
          {saving ? "Creating…" : "Create Tracking Entry"}
        </button>
      </div>
    </section>
  );
}

// ---------------- One row ----------------

function releaseStatusBadgeClass(value: string) {
  if (value === "On Water") return "b-info";
  if (value === "Released") return "b-ok";
  return "b-neu";
}

function TrackingRowView({
  sr,
  row,
  parties,
  onChange,
}: {
  sr: number;
  row: TrackingRow;
  parties: Party[];
  onChange: (patch: Partial<TrackingRow>) => void;
}) {
  const party = parties.find((p) => p.id === row.party_id);

  return (
    <tr>
      <td className="stk num" style={{ width: 56, color: "var(--tx2)" }}>{sr}</td>
      <td className="stk2" style={{ fontWeight: 600 }}>{party?.legal_name || <span className="dash">—</span>}</td>
      <EditableTd
        value={row.consignee_as_per_bl}
        onSave={(v) => patchRow(row.id, { consignee_as_per_bl: v }).then(() => onChange({ consignee_as_per_bl: v }))}
      />
      {/* Invoice Number is generated from Buyers & Customers' Generate
          Invoice (which writes it onto this tracking row) - populates
          here automatically, no separate "Generate" button of its own
          anymore. Still correctable by hand once set. */}
      <td>
        {row.invoice_no ? (
          <EditableTd asInline mono value={row.invoice_no} onSave={(v) => patchRow(row.id, { invoice_no: v }).then(() => onChange({ invoice_no: v }))} />
        ) : (
          <span className="dash" title="Generated from the Buyer ledger">—</span>
        )}
      </td>
      <td className="mono">{row.booking_number || <span className="dash">—</span>}</td>
      <EditableTd mono value={row.container_number} onSave={(v) => patchRow(row.id, { container_number: v }).then(() => onChange({ container_number: v }))} />
      <EditableTd
        value={row.eta}
        isDate
        numeric
        onSave={(v) => patchRow(row.id, { eta: v }).then(() => onChange({ eta: v }))}
      />
      <td>{row.forwarder?.legal_name || row.forwarder_name || <span className="dash">—</span>}</td>
      <EditableTd
        value={row.release_status}
        onSave={(v) => patchRow(row.id, { release_status: v }).then(() => onChange({ release_status: v }))}
        renderDisplay={(v) => (v ? <span className={`badge ${releaseStatusBadgeClass(v)}`}>{v}</span> : <span className="dash">—</span>)}
      />
      <td>{row.shipping_line || <span className="dash">—</span>}</td>
      <td>
        <button
          type="button"
          className={`badge ${row.invoice_sent ? "b-ok" : "b-warn"}`}
          aria-label={`Invoice Sent: ${row.invoice_sent ? "Sent" : "Pending"}. Click to toggle`}
          onClick={() => {
            const next = !row.invoice_sent;
            patchRow(row.id, { invoice_sent: next }).then(() => onChange({ invoice_sent: next }));
          }}
        >
          {row.invoice_sent ? "Sent" : "Pending"}
        </button>
      </td>
      <td>
        <button
          type="button"
          className={`badge ${row.documents_sent ? "b-ok" : "b-warn"}`}
          aria-label={`Docs Sent: ${row.documents_sent ? "Sent" : "Pending"}. Click to toggle`}
          onClick={() => {
            const next = !row.documents_sent;
            patchRow(row.id, { documents_sent: next }).then(() => onChange({ documents_sent: next }));
          }}
        >
          {row.documents_sent ? "Sent" : "Pending"}
        </button>
      </td>
      <EditableTd value={row.remarks} onSave={(v) => patchRow(row.id, { remarks: v }).then(() => onChange({ remarks: v }))} />
      <EditableTd mono value={row.bl_number} onSave={(v) => patchRow(row.id, { bl_number: v }).then(() => onChange({ bl_number: v }))} />
      <td>
        <button
          type="button"
          className={`badge ${row.bl_status === "Y" ? "b-ok" : "b-neu"}`}
          aria-label={`BL Status: ${row.bl_status}. Click to toggle`}
          onClick={() => {
            const next = row.bl_status === "Y" ? "N" : "Y";
            patchRow(row.id, { bl_status: next }).then(() => onChange({ bl_status: next }));
          }}
        >
          {row.bl_status}
        </button>
      </td>
      <td className="num" style={{ color: row.last_tracking_check_at ? "var(--tx2)" : "var(--mut)" }}>
        {row.last_tracking_check_at
          ? new Date(row.last_tracking_check_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
          : "Not checked yet"}
      </td>
      <td>
        <Link href={`/tracking/${row.id}/documents`} style={{ fontWeight: 500 }}>
          Invoice →
        </Link>
      </td>
    </tr>
  );
}

// ---------------- Generic editable cell (click to edit, explicit save) ----------------

function EditableTd({
  value,
  onSave,
  isDate = false,
  asInline = false,
  mono = false,
  numeric = false,
  renderDisplay,
}: {
  value: string | null;
  onSave: (v: string) => Promise<any> | any;
  isDate?: boolean;
  asInline?: boolean;
  mono?: boolean;
  numeric?: boolean;
  renderDisplay?: (value: string | null) => React.ReactNode;
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

  const display = value ? (isDate ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : value) : null;
  const displayClassName = [mono && "mono", numeric && "num"].filter(Boolean).join(" ") || undefined;

  const content = !editing ? (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="ec"
      style={{ background: "transparent", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "text", textAlign: "left" }}
      title="Click to edit"
    >
      {renderDisplay ? renderDisplay(value) : display ? <span className={displayClassName}>{display}</span> : <span className="dash">—</span>}
      <PenIcon />
    </button>
  ) : (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        autoFocus
        type={isDate ? "date" : "text"}
        className="input input-s"
        style={{ width: 140 }}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        disabled={saving}
      />
      <button type="button" onClick={save} disabled={saving} className="btn btn-xs" aria-label="Save">
        {saving ? "…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="btn btn-xs btn-g" aria-label="Cancel edit">
        Cancel
      </button>
      {error && <span className="err">{error}</span>}
    </div>
  );

  return asInline ? <>{content}</> : <td>{content}</td>;
}
