"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FieldKey = "erd" | "si_cutoff" | "cargo_cutoff" | "carrier";
type Amendment = { version: number; changed_fields: Record<string, { old: any; new: any }>; reason: string | null; created_at: string };

const FIELDS: { key: FieldKey; label: string; hint: string; isDate: boolean }[] = [
  { key: "erd", label: "ERD", hint: "Departure readiness", isDate: true },
  { key: "si_cutoff", label: "DOC Cut Off", hint: "Documentation deadline", isDate: true },
  { key: "cargo_cutoff", label: "Cargo Cut Off", hint: "Cargo delivery deadline", isDate: true },
  { key: "carrier", label: "Shipping Line", hint: "Assigned carrier", isDate: false },
];
const LABEL: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

// A stored date that doesn't parse is shown as such ("Not set" + a hint to
// amend it), never silently turned into "Invalid Date" or a guessed value.
function fmtDate(v: string | null): { text: string; invalid: boolean } {
  if (!v) return { text: "Not set", invalid: false };
  const d = new Date(v);
  if (isNaN(d.getTime())) return { text: "Not set", invalid: true };
  return { text: d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }), invalid: false };
}
function fmtValue(key: string, v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  return FIELDS.find((f) => f.key === key)?.isDate ? fmtDate(String(v)).text : String(v);
}
// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
function toLocalInput(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Dates & Cut-offs with the amendment workflow. Nothing is saved when
// Amend is clicked: the editor first CHECKS the change (the amendments API
// in preview mode reports what it affects - trucking pickups, SI deadline,
// instructions already sent) and only saves on an explicit second click,
// as a new booking version with the reason in the amendment history.
export default function DatesCard({
  bookingId,
  version,
  values,
  amendments,
  hasTrucking,
}: {
  bookingId: string;
  version: number;
  values: Record<FieldKey, string | null>;
  amendments: Amendment[];
  hasTrucking: boolean;
}) {
  const router = useRouter();
  const [field, setField] = useState<FieldKey | null>(null);
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const def = FIELDS.find((f) => f.key === field) ?? null;

  function openEditor(key: FieldKey) {
    const f = FIELDS.find((x) => x.key === key)!;
    setField(key);
    setNewValue(f.isDate ? toLocalInput(values[key]) : values[key] ?? "");
    setReason("");
    setImpact(null);
    setError(null);
  }
  function close() {
    setField(null);
    setImpact(null);
    setError(null);
  }

  async function call(preview: boolean) {
    if (!def) return;
    if (!newValue.trim()) return setError(def.isDate ? "Pick the new date and time." : "Enter the new value.");
    if (!reason.trim()) return setError("A reason is required.");
    const payloadValue = def.isDate ? new Date(newValue).toISOString() : newValue.trim();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/amendments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId, field: def.key, new_value: payloadValue, reason: reason.trim(), preview, expected_version: version }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't check this amendment");
      if (preview) {
        setImpact(json.impact ?? []);
      } else {
        close();
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 className="h2">Dates &amp; Cut-offs</h2>
          <p className="lbl" style={{ margin: "4px 0 0" }}>Changes are recorded as amendments and checked against dependent workflows.</p>
        </div>
        <span className="badge b-acc">Version {version}</span>
      </div>

      <div className="dates-grid">
        {FIELDS.map((f) => {
          const raw = values[f.key];
          const shown = f.isDate ? fmtDate(raw) : { text: raw || "Not set", invalid: false };
          const warn = f.key === "cargo_cutoff" && hasTrucking;
          const active = field === f.key;
          return (
            <div
              key={f.key}
              style={{
                border: `1px solid ${active ? "var(--accent)" : warn ? "var(--warnB)" : "var(--line)"}`,
                background: warn ? "var(--warnS)" : "var(--surf)",
                borderRadius: 10,
                padding: 13,
                minHeight: 92,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div>
                <div className="meta" style={{ marginBottom: 6 }}>{f.label}</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: raw && !shown.invalid ? "var(--tx)" : "var(--mut)", overflowWrap: "anywhere" }}>{shown.text}</div>
                {shown.invalid && <div className="meta" style={{ color: "var(--crit)", marginTop: 2 }}>Stored value isn&apos;t a valid date - amend to fix</div>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span className="meta" style={warn ? { color: "var(--warn)" } : undefined}>{warn ? "⚠ Change affects trucking" : f.hint}</span>
                <button
                  type="button"
                  onClick={() => openEditor(f.key)}
                  style={{ border: 0, background: "none", padding: 0, color: "var(--accent)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Amend
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {def && (
        <div style={{ marginTop: 16, padding: 16, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>Amend {def.label}</b>
            <span className="meta">Current v{version} → proposed v{version + 1}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <div className="field">
              <label htmlFor="amend-value">New value</label>
              <input
                id="amend-value"
                className="input"
                type={def.isDate ? "datetime-local" : "text"}
                value={newValue}
                onChange={(e) => {
                  setNewValue(e.target.value);
                  setImpact(null);
                }}
              />
              <span className="meta">Previous: {fmtValue(def.key, values[def.key])}</span>
            </div>
            <div className="field">
              <label htmlFor="amend-reason">
                Reason for amendment <span className="req">*</span>
              </label>
              <textarea
                id="amend-reason"
                className="input"
                rows={2}
                style={{ height: "auto", paddingTop: 8, paddingBottom: 8, resize: "vertical" }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this change needed?"
              />
            </div>
          </div>

          {impact && (
            <div className={`banner ${impact.length > 0 ? "bn-warn" : ""}`} style={{ marginTop: 12, flexDirection: "column", alignItems: "stretch", gap: 6, ...(impact.length === 0 ? { background: "var(--okS)", border: "1px solid var(--ok)", color: "var(--ok)" } : {}) }}>
              <b style={{ fontSize: 13 }}>{impact.length > 0 ? "Impact review - this change affects:" : "No dependent workflows are affected."}</b>
              {impact.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {impact.map((i, idx) => (
                    <li key={idx}>{i}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={close} disabled={busy} className="btn btn-s">Cancel</button>
            {impact === null ? (
              <button type="button" onClick={() => call(true)} disabled={busy} className="btn btn-s btn-p">
                {busy ? "Checking…" : "Check"}
              </button>
            ) : (
              <button type="button" onClick={() => call(false)} disabled={busy} className="btn btn-s btn-p">
                {busy ? "Saving…" : impact.length > 0 ? `I've reviewed this - Save as v${version + 1}` : `Save as v${version + 1}`}
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--line)", marginTop: 18, paddingTop: 14 }}>
        <div className="meta" style={{ letterSpacing: "0.07em", fontWeight: 600, marginBottom: 10 }}>AMENDMENT HISTORY</div>
        {amendments.length === 0 ? (
          <p className="meta" style={{ margin: 0 }}>No amendments yet - this booking is on its original values.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {amendments.map((a) => {
              const [key, change] = (Object.entries(a.changed_fields ?? {})[0] ?? ["", { old: null, new: null }]) as [string, { old: any; new: any }];
              return (
                <div key={a.version} style={{ display: "flex", gap: 10, fontSize: 13 }}>
                  <span className="badge b-acc" style={{ flexShrink: 0 }}>v{a.version}</span>
                  <div>
                    <b>
                      {LABEL[key] ?? key.replace(/_/g, " ")}: {fmtValue(key, change?.old)} → {fmtValue(key, change?.new)}
                    </b>
                    <div className="meta" style={{ marginTop: 2 }}>
                      {new Date(a.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
