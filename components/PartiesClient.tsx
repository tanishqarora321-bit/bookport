"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Package, CheckCircle2 } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import InlineEditText from "@/components/ui/InlineEditText";

type GstEntry = {
  id: string;
  gst_no: string | null;
  iec_code: string | null;
  pan_no: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
  description_of_goods: string | null;
  hs_code: string | null;
  transit_destination: string | null;
};

type Party = {
  id: string;
  legal_name: string;
  short_code: string | null;
  country: string | null;
  address: string | null;
  is_active: boolean;
  // A buyer has at most one of these now (migration 0032) - its own
  // GST/IEC/PAN/shipping details, not a pickable list.
  gst_entry: GstEntry | null;
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
        <label className="flex items-center gap-2 text-sm text-text-2">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show removed
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4 shrink-0">
        <StatCard icon={Users} label="Total Accounts" value={parties.length} />
        <StatCard icon={CheckCircle2} label="Active" value={parties.filter((p) => p.is_active).length} tone="success" />
        <StatCard icon={Package} label="Items" value={items.length} />
      </div>

      <div className="flex gap-1 border-b border-line mb-4">
        <button
          onClick={() => setTab("parties")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "parties" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          Accounts
        </button>
        <button
          onClick={() => setTab("items")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "items" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
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
      setParties([...parties, { ...json.party, gst_entry: null }].sort((a, b) => a.legal_name.localeCompare(b.legal_name)));
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

  function updateGstEntry(partyId: string, entry: GstEntry) {
    setParties(parties.map((p) => (p.id === partyId ? { ...p, gst_entry: entry } : p)));
  }

  const visible = parties.filter((p) => showInactive || p.is_active);

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex justify-end gap-2 mb-3">
        <Link href="/parties/import" className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm font-medium">
          Import Excel
        </Link>
        <button
          onClick={() => setAdding(!adding)}
          className="bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium"
        >
          + New Account
        </button>
      </div>

      {adding && (
        <div className="border border-accent/30 bg-accent-soft rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
          <input
            placeholder="Account / party name *"
            className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm col-span-2"
            value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
          />
          <input
            placeholder="Short code (e.g. LR, used in invoice numbers)"
            className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm"
            value={form.short_code}
            onChange={(e) => setForm({ ...form, short_code: e.target.value })}
          />
          <input
            placeholder="Country"
            className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
          <textarea
            placeholder="Address"
            className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm col-span-2"
            rows={2}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          {error && <div className="col-span-2 text-xs text-cutoff">{error}</div>}
          <div className="col-span-2 flex gap-2">
            <button
              onClick={addParty}
              disabled={saving}
              className="bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Account"}
            </button>
            <button onClick={() => setAdding(false)} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-surface-2 z-10">
            <tr className="text-left text-muted border-b border-line">
              <th className="px-3 py-2 font-medium">Account Name</th>
              <th className="px-3 py-2 font-medium">Short Code</th>
              <th className="px-3 py-2 font-medium">Country</th>
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <>
                <tr key={p.id} className={`border-b border-line last:border-0 hover:bg-surface-2 ${!p.is_active ? "opacity-40" : ""}`}>
                  <td className="px-3 py-2">
                    <InlineEditText value={p.legal_name} onSave={(v) => updateField(parties, setParties, p, "legal_name", v)} />
                  </td>
                  <td className="px-3 py-2 text-text-2">
                    <InlineEditText value={p.short_code} onSave={(v) => updateField(parties, setParties, p, "short_code", v)} />
                  </td>
                  <td className="px-3 py-2 text-text-2">
                    <InlineEditText value={p.country} onSave={(v) => updateField(parties, setParties, p, "country", v)} />
                  </td>
                  <td className="px-3 py-2 text-muted max-w-[260px] truncate" title={p.address ?? ""}>
                    {p.address || "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => setEditing(p)} className="text-xs text-muted hover:text-accent border border-line px-2 py-1 rounded-lg">
                      Edit
                    </button>
                    {parties.length > 1 && (
                      <button onClick={() => setMerging(p)} className="text-xs text-muted hover:text-accent border border-line px-2 py-1 rounded-lg ml-1">
                        Merge
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggleExpanded(p.id)} className="text-xs text-accent hover:underline whitespace-nowrap">
                      {expanded[p.id] ? "Hide Shipping Details ▲" : "Shipping Details ▼"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/parties/${p.id}/invoices`} className="text-xs text-accent hover:underline">
                      Invoices →
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`text-xs px-2 py-1 rounded-lg ${
                        p.is_active ? "text-cutoff hover:bg-critical-soft" : "text-accent hover:bg-accent-soft"
                      }`}
                    >
                      {p.is_active ? "Remove" : "Restore"}
                    </button>
                    {!p.is_active && (
                      <button
                        onClick={() => deletePermanently(p)}
                        className="text-xs px-2 py-1 rounded-lg text-cutoff hover:bg-critical-soft font-medium"
                        title="Delete permanently"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
                {expanded[p.id] && (
                  <tr className="border-b border-line bg-surface-2">
                    <td colSpan={8} className="px-6 py-3">
                      <ShippingDetailsSection buyerPartyId={p.id} entry={p.gst_entry} onChange={(entry) => updateGstEntry(p.id, entry)} />
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
      <div className="bg-surface border border-line rounded-xl shadow-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink">Edit Account</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close dialog">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted mb-0.5">Account Name *</div>
            <input className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm w-full" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted mb-0.5">Short Code</div>
              <input className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm w-full" value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value })} />
            </div>
            <div>
              <div className="text-xs text-muted mb-0.5">Country</div>
              <input className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm w-full" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">Address</div>
            <textarea className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm w-full" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        {error && <div className="text-sm text-cutoff mt-3">{error}</div>}
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
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
    if (!confirm(`Merge "${other.legal_name}" into this record as "${form.legal_name.trim()}"? All of "${other.legal_name}"'s bookings and invoices move onto the merged record (its shipping details move over too, unless this record already has its own), and "${other.legal_name}" is permanently removed as a separate entry. This cannot be undone.`)) {
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
      <div className="bg-surface border border-line rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink">Merge Accounts</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close dialog">✕</button>
        </div>
        <p className="text-sm text-text-2 mb-3">
          Moves all bookings and invoices from the other account onto this one (its shipping details move over
          too, unless this one already has its own), then permanently removes it as a separate entry.
        </p>
        <div className="mb-3">
          <div className="text-xs text-muted mb-0.5">Merge which account into "{party.legal_name}"?</div>
          <select className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm w-full" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
            {others.map((p) => (
              <option key={p.id} value={p.id}>{p.legal_name}</option>
            ))}
          </select>
        </div>
        {other && (
          <>
            <div className="grid grid-cols-2 gap-3 text-xs bg-surface-2 rounded-lg p-3 mb-3">
              <div>
                <div className="font-medium text-ink mb-1">{party.legal_name}</div>
                <div className="text-muted">Short code: {party.short_code || "—"}</div>
                <div className="text-muted">Country: {party.country || "—"}</div>
                <div className="text-muted">Address: {party.address || "—"}</div>
                <div className="text-muted">{party.gst_entry ? "Has shipping details" : "No shipping details"}</div>
                <button onClick={useThisDetails} className="mt-1 text-accent hover:underline">Use these details</button>
              </div>
              <div>
                <div className="font-medium text-ink mb-1">{other.legal_name}</div>
                <div className="text-muted">Short code: {other.short_code || "—"}</div>
                <div className="text-muted">Country: {other.country || "—"}</div>
                <div className="text-muted">Address: {other.address || "—"}</div>
                <div className="text-muted">{other.gst_entry ? "Has shipping details" : "No shipping details"}</div>
                <button onClick={useOtherDetails} className="mt-1 text-accent hover:underline">Use these details</button>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-xs text-muted mb-0.5">Final Name *</div>
                <input className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm w-full" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted mb-0.5">Final Short Code</div>
                  <input className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm w-full" value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value })} />
                </div>
                <div>
                  <div className="text-xs text-muted mb-0.5">Final Country</div>
                  <input className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm w-full" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                </div>
              </div>
              <div>
                <div className="text-xs text-muted mb-0.5">Final Address</div>
                <textarea className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm w-full" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
            </div>
          </>
        )}
        {error && <div className="text-sm text-cutoff mt-3">{error}</div>}
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="border border-line bg-surface hover:bg-surface-2 rounded-lg px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !other} className="bg-accent text-white hover:bg-accent-hover rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
            {saving ? "Merging…" : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Shipping details (one record per buyer - GST/IEC/PAN/etc.) ----------------
//
// This IS the format shipping documents (instructions email, BL,
// fumigation/COO/commercial invoice generation) read a buyer's consignee
// details from - the Legal Name shown elsewhere in this table already
// covers the buyer's own name, so it's not repeated here.

const SHIPPING_FIELDS: { key: keyof GstEntry; label: string; wide?: boolean; title?: string }[] = [
  { key: "gst_no", label: "GST No." },
  { key: "iec_code", label: "IEC Code" },
  { key: "pan_no", label: "PAN No." },
  { key: "mobile", label: "Mobile" },
  { key: "email", label: "Email" },
  { key: "description_of_goods", label: "Description of Goods", wide: true },
  { key: "hs_code", label: "H.S. Code" },
  { key: "address", label: "Address", wide: true },
  { key: "transit_destination", label: "Transit Destination", wide: true, title: "For the Instructions email's shipper-declares clause, e.g. KANDLA SPECIAL ECONOMIC ZONE (INKDL6)" },
];

function ShippingDetailsSection({
  buyerPartyId, entry, onChange,
}: { buyerPartyId: string; entry: GstEntry | null; onChange: (entry: GstEntry) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function saveField(field: keyof GstEntry, value: string) {
    setError(null);
    try {
      const res = await fetch("/api/buyer-gst-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer_party_id: buyerPartyId, [field]: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      onChange(json.entry);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-2">
        {SHIPPING_FIELDS.map((f) => (
          <div key={f.key} className={f.wide ? "col-span-3" : ""} title={f.title}>
            <div className="text-xs text-muted mb-0.5">{f.label}</div>
            <ShippingFieldInput value={entry?.[f.key] ?? null} onSave={(v) => saveField(f.key, v)} />
          </div>
        ))}
      </div>
      {error && <div className="text-xs text-cutoff mt-2">{error}</div>}
    </div>
  );
}

function ShippingFieldInput({ value, onSave }: { value: string | null; onSave: (v: string) => Promise<any> }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(val);
      setEditing(false);
    } catch {
      /* error already surfaced by the parent */
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div onClick={() => setEditing(true)} className="cursor-text hover:bg-surface-2 px-1.5 py-1 rounded-lg text-sm border border-transparent">
        {value || <span className="text-muted">—</span>}
      </div>
    );
  }

  return (
    <div className="flex gap-1 items-center">
      <input
        autoFocus
        className="border border-accent rounded-lg px-1.5 py-1 text-sm flex-1 min-w-0 bg-surface"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        disabled={saving}
      />
      <button onClick={save} disabled={saving} className="text-xs bg-accent text-white hover:bg-accent-hover px-1.5 py-1 rounded-lg shrink-0" aria-label="Save">{saving ? "…" : "✓"}</button>
      <button onClick={() => { setEditing(false); setVal(value ?? ""); }} className="text-xs border border-line bg-surface hover:bg-surface-2 px-1.5 py-1 rounded-lg shrink-0" aria-label="Cancel edit">✕</button>
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
          className="border border-line bg-surface rounded-lg px-2 py-1.5 text-sm flex-1"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />
        <button
          onClick={addItem}
          disabled={saving}
          className="bg-accent text-white hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        >
          + Add
        </button>
      </div>
      {error && <div className="text-xs text-cutoff mb-2">{error}</div>}

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <ul className="divide-y divide-line">
          {visible.map((item) => (
            <li
              key={item.id}
              className={`flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-2 ${!item.is_active ? "opacity-40" : ""}`}
            >
              <span className="text-ink">{item.name}</span>
              <button
                onClick={() => toggleActive(item)}
                className={`text-xs px-2 py-1 rounded-lg ${
                  item.is_active ? "text-cutoff hover:bg-critical-soft" : "text-accent hover:bg-accent-soft"
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
