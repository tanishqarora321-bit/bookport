"use client";

import { useState } from "react";

type Party = {
  id: string;
  legal_name: string;
  short_code: string | null;
  country: string | null;
  address: string | null;
  is_active: boolean;
};

type Item = {
  id: string;
  name: string;
  is_active: boolean;
};

export default function PartiesClient({
  initialParties,
  initialItems,
}: {
  initialParties: Party[];
  initialItems: Item[];
}) {
  const [tab, setTab] = useState<"parties" | "items">("parties");
  const [parties, setParties] = useState(initialParties);
  const [items, setItems] = useState(initialItems);
  const [showInactive, setShowInactive] = useState(false);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">Buyers / Customers</h1>
        <label className="flex items-center gap-2 text-sm text-ink/60">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show removed
        </label>
      </div>

      <div className="flex gap-1 border-b border-ink/10 mb-4">
        <button
          onClick={() => setTab("parties")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "parties" ? "border-accent text-accent" : "border-transparent text-ink/50 hover:text-ink"
          }`}
        >
          Accounts
        </button>
        <button
          onClick={() => setTab("items")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "items" ? "border-accent text-accent" : "border-transparent text-ink/50 hover:text-ink"
          }`}
        >
          Items
        </button>
      </div>

      {tab === "parties" ? (
        <PartiesTab parties={parties} setParties={setParties} showInactive={showInactive} />
      ) : (
        <ItemsTab items={items} setItems={setItems} showInactive={showInactive} />
      )}
    </div>
  );
}

// ---------------- Accounts (Parties) tab ----------------

function PartiesTab({
  parties,
  setParties,
  showInactive,
}: {
  parties: Party[];
  setParties: (p: Party[]) => void;
  showInactive: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ legal_name: "", short_code: "", country: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addParty() {
    if (!form.legal_name.trim()) {
      setError("Account name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add account");
      setParties([...parties, json.party].sort((a, b) => a.legal_name.localeCompare(b.legal_name)));
      setForm({ legal_name: "", short_code: "", country: "", address: "" });
      setAdding(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(party: Party) {
    const res = await fetch(`/api/parties/${party.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !party.is_active }),
    });
    if (res.ok) {
      setParties(parties.map((p) => (p.id === party.id ? { ...p, is_active: !p.is_active } : p)));
    }
  }

  async function updateField(party: Party, field: keyof Party, value: string) {
    const res = await fetch(`/api/parties/${party.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      setParties(parties.map((p) => (p.id === party.id ? { ...p, [field]: value } : p)));
    }
  }

  const visible = parties.filter((p) => showInactive || p.is_active);

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setAdding(!adding)}
          className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium"
        >
          + New Account
        </button>
      </div>

      {adding && (
        <div className="border border-accent/30 bg-accent/5 rounded p-4 mb-4 grid grid-cols-2 gap-3">
          <input
            placeholder="Account / party name *"
            className="border rounded px-2 py-1.5 text-sm col-span-2"
            value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
          />
          <input
            placeholder="Short code (e.g. LR, used in invoice numbers)"
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
            <button
              onClick={addParty}
              disabled={saving}
              className="text-sm bg-ink text-white px-3 py-1.5 rounded"
            >
              {saving ? "Saving…" : "Save Account"}
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
            <th className="px-3 py-2">Account Name</th>
            <th className="px-3 py-2">Short Code</th>
            <th className="px-3 py-2">Country</th>
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p) => (
            <tr key={p.id} className={`border-b hover:bg-blue-50/40 ${!p.is_active ? "opacity-40" : ""}`}>
              <td
                className="px-3 py-2 cursor-text"
                onClick={(e) => {
                  const val = prompt("Account name", p.legal_name);
                  if (val !== null && val.trim()) updateField(p, "legal_name", val.trim());
                }}
              >
                {p.legal_name}
              </td>
              <td
                className="px-3 py-2 cursor-text text-ink/70"
                onClick={() => {
                  const val = prompt("Short code", p.short_code ?? "");
                  if (val !== null) updateField(p, "short_code", val.trim());
                }}
              >
                {p.short_code || "—"}
              </td>
              <td
                className="px-3 py-2 cursor-text text-ink/70"
                onClick={() => {
                  const val = prompt("Country", p.country ?? "");
                  if (val !== null) updateField(p, "country", val.trim());
                }}
              >
                {p.country || "—"}
              </td>
              <td className="px-3 py-2 text-ink/50 max-w-[300px] truncate" title={p.address ?? ""}>
                {p.address || "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => toggleActive(p)}
                  className={`text-xs px-2 py-1 rounded ${
                    p.is_active ? "text-cutoff hover:bg-red-50" : "text-accent hover:bg-blue-50"
                  }`}
                >
                  {p.is_active ? "Remove" : "Restore"}
                </button>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-ink/40">
                No accounts yet. Click "+ New Account" to add one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Items tab ----------------

function ItemsTab({
  items,
  setItems,
  showInactive,
}: {
  items: Item[];
  setItems: (i: Item[]) => void;
  showInactive: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addItem() {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add item");
      setItems([...items, json.item].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: Item) {
    const res = await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !item.is_active }),
    });
    if (res.ok) {
      setItems(items.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i)));
    }
  }

  const visible = items.filter((i) => showInactive || i.is_active);

  return (
    <div className="flex-1 overflow-auto max-w-lg">
      <div className="flex gap-2 mb-4">
        <input
          placeholder="New item name, e.g. Mixed Rags"
          className="border rounded px-2 py-1.5 text-sm flex-1"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />
        <button
          onClick={addItem}
          disabled={saving}
          className="text-sm bg-accent text-white px-3 py-1.5 rounded font-medium"
        >
          + Add
        </button>
      </div>
      {error && <div className="text-xs text-cutoff mb-2">{error}</div>}

      <ul className="border rounded divide-y">
        {visible.map((item) => (
          <li
            key={item.id}
            className={`flex items-center justify-between px-3 py-2 text-sm ${!item.is_active ? "opacity-40" : ""}`}
          >
            <span>{item.name}</span>
            <button
              onClick={() => toggleActive(item)}
              className={`text-xs px-2 py-1 rounded ${
                item.is_active ? "text-cutoff hover:bg-red-50" : "text-accent hover:bg-blue-50"
              }`}
            >
              {item.is_active ? "Remove" : "Restore"}
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className="px-3 py-8 text-center text-ink/40">No items yet.</li>}
      </ul>
    </div>
  );
}
