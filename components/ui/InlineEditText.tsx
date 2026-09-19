"use client";

import { useState } from "react";

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
        className="cursor-text hover:bg-blue-50 px-1 -mx-1 rounded block"
        title="Click to edit"
      >
        {value || <span className="text-slate-300">{placeholder}</span>}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        className="border border-accent rounded px-1.5 py-0.5 text-sm w-full min-w-[100px]"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        disabled={saving}
      />
      <button onClick={save} disabled={saving} className="text-xs bg-ink text-white px-1.5 py-0.5 rounded shrink-0">
        {saving ? "…" : "✓"}
      </button>
      <button
        onClick={() => {
          setVal(value ?? "");
          setEditing(false);
          setError(null);
        }}
        className="text-xs border px-1.5 py-0.5 rounded shrink-0"
      >
        ✕
      </button>
      {error && <span className="text-xs text-cutoff">{error}</span>}
    </div>
  );
}
