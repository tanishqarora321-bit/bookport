"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/EditableCell";

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
    <section className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="h2">Add Column — 3 steps</h2>
        <button type="button" onClick={onClose} className="ib" aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StepNumber n={1} />
            <b style={{ fontSize: 13 }}>Name</b>
          </div>
          <div className="field">
            <label htmlFor="add-col-name">New column name:</label>
            <input
              id="add-col-name"
              className="input input-s"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
        </div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StepNumber n={2} />
            <b style={{ fontSize: 13 }}>Type</b>
          </div>
          <div className="seg" role="radiogroup" aria-label="Column type">
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
          <span className="help">{TYPE_HELP[type]}</span>
        </div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StepNumber n={3} />
            <b style={{ fontSize: 13 }}>Confirm</b>
          </div>
          <span className="lbl">
            {trimmed ? `"${trimmed}"` : "This column"} appears on every {entityLabel}&apos;s ledger. {slotsLeftAfter} of {maxColumns} column slots left.
          </span>
          {error && <span className="err">{error}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-xs" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn btn-p btn-xs" onClick={handleAdd} disabled={saving || !trimmed || atLimit}>
              {saving ? "Adding…" : "Add column"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 700,
        background: "var(--accentS)",
        color: "var(--accent)",
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  );
}
