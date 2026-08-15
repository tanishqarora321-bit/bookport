"use client";

import { useState } from "react";

function formatDate(value: string, isDateTime: boolean) {
  const d = new Date(value);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    ...(isDateTime ? { hour: "2-digit", minute: "2-digit" } : {})
  });
}

// SECURITY/UX FIX: editing used to open on a plain click anywhere in the
// cell, which meant a stray click while just reading the table could put
// a cell into edit mode. Now the display state renders plain text with a
// pencil icon that only shows on hover -- editing opens ONLY from clicking
// that pencil, never from clicking the cell itself.
export default function EditableCell({
  bookingId, column, value, isDate = false, highlight = false
}: { bookingId: string; column: string; value: string | null; isDate?: boolean; highlight?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <td className={`px-3 py-2 text-sm whitespace-nowrap group ${highlight ? "text-cutoff font-medium" : "text-ink/80"}`}>
        <span className="inline-flex items-center gap-1.5">
          {display}
          <button
            onClick={() => setEditing(true)}
            title="Edit"
            className="opacity-0 group-hover:opacity-100 text-ink/30 hover:text-accent transition-opacity"
          >
            ✎
          </button>
        </span>
      </td>
    );
  }

  return (
    <td className="px-3 py-2 min-w-[180px]">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type={isDate ? "datetime-local" : "text"}
          className="w-full border border-accent rounded px-1.5 py-1 text-sm"
          value={isDate && val ? val.slice(0, 16) : val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="text-xs bg-ink text-white px-2 py-1 rounded shrink-0">
          {saving ? "…" : "✓"}
        </button>
        <button onClick={cancel} disabled={saving} title="Close" className="text-xs border px-2 py-1 rounded shrink-0">
          ✕
        </button>
      </div>
      {error && <div className="text-xs text-cutoff mt-1">{error}</div>}
    </td>
  );
}
