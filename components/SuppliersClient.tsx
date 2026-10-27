"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Factory, CheckCircle2, Search } from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";

type Supplier = {
  id: string;
  legal_name: string;
  short_code: string | null;
  country: string | null;
  address: string | null;
  is_active: boolean;
};

export default function SuppliersClient({ initialSuppliers, isAdmin = false }: { initialSuppliers: Supplier[]; isAdmin?: boolean }) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ legal_name: "", short_code: "", country: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [merging, setMerging] = useState<Supplier | null>(null);

  async function addSupplier() {
    if (!form.legal_name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add supplier");
      setSuppliers([...suppliers, json.supplier].sort((a, b) => a.legal_name.localeCompare(b.legal_name)));
      setForm({ legal_name: "", short_code: "", country: "", address: "" });
      setAdding(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Supplier) {
    if (s.is_active && !confirm(`Remove "${s.legal_name}"? Its bookings/invoices stay intact - you can Restore it later from "Show removed".`)) {
      return;
    }
    const res = await fetch(`/api/suppliers/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !s.is_active }),
    });
    if (res.ok) {
      setSuppliers(suppliers.map((x) => (x.id === s.id ? { ...x, is_active: !x.is_active } : x)));
    }
  }

  async function deletePermanently(s: Supplier) {
    if (!confirm(`Permanently delete "${s.legal_name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/suppliers/${s.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "Failed to delete");
      return;
    }
    setSuppliers(suppliers.filter((x) => x.id !== s.id));
  }

  const q = search.trim().toLowerCase();
  const visible = suppliers
    .filter((s) => showInactive || s.is_active)
    .filter(
      (s) =>
        !q ||
        s.legal_name.toLowerCase().includes(q) ||
        (s.short_code ?? "").toLowerCase().includes(q) ||
        (s.country ?? "").toLowerCase().includes(q)
    );

  const visibleIds = visible.map((s) => s.id);
  const bulk = useBulkSelection(visibleIds);
  useEffect(() => {
    bulk.pruneToVisible(new Set(visibleIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds.join(",")]);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  async function bulkDeleteSelected() {
    setBulkDeleting(true);
    setBulkError(null);
    const ids = bulk.selectedIds;
    const succeeded: string[] = [];
    const failures: string[] = [];
    for (const id of ids) {
      const target = suppliers.find((s) => s.id === id);
      const name = target?.legal_name ?? id;
      try {
        if (target?.is_active) {
          const deactivateRes = await fetch(`/api/suppliers/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: false }),
          });
          if (!deactivateRes.ok) {
            const json = await deactivateRes.json().catch(() => ({}));
            failures.push(`${name}: ${json.error || "couldn't remove before deleting"}`);
            continue;
          }
        }
        const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
        if (res.ok) {
          succeeded.push(id);
        } else {
          const json = await res.json().catch(() => ({}));
          failures.push(`${name}: ${json.error || "failed"}`);
        }
      } catch (err: any) {
        failures.push(`${name}: ${err?.message || "network error"}`);
      }
    }
    setSuppliers((prev) => prev.filter((s) => !succeeded.includes(s.id)));
    setBulkDeleting(false);
    setBulkConfirming(false);
    bulk.clear();
    if (failures.length > 0) {
      setBulkError(`${failures.length} of ${ids.length} couldn't be deleted:\n${failures.join("\n")}`);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-ink">Suppliers</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-text-2">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show removed
          </label>
          <Link href="/suppliers/import" className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5 font-medium">
            Import Excel
          </Link>
          <button
            onClick={() => setAdding(!adding)}
            className="text-sm bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg font-medium"
          >
            + New Supplier
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 shrink-0">
        <StatCard icon={Factory} label="Total Suppliers" value={suppliers.length} />
        <StatCard icon={CheckCircle2} label="Active" value={suppliers.filter((s) => s.is_active).length} tone="success" />
      </div>

      {adding && (
        <div className="border border-accent/30 bg-accent/5 rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
          <input
            placeholder="Supplier name *"
            className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm col-span-2"
            value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
          />
          <input
            placeholder="Short code"
            className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm"
            value={form.short_code}
            onChange={(e) => setForm({ ...form, short_code: e.target.value })}
          />
          <input
            placeholder="Country"
            className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
          <textarea
            placeholder="Address"
            className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm col-span-2"
            rows={2}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          {error && <div className="col-span-2 text-xs text-cutoff">{error}</div>}
          <div className="col-span-2 flex gap-2">
            <button onClick={addSupplier} disabled={saving} className="text-sm bg-accent hover:bg-accent-hover text-white px-3 py-1.5 rounded-lg">
              {saving ? "Saving…" : "Save Supplier"}
            </button>
            <button onClick={() => setAdding(false)} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-3 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="relative mb-3 max-w-xs">
        <Search className="w-4 h-4 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" size={16} />
        <input
          placeholder="Search suppliers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-line bg-surface text-ink placeholder:text-muted rounded-lg pl-8 pr-3 py-1.5 text-sm"
        />
      </div>

      {isAdmin && (
        <BulkActionBar
          count={bulk.selectedCount}
          itemLabel="supplier"
          onDeleteClick={() => setBulkConfirming(true)}
          onClear={bulk.clear}
          deleting={bulkDeleting}
        />
      )}

      <div className="bg-surface border border-line rounded-xl">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-muted border-b border-line">
              {isAdmin && (
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" aria-label="Select all suppliers" checked={bulk.allVisibleSelected} onChange={bulk.toggleAll} />
                </th>
              )}
              <th className="px-3 py-2">Supplier Name</th>
              <th className="px-3 py-2">Short Code</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} className={`border-b border-line last:border-0 hover:bg-surface-2 ${!s.is_active ? "opacity-40" : ""}`}>
                {isAdmin && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${s.legal_name}`}
                      checked={bulk.selected.has(s.id)}
                      onChange={() => bulk.toggle(s.id)}
                    />
                  </td>
                )}
                <td className="px-3 py-2 font-medium text-ink">{s.legal_name}</td>
                <td className="px-3 py-2 text-text-2">{s.short_code || "—"}</td>
                <td className="px-3 py-2 text-text-2">{s.country || "—"}</td>
                <td className="px-3 py-2 text-muted max-w-[260px] truncate" title={s.address ?? ""}>
                  {s.address || "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <button onClick={() => setEditing(s)} className="text-xs text-muted hover:text-accent border border-line hover:bg-surface-2 rounded-lg px-2 py-1">
                    Edit
                  </button>
                  {suppliers.length > 1 && (
                    <button onClick={() => setMerging(s)} className="text-xs text-muted hover:text-accent border border-line hover:bg-surface-2 rounded-lg px-2 py-1 ml-1">
                      Merge
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/suppliers/${s.id}/invoices`} className="text-xs text-accent underline">
                    Invoices →
                  </Link>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => toggleActive(s)}
                    className={`text-xs px-2 py-1 rounded-lg ${
                      s.is_active ? "text-cutoff hover:bg-critical-soft" : "text-accent hover:bg-accent-soft"
                    }`}
                  >
                    {s.is_active ? "Remove" : "Restore"}
                  </button>
                  {!s.is_active && (
                    <button
                      onClick={() => deletePermanently(s)}
                      className="text-xs px-2 py-1 rounded-lg text-cutoff hover:bg-critical-soft font-medium"
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
          <EmptyState
            icon={Factory}
            title={suppliers.length === 0 ? "No suppliers yet" : "No suppliers match"}
            hint={suppliers.length === 0 ? 'Click "+ New Supplier" above to add one.' : "Try a different search term."}
          />
        )}
      </div>

      {editing && (
        <EditSupplierModal
          supplier={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setSuppliers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)).sort((a, b) => a.legal_name.localeCompare(b.legal_name)));
            setEditing(null);
          }}
        />
      )}

      {merging && (
        <MergeSuppliersModal
          supplier={merging}
          allSuppliers={suppliers}
          onClose={() => setMerging(null)}
          onMerged={(mergedAwayId, finalFields) => {
            setSuppliers((prev) =>
              prev
                .filter((x) => x.id !== mergedAwayId)
                .map((x) => (x.id === merging.id ? { ...x, ...finalFields } : x))
                .sort((a, b) => a.legal_name.localeCompare(b.legal_name))
            );
            setMerging(null);
          }}
        />
      )}

      {bulkConfirming && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => !bulkDeleting && setBulkConfirming(false)}>
          <div className="bg-surface border border-line rounded-xl shadow-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink mb-2">
              Delete {bulk.selectedCount} supplier{bulk.selectedCount === 1 ? "" : "s"}?
            </h2>
            <p className="text-sm text-muted">
              This permanently removes each selected supplier. Any still linked to a booking/invoice fails to delete and is
              reported rather than removed - clear that link first if it really needs to go.
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setBulkConfirming(false)} disabled={bulkDeleting} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-4 py-2">
                Cancel
              </button>
              <button onClick={bulkDeleteSelected} disabled={bulkDeleting} className="text-sm bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60">
                {bulkDeleting ? "Deleting…" : `Delete ${bulk.selectedCount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkError && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setBulkError(null)}>
          <div className="bg-surface border border-line rounded-xl shadow-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-ink mb-2">Some deletes failed</h2>
            <p className="text-sm text-muted whitespace-pre-wrap">{bulkError}</p>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setBulkError(null)} className="text-sm bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// This name/short code/country/address is read everywhere a supplier is
// picked or displayed (Booking & Instructions, the invoice ledger, etc.)
// - all of those read parties.legal_name live via the supplier's id, not
// a copied string, so a save here is visible everywhere else the next
// time that page loads. Edit -> review -> Save, same as Forwarders,
// rather than a click-to-edit-per-field that's too easy to trigger by
// accident on data this widely shared.
function EditSupplierModal({
  supplier, onClose, onSaved,
}: { supplier: Supplier; onClose: () => void; onSaved: (s: Supplier) => void }) {
  const [form, setForm] = useState({
    legal_name: supplier.legal_name,
    short_code: supplier.short_code ?? "",
    country: supplier.country ?? "",
    address: supplier.address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form.legal_name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      onSaved(json.supplier);
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
          <h2 className="text-lg font-semibold text-ink">Edit Supplier</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close dialog">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted mb-0.5">Supplier Name *</div>
            <input
              className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm w-full"
              value={form.legal_name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted mb-0.5">Short Code</div>
              <input
                className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm w-full"
                value={form.short_code}
                onChange={(e) => setForm({ ...form, short_code: e.target.value })}
              />
            </div>
            <div>
              <div className="text-xs text-muted mb-0.5">Country</div>
              <input
                className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm w-full"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-muted mb-0.5">Address</div>
            <textarea
              className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm w-full"
              rows={2}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
        </div>

        {error && <div className="text-sm text-cutoff mt-3">{error}</div>}

        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-4 py-2">Cancel</button>
          <button onClick={save} disabled={saving} className="text-sm bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Merges a duplicate supplier into this one. All of the other supplier's
// bookings/invoices move onto the surviving record and the duplicate is
// permanently removed - done server-side as one atomic operation (the
// same merge_parties() function Forwarders already uses, migration
// 0019 - role-agnostic, so this needed no backend change).
function MergeSuppliersModal({
  supplier, allSuppliers, onClose, onMerged,
}: {
  supplier: Supplier;
  allSuppliers: Supplier[];
  onClose: () => void;
  onMerged: (mergedAwayId: string, finalFields: { legal_name: string; short_code: string | null; country: string | null; address: string | null }) => void;
}) {
  const others = allSuppliers.filter((s) => s.id !== supplier.id);
  const [otherId, setOtherId] = useState(others[0]?.id ?? "");
  const other = others.find((s) => s.id === otherId) ?? null;
  const [form, setForm] = useState({
    legal_name: supplier.legal_name,
    short_code: supplier.short_code ?? "",
    country: supplier.country ?? "",
    address: supplier.address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useThisDetails() {
    setForm({ legal_name: supplier.legal_name, short_code: supplier.short_code ?? "", country: supplier.country ?? "", address: supplier.address ?? "" });
  }
  function useOtherDetails() {
    if (!other) return;
    setForm({ legal_name: other.legal_name, short_code: other.short_code ?? "", country: other.country ?? "", address: other.address ?? "" });
  }

  async function save() {
    if (!other) {
      setError("Pick which supplier to merge in.");
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
        body: JSON.stringify({ keepId: supplier.id, mergeId: other.id, ...form }),
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
          <h2 className="text-lg font-semibold text-ink">Merge Suppliers</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close dialog">✕</button>
        </div>
        <p className="text-sm text-muted mb-3">
          Moves all bookings and invoices from the other supplier onto this one, then permanently removes it as a
          separate entry.
        </p>

        <div className="mb-3">
          <div className="text-xs text-muted mb-0.5">Merge which supplier into "{supplier.legal_name}"?</div>
          <select className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm w-full" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>{s.legal_name}</option>
            ))}
          </select>
        </div>

        {other && (
          <>
            <div className="grid grid-cols-2 gap-3 text-xs bg-surface-2 rounded-lg p-3 mb-3">
              <div>
                <div className="font-medium text-ink mb-1">{supplier.legal_name}</div>
                <div className="text-muted">Short code: {supplier.short_code || "—"}</div>
                <div className="text-muted">Country: {supplier.country || "—"}</div>
                <div className="text-muted">Address: {supplier.address || "—"}</div>
                <button onClick={useThisDetails} className="mt-1 text-accent hover:underline">Use these details</button>
              </div>
              <div>
                <div className="font-medium text-ink mb-1">{other.legal_name}</div>
                <div className="text-muted">Short code: {other.short_code || "—"}</div>
                <div className="text-muted">Country: {other.country || "—"}</div>
                <div className="text-muted">Address: {other.address || "—"}</div>
                <button onClick={useOtherDetails} className="mt-1 text-accent hover:underline">Use these details</button>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="text-xs text-muted mb-0.5">Final Name *</div>
                <input
                  className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm w-full"
                  value={form.legal_name}
                  onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted mb-0.5">Final Short Code</div>
                  <input
                    className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm w-full"
                    value={form.short_code}
                    onChange={(e) => setForm({ ...form, short_code: e.target.value })}
                  />
                </div>
                <div>
                  <div className="text-xs text-muted mb-0.5">Final Country</div>
                  <input
                    className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm w-full"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <div className="text-xs text-muted mb-0.5">Final Address</div>
                <textarea
                  className="border border-line bg-surface text-ink placeholder:text-muted rounded-lg px-2 py-1.5 text-sm w-full"
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
          <button onClick={onClose} className="text-sm border border-line bg-surface hover:bg-surface-2 rounded-lg px-4 py-2">Cancel</button>
          <button onClick={save} disabled={saving || !other} className="text-sm bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60">
            {saving ? "Merging…" : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
