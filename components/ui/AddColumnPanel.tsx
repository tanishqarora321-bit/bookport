"use client";

import { useEffect, useState } from "react";

export type CustomColumnType = "number" | "text" | "date";
export type NewCustomColumn = { id: string; key: string; label: string; value_type: CustomColumnType };

const TYPE_HELP: Record<CustomColumnType, string> = {
  number: "Adds into Total and the USD totals row",
  text: "Free text, e.g. remarks — not added to totals",
  date: "A date field — not added to totals",
};

// Shared "Add Column — 3 steps" panel for every forwarder/trucker
// invoice ledger and its matching Excel-import mapping screen - one
// component so Number/Text/Date behaves identically everywhere instead
// of four separately hand-rolled prompt()/confirm() flows.
export default function AddColumnPanel({
  open,
  onClose,
  defaultName = "",
  columnCount,
  maxColumns,
  entityLabel,
  createEndpoint,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultName?: string;
  columnCount: number;
  maxColumns: number;
  entityLabel: string;
  createEndpoint: string;
  onCreated: (column: NewCustomColumn) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [type, setType] = useState<CustomColumnType>("number");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setType("number");
      setError(null);
    }
  }, [open, defaultName]);

  if (!open) return null;

  const trimmed = name.trim();
  const slotsLeftAfter = Math.max(0, maxColumns - columnCount - 1);
  const atLimit = columnCount >= maxColumns;

  async function handleAdd() {
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (atLimit) {
      setError(`You already have ${maxColumns} custom columns, the maximum.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(createEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed, value_type: type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add column");
      onCreated(json.column);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div className="field" style={{ flex: "1 1 180px", minWidth: 0 }}>
          <label htmlFor="add-col-name">Column name</label>
          <input
            id="add-col-name"
            className="input input-s"
            placeholder="e.g. Port Storage"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
        </div>
        <div className="field" style={{ flex: "0 0 auto" }}>
          <label htmlFor="add-col-type-group">Type</label>
          <div id="add-col-type-group" className="seg" role="radiogroup" aria-label="Column type">
            <button type="button" role="radio" aria-checked={type === "number"} className={type === "number" ? "on" : ""} onClick={() => setType("number")}>
              Number
            </button>
            <button type="button" role="radio" aria-checked={type === "text"} className={type === "text" ? "on" : ""} onClick={() => setType("text")}>
              Text
            </button>
            <button type="button" role="radio" aria-checked={type === "date"} className={type === "date" ? "on" : ""} onClick={() => setType("date")}>
              Date
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flex: "0 0 auto", marginLeft: "auto" }}>
          <button type="button" className="btn btn-s" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-p btn-s" onClick={handleAdd} disabled={saving || !trimmed || atLimit}>
            {saving ? "Adding…" : "Add Column"}
          </button>
        </div>
      </div>
      <span className="help">
        {TYPE_HELP[type]} — appears on every {entityLabel}&apos;s ledger. {slotsLeftAfter} of {maxColumns} slots left.
      </span>
      {error && <span className="err">{error}</span>}
    </section>
  );
}
