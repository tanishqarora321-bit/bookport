"use client";

import { useRef, useState } from "react";

export type PackingItem = {
  id: string;
  seal_no: string | null;
  weight: number | null;
  weight_unit: "LBS" | "KG";
  bales: number | null;
  description: string | null;
  sort_order: number;
};

// "Treated as a cost section" per spec - a container can carry more than
// one Seal No/Weight/Bales line (e.g. a re-sealed or mixed-cargo
// container), so this is an expandable popover with add/edit/delete,
// same shape as the Supplier module's cost-section popover. Entries can
// come from manual typing OR from uploading the packing list PDF -
// extraction only fills the draft row, it never saves on its own.
export default function PackingItemsCell({
  containerId,
  items,
  onItemsChange,
}: {
  containerId: string | null;
  items: PackingItem[];
  onItemsChange: (items: PackingItem[]) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!containerId) {
    return <td className="px-3 py-2 text-sm whitespace-nowrap text-ink/30">—</td>;
  }

  const summary =
    items.length === 0
      ? "+ Packing Details"
      : `${items.length} line${items.length > 1 ? "s" : ""}`;

  return (
    <td className="px-3 py-2 whitespace-nowrap relative">
      <button onClick={() => setOpen(!open)} className="text-xs text-accent underline">
        {summary}
      </button>
      {open && (
        <PackingPopover
          containerId={containerId}
          items={items}
          onClose={() => setOpen(false)}
          onItemsChange={onItemsChange}
        />
      )}
    </td>
  );
}

function PackingPopover({
  containerId,
  items,
  onClose,
  onItemsChange,
}: {
  containerId: string;
  items: PackingItem[];
  onClose: () => void;
  onItemsChange: (items: PackingItem[]) => void;
}) {
  const [draft, setDraft] = useState({ seal_no: "", weight: "", weight_unit: "LBS" as "LBS" | "KG", bales: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addItem() {
    if (!draft.seal_no.trim() && !draft.weight && !draft.bales) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/containers/${containerId}/packing-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add");
      onItemsChange([...items, json.item]);
      setDraft({ seal_no: "", weight: "", weight_unit: "LBS", bales: "", description: "" });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(itemId: string, patch: Partial<PackingItem>) {
    const res = await fetch(`/api/containers/${containerId}/packing-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (res.ok) onItemsChange(items.map((i) => (i.id === itemId ? json.item : i)));
  }

  async function removeItem(itemId: string) {
    const res = await fetch(`/api/containers/${containerId}/packing-items/${itemId}`, { method: "DELETE" });
    if (res.ok) onItemsChange(items.filter((i) => i.id !== itemId));
  }

  async function handleFile(file: File) {
    setExtracting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/containers/${containerId}/packing-items/extract`, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Extraction failed");
      const ex = json.extracted ?? {};
      setDraft({
        seal_no: ex.seal_no ?? "",
        weight: ex.weight != null ? String(ex.weight) : "",
        weight_unit: ex.weight_unit === "KG" ? "KG" : "LBS",
        bales: ex.bales != null ? String(ex.bales) : "",
        description: "",
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="absolute z-30 mt-1 w-[26rem] bg-white border rounded-lg shadow-lg p-3 text-left">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-ink/60">Seal No / Weight / Bales</span>
        <button onClick={onClose} title="Close" className="text-ink/40 hover:text-ink text-sm">
          ✕
        </button>
      </div>

      <ul className="space-y-1 mb-2 max-h-48 overflow-auto">
        {items.map((it) => (
          <li key={it.id} className="grid grid-cols-[1fr_1fr_50px_1fr_auto] gap-1 items-center text-xs bg-slate-50 rounded px-2 py-1.5">
            <input
              defaultValue={it.seal_no ?? ""}
              placeholder="Seal No"
              className="border rounded px-1 py-0.5 text-xs w-full"
              onBlur={(e) => e.target.value !== (it.seal_no ?? "") && updateItem(it.id, { seal_no: e.target.value })}
            />
            <div className="flex gap-0.5">
              <input
                defaultValue={it.weight ?? ""}
                placeholder="Weight"
                className="border rounded px-1 py-0.5 text-xs w-full"
                onBlur={(e) => Number(e.target.value || 0) !== (it.weight ?? 0) && updateItem(it.id, { weight: e.target.value as any })}
              />
              <select
                value={it.weight_unit}
                onChange={(e) => updateItem(it.id, { weight_unit: e.target.value as any })}
                className="border rounded text-xs"
              >
                <option value="LBS">LBS</option>
                <option value="KG">KG</option>
              </select>
            </div>
            <input
              defaultValue={it.bales ?? ""}
              placeholder="Bales"
              className="border rounded px-1 py-0.5 text-xs w-full"
              onBlur={(e) => Number(e.target.value || 0) !== (it.bales ?? 0) && updateItem(it.id, { bales: e.target.value as any })}
            />
            <input
              defaultValue={it.description ?? ""}
              placeholder="Description"
              className="border rounded px-1 py-0.5 text-xs w-full"
              onBlur={(e) => e.target.value !== (it.description ?? "") && updateItem(it.id, { description: e.target.value })}
            />
            <button onClick={() => removeItem(it.id)} className="text-cutoff text-xs shrink-0">
              ✕
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-ink/40">No lines yet.</li>}
      </ul>

      <div className="mb-2 border border-slate-200 rounded p-2 bg-slate-50/50">
        <div className="grid grid-cols-[1fr_1fr_50px_1fr] gap-1 mb-1">
          <input
            placeholder="Seal No"
            className="border rounded px-1 py-1 text-xs w-full"
            value={draft.seal_no}
            onChange={(e) => setDraft({ ...draft, seal_no: e.target.value })}
          />
          <input
            placeholder="Weight"
            className="border rounded px-1 py-1 text-xs w-full"
            value={draft.weight}
            onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
          />
          <select
            value={draft.weight_unit}
            onChange={(e) => setDraft({ ...draft, weight_unit: e.target.value as any })}
            className="border rounded text-xs"
          >
            <option value="LBS">LBS</option>
            <option value="KG">KG</option>
          </select>
          <input
            placeholder="Bales"
            className="border rounded px-1 py-1 text-xs w-full"
            value={draft.bales}
            onChange={(e) => setDraft({ ...draft, bales: e.target.value })}
          />
        </div>
        <div className="flex gap-1">
          <input
            placeholder="Description (optional)"
            className="border rounded px-1 py-1 text-xs flex-1"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          <button
            onClick={addItem}
            disabled={saving}
            className="text-xs font-medium bg-ink text-white px-3 py-1 rounded shrink-0 disabled:opacity-50"
          >
            {saving ? "Adding…" : "✓ Add Line"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t pt-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={extracting}
          className="text-xs text-accent underline"
        >
          {extracting ? "Reading packing list…" : "Or upload packing list PDF to auto-fill above"}
        </button>
      </div>
      {error && <div className="text-xs text-cutoff mt-1">{error}</div>}
    </div>
  );
}
