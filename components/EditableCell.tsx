"use client";

import { useState } from "react";

function formatDate(value: string, isDateTime: boolean) {
  const d = new Date(value);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    ...(isDateTime ? { hour: "2-digit", minute: "2-digit" } : {})
  });
}

export default function EditableCell({
  bookingId, column, value, isDate = false, highlight = false
}: { bookingId: string; column: string; value: string | null; isDate?: boolean; highlight?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Explicit Save/Cancel now, not save-on-blur. Blur is unreliable with the
  // browser's native date-picker popup - closing the calendar doesn't
  // consistently fire blur the way a plain text field does, so edits were
  // silently getting lost. This also now actually checks the response
  // instead of reloading unconditionally, so a failed save shows an error
  // instead of quietly discarding your change.
  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [column]: val })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      window.location.reload();
    } catch (err: any) {
      setSaving(false);
      setError(err.message);
    }
  }

  function cancel() {
    setVal(value ?? "");
    setEditing(false);
    setError(null);
  }

  const display = value ? (isDate ? formatDate(value, value.includes("T")) : value) : "—";

  if (!editing) {
    return (
      <td
        onClick={() => setEditing(true)}
        className={`px-3 py-2 text-sm cursor-text hover:bg-blue-50 whitespace-nowrap ${highlight ? "text-cutoff font-medium" : ""}`}
        title="Click to edit"
      >
        {display}
      </td>
    );
  }

  return (
    <td className="px-3 py-2 min-w-[180px]">
      <input
        autoFocus
        type={isDate ? "datetime-local" : "text"}
        className="w-full border border-accent rounded px-1.5 py-1 text-sm"
        value={isDate && val ? val.slice(0, 16) : val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        disabled={saving}
      />
      <div className="flex gap-2 mt-1">
        <button onClick={save} disabled={saving} className="text-xs bg-ink text-white px-2 py-0.5 rounded">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={cancel} disabled={saving} className="text-xs border px-2 py-0.5 rounded">
          Cancel
        </button>
      </div>
      {error && <div className="text-xs text-cutoff mt-1">{error}</div>}
    </td>
  );
}
