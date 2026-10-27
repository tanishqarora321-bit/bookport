"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloseIcon } from "@/components/EditableCell";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";

type ColumnDef = { key: string; label: string; kind: string; hidden?: boolean };
type OfferSheetType = { id: string; name: string; columns: ColumnDef[]; created_at: string };
type Sheet = { id: string; title: string; period: string | null; notes: string | null; created_at: string; row_count: number };

function fmtPeriod(p: string | null) {
  if (!p) return "—";
  return new Date(p + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function OfferSheetsListClient({
  types,
  selectedTypeId,
  sheets,
  isAdmin = false,
}: {
  types: OfferSheetType[];
  selectedTypeId: string | null;
  sheets: Sheet[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [creatingSection, setCreatingSection] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const selectedType = types.find((t) => t.id === selectedTypeId);

  const visibleSheetIds = useMemo(() => sheets.map((s) => s.id), [sheets]);
  const bulk = useBulkSelection(visibleSheetIds);
  useEffect(() => {
    bulk.pruneToVisible(new Set(visibleSheetIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSheetIds.join(",")]);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  async function bulkDeleteSelected() {
    setBulkDeleting(true);
    setBulkError(null);
    const ids = bulk.selectedIds;
    let succeededCount = 0;
    const failures: string[] = [];
    for (const id of ids) {
      const target = sheets.find((s) => s.id === id);
      const name = target?.title ?? id;
      try {
        const res = await fetch(`/api/offer-sheets/${id}`, { method: "DELETE" });
        if (res.ok) {
          succeededCount++;
        } else {
          const json = await res.json().catch(() => ({}));
          failures.push(`${name}: ${json.error || "failed"}`);
        }
      } catch (err: any) {
        failures.push(`${name}: ${err?.message || "network error"}`);
      }
    }
    setBulkDeleting(false);
    setBulkConfirming(false);
    bulk.clear();
    if (succeededCount > 0) router.refresh();
    if (failures.length > 0) {
      setBulkError(`${failures.length} of ${ids.length} couldn't be deleted:\n${failures.join("\n")}`);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="h1">Offer Sheet</h1>
          <p className="sub">Costing sections you define — each with its own columns and formulas</p>
        </div>
        <button onClick={() => setCreatingSection(true)} className="btn btn-p">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Section
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        <section className="card" aria-labelledby="secs" style={{ flex: "1 1 240px", minWidth: 0, padding: 12 }}>
          <h2 id="secs" className="meta" style={{ margin: "4px 8px 8px", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            Sections
          </h2>
          {types.map((t) => (
            <button
              key={t.id}
              onClick={() => router.push(`/offer-sheets?type=${t.id}`)}
              aria-current={t.id === selectedTypeId}
              className={`secbtn${t.id === selectedTypeId ? " on" : ""}`}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3h14v18H5zM5 9h14M5 15h14M12 9v12" />
              </svg>
              <span style={{ flex: 1 }}>{t.name}</span>
            </button>
          ))}
          {types.length === 0 && <p className="lbl" style={{ padding: "8px" }}>No sections yet — click &quot;+ New Section&quot; to create one.</p>}
        </section>

        {selectedTypeId && (
          <section className="card" aria-labelledby="sheets" style={{ flex: "3 1 560px", minWidth: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 18px" }}>
              <div>
                <h2 id="sheets" className="h2">{selectedType?.name ?? ""}</h2>
                <div className="meta" style={{ marginTop: 2 }}>Sheets in this section</div>
              </div>
              <button onClick={() => setCreatingSheet(true)} className="btn btn-s">+ New Sheet</button>
            </div>
            {isAdmin && (
              <BulkActionBar
                count={bulk.selectedCount}
                itemLabel="sheet"
                onDeleteClick={() => setBulkConfirming(true)}
                onClear={bulk.clear}
                deleting={bulkDeleting}
              />
            )}
            <table className="tbl">
              <thead>
                <tr>
                  {isAdmin && (
                    <th>
                      <input type="checkbox" aria-label="Select all sheets" checked={bulk.allVisibleSelected} onChange={bulk.toggleAll} />
                    </th>
                  )}
                  <th>Title</th>
                  <th>Period</th>
                  <th className="r">Rows</th>
                  <th><span className="sr">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => (
                  <tr key={s.id}>
                    {isAdmin && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.title}`}
                          checked={bulk.selected.has(s.id)}
                          onChange={() => bulk.toggle(s.id)}
                        />
                      </td>
                    )}
                    <td style={{ fontWeight: 600 }}>{s.title}</td>
                    <td className={s.period ? "" : "dash"}>{fmtPeriod(s.period)}</td>
                    <td className="r num">{s.row_count}</td>
                    <td className="r">
                      <Link href={`/offer-sheets/sheet/${s.id}`} style={{ fontSize: 13 }}>
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
                {sheets.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="meta" style={{ textAlign: "center", padding: "32px 12px" }}>
                      No sheets yet in this section. Click &quot;+ New Sheet&quot; to add one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {bulkConfirming && (
        <div className="scrim" onClick={() => !bulkDeleting && setBulkConfirming(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <h2 className="h2">Delete {bulk.selectedCount} sheet{bulk.selectedCount === 1 ? "" : "s"}?</h2>
            </div>
            <div className="mb">
              <p className="lbl">This permanently removes each selected offer sheet and all of its rows. This cannot be undone.</p>
            </div>
            <div className="mf">
              <button type="button" onClick={() => setBulkConfirming(false)} disabled={bulkDeleting} className="btn btn-g">
                Cancel
              </button>
              <button type="button" onClick={bulkDeleteSelected} disabled={bulkDeleting} className="btn btn-dp">
                {bulkDeleting ? "Deleting…" : `Delete ${bulk.selectedCount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkError && (
        <div className="scrim" onClick={() => setBulkError(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <h2 className="h2">Some deletes failed</h2>
            </div>
            <div className="mb">
              <p className="lbl" style={{ whiteSpace: "pre-wrap" }}>{bulkError}</p>
            </div>
            <div className="mf">
              <button type="button" onClick={() => setBulkError(null)} className="btn btn-p">
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {creatingSection && (
        <NewSectionPanel
          onClose={() => setCreatingSection(false)}
          onCreated={(t) => {
            setCreatingSection(false);
            router.push(`/offer-sheets?type=${t.id}`);
            router.refresh();
          }}
        />
      )}

      {creatingSheet && selectedTypeId && (
        <NewSheetPanel
          offerSheetTypeId={selectedTypeId}
          onClose={() => setCreatingSheet(false)}
          onCreated={(sheet) => router.push(`/offer-sheets/sheet/${sheet.id}`)}
        />
      )}
    </div>
  );
}

// ---------------- New Section: simple column builder (text/number/date only) ----------------
// Computed columns (formulas) aren't editable from this UI yet -- adding a
// section that needs them (like Mixed Rags/Bed Sheet/Wiper's cost math)
// means adding a migration the same way those three were seeded, since a
// formula builder UI is more than this first version needs. Plain
// text/number/date sections work end-to-end from here though.

type DraftColumn = { key: string; label: string; kind: "text" | "number" | "date" };

function blankColumn(): DraftColumn {
  return { key: "", label: "", kind: "text" };
}

function NewSectionPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: OfferSheetType) => void;
}) {
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<DraftColumn[]>([blankColumn()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateColumn(i: number, patch: Partial<DraftColumn>) {
    setColumns(columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addColumn() {
    setColumns([...columns, blankColumn()]);
  }
  function removeColumn(i: number) {
    setColumns(columns.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!name.trim()) {
      setError("Section name is required.");
      return;
    }
    const cleanColumns = columns
      .filter((c) => c.key.trim() && c.label.trim())
      .map((c) => ({ key: c.key.trim().toLowerCase().replace(/\s+/g, "_"), label: c.label.trim(), kind: c.kind }));
    if (cleanColumns.length === 0) {
      setError("Add at least one column.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/offer-sheet-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, columns: cleanColumns }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create section");
      onCreated(json.offer_sheet_type);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" aria-labelledby="ns" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 id="ns" className="h2">New Section</h2>
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="section-name">Section Name <span className="req">*</span></label>
        <input id="section-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Partly Offer Sheet" />
      </div>
      <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", fontWeight: 600, background: "var(--surf2)", borderBottom: "1px solid var(--line)" }}>Columns</div>
        <table className="tbl">
          <thead>
            <tr><th>Column Key</th><th>Label</th><th>Type</th><th><span className="sr">Remove</span></th></tr>
          </thead>
          <tbody>
            {columns.map((c, i) => (
              <tr key={i}>
                <td><input className="input input-s mono" aria-label={`Column key ${i + 1}`} value={c.key} onChange={(e) => updateColumn(i, { key: e.target.value })} placeholder="e.g. weight" /></td>
                <td><input className="input input-s" aria-label={`Label ${i + 1}`} value={c.label} onChange={(e) => updateColumn(i, { label: e.target.value })} placeholder="e.g. Weight (lbs)" /></td>
                <td>
                  <select className="select select-s" aria-label={`Type ${i + 1}`} value={c.kind} onChange={(e) => updateColumn(i, { kind: e.target.value as any })}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                  </select>
                </td>
                <td>
                  {columns.length > 1 && (
                    <button onClick={() => removeColumn(i)} aria-label={`Remove column ${i + 1}`} className="ib">
                      <CloseIcon />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: "10px 14px" }}>
          <button onClick={addColumn} className="btn btn-s">+ Add Column</button>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        {error && <span className="err" role="alert">{error}</span>}
        <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-p">
            {saving ? "Saving…" : "Create Section"}
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------- New Sheet: title + optional period ----------------

function NewSheetPanel({
  offerSheetTypeId,
  onClose,
  onCreated,
}: {
  offerSheetTypeId: string;
  onClose: () => void;
  onCreated: (s: { id: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/offer-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer_sheet_type_id: offerSheetTypeId,
          title,
          period: period ? `${period}-01` : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create sheet");
      onCreated(json.offer_sheet);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" aria-labelledby="nsh" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
      <h2 id="nsh" className="h2">New Sheet</h2>
      <div className="field">
        <label htmlFor="sheet-title">Title <span className="req">*</span></label>
        <input id="sheet-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. August 2026 Mixed Rags" />
      </div>
      <div className="field">
        <label htmlFor="sheet-period">Period <span className="meta">(optional)</span></label>
        <input id="sheet-period" type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} />
      </div>
      {error && <span className="err">{error}</span>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} className="btn">Cancel</button>
        <button onClick={save} disabled={saving} className="btn btn-p">
          {saving ? "Saving…" : "Create Sheet"}
        </button>
      </div>
    </section>
  );
}
