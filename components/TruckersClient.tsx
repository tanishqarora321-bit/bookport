"use client";

import { useState } from "react";
import Link from "next/link";
import { Truck, CheckCircle2 } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";

type Trucker = {
  id: string;
  legal_name: string;
  short_code: string | null;
  country: string | null;
  address: string | null;
  is_active: boolean;
};

export default function TruckersClient({ initialTruckers }: { initialTruckers: Trucker[] }) {
  const [truckers, setTruckers] = useState(initialTruckers);
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ legal_name: "", short_code: "", country: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Trucker | null>(null);
  const [merging, setMerging] = useState<Trucker | null>(null);

  async function addTrucker() {
    if (!form.legal_name.trim()) {
      setError("Trucker name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/truckers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add trucker");
      setTruckers([...truckers, json.trucker].sort((a, b) => a.legal_name.localeCompare(b.legal_name)));
      setForm({ legal_name: "", short_code: "", country: "", address: "" });
      setAdding(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: Trucker) {
    if (t.is_active && !confirm(`Remove "${t.legal_name}"? Its bookings/invoices stay intact - you can Restore it later from "Show removed".`)) {
      return;
    }
    const res = await fetch(`/api/truckers/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !t.is_active }),
    });
    if (res.ok) {
      setTruckers(truckers.map((x) => (x.id === t.id ? { ...x, is_active: !x.is_active } : x)));
    }
  }

  async function deletePermanently(t: Trucker) {
    if (!confirm(`Permanently delete "${t.legal_name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/truckers/${t.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "Failed to delete");
      return;
    }
    setTruckers(truckers.filter((x) => x.id !== t.id));
  }

  const visible = truckers.filter((t) => showInactive || t.is_active);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">Truckers</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink/60">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show removed
          </label>
          <Link href="/truckers/import" className="text-sm border px-3 py-1.5 rounded font-medium">
            Import Excel
          </Link>
          <button
            onClick={() => setAdding(!adding)}
            className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium"
          >
            + New Trucker
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 shrink-0">
        <StatCard icon={Truck} label="Total Truckers" value={truckers.length} />
        <StatCard icon={CheckCircle2} label="Active" value={truckers.filter((t) => t.is_active).length} tone="success" />
      </div>

      {adding && (
        <div className="border border-accent/30 bg-accent/5 rounded p-4 mb-4 grid grid-cols-2 gap-3">
          <input
            placeholder="Trucker name *"
            className="border rounded px-2 py-1.5 text-sm col-span-2"
            value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
          />
          <input
            placeholder="Short code"
            className="border rounded px-2 py-1.5 text-sm"
            value={form.short_code}
            onChange={(e) => setForm({ ...form, short_code: e.target.value })}
          />
          <input
            placeholder="Country"
            className="border rounded px-2 py-1.5 text-sm"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
          <textarea
            placeholder="Address"
            className="border rounded px-2 py-1.5 text-sm col-span-2"
            rows={2}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          {error && <div className="col-span-2 text-xs text-cutoff">{error}</div>}
          <div className="col-span-2 flex gap-2">
            <button onClick={addTrucker} disabled={saving} className="text-sm bg-ink text-white px-3 py-1.5 rounded">
              {saving ? "Saving…" : "Save Trucker"}
            </button>
            <button onClick={() => setAdding(false)} className="text-sm border px-3 py-1.5 rounded">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-ink/50 border-b">
              <th className="px-3 py-2">Trucker Name</th>
              <th className="px-3 py-2">Short Code</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.id} className={`border-b last:border-0 hover:bg-blue-50/40 ${!t.is_active ? "opacity-40" : ""}`}>
                <td className="px-3 py-2 font-medium text-ink">{t.legal_name}</td>
                <td className="px-3 py-2 text-ink/70">{t.short_code || "—"}</td>
                <td className="px-3 py-2 text-ink/70">{t.country || "—"}</td>
                <td className="px-3 py-2 text-ink/50 max-w-[260px] truncate" title={t.address ?? ""}>
                  {t.address || "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button onClick={() => setEditing(t)} className="text-xs text-ink/50 hover:text-accent border px-2 py-1 rounded">
                    Edit
                  </button>
                  {truckers.length > 1 && (
                    <button onClick={() => setMerging(t)} className="text-xs text-ink/50 hover:text-accent border px-2 py-1 rounded ml-1">
                      Merge
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/truckers/${t.id}/invoices`} className="text-xs text-accent underline">
                    Invoices →
                  </Link>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => toggleActive(t)}
                    className={`text-xs px-2 py-1 rounded ${
                      t.is_active ? "text-cutoff hover:bg-red-50" : "text-accent hover:bg-blue-50"
                    }`}
                  >
                    {t.is_active ? "Remove" : "Restore"}
                  </button>
                  {!t.is_active && (
                    <button
                      onClick={() => deletePermanently(t)}
                      className="text-xs px-2 py-1 rounded text-cutoff hover:bg-red-50 font-medium"
                      title="Delete permanently"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <EmptyState icon={Truck} title="No truckers yet" hint='Click "+ New Trucker" above to add one.' />
        )}
      </div>

      {editing && (
        <EditTruckerModal
          trucker={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setTruckers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)).sort((a, b) => a.legal_name.localeCompare(b.legal_name)));
            setEditing(null);
          }}
        />
      )}

      {merging && (
        <MergeTruckersModal
          trucker={merging}
          allTruckers={truckers}
          onClose={() => setMerging(null)}
          onMerged={(mergedAwayId, finalFields) => {
            setTruckers((prev) =>
              prev
                .filter((x) => x.id !== mergedAwayId)
                .map((x) => (x.id === merging.id ? { ...x, ...finalFields } : x))
                .sort((a, b) => a.legal_name.localeCompare(b.legal_name))
            );
            setMerging(null);
          }}
        />
      )}
    </div>
  );
}

function EditTruckerModal({
  trucker, onClose, onSaved,
}: { trucker: Trucker; onClose: () => void; onSaved: (t: Trucker) => void }) {
  const [form, setForm] = useState({
    legal_name: trucker.legal_name,
    short_code: trucker.short_code ?? "",
    country: trucker.country ?? "",
    address: trucker.address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form.legal_name.trim()) {
      setError("Trucker name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/truckers/${trucker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      onSaved(json.trucker);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink">Edit Trucker</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-xs text-ink/40 mb-0.5">Trucker Name *</div>
            <input
              className="border rounded px-2 py-1.5 text-sm w-full"
              value={form.legal_name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-ink/40 mb-0.5">Short Code</div>
              <input
                className="border rounded px-2 py-1.5 text-sm w-full"
                value={form.short_code}
                onChange={(e) => setForm({ ...form, short_code: e.target.value })}
              />
            </div>
            <div>
              <div className="text-xs text-ink/40 mb-0.5">Country</div>
              <input
                className="border rounded px-2 py-1.5 text-sm w-full"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-ink/40 mb-0.5">Address</div>
            <textarea
              className="border rounded px-2 py-1.5 text-sm w-full"
              rows={2}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
        </div>

        {error && <div className="text-sm text-cutoff mt-3">{error}</div>}

        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="text-sm border px-4 py-2 rounded">Cancel</button>
          <button onClick={save} disabled={saving} className="text-sm bg-accent text-white px-4 py-2 rounded font-medium disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MergeTruckersModal({
  trucker, allTruckers, onClose, onMerged,
}: {
  trucker: Trucker;
  allTruckers: Trucker[];
  onClose: () => void;
  onMerged: (mergedAwayId: string, finalFields: { legal_name: string; short_code: string | null; country: string | null; address: string | null }) => void;
}) {
  const others = allTruckers.filter((t) => t.id !== trucker.id);
  const [otherId, setOtherId] = useState(others[0]?.id ?? "");
  const other = others.find((t) => t.id === otherId) ?? null;
  const [form, setForm] = useState({
    legal_name: trucker.legal_name,
    short_code: trucker.short_code ?? "",
    country: trucker.country ?? "",
    address: trucker.address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useThisDetails() {
    setForm({ legal_name: trucker.legal_name, short_code: trucker.short_code ?? "", country: trucker.country ?? "", address: trucker.address ?? "" });
  }
  function useOtherDetails() {
    if (!other) return;
    setForm({ legal_name: other.legal_name, short_code: other.short_code ?? "", country: other.country ?? "", address: other.address ?? "" });
  }

  async function save() {
    if (!other) {
      setError("Pick which trucker to merge in.");
      return;
    }
    if (!form.legal_name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!confirm(`Merge "${other.legal_name}" into this record as "${form.legal_name.trim()}"? All of "${other.legal_name}"'s bookings and invoices move onto the merged record, and "${other.legal_name}" is permanently removed as a separate entry. This cannot be undone.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/parties/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId: trucker.id, mergeId: other.id, ...form }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Merge failed");
      onMerged(other.id, {
        legal_name: form.legal_name.trim(),
        short_code: form.short_code.trim() || null,
        country: form.country.trim() || null,
        address: form.address.trim() || null,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink">Merge Truckers</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">✕</button>
        </div>
        <p className="text-sm text-ink/50 mb-3">
          Moves all bookings and invoices from the other trucker onto this one, then permanently removes it as a
          separate entry.
        </p>

        <div className="mb-3">
          <div className="text-xs text-ink/40 mb-0.5">Merge which trucker into "{trucker.legal_name}"?</div>
          <select className="border rounded px-2 py-1.5 text-sm w-full" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
            {others.map((t) => (
              <option key={t.id} value={t.id}>{t.legal_name}</option>
            ))}
          </select>
        </div>

        {other && (
          <>
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 rounded p-3 mb-3">
              <div>
                <div className="font-medium text-ink mb-1">{trucker.legal_name}</div>
                <div className="text-ink/50">Short code: {trucker.short_code || "—"}</div>
                <div className="text-ink/50">Country: {trucker.country || "—"}</div>
                <div className="text-ink/50">Address: {trucker.address || "—"}</div>
                <button onClick={useThisDetails} className="mt-1 text-accent hover:underline">Use these details</button>
              </div>
              <div>
                <div className="font-medium text-ink mb-1">{other.legal_name}</div>
                <div className="text-ink/50">Short code: {other.short_code || "—"}</div>
                <div className="text-ink/50">Country: {other.country || "—"}</div>
                <div className="text-ink/50">Address: {other.address || "—"}</div>
                <button onClick={useOtherDetails} className="mt-1 text-accent hover:underline">Use these details</button>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="text-xs text-ink/40 mb-0.5">Final Name *</div>
                <input
                  className="border rounded px-2 py-1.5 text-sm w-full"
                  value={form.legal_name}
                  onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-ink/40 mb-0.5">Final Short Code</div>
                  <input
                    className="border rounded px-2 py-1.5 text-sm w-full"
                    value={form.short_code}
                    onChange={(e) => setForm({ ...form, short_code: e.target.value })}
                  />
                </div>
                <div>
                  <div className="text-xs text-ink/40 mb-0.5">Final Country</div>
                  <input
                    className="border rounded px-2 py-1.5 text-sm w-full"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <div className="text-xs text-ink/40 mb-0.5">Final Address</div>
                <textarea
                  className="border rounded px-2 py-1.5 text-sm w-full"
                  rows={2}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
            </div>
          </>
        )}

        {error && <div className="text-sm text-cutoff mt-3">{error}</div>}

        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="text-sm border px-4 py-2 rounded">Cancel</button>
          <button onClick={save} disabled={saving || !other} className="text-sm bg-accent text-white px-4 py-2 rounded font-medium disabled:opacity-60">
            {saving ? "Merging…" : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
