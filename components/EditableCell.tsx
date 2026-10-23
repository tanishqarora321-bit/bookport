"use client";

import { useEffect, useState } from "react";

function formatDate(value: string, isDateTime: boolean) {
  const d = new Date(value);
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    ...(isDateTime ? { hour: "2-digit", minute: "2-digit" } : {})
  });
}

// SECURITY/UX FIX: editing used to open on a plain click anywhere in the
// cell, which meant a stray click while just reading the table could put
// a cell into edit mode. Now the display state renders plain text with a
// pencil icon that only shows on hover -- editing opens ONLY from clicking
// that pencil, never from clicking the cell itself.
export default function EditableCell({
  bookingId, column, value, isDate = false, highlight = false, sticky = false, bold = false
}: { bookingId: string; column: string; value: string | null; isDate?: boolean; highlight?: boolean; sticky?: boolean; bold?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Owns the displayed value locally after a successful save instead of
  // reloading the whole page to pick up the new value from the server -
  // that reload (there purely because this cell has no way to tell its
  // parent what changed) briefly showed a blank white page on every
  // single edit anywhere this component is used (40+ call sites). Synced
  // back to the `value` prop below so an update from elsewhere (e.g. a
  // sibling action's router.refresh()) still overrides this once fresh
  // data actually arrives, rather than this cell clinging to a stale save.
  const [savedValue, setSavedValue] = useState(value);
  useEffect(() => {
    setSavedValue(value);
  }, [value]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [column]: val })
      });
      // A non-JSON or empty body (e.g. a route with no handler for this
      // method) shouldn't surface as an opaque "Unexpected end of JSON
      // input" - fall back to the raw status so the real problem is
      // visible instead.
      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON body, fall through to status */ }
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`);
      setSavedValue(val);
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setVal(savedValue ?? "");
    setEditing(false);
    setError(null);
  }

  const display = savedValue ? (isDate ? formatDate(savedValue, savedValue.includes("T")) : savedValue) : "—";

  const stickyClass = sticky ? "stk2" : "";

  if (!editing) {
    return (
      <td className={`${stickyClass} ${highlight ? "num" : ""}`.trim()} style={highlight ? { color: "var(--crit)", fontWeight: 500 } : undefined}>
        <span className={display === "—" ? "dash" : ""} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: bold ? 700 : undefined }}>
          {display}
          <button onClick={() => { setVal(savedValue ?? ""); setEditing(true); }} aria-label="Edit" className="pen" style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", display: "inline-flex" }}>
            <PencilIcon />
          </button>
        </span>
      </td>
    );
  }

  return (
    <td className={stickyClass} style={{ minWidth: 180 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          autoFocus
          type={isDate ? "datetime-local" : "text"}
          className="input input-s"
          style={{ width: "auto", flex: 1, borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accentS)" }}
          value={isDate && val ? val.slice(0, 16) : val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} aria-label="Save" className="ib" style={{ background: "var(--accent)", color: "var(--onAccent)" }}>
          <CheckIcon />
        </button>
        <button onClick={cancel} disabled={saving} aria-label="Cancel" className="ib">
          <CloseIcon />
        </button>
      </div>
      {error && <div className="err" style={{ marginTop: 4 }}>{error}</div>}
    </td>
  );
}

// Shared tiny icons matching design-v2/SPEC.md's cell-editing reference
// (16px stroke 1.8-2.6 inline SVG, aria-hidden).
export function PencilIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
    </svg>
  );
}
export function CheckIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
export function CloseIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
