"use client";

import { useState } from "react";

// One cell = one container slot on a booking (container_id null means this
// booking has no container row yet -- the very first row, "booking number
// + null container", see migration 0011). Typing a number here either
// creates that first container row or edits the existing one. The "+"
// button adds ANOTHER container slot to the same booking, which is what
// produces the "same booking number, multiple rows" pattern for
// multi-container bookings.
//
// Setting a real container number fires the DB trigger that syncs a
// matching row into Shipment Tracking (migration 0011) -- nothing else to
// do here for that part.
export default function ContainerCell({
  bookingId,
  containerId,
  value,
  onSaved,
  onAddContainer,
}: {
  bookingId: string;
  containerId: string | null;
  value: string | null;
  onSaved: (containerId: string, containerNo: string | null) => void;
  onAddContainer: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (containerId) {
        const res = await fetch(`/api/bookings/${bookingId}/containers/${containerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ container_no: val }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Save failed");
        onSaved(json.container.id, json.container.container_no);
      } else {
        const res = await fetch(`/api/bookings/${bookingId}/containers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ container_no: val }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Save failed");
        onSaved(json.container.id, json.container.container_no);
      }
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <td className="px-3 py-2 text-sm whitespace-nowrap group text-ink/80">
        <span className="inline-flex items-center gap-1.5">
          {value || "—"}
          <button
            onClick={() => setEditing(true)}
            title="Edit Container Number"
            className="opacity-0 group-hover:opacity-100 text-ink/30 hover:text-accent transition-opacity"
          >
            ✎
          </button>
          <button
            onClick={onAddContainer}
            title="Add another container to this booking"
            className="opacity-0 group-hover:opacity-100 text-ink/30 hover:text-accent transition-opacity"
          >
            +
          </button>
        </span>
      </td>
    );
  }

  return (
    <td className="px-3 py-2 min-w-[160px]">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          className="border border-accent rounded px-1.5 py-1 text-sm w-full"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="text-xs bg-ink text-white px-2 py-1 rounded shrink-0">
          {saving ? "…" : "✓"}
        </button>
        <button onClick={() => setEditing(false)} title="Close" className="text-xs border px-2 py-1 rounded shrink-0">
          ✕
        </button>
      </div>
      {error && <div className="text-xs text-cutoff mt-1">{error}</div>}
    </td>
  );
}
