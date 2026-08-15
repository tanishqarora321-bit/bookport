"use client";

import { useState } from "react";
import Link from "next/link";

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

  async function toggleActive(f: Trucker) {
    const res = await fetch(`/api/truckers/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !f.is_active }),
    });
    if (res.ok) {
      setTruckers(truckers.map((x) => (x.id === f.id ? { ...x, is_active: !x.is_active } : x)));
    }
  }

  async function updateField(f: Trucker, field: keyof Trucker, value: string) {
    const res = await fetch(`/api/truckers/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      setTruckers(truckers.map((x) => (x.id === f.id ? { ...x, [field]: value } : x)));
    }
  }

  const visible = truckers.filter((f) => showInactive || f.is_active);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">Truckers</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink/60">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show removed
          </label>
          <button
            onClick={() => setAdding(!adding)}
            className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium"
          >
            + New Trucker
          </button>
        </div>
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

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-ink/50 border-b">
            <th className="px-3 py-2">Trucker Name</th>
            <th className="px-3 py-2">Short Code</th>
            <th className="px-3 py-2">Country</th>
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2"></th>
            <th className="px-3 py-2 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((f) => (
            <tr key={f.id} className={`border-b hover:bg-blue-50/40 ${!f.is_active ? "opacity-40" : ""}`}>
              <td
                className="px-3 py-2 cursor-text"
                onClick={() => {
                  const val = prompt("Trucker name", f.legal_name);
                  if (val !== null && val.trim()) updateField(f, "legal_name", val.trim());
                }}
              >
                {f.legal_name}
              </td>
              <td
                className="px-3 py-2 cursor-text text-ink/70"
                onClick={() => {
                  const val = prompt("Short code", f.short_code ?? "");
                  if (val !== null) updateField(f, "short_code", val.trim());
                }}
              >
                {f.short_code || "—"}
              </td>
              <td
                className="px-3 py-2 cursor-text text-ink/70"
                onClick={() => {
                  const val = prompt("Country", f.country ?? "");
                  if (val !== null) updateField(f, "country", val.trim());
                }}
              >
                {f.country || "—"}
              </td>
              <td className="px-3 py-2 text-ink/50 max-w-[260px] truncate" title={f.address ?? ""}>
                {f.address || "—"}
              </td>
              <td className="px-3 py-2">
                <Link href={`/truckers/${f.id}/invoices`} className="text-xs text-accent underline">
                  Invoices →
                </Link>
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => toggleActive(f)}
                  className={`text-xs px-2 py-1 rounded ${
                    f.is_active ? "text-cutoff hover:bg-red-50" : "text-accent hover:bg-blue-50"
                  }`}
                >
                  {f.is_active ? "Remove" : "Restore"}
                </button>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-ink/40">
                No truckers yet. Click "+ New Trucker" to add one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
