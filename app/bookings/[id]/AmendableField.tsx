"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AmendableField({
  bookingId, field, label, value, version
}: { bookingId: string; field: string; label: string; value: string | null; version: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [newValue, setNewValue] = useState(value ?? "");
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  async function preview() {
    setSaving(true);
    const res = await fetch("/api/amendments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_id: bookingId, field, new_value: newValue, reason, __previewOnly: false })
    });
    const json = await res.json();
    setSaving(false);
    if (res.ok) {
      setImpact(json.impact);
      if (json.impact.length === 0) {
        setEditing(false);
        router.refresh();
      }
    }
  }

  return (
    <div>
      <label className="text-xs text-slate-400">{label}</label>
      {!editing ? (
        <div className="flex items-center justify-between group">
          <span className="text-sm">
            {value ? new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
          </span>
          <button onClick={() => setEditing(true)} className="text-xs text-blue-600 opacity-0 group-hover:opacity-100">
            amend
          </button>
        </div>
      ) : (
        <div className="border rounded p-2 bg-amber-50 space-y-2 mt-1">
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="New value"
          />
          <input
            className="w-full border rounded px-2 py-1 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required for the amendment log)"
          />
          {impact && impact.length > 0 && (
            <div className="text-xs text-amend bg-amber-100 rounded p-2 space-y-1">
              <div className="font-semibold">This change breaks:</div>
              {impact.map((i, idx) => <div key={idx}>• {i}</div>)}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={preview}
              disabled={saving || !reason}
              className="text-xs bg-ink text-white px-3 py-1 rounded disabled:opacity-40"
            >
              {impact ? "Save anyway (v" + (version + 1) + ")" : saving ? "Checking…" : "Check & Save"}
            </button>
            <button onClick={() => { setEditing(false); setImpact(null); }} className="text-xs px-3 py-1 rounded border">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
