"use client";

import { useState } from "react";
import { PencilIcon, CheckIcon, CloseIcon } from "@/components/EditableCell";

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
      <td>
        <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className={value ? "" : "dash"}>{value || "—"}</span>
          <button onClick={() => setEditing(true)} aria-label="Edit Container Number" className="pen" style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", display: "inline-flex" }}>
            <PencilIcon />
          </button>
          <button
            onClick={onAddContainer}
            aria-label={`Add another container to ${value ?? "this booking"}`}
            className="ib"
            style={{ width: 24, height: 24, borderColor: "var(--line)" }}
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </span>
      </td>
    );
  }

  return (
    <td style={{ minWidth: 160 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          autoFocus
          className="input input-s mono"
          style={{ width: "auto", flex: 1, borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accentS)" }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} aria-label="Save" className="ib" style={{ background: "var(--accent)", color: "var(--onAccent)" }}>
          <CheckIcon />
        </button>
        <button onClick={() => setEditing(false)} aria-label="Close" className="ib">
          <CloseIcon />
        </button>
      </div>
      {error && <div className="err" style={{ marginTop: 4 }}>{error}</div>}
    </td>
  );
}
