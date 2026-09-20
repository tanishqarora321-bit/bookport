"use client";

import { useState } from "react";
import StatusPill from "@/components/ui/StatusPill";

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
      <td className="px-3 py-2 text-sm whitespace-nowrap group">
        <span className="inline-flex items-center gap-1.5">
          <StatusPill value={value} />
          <button
            onClick={() => { setVal(value); setEditing(true); }}
            title="Edit status"
            className="opacity-0 group-hover:opacity-100 text-ink/30 hover:text-accent transition-opacity"
          >
            ✎
          </button>
        </span>
      </td>
    );
  }

  return (
    <td className="px-3 py-2 min-w-[170px]">
      <div className="flex items-center gap-1">
        <select
          autoFocus
          className="border border-accent rounded px-1.5 py-1 text-sm flex-1"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={saving}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <button onClick={save} disabled={saving} className="text-xs bg-ink text-white px-2 py-1 rounded shrink-0">
          {saving ? "…" : "✓"}
        </button>
        <button onClick={() => setEditing(false)} disabled={saving} title="Close" className="text-xs border px-2 py-1 rounded shrink-0">
          ✕
        </button>
      </div>
      {error && <div className="text-xs text-cutoff mt-1">{error}</div>}
    </td>
  );
}
