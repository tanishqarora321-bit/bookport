"use client";

import { useState } from "react";
import Link from "next/link";
import { Ship, CheckCircle2 } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import InlineEditText from "@/components/ui/InlineEditText";

type Forwarder = {
  id: string;
  legal_name: string;
  short_code: string | null;
  country: string | null;
  address: string | null;
  is_active: boolean;
};

export default function ForwardersClient({ initialForwarders }: { initialForwarders: Forwarder[] }) {
  const [forwarders, setForwarders] = useState(initialForwarders);
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ legal_name: "", short_code: "", country: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addForwarder() {
    if (!form.legal_name.trim()) {
      setError("Forwarder name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/forwarders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add forwarder");
      setForwarders([...forwarders, json.forwarder].sort((a, b) => a.legal_name.localeCompare(b.legal_name)));
      setForm({ legal_name: "", short_code: "", country: "", address: "" });
      setAdding(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(f: Forwarder) {
    const res = await fetch(`/api/forwarders/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !f.is_active }),
    });
    if (res.ok) {
      setForwarders(forwarders.map((x) => (x.id === f.id ? { ...x, is_active: !x.is_active } : x)));
    }
  }

  async function deletePermanently(f: Forwarder) {
    if (!confirm(`Permanently delete "${f.legal_name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/forwarders/${f.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "Failed to delete");
      return;
    }
    setForwarders(forwarders.filter((x) => x.id !== f.id));
  }

  async function updateField(f: Forwarder, field: keyof Forwarder, value: string) {
    const res = await fetch(`/api/forwarders/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      setForwarders(forwarders.map((x) => (x.id === f.id ? { ...x, [field]: value } : x)));
    }
  }

  const visible = forwarders.filter((f) => showInactive || f.is_active);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">Forwarders</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink/60">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show removed
          </label>
          <Link href="/forwarders/import" className="text-sm border px-3 py-1.5 rounded font-medium">
            Import Excel
          </Link>
          <button
            onClick={() => setAdding(!adding)}
            className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium"
          >
            + New Forwarder
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 shrink-0">
        <StatCard icon={Ship} label="Total Forwarders" value={forwarders.length} />
        <StatCard icon={CheckCircle2} label="Active" value={forwarders.filter((f) => f.is_active).length} tone="success" />
      </div>

      {adding && (
        <div className="border border-accent/30 bg-accent/5 rounded p-4 mb-4 grid grid-cols-2 gap-3">
          <input
            placeholder="Forwarder name *"
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
            <button onClick={addForwarder} disabled={saving} className="text-sm bg-ink text-white px-3 py-1.5 rounded">
              {saving ? "Saving…" : "Save Forwarder"}
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
              <th className="px-3 py-2">Forwarder Name</th>
              <th className="px-3 py-2">Short Code</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => (
              <tr key={f.id} className={`border-b last:border-0 hover:bg-blue-50/40 ${!f.is_active ? "opacity-40" : ""}`}>
                <td className="px-3 py-2">
                  <InlineEditText value={f.legal_name} onSave={(v) => updateField(f, "legal_name", v)} />
                </td>
                <td className="px-3 py-2 text-ink/70">
                  <InlineEditText value={f.short_code} onSave={(v) => updateField(f, "short_code", v)} />
                </td>
                <td className="px-3 py-2 text-ink/70">
                  <InlineEditText value={f.country} onSave={(v) => updateField(f, "country", v)} />
                </td>
                <td className="px-3 py-2 text-ink/50 max-w-[260px] truncate" title={f.address ?? ""}>
                  {f.address || "—"}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/forwarders/${f.id}/invoices`} className="text-xs text-accent underline">
                    Details →
                  </Link>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => toggleActive(f)}
                    className={`text-xs px-2 py-1 rounded ${
                      f.is_active ? "text-cutoff hover:bg-red-50" : "text-accent hover:bg-blue-50"
                    }`}
                  >
                    {f.is_active ? "Remove" : "Restore"}
                  </button>
                  {!f.is_active && (
                    <button
                      onClick={() => deletePermanently(f)}
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
          <EmptyState icon={Ship} title="No forwarders yet" hint='Click "+ New Forwarder" above to add one.' />
        )}
      </div>
    </div>
  );
}
