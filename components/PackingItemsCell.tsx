"use client";

import { useRef, useState } from "react";
import { CloseIcon } from "@/components/EditableCell";

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
    return <td className="dash">—</td>;
  }

  const summary =
    items.length === 0
      ? "+ Packing Details"
      : `${items.length} line${items.length > 1 ? "s" : ""}`;

  return (
    <td style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: items.length === 0 ? "var(--tx2)" : "var(--accent)", textDecoration: "underline", font: "inherit", fontSize: 13 }}>
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
    <div className="menu" role="dialog" aria-label="Packing details" style={{ position: "absolute", zIndex: 30, marginTop: 4, width: "26rem", padding: 14, display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: 14 }}>Seal No / Weight / Bales</b>
        <button onClick={onClose} aria-label="Close packing details" className="ib">
          <CloseIcon />
        </button>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4, maxHeight: 192, overflow: "auto" }}>
        {items.map((it) => (
          <li key={it.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.7fr 0.7fr 1.6fr 32px", gap: 6, alignItems: "center", background: "var(--surf2)", borderRadius: 7, padding: "6px 8px" }}>
            <input
              defaultValue={it.seal_no ?? ""}
              placeholder="Seal No"
              aria-label="Seal No"
              className="input input-s mono"
              onBlur={(e) => e.target.value !== (it.seal_no ?? "") && updateItem(it.id, { seal_no: e.target.value })}
            />
            <input
              defaultValue={it.weight ?? ""}
              placeholder="Weight"
              aria-label="Weight"
              className="input input-s num"
              onBlur={(e) => Number(e.target.value || 0) !== (it.weight ?? 0) && updateItem(it.id, { weight: e.target.value as any })}
            />
            <select
              value={it.weight_unit}
              onChange={(e) => updateItem(it.id, { weight_unit: e.target.value as any })}
              aria-label="Unit"
              className="select select-s"
            >
              <option value="LBS">LBS</option>
              <option value="KG">KG</option>
            </select>
            <input
              defaultValue={it.bales ?? ""}
              placeholder="Bales"
              aria-label="Bales"
              className="input input-s num"
              onBlur={(e) => Number(e.target.value || 0) !== (it.bales ?? 0) && updateItem(it.id, { bales: e.target.value as any })}
            />
            <input
              defaultValue={it.description ?? ""}
              placeholder="Description"
              aria-label="Description"
              className="input input-s"
              onBlur={(e) => e.target.value !== (it.description ?? "") && updateItem(it.id, { description: e.target.value })}
            />
            <button onClick={() => removeItem(it.id)} aria-label="Remove line" className="ib">
              <CloseIcon />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="meta">No lines yet.</li>}
      </ul>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.7fr 0.7fr 1.6fr auto", gap: 6, paddingTop: 10, borderTop: "1px dashed var(--line2)" }}>
        <input
          placeholder="Seal No"
          aria-label="New Seal No"
          className="input input-s"
          value={draft.seal_no}
          onChange={(e) => setDraft({ ...draft, seal_no: e.target.value })}
        />
        <input
          placeholder="Weight"
          aria-label="New Weight"
          className="input input-s"
          value={draft.weight}
          onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
        />
        <select
          value={draft.weight_unit}
          onChange={(e) => setDraft({ ...draft, weight_unit: e.target.value as any })}
          aria-label="New unit"
          className="select select-s"
        >
          <option value="LBS">LBS</option>
          <option value="KG">KG</option>
        </select>
        <input
          placeholder="Bales"
          aria-label="New Bales"
          className="input input-s"
          value={draft.bales}
          onChange={(e) => setDraft({ ...draft, bales: e.target.value })}
        />
        <input
          placeholder="Description (optional)"
          aria-label="New Description"
          className="input input-s"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />
        <button onClick={addItem} disabled={saving} className="btn btn-s btn-p">
          {saving ? "Adding…" : "✓ Add Line"}
        </button>
      </div>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="sr"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={extracting}
          style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--accent)", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 3H6v18h12V7zM14 3v4h4M12 11v6M9 14l3-3 3 3" />
          </svg>
          {extracting ? "Reading packing list…" : "Or upload packing list PDF to auto-fill above"}
        </button>
      </div>
      {error && <div className="err">{error}</div>}
    </div>
  );
}
