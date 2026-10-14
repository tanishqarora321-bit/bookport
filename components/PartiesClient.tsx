"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Package, CheckCircle2 } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import InlineEditText from "@/components/ui/InlineEditText";

type GstEntry = {
  id: string;
  legal_name: string;
  gst_no: string | null;
  iec_code: string | null;
  pan_no: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
  description_of_goods: string | null;
  hs_code: string | null;
  transit_destination: string | null;
  sort_order: number;
};

type Party = {
  id: string;
  legal_name: string;
  short_code: string | null;
  country: string | null;
  address: string | null;
  is_active: boolean;
  gst_entries: GstEntry[];
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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4 shrink-0">
        <StatCard icon={Users} label="Total Accounts" value={parties.length} />
        <StatCard icon={CheckCircle2} label="Active" value={parties.filter((p) => p.is_active).length} tone="success" />
        <StatCard icon={Package} label="Items" value={items.length} />
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
  const [editing, setEditing] = useState<Party | null>(null);
  const [merging, setMerging] = useState<Party | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
      setParties([...parties, { ...json.party, gst_entries: [] }].sort((a, b) => a.legal_name.localeCompare(b.legal_name)));
      setForm({ legal_name: "", short_code: "", country: "", address: "" });
      setAdding(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(party: Party) {
    if (party.is_active && !confirm(`Remove "${party.legal_name}"? Its bookings/invoices stay intact - you can Restore it later from "Show removed".`)) {
      return;
    }
    const res = await fetch(`/api/parties/${party.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !party.is_active }),
    });
    if (res.ok) {
      setParties(parties.map((p) => (p.id === party.id ? { ...p, is_active: !p.is_active } : p)));
    }
  }

  async function deletePermanently(party: Party) {
    if (!confirm(`Permanently delete "${party.legal_name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/parties/${party.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "Failed to delete");
      return;
    }
    setParties(parties.filter((p) => p.id !== party.id));
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function updateGstEntries(partyId: string, entries: GstEntry[]) {
    setParties(parties.map((p) => (p.id === partyId ? { ...p, gst_entries: entries } : p)));
  }

  const visible = parties.filter((p) => showInactive || p.is_active);

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex justify-end gap-2 mb-3">
        <Link href="/parties/import" className="text-sm border px-3 py-1.5 rounded font-medium">
          Import Excel
        </Link>
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

      <div className="bg-white rounded-xl shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-ink/50 border-b">
              <th className="px-3 py-2">Account Name</th>
              <th className="px-3 py-2">Short Code</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <>
                <tr key={p.id} className={`border-b last:border-0 hover:bg-blue-50/40 ${!p.is_active ? "opacity-40" : ""}`}>
                  <td className="px-3 py-2">
                    <InlineEditText value={p.legal_name} onSave={(v) => updateField(parties, setParties, p, "legal_name", v)} />
                  </td>
                  <td className="px-3 py-2 text-ink/70">
                    <InlineEditText value={p.short_code} onSave={(v) => updateField(parties, setParties, p, "short_code", v)} />
                  </td>
                  <td className="px-3 py-2 text-ink/70">
                    <InlineEditText value={p.country} onSave={(v) => updateField(parties, setParties, p, "country", v)} />
                  </td>
                  <td className="px-3 py-2 text-ink/50 max-w-[260px] truncate" title={p.address ?? ""}>
                    {p.address || "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => setEditing(p)} className="text-xs text-ink/50 hover:text-accent border px-2 py-1 rounded">
                      Edit
                    </button>
                    {parties.length > 1 && (
                      <button onClick={() => setMerging(p)} className="text-xs text-ink/50 hover:text-accent border px-2 py-1 rounded ml-1">
                        Merge
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggleExpanded(p.id)} className="text-xs text-accent underline whitespace-nowrap">
                      {expanded[p.id] ? "Hide GST entries ▲" : `GST entries (${p.gst_entries.length}) ▼`}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/parties/${p.id}/invoices`} className="text-xs text-accent underline">
                      Invoices →
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`text-xs px-2 py-1 rounded ${
                        p.is_active ? "text-cutoff hover:bg-red-50" : "text-accent hover:bg-blue-50"
                      }`}
                    >
                      {p.is_active ? "Remove" : "Restore"}
                    </button>
                    {!p.is_active && (
                      <button
                        onClick={() => deletePermanently(p)}
                        className="text-xs px-2 py-1 rounded text-cutoff hover:bg-red-50 font-medium"
                        title="Delete permanently"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
                {expanded[p.id] && (
                  <tr className="border-b bg-slate-50/60">
                    <td colSpan={8} className="px-6 py-3">
                      <GstEntriesSection buyerPartyId={p.id} entries={p.gst_entries} onChange={(entries) => updateGstEntries(p.id, entries)} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <EmptyState icon={Users} title="No accounts yet" hint='Click "+ New Account" above to add your first buyer or customer.' />
        )}
      </div>

      {editing && (
        <EditPartyModal
          party={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setParties(parties.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)).sort((a, b) => a.legal_name.localeCompare(b.legal_name)));
            setEditing(null);
          }}
        />
      )}

      {merging && (
        <MergePartiesModal
          party={merging}
          allParties={parties}
          onClose={() => setMerging(null)}
          onMerged={(mergedAwayId, finalFields) => {
            setParties(
              parties
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

async function updateField(parties: Party[], setParties: (p: Party[]) => void, party: Party, field: keyof Party, value: string) {
  const res = await fetch(`/api/parties/${party.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: value }),
  });
  if (res.ok) {
    setParties(parties.map((p) => (p.id === party.id ? { ...p, [field]: value } : p)));
  }
}

function EditPartyModal({
  party, onClose, onSaved,
}: { party: Party; onClose: () => void; onSaved: (p: Party) => void }) {
  const [form, setForm] = useState({
    legal_name: party.legal_name,
    short_code: party.short_code ?? "",
    country: party.country ?? "",
    address: party.address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form.legal_name.trim()) {
      setError("Account name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/parties/${party.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      onSaved({ ...party, ...json.party });
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
          <h2 className="text-lg font-semibold text-ink">Edit Account</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-ink/40 mb-0.5">Account Name *</div>
            <input className="border rounded px-2 py-1.5 text-sm w-full" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-ink/40 mb-0.5">Short Code</div>
              <input className="border rounded px-2 py-1.5 text-sm w-full" value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value })} />
            </div>
            <div>
              <div className="text-xs text-ink/40 mb-0.5">Country</div>
              <input className="border rounded px-2 py-1.5 text-sm w-full" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
          </div>
          <div>
            <div className="text-xs text-ink/40 mb-0.5">Address</div>
            <textarea className="border rounded px-2 py-1.5 text-sm w-full" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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

function MergePartiesModal({
  party, allParties, onClose, onMerged,
}: {
  party: Party;
  allParties: Party[];
  onClose: () => void;
  onMerged: (mergedAwayId: string, finalFields: { legal_name: string; short_code: string | null; country: string | null; address: string | null }) => void;
}) {
  const others = allParties.filter((p) => p.id !== party.id);
  const [otherId, setOtherId] = useState(others[0]?.id ?? "");
  const other = others.find((p) => p.id === otherId) ?? null;
  const [form, setForm] = useState({
    legal_name: party.legal_name,
    short_code: party.short_code ?? "",
    country: party.country ?? "",
    address: party.address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useThisDetails() {
    setForm({ legal_name: party.legal_name, short_code: party.short_code ?? "", country: party.country ?? "", address: party.address ?? "" });
  }
  function useOtherDetails() {
    if (!other) return;
    setForm({ legal_name: other.legal_name, short_code: other.short_code ?? "", country: other.country ?? "", address: other.address ?? "" });
  }

  async function save() {
    if (!other) {
      setError("Pick which account to merge in.");
      return;
    }
    if (!form.legal_name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!confirm(`Merge "${other.legal_name}" into this record as "${form.legal_name.trim()}"? All of "${other.legal_name}"'s bookings, invoices, and GST entries move onto the merged record, and "${other.legal_name}" is permanently removed as a separate entry. This cannot be undone.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/parties/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId: party.id, mergeId: other.id, ...form }),
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
          <h2 className="text-lg font-semibold text-ink">Merge Accounts</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">✕</button>
        </div>
        <p className="text-sm text-ink/50 mb-3">
          Moves all bookings, invoices, and GST entries from the other account onto this one, then permanently
          removes it as a separate entry.
        </p>
        <div className="mb-3">
          <div className="text-xs text-ink/40 mb-0.5">Merge which account into "{party.legal_name}"?</div>
          <select className="border rounded px-2 py-1.5 text-sm w-full" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
            {others.map((p) => (
              <option key={p.id} value={p.id}>{p.legal_name}</option>
            ))}
          </select>
        </div>
        {other && (
          <>
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 rounded p-3 mb-3">
              <div>
                <div className="font-medium text-ink mb-1">{party.legal_name}</div>
                <div className="text-ink/50">Short code: {party.short_code || "—"}</div>
                <div className="text-ink/50">Country: {party.country || "—"}</div>
                <div className="text-ink/50">Address: {party.address || "—"}</div>
                <div className="text-ink/50">{party.gst_entries.length} GST entries</div>
                <button onClick={useThisDetails} className="mt-1 text-accent hover:underline">Use these details</button>
              </div>
              <div>
                <div className="font-medium text-ink mb-1">{other.legal_name}</div>
                <div className="text-ink/50">Short code: {other.short_code || "—"}</div>
                <div className="text-ink/50">Country: {other.country || "—"}</div>
                <div className="text-ink/50">Address: {other.address || "—"}</div>
                <div className="text-ink/50">{other.gst_entries.length} GST entries</div>
                <button onClick={useOtherDetails} className="mt-1 text-accent hover:underline">Use these details</button>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-xs text-ink/40 mb-0.5">Final Name *</div>
                <input className="border rounded px-2 py-1.5 text-sm w-full" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-ink/40 mb-0.5">Final Short Code</div>
                  <input className="border rounded px-2 py-1.5 text-sm w-full" value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value })} />
                </div>
                <div>
                  <div className="text-xs text-ink/40 mb-0.5">Final Country</div>
                  <input className="border rounded px-2 py-1.5 text-sm w-full" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                </div>
              </div>
              <div>
                <div className="text-xs text-ink/40 mb-0.5">Final Address</div>
                <textarea className="border rounded px-2 py-1.5 text-sm w-full" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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

// ---------------- GST entries sub-table (one buyer's cost-section equivalent) ----------------

type DraftEntry = {
  legal_name: string; gst_no: string; iec_code: string; pan_no: string; address: string; mobile: string;
  email: string; description_of_goods: string; hs_code: string; transit_destination: string;
};

function blankEntry(): DraftEntry {
  return { legal_name: "", gst_no: "", iec_code: "", pan_no: "", address: "", mobile: "", email: "", description_of_goods: "", hs_code: "", transit_destination: "" };
}

function GstEntriesSection({
  buyerPartyId, entries, onChange,
}: { buyerPartyId: string; entries: GstEntry[]; onChange: (entries: GstEntry[]) => void }) {
  const [addingRow, setAddingRow] = useState(false);
  const [draft, setDraft] = useState<DraftEntry>(blankEntry());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveNewRow() {
    if (!draft.legal_name.trim()) {
      setError("Legal name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/buyer-gst-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer_party_id: buyerPartyId, ...draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add GST entry");
      onChange([...entries, json.entry]);
      setDraft(blankEntry());
      setAddingRow(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function patchEntry(id: string, field: keyof GstEntry, value: string) {
    const res = await fetch(`/api/buyer-gst-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Save failed");
    onChange(entries.map((e) => (e.id === id ? json.entry : e)));
  }

  async function deleteEntry(id: string) {
    if (!confirm("Remove this GST entry? If it's used as a booking's \"Consignee as per BL,\" that booking will need a new one picked.")) return;
    const res = await fetch(`/api/buyer-gst-entries/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    onChange(entries.filter((e) => e.id !== id));
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink/40">
            <th className="pb-1 pr-2 font-normal">Legal Name</th>
            <th className="pb-1 pr-2 font-normal">GST No.</th>
            <th className="pb-1 pr-2 font-normal">IEC Code</th>
            <th className="pb-1 pr-2 font-normal">PAN No.</th>
            <th className="pb-1 pr-2 font-normal">Mobile</th>
            <th className="pb-1 pr-2 font-normal">Email</th>
            <th className="pb-1 pr-2 font-normal">Description of Goods</th>
            <th className="pb-1 pr-2 font-normal">H.S. Code</th>
            <th className="pb-1 pr-2 font-normal">Address</th>
            <th className="pb-1 pr-2 font-normal" title="For the Instructions email's shipper-declares clause, e.g. KANDLA SPECIAL ECONOMIC ZONE (INKDL6)">Transit Destination</th>
            <th className="pb-1 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t">
              <GstCell value={entry.legal_name} onSave={(v) => patchEntry(entry.id, "legal_name", v)} />
              <GstCell value={entry.gst_no} onSave={(v) => patchEntry(entry.id, "gst_no", v)} />
              <GstCell value={entry.iec_code} onSave={(v) => patchEntry(entry.id, "iec_code", v)} />
              <GstCell value={entry.pan_no} onSave={(v) => patchEntry(entry.id, "pan_no", v)} />
              <GstCell value={entry.mobile} onSave={(v) => patchEntry(entry.id, "mobile", v)} />
              <GstCell value={entry.email} onSave={(v) => patchEntry(entry.id, "email", v)} />
              <GstCell value={entry.description_of_goods} onSave={(v) => patchEntry(entry.id, "description_of_goods", v)} />
              <GstCell value={entry.hs_code} onSave={(v) => patchEntry(entry.id, "hs_code", v)} />
              <GstCell value={entry.address} onSave={(v) => patchEntry(entry.id, "address", v)} wide />
              <GstCell value={entry.transit_destination} onSave={(v) => patchEntry(entry.id, "transit_destination", v)} wide />
              <td className="py-1 text-center">
                <button onClick={() => deleteEntry(entry.id)} className="text-cutoff text-xs">✕</button>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={11} className="py-2 text-ink/40 text-xs">No GST entries yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {addingRow ? (
        <div className="flex flex-wrap gap-2 items-center mt-2">
          <input placeholder="Legal Name *" className="border rounded px-2 py-1 text-sm w-36" value={draft.legal_name} onChange={(e) => setDraft({ ...draft, legal_name: e.target.value })} />
          <input placeholder="GST No." className="border rounded px-2 py-1 text-sm w-28" value={draft.gst_no} onChange={(e) => setDraft({ ...draft, gst_no: e.target.value })} />
          <input placeholder="IEC Code" className="border rounded px-2 py-1 text-sm w-28" value={draft.iec_code} onChange={(e) => setDraft({ ...draft, iec_code: e.target.value })} />
          <input placeholder="PAN No." className="border rounded px-2 py-1 text-sm w-28" value={draft.pan_no} onChange={(e) => setDraft({ ...draft, pan_no: e.target.value })} />
          <input placeholder="Mobile" className="border rounded px-2 py-1 text-sm w-28" value={draft.mobile} onChange={(e) => setDraft({ ...draft, mobile: e.target.value })} />
          <input placeholder="Email" className="border rounded px-2 py-1 text-sm w-40" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <input placeholder="Description of Goods" className="border rounded px-2 py-1 text-sm w-40" value={draft.description_of_goods} onChange={(e) => setDraft({ ...draft, description_of_goods: e.target.value })} />
          <input placeholder="H.S. Code" className="border rounded px-2 py-1 text-sm w-24" value={draft.hs_code} onChange={(e) => setDraft({ ...draft, hs_code: e.target.value })} />
          <input placeholder="Address" className="border rounded px-2 py-1 text-sm w-48" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
          <input placeholder="Transit Destination (e.g. KANDLA SEZ (INKDL6))" className="border rounded px-2 py-1 text-sm w-56" value={draft.transit_destination} onChange={(e) => setDraft({ ...draft, transit_destination: e.target.value })} />
          <button onClick={saveNewRow} disabled={saving} className="text-xs bg-ink text-white px-2 py-1 rounded">{saving ? "…" : "✓"}</button>
          <button onClick={() => { setAddingRow(false); setDraft(blankEntry()); setError(null); }} className="text-xs border px-2 py-1 rounded">✕</button>
        </div>
      ) : (
        <button onClick={() => setAddingRow(true)} className="text-xs text-accent underline mt-2">+ Add GST Entry</button>
      )}
      {error && <div className="text-xs text-cutoff mt-1">{error}</div>}
    </div>
  );
}

function GstCell({ value, onSave, wide = false }: { value: string | null; onSave: (v: string) => Promise<any>; wide?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(val);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <td className={`py-1 pr-2 ${wide ? "max-w-[220px] truncate" : ""}`}>
        <span onClick={() => setEditing(true)} className="cursor-text hover:bg-blue-50 px-1 rounded block" title={value ?? ""}>
          {value || "—"}
        </span>
      </td>
    );
  }

  return (
    <td className="py-1 pr-2">
      <div className="flex gap-1 items-center">
        <input autoFocus className={`border border-accent rounded px-1.5 py-0.5 text-sm ${wide ? "w-48" : "w-28"}`} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} disabled={saving} />
        <button onClick={save} disabled={saving} className="text-xs bg-ink text-white px-1.5 py-0.5 rounded">{saving ? "…" : "✓"}</button>
        <button onClick={() => setEditing(false)} className="text-xs border px-1.5 py-0.5 rounded">✕</button>
        {error && <span className="text-xs text-cutoff">{error}</span>}
      </div>
    </td>
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

      <div className="bg-white rounded-xl shadow-sm">
        <ul className="divide-y">
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
        </ul>
        {visible.length === 0 && <EmptyState icon={Package} title="No items yet" hint="Add item categories like Mixed Rag to assign in Shipment Tracking." />}
      </div>
    </div>
  );
}
