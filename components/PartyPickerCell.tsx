"use client";

import { useState } from "react";

type PartyOption = { id: string; legal_name: string };

// Single-select picker for Forwarder Name / Trucker Name / Supplier Name
// columns on Booking & Instructions. Reused across all three -- same
// underlying `parties` table filtered by role, same UX for all of them.
// "+ New" opens a small inline panel (with its own close button) to
// create a party of this role without leaving the page, then immediately
// assigns it -- same idea as a side window, just inline instead of a
// separate route, so it doesn't interrupt the booking edit flow.
export default function PartyPickerCell({
  bookingId,
  role,
  roleLabel,
  createEndpoint,
  responseKey,
  current,
  options,
  onAssigned,
  onCreated,
}: {
  bookingId: string;
  role: "forwarder" | "trucker" | "supplier" | "buyer";
  roleLabel: string;
  createEndpoint: string;
  responseKey: string;
  current: { id: string; name: string } | null;
  options: PartyOption[];
  onAssigned: (party: { id: string; name: string } | null) => void;
  onCreated: (party: PartyOption) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign(partyId: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/parties`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, party_id: partyId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to assign");
      const opt = options.find((o) => o.id === partyId);
      onAssigned(partyId ? { id: partyId, name: opt?.legal_name ?? "" } : null);
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function createNew() {
    if (!newName.trim()) {
      setError(`${roleLabel} name is required.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(createEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legal_name: newName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to create ${roleLabel.toLowerCase()}`);
      const created = json[responseKey];
      onCreated({ id: created.id, legal_name: created.legal_name });
      await assign(created.id);
      setCreating(false);
      setNewName("");
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <td className="px-3 py-2 text-sm whitespace-nowrap group text-ink/80">
        <span className="inline-flex items-center gap-1.5">
          {current?.name || "—"}
          <button
            onClick={() => setEditing(true)}
            title={`Edit ${roleLabel}`}
            className="opacity-0 group-hover:opacity-100 text-ink/30 hover:text-accent transition-opacity"
          >
            ✎
          </button>
        </span>
      </td>
    );
  }

  return (
    <td className="px-3 py-2 min-w-[220px]">
      {!creating ? (
        <div className="flex items-center gap-1">
          <select
            className="border border-accent rounded px-1.5 py-1 text-sm flex-1"
            defaultValue={current?.id ?? ""}
            onChange={(e) => assign(e.target.value || null)}
            disabled={saving}
          >
            <option value="">— none —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.legal_name}
              </option>
            ))}
          </select>
          <button onClick={() => setCreating(true)} className="text-xs border px-2 py-1 rounded shrink-0" title={`Add new ${roleLabel}`}>
            + New
          </button>
          <button onClick={() => setEditing(false)} title="Close" className="text-xs border px-2 py-1 rounded shrink-0">
            ✕
          </button>
        </div>
      ) : (
        <div className="border border-accent/40 bg-accent/5 rounded p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-ink/60">New {roleLabel}</span>
            <button onClick={() => setCreating(false)} title="Close" className="text-ink/40 hover:text-ink text-xs">
              ✕
            </button>
          </div>
          <div className="flex gap-1">
            <input
              autoFocus
              placeholder={`${roleLabel} name`}
              className="border rounded px-1.5 py-1 text-sm flex-1"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createNew()}
              disabled={saving}
            />
            <button onClick={createNew} disabled={saving} className="text-xs bg-ink text-white px-2 py-1 rounded shrink-0">
              {saving ? "…" : "Save"}
            </button>
          </div>
        </div>
      )}
      {error && <div className="text-xs text-cutoff mt-1">{error}</div>}
    </td>
  );
}
