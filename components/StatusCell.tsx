"use client";

import { useState } from "react";
import StatusPill from "@/components/ui/StatusPill";
import { PencilIcon, CheckIcon, CloseIcon } from "@/components/EditableCell";

// Must match the bookings.status check constraint (migration 0001) and
// the "All Status" filter list already in BookingsClient.tsx.
const STATUSES = ["draft", "confirmed", "in_transit", "delivered", "cancelled"];

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function StatusCell({
  bookingId, value, onChanged
}: { bookingId: string; value: string; onChanged: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: val })
      });
      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON body, fall through to status */ }
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      onChanged(val);
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
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <StatusPill value={value} />
          <button
            onClick={() => { setVal(value); setEditing(true); }}
            aria-label="Edit status"
            className="pen"
            style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", display: "inline-flex" }}
          >
            <PencilIcon />
          </button>
        </span>
      </td>
    );
  }

  return (
    <td style={{ minWidth: 170 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <select
          autoFocus
          className="select select-s"
          style={{ width: "auto", flex: 1, borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accentS)" }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={saving}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <button onClick={save} disabled={saving} aria-label="Save" className="ib" style={{ background: "var(--accent)", color: "var(--onAccent)" }}>
          <CheckIcon />
        </button>
        <button onClick={() => setEditing(false)} disabled={saving} aria-label="Close" className="ib">
          <CloseIcon />
        </button>
      </div>
      {error && <div className="err" style={{ marginTop: 4 }}>{error}</div>}
    </td>
  );
}
