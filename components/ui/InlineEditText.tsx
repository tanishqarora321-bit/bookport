"use client";

import { useState } from "react";
import { CheckIcon, CloseIcon } from "@/components/EditableCell";

// Click-to-edit table cell with explicit Save/Cancel, same interaction
// model as EditableCell/EditableTd elsewhere in the app. Used in place
// of the native `prompt()` dialogs that Parties/Forwarders/Truckers
// used for editing - a prompt() has no room for showing a save error
// and doesn't match the rest of the app's editing pattern.
export default function InlineEditText({
  value,
  onSave,
  placeholder = "—",
}: {
  value: string | null;
  onSave: (v: string) => Promise<any>;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(val.trim());
      setEditing(false);
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        style={{ cursor: "text", display: "block", borderRadius: 6, padding: "0 4px", margin: "0 -4px" }}
        title="Click to edit"
      >
        {value || <span className="dash">{placeholder}</span>}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <input
        autoFocus
        className="input input-s"
        style={{ width: "auto", minWidth: 100, flex: 1, borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accentS)" }}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        disabled={saving}
      />
      <button onClick={save} disabled={saving} aria-label="Save" className="ib" style={{ background: "var(--accent)", color: "var(--onAccent)" }}>
        <CheckIcon />
      </button>
      <button
        onClick={() => {
          setVal(value ?? "");
          setEditing(false);
          setError(null);
        }}
        aria-label="Cancel"
        className="ib"
      >
        <CloseIcon />
      </button>
      {error && <span className="err">{error}</span>}
    </div>
  );
}
